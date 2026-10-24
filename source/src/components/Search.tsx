import {useEffect,useMemo,useRef,useState,type ReactNode} from 'react';
import {useApp} from '../context';
import {useCloud} from '../cloud';
import {useLocalBooks} from '../localBooks';
import {sharedBookAliases} from '../bookMigration';
import {categories} from '../data';
import {Arrow,Modal} from './UI';
import {createQuotation,formatBibliography,getBibliography} from '../scientificMemory';
import {pauseIndexing,queueIndexing,searchLibrary,useIndexProgress} from '../memoryIndex';
import {matchExcerpt,normalizeSearch,queryTerms,searchMap,textMatches,type IndexProgress,type LibraryHit} from '../indexTypes';
import type {Note,Source,TextAnchor} from '../types';
import '../memory-search.css';

type Scope='all'|'books'|'notes'|'quotes';
type InternalHit={key:string;type:string;title:string;text:string;action:()=>void;source?:Source;sectionId?:string;paragraphId?:string;start?:number;end?:number;note?:Note};
function Highlight({text,query}:{text:string;query:string}){
 const mapped=searchMap(text,true),ranges:{start:number;end:number}[]=[];
 for(const term of queryTerms(query)){let from=0;while(ranges.length<40){const i=mapped.text.indexOf(term,from);if(i<0)break;const start=mapped.map[i],end=(mapped.map[i+term.length-1]??start)+1;ranges.push({start,end});from=i+Math.max(1,term.length)}}
 ranges.sort((a,b)=>a.start-b.start);const merged:{start:number;end:number}[]=[];for(const r of ranges){const last=merged.at(-1);if(last&&last.end>=r.start)last.end=Math.max(last.end,r.end);else merged.push({...r})}
 const result:ReactNode[]=[];let cursor=0;for(const r of merged){if(r.start>cursor)result.push(text.slice(cursor,r.start));result.push(<mark key={r.start}>{text.slice(r.start,r.end)}</mark>);cursor=r.end}result.push(text.slice(cursor));return <>{result}</>;
}
const statusLabel=(doc:IndexProgress)=>doc.queued?'В очереди':doc.status==='processing'?'Индексирование':doc.status==='ready'?'Готово':doc.status==='no_text'?'Нет текстового слоя':doc.status==='size_limit'?'Достигнут бюджет':doc.status==='partial'?'Частичный индекс':'Ошибка индексирования';

export default function Search({onClose}:{onClose:()=>void}){
 const {state,update,openSource,openCategory,openResearch,openNote,navigate,setFocusParagraph,toast}=useApp();
 const cloud=useCloud(),local=useLocalBooks(),documents=useIndexProgress(),owner=cloud.authorized?cloud.session!.user.id:'';
 const [q,setQ]=useState(''),[scope,setScope]=useState<Scope>('all'),[author,setAuthor]=useState(''),[bookId,setBookId]=useState(''),[exact,setExact]=useState(false),[searching,setSearching]=useState(false),[error,setError]=useState(''),[fileResults,setFileResults]=useState<{owner:string;hits:LibraryHit[]}>({owner:'',hits:[]});
 const request=useRef(0),query=exact&&q.trim()?`"${q.replace(/"/g,'').trim()}"`:q.trim(),queryError=(query.match(/"/g)?.length??0)%2?'Закрой кавычки вокруг точной фразы':'';
 const books=useMemo(()=>{const aliases=owner?sharedBookAliases(owner):{};return[...local.books.filter(book=>!aliases[book.id]),...(owner?cloud.books:[])].map(book=>{const b=state.bibliography?.find(item=>item.sourceId===book.id);return b?{...book,originalAuthor:book.author,title:b.title||book.title,author:b.authors.length?b.authors.join('; '):book.author}:book})},[local.books,cloud.books,state.bibliography,owner]);
 useEffect(()=>{const canonical=owner&&sharedBookAliases(owner)[bookId];if(canonical)setBookId(canonical)},[owner,bookId,local.books]);
 const signature=books.map(b=>`${b.id}:${b.fingerprint}:${b.title}:${b.author}`).join('|'),activeDocuments=documents.filter(doc=>books.some(book=>book.id===doc.book_id)),ready=activeDocuments.filter(doc=>doc.chunk_count>0).length;
 const progressSignature=activeDocuments.map(doc=>`${doc.book_id}:${doc.status}:${doc.next_unit}:${doc.chunk_count}`).join('|');
 useEffect(()=>{
  const ticket=++request.current;setFileResults({owner,hits:[]});setError(queryError);setSearching(false);
  if(!query||queryError||scope==='notes'||scope==='quotes')return;
  const timer=setTimeout(()=>{setSearching(true);void searchLibrary(query,books,{owner:owner||undefined,bookId:bookId||undefined,author,limit:40,onError:message=>{if(request.current===ticket)setError(message)}}).then(hits=>{if(request.current===ticket)setFileResults({owner,hits})}).catch(e=>{if(request.current===ticket)setError((e as Error).message)}).finally(()=>{if(request.current===ticket)setSearching(false)})},220);
  return()=>{clearTimeout(timer);if(request.current===ticket)request.current++};
 },[query,queryError,scope,author,bookId,owner,signature,progressSignature]);
 const visibleFiles=fileResults.hits.filter(hit=>hit.local||fileResults.owner===owner&&!!owner);
 const internal=useMemo(()=>{
  if(!query||queryError)return[];const results:InternalHit[]=[];
  const authorMatches=(sourceId?:string)=>{if(!author.trim())return true;const b=state.bibliography?.find(b=>b.sourceId===sourceId),source=state.sources.find(s=>s.id===sourceId),book=books.find(b=>b.id===sourceId);return normalizeSearch((b?.authors??[source?.author??book?.author??'']).join('; ')).includes(normalizeSearch(author))};
  if(scope==='all'||scope==='books')for(const source of state.sources){
   if(bookId&&bookId!==source.id||!authorMatches(source.id))continue;let found=false;
   for(const section of source.sections){for(const paragraph of section.paragraphs){if(!textMatches(paragraph.text,query))continue;const excerpt=matchExcerpt(paragraph.text,query);results.push({key:`text:${source.id}:${paragraph.id}`,type:source.demo?'Демонстрационный текст':'Текст источника',title:source.title,text:excerpt.quote,source,sectionId:section.id,paragraphId:paragraph.id,start:excerpt.start,end:excerpt.end,action:()=>{openSource(source.id,section.id);setFocusParagraph('text:'+JSON.stringify({paragraphId:paragraph.id,start:excerpt.start,end:excerpt.end,quote:excerpt.quote}))}});found=true;if(results.length>=40)break}if(results.length>=40)break}
   if(!found&&textMatches([source.title,source.author,source.year,formatBibliography(getBibliography(source,state.bibliography?.find(b=>b.sourceId===source.id)))].filter(Boolean).join(' '),query))results.push({key:`source:${source.id}`,type:'Сведения об источнике',title:source.title,text:source.author??source.subtitle,action:()=>openSource(source.id)});
   if(results.length>=40)break;
  }
  if(scope!=='books')for(const note of state.notes){const quotation=note.evidenceType==='quotation';if(scope==='notes'&&quotation||scope==='quotes'&&!quotation||bookId&&note.sourceId!==bookId||!authorMatches(note.sourceId))continue;const text=[note.citation?.rawText??note.quote??'',note.body].filter(Boolean).join('\n\n');if(!textMatches(`${note.title}\n${text}`,query))continue;results.push({key:`note:${note.id}`,type:quotation?'Цитата':note.demo?'Пример заметки':'Моя заметка',title:note.title,text:matchExcerpt(text||note.title,query).quote,note,action:()=>openNote(note)});if(results.length>=60)break}
  if(scope==='all'&&!author.trim()&&!bookId){
   for(const c of categories)if(textMatches(`${c.title} ${c.subtitle}`,query))results.push({key:`category:${c.id}`,type:'Категория',title:c.title,text:c.subtitle,action:()=>openCategory(c.id)});
   for(const r of state.research)if(textMatches(`${r.title} ${r.question} ${r.hypothesis}`,query))results.push({key:`research:${r.id}`,type:r.archived?'Архив':'Исследовательская линия',title:r.title,text:matchExcerpt(`${r.question}\n${r.hypothesis}`,query).quote,action:()=>{openResearch(r.id);if(r.archived)navigate('archive')}});
   if(textMatches(`${state.manuscriptTitle} ${state.manuscript}`,query))results.push({key:'manuscript',type:'Рукопись',title:state.manuscriptTitle,text:matchExcerpt(state.manuscript,query).quote,action:()=>navigate('manuscripts')});
  }
  if(scope==='all'||scope==='books')for(const book of books){if(bookId&&bookId!==book.id||!authorMatches(book.id))continue;const b=getBibliography(book,state.bibliography?.find(item=>item.sourceId===book.id));if(textMatches(formatBibliography(b),query))results.push({key:`book:${book.id}`,type:'Сведения о книге',title:book.title,text:formatBibliography(b),action:()=>openSource(book.id)})}
  return results.slice(0,60);
 },[query,queryError,scope,author,bookId,state,books]);
 function openFile(hit:LibraryHit){openSource(hit.bookId);setFocusParagraph('file:'+JSON.stringify(hit.anchor));onClose()}
 function saveFileQuote(hit:LibraryHit){const book=books.find(book=>book.id===hit.bookId);if(!book)return;const note=createQuotation({source:book,rawText:hit.quote,anchor:hit.anchor,origin:'extracted',contextBefore:hit.before,contextAfter:hit.after,bibliography:state.bibliography?.find(b=>b.sourceId===book.id)});update(s=>({...s,notes:[note,...s.notes]}));toast('Цитата сохранена. Сверь автоматически извлеченный текст с оригиналом.')}
 function saveInternalQuote(hit:InternalHit){if(!hit.source||!hit.paragraphId)return;const note=createQuotation({source:hit.source,rawText:hit.text,origin:'extracted',sectionId:hit.sectionId,anchors:[{paragraphId:hit.paragraphId,start:hit.start??0,end:hit.end??hit.text.length}],bibliography:state.bibliography?.find(b=>b.sourceId===hit.source!.id)});update(s=>({...s,notes:[note,...s.notes]}));toast('Цитата сохранена с ориентиром в тексте')}
 function deskFile(hit:LibraryHit,side:'left'|'right'){
  update(s=>({...s,desk:{...(s.desk??{leftId:'',rightId:'',ratio:.5,active:side}),[`${side}Id`]:hit.bookId,[`${side}SectionId`]:hit.format==='pdf'?`pdf:${hit.anchor.page}`:hit.anchor.chapter,[`${side}Anchor`]:hit.anchor,[`${side}TextAnchor`]:undefined,[`${side}QuoteId`]:undefined,[`${side}LocalOnly`]:hit.local,active:side}}));navigate('desk');onClose();
 }
 function deskInternal(hit:InternalHit,side:'left'|'right'){
  if(!hit.source)return;const anchor:TextAnchor&{sectionId?:string;quote?:string}={paragraphId:hit.paragraphId??'',start:hit.start??0,end:hit.end??hit.text.length,sectionId:hit.sectionId,quote:hit.text};
  update(s=>({...s,desk:{...(s.desk??{leftId:'',rightId:'',ratio:.5,active:side}),[`${side}Id`]:hit.source!.id,[`${side}SectionId`]:hit.sectionId,[`${side}TextAnchor`]:anchor,[`${side}Anchor`]:undefined,[`${side}QuoteId`]:undefined,[`${side}LocalOnly`]:hit.source!.localOnly===true,active:side}}));navigate('desk');onClose();
 }
 return <Modal title="Поиск по научной памяти" onClose={onClose} wide>
  <input className="global-search-input" autoFocus aria-label="Поиск по материалам" maxLength={498} placeholder="Слово, фраза, автор или источник" value={q} onChange={e=>setQ(e.target.value)}/>
  <div className="memory-search-controls">
   <label>Область<select aria-label="Область поиска" value={scope} onChange={e=>setScope(e.target.value as Scope)}><option value="all">Все материалы</option><option value="books">Библиотека</option><option value="notes">Только записи</option><option value="quotes">Только цитаты</option></select></label>
   <label>Источник<select aria-label="Источник поиска" value={bookId} onChange={e=>setBookId(e.target.value)}><option value="">Все источники</option>{books.map(book=><option key={book.id} value={book.id}>{book.title}{book.local?' — на устройстве':''}</option>)}{state.sources.map(source=><option key={source.id} value={source.id}>{source.title}</option>)}</select></label>
   <label>Автор<input aria-label="Фильтр по автору" maxLength={500} value={author} onChange={e=>setAuthor(e.target.value)} placeholder="Фамилия или имя"/></label>
   <label className="memory-search-exact"><input type="checkbox" checked={exact} onChange={e=>setExact(e.target.checked)}/>Точная фраза</label>
  </div>
  <details className="memory-search-coverage"><summary>Содержание книг: поиск доступен в {ready} из {books.length}</summary>
   <p>Индекс сохраняется постепенно. Облачные книги доступны в твоей учетной записи; локальные остаются на этом устройстве. Бюджет облачного индекса — 64 МиБ исходного текста. Платные сервисы и OCR не используются.</p>
   <div className="memory-index-actions"><button className="text-button" onClick={()=>void queueIndexing(books,{owner,force:true}).catch(e=>setError(e.message))}>Индексировать / продолжить</button>{activeDocuments.some(d=>d.status==='processing'||d.queued)&&<button className="text-button" onClick={pauseIndexing}>Приостановить</button>}</div>
   <ul>{[...activeDocuments].sort((a,b)=>Number(['error','size_limit','processing','partial'].includes(b.status))-Number(['error','size_limit','processing','partial'].includes(a.status))).slice(0,16).map(doc=><li key={`${doc.local}:${doc.book_id}`}><strong>{doc.title}</strong><span>{statusLabel(doc)} · {doc.next_unit} / {doc.total_units} {books.find(b=>b.id===doc.book_id)?.format==='pdf'?'страниц PDF':'абзацев'} · {doc.local?'на устройстве':'в учетной записи'}</span><progress aria-label={`Индексирование ${doc.title}`} value={doc.next_unit} max={Math.max(1,doc.total_units)}/>{doc.error&&<small>{doc.error}</small>}{doc.status==='no_text'&&<small>Поиск по содержимому недоступен без распознавания. Оригинал и заметки к странице доступны.</small>}</li>)}</ul>
  </details>
  {error&&<p className="memory-search-error" role="alert">Часть поиска недоступна: {error}. Показаны полученные результаты.</p>}
  <div className="search-results memory-search-results" aria-live="polite">
   {!query?<p>Ищи по содержимому проиндексированных книг, библиографии, цитатам, собственным записям и рукописи. Точную фразу можно заключить в кавычки.</p>:<>
    {internal.map(hit=>hit.source&&hit.paragraphId?<article className="memory-search-hit" key={hit.key}><span>{hit.type}</span><h3>{hit.title}</h3><p><Highlight text={hit.text} query={query}/></p><div className="memory-hit-actions"><button onClick={()=>{hit.action();onClose()}}>Открыть в источнике</button><button onClick={()=>saveInternalQuote(hit)}>Сохранить цитату</button><button onClick={()=>deskInternal(hit,'left')}>На стол слева</button><button onClick={()=>deskInternal(hit,'right')}>На стол справа</button></div></article>:<button key={hit.key} onClick={()=>{hit.action();onClose()}}><span>{hit.type}</span><strong>{hit.title}</strong><small><Highlight text={hit.text} query={query}/></small><Arrow diagonal/></button>)}
    {visibleFiles.map(hit=><article className="memory-search-hit" key={hit.id}><span>{hit.format.toUpperCase()} · {hit.locator} · {hit.local?'на устройстве':'личная библиотека'}</span><h3>{hit.title}</h3>{hit.author&&<p className="memory-hit-author">{hit.author}</p>}<p className="memory-hit-context">{hit.before&&<>…{hit.before}</>}<Highlight text={hit.quote} query={hit.matchedTerm??query}/>{hit.after&&<>{hit.after}…</>}</p><small>{hit.format==='pdf'?'Текст извлечен автоматически; номер относится к файлу PDF. Сверь цитату с оригиналом.':'Устойчивый ориентир FB2; экранная страница не является страницей издания.'}{hit.status==='partial'?' Индекс этой книги частичный.':''}</small><div className="memory-hit-actions"><button onClick={()=>openFile(hit)}>Открыть в источнике</button><button onClick={()=>saveFileQuote(hit)}>Сохранить цитату</button><button onClick={()=>deskFile(hit,'left')}>На стол слева</button><button onClick={()=>deskFile(hit,'right')}>На стол справа</button></div></article>)}
    {searching&&<p role="status">Ищу в проиндексированном содержимом…</p>}{!searching&&!visibleFiles.length&&!internal.length&&<p>Совпадений в доступных индексах нет. Проверь охват индексирования или уточни запрос.</p>}
    {(visibleFiles.length>=40||internal.length>=60)&&<p>Показаны первые совпадения. Уточни автора или выбери одну книгу.</p>}
   </>}
  </div>
  <div className="search-footer">Esc — закрыть <span>Ctrl / ⌘ K — открыть поиск</span></div>
 </Modal>;
}
