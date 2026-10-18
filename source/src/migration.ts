import {sha256} from '@noble/hashes/sha2.js';
import type {SavedState} from './types';
import {defaultState} from './storage';
function canonical(v:any):string{return v&&typeof v==='object'?Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v)}
const hash=(v:unknown)=>Array.from(sha256(new TextEncoder().encode(canonical(v))),n=>n.toString(16).padStart(2,'0')).join('').slice(0,20);
export function mergeMigration(current:SavedState,old:SavedState):SavedState{
 const sourceIds=new Map<string,string>(),researchIds=new Map<string,string>();
 function merge<T extends {id:string}>(a:T[],b:T[],ids?:Map<string,string>){const map=new Map(a.map(v=>[v.id,v]));for(const item of b){let next=item;if(map.has(item.id)&&canonical(map.get(item.id))!==canonical(item))next={...item,id:`${item.id.slice(0,180)}.local.${hash(item)}`};map.set(next.id,next);ids?.set(item.id,next.id)}return [...map.values()]}
 const sources=merge(current.sources,old.sources,sourceIds),research=merge(current.research,old.research,researchIds);
 const notes=merge(current.notes,old.notes.map(n=>({...n,sourceId:n.sourceId?sourceIds.get(n.sourceId)??n.sourceId:undefined,researchId:n.researchId?researchIds.get(n.researchId)??n.researchId:undefined})));
 const marker=`[Локальная рукопись: ${hash(old.manuscript)}]`;
 const manuscript=old.manuscript===defaultState.manuscript||current.manuscript===old.manuscript||current.manuscript.includes(marker)?current.manuscript:current.manuscript===defaultState.manuscript?old.manuscript:`${current.manuscript}\n\n${marker}\n${old.manuscript}`;
 return {...current,sources,research,notes,manuscript,manuscriptTitle:current.manuscriptTitle===defaultState.manuscriptTitle?old.manuscriptTitle:current.manuscriptTitle};
}
