-- Follow-up migration: preserve exact quoted phrases within mixed AND queries.
-- This replaces only the invoker search RPC; tables, RLS and originals are unchanged.
-- Quoted parts are literal normalized substrings, not stemmed phrase queries.
-- All quoted parts and all unquoted Russian FTS terms must match the same chunk.
create or replace function public.av_memory_search(p_query text,p_book_id uuid default null,p_author text default '',p_limit integer default 40)
returns table(book_id uuid,chunk_id text,title text,author text,format text,fingerprint text,body text,search_text text,anchor jsonb,locator text,unit integer,document_status text,next_unit integer,total_units integer,text_units integer,rank real,match_term text)
language plpgsql stable security invoker set search_path='' as $$
declare query_text text; author_text text; phrase text; quoted text[];
  phrases text[]:=array[]::text[]; terms tsquery;
begin
 if auth.uid() is null then raise exception 'Требуется вход' using errcode='42501'; end if;
 if p_query is null or length(p_query)>500 or length(coalesce(p_author,''))>500 or p_limit is null or p_limit not between 1 and 100 then raise exception 'Некорректный поисковый запрос'; end if;
 query_text=btrim(p_query);
 if mod(length(query_text)-length(replace(query_text,'"','')),2)<>0 then
  raise exception 'Закройте кавычки точной фразы';
 end if;
 for quoted in select regexp_matches(query_text,'"([^"]*)"','g') loop
  phrase=public.av_memory_normalize(quoted[1]);
  if phrase<>'' then phrases=array_append(phrases,phrase); end if;
 end loop;
 query_text=public.av_memory_normalize(regexp_replace(query_text,'"[^"]*"',' ','g'));
 author_text=public.av_memory_normalize(coalesce(p_author,''));
 if query_text='' and cardinality(phrases)=0 and author_text='' then return; end if;
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
   case when query_text='' then 1::real else ts_rank(c.fts,terms) end,
   case when cardinality(phrases)>0 then phrases[1] when query_text='' then '' else coalesce(substring(
     ts_headline('russian'::regconfig,c.body,terms,'StartSel=⟦av-hit⟧, StopSel=⟦/av-hit⟧, HighlightAll=true')
     from '⟦av-hit⟧(.*?)⟦/av-hit⟧'),'') end
 from public.av_memory_chunks c
 join public.av_memory_documents d on d.owner_id=c.owner_id and d.book_id=c.book_id
 join materials m on m.id=c.book_id and m.fingerprint=d.fingerprint and m.format=d.format
 where c.owner_id=auth.uid() and d.index_version=1
   and (author_text='' or position(author_text in public.av_memory_normalize(m.byline))>0
     or position(author_text in public.av_memory_normalize(m.original_byline))>0)
   and not exists(select 1 from unnest(phrases) p(value) where position(p.value in c.search_text)=0)
   and (query_text='' or c.fts@@terms or (numnode(terms)=0 and position(query_text in c.search_text)>0))
 order by 16 desc,c.book_id,c.unit,c.chunk_id limit p_limit;
end $$;

revoke all on function public.av_memory_search(text,uuid,text,integer) from public,anon;
grant execute on function public.av_memory_search(text,uuid,text,integer) to authenticated;
