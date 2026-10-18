alter table public.av_books add column cover text check (cover is null or (length(cover)<=100000 and cover ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$'));
grant all on public.av_library_members,public.av_books,public.av_entities,public.av_entity_history to service_role;
create or replace function public.av_save_entity(p_kind text,p_id text,p_expected bigint,p_data jsonb)
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
 if p_kind in ('note','source','research') then
  insert into public.av_entity_history(owner_id,kind,entity_id,revision,data)
  values(saved_row.owner_id,p_kind,p_id,saved_row.revision,p_data);
 end if;
 return jsonb_build_object('ok',true,'row',to_jsonb(saved_row));
end $$;
