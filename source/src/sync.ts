import {defaultState} from './storage';
import type {SavedState} from './types';
import {validBibliography,validFileAnchor,validTextAnchor} from './scientificMemory';
export interface SyncEntity {kind:string;entity_id:string;revision:number;data:any;updated_at:string}
export function canonical(value:any):string{if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value);}
export const equal=(a:unknown,b:unknown)=>canonical(a)===canonical(b);
const LOCAL_ONLY=Symbol('scientific-memory-local-only');
function localOnly(local:Record<string,any>,key:string){return (Object.getOwnPropertyDescriptor(local,LOCAL_ONLY)?.value as Set<string>|undefined)?.has(key)??false}
function privateSourceIds(s:SavedState){return new Set([...(s.bibliography??[]).filter(b=>b.localOnly).map(b=>b.sourceId),...s.sources.filter(source=>source.localOnly).map(source=>source.id),...s.notes.filter(note=>note.localOnly).flatMap(note=>[note.sourceId,...note.relatedSourceIds??[]].filter((v):v is string=>!!v))])}
export function flatten(s:SavedState):Record<string,any>{
 const out:Record<string,any>={},privateKeys=new Set<string>();for(const[kind,items]of [['source',s.sources],['note',s.notes],['research',s.research]]as const)for(const item of items){if('localOnly'in item&&item.localOnly){privateKeys.add(`${kind}:${item.id}`);continue}if(!item.demo)out[`${kind}:${item.id}`]=item;}
 for(const item of s.bibliography??[]){if(item.localOnly)privateKeys.add(`bibliography:${item.id}`);else out[`bibliography:${item.id}`]=item;}
 // Non-enumerable scope metadata never becomes an outgoing RPC entity.
 Object.defineProperty(out,LOCAL_ONLY,{value:privateKeys,enumerable:false});
 if(s.bibliographicTemplates||s.bibliographyTemplate!==undefined)out['settings:memory']={bibliographyTemplate:s.bibliographyTemplate,bibliographicTemplates:s.bibliographicTemplates};
 out['settings:reader']={theme:s.theme,fontSize:s.fontSize,lineHeight:s.lineHeight,wide:s.wide,readerFont:s.readerFont??'serif',wilkinsActivity:s.wilkinsActivity};out['manuscript:main']={title:s.manuscriptTitle,body:s.manuscript};
 if(s.desk){const privateSources=privateSourceIds(s);out['settings:desk']={...s.desk,...(s.desk.leftLocalOnly||privateSources.has(s.desk.leftId)?{leftLocalOnly:true,leftAnchor:undefined,leftTextAnchor:undefined,leftQuoteId:undefined}:{}),...(s.desk.rightLocalOnly||privateSources.has(s.desk.rightId)?{rightLocalOnly:true,rightAnchor:undefined,rightTextAnchor:undefined,rightQuoteId:undefined}:{})};}
 for(const[id,position]of Object.entries(s.positions))out[`progress:text:${id}`]={position};return out;
}
export function applyRecords(state:SavedState,rows:SyncEntity[]):SavedState{
 const next={...state,positions:{...state.positions}};for(const[kind,field]of [['source','sources'],['note','notes'],['research','research']]as const){const map=new Map<string,any>(next[field].map(v=>[v.id,v]));for(const r of rows.filter(r=>r.kind===kind)){if(map.get(r.entity_id)?.localOnly)continue;if(r.data.deleted)map.delete(r.entity_id);else map.set(r.entity_id,r.data)}(next as any)[field]=[...map.values()];}
 const bibliography=new Map((state.bibliography??[]).map(v=>[v.id,v]));
 for(const r of rows.filter(r=>r.kind==='bibliography')){if(bibliography.get(r.entity_id)?.localOnly)continue;if(r.data.deleted)bibliography.delete(r.entity_id);else if(validBibliography(r.data)&&r.data.id===r.entity_id)bibliography.set(r.entity_id,r.data)}
 next.bibliography=[...bibliography.values()];
 for(const r of rows){
  if(r.data.deleted)continue;
  if(r.kind==='settings'&&r.entity_id==='reader')for(const k of ['theme','fontSize','lineHeight','wide','readerFont','wilkinsActivity']as const)if(r.data[k]!==undefined)(next as any)[k]=r.data[k];
  if(r.kind==='settings'&&r.entity_id==='desk'&&r.data&&typeof r.data.leftId==='string'&&typeof r.data.rightId==='string'){
   const prior=next.desk,privateSources=privateSourceIds(next);
   const keepLeft=prior?.leftId===r.data.leftId&&(prior?.leftLocalOnly||r.data.leftLocalOnly===true||privateSources.has(r.data.leftId)),keepRight=prior?.rightId===r.data.rightId&&(prior?.rightLocalOnly||r.data.rightLocalOnly===true||privateSources.has(r.data.rightId));
   next.desk={leftId:r.data.leftId,rightId:r.data.rightId,
    leftSectionId:keepLeft?prior?.leftSectionId:r.data.leftSectionId,rightSectionId:keepRight?prior?.rightSectionId:r.data.rightSectionId,
    leftAnchor:keepLeft?prior?.leftAnchor:validFileAnchor(r.data.leftAnchor)?r.data.leftAnchor:undefined,
    rightAnchor:keepRight?prior?.rightAnchor:validFileAnchor(r.data.rightAnchor)?r.data.rightAnchor:undefined,
    leftTextAnchor:keepLeft?prior?.leftTextAnchor:validTextAnchor(r.data.leftTextAnchor)?r.data.leftTextAnchor:undefined,
    rightTextAnchor:keepRight?prior?.rightTextAnchor:validTextAnchor(r.data.rightTextAnchor)?r.data.rightTextAnchor:undefined,
    leftQuoteId:keepLeft?prior?.leftQuoteId:typeof r.data.leftQuoteId==='string'?r.data.leftQuoteId:undefined,
    rightQuoteId:keepRight?prior?.rightQuoteId:typeof r.data.rightQuoteId==='string'?r.data.rightQuoteId:undefined,
    leftLocalOnly:keepLeft?true:typeof r.data.leftLocalOnly==='boolean'?r.data.leftLocalOnly:undefined,
    rightLocalOnly:keepRight?true:typeof r.data.rightLocalOnly==='boolean'?r.data.rightLocalOnly:undefined,
    ratio:Math.max(.3,Math.min(.7,Number(r.data.ratio)||.5)),active:r.data.active==='right'?'right':'left',researchId:r.data.researchId};
  }
  if(r.kind==='settings'&&r.entity_id==='memory'){
   if(typeof r.data.bibliographyTemplate==='string'&&r.data.bibliographyTemplate.length<=5000)next.bibliographyTemplate=r.data.bibliographyTemplate;
   const t=r.data.bibliographicTemplates;if(t&&typeof t.bibliography==='string'&&typeof t.citation==='string'&&t.bibliography.length<=5000&&t.citation.length<=5000)next.bibliographicTemplates={bibliography:t.bibliography,citation:t.citation};
  }
  if(r.kind==='manuscript'&&r.entity_id==='main'){next.manuscriptTitle=r.data.title;next.manuscript=r.data.body}
  if(r.kind==='progress'&&r.entity_id.startsWith('text:'))next.positions[r.entity_id.slice(5)]=r.data.position;
 }
 return next;
}
export function syncKey(r:SyncEntity){return `${r.kind}:${r.entity_id}`}
export function managed(r:SyncEntity){return ['source','note','research','manuscript','bibliography'].includes(r.kind)||r.kind==='settings'&&['reader','desk','memory'].includes(r.entity_id)||r.kind==='progress'&&r.entity_id.startsWith('text:')}
// An absent record is a deletion only when this device previously saw that record.
export function localValue(local:Record<string,any>,key:string,prior?:SyncEntity){if(key in local)return local[key];if(localOnly(local,key))return prior?.data;if(prior?.kind==='bibliography')return undefined;if(prior&&['source','note','research'].includes(prior.kind))return {deleted:true};return prior?.data;}
export function unchanged(local:Record<string,any>,key:string,prior?:SyncEntity){return localOnly(local,key)||prior?.kind==='bibliography'&&!(key in local)||equal(localValue(local,key,prior),prior?.data)||!!prior?.data.deleted&&!(key in local)}
export function firstContact(local:Record<string,any>,key:string){return !(key in local)||equal(local[key],flatten(defaultState)[key])}
