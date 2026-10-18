import { useApp } from '../context';
import { categoryTitle } from '../data';
import type { Note } from '../types';
import { Empty } from './UI';
export default function NoteList({notes,compact=false}:{notes:Note[];compact?:boolean}){
 const{state,selectedNoteId,setSelectedNoteId,openSource,openNote,composeNote,openCategory,openResearch}=useApp();
 if(!notes.length)return <Empty title="Здесь появятся твои заметки">Выдели фрагмент документа и выбери «Заметка». Запись сохранит связь с текстом.</Empty>;
 return <div className={`note-list ${compact?'compact':''}`}>{notes.map(note=><article key={note.id} id={`note-${note.id}`} className={`note-item ${selectedNoteId===note.id?'selected':''}`} onClick={()=>setSelectedNoteId(note.id)}>
 <div className="note-meta"><span>{note.evidenceType==='highlight'?'Выделение':({thought:'Мысль',thesis:'Тезис',question:'Вопрос к исследованию'})[note.kind]}</span>{note.demo&&<span className="demo-label">пример</span>}</div>
 <button className="note-title" onClick={()=>{setSelectedNoteId(note.id);if(compact)openNote(note)}}>{note.title}</button>
 {!compact&&note.quote&&<button className="quote-link" onClick={()=>note.fileAnchor?openNote(note):openSource(note.sourceId!,note.sectionId,note.anchors?.[0]?.paragraphId)}><span>{note.locator??'К фрагменту источника'} ↗</span><q>{note.quote}</q></button>}
 {note.body&&<p>{note.body}</p>}
 {!compact&&<><div className="tags">{note.categories.map(id=><button className="tag" key={id} onClick={()=>openCategory(id)}>{categoryTitle(id)}</button>)}</div>{note.researchId&&<button className="small-link" onClick={()=>openResearch(note.researchId!)}>Линия: {state.research.find(r=>r.id===note.researchId)?.title} ↗</button>}<button className="small-link note-edit" onClick={()=>composeNote(undefined,note)}>{note.evidenceType==='highlight'&&!note.body?'Добавить комментарий':'Изменить запись'}</button></>}
 </article>)}</div>;
}
