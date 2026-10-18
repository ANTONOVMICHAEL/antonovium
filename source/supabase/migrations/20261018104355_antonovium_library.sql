-- Isolated ANTONOVIUM library; existing project tables are not modified.
create table public.av_library_members (
 email text primary key check (email = lower(email)),
 user_id uuid unique references auth.users(id) on delete set null,
 enabled boolean not null default true,
 last_login_request timestamptz,
 login_window timestamptz,
 login_requests integer not null default 0
);
alter table public.av_library_members enable row level security;
revoke all on public.av_library_members from anon, authenticated;
grant select (user_id,enabled) on public.av_library_members to authenticated;
create policy av_member_read on public.av_library_members for select to authenticated
 using (user_id = (select auth.uid()));

create table public.av_books (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 title text not null check (length(title) between 1 and 500),
 author text not null default '' check (length(author)<=500),
 edition text not null default '' check (length(edition)<=1000),
 format text not null check (format in ('pdf','fb2')),
 original_name text not null check (length(original_name)<=1000),
 object_key text not null unique,
 size_bytes bigint not null check (size_bytes>0 and size_bytes<=5497558138880),
 fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
 status text not null default 'uploading' check (status in ('uploading','ready','deleting','failed')),
 upload_id text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(owner_id,fingerprint),
 check (object_key = owner_id::text || '/' || id::text || '/original.' || format)
);
create index av_books_owner on public.av_books(owner_id,created_at desc);
alter table public.av_books enable row level security;
revoke all on public.av_books from anon,authenticated;
grant select on public.av_books to authenticated;
create policy av_book_read on public.av_books for select to authenticated using (
 owner_id=(select auth.uid()) and exists(select 1 from public.av_library_members m where m.user_id=(select auth.uid()) and m.enabled)
);

create table public.av_entities (
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 kind text not null check (kind in ('source','note','research','settings','manuscript','progress','bookmark','conflict')),
 entity_id text not null check (length(entity_id) between 1 and 250),
 revision bigint not null default 1,
 data jsonb not null check (octet_length(data::text)<=8388608),
 updated_at timestamptz not null default now(),
 primary key(owner_id,kind,entity_id)
);
create table public.av_entity_history (
 owner_id uuid not null references auth.users(id) on delete cascade,
 kind text not null,entity_id text not null, revision bigint not null,
 data jsonb not null,created_at timestamptz not null default now(),
 primary key(owner_id,kind,entity_id,revision)
);
alter table public.av_entities enable row level security;
alter table public.av_entity_history enable row level security;
revoke all on public.av_entities,public.av_entity_history from anon,authenticated;
grant select,insert,update on public.av_entities to authenticated;
grant select,insert on public.av_entity_history to authenticated;
create policy av_entity_owner on public.av_entities for all to authenticated
 using (owner_id=(select auth.uid()) and exists(select 1 from public.av_library_members m where m.user_id=(select auth.uid()) and m.enabled))
 with check (owner_id=(select auth.uid()) and exists(select 1 from public.av_library_members m where m.user_id=(select auth.uid()) and m.enabled));
create policy av_history_owner on public.av_entity_history for all to authenticated
 using (owner_id=(select auth.uid()) and exists(select 1 from public.av_library_members m where m.user_id=(select auth.uid()) and m.enabled))
 with check (owner_id=(select auth.uid()) and exists(select 1 from public.av_library_members m where m.user_id=(select auth.uid()) and m.enabled));

create function public.av_save_entity(p_kind text,p_id text,p_expected bigint,p_data jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare current_row public.av_entities; saved_row public.av_entities;
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 -- Transactional advisory lock also serializes two concurrent first inserts.
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || p_kind || ':' || p_id,0));
 select * into current_row from public.av_entities where owner_id=auth.uid() and kind=p_kind and entity_id=p_id for update;
 if found and current_row.data=p_data then return jsonb_build_object('ok',true,'row',to_jsonb(current_row)); end if;
 if coalesce(current_row.revision,0)<>p_expected then
  return jsonb_build_object('ok',false,'conflict',true,'row',to_jsonb(current_row));
 end if;
 insert into public.av_entities(owner_id,kind,entity_id,revision,data)
 values(auth.uid(),p_kind,p_id,1,p_data)
 on conflict(owner_id,kind,entity_id) do update set data=excluded.data,revision=av_entities.revision+1,updated_at=now()
 returning * into saved_row;
 insert into public.av_entity_history(owner_id,kind,entity_id,revision,data)
 values(saved_row.owner_id,p_kind,p_id,saved_row.revision,p_data);
 return jsonb_build_object('ok',true,'row',to_jsonb(saved_row));
end $$;
revoke all on function public.av_save_entity(text,text,bigint,jsonb) from public,anon;
grant execute on function public.av_save_entity(text,text,bigint,jsonb) to authenticated;

create function public.av_login_lease(p_email text) returns boolean
language plpgsql security invoker set search_path='' as $$
declare changed integer;
begin
 update public.av_library_members set
 last_login_request=now(),
 login_requests=case when login_window is null or login_window<now()-interval '1 hour' then 1 else login_requests+1 end,
 login_window=case when login_window is null or login_window<now()-interval '1 hour' then now() else login_window end
 where email=p_email and enabled
 and (last_login_request is null or last_login_request<now()-interval '1 minute')
 and (login_window is null or login_window<now()-interval '1 hour' or login_requests<2);
 get diagnostics changed=row_count; return changed=1;
end $$;
revoke all on function public.av_login_lease(text) from public,anon,authenticated;
grant execute on function public.av_login_lease(text) to service_role;
