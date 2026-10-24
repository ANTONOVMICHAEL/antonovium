import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {Window} from 'happy-dom';

const window=new Window({url:'https://memory-index.test/'}),previous=new Map();
for(const name of ['window','document','DOMParser','Node']){previous.set(name,globalThis[name]);globalThis[name]=name==='window'?window:window[name]}
const vite=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
let checks=0;
function test(name,fn){fn();checks++;console.log('PASS',name)}
try{
 const m=await vite.ssrLoadModule('/src/indexTypes.ts'),{parseFB2,decodeXML}=await vite.ssrLoadModule('/src/fb2.ts');
 test('Russian spelling and search whitespace normalize without rewriting the literal',()=>{
  const raw='  Ёлка\u00a0и ЕЛКА.\nНаучная   память.  ',copy=raw;
  assert.equal(m.normalizeSearch(raw),'елка и елка. научная память.');assert.equal(raw,copy);
  assert.equal(m.textMatches(raw,'елка память'),true);assert.equal(m.textMatches(raw,'елка отсутствует'),false);
 });
 test('Quoted phrases require adjacency; word combinations use AND in either order',()=>{
  const raw='Теория научного познания связана с памятью.';
  assert.equal(m.textMatches(raw,'познания теория'),true);assert.equal(m.textMatches(raw,'"теория познания"'),false);
  assert.equal(m.textMatches(raw,'"научного познания" памятью'),true);assert.equal(m.textMatches(raw,'"научного познания" отсутствует'),false);
  assert.equal(m.textMatches(raw,'"научного познания" "с памятью"'),true);
 });
 test('PDF search joins line-end hyphenation and soft hyphens but exposes the original extraction',()=>{
  const raw='В начале. Информаци-\nонная мо\u00adдель с ё. В конце.';
  assert.equal(m.textMatches(raw,'"информационная модель"',true),true);
  assert.equal(m.textMatches(raw,'информационная',false),false);
  const found=m.matchExcerpt(raw,'"информационная модель"',true);
  assert.equal(raw.slice(found.matchStart,found.matchEnd),'Информаци-\nонная мо\u00adдель');
  assert.equal(found.quote,raw.slice(found.start,found.end));assert.ok(found.quote.includes('-\n'));assert.ok(found.quote.includes('\u00ad'));
 });
 test('Mapped search spans retain actual Cyrillic/Latin and Unicode source offsets',()=>{
  const raw='Начало 😀. Σ МЁРА и ёж. Конец.',found=m.matchExcerpt(raw,'"мера и еж"');
  assert.equal(raw.slice(found.matchStart,found.matchEnd),'МЁРА и ёж');
  const mapped=m.searchMap(raw);for(let i=0;i<mapped.map.length;i++)assert.ok(mapped.map[i]>=0&&mapped.map[i]<raw.length);
  assert.equal(mapped.text,m.normalizeSearch(raw));assert.equal(m.searchMap(raw,true).text,m.normalizeSearch(raw,true));
 });
 test('Long text snippets preserve literal boundaries and separate preceding/following context',()=>{
  const raw='До. '.repeat(100)+'Редкий искомый фрагмент.'+' После.'.repeat(100),hit=m.matchExcerpt(raw,'"искомый фрагмент"');
  assert.equal(hit.quote,raw.slice(hit.start,hit.end));assert.equal(hit.before,raw.slice(hit.start-80,hit.start));assert.equal(hit.after,raw.slice(hit.end,hit.end+80));assert.ok(hit.quote.length<500);
 });
 test('Chunking covers all source characters and overlaps a maximum-size exact query',()=>{
  const phrase='Тестовое сочетание '.repeat(22),raw='А'.repeat(6800)+phrase+'Б'.repeat(9000),chunks=m.splitLiteral(raw);
  assert.ok(chunks.length>2);assert.ok(chunks.some(part=>m.textMatches(part.text,`"${phrase.trim()}"`)));
  let covered=0;for(const chunk of chunks){assert.equal(chunk.text,raw.slice(chunk.offset,chunk.offset+chunk.text.length));assert.ok(chunk.offset<=covered);assert.ok(chunk.text.length<=7000);covered=Math.max(covered,chunk.offset+chunk.text.length)}assert.equal(covered,raw.length);
 });
 test('Chunk boundaries never cut UTF-16 pairs, including overlap starts',()=>{
  const raw=('А'.repeat(486)+'😀').repeat(10),chunks=m.splitLiteral(raw,500,13);
  for(const chunk of chunks){assert.equal(chunk.text,raw.slice(chunk.offset,chunk.offset+chunk.text.length));assert.doesNotMatch(chunk.text,/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/)}
  const maximal=m.splitLiteral('😀'.repeat(260),500,499);assert.ok(maximal.length<300);for(const chunk of maximal)assert.doesNotMatch(chunk.text,/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/);
  assert.throws(()=>m.splitLiteral(raw,500,1.5));assert.throws(()=>m.splitLiteral(raw,500,500));assert.deepEqual(m.splitLiteral(''),[]);
 });
 test('PDF extraction keeps item strings and explicit line endings; scans have no invented text',()=>{
  const text=m.pdfExtractedText([{str:'  Точный',hasEOL:false},{str:'текст с ё',hasEOL:true},{str:'следующая строка',hasEOL:false}]);
  assert.equal(text,'  Точный текст с ё\nследующая строка ');assert.equal(m.pdfExtractedText([]),'');assert.equal(m.pdfExtractedText([{type:'beginMarkedContent'}]),'');
 });
 test('Index anchors use file PDF pages and structural FB2 IDs; screen pages are rejected',()=>{
  assert.equal(m.validIndexAnchor({format:'pdf',page:145},200),true);
  for(const page of [0,-1,1.5,NaN,Infinity,201])assert.equal(m.validIndexAnchor({format:'pdf',page},200),false);
  const anchor={format:'fb2',chapter:'fb2-0.1.0',paragraph:'fb2-0.1.0.2',offset:3,endParagraph:'fb2-0.1.0.2',endOffset:18};assert.equal(m.validIndexAnchor(anchor),true);
  assert.equal(m.validIndexAnchor({...anchor,page:2}),false);assert.equal(m.validIndexAnchor({...anchor,chapter:'fb2-..'}),false);assert.equal(m.validIndexAnchor({...anchor,endOffset:2}),false);
 });
 test('Real FB2 parsing gives each indexed paragraph the same stable reader anchor and literal text',()=>{
  const raw='  Буквальная ёлка с выделенным словом.  ',xml=`<?xml version="1.0" encoding="utf-8"?><FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0"><description><title-info><book-title>Синтетический текст</book-title><author><first-name>Тестовый</first-name><last-name>Автор</last-name></author></title-info></description><body><section id="chapter"><title><p>Первая глава</p></title><p>${raw.replace('выделенным','<emphasis>выделенным</emphasis>')}</p><section><title><p>Вложенный раздел</p></title><p>Редкий термин: π και λόγος.</p></section></section><section><p>Последний абзац.</p></section></body></FictionBook>`;
  const parsed=parseFB2(decodeXML(new TextEncoder().encode(xml))),ids=new Set();let found=false,greek=false;
  for(const chapter of parsed.chapters){const root=document.createElement('div');root.innerHTML=chapter.html;for(const p of root.querySelectorAll('[data-fb2-paragraph]')){assert.ok(!ids.has(p.id));ids.add(p.id);const anchor={format:'fb2',chapter:chapter.id,paragraph:p.id,offset:0,endParagraph:p.id,endOffset:p.textContent.length};assert.equal(m.validIndexAnchor(anchor),true);assert.equal(parsed.targets[p.id],chapter.id);if(p.textContent===raw){found=true;const hit=m.matchExcerpt(p.textContent,'"елка с выделенным"');assert.equal(p.textContent.slice(hit.matchStart,hit.matchEnd),'ёлка с выделенным')}if(m.textMatches(p.textContent,'λόγος'))greek=true}}
  assert.ok(found);assert.ok(greek);assert.ok(ids.size>=5);assert.equal(parsed.author,'Тестовый Автор');assert.equal(parsed.title,'Синтетический текст');
 });
 test('Unsafe XML never reaches the derived index',()=>{
  assert.throws(()=>parseFB2('<!DOCTYPE FictionBook [<!ENTITY x SYSTEM "file:///secret">]><FictionBook><body><p>&x;</p></body></FictionBook>'),/запрещенные/);
  assert.throws(()=>decodeXML(new TextEncoder().encode('<?xml version="1.0" encoding="unknown"?><FictionBook/>')),/Кодировка/);
 });
 console.log(`${checks} memory-index scenarios passed. PostgreSQL ownership/RLS and real browser indexing are checked separately.`);
}finally{await vite.close();await window.happyDOM.close();for(const[name,value]of previous){if(value===undefined)delete globalThis[name];else globalThis[name]=value}}
