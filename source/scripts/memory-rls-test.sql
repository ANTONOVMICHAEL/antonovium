-- Scientific Memory regression checks, to run as the database administration role.
-- All accounts, membership and books below are random synthetic transaction fixtures.
-- No existing user's rows are read, and no original files or Auth API are touched.
-- Role/JWT simulation exercises database RLS; it is not a two-browser Auth test.
-- Intentionally does not allocate 64 MiB merely to exercise the application cap.
begin;

create temporary table qa_memory_context on commit drop as
select gen_random_uuid() as a, gen_random_uuid() as b,
       gen_random_uuid() as a_pdf, gen_random_uuid() as a_fb2,
       gen_random_uuid() as a_scan, gen_random_uuid() as a_mixed,
       gen_random_uuid() as b_pdf;
create temporary table qa_memory_assertions (
  name text primary key,
  passed boolean not null,
  detail text not null default ''
) on commit drop;

create function pg_temp.qa_memory_assert(p_name text, p_ok boolean, p_detail text default '')
returns void language plpgsql security invoker set search_path='' as $$
begin
  if p_ok is distinct from true then
    raise exception 'Memory assertion failed: % (%)', p_name, p_detail;
  end if;
  insert into pg_temp.qa_memory_assertions(name,passed,detail) values(p_name,true,p_detail);
end $$;

create function pg_temp.qa_memory_error(p_name text, p_sql text, p_codes text[] default array['42501'])
returns void language plpgsql security invoker set search_path='' as $$
declare caught boolean:=false; actual text;
begin
  begin
    execute p_sql;
  exception when others then
    actual=sqlstate;
    if not(actual=any(p_codes)) then
      raise exception 'Memory assertion % got unexpected SQLSTATE %: %',p_name,sqlstate,sqlerrm;
    end if;
    caught=true;
  end;
  perform pg_temp.qa_memory_assert(p_name,caught,'Expected rejection: '||coalesce(actual,'none'));
end $$;

do $$ begin
  execute format('grant usage on schema %I to authenticated,anon',pg_my_temp_schema()::regnamespace::text);
end $$;
grant select on qa_memory_context to authenticated,anon;
grant select,insert on qa_memory_assertions to authenticated,anon;
grant execute on function pg_temp.qa_memory_assert(text,boolean,text),pg_temp.qa_memory_error(text,text,text[])
  to authenticated,anon;

insert into auth.users(id,email,aud,role,email_confirmed_at,created_at,updated_at)
select u.id,u.id::text||'@memory-test.invalid','authenticated','authenticated',now(),now(),now()
from qa_memory_context c cross join lateral (values(c.a),(c.b)) u(id);
insert into public.av_library_members(email,user_id,enabled)
select u.id::text||'@memory-test.invalid',u.id,true
from qa_memory_context c cross join lateral (values(c.a),(c.b)) u(id);
insert into public.av_books(id,owner_id,title,author,format,original_name,object_key,size_bytes,fingerprint,status)
select v.id,v.owner_id,'Проверка научной памяти',v.author,v.format,'synthetic.'||v.format,
       v.owner_id::text||'/'||v.id::text||'/original.'||v.format,100,v.fingerprint,'ready'
from qa_memory_context c cross join lateral (values
  (c.a_pdf,c.a,'Исходный Автор','pdf',repeat('a',64)),
  (c.a_fb2,c.a,'Автор FB2','fb2',repeat('b',64)),
  (c.a_scan,c.a,'Автор скана','pdf',repeat('c',64)),
  (c.a_mixed,c.a,'Автор смешанного PDF','pdf',repeat('d',64)),
  (c.b_pdf,c.b,'Автор Б','pdf',repeat('a',64))
) v(id,owner_id,author,format,fingerprint);

set local role authenticated;
do $$ declare c record; d jsonb; r record; raw text:='Достоверная цитата: разумного поведения. Ёлка растёт в лесу.';
begin
  select * into c from pg_temp.qa_memory_context;
  perform set_config('request.jwt.claim.sub',c.a::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',c.a,'role','authenticated','is_anonymous',false)::text,true);
  perform pg_temp.qa_memory_assert('authenticated identity A',auth.uid()=c.a);

  d=public.av_memory_begin(c.a_pdf,repeat('a',64),1,'pdf');
  perform pg_temp.qa_memory_assert('begin creates empty processing document',
    d->>'status'='processing' and (d->>'next_unit')::int=0 and (d->>'chunk_count')::int=0);
  d=public.av_memory_put(c.a_pdf,repeat('a',64),jsonb_build_array(jsonb_build_object(
    'chunk_id','pdf:1:0','body',raw,'search_text','НЕСУЩЕСТВУЮЩИЙ_ТОКЕН','unit',0,
    'anchor',jsonb_build_object('format','pdf','page',1),'locator','Страница PDF 1')),1,1);
  perform pg_temp.qa_memory_assert('put tracks exact byte and unit counts',
    (d->>'chunk_count')::int=1 and (d->>'raw_bytes')::bigint=octet_length(raw)
    and (d->>'text_units')::int=1 and (d->>'next_unit')::int=1);
  perform pg_temp.qa_memory_assert('raw text preserved; normalized text derived server side',
    exists(select 1 from public.av_memory_chunks x where x.book_id=c.a_pdf
      and x.body=raw and x.search_text=public.av_memory_normalize(raw)
      and position('НЕСУЩЕСТВУЮЩИЙ_ТОКЕН' in x.search_text)=0));
  d=public.av_memory_put(c.a_pdf,repeat('a',64),jsonb_build_array(jsonb_build_object(
    'chunk_id','pdf:1:0','body',raw,'unit',0,
    'anchor',jsonb_build_object('format','pdf','page',1),'locator','Страница PDF 1')),1,1);
  perform pg_temp.qa_memory_assert('idempotent put does not duplicate chunks or bytes',
    (d->>'chunk_count')::int=1 and (d->>'raw_bytes')::bigint=octet_length(raw));
  d=public.av_memory_finish(c.a_pdf,repeat('a',64),'ready');
  perform pg_temp.qa_memory_assert('complete PDF finishes ready',d->>'status'='ready');
  d=public.av_memory_begin(c.a_pdf,repeat('a',64),1,'pdf');
  perform pg_temp.qa_memory_assert('same fingerprint restarts by resuming, without deleting',
    d->>'status'='ready' and (d->>'next_unit')::int=1 and (d->>'chunk_count')::int=1);

  d=public.av_save_entity('bibliography',c.a_pdf::text,0,jsonb_build_object(
    'sourceId',c.a_pdf,'title','Уточнённое научное название','authors',jsonb_build_array('Уточнённый Автор')));
  perform pg_temp.qa_memory_assert('bibliography saves through existing owner API',(d->>'ok')::boolean);
  perform pg_temp.qa_memory_assert('exact phrase matches е/ё and preserves raw source',
    exists(select 1 from public.av_memory_search('"елка растет"',c.a_pdf,'',40) x
      where x.body=raw and x.match_term='елка растет' and x.title='Уточнённое научное название'));
  select * into r from public.av_memory_search('разумный',c.a_pdf,'',40) limit 1;
  perform pg_temp.qa_memory_assert('Russian morphology returns actual matched source lexeme',
    r.book_id=c.a_pdf and lower(r.match_term)='разумного' and r.body=raw);
  perform pg_temp.qa_memory_assert('word combinations use AND',
    (select count(*)=1 from public.av_memory_search('разумный елка',c.a_pdf,'',40))
    and (select count(*)=0 from public.av_memory_search('разумный отсутствует',c.a_pdf,'',40)));
  perform pg_temp.qa_memory_assert('quoted phrase and unquoted morphology combine with AND',
    (select count(*)=1 from public.av_memory_search('"разумного поведения" елка',c.a_pdf,'',40))
    and (select count(*)=0 from public.av_memory_search('"разумного поведения" отсутствует',c.a_pdf,'',40)));
  perform pg_temp.qa_memory_assert('mixed phrase preserves adjacency and literal inflection',
    (select count(*)=0 from public.av_memory_search('"поведения разумного" елка',c.a_pdf,'',40))
    and (select count(*)=0 from public.av_memory_search('"разумный поведения" елка',c.a_pdf,'',40)));
  perform pg_temp.qa_memory_assert('multiple exact phrases all match with е/ё normalization',
    exists(select 1 from public.av_memory_search('"разумного поведения" "елка растет"',c.a_pdf,'',40) x
      where x.match_term='разумного поведения' and x.body=raw)
    and (select count(*)=0 from public.av_memory_search('"разумного поведения" "растет елка"',c.a_pdf,'',40)));
  perform pg_temp.qa_memory_error('unbalanced phrase quotes rejected',
    'select public.av_memory_search(''"разумного поведения елка'',null,'''',40)',array['P0001']);
  perform pg_temp.qa_memory_assert('manual bibliography author filter and display',
    exists(select 1 from public.av_memory_search('разумный',c.a_pdf,'уточненный',40) x where x.author='Уточнённый Автор'));
  perform pg_temp.qa_memory_assert('original author remains searchable',
    (select count(*)=1 from public.av_memory_search('разумный',c.a_pdf,'исходный',40)));
  perform pg_temp.qa_memory_assert('unrelated author cannot match',
    (select count(*)=0 from public.av_memory_search('разумный',c.a_pdf,'Другой Автор',40)));
  perform pg_temp.qa_memory_assert('empty query yields no accidental whole-library dump',
    (select count(*)=0 from public.av_memory_search('',null,'',40)));

  perform pg_temp.qa_memory_error('negative total units rejected',format(
    'select public.av_memory_begin(%L::uuid,%L,-1,''pdf'')',c.a_pdf,repeat('a',64)),array['P0001']);
  perform pg_temp.qa_memory_error('stale fingerprint rejected',format(
    'select public.av_memory_begin(%L::uuid,%L,1,''pdf'')',c.a_pdf,repeat('f',64)));
  perform pg_temp.qa_memory_error('oversized query rejected',
    'select public.av_memory_search(repeat(''x'',501),null,'''',40)',array['P0001']);
  perform pg_temp.qa_memory_error('invalid search limit rejected',
    'select public.av_memory_search(''разумный'',null,'''',101)',array['P0001']);
  perform pg_temp.qa_memory_error('out-of-range PDF page rejected',format(
    'select public.av_memory_put(%L::uuid,%L,%L::jsonb,1,1)',c.a_pdf,repeat('a',64),
    '[{"chunk_id":"bad-page","body":"текст","unit":0,"anchor":{"format":"pdf","page":2}}]'),array['P0001']);
  perform pg_temp.qa_memory_error('invalid direct chunk DML rejected by anchor guard',format(
    'insert into public.av_memory_chunks(owner_id,book_id,chunk_id,unit,body,search_text,anchor) values(%L,%L,''bad-direct'',0,''текст'',''подмена'',%L::jsonb)',
    c.a,c.a_pdf,'{"format":"pdf","page":0}'),array['P0001']);
  perform pg_temp.qa_memory_error('oversized text chunk rejected',format(
    'select public.av_memory_put(%L::uuid,%L,jsonb_build_array(jsonb_build_object(''chunk_id'',''too-long'',''body'',repeat(''x'',8001),''unit'',0,''anchor'',jsonb_build_object(''format'',''pdf'',''page'',1))),1,1)',
    c.a_pdf,repeat('a',64)),array['P0001']);
  perform pg_temp.qa_memory_assert('failed writes leave successful index intact',
    (select count(*)=1 from public.av_memory_chunks x where x.book_id=c.a_pdf));

  d=public.av_memory_begin(c.a_fb2,repeat('b',64),2,'fb2');
  d=public.av_memory_put(c.a_fb2,repeat('b',64),'[{"chunk_id":"fb2:0:0","body":"Первый абзац исследования.","unit":0,"anchor":{"format":"fb2","chapter":"fb2-0.1","paragraph":"fb2-0.1.0","offset":0,"endParagraph":"fb2-0.1.0","endOffset":26},"locator":"Глава 1, абзац 1"}]',1,2);
  d=public.av_memory_finish(c.a_fb2,repeat('b',64),'ready');
  perform pg_temp.qa_memory_assert('interrupted FB2 is partial, never falsely ready',
    d->>'status'='partial' and (d->>'next_unit')::int=1);
  d=public.av_memory_begin(c.a_fb2,repeat('b',64),2,'fb2');
  perform pg_temp.qa_memory_assert('interrupted index resumes at committed unit',
    (d->>'next_unit')::int=1 and (d->>'chunk_count')::int=1);
  perform pg_temp.qa_memory_error('progress cannot move backwards',format(
    'select public.av_memory_put(%L::uuid,%L,''[]''::jsonb,0,2)',c.a_fb2,repeat('b',64)),array['P0001']);
  perform pg_temp.qa_memory_error('FB2 screen page masquerading as edition page rejected',format(
    'select public.av_memory_put(%L::uuid,%L,%L::jsonb,2,2)',c.a_fb2,repeat('b',64),
    '[{"chunk_id":"bad-fb2-page","body":"текст","unit":1,"anchor":{"format":"fb2","chapter":"fb2-0.1","paragraph":"fb2-0.1.1","offset":0,"page":2}}]'),array['P0001']);
  perform pg_temp.qa_memory_error('FB2 reversed range rejected',format(
    'select public.av_memory_put(%L::uuid,%L,%L::jsonb,2,2)',c.a_fb2,repeat('b',64),
    '[{"chunk_id":"bad-fb2-range","body":"текст","unit":1,"anchor":{"format":"fb2","chapter":"fb2-0.1","paragraph":"fb2-0.1.1","offset":5,"endOffset":2}}]'),array['P0001']);
  perform pg_temp.qa_memory_error('FB2 missing offset rejected',format(
    'select public.av_memory_put(%L::uuid,%L,%L::jsonb,2,2)',c.a_fb2,repeat('b',64),
    '[{"chunk_id":"bad-fb2-offset","body":"текст","unit":1,"anchor":{"format":"fb2","chapter":"fb2-0.1","paragraph":"fb2-0.1.1"}}]'),array['P0001']);
  perform pg_temp.qa_memory_error('FB2 fabricated identifier shape rejected',format(
    'select public.av_memory_put(%L::uuid,%L,%L::jsonb,2,2)',c.a_fb2,repeat('b',64),
    '[{"chunk_id":"bad-fb2-id","body":"текст","unit":1,"anchor":{"format":"fb2","chapter":"chapter-one","paragraph":"fb2-0.1.1","offset":0}}]'),array['P0001']);
  d=public.av_memory_put(c.a_fb2,repeat('b',64),'[{"chunk_id":"fb2:1:0","body":"Второй абзац исследования.","unit":1,"anchor":{"format":"fb2","chapter":"fb2-0.1","paragraph":"fb2-0.1.1","offset":0,"endOffset":26},"locator":"Глава 1, абзац 2"}]',2,2);
  d=public.av_memory_finish(c.a_fb2,repeat('b',64),'ready');
  perform pg_temp.qa_memory_assert('resumed FB2 finishes with both exact paragraph anchors',
    d->>'status'='ready' and (d->>'chunk_count')::int=2 and (d->>'text_units')::int=2
    and (select count(*)=2 from public.av_memory_search('абзац',c.a_fb2,'',40) x
      where x.anchor->>'paragraph' in ('fb2-0.1.0','fb2-0.1.1') and not(x.anchor?'page')));

  d=public.av_memory_begin(c.a_scan,repeat('c',64),2,'pdf');
  d=public.av_memory_put(c.a_scan,repeat('c',64),'[]',2,2);
  d=public.av_memory_finish(c.a_scan,repeat('c',64),'ready');
  perform pg_temp.qa_memory_assert('completed scanned PDF is honestly no_text',
    d->>'status'='no_text' and (d->>'next_unit')::int=2 and (d->>'text_units')::int=0
    and (select count(*)=0 from public.av_memory_search('текст',c.a_scan,'',40)));
  d=public.av_memory_begin(c.a_mixed,repeat('d',64),2,'pdf');
  perform pg_temp.qa_memory_error('PDF anchor page must match source unit',format(
    'select public.av_memory_put(%L::uuid,%L,%L::jsonb,2,2)',c.a_mixed,repeat('d',64),
    '[{"chunk_id":"bad-unit","body":"текст","unit":0,"anchor":{"format":"pdf","page":2}}]'),array['P0001']);
  d=public.av_memory_put(c.a_mixed,repeat('d',64),'[{"chunk_id":"pdf:1:0","body":"Доступный текст первой страницы.","unit":0,"anchor":{"format":"pdf","page":1}}]',2,2);
  d=public.av_memory_finish(c.a_mixed,repeat('d',64),'ready');
  perform pg_temp.qa_memory_assert('mixed text and scanned PDF is partial and searchable',
    d->>'status'='partial' and (d->>'next_unit')::int=2 and (d->>'text_units')::int=1
    and length(d->>'error')>0
    and (select count(*)=1 from public.av_memory_search('доступный',c.a_mixed,'',40)));
end $$;

-- B has the same source title and fingerprint as A, but must see only B's data.
do $$ declare c record; d jsonb; changed integer;
begin
  select * into c from pg_temp.qa_memory_context;
  perform set_config('request.jwt.claim.sub',c.b::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',c.b,'role','authenticated','is_anonymous',false)::text,true);
  perform pg_temp.qa_memory_assert('B cannot select A documents or chunks',
    (select count(*)=0 from public.av_memory_documents x where x.owner_id=c.a)
    and (select count(*)=0 from public.av_memory_chunks x where x.owner_id=c.a));
  perform pg_temp.qa_memory_assert('B search cannot return A text, even with explicit A book',
    (select count(*)=0 from public.av_memory_search('разумный',null,'',40))
    and (select count(*)=0 from public.av_memory_search('разумный',c.a_pdf,'',40)));
  perform pg_temp.qa_memory_error('B cannot begin A book index',format(
    'select public.av_memory_begin(%L::uuid,%L,1,''pdf'')',c.a_pdf,repeat('a',64)));
  perform pg_temp.qa_memory_error('B cannot write A book through put RPC',format(
    'select public.av_memory_put(%L::uuid,%L,''[]''::jsonb,1,1)',c.a_pdf,repeat('a',64)));
  perform pg_temp.qa_memory_error('B cannot finish A book through RPC',format(
    'select public.av_memory_finish(%L::uuid,%L,''ready'')',c.a_pdf,repeat('a',64)));
  perform pg_temp.qa_memory_error('B cannot forge A ownership through document DML',format(
    'insert into public.av_memory_documents(owner_id,book_id,fingerprint,format,total_units) values(%L,%L,%L,''pdf'',1)',c.a,c.a_pdf,repeat('a',64)));
  perform pg_temp.qa_memory_error('B cannot forge A ownership through chunk DML',format(
    'insert into public.av_memory_chunks(owner_id,book_id,chunk_id,unit,body,search_text,anchor) values(%L,%L,''forged'',0,''текст'',''текст'',%L::jsonb)',c.a,c.a_pdf,'{"format":"pdf","page":1}'));
  update public.av_memory_documents set error='forged' where owner_id=c.a;
  get diagnostics changed=row_count;
  perform pg_temp.qa_memory_assert('B direct document UPDATE affects zero A rows',changed=0);
  update public.av_memory_chunks set body='forged' where owner_id=c.a;
  get diagnostics changed=row_count;
  perform pg_temp.qa_memory_assert('B direct chunk UPDATE affects zero A rows',changed=0);
  delete from public.av_memory_documents where owner_id=c.a;
  get diagnostics changed=row_count;
  perform pg_temp.qa_memory_assert('B direct document DELETE affects zero A rows',changed=0);

  d=public.av_memory_begin(c.b_pdf,repeat('a',64),1,'pdf');
  d=public.av_memory_put(c.b_pdf,repeat('a',64),'[{"chunk_id":"pdf:1:0","body":"Частный текст исследователя Б.","unit":0,"anchor":{"format":"pdf","page":1}}]',1,1);
  d=public.av_memory_finish(c.b_pdf,repeat('a',64),'ready');
  perform pg_temp.qa_memory_assert('B own index works with identical title and fingerprint',
    d->>'status'='ready' and (select count(*)=1 from public.av_memory_search('исследователь',null,'',40) x
      where x.book_id=c.b_pdf and x.author='Автор Б'));
  perform pg_temp.qa_memory_error('B cannot reassign own document to A',format(
    'update public.av_memory_documents set owner_id=%L where book_id=%L',c.a,c.b_pdf));
  perform pg_temp.qa_memory_error('B cannot reassign own chunk to A',format(
    'update public.av_memory_chunks set owner_id=%L where book_id=%L',c.a,c.b_pdf));

  perform set_config('request.jwt.claim.sub',c.a::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',c.a,'role','authenticated','is_anonymous',false)::text,true);
  perform pg_temp.qa_memory_assert('A cannot see B text or B bibliography through search',
    (select count(*)=0 from public.av_memory_search('исследователь',null,'',40))
    and (select count(*)=0 from public.av_memory_search('',null,'Автор Б',40)));
  d=public.av_save_entity('note','qa-memory-surviving-note',0,'{"text":"Синтетическая заметка, сохраняемая при перестроении индекса"}');
  perform pg_temp.qa_memory_assert('note fixture saved before derived index reset',(d->>'ok')::boolean);
end $$;

-- Simulate replacement of A's source metadata only; no storage object is created.
reset role;
update public.av_books set fingerprint=repeat('e',64)
where id=(select a_pdf from qa_memory_context) and owner_id=(select a from qa_memory_context);
set local role authenticated;
do $$ declare c record; d jsonb;
begin
  select * into c from pg_temp.qa_memory_context;
  perform pg_temp.qa_memory_assert('stale derived fingerprint is excluded from search',
    (select count(*)=0 from public.av_memory_search('разумный',c.a_pdf,'',40)));
  perform pg_temp.qa_memory_error('old fingerprint cannot write after replacement',format(
    'select public.av_memory_put(%L::uuid,%L,''[]''::jsonb,1,1)',c.a_pdf,repeat('a',64)));
  d=public.av_memory_begin(c.a_pdf,repeat('e',64),1,'pdf');
  perform pg_temp.qa_memory_assert('new fingerprint resets only the derived index',
    d->>'status'='processing' and (d->>'next_unit')::int=0 and (d->>'chunk_count')::int=0
    and (select count(*)=0 from public.av_memory_chunks x where x.book_id=c.a_pdf)
    and exists(select 1 from public.av_entities x where x.kind='note' and x.entity_id='qa-memory-surviving-note')
    and exists(select 1 from public.av_entities x where x.kind='bibliography' and x.entity_id=c.a_pdf::text)
    and exists(select 1 from public.av_memory_documents x where x.book_id=c.a_fb2 and x.status='ready'));
end $$;

reset role;
update public.av_library_members set enabled=false where user_id=(select a from qa_memory_context);
set local role authenticated;
do $$ declare c record;
begin
  select * into c from pg_temp.qa_memory_context;
  perform pg_temp.qa_memory_assert('disabled member cannot read own index tables',
    (select count(*)=0 from public.av_memory_documents)
    and (select count(*)=0 from public.av_memory_chunks));
  perform pg_temp.qa_memory_assert('disabled member search has no results',
    (select count(*)=0 from public.av_memory_search('абзац',null,'',40)));
  perform pg_temp.qa_memory_error('disabled member cannot begin own index',format(
    'select public.av_memory_begin(%L::uuid,%L,2,''fb2'')',c.a_fb2,repeat('b',64)));
  perform pg_temp.qa_memory_error('disabled member cannot write own index',format(
    'select public.av_memory_put(%L::uuid,%L,''[]''::jsonb,2,2)',c.a_fb2,repeat('b',64)));
  perform pg_temp.qa_memory_error('disabled member cannot write bibliography',format(
    'select public.av_save_entity(''bibliography'',%L,0,''{}''::jsonb)',c.a_scan::text));
end $$;

reset role;
update public.av_library_members set enabled=true where user_id=(select a from qa_memory_context);
set local role anon;
do $$ declare c record;
begin
  select * into c from pg_temp.qa_memory_context;
  perform set_config('request.jwt.claim.sub','',true);
  perform set_config('request.jwt.claims','{}',true);
  perform pg_temp.qa_memory_assert('anonymous identity is empty',auth.uid() is null);
  perform pg_temp.qa_memory_error('anonymous cannot select documents','select * from public.av_memory_documents');
  perform pg_temp.qa_memory_error('anonymous cannot select chunks','select * from public.av_memory_chunks');
  perform pg_temp.qa_memory_error('anonymous cannot execute search RPC','select public.av_memory_search(''абзац'',null,'''',40)');
  perform pg_temp.qa_memory_error('anonymous cannot execute begin RPC',format(
    'select public.av_memory_begin(%L::uuid,%L,2,''fb2'')',c.a_fb2,repeat('b',64)));
end $$;

reset role;
select jsonb_build_object(
  'success',bool_and(passed),
  'checks',count(*),
  'scope','Synthetic PostgreSQL role/JWT/RLS fixtures; transaction rolled back; not browser Auth sessions or original-file extraction',
  'assertions',jsonb_agg(jsonb_build_object('name',name,'passed',passed,'detail',detail) order by name)
) as memory_rls_regression from qa_memory_assertions;
rollback;
