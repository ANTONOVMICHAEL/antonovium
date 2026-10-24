import { useState } from 'react';
import { useApp } from '../context';
import { categories } from '../data';
import type { CitationProvenance, EvidenceType, Excerpt, Note, NoteKind } from '../types';
import { newId } from '../storage';
import { Modal } from './UI';
import { useCloud } from '../cloud';
import { useLocalBooks } from '../localBooks';
import { citationLocator, createQuotation, evidenceLabels, getBibliography } from '../scientificMemory';

export default function NoteComposer({excerpt,note,researchId,onClose}:{excerpt?:Excerpt;note?:Note;researchId?:string;onClose:()=>void}){
 const {state,update,toast,setSelectedNoteId,setSelection}=useApp();
 const cloud=useCloud(),local=useLocalBooks(),originalCitation=note?.citation??excerpt?.citation,fixedSourceId=note?.sourceId??excerpt?.sourceId;
 const [title,setTitle]=useState(note?.title??''),[body,setBody]=useState(note?.body??'');
 const [kind,setKind]=useState<NoteKind>(note?.kind??'thought'),[tags,setTags]=useState<string[]>(note?.categories??[]);
 const [research,setResearch]=useState(note?.researchId??researchId??''),[locator,setLocator]=useState(note?.locator??excerpt?.locator??'');
 const [evidenceType,setEvidenceType]=useState<EvidenceType>(originalCitation?'quotation':note?.evidenceType??'note');
 const [quotationSourceId,setQuotationSourceId]=useState(fixedSourceId??''),[manualText,setManualText]=useState(''),[manualPdfPage,setManualPdfPage]=useState('');
 const [printedPage,setPrintedPage]=useState(originalCitation?.printedPage??''),[printedConfirmed,setPrintedConfirmed]=useState(originalCitation?.printedPageConfirmed??false),[verified,setVerified]=useState(originalCitation?.verification==='user-confirmed');
 const [quotationIds,setQuotationIds]=useState<string[]>(note?.quotationIds??excerpt?.quotationIds??[]),[linkQuery,setLinkQuery]=useState('');
 const sourceId=evidenceType==='quotation'?quotationSourceId:fixedSourceId;
 const materials=[...state.sources,...local.books,...cloud.books],source=materials.find(item=>item.id===sourceId);
 const titleCounts=new Map<string,number>();for(const item of materials)titleCounts.set(item.title,(titleCounts.get(item.title)??0)+1);
 const localSource=source&&(('local'in source&&source.local===true)||('localOnly'in source&&source.localOnly===true)||('deviceOnly'in source&&source.deviceOnly===true));
 const privateSourceIds=new Set([...materials.filter(item=>('local'in item&&item.local===true)||('localOnly'in item&&item.localOnly===true)||('deviceOnly'in item&&item.deviceOnly===true)).map(item=>item.id),...(state.bibliography??[]).filter(item=>item.localOnly).map(item=>item.sourceId)]);
 const newlyLinkedLocalQuote=quotationIds.some(id=>{if(note?.quotationIds?.includes(id))return false;const linked=state.notes.find(item=>item.id===id);return linked&&(linked.localOnly===true||linked.citation?.bibliography?.localOnly===true||[linked.sourceId,...linked.relatedSourceIds??[]].some(value=>value&&privateSourceIds.has(value)))});
 const localOnly=note?.localOnly===true||!note&&excerpt?.localOnly===true||(!note||sourceId!==note.sourceId)&&localSource||newlyLinkedLocalQuote?true:note?.localOnly;
 const sourceTitle=source?.title??note?.sourceTitle??excerpt?.sourceTitle??originalCitation?.bibliography?.title;
 const literal=originalCitation?.rawText??note?.quote??excerpt?.quote;
 const hasLiteral=literal!==undefined&&literal.length>0;
 const quote=evidenceType==='quotation'&&!hasLiteral?manualText:literal;
 const savedAnchor=originalCitation?.anchor??note?.fileAnchor??excerpt?.fileAnchor;
 const enteredPdfPage=Number(manualPdfPage);
 const anchor=savedAnchor??(source?.format==='pdf'&&Number.isSafeInteger(enteredPdfPage)&&enteredPdfPage>0?{format:'pdf' as const,page:enteredPdfPage}:undefined),isQuotation=evidenceType==='quotation';
 const selectedQuotes=state.notes.filter(item=>item.id!==note?.id&&(item.evidenceType==='quotation'||item.citation));
 const shownQuotes=selectedQuotes.filter(item=>`${item.title} ${item.citation?.rawText??item.quote??''}`.toLocaleLowerCase('ru').includes(linkQuery.toLocaleLowerCase('ru'))).slice(0,100);
 const emptyBodyAllowed=evidenceType==='highlight'||isQuotation;
 const legacyQuotation=note?.evidenceType==='quotation'&&!originalCitation;
 const invalid=!title.trim()||(!emptyBodyAllowed&&!body.trim())||(isQuotation&&(!sourceId&&!legacyQuotation||!quote?.trim()||source?.format==='pdf'&&!anchor?.page&&!legacyQuotation));
 function save(e:React.FormEvent){
  e.preventDefault();if(invalid)return;
  let citation:CitationProvenance|undefined=originalCitation;
  if(isQuotation){
   if(!citation&&!legacyQuotation){
    const material=source??(sourceId&&sourceTitle?{id:sourceId,title:sourceTitle}:undefined);
    if(!material){toast('Выбери конкретный источник цитаты');return}
    const selectionEvidence=!!(note?.anchors?.length||excerpt?.anchors?.length||anchor?.quote===quote);
    const value=createQuotation({source:material,rawText:quote!,anchor,bibliography:getBibliography(material,state.bibliography?.find(item=>item.sourceId===sourceId)),origin:hasLiteral&&selectionEvidence?'selection':'manual',sectionId:note?.sectionId??excerpt?.sectionId,anchors:note?.anchors??excerpt?.anchors});
    citation=value.citation;
   }
   if(citation)citation={...citation,printedPage:printedPage||undefined,printedPageConfirmed:!!printedPage&&printedConfirmed,verification:verified?'user-confirmed':'unverified'};
  }
  const linkedSources=quotationIds.flatMap(id=>{const linked=state.notes.find(item=>item.id===id);return linked?.sourceId?[linked.sourceId]:linked?.relatedSourceIds??[]});
  const relatedSourceIds=[...new Set([...(note?.relatedSourceIds??excerpt?.relatedSourceIds??[]),...(sourceId?[sourceId]:[]),...linkedSources])];
  const displayLocator=isQuotation&&citation?(anchor?.format==='fb2'?note?.locator??excerpt?.locator??citationLocator(citation):source?.format==='paper'?locator:citationLocator(citation)):locator||undefined;
  const value:Note={...excerpt,...note,id:note?.id??newId(),title:title.trim(),body,kind,evidenceType,categories:tags,researchId:research||undefined,createdAt:note?.createdAt??new Date().toISOString(),demo:false,sourceId,sourceTitle,citation,quote:isQuotation?citation?.rawText??quote:literal,fileAnchor:citation?.anchor??note?.fileAnchor??excerpt?.fileAnchor,sectionId:note?.sectionId??excerpt?.sectionId??(anchor?.format==='pdf'?`pdf:${anchor.page}`:anchor?.chapter),relatedSourceIds,quotationIds,locator:displayLocator,localOnly};
  update(s=>({...s,notes:note?s.notes.map(item=>item.id===note.id?value:item):[value,...s.notes]}));
  setSelectedNoteId(value.id);setSelection(null);window.getSelection()?.removeAllRanges();toast(isQuotation?'Цитата сохранена':'Заметка сохранена');onClose();
 }
 return <Modal title={note?(originalCitation?'Комментарий к цитате':'Редактировать заметку'):source?.format==='paper'?'Заметка по бумажному источнику':'Новая научная заметка'} onClose={onClose} wide>
  <form onSubmit={save} className="composer">
   {sourceTitle&&<div className="source-reference"><span className="eyebrow">Источник</span><strong>{sourceTitle}</strong>{source&&'demo'in source&&source.demo&&<span className="demo-label">демо</span>}</div>}
   {localOnly&&<p className="fineprint" role="status">Хранится на этом устройстве вместе с локальным источником.</p>}
   {sourceId&&!source&&<p className="fineprint" role="status">Документ сейчас недоступен. Сохраненная связь и текст записи остаются в картотеке.</p>}
   {isQuotation&&!fixedSourceId&&<label>Источник цитаты<select value={quotationSourceId} onChange={e=>{setQuotationSourceId(e.target.value);setManualPdfPage('');setPrintedPage('');setPrintedConfirmed(false);setVerified(false)}} required><option value="">Выбери конкретное издание или файл</option>{materials.map(item=><option key={item.id} value={item.id}>{item.title}{'edition'in item&&item.edition?` · ${item.edition}`:''}{'year'in item&&item.year?` · ${item.year}`:''}{'original_name'in item?` · ${item.original_name}`:''}{(titleCounts.get(item.title)??0)>1?` · ${item.id.slice(-8)}`:''}</option>)}</select></label>}
   {literal!==undefined&&literal!==''&&<div><span className="eyebrow">{isQuotation?'Буквальный текст цитаты':'Фрагмент источника'}</span><blockquote className="excerpt-quote" style={{whiteSpace:'pre-wrap'}}>{literal}</blockquote></div>}
   {isQuotation&&!hasLiteral&&<label>Текст цитаты, введенный вручную<textarea value={manualText} onChange={e=>setManualText(e.target.value)} rows={5} required maxLength={200000}/></label>}
   {isQuotation&&<p className="fineprint">{legacyQuotation?'Старая запись: происхождение текста не было зафиксировано. Текст и прежняя привязка сохраняются без изменений.':originalCitation?.origin==='manual'||!hasLiteral?'Текст введен вручную. Проверь его по оригинальному документу.':originalCitation?.origin==='extracted'?'Текст извлечен автоматически. Проверь его по оригинальному документу.':'Фрагмент сохранен из выделения. Сверь его с оригинальным документом перед цитированием.'} Комментарий хранится отдельно от буквального текста.</p>}
   {source?.format==='paper'&&<label>Страница или иной точный ориентир<input value={locator} onChange={e=>setLocator(e.target.value)} placeholder="Укажи по своему изданию, например: с. 42" required maxLength={200}/></label>}
   <label>Заголовок<input autoFocus value={title} onChange={e=>setTitle(e.target.value)} placeholder="Какую мысль важно сохранить?" required maxLength={180}/></label>
   <div className="segmented note-kinds" role="group" aria-label="Тип заметки">{([['thought','Мысль'],['thesis','Тезис'],['question','Вопрос к исследованию']] as const).map(([id,label])=><button key={id} type="button" aria-pressed={kind===id} className={kind===id?'active':''} onClick={()=>setKind(id)}>{label}</button>)}</div>
   <label>Характер записи<select value={evidenceType} disabled={!!originalCitation} onChange={e=>setEvidenceType(e.target.value as EvidenceType)}>{Object.entries(evidenceLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
   {isQuotation&&!legacyQuotation&&<>
    {source?.format==='pdf'&&!savedAnchor&&<label>Страница PDF<input type="number" min={1} step={1} value={manualPdfPage} onChange={e=>setManualPdfPage(e.target.value)} required/></label>}
    {anchor?.format==='pdf'&&<p className="fineprint">Страница PDF: {anchor.page??'не указана'}. Номер страницы издания заполняется отдельно.</p>}
    {anchor?.format==='fb2'&&<p className="fineprint">Сохранен структурный ориентир FB2. Экранная страница не является страницей печатного издания.</p>}
    {!anchor&&source?.format!=='pdf'&&<p className="fineprint">Точное место пока не сохранено. Для точной привязки открой источник и выдели фрагмент.</p>}
    {(anchor?.format==='pdf'||source?.format==='paper')&&<><label>Страница издания<input value={printedPage} maxLength={60} onChange={e=>{setPrintedPage(e.target.value);setPrintedConfirmed(false)}} placeholder="Только по проверенному изданию"/></label><label className="checkbox-label"><input type="checkbox" checked={printedConfirmed} disabled={!printedPage} onChange={e=>setPrintedConfirmed(e.target.checked)}/>Номер страницы издания проверен по документу</label></>}
    <label className="checkbox-label"><input type="checkbox" checked={verified} onChange={e=>setVerified(e.target.checked)}/>Буквальный текст сверен с оригиналом</label>
   </>}
   <label>{evidenceType==='highlight'?'Комментарий к выделению':isQuotation?'Собственный комментарий к цитате':'Собственная запись'}<textarea value={body} onChange={e=>setBody(e.target.value)} placeholder="Позиция, сомнение, аргумент или направление поиска…" required={!emptyBodyAllowed} rows={5}/></label>
   {!isQuotation&&selectedQuotes.length>0&&<details><summary>Связать с цитатами · {quotationIds.length}</summary><label>Найти сохраненную цитату<input value={linkQuery} onChange={e=>setLinkQuery(e.target.value)} type="search"/></label><div className="tag-picker" style={{maxHeight:240,overflowY:'auto'}}>{shownQuotes.map(item=><button type="button" key={item.id} className={`tag ${quotationIds.includes(item.id)?'selected':''}`} aria-pressed={quotationIds.includes(item.id)} onClick={()=>setQuotationIds(ids=>ids.includes(item.id)?ids.filter(id=>id!==item.id):[...ids,item.id])}>{item.title}</button>)}</div>{selectedQuotes.length>100&&<p className="fineprint">Для длинной подборки уточни поиск: показано до 100 цитат.</p>}</details>}
   <fieldset><legend>Связать с категориями</legend><div className="tag-picker">{categories.map(c=><button type="button" key={c.id} className={`tag ${tags.includes(c.id)?'selected':''}`} aria-pressed={tags.includes(c.id)} onClick={()=>setTags(tags.includes(c.id)?tags.filter(id=>id!==c.id):[...tags,c.id])}>{c.title}</button>)}</div></fieldset>
   <label>Исследовательская линия<select value={research} onChange={e=>setResearch(e.target.value)}><option value="">Без привязки к исследованию</option>{state.research.filter(r=>!r.archived).map(r=><option key={r.id} value={r.id}>{r.title}</option>)}</select></label>
   <div className="form-actions"><span className="fineprint">{sourceId?'Связь с источником сохранится вместе с записью.':'Свободная запись. Источник не задан.'}</span><button type="button" className="text-button" onClick={onClose}>Отмена</button><button className="button primary" type="submit" disabled={invalid}>Сохранить →</button></div>
  </form>
 </Modal>;
}
