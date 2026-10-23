import { useRef, useState } from 'react';
import { useApp } from '../context';
import { categories, categoryTitle } from '../data';
import { Arrow, Empty, Label, Modal } from './UI';
import NoteList from './NoteList';
import { newId } from '../storage';
import { useCloud } from '../cloud';
import { useLocalBooks } from '../localBooks';

export default function Research({archive=false}:{archive?:boolean}){
 const {state,update,openResearch,openSource,openCategory,composeNote,toast}=useApp();
 const cloud=useCloud(),local=useLocalBooks();
 const [creating,setCreating]=useState(false),[title,setTitle]=useState(''),[question,setQuestion]=useState('');
 const questionRef=useRef<HTMLTextAreaElement>(null),hypothesisRef=useRef<HTMLTextAreaElement>(null),evidenceRef=useRef<HTMLElement>(null);
 const researches=state.research.filter(r=>archive?r.archived:!r.archived);
 const active=researches.find(r=>r.id===state.researchId)??researches[0];
 const notes=active?state.notes.filter(note=>note.researchId===active.id):[];
 const sourceChoices=[
  ...state.sources.map(source=>({id:source.id,title:source.title,descriptor:source.demo?'демонстрационный текст':'источник'})),
  ...local.books.map(book=>({id:book.id,title:book.title,descriptor:'книга на этом устройстве'})),
  ...(cloud.authorized?cloud.books.map(book=>({id:book.id,title:book.title,descriptor:'книга в личной библиотеке'})):[])
 ];
 const directlyLinked=Array.from(new Map(sourceChoices.map(source=>[source.id,source])).values()).filter(source=>notes.some(note=>note.sourceId===source.id));
 const related=active?state.sources.filter(source=>!directlyLinked.some(link=>link.id===source.id)&&source.categories.some(id=>active.categories.includes(id))):[];

 function create(e:React.FormEvent){e.preventDefault();if(!title.trim())return;const id=newId();update(s=>({...s,research:[...s.research,{id,title:title.trim(),question:question.trim(),hypothesis:'',categories:[],archived:false}],researchId:id}));setCreating(false);setTitle('');setQuestion('');toast('Исследовательская линия создана')}
 function edit(field:'question'|'hypothesis',value:string){if(!active)return;update(s=>({...s,research:s.research.map(r=>r.id===active.id?{...r,[field]:value,demo:false}:r)}))}
 function toggleCategory(id:string){if(!active)return;update(s=>({...s,research:s.research.map(r=>r.id===active.id?{...r,categories:r.categories.includes(id)?r.categories.filter(c=>c!==id):[...r.categories,id],demo:false}:r)}))}
 function goTo(stage:'question'|'hypothesis'|'evidence'){if(stage==='evidence'){evidenceRef.current?.scrollIntoView({block:'start'});return}const field=stage==='question'?questionRef.current:hypothesisRef.current;field?.scrollIntoView({block:'center'});field?.focus()}

 return <main className="page research-page research-v2 page-enter" id="main">
  <div className="page-topline"><Label>{archive?'Завершенные линии':'Научная лаборатория'}</Label><span>Вопрос / гипотеза / проверка</span></div>
  <div className="page-heading"><h1>{archive?'Архив':'Лаборатория'}<span className="title-period">.</span></h1>{!archive&&<button className="button primary" onClick={()=>setCreating(true)}>Новая линия +</button>}</div>

  {!researches.length?<Empty title={archive?'Архив пока свободен':'Начни с научного вопроса'}>{archive?'Линию можно перенести сюда из лаборатории. Ее записи и источники останутся доступны.':'Создай исследовательскую линию и связывай с ней записи во время чтения.'}</Empty>:
   <div className="research-v2-layout">
    <nav className="research-v2-directory" aria-label="Исследовательские линии"><span className="research-v2-rail-label">{archive?'АРХИВ /':'В РАБОТЕ /'} {String(researches.length).padStart(2,'0')}</span>{researches.map((line,index)=><button key={line.id} className={line.id===active?.id?'active':''} onClick={()=>archive?update({researchId:line.id}):openResearch(line.id)} aria-current={line.id===active?.id?'true':undefined}><span className="research-v2-directory-index">{String(index+1).padStart(2,'0')}</span><strong>{line.title}</strong><small>{line.question||'Вопрос еще не сформулирован'}</small><Arrow diagonal/></button>)}</nav>
    {active&&<article className="research-v2-work">
     <header className="research-v2-identity"><div><Label>{active.demo?'Демонстрационная линия':archive?'Архивная линия':'Рабочая линия'}</Label><span className="research-v2-identity-id">{String(researches.findIndex(r=>r.id===active.id)+1).padStart(2,'0')} / {String(researches.length).padStart(2,'0')}</span></div><h2>{active.title}</h2><p>Связанные записи: {notes.length}. Источники с прямой привязкой: {directlyLinked.length}.</p></header>
     <nav className="research-v2-sequence" aria-label="Этапы работы с исследовательской линией"><button onClick={()=>goTo('question')}><span>01</span> Вопрос</button><button onClick={()=>goTo('hypothesis')}><span>02</span> Гипотеза</button><button onClick={()=>goTo('evidence')}><span>03</span> Материалы <Arrow/></button></nav>
     <div className="research-v2-core">
      <label className="research-v2-field"><span className="research-v2-field-marker">01</span><span className="research-v2-field-intro"><b>Научный вопрос</b><small>Что именно предстоит разрешить?</small></span><textarea ref={questionRef} aria-label="Научный вопрос" value={active.question} onChange={e=>edit('question',e.target.value)} placeholder="Сформулируй вопрос исследования" rows={3}/></label>
      <label className="research-v2-field"><span className="research-v2-field-marker">02</span><span className="research-v2-field-intro"><b>Рабочая гипотеза</b><small>Какое предположение требует проверки?</small></span><textarea ref={hypothesisRef} aria-label="Рабочая гипотеза" value={active.hypothesis} onChange={e=>edit('hypothesis',e.target.value)} placeholder="Запиши предварительное предположение" rows={4}/></label>
     </div>
     <section className="research-v2-evidence" ref={evidenceRef}>
      <div className="research-v2-sectionhead"><div><span className="research-v2-section-number">03 / МАТЕРИАЛЫ</span><h3>Следы рассуждения</h3></div><button className="text-link" onClick={()=>composeNote(undefined,undefined,active.id)}>Добавить запись +</button></div>
      {notes.length?<><div className="research-v2-note-summary"><span>Тезисы <b>{notes.filter(n=>n.kind==='thesis').length}</b></span><span>Вопросы <b>{notes.filter(n=>n.kind==='question').length}</b></span><span>Другие записи <b>{notes.filter(n=>n.kind==='thought').length}</b></span></div><div className="research-v2-notes"><NoteList notes={notes}/></div></>:<p className="research-v2-empty">Пока нет записей, связанных с этой линией. Добавь наблюдение, вопрос или тезис.</p>}
     </section>
     <section className="research-v2-evidence research-v2-sources-section"><div className="research-v2-sectionhead"><div><span className="research-v2-section-number">04 / ПЕРВОИСТОЧНИКИ</span><h3>К чему вернуться</h3></div></div>
      {directlyLinked.length>0&&<div className="research-v2-sources">{directlyLinked.map((source,index)=><button key={source.id} onClick={()=>openSource(source.id)}><span>{String(index+1).padStart(2,'0')} / есть связанная заметка · {source.descriptor}</span><strong>{source.title}</strong><Arrow diagonal/></button>)}</div>}
      {related.length>0&&<details className="research-v2-related"><summary>Еще {related.length} по общим категориям</summary><p>Совпадение категории не означает, что источник подтверждает гипотезу.</p><div className="research-v2-sources">{related.map(source=><button key={source.id} onClick={()=>openSource(source.id)}><span>{source.demo?'Демонстрационный текст':'Источник'} · общая категория</span><strong>{source.title}</strong><Arrow diagonal/></button>)}</div></details>}
      {!directlyLinked.length&&!related.length&&<p className="research-v2-empty">Связанных источников пока нет. Добавь заметку к материалу во время чтения.</p>}
     </section>
     <details className="research-v2-categories"><summary>Категории линии · {active.categories.length}</summary><div className="research-v2-tags">{categories.map(category=><button key={category.id} aria-pressed={active.categories.includes(category.id)} className={active.categories.includes(category.id)?'active':''} onClick={()=>toggleCategory(category.id)}>{category.title}</button>)}</div><div className="research-v2-linked">{active.categories.map(id=><button key={id} onClick={()=>openCategory(id)}>К понятию «{categoryTitle(id)}» ↗</button>)}</div></details>
     <div className="research-v2-foot"><span>Вопрос и гипотеза сохраняются автоматически.</span><button className="text-link" onClick={()=>{update(s=>({...s,research:s.research.map(r=>r.id===active.id?{...r,archived:!r.archived}:r)}));toast(archive?'Линия возвращена в лабораторию':'Линия перенесена в архив')}}>{archive?'Вернуть в работу':'Перенести в архив'} <Arrow/></button></div>
    </article>}
   </div>}
  {creating&&<Modal title="Новая исследовательская линия" onClose={()=>setCreating(false)}><form className="composer" onSubmit={create}><label>Название<input value={title} onChange={e=>setTitle(e.target.value)} required maxLength={240} placeholder="Предмет будущего исследования"/></label><label>Исходный научный вопрос<textarea value={question} onChange={e=>setQuestion(e.target.value)} rows={4} placeholder="Какую проблему предстоит разрешить?"/></label><div className="form-actions"><button className="button primary" disabled={!title.trim()}>Создать линию →</button></div></form></Modal>}
 </main>;
}
