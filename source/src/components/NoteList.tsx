import { useApp } from '../context';
import { useCloud } from '../cloud';
import { useLocalBooks } from '../localBooks';
import { categoryTitle } from '../data';
import type { Note } from '../types';
import { citationLocator, evidenceLabels, formatBibliography, formatCitation, getBibliography } from '../scientificMemory';
import { Empty } from './UI';

export default function NoteList({notes,compact=false}:{notes:Note[];compact?:boolean}){
 const{state,selectedNoteId,setSelectedNoteId,openSource,openNote,composeNote,openCategory,openResearch,toast}=useApp();
 const cloud=useCloud(),local=useLocalBooks(),materials=[...state.sources,...local.books,...cloud.books];
 async function copy(text:string){try{await navigator.clipboard.writeText(text);toast('Скопировано')}catch{toast('Браузер не разрешил копирование. Выдели нужный текст вручную.')}}
 if(!notes.length)return <Empty title="Здесь появятся твои заметки">Выдели фрагмент документа и выбери «Заметка» или «Сохранить цитату». Запись сохранит связь с источником.</Empty>;
 return <div className={`note-list ${compact?'compact':''}`}>{notes.map(note=>{
  const source=materials.find(item=>item.id===note.sourceId);
  const bibliography=state.bibliography?.find(item=>item.sourceId===note.sourceId)??note.citation?.bibliography??(source?getBibliography(source):undefined);
  const literal=note.citation?.rawText??note.quote,available=!!source;
  const locator=note.citation?(note.citation.anchor?.format==='fb2'&&note.locator?note.locator:citationLocator(note.citation)):note.locator??'К фрагменту источника';
  const label=note.evidenceType?evidenceLabels[note.evidenceType]:({thought:'Мысль',thesis:'Тезис',question:'Вопрос к исследованию'})[note.kind];
  function original(){if(!available){composeNote(undefined,note);return}if(note.fileAnchor||note.citation?.anchor)openNote(note);else openSource(note.sourceId!,note.sectionId,note.anchors?.[0]?.paragraphId)}
  return <article key={note.id} id={`note-${note.id}`} className={`note-item ${selectedNoteId===note.id?'selected':''}`} onClick={()=>setSelectedNoteId(note.id)}>
   <div className="note-meta"><span>{label}</span>{note.localOnly&&<span>На этом устройстве</span>}{note.demo&&<span className="demo-label">пример</span>}</div>
   <button className="note-title" onClick={()=>{setSelectedNoteId(note.id);if(compact){if(note.sourceId&&available)openNote(note);else composeNote(undefined,note)}}}>{note.title}</button>
   {!compact&&literal&&<button className="quote-link" onClick={original} disabled={!!note.sourceId&&!available}><span>{available?`${locator} ↗`:'Документ недоступен; текст цитаты сохранен'}</span><q style={{whiteSpace:'pre-wrap'}}>{literal}</q></button>}
   {!compact&&note.citation&&<p className="fineprint">{note.citation.origin==='manual'?'Введено вручную':note.citation.origin==='extracted'?'Извлечено автоматически':'Сохранено из выделения'} · {note.citation.verification==='user-confirmed'?'сверено пользователем':'требует сверки с документом'}</p>}
   {note.body&&<>{!compact&&note.citation&&<span className="eyebrow">Собственный комментарий</span>}<p style={{whiteSpace:'pre-wrap'}}>{note.body}</p></>}
   {!compact&&<>
    {note.sourceId&&!available&&<p className="fineprint">Источник сейчас недоступен. Запись и ее библиографические сведения сохранены.</p>}
    {note.citation&&bibliography&&<p className="fineprint">{formatBibliography(bibliography,state.bibliographicTemplates?.bibliography??state.bibliographyTemplate)}</p>}
    {literal&&<div className="tags">
     <button className="small-link" onClick={()=>void copy(literal)}>Скопировать цитату</button>
     {bibliography&&<button className="small-link" onClick={()=>{void copy(formatBibliography(bibliography,state.bibliographicTemplates?.bibliography??state.bibliographyTemplate))}}>Сведения об источнике</button>}
     <button className="small-link" onClick={()=>{void copy(formatCitation(note,bibliography,state.bibliographicTemplates?.citation,state.bibliographicTemplates?.bibliography??state.bibliographyTemplate))}}>Цитата со ссылкой</button>
    </div>}
    {!!note.quotationIds?.length&&<div className="tags">{note.quotationIds.map(id=>{const linked=state.notes.find(item=>item.id===id);return linked?<button className="small-link" key={id} onClick={()=>openNote(linked)}>Цитата: {linked.title} ↗</button>:<span className="fineprint" key={id}>Связанная цитата недоступна</span>})}</div>}
    <div className="tags">{note.categories.map(id=><button className="tag" key={id} onClick={()=>openCategory(id)}>{categoryTitle(id)}</button>)}</div>
    {note.researchId&&<button className="small-link" onClick={()=>openResearch(note.researchId!)}>Линия: {state.research.find(item=>item.id===note.researchId)?.title??'недоступна'} ↗</button>}
    <button className="small-link note-edit" onClick={()=>composeNote(undefined,note)}>{note.evidenceType==='highlight'&&!note.body?'Добавить комментарий':note.citation?'Комментарий и сверка цитаты':'Изменить запись'}</button>
   </>}
  </article>;
 })}</div>;
}
