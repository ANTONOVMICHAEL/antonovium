-- ANTONOVIUM Scientific Memory 1.0. Derived text only; originals stay in Yandex.
-- 64 MiB of raw indexed text per account is an APPLICATION budget, not a claim
-- about the account's Supabase tariff. tsvectors, indexes and metadata add space.
-- All RPCs run as the caller. RLS and triggers also protect direct Data API writes.

alter table public.av_entities drop constraint av_entities_kind_check;
alter table public.av_entities add constraint av_entities_kind_check
 check (kind in ('source','note','research','settings','manuscript','progress','bookmark','conflict','bibliography'));

create function public.av_memory_normalize(p_text text) returns text
language sql immutable strict parallel safe set search_path='' as $$
 select btrim(regexp_replace(
   regexp_replace(replace(replace(lower(p_text),'ё','е'),chr(160),' '),
     E'([[:alpha:]])-[ \\t]*\\r?\\n[ \\t]*([[:alpha:]])',E'\\1\\2','g'),
   '[[:space:]]+',' ','g'))
$$;

create table public.av_memory_documents (
 owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 book_id uuid not null references public.av_books(id) on delete cascade,
 fingerprint text not null check (fingerprint ~ '^[a-f0-9]{64}$'),
 format text not null check (format in ('pdf','fb2')),
 index_version integer not null default 1 check (index_version=1),
 status text not null default 'processing' check (status in ('processing','ready','no_text','partial','size_limit','error')),
 next_unit integer not null default 0 check (next_unit>=0),
 total_units integer not null check (total_units between 0 and 1000000),
 chunk_count integer not null default 0 check (chunk_count>=0),
 raw_bytes bigint not null default 0 check (raw_bytes>=0),
 text_units integer not null default 0 check (text_units>=0),
 error text not null default '' check (length(error)<=1000),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 primary key(owner_id,book_id),
 check (next_unit<=total_units),
 check (text_units<=total_units)
);

create table public.av_memory_chunks (
 owner_id uuid not null default auth.uid(),
 book_id uuid not null,
 chunk_id text not null check (length(chunk_id) between 1 and 200),
 unit integer not null check (unit>=0),
 body text not null check (length(body) between 1 and 8000 and length(btrim(body))>0),
 search_text text not null check (length(search_text)<=10000),
 anchor jsonb not null check (jsonb_typeof(anchor)='object' and octet_length(anchor::text)<=8192),
 locator text not null default '' check (length(locator)<=500),
 raw_bytes integer generated always as (octet_length(body)) stored,
 fts tsvector generated always as (to_tsvector('russian'::regconfig,search_text)) stored,
 created_at timestamptz not null default now(),
 primary key(owner_id,book_id,chunk_id),
 foreign key(owner_id,book_id) references public.av_memory_documents(owner_id,book_id) on delete cascade
);
create index av_memory_chunks_owner_bytes on public.av_memory_chunks(owner_id) include(raw_bytes);
create index av_memory_chunks_book_unit on public.av_memory_chunks(owner_id,book_id,unit);
create index av_memory_chunks_fts on public.av_memory_chunks using gin(fts);

alter table public.av_memory_documents enable row level security;
alter table public.av_memory_chunks enable row level security;
revoke all on public.av_memory_documents,public.av_memory_chunks from public,anon,authenticated;
grant select,insert,update,delete on public.av_memory_documents to authenticated;
grant select,insert,update on public.av_memory_chunks to authenticated;
create policy av_memory_document_owner on public.av_memory_documents for all to authenticated
 using (owner_id=(select auth.uid())
   and exists(select 1 from public.av_library_members m where m.user_id=(select auth.uid()) and m.enabled)
   and exists(select 1 from public.av_books b where b.id=book_id and b.owner_id=(select auth.uid()) and b.status='ready'))
 with check (owner_id=(select auth.uid())
   and exists(select 1 from public.av_library_members m where m.user_id=(select auth.uid()) and m.enabled)
   and exists(select 1 from public.av_books b where b.id=book_id and b.owner_id=(select auth.uid()) and b.status='ready'));
create policy av_memory_chunk_owner on public.av_memory_chunks for all to authenticated
 using (owner_id=(select auth.uid())
   and exists(select 1 from public.av_library_members m where m.user_id=(select auth.uid()) and m.enabled)
   and exists(select 1 from public.av_books b where b.id=book_id and b.owner_id=(select auth.uid()) and b.status='ready'))
 with check (owner_id=(select auth.uid())
   and exists(select 1 from public.av_library_members m where m.user_id=(select auth.uid()) and m.enabled)
   and exists(select 1 from public.av_books b where b.id=book_id and b.owner_id=(select auth.uid()) and b.status='ready'));

-- Validity is structural. Client-extracted text/anchors remain unverified evidence
-- until checked against the original; the database does not pretend to parse PDF.
create function public.av_memory_anchor_valid(p_anchor jsonb,p_format text,p_total integer)
returns boolean language plpgsql immutable set search_path='' as $$
declare v text; r jsonb; n jsonb;
begin
 if p_anchor is null or jsonb_typeof(p_anchor)<>'object' or p_anchor->>'format' is distinct from p_format then return false; end if;
 if p_format='pdf' then
  if jsonb_typeof(p_anchor->'page') is distinct from 'number'
   or (p_anchor->>'page')!~'^[0-9]+$'
   or (p_anchor->>'page')::numeric not between 1 and p_total then return false; end if;
  if p_anchor ? 'fraction' and (jsonb_typeof(p_anchor->'fraction') is distinct from 'number'
    or (p_anchor->>'fraction')::numeric not between 0 and 1) then return false; end if;
  if p_anchor ? 'rects' then
   if jsonb_typeof(p_anchor->'rects') is distinct from 'array' or jsonb_array_length(p_anchor->'rects')>200 then return false; end if;
   for r in select value from jsonb_array_elements(p_anchor->'rects') loop
    if jsonb_typeof(r)<>'array' or jsonb_array_length(r)<>4 then return false; end if;
    for n in select value from jsonb_array_elements(r) loop
     if jsonb_typeof(n)<>'number' or n::text::numeric not between 0 and 1 then return false; end if;
    end loop;
    if (r->>0)::numeric+(r->>2)::numeric>1.001 or (r->>1)::numeric+(r->>3)::numeric>1.001 then return false; end if;
   end loop;
  end if;
 elsif p_format='fb2' then
  if p_anchor ? 'page' or not(p_anchor ? 'offset') then return false; end if; -- screen pages are not edition pagination
  if coalesce(p_anchor->>'chapter','')!~'^fb2-[0-9]+(\.[0-9]+)*$'
    or coalesce(p_anchor->>'paragraph','')!~'^fb2-[0-9]+(\.[0-9]+)*$' then return false; end if;
  if p_anchor ? 'endParagraph' and coalesce(p_anchor->>'endParagraph','')!~'^fb2-[0-9]+(\.[0-9]+)*$' then return false; end if;
 else return false;
 end if;
 foreach v in array array['offset','endOffset'] loop
  if p_anchor ? v and (jsonb_typeof(p_anchor->v) is distinct from 'number'
    or (p_anchor->>v)!~'^[0-9]+$' or (p_anchor->>v)::numeric>100000000) then return false; end if;
 end loop;
 if p_anchor ? 'offset' and p_anchor ? 'endOffset'
  and coalesce(p_anchor->>'endParagraph',p_anchor->>'paragraph')=p_anchor->>'paragraph'
  and (p_anchor->>'endOffset')::numeric<(p_anchor->>'offset')::numeric then return false; end if;
 return true;
exception when others then return false;
end $$;

create function public.av_memory_guard_document() returns trigger
language plpgsql security invoker set search_path='' as $$
declare b public.av_books;
begin
 if auth.uid() is null or new.owner_id is distinct from auth.uid() then raise exception 'Недостаточно прав' using errcode='42501'; end if;
 select * into b from public.av_books where id=new.book_id and owner_id=auth.uid() and status='ready';
 if not found or b.fingerprint<>new.fingerprint or b.format<>new.format then raise exception 'Исходный файл изменился или недоступен' using errcode='42501'; end if;
 if tg_op='UPDATE' and (new.owner_id<>old.owner_id or new.book_id<>old.book_id) then raise exception 'Источник записи нельзя заменить'; end if;
 new.updated_at=now();
 return new;
end $$;
create trigger av_memory_document_guard before insert or update on public.av_memory_documents
 for each row execute function public.av_memory_guard_document();

create function public.av_memory_guard_chunk() returns trigger
language plpgsql security invoker set search_path='' as $$
declare d public.av_memory_documents; used bigint; prior_bytes integer:=0;
begin
 if auth.uid() is null or new.owner_id is distinct from auth.uid() then raise exception 'Недостаточно прав' using errcode='42501'; end if;
 if tg_op='UPDATE' and (new.owner_id<>old.owner_id or new.book_id<>old.book_id or new.chunk_id<>old.chunk_id) then raise exception 'Идентификатор фрагмента нельзя заменить'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':memory-index',0));
 select * into d from public.av_memory_documents where owner_id=auth.uid() and book_id=new.book_id;
 if not found or not exists(select 1 from public.av_books b where b.id=new.book_id and b.owner_id=auth.uid() and b.status='ready' and b.fingerprint=d.fingerprint and b.format=d.format)
   then raise exception 'Исходный файл изменился или недоступен' using errcode='42501'; end if;
 if new.unit<0 or new.unit>=d.total_units or not public.av_memory_anchor_valid(new.anchor,d.format,d.total_units)
  or d.format='pdf' and (new.anchor->>'page')::numeric<>new.unit+1 then raise exception 'Некорректный ориентир фрагмента'; end if;
 if tg_op='UPDATE' then prior_bytes=old.raw_bytes;
 else
  -- INSERT .. ON CONFLICT invokes this trigger before resolving the conflict.
  -- Subtract its existing row so an idempotent retry at quota is still allowed.
  select c.raw_bytes into prior_bytes from public.av_memory_chunks c
   where c.owner_id=new.owner_id and c.book_id=new.book_id and c.chunk_id=new.chunk_id;
  prior_bytes=coalesce(prior_bytes,0);
 end if;
 select coalesce(sum(c.raw_bytes),0) into used from public.av_memory_chunks c where c.owner_id=auth.uid();
 if used-prior_bytes+octet_length(new.body)>67108864 then raise exception 'Достигнут лимит индекса: 64 МиБ текста на учетную запись' using errcode='54000'; end if;
 new.search_text=public.av_memory_normalize(new.body);
 return new;
end $$;
create trigger av_memory_chunk_guard before insert or update on public.av_memory_chunks
 for each row execute function public.av_memory_guard_chunk();

create function public.av_memory_begin(p_book_id uuid,p_fingerprint text,p_total_units integer,p_format text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare b public.av_books; d public.av_memory_documents;
begin
 if auth.uid() is null then raise exception 'Требуется вход' using errcode='42501'; end if;
 if p_total_units is null or p_total_units not between 0 and 1000000 or p_format not in ('pdf','fb2') or p_fingerprint is null or p_fingerprint!~'^[a-f0-9]{64}$'
  then raise exception 'Некорректные параметры индекса'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':memory-index',0));
 select * into b from public.av_books where id=p_book_id and owner_id=auth.uid() and status='ready';
 if not found or b.fingerprint<>p_fingerprint or b.format<>p_format then raise exception 'Исходный файл изменился или недоступен' using errcode='42501'; end if;
 select * into d from public.av_memory_documents where owner_id=auth.uid() and book_id=p_book_id for update;
 if found and d.fingerprint=p_fingerprint and d.index_version=1 and d.format=p_format and d.total_units=p_total_units then return to_jsonb(d); end if;
 -- Only this caller's replaceable derived index is reset; notes and originals survive.
 delete from public.av_memory_documents where owner_id=auth.uid() and book_id=p_book_id;
 insert into public.av_memory_documents(owner_id,book_id,fingerprint,format,total_units)
 values(auth.uid(),p_book_id,p_fingerprint,p_format,p_total_units) returning * into d;
 return to_jsonb(d);
end $$;

create function public.av_memory_put(p_book_id uuid,p_fingerprint text,p_chunks jsonb,p_next_unit integer,p_total_units integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.av_memory_documents; item jsonb; c_id text; used bigint; delta bigint:=0; old_bytes integer; body_text text;
begin
 if auth.uid() is null then raise exception 'Требуется вход' using errcode='42501'; end if;
 if p_chunks is null or jsonb_typeof(p_chunks)<>'array' or jsonb_array_length(p_chunks)>32 or octet_length(p_chunks::text)>1048576 then raise exception 'Некорректный пакет индекса'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':memory-index',0));
 select * into d from public.av_memory_documents where owner_id=auth.uid() and book_id=p_book_id for update;
 if not found or d.fingerprint is distinct from p_fingerprint or d.total_units is distinct from p_total_units
  or not exists(select 1 from public.av_books b where b.id=p_book_id and b.owner_id=auth.uid() and b.status='ready' and b.fingerprint=p_fingerprint)
  then raise exception 'Исходный файл изменился или недоступен' using errcode='42501'; end if;
 if p_next_unit is null or p_next_unit<d.next_unit or p_next_unit>p_total_units then raise exception 'Некорректное положение индекса'; end if;
 if (select count(*) from jsonb_array_elements(p_chunks))<>(select count(distinct value->>'chunk_id') from jsonb_array_elements(p_chunks)) then raise exception 'Повторяющиеся фрагменты в пакете'; end if;
 for item in select value from jsonb_array_elements(p_chunks) loop
  c_id=item->>'chunk_id'; body_text=item->>'body';
  if jsonb_typeof(item)<>'object' or jsonb_typeof(item->'body') is distinct from 'string' or body_text is null or length(body_text) not between 1 and 8000 or length(btrim(body_text))=0
    or c_id is null or length(c_id) not between 1 and 200 or coalesce(length(item->>'locator'),0)>500
    or jsonb_typeof(item->'unit') is distinct from 'number' or (item->>'unit')!~'^[0-9]+$'
    or (item->>'unit')::numeric>=p_total_units or not public.av_memory_anchor_valid(item->'anchor',d.format,d.total_units)
    or d.format='pdf' and (item->'anchor'->>'page')::numeric<>(item->>'unit')::numeric+1 then raise exception 'Некорректный текст или ориентир фрагмента'; end if;
  select raw_bytes into old_bytes from public.av_memory_chunks where owner_id=auth.uid() and book_id=p_book_id and chunk_id=c_id;
  delta=delta+octet_length(body_text)-coalesce(old_bytes,0);
 end loop;
 select coalesce(sum(c.raw_bytes),0) into used from public.av_memory_chunks c where c.owner_id=auth.uid();
 if used+delta>67108864 then
  update public.av_memory_documents set status='size_limit',error='Достигнут лимит индекса: 64 МиБ текста на учетную запись' where owner_id=auth.uid() and book_id=p_book_id returning * into d;
  return to_jsonb(d); -- no partial unit is committed and next_unit does not advance
 end if;
 for item in select value from jsonb_array_elements(p_chunks) loop
  insert into public.av_memory_chunks(owner_id,book_id,chunk_id,unit,body,search_text,anchor,locator)
  values(auth.uid(),p_book_id,item->>'chunk_id',(item->>'unit')::integer,item->>'body',public.av_memory_normalize(item->>'body'),item->'anchor',coalesce(item->>'locator',''))
  on conflict(owner_id,book_id,chunk_id) do update set unit=excluded.unit,body=excluded.body,search_text=excluded.search_text,anchor=excluded.anchor,locator=excluded.locator;
 end loop;
 update public.av_memory_documents set next_unit=p_next_unit,status='processing',error='',
  chunk_count=(select count(*) from public.av_memory_chunks c where c.owner_id=auth.uid() and c.book_id=p_book_id),
  raw_bytes=(select coalesce(sum(c.raw_bytes),0) from public.av_memory_chunks c where c.owner_id=auth.uid() and c.book_id=p_book_id),
  text_units=(select count(distinct c.unit) from public.av_memory_chunks c where c.owner_id=auth.uid() and c.book_id=p_book_id)
 where owner_id=auth.uid() and book_id=p_book_id returning * into d;
 return to_jsonb(d);
end $$;

create function public.av_memory_finish(p_book_id uuid,p_fingerprint text,p_status text,p_error text default '')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare d public.av_memory_documents; final_status text;
begin
 if auth.uid() is null then raise exception 'Требуется вход' using errcode='42501'; end if;
 if p_status is null or p_status not in ('ready','no_text','partial','size_limit','error') or length(coalesce(p_error,''))>1000 then raise exception 'Некорректное состояние индекса'; end if;
 perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':memory-index',0));
 select * into d from public.av_memory_documents where owner_id=auth.uid() and book_id=p_book_id for update;
 if not found or d.fingerprint is distinct from p_fingerprint then raise exception 'Индекс не найден или изменился' using errcode='42501'; end if;
 select count(*),coalesce(sum(c.raw_bytes),0),count(distinct c.unit) into d.chunk_count,d.raw_bytes,d.text_units
  from public.av_memory_chunks c where c.owner_id=auth.uid() and c.book_id=p_book_id;
 final_status=p_status;
 if p_status in ('ready','no_text') then
  final_status=case when d.next_unit<d.total_units then 'partial' when d.chunk_count=0 then 'no_text'
    when d.format='pdf' and d.text_units<d.total_units then 'partial' else 'ready' end;
 end if;
 update public.av_memory_documents set status=final_status,chunk_count=d.chunk_count,raw_bytes=d.raw_bytes,text_units=d.text_units,
  error=case when final_status='partial' and d.format='pdf' and d.next_unit=d.total_units and d.text_units<d.total_units
    then 'Часть страниц не содержит текстового слоя; поиск доступен по извлеченному тексту'
    else coalesce(p_error,'') end
 where owner_id=auth.uid() and book_id=p_book_id returning * into d;
 return to_jsonb(d);
end $$;

create function public.av_memory_search(p_query text,p_book_id uuid default null,p_author text default '',p_limit integer default 40)
returns table(book_id uuid,chunk_id text,title text,author text,format text,fingerprint text,body text,search_text text,anchor jsonb,locator text,unit integer,document_status text,next_unit integer,total_units integer,text_units integer,rank real,match_term text)
language plpgsql stable security invoker set search_path='' as $$
declare query_text text; author_text text; exact_phrase boolean; terms tsquery;
begin
 if auth.uid() is null then raise exception 'Требуется вход' using errcode='42501'; end if;
 if p_query is null or length(p_query)>500 or length(coalesce(p_author,''))>500 or p_limit is null or p_limit not between 1 and 100 then raise exception 'Некорректный поисковый запрос'; end if;
 query_text=btrim(p_query); exact_phrase=length(query_text)>=2 and left(query_text,1)='"' and right(query_text,1)='"';
 if exact_phrase then query_text=substr(query_text,2,length(query_text)-2); end if;
 query_text=public.av_memory_normalize(query_text);author_text=public.av_memory_normalize(coalesce(p_author,''));
 if query_text='' and author_text='' then return; end if;
 terms=plainto_tsquery('russian'::regconfig,query_text);
 return query
 with materials as (
  select b.id,b.format,b.fingerprint,b.author as original_byline,
    coalesce(nullif(bib.data->>'title',''),b.title) as label,
    coalesce(nullif(case when jsonb_typeof(bib.data->'authors')='array' then
      (select string_agg(a.value,', ') from jsonb_array_elements_text(bib.data->'authors') a(value)) end,''),b.author) as byline
  from public.av_books b left join public.av_entities bib
    on bib.owner_id=auth.uid() and bib.kind='bibliography' and bib.entity_id=b.id::text and coalesce(bib.data->>'deleted','false')<>'true'
  where b.owner_id=auth.uid() and b.status='ready' and (p_book_id is null or b.id=p_book_id)
 )
 select c.book_id,c.chunk_id,m.label,m.byline,m.format,m.fingerprint,c.body,c.search_text,c.anchor,c.locator,c.unit,
   d.status,d.next_unit,d.total_units,d.text_units,
   case when exact_phrase then 1::real else ts_rank(c.fts,terms) end,
   case when query_text='' then '' when exact_phrase then query_text else coalesce(substring(
     ts_headline('russian'::regconfig,c.body,terms,'StartSel=⟦av-hit⟧, StopSel=⟦/av-hit⟧, HighlightAll=true')
     from '⟦av-hit⟧(.*?)⟦/av-hit⟧'),'') end
 from public.av_memory_chunks c
 join public.av_memory_documents d on d.owner_id=c.owner_id and d.book_id=c.book_id
 join materials m on m.id=c.book_id and m.fingerprint=d.fingerprint and m.format=d.format
 where c.owner_id=auth.uid() and d.index_version=1
   and (author_text='' or position(author_text in public.av_memory_normalize(m.byline))>0
     or position(author_text in public.av_memory_normalize(m.original_byline))>0)
   and (query_text='' or (exact_phrase and position(query_text in c.search_text)>0)
     or (not exact_phrase and (c.fts@@terms or (numnode(terms)=0 and position(query_text in c.search_text)>0))))
 order by 16 desc,c.book_id,c.unit,c.chunk_id limit p_limit;
end $$;

revoke all on function public.av_memory_normalize(text),public.av_memory_anchor_valid(jsonb,text,integer),public.av_memory_guard_document(),public.av_memory_guard_chunk(),
 public.av_memory_begin(uuid,text,integer,text),public.av_memory_put(uuid,text,jsonb,integer,integer),public.av_memory_finish(uuid,text,text,text),public.av_memory_search(text,uuid,text,integer)
 from public,anon;
grant execute on function public.av_memory_normalize(text),public.av_memory_anchor_valid(jsonb,text,integer),
 public.av_memory_begin(uuid,text,integer,text),public.av_memory_put(uuid,text,jsonb,integer,integer),public.av_memory_finish(uuid,text,text,text),public.av_memory_search(text,uuid,text,integer)
 to authenticated;

comment on table public.av_memory_documents is 'Private derived text index. 64 MiB raw text per owner is an application budget, not a Supabase tariff. next_unit counts completely committed units; PDF unit=page-1. no_text means no extracted text, not OCR.';
comment on table public.av_memory_chunks is 'Raw client-extracted text is preserved separately from normalized search text. Anchor structure is checked, but source correctness requires checking the original file. RLS applies to direct API and RPC alike.';
