import {defaultState} from './storage';
import type {SavedState} from './types';
export interface SyncEntity {kind:string;entity_id:string;revision:number;data:any;updated_at:string}
export function canonical(value:any):string{if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value);}
export const equal=(a:unknown,b:unknown)=>canonical(a)===canonical(b);
export function flatten(s:SavedState):Record<string,any>{
 const out:Record<string,any>={};for(const[kind,items]of [['source',s.sources],['note',s.notes],['research',s.research]]as const)for(const item of items)if(!item.demo)out[`${kind}:${item.id}`]=item;
 out['settings:reader']={theme:s.theme,fontSize:s.fontSize,lineHeight:s.lineHeight,wide:s.wide,readerFont:s.readerFont??'serif',wilkinsActivity:s.wilkinsActivity};out['manuscript:main']={title:s.manuscriptTitle,body:s.manuscript};
 if(s.desk)out['settings:desk']=s.desk;
 for(const[id,position]of Object.entries(s.positions))out[`progress:text:${id}`]={position};return out;
}
export function applyRecords(state:SavedState,rows:SyncEntity[]):SavedState{
 const next={...state,positions:{...state.positions}};for(const[kind,field]of [['source','sources'],['note','notes'],['research','research']]as const){const map=new Map<string,any>(next[field].map(v=>[v.id,v]));for(const r of rows.filter(r=>r.kind===kind)){if(r.data.deleted)map.delete(r.entity_id);else map.set(r.entity_id,r.data)}(next as any)[field]=[...map.values()];}
 for(const r of rows){if(r.data.deleted)continue;if(r.kind==='settings'&&r.entity_id==='reader')for(const k of ['theme','fontSize','lineHeight','wide','readerFont','wilkinsActivity']as const)if(r.data[k]!==undefined)(next as any)[k]=r.data[k];if(r.kind==='settings'&&r.entity_id==='desk'&&r.data&&typeof r.data.leftId==='string'&&typeof r.data.rightId==='string')next.desk={leftId:r.data.leftId,rightId:r.data.rightId,leftSectionId:r.data.leftSectionId,rightSectionId:r.data.rightSectionId,ratio:Math.max(.3,Math.min(.7,Number(r.data.ratio)||.5)),active:r.data.active==='right'?'right':'left',researchId:r.data.researchId};if(r.kind==='manuscript'&&r.entity_id==='main'){next.manuscriptTitle=r.data.title;next.manuscript=r.data.body}if(r.kind==='progress'&&r.entity_id.startsWith('text:'))next.positions[r.entity_id.slice(5)]=r.data.position;}return next;
}
export function syncKey(r:SyncEntity){return `${r.kind}:${r.entity_id}`}
export function managed(r:SyncEntity){return ['source','note','research','manuscript'].includes(r.kind)||r.kind==='settings'&&['reader','desk'].includes(r.entity_id)||r.kind==='progress'&&r.entity_id.startsWith('text:')}
// An absent record is a deletion only when this device previously saw that record.
export function localValue(local:Record<string,any>,key:string,prior?:SyncEntity){if(key in local)return local[key];if(prior&&['source','note','research'].includes(prior.kind))return {deleted:true};return prior?.data;}
export function unchanged(local:Record<string,any>,key:string,prior?:SyncEntity){return equal(localValue(local,key,prior),prior?.data)||!!prior?.data.deleted&&!(key in local)}
export function firstContact(local:Record<string,any>,key:string){return !(key in local)||equal(local[key],flatten(defaultState)[key])}
