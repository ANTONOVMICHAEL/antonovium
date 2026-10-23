import { useEffect, useRef, useState } from 'react';
import { useApp } from '../context';
import { useCloud } from '../cloud';
import { downloadFile } from '../storage';
import { Arrow, Label } from './UI';
import type { Note } from '../types';

export default function Manuscripts(){
 const {state,update,toast,openSource}=useApp();
 const cloud=useCloud();
 const [showNotes,setShowNotes]=useState(true),[focus,setFocus]=useState(false),[noteQuery,setNoteQuery]=useState('');
 const [columnWidth,setColumnWidth]=useState(()=>{const width=Number(localStorage.getItem('antonovium.manuscript.width'));return width>=580&&width<=940?width:740});
 const editor=useRef<HTMLTextAreaElement>(null),caret=useRef({start:-1,end:-1});
 const isDemo=state.manuscript.startsWith('Демонстрационная рукопись');
 const notes=state.notes.filter(note=>`${note.title} ${note.body}`.toLocaleLowerCase('ru').includes(noteQuery.trim().toLocaleLowerCase('ru'))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt));
 useEffect(()=>{document.documentElement.classList.toggle('manuscript-focus',focus);return()=>document.documentElement.classList.remove('manuscript-focus')},[focus]);
 useEffect(()=>{if(!focus)return;const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setFocus(false)};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key)},[focus]);
 function insert(note:Note){
  const at=caret.current.start>=0&&caret.current.start<=state.manuscript.length?caret.current:{start:state.manuscript.length,end:state.manuscript.length};
  const insertion=`\n\n${note.demo?'[Демонстрационная заметка] ':''}${note.title}\n${note.body}\n`;
  update(s=>({...s,manuscript:s.manuscript.slice(0,at.start)+insertion+s.manuscript.slice(at.end)}));
  const pos=at.start+insertion.length;caret.current={start:pos,end:pos};
  requestAnimationFrame(()=>{editor.current?.focus();editor.current?.setSelectionRange(pos,pos)});
  toast('Запись вставлена в рукопись');
 }
 return <main className={`page manuscript-page manuscript-v2 page-enter ${focus?'editor-focus':''}`} id="main">
  <div className="page-topline"><Label>Научный редактор</Label><span>{isDemo?'Демонстрационная заготовка':'Моя рукопись'}</span></div>
  <div className="manuscript-v2-top"><div><Label>Текст в работе</Label><h1>Рукопись<span className="title-period">.</span></h1></div><div className="manuscript-v2-actions"><button className="text-link" onClick={()=>setFocus(v=>!v)} aria-pressed={focus}>{focus?'Выйти из режима письма':'Режим письма'}</button><button className="text-link" onClick={()=>setShowNotes(v=>!v)} aria-pressed={showNotes}>{showNotes?'Скрыть записи':'Показать записи'}</button><button className="button outline" onClick={()=>{downloadFile('ANTONOVIUM_Manuscript.md',`# ${state.manuscriptTitle}\n\n${state.manuscript}`);toast('Рукопись экспортирована')}}>Экспорт текста <Arrow diagonal/></button></div></div>
  <div className="manuscript-v2-settings"><label>Ширина строки <input aria-label="Ширина текстовой колонки" type="range" min="580" max="940" step="20" value={columnWidth} onChange={e=>{const width=Number(e.target.value);setColumnWidth(width);localStorage.setItem('antonovium.manuscript.width',String(width))}}/></label><span>Текст и заголовок сохраняются по мере набора</span></div>
  <div className={`manuscript-v2-layout ${showNotes&&!focus?'with-notes':''}`}>
   <section className="manuscript-v2-sheet" aria-label="Текст рукописи" style={{'--manuscript-width':`${columnWidth}px`} as React.CSSProperties}>
    <label className="sr-only" htmlFor="manuscript-title">Название рукописи</label><textarea id="manuscript-title" className="manuscript-v2-title" rows={2} value={state.manuscriptTitle} onChange={e=>update({manuscriptTitle:e.target.value})} placeholder="Название рукописи" maxLength={240}/>
    <div className="manuscript-v2-rule"/>
    <label className="sr-only" htmlFor="manuscript-body">Текст рукописи</label><textarea ref={editor} id="manuscript-body" className="manuscript-v2-body" value={state.manuscript} onChange={e=>update({manuscript:e.target.value})} onSelect={e=>{caret.current={start:e.currentTarget.selectionStart,end:e.currentTarget.selectionEnd}}} spellCheck style={{fontSize:state.fontSize,lineHeight:state.lineHeight}} placeholder="Начни писать…"/>
    <div className="manuscript-v2-foot"><span className="save-indicator"/><span>Автосохранение на этом устройстве</span>{cloud.authorized&&<span>· Облако: {cloud.status||'состояние синхронизации уточняется'}</span>}</div>
   </section>
   {showNotes&&!focus&&<aside className="manuscript-v2-notes" aria-label="Исследовательские записи"><div className="manuscript-v2-noteshead"><Label>Рядом с текстом</Label><h2>Записи</h2><p>Вставь заметку в позицию курсора или вернись к ее источнику.</p><input type="search" value={noteQuery} onChange={e=>setNoteQuery(e.target.value)} placeholder="Поиск по записям" aria-label="Поиск по записям"/></div><div className="manuscript-v2-notelist">{notes.length?notes.map(note=><article key={note.id} className="manuscript-v2-note"><span>{note.demo?'Демонстрационная запись':'Собственная запись'} · {note.kind==='thesis'?'тезис':note.kind==='question'?'вопрос':'мысль'}</span><h3>{note.title}</h3>{note.body&&<p>{note.body}</p>}<div><button onClick={()=>insert(note)}>Вставить в текст <Arrow/></button>{note.sourceId&&<button onClick={()=>openSource(note.sourceId!,note.sectionId,note.anchors?.[0]?.paragraphId)}>Открыть источник ↗</button>}</div></article>):<p className="manuscript-v2-empty">Записей по запросу пока нет.</p>}</div></aside>}
  </div>
 </main>
}
