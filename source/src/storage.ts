import { useCallback, useState } from 'react';
import { demoNotes, demoResearch, demoSources } from './data';
import type { SavedState, Source, Note, Research } from './types';
export const STORAGE_KEY = 'antonovium.workspace.v1';
export function newId(){
  if(globalThis.crypto?.randomUUID)return globalThis.crypto.randomUUID();
  const values=new Uint32Array(4);globalThis.crypto.getRandomValues(values);
  return Array.from(values,n=>n.toString(16).padStart(8,'0')).join('-');
}
export const defaultState: SavedState = {
  version:1, theme:'cobalt', screen:'cabinet', mode:'research', sourceId:'boundaries', sectionId:'s1',
  fontSize:20, lineHeight:1.8, wide:false, quiet:false, positions:{},
  notes:demoNotes, sources:demoSources, research:demoResearch,
  manuscriptTitle:'Критерии разграничения: рабочие записи',
  manuscript:'Демонстрационная рукопись\n\nСформулировать основания сравнения смежных понятий.\n\nМатериалы читального зала в этой версии являются демонстрационными; использовать их как научные источники нельзя.\n\nМесто для собственных тезисов и проверенных ссылок.\n',
  wilkinsActivity:'adaptive', compareSourceId:'qualification', compareSectionId:'q1', categoryId:'badfaith', researchId:'r1'
};
const screens=['cabinet','library','reader','atlas','lab','manuscripts','horizon','archive'];
export function decodeState(value:unknown): SavedState {
  if(!value||typeof value!=='object'||(value as SavedState).version!==1) throw new Error('Неподдерживаемый формат данных. Нужен экспорт ANTONOVIUM версии 1.');
  const s=value as SavedState;
  if(!Array.isArray(s.sources)||!Array.isArray(s.notes)||!Array.isArray(s.research)||s.sources.length>1000||s.notes.length>20000) throw new Error('Некорректная структура данных.');
  const ids=new Set<string>();
  for(const source of s.sources){
    if(!source||typeof source.id!=='string'||ids.has(source.id)||typeof source.title!=='string'||!Array.isArray(source.sections)||!Array.isArray(source.categories)||source.categories.some(c=>typeof c!=='string')||!['paper','digital'].includes(source.format)) throw new Error('Некорректные данные источника.');
    ids.add(source.id);
    for(const section of source.sections){if(typeof section.id!=='string'||typeof section.title!=='string'||!Array.isArray(section.paragraphs)||section.paragraphs.some(p=>typeof p.id!=='string'||typeof p.text!=='string'))throw new Error('Некорректная структура текста.');}
  }
  for(const note of s.notes){if(!note||typeof note.id!=='string'||typeof note.title!=='string'||typeof note.body!=='string'||!Array.isArray(note.categories)||note.categories.some(c=>typeof c!=='string')||!['thought','thesis','question'].includes(note.kind)||typeof note.createdAt!=='string'||(note.quote!==undefined&&typeof note.quote!=='string')||(note.anchors&&(!Array.isArray(note.anchors)||note.anchors.some(a=>!a||typeof a.paragraphId!=='string'||!Number.isInteger(a.start)||!Number.isInteger(a.end)||a.start<0||a.end<a.start))))throw new Error('Некорректные данные заметки.');}
  for(const research of s.research){if(!research||typeof research.id!=='string'||typeof research.title!=='string'||typeof research.question!=='string'||typeof research.hypothesis!=='string'||!Array.isArray(research.categories)||research.categories.some(c=>typeof c!=='string')||typeof research.archived!=='boolean')throw new Error('Некорректные данные исследования.');}
  const source=s.sources.find(x=>x.id===s.sourceId)??s.sources.find(x=>x.sections.length)??s.sources[0];
  return {...defaultState,...s, theme:['cobalt','plum','emerald'].includes(s.theme)?s.theme:'cobalt',screen:screens.includes(s.screen)?s.screen:'cabinet',mode:['reading','research','compare'].includes(s.mode)?s.mode:'research',
    sourceId:source?.id??'', sectionId:source?.sections.find(x=>x.id===s.sectionId)?.id??source?.sections[0]?.id??'',
    fontSize:Math.max(16,Math.min(26,Number(s.fontSize)||20)),lineHeight:Math.max(1.5,Math.min(2.1,Number(s.lineHeight)||1.8)),
    positions:s.positions&&typeof s.positions==='object'?Object.fromEntries(Object.entries(s.positions).filter(([,v])=>typeof v==='number'&&Number.isFinite(v)&&v>=0)):{},
    compareExcerpt:s.compareExcerpt&&typeof s.compareExcerpt.quote==='string'&&typeof s.compareExcerpt.sourceId==='string'&&Array.isArray(s.compareExcerpt.anchors)&&s.compareExcerpt.anchors.every(a=>a&&typeof a.paragraphId==='string'&&Number.isInteger(a.start)&&Number.isInteger(a.end)&&a.start>=0&&a.end>=a.start)?s.compareExcerpt:undefined,
    manuscript:typeof s.manuscript==='string'?s.manuscript:defaultState.manuscript,manuscriptTitle:typeof s.manuscriptTitle==='string'?s.manuscriptTitle:defaultState.manuscriptTitle,
    wilkinsActivity:['request','adaptive','active'].includes(s.wilkinsActivity)?s.wilkinsActivity:'adaptive',
    wide:!!s.wide,quiet:!!s.quiet, sources:s.sources as Source[],notes:s.notes as Note[],research:s.research as Research[]};
}
export function useWorkspace(storageKey=STORAGE_KEY){
  const [storageError,setStorageError]=useState('');
  const [state,setState]=useState<SavedState>(()=>{try{const raw=localStorage.getItem(storageKey);return raw?decodeState(JSON.parse(raw)):structuredClone(defaultState)}catch{return structuredClone(defaultState)}});
  const update=useCallback((change:Partial<SavedState>|((s:SavedState)=>SavedState))=>setState(previous=>{
    const next=typeof change==='function'?change(previous):{...previous,...change};
    try{localStorage.setItem(storageKey,JSON.stringify(next));setStorageError('')}catch{setStorageError('Браузер не сохранил данные. Скачай резервную копию перед закрытием.');}
    return next;
  }),[storageKey]);
  return {state,update,storageError};
}
export function downloadFile(filename:string,text:string,type='text/plain;charset=utf-8'){
  const a=document.createElement('a');const url=URL.createObjectURL(new Blob([text],{type}));a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);
}
