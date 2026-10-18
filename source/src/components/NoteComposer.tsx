import { useState } from 'react';
import { useApp } from '../context';
import { categories } from '../data';
import type { Excerpt, Note, NoteKind } from '../types';
import { newId } from '../storage';
import { Modal } from './UI';
import {useCloud} from '../cloud';
export default function NoteComposer({excerpt,note,researchId,onClose}:{excerpt?:Excerpt;note?:Note;researchId?:string;onClose:()=>void}){
 const {state,update,toast,setSelectedNoteId,setSelection}=useApp();
 const [title,setTitle]=useState(note?.title??'');const[body,setBody]=useState(note?.body??'');
 const[kind,setKind]=useState<NoteKind>(note?.kind??'thought');const[tags,setTags]=useState<string[]>(note?.categories??[]);
 const[research,setResearch]=useState(note?.researchId??researchId??'');const[locator,setLocator]=useState(note?.locator??excerpt?.locator??'');
 const sourceId=note?.sourceId??excerpt?.sourceId;const cloud=useCloud();const book=cloud.books.find(b=>b.id===sourceId);const source=state.sources.find(x=>x.id===sourceId)??(book?{title:book.title,format:'digital',demo:false}:undefined);const[evidenceType,setEvidenceType]=useState<NonNullable<Note['evidenceType']>>(note?.evidenceType??'note');
 const quote=note?.quote??excerpt?.quote;
 function save(e:React.FormEvent){e.preventDefault();if(!body.trim()||!title.trim())return;
 const value:Note={...excerpt,...note,id:note?.id??newId(),title:title.trim(),body:body.trim(),kind,evidenceType,categories:tags,researchId:research||undefined,createdAt:note?.createdAt??new Date().toISOString(),demo:false,locator:locator.trim()||undefined};
 update(s=>({...s,notes:note?s.notes.map(n=>n.id===note.id?value:n):[value,...s.notes]}));setSelectedNoteId(value.id);setSelection(null);window.getSelection()?.removeAllRanges();toast('Заметка сохранена');onClose();}
 return <Modal title={note?'Редактировать заметку':source?.format==='paper'?'Заметка по бумажному источнику':'Новая научная заметка'} onClose={onClose} wide>
 <form onSubmit={save} className="composer">
  {source&&<div className="source-reference"><span className="eyebrow">Источник</span><strong>{source.title}</strong>{source.demo&&<span className="demo-label">демо</span>}</div>}
  {quote&&<blockquote className="excerpt-quote">{quote}</blockquote>}
  {source?.format==='paper'&&<label>Страница или иной точный ориентир<input value={locator} onChange={e=>setLocator(e.target.value)} placeholder="Укажи по своему изданию, например: с. 42" required maxLength={200}/></label>}
  <label>Заголовок<input autoFocus value={title} onChange={e=>setTitle(e.target.value)} placeholder="Какую мысль важно сохранить?" required maxLength={180}/></label>
  <div className="segmented note-kinds" role="group" aria-label="Тип заметки">{([['thought','Мысль'],['thesis','Тезис'],['question','Вопрос к исследованию']] as const).map(([id,label])=><button key={id} type="button" aria-pressed={kind===id} className={kind===id?'active':''} onClick={()=>setKind(id)}>{label}</button>)}</div>
  {book&&<label>Характер записи<select value={evidenceType} onChange={e=>setEvidenceType(e.target.value as NonNullable<Note['evidenceType']>)}><option value="note">Собственная научная заметка</option><option value="interpretation">Интерпретация</option><option value="hypothesis">Исследовательская гипотеза</option><option value="quotation">Точная цитата</option></select></label>}
  <label>Собственная запись<textarea value={body} onChange={e=>setBody(e.target.value)} placeholder="Позиция, сомнение, аргумент или направление поиска…" required rows={5}/></label>
  <fieldset><legend>Связать с категориями</legend><div className="tag-picker">{categories.map(c=><button type="button" key={c.id} className={`tag ${tags.includes(c.id)?'selected':''}`} aria-pressed={tags.includes(c.id)} onClick={()=>setTags(tags.includes(c.id)?tags.filter(x=>x!==c.id):[...tags,c.id])}>{c.title}</button>)}</div></fieldset>
  <label>Исследовательская линия<select value={research} onChange={e=>setResearch(e.target.value)}><option value="">Без привязки к исследованию</option>{state.research.filter(r=>!r.archived).map(r=><option key={r.id} value={r.id}>{r.title}</option>)}</select></label>
  <div className="form-actions"><span className="fineprint">{source?'Связь с источником сохранится вместе с записью.':'Свободная запись. Источник не задан.'}</span><button type="button" className="text-button" onClick={onClose}>Отмена</button><button className="button primary" type="submit" disabled={!title.trim()||!body.trim()}>Сохранить заметку →</button></div>
 </form></Modal>;
}
