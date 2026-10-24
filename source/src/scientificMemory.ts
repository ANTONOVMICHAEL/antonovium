import type {Book,FileAnchor} from './cloud';
import type {BibliographicRecord,BibliographicSourceType,CitationProvenance,DeskTextAnchor,EvidenceType,Note,SavedState,Source} from './types';
export type {BibliographicRecord,BibliographicSourceType,CitationProvenance,EvidenceType} from './types';

export const bibliographyFields = [
 ['title','Полное название'],['authors','Авторы'],['subtitle','Подзаголовок'],['editor','Редактор'],
 ['volume','Том'],['edition','Сведения об издании'],['place','Место издания'],['publisher','Издательство'],
 ['year','Год'],['extent','Объем'],['isbn','ISBN'],['doi','DOI'],['containerTitle','Журнал или сборник'],
 ['issue','Выпуск'],['pages','Страницы публикации'],['url','URL'],['accessedAt','Дата обращения'],['notes','Исследовательские примечания']
] as const;
export const sourceTypeLabels:Record<BibliographicSourceType,string>={monograph:'Монография',textbook:'Учебник',article:'Статья',chapter:'Глава издания','legal-act':'Нормативный акт','court-document':'Судебный документ',other:'Другой источник'};
export const evidenceLabels:Record<EvidenceType,string>={note:'Заметка',interpretation:'Интерпретация',hypothesis:'Гипотеза',quotation:'Цитата',highlight:'Выделение',argument:'Аргумент',objection:'Возражение',conclusion:'Научный вывод'};
const stringFields=bibliographyFields.map(([key])=>key).filter(key=>key!=='authors');
const own=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const now=()=>new Date().toISOString();
const identifier=()=>{if(crypto.randomUUID)return crypto.randomUUID();const values=new Uint32Array(4);crypto.getRandomValues(values);return Array.from(values,n=>n.toString(16).padStart(8,'0')).join('-')};
export type BibliographicSource = Pick<Source,'id'|'title'> & Partial<Pick<Source,'author'|'subtitle'|'year'|'localOnly'>> & Partial<Pick<Book,'edition'|'fingerprint'|'local'>> & {deviceOnly?:boolean};

/** Catalog data describes this specific file/source, never a title-matched edition. */
export function getBibliography(source:BibliographicSource,stored?:BibliographicRecord):BibliographicRecord {
 if(stored&&stored.id===source.id&&stored.sourceId===source.id)return {...structuredClone(stored),localOnly:source.local===true||source.deviceOnly===true||source.localOnly===true?true:stored.localOnly};
 // Source.subtitle is historically an interface description, not publication metadata.
 const fields={title:source.title,authors:source.author?[source.author]:[],year:source.year||undefined,edition:source.edition||undefined};
 const provenance:BibliographicRecord['provenance']={};
 for(const [key,value]of Object.entries(fields))if(Array.isArray(value)?value.length:!!value)provenance[key]='auto';
 return {id:source.id,sourceId:source.id,sourceType:'other',...fields,provenance,confirmedFields:[],updatedAt:now(),localOnly:source.local===true||source.deviceOnly===true||source.localOnly===true?true:undefined};
}

/** Only supplied document metadata fills blank unconfirmed fields. */
export function applyExtractedBibliography(record:BibliographicRecord,metadata:Partial<BibliographicRecord>):BibliographicRecord {
 const next=structuredClone(record);let changed=false;
 for(const [key]of bibliographyFields){
  const value=metadata[key];
  if(next.confirmedFields.includes(key)||next.provenance[key]==='user'||(Array.isArray(next[key])?next[key].length:next[key]))continue;
  if(key==='authors'&&Array.isArray(value)&&value.length&&value.every(v=>typeof v==='string')){next.authors=[...value];next.provenance[key]='auto';changed=true}
  else if(typeof value==='string'&&value){(next as unknown as Record<string,unknown>)[key]=value;next.provenance[key]='auto';changed=true}
 }
 if(changed)next.updatedAt=now();return changed?next:record;
}

export function confirmBibliographicField(record:BibliographicRecord,field:string,value:string|string[]):BibliographicRecord {
 if(!bibliographyFields.some(([key])=>key===field))throw Error('Неизвестное поле библиографии');
 const next=structuredClone(record);(next as unknown as Record<string,unknown>)[field]=field==='authors'?(Array.isArray(value)?value:[value]).filter(Boolean):Array.isArray(value)?value.join('; '):value;
 next.provenance[field]='user';next.confirmedFields=[...new Set([...next.confirmedFields,field])];next.updatedAt=now();return next;
}

export interface QuotationInput {
 source:BibliographicSource; rawText:string; anchor?:FileAnchor; bibliography?:BibliographicRecord;
 origin?:CitationProvenance['origin']; contextBefore?:string; contextAfter?:string;
 normalizedText?:string; printedPage?:string; printedPageConfirmed?:boolean;
 sectionId?:string; anchors?:Note['anchors']; comment?:string; categories?:string[]; researchId?:string;
}
/** Literal text is stored byte-for-byte; comments are an independent field. */
export function createQuotation(input:QuotationInput):Note {
 if(!input.rawText.length)throw Error('Выдели или введи текст цитаты');
 if(input.rawText.length>200000)throw Error('Слишком большой фрагмент цитаты');
 const anchor=input.anchor?structuredClone(input.anchor):undefined;
 if(anchor&&!validFileAnchor(anchor))throw Error('Некорректный ориентир цитаты');
 const bibliography=getBibliography(input.source,input.bibliography),savedAt=now();
 const citation:CitationProvenance={sourceId:input.source.id,editionId:bibliography.id,fingerprint:input.source.fingerprint,bibliography,origin:input.origin??'selection',rawText:input.rawText,anchor,contextBefore:input.contextBefore,contextAfter:input.contextAfter,normalizedText:input.normalizedText,printedPage:input.printedPage,printedPageConfirmed:input.printedPageConfirmed===true,verification:'unverified',savedAt};
 return {id:identifier(),sourceId:input.source.id,sourceTitle:input.source.title,sectionId:input.sectionId??anchor?.chapter??(anchor?.format==='pdf'?`pdf:${anchor.page}`:''),quote:input.rawText,anchors:input.anchors??[],fileAnchor:anchor,locator:citationLocator(citation),citation,title:input.rawText.replace(/\s+/g,' ').slice(0,100),body:input.comment??'',kind:'thought',evidenceType:'quotation',categories:[...input.categories??[]],researchId:input.researchId,relatedSourceIds:[input.source.id],createdAt:savedAt,demo:false,localOnly:input.source.local===true||input.source.deviceOnly===true||input.source.localOnly===true?true:undefined};
}

export function citationLocator(citation:CitationProvenance):string {
 const a=citation.anchor;
 if(a?.format==='pdf')return [a.page?`Страница PDF ${a.page}`:'PDF',citation.printedPage&&citation.printedPageConfirmed?`Страница издания ${citation.printedPage}`:''].filter(Boolean).join('; ');
 if(a?.format==='fb2')return [a.chapter?`Раздел ${a.chapter}`:'FB2',a.paragraph?`абзац ${a.paragraph}`:'',a.offset!==undefined?`смещение ${a.offset}`:'',citation.printedPage&&citation.printedPageConfirmed?`Страница издания ${citation.printedPage}`:''].filter(Boolean).join(', ');
 return citation.printedPage&&citation.printedPageConfirmed?`Страница издания ${citation.printedPage}`:'Текстовый источник';
}

export const defaultBibliographyTemplate='{authors}{title}{subtitle}{editor}{volume}{edition}{publication}{container}{extent}{identifiers}{url}';
export const bibliographyTemplateFields=['authors','title','subtitle','editor','volume','edition','publication','container','extent','identifiers','url','year','place','publisher','isbn','doi','pages','issue','containerTitle','accessedAt'] as const;
export function formatBibliography(record:BibliographicRecord,template=defaultBibliographyTemplate):string {
 const publication=[record.place,record.publisher].filter(Boolean).join(': ');
 const container=record.containerTitle?[record.containerTitle,record.year,record.issue?`Вып. ${record.issue}`:'',record.pages?`С. ${record.pages}`:''].filter(Boolean).join('. '):'';
 const values:Record<string,string>={authors:record.authors.length?`${record.authors.join('; ')}. `:'',title:record.title,subtitle:record.subtitle?`: ${record.subtitle}`:'',editor:record.editor?` / ${record.editor}`:'',volume:record.volume?`. Т. ${record.volume}`:'',edition:record.edition?`. ${record.edition}`:'',publication:publication||(!record.containerTitle&&record.year)?`. ${[publication,!record.containerTitle?record.year:''].filter(Boolean).join(', ')}`:'',container:container?` // ${container}`:'',extent:record.extent?`. ${record.extent}`:'',identifiers:[record.isbn?`ISBN ${record.isbn}`:'',record.doi?`DOI ${record.doi}`:''].filter(Boolean).map(v=>`. ${v}`).join(''),url:record.url?`. URL: ${record.url}${record.accessedAt?` (дата обращения: ${record.accessedAt})`:''}`:''};
 for(const key of bibliographyTemplateFields)if(!(key in values))values[key]=typeof record[key as keyof BibliographicRecord]==='string'?record[key as keyof BibliographicRecord] as string:'';
 return template.replace(/\{([A-Za-z]+)\}/g,(_,key:string)=>values[key]??'').trim();
}

export const defaultCitationTemplate='{quote}\n\n{source}{locator}';
export function formatCitation(note:Note,record?:BibliographicRecord,template=defaultCitationTemplate,bibliographyTemplate?:string):string {
 const literal=note.citation?.rawText??note.quote??'';
 const bibliography=record&&record.sourceId===note.sourceId&&(!note.citation||record.id===note.citation.editionId)?record:note.citation?.bibliography;
 const description=bibliography?formatBibliography(bibliography,bibliographyTemplate):note.sourceTitle??'';
 let locator=note.citation?citationLocator(note.citation):note.fileAnchor?.format==='pdf'?`Страница PDF ${note.fileAnchor.page??''}`:note.fileAnchor?.format==='fb2'?`Раздел ${note.fileAnchor.chapter??''}; абзац ${note.fileAnchor.paragraph??''}`:note.locator??'';
 if(note.citation?.anchor?.format==='fb2'&&note.locator&&note.locator!==locator)locator=`${note.locator}; ${locator}`;
 if(note.citation&&!note.citation.anchor&&locator==='Текстовый источник'&&note.locator)locator=`Ориентир пользователя: ${note.locator}`;
 const values:Record<string,string>={quote:literal,source:description,locator:locator?`${description?'. ':''}${locator}`:''};
 return template.replace(/\{(quote|source|locator)\}/g,(_,key:string)=>values[key]);
}
export function exportBibliography(records:BibliographicRecord[],template?:string):string{return records.map(r=>formatBibliography(r,template)).join('\n\n')}
export function exportQuotations(notes:Note[],records:BibliographicRecord[]=[],template?:string,bibliographyTemplate?:string):string{return notes.filter(n=>n.evidenceType==='quotation'||n.citation).map(n=>formatCitation(n,records.find(r=>r.sourceId===n.sourceId),template,bibliographyTemplate)).join('\n\n---\n\n')}
export function exportBibliographyCSV(records:BibliographicRecord[]):string {
 const fields=['id','sourceType',...bibliographyFields.map(([key])=>key),'workId'] as const;
 const cell=(v:unknown)=>{const text=Array.isArray(v)?v.join('; '):String(v??'');return `"${(/^[=+@\-\t\r]/.test(text)?"'"+text:text).replace(/"/g,'""')}"`};
 return '\ufeff'+[fields.map(cell).join(','),...records.map(record=>fields.map(key=>cell(record[key])).join(','))].join('\r\n');
}

export function validFileAnchor(v:unknown):v is FileAnchor {
 if(!own(v)||!['pdf','fb2'].includes(v.format as string))return false;
 for(const key of ['page','offset','endOffset'])if(v[key]!==undefined&&(!Number.isSafeInteger(v[key])||Number(v[key])<(key==='page'?1:0)))return false;
 for(const key of ['chapter','paragraph','endParagraph','quote','prefix'])if(v[key]!==undefined&&(typeof v[key]!=='string'||(v[key] as string).length>200000))return false;
 if(v.fraction!==undefined&&(typeof v.fraction!=='number'||!Number.isFinite(v.fraction)||v.fraction<0||v.fraction>1))return false;
 if(v.rects!==undefined&&(!Array.isArray(v.rects)||v.rects.length>200||v.rects.some(rect=>!Array.isArray(rect)||rect.length!==4||rect.some(n=>typeof n!=='number'||!Number.isFinite(n)||n<0||n>1))))return false;
 return true;
}
export function validBibliography(v:unknown):v is BibliographicRecord {
 if(!own(v)||typeof v.id!=='string'||!v.id||v.sourceId!==v.id||typeof v.title!=='string'||!Array.isArray(v.authors)||v.authors.some(a=>typeof a!=='string')||!Object.keys(sourceTypeLabels).includes(v.sourceType as string)||!own(v.provenance)||!Array.isArray(v.confirmedFields)||v.confirmedFields.some(f=>typeof f!=='string')||typeof v.updatedAt!=='string')return false;
 if(v.workId!==undefined&&typeof v.workId!=='string')return false;
 if(v.localOnly!==undefined&&typeof v.localOnly!=='boolean')return false;
 if(stringFields.some(field=>v[field]!==undefined&&typeof v[field]!=='string'))return false;
 if(v.previousVersions!==undefined&&(!Array.isArray(v.previousVersions)||v.previousVersions.length>10000||v.previousVersions.some(previous=>!own(previous)||previous.previousVersions!==undefined||!validBibliography(previous))))return false;
 return Object.values(v.provenance).every(p=>p==='auto'||p==='user');
}
export function validCitation(v:unknown,sourceId?:string,quote?:string):v is CitationProvenance {
 if(!own(v)||typeof v.sourceId!=='string'||sourceId!==undefined&&v.sourceId!==sourceId||v.editionId!==v.sourceId||typeof v.rawText!=='string'||quote!==undefined&&v.rawText!==quote||!['selection','extracted','manual'].includes(v.origin as string)||!['unverified','user-confirmed'].includes(v.verification as string)||typeof v.savedAt!=='string')return false;
 if(v.bibliography!==undefined&&(!validBibliography(v.bibliography)||v.bibliography.id!==v.editionId||v.bibliography.sourceId!==v.sourceId))return false;
 if(v.anchor!==undefined&&!validFileAnchor(v.anchor))return false;
 for(const key of ['fingerprint','normalizedText','contextBefore','contextAfter','printedPage'])if(v[key]!==undefined&&typeof v[key]!=='string')return false;
 return v.printedPageConfirmed===undefined||typeof v.printedPageConfirmed==='boolean';
}
export function validMemoryNote(note:Note):boolean {
 return (note.localOnly===undefined||typeof note.localOnly==='boolean')&&(note.sourceId===undefined||typeof note.sourceId==='string')&&(note.quote===undefined||typeof note.quote==='string')&&(note.anchors===undefined||Array.isArray(note.anchors)&&note.anchors.every(a=>a&&typeof a.paragraphId==='string'&&Number.isSafeInteger(a.start)&&Number.isSafeInteger(a.end)&&a.start>=0&&a.end>=a.start))&&(note.citation===undefined||validCitation(note.citation,note.sourceId,note.quote))&&(note.fileAnchor===undefined||validFileAnchor(note.fileAnchor))&&(note.relatedSourceIds===undefined||Array.isArray(note.relatedSourceIds)&&note.relatedSourceIds.length<=1000&&note.relatedSourceIds.every(s=>typeof s==='string'))&&(note.quotationIds===undefined||Array.isArray(note.quotationIds)&&note.quotationIds.length<=1000&&note.quotationIds.every(s=>typeof s==='string'))&&(note.evidenceType===undefined||Object.keys(evidenceLabels).includes(note.evidenceType));
}
export function validTextAnchor(value:unknown):value is DeskTextAnchor {
 return own(value)&&typeof value.paragraphId==='string'&&Number.isSafeInteger(value.start)&&Number.isSafeInteger(value.end)&&Number(value.start)>=0&&Number(value.end)>=Number(value.start)&&(value.quote===undefined||typeof value.quote==='string')&&(value.sectionId===undefined||typeof value.sectionId==='string');
}
export function validDesk(value:unknown):value is NonNullable<SavedState['desk']> {
 if(!own(value)||typeof value.leftId!=='string'||typeof value.rightId!=='string'||typeof value.ratio!=='number'||!Number.isFinite(value.ratio)||value.ratio<.3||value.ratio>.7||!['left','right'].includes(value.active as string))return false;
 for(const field of ['leftSectionId','rightSectionId','leftQuoteId','rightQuoteId','researchId'])if(value[field]!==undefined&&typeof value[field]!=='string')return false;
 for(const field of ['leftLocalOnly','rightLocalOnly'])if(value[field]!==undefined&&typeof value[field]!=='boolean')return false;
 return (value.leftAnchor===undefined||validFileAnchor(value.leftAnchor))&&(value.rightAnchor===undefined||validFileAnchor(value.rightAnchor))&&(value.leftTextAnchor===undefined||validTextAnchor(value.leftTextAnchor))&&(value.rightTextAnchor===undefined||validTextAnchor(value.rightTextAnchor));
}

export interface MemoryArchive {format:'antonovium.scientific-memory';version:1;exportedAt:string;includesOriginals:false;bibliography:BibliographicRecord[];notes:Note[];research:SavedState['research'];sources:Source[];desk?:SavedState['desk'];bibliographyTemplate?:string;bibliographicTemplates?:SavedState['bibliographicTemplates']}
export function exportMemory(state:SavedState):string {
 const archive:MemoryArchive={format:'antonovium.scientific-memory',version:1,exportedAt:now(),includesOriginals:false,bibliography:state.bibliography??[],notes:state.notes.filter(n=>!n.demo),research:state.research.filter(r=>!r.demo),sources:state.sources.filter(s=>!s.demo),desk:state.desk,bibliographyTemplate:state.bibliographyTemplate,bibliographicTemplates:state.bibliographicTemplates};
 return JSON.stringify(archive,null,2);
}
/** Imports are additive: a collision with different content is retained as a conflict. */
export function importMemory(json:string,current:SavedState):{state:SavedState;conflicts:string[];imported:number} {
 if(json.length>40*1024*1024)throw Error('Архив научной памяти превышает 40 МБ');
 const value:unknown=JSON.parse(json);if(!own(value)||value.format!=='antonovium.scientific-memory'||value.version!==1||value.includesOriginals!==false||!Array.isArray(value.bibliography)||!Array.isArray(value.notes)||!Array.isArray(value.research)||!Array.isArray(value.sources))throw Error('Неподдерживаемый архив научной памяти');
 if(value.bibliography.length>10000||value.notes.length>20000||value.sources.length>1000||value.research.length>10000)throw Error('Слишком большой архив научной памяти');
 if(value.desk!==undefined&&!validDesk(value.desk))throw Error('Некорректный контекст исследовательского стола');
 if(!value.bibliography.every(validBibliography))throw Error('Некорректная библиографическая запись');
 for(const n of value.notes)if(!own(n)||typeof n.id!=='string'||typeof n.title!=='string'||typeof n.body!=='string'||typeof n.createdAt!=='string'||!['thought','thesis','question'].includes(n.kind as string)||!Array.isArray(n.categories)||n.categories.some(c=>typeof c!=='string')||!validMemoryNote(n as unknown as Note))throw Error('Некорректная научная запись');
 for(const r of value.research)if(!own(r)||typeof r.id!=='string'||typeof r.title!=='string'||typeof r.question!=='string'||typeof r.hypothesis!=='string'||typeof r.archived!=='boolean'||!Array.isArray(r.categories)||r.categories.some(c=>typeof c!=='string'))throw Error('Некорректная исследовательская линия');
 for(const source of value.sources)if(!own(source)||typeof source.id!=='string'||typeof source.title!=='string'||typeof source.subtitle!=='string'||!['paper','digital'].includes(source.format as string)||!Array.isArray(source.categories)||source.categories.some(c=>typeof c!=='string')||!Array.isArray(source.sections)||source.sections.some(section=>!own(section)||typeof section.id!=='string'||typeof section.title!=='string'||!Array.isArray(section.paragraphs)||section.paragraphs.some(p=>!own(p)||typeof p.id!=='string'||typeof p.text!=='string')))throw Error('Некорректный источник');
 const conflicts:string[]=[];let imported=0;
 const canonical=(v:unknown):string=>own(v)?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':Array.isArray(v)?'['+v.map(canonical).join(',')+']':JSON.stringify(v);
 const merge=<T extends {id:string}>(a:T[],b:T[],kind:string):T[]=>{const map=new Map(a.map(v=>[v.id,v]));for(const row of b){const existing=map.get(row.id);if(!existing){map.set(row.id,row);imported++}else if(canonical(existing)!==canonical(row))conflicts.push(`${kind}: ${row.id}`)}return [...map.values()]};
 const state:SavedState={...current,bibliography:merge(current.bibliography??[],value.bibliography as BibliographicRecord[],'Библиография'),notes:merge(current.notes,value.notes as Note[],'Запись'),research:merge(current.research,value.research as SavedState['research'],'Линия'),sources:merge(current.sources,value.sources as Source[],'Источник')};
 const empty=current.notes.every(n=>n.demo)&&!current.bibliography?.length&&current.sources.every(s=>s.demo)&&current.research.every(r=>r.demo);
 if(empty&&validDesk(value.desk))state.desk=structuredClone(value.desk);
 if(!state.bibliographyTemplate&&typeof value.bibliographyTemplate==='string'&&value.bibliographyTemplate.length<5000)state.bibliographyTemplate=value.bibliographyTemplate;
 if(!state.bibliographicTemplates&&own(value.bibliographicTemplates)&&typeof value.bibliographicTemplates.bibliography==='string'&&typeof value.bibliographicTemplates.citation==='string'&&value.bibliographicTemplates.bibliography.length<5000&&value.bibliographicTemplates.citation.length<5000)state.bibliographicTemplates={bibliography:value.bibliographicTemplates.bibliography,citation:value.bibliographicTemplates.citation};
 return {state,conflicts,imported};
}
