import { useRef, useState } from 'react';
import { useApp } from '../context';
import { categories, categoryTitle } from '../data';
import type { Source } from '../types';
import { newId } from '../storage';
import { Arrow, Empty, Label, Modal } from './UI';
import CloudBooks,{CloudUploadButton} from './CloudBooks';
import { useCloud } from '../cloud';
import { useLocalBooks } from '../localBooks';

function AddSource({onClose}:{onClose:()=>void}){
 const{update,toast}=useApp();const[format,setFormat]=useState<'digital'|'paper'>('digital');const[title,setTitle]=useState('');const[author,setAuthor]=useState('');const[year,setYear]=useState('');const[text,setText]=useState('');const[tags,setTags]=useState<string[]>([]);const[error,setError]=useState('');const file=useRef<HTMLInputElement>(null);
 async function load(f?:File){if(!f)return;if(f.size>2_000_000){setError('Для этой версии выбери TXT до 2 МБ.');return}try{const value=await f.text();if(value.includes('\u0000'))throw new Error();setText(value);if(!title)setTitle(f.name.replace(/\.txt$/i,''));setError('')}catch{setError('Не удалось прочитать файл. Нужен текст TXT в кодировке UTF-8.')}}
 function save(e:React.FormEvent){e.preventDefault();if(!title.trim()||(format==='digital'&&!text.trim()))return;const id=newId();const source:Source={id,title:title.trim(),author:author.trim()||undefined,year:year.trim()||undefined,subtitle:'Материал пользователя',demo:false,format,categories:tags,sections:format==='paper'?[]:[{id:`${id}-s1`,title:'Текст источника',paragraphs:text.trim().split(/\n\s*\n/).filter(Boolean).map((p,i)=>({id:`${id}-p${i}`,text:p.trim()}))}]};update(s=>({...s,sources:[...s.sources,source],sourceId:id,sectionId:source.sections[0]?.id??'',screen:'reader'}));onClose();toast(format==='paper'?'Бумажный источник добавлен':'Текст добавлен в читальный зал');}
 return <Modal title="Добавить источник" onClose={onClose} wide><form className="composer" onSubmit={save}><div className="segmented" role="group" aria-label="Формат источника"><button type="button" className={format==='digital'?'active':''} onClick={()=>setFormat('digital')}>Цифровой текст</button><button type="button" className={format==='paper'?'active':''} onClick={()=>setFormat('paper')}>Бумажная книга</button></div><label>Название<input required maxLength={240} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Точное название своего источника"/></label><div className="form-columns"><label>Автор / составитель<input value={author} onChange={e=>setAuthor(e.target.value)} maxLength={240} placeholder="По изданию"/></label><label>Год и сведения об издании<input value={year} onChange={e=>setYear(e.target.value)} maxLength={240} placeholder="По титульному листу"/></label></div>
 {format==='digital'?<><label>Текст источника<textarea rows={7} required value={text} onChange={e=>setText(e.target.value)} placeholder="Вставь текст. Пустая строка разделяет абзацы." maxLength={2000000}/></label><input ref={file} className="sr-only" type="file" accept=".txt,text/plain" onChange={e=>load(e.target.files?.[0])}/><button type="button" className="text-link" onClick={()=>file.current?.click()}>Или открыть TXT-файл ↗</button><p className="fineprint">Здесь добавляется обычный текст. Для PDF и FB2 используй кнопку загрузки книги. Распознавание сканов не выполняется.</p></>:<p className="form-note">Электронная копия не нужна. При создании заметки можно вручную указать страницу своего издания.</p>}
 <fieldset><legend>Категории источника</legend><div className="tag-picker">{categories.map(c=><button type="button" className={`tag ${tags.includes(c.id)?'selected':''}`} key={c.id} onClick={()=>setTags(tags.includes(c.id)?tags.filter(x=>x!==c.id):[...tags,c.id])}>{c.title}</button>)}</div></fieldset>{error&&<p role="alert" className="error">{error}</p>}<div className="form-actions"><button type="button" className="text-button" onClick={onClose}>Отмена</button><button className="button primary" disabled={!title.trim()||(format==='digital'&&!text.trim())}>Добавить в библиотеку →</button></div></form></Modal>;
}
export default function Library(){
 const{state,openSource,openCategory}=useApp();
 const cloud=useCloud(),local=useLocalBooks();
 const[filter,setFilter]=useState<'all'|'files'|'digital'|'paper'>('all');
 const[search,setSearch]=useState('');
 const[adding,setAdding]=useState(false);
 const[view,setView]=useState<'list'|'shelf'>(()=>localStorage.getItem('antonovium.library.view')==='shelf'?'shelf':'list');
 const[sort,setSort]=useState<'recent'|'title'|'author'>('recent');
 const term=search.trim().toLocaleLowerCase('ru');
 const sources=state.sources.filter(s=>(filter==='all'||filter===s.format)&&`${s.title} ${s.author??''} ${s.year??''} ${s.subtitle}`.toLocaleLowerCase('ru').includes(term))
  .sort((a,b)=>sort==='title'?a.title.localeCompare(b.title,'ru'):sort==='author'?(a.author??'').localeCompare(b.author??'','ru'):state.sources.indexOf(b)-state.sources.indexOf(a));
 const showFiles=filter==='all'||filter==='files'||filter==='digital';
 const showTexts=filter!=='files';
 const fileMatches=[...local.books,...cloud.books].some(b=>`${b.title} ${b.author} ${b.edition}`.toLocaleLowerCase('ru').includes(term));
 function switchView(next:'list'|'shelf'){setView(next);localStorage.setItem('antonovium.library.view',next)}
 return <main className="page library-page library-v3 page-enter" id="main">
  <header className="library-v3-head">
   <div><h1>Библиотека</h1></div>
   <div className="library-v3-add"><CloudUploadButton/><button className="button outline" onClick={()=>setAdding(true)}>Добавить текст или издание <span aria-hidden="true">+</span></button></div>
  </header>
  <div className="library-v3-searchbar">
   <label className="library-v3-search"><span aria-hidden="true">⌕</span><input aria-label="Поиск в библиотеке" type="search" placeholder="Название, автор, сведения об издании" value={search} onChange={e=>setSearch(e.target.value)}/></label>
   <div className="library-v3-view" role="group" aria-label="Вид каталога"><button aria-pressed={view==='list'} className={view==='list'?'active':''} onClick={()=>switchView('list')}>≡ <span>Список</span></button><button aria-pressed={view==='shelf'} className={view==='shelf'?'active':''} onClick={()=>switchView('shelf')}>▦ <span>Каталог</span></button></div>
  </div>
  <div className="library-v3-body">
   <aside className="library-v3-index" aria-label="Разделы библиотеки">
    <span className="library-v3-index-label">Каталог</span>
    <div role="group" aria-label="Показать источники">
     {([['all','Все источники'],['files','PDF и FB2'],['digital','Цифровые'],['paper','Бумажные']] as const).map(([id,label],i)=><button aria-pressed={filter===id} className={filter===id?'active':''} key={id} onClick={()=>setFilter(id)}><span>0{i+1}</span>{label}<Arrow diagonal/></button>)}
    </div>
    <p>Книги, тексты и записи об изданиях в одном рабочем контексте.</p>
   </aside>
   <div className={`library-v3-results catalog-${view}`}>
    {showFiles&&<section className="library-v3-group" aria-label="Книги PDF и FB2">
     <div className="library-v3-grouphead"><span>Книги PDF и FB2</span><small>Личное облако и файлы на устройстве</small></div>
     <CloudBooks search={search}/>{!fileMatches&&<Empty title={term?'Книги не найдены':'Здесь появятся PDF и FB2'}>{term?'Попробуй другое название или автора.':'Добавь книгу с устройства и выбери, где ее хранить.'}</Empty>}
    </section>}
    {showTexts&&<section className="library-v3-group" aria-label="Тексты и бумажные издания">
     <div className="library-v3-grouphead"><span>{filter==='paper'?'Бумажные издания':'Тексты и издания'}</span><label>Порядок <select value={sort} onChange={e=>setSort(e.target.value as typeof sort)}><option value="recent">Недавно добавленные</option><option value="title">По названию</option><option value="author">По автору</option></select></label></div>
     {sources.length?<div className="library-v3-source-grid">{sources.map((s,i)=><article className="source-row library-v3-source" key={s.id}>
      <span className="row-number">{String(i+1).padStart(2,'0')}</span><div className="source-main"><div className="note-meta"><span>{s.format==='paper'?'Бумажное издание':'Цифровой текст'}</span>{s.demo&&<span className="demo-label">Демонстрационный материал</span>}</div>
       <button className="source-title" onClick={()=>openSource(s.id)}>{s.title}</button><p>{[s.author,s.year].filter(Boolean).join(' · ')||s.subtitle}</p>
       <div className="tags">{s.categories.slice(0,3).map(id=><button className="tag" key={id} onClick={()=>openCategory(id)}>{categoryTitle(id)}</button>)}</div></div>
      <div className="source-stats"><span>{state.notes.filter(n=>n.sourceId===s.id).length} заметок</span><button className="button outline" onClick={()=>openSource(s.id)}>{s.format==='paper'?'К записям':'Читать'} <Arrow/></button></div>
     </article>)}</div>:<Empty title="Нет подходящих материалов">Измени запрос или добавь свое издание.</Empty>}
    </section>}
   </div>
  </div>
  <p className="library-v3-foot">Демонстрационные тексты отмечены отдельно. Выбранный способ хранения определяет, на каких устройствах доступны собственные книги.</p>
  {adding&&<AddSource onClose={()=>setAdding(false)}/>}
 </main>;
}
