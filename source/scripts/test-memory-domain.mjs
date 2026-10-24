import assert from 'node:assert/strict';
import {createServer} from 'vite';
const vite=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
let checks=0;
function test(name,fn){fn();checks++;console.log('PASS',name)}
try{
 const m=await vite.ssrLoadModule('/src/scientificMemory.ts');
 const {defaultState,decodeState}=await vite.ssrLoadModule('/src/storage.ts');
 const sync=await vite.ssrLoadModule('/src/sync.ts');
 const {mergeMigration}=await vite.ssrLoadModule('/src/migration.ts');
 // Explicitly synthetic records; these are not bibliographic claims about publications.
 const source={id:'instance-a',title:'Тестовый источник',author:'Тестовый Автор',subtitle:'Материал пользователя',format:'digital',categories:[],sections:[],demo:false};
 const other={...source,id:'instance-b'};
 const record=m.getBibliography(source);
 const raw='  Точный текст с ёлкой.\nПерене-\nсенное слово.  ';
 const anchor={format:'pdf',page:145,quote:raw,rects:[[.1,.2,.3,.04]]};
 const quote=m.createQuotation({source:{...source,fingerprint:'fingerprint-a'},rawText:raw,anchor,contextBefore:'Контекст до',contextAfter:'Контекст после',comment:'Моя интерпретация отдельно.'});
 const row=(kind,id,data,revision=1)=>({kind,entity_id:id,data,revision,updated_at:'2026-10-24T00:00:00Z'});
 const empty=()=>({...structuredClone(defaultState),notes:[],sources:[],research:[],bibliography:[]});
 test('Sparse bibliography never invents publication facts or treats UI subtitle as evidence',()=>{
  assert.equal(record.title,source.title);assert.equal(record.subtitle,undefined);assert.equal(record.publisher,undefined);assert.equal(record.year,undefined);assert.equal(record.sourceType,'other');assert.equal(record.provenance.title,'auto');assert.deepEqual(record.confirmedFields,[]);
 });
 test('Document metadata adds only available fields; unchanged extraction is idempotent',()=>{
  const extracted=m.applyExtractedBibliography(record,{publisher:'Тестовое издательство',year:'2024'});
  assert.equal(extracted.publisher,'Тестовое издательство');assert.equal(extracted.provenance.publisher,'auto');assert.equal(m.applyExtractedBibliography(extracted,{publisher:'Другое издательство'}),extracted);assert.equal(m.applyExtractedBibliography(extracted,{}).updatedAt,extracted.updatedAt);
 });
 test('Explicitly confirmed empty field cannot be silently refilled',()=>{
  const confirmed=m.confirmBibliographicField(record,'publisher','');assert.equal(confirmed.provenance.publisher,'user');assert.ok(confirmed.confirmedFields.includes('publisher'));assert.equal(m.applyExtractedBibliography(confirmed,{publisher:'Автоматический вариант'}).publisher,'');
 });
 test('A quote preserves exact whitespace, spelling, source fingerprint and separate comment',()=>{
  assert.equal(quote.quote,raw);assert.equal(quote.citation.rawText,raw);assert.equal(quote.body,'Моя интерпретация отдельно.');assert.equal(quote.citation.fingerprint,'fingerprint-a');assert.equal(quote.citation.editionId,source.id);assert.equal(quote.citation.contextBefore,'Контекст до');assert.equal(quote.citation.verification,'unverified');
 });
 test('Identical titles never merge different file/edition identities',()=>{
  const second=m.createQuotation({source:other,rawText:raw,anchor});assert.notEqual(second.citation.editionId,quote.citation.editionId);assert.equal(second.citation.sourceId,other.id);assert.notEqual(m.getBibliography(other).id,record.id);
  assert.doesNotMatch(m.formatCitation(quote,{...m.getBibliography(other),authors:['ДРУГОЙ АВТОР']}),/ДРУГОЙ АВТОР/);assert.equal(m.validCitation({...quote.citation,editionId:other.id,bibliography:undefined},quote.sourceId,quote.quote),false);
 });
 test('PDF file page and confirmed printed page remain distinct',()=>{
  const note=m.createQuotation({source,rawText:raw,anchor,printedPage:'139',printedPageConfirmed:true});const formatted=m.formatCitation(note);assert.match(formatted,/Страница PDF 145/);assert.match(formatted,/Страница издания 139/);
  const unconfirmed=m.createQuotation({source,rawText:raw,anchor,printedPage:'139'});assert.doesNotMatch(m.formatCitation(unconfirmed),/Страница издания 139/);
 });
 test('FB2 screen pagination never becomes a bibliographic page',()=>{
  const note=m.createQuotation({source,rawText:raw,anchor:{format:'fb2',page:987654,chapter:'chapter-a',paragraph:'paragraph-a',offset:42}});const formatted=m.formatCitation(note);assert.doesNotMatch(formatted,/987654/);assert.match(formatted,/chapter-a/);assert.match(formatted,/paragraph-a/);assert.match(formatted,/42/);
 });
 test('Paper source retains confirmed page and explicitly supplied legacy locator',()=>{
  const paper=m.createQuotation({source,rawText:raw,origin:'manual',printedPage:'7',printedPageConfirmed:true});assert.match(m.formatCitation(paper),/Страница издания 7/);
  const legacy=m.createQuotation({source,rawText:raw,origin:'manual'});legacy.locator='С. 42';assert.match(m.formatCitation(legacy),/Ориентир пользователя: С\. 42/);
 });
 test('Templates preserve literal text and do not export comments as author quotations',()=>{
  assert.equal(m.formatCitation(quote,record,'{quote}'),raw);assert.doesNotMatch(m.formatCitation(quote),/Моя интерпретация/);assert.equal(m.formatBibliography({...record,year:'2024'},'{title} ({year})'),'Тестовый источник (2024)');assert.doesNotMatch(m.formatBibliography({...record,year:'2024'}),/\/\//);
 });
 test('Invalid or forged anchor/snapshot combinations are rejected',()=>{
  assert.equal(m.validFileAnchor({format:'pdf',page:0}),false);assert.equal(m.validFileAnchor({format:'fb2',offset:-1}),false);assert.equal(m.validFileAnchor({format:'pdf',fraction:Infinity}),false);assert.equal(m.validCitation({...quote.citation,sourceId:'different'},quote.sourceId,quote.quote),false);assert.equal(m.validMemoryNote({...quote,quote:'Измененная цитата'}),false);
 });
 test('Old note text and missing-source records survive schema decoding unchanged',()=>{
  const legacy={id:'old-note',title:'Ранее сохраненная мысль',body:'Первоначальный\nтекст остается прежним.',kind:'thought',categories:[],createdAt:'2026-10-01',sourceId:'missing-original'};const decoded=decodeState({...empty(),notes:[legacy]});assert.deepEqual(decoded.notes[0],legacy);assert.deepEqual(decoded.bibliography,[]);
 });
 test('Memory archive roundtrip restores IDs, literal quotes, bibliography, links and desk anchors',()=>{
  const original={...empty(),bibliography:[record],notes:[quote,{id:'argument',title:'Аргумент',body:'Моя мысль.',kind:'thought',evidenceType:'argument',categories:[],createdAt:'2026-10-24',quotationIds:[quote.id],relatedSourceIds:[source.id,other.id]}],bibliographicTemplates:{bibliography:'{title}',citation:'{quote} — {source}'},desk:{leftId:source.id,rightId:other.id,leftAnchor:anchor,rightTextAnchor:{paragraphId:'p1',start:1,end:4,quote:'ест'},ratio:.5,active:'left'}};
  const archive=m.exportMemory(original),restored=m.importMemory(archive,empty());assert.equal(JSON.parse(archive).includesOriginals,false);assert.equal(restored.conflicts.length,0);assert.equal(restored.state.notes[0].quote,raw);assert.equal(restored.state.notes[1].quotationIds[0],quote.id);assert.deepEqual(restored.state.bibliography,JSON.parse(JSON.stringify([record])));assert.deepEqual(restored.state.desk,original.desk);assert.deepEqual(restored.state.bibliographicTemplates,original.bibliographicTemplates);assert.ok(decodeState(restored.state));
 });
 test('Malformed import cannot replace a literal quote or inject invalid positions',()=>{
  const archive=JSON.parse(m.exportMemory({...empty(),notes:[quote]}));archive.notes[0].citation.rawText='Подмена';assert.throws(()=>m.importMemory(JSON.stringify(archive),empty()),/Некорректная научная запись/);
  archive.notes[0].citation.rawText=raw;archive.notes[0].fileAnchor.page=0;assert.throws(()=>m.importMemory(JSON.stringify(archive),empty()),/Некорректная научная запись/);
 });
 test('Import conflicts leave existing text and identifiers intact and are explicitly reported',()=>{
  const archive=m.exportMemory({...empty(),notes:[quote]});const existing={...quote,body:'Более новая собственная запись.'};const imported=m.importMemory(archive,{...empty(),notes:[existing]});assert.equal(imported.state.notes[0].body,existing.body);assert.equal(imported.state.notes[0].id,quote.id);assert.equal(imported.conflicts.length,1);
 });
 test('Bibliography, templates and both desk anchor types synchronize independently',()=>{
  const state={...empty(),bibliography:[record],notes:[quote],bibliographicTemplates:{bibliography:'{title}',citation:'{quote}'},desk:{leftId:source.id,rightId:other.id,leftAnchor:anchor,rightTextAnchor:{paragraphId:'p1',start:0,end:4,quote:'Тест'},ratio:.5,active:'right'}};const flat=sync.flatten(state);const rows=Object.entries(flat).map(([key,value])=>{const colon=key.indexOf(':');return row(key.slice(0,colon),key.slice(colon+1),value)});const restored=sync.applyRecords(empty(),rows);assert.deepEqual(restored.bibliography,[record]);assert.deepEqual(restored.notes,[quote]);assert.deepEqual(restored.desk.rightTextAnchor,state.desk.rightTextAnchor);assert.deepEqual(restored.desk.leftAnchor,anchor);assert.deepEqual(restored.bibliographicTemplates,state.bibliographicTemplates);
 });
 test('An old cache containing an unapplied bibliography hydrates instead of deleting it',()=>{
  const prior=row('bibliography',record.id,record),key='bibliography:'+record.id,local=sync.flatten(empty());assert.equal(sync.managed(prior),true);assert.equal(sync.unchanged(local,key,prior),true);assert.equal(sync.localValue(local,key,prior),undefined);assert.equal(sync.equal(sync.localValue(local,key,prior),prior.data),false);assert.deepEqual(sync.applyRecords(empty(),[prior]).bibliography,[record]);
 });
 test('Local-only book quotes and metadata never enter outgoing entities or cached deletion paths',()=>{
  const localSource={...source,local:true};const privateRecord=m.getBibliography(localSource,record),privateQuote=m.createQuotation({source:localSource,rawText:'PRIVATE Ё LITERAL',anchor:{format:'fb2',chapter:'c1',paragraph:'p1',offset:0,quote:'PRIVATE Ё LITERAL'}});assert.equal(privateRecord.localOnly,true);assert.equal(privateQuote.localOnly,true);
  const privateState={...empty(),bibliography:[privateRecord],notes:[privateQuote],desk:{leftId:source.id,rightId:other.id,leftAnchor:privateQuote.fileAnchor,leftTextAnchor:{paragraphId:'p1',start:0,end:1,quote:'PRIVATE Ё LITERAL'},leftQuoteId:privateQuote.id,ratio:.5,active:'left'}};const flat=sync.flatten(privateState);assert.equal(flat['note:'+privateQuote.id],undefined);assert.equal(flat['bibliography:'+record.id],undefined);assert.doesNotMatch(JSON.stringify(flat),/PRIVATE Ё LITERAL|local-only/);assert.equal(flat['settings:desk'].leftAnchor,undefined);
  const prior=row('note',privateQuote.id,{...privateQuote,localOnly:undefined});assert.equal(sync.unchanged(flat,'note:'+privateQuote.id,prior),true);assert.notDeepEqual(sync.localValue(flat,'note:'+privateQuote.id,prior),{deleted:true});const incoming=sync.applyRecords(privateState,[row('note',privateQuote.id,{deleted:true}),row('bibliography',record.id,{deleted:true}),row('settings','desk',flat['settings:desk'])]);assert.equal(incoming.notes[0].quote,privateQuote.quote);assert.deepEqual(incoming.desk.leftAnchor,privateState.desk.leftAnchor);assert.equal(incoming.bibliography[0].id,record.id);
 });
 test('Guest migration retains quote snapshots when a text-source identity collides',()=>{
  const current={...empty(),sources:[{...source,title:'Облачная версия'}]},old={...empty(),sources:[source],bibliography:[record],notes:[quote]};const migrated=mergeMigration(current,old),n=migrated.notes[0];assert.notEqual(n.sourceId,source.id);assert.equal(n.citation.sourceId,n.sourceId);assert.equal(n.citation.bibliography.id,n.sourceId);assert.equal(n.quote,raw);assert.ok(decodeState(migrated));assert.deepEqual(mergeMigration(migrated,old),migrated);
 });
 test('Explicit local desk scope protects anchors even before a bibliography exists',()=>{
  const state={...empty(),desk:{leftId:'unindexed-local-book',rightId:'cloud-book',leftAnchor:{format:'pdf',page:5,quote:'PRIVATE ANCHOR BEFORE INDEXING'},leftLocalOnly:true,rightAnchor:{format:'pdf',page:2},ratio:.5,active:'left'}};const flat=sync.flatten(state);assert.doesNotMatch(JSON.stringify(flat),/PRIVATE ANCHOR/);assert.equal(flat['settings:desk'].leftLocalOnly,true);assert.deepEqual(flat['settings:desk'].rightAnchor,{format:'pdf',page:2});const restored=sync.applyRecords(state,[row('settings','desk',flat['settings:desk'])]);assert.deepEqual(restored.desk.leftAnchor,state.desk.leftAnchor);assert.equal(decodeState(restored).desk.leftLocalOnly,true);
 });
 test('Conflicting bibliography migration retains prior field variants without inventing an edition',()=>{
  const first={...record,year:'2020'},second={...record,year:'2024'};const migrated=mergeMigration({...empty(),bibliography:[first]},{...empty(),bibliography:[second]});assert.equal(migrated.bibliography.length,1);assert.equal(migrated.bibliography[0].id,record.id);assert.equal(migrated.bibliography[0].year,'2020');assert.equal(migrated.bibliography[0].previousVersions[0].year,'2024');assert.deepEqual(mergeMigration(migrated,{...empty(),bibliography:[second]}),migrated);
 });
 test('CSV export prevents spreadsheet formula evaluation without changing citation text',()=>{assert.match(m.exportBibliographyCSV([{...record,title:'=1+1'}]),/"'=1\+1"/);assert.equal(m.formatCitation(quote,record,'{quote}'),raw)});
 test('Quotation IDs work without secure-context randomUUID',()=>{const descriptor=Object.getOwnPropertyDescriptor(crypto,'randomUUID');try{Object.defineProperty(crypto,'randomUUID',{value:undefined,configurable:true});assert.match(m.createQuotation({source,rawText:raw}).id,/^[0-9a-f]{8}(-[0-9a-f]{8}){3}$/)}finally{if(descriptor)Object.defineProperty(crypto,'randomUUID',descriptor);else delete crypto.randomUUID}});
 console.log(`${checks} scientific-memory domain checks passed. Cloud transport and browser geometry are tested separately.`);
}finally{await vite.close()}
