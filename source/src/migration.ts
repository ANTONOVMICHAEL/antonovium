import {sha256} from '@noble/hashes/sha2.js';
import type {BibliographicRecord,Note,SavedState} from './types';
import {defaultState} from './storage';
function canonical(v:any):string{return v&&typeof v==='object'?Array.isArray(v)?'['+v.map(canonical).join(',')+']':'{'+Object.keys(v).filter(k=>v[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v)}
const hash=(v:unknown)=>Array.from(sha256(new TextEncoder().encode(canonical(v))),n=>n.toString(16).padStart(2,'0')).join('').slice(0,20);
export function mergeMigration(current:SavedState,old:SavedState):SavedState{
 const sourceIds=new Map<string,string>(),researchIds=new Map<string,string>();
 function merge<T extends {id:string}>(a:T[],b:T[],ids?:Map<string,string>){const map=new Map(a.map(v=>[v.id,v]));for(const item of b){let next=item;if(map.has(item.id)&&canonical(map.get(item.id))!==canonical(item))next={...item,id:`${item.id.slice(0,180)}.local.${hash(item)}`};map.set(next.id,next);ids?.set(item.id,next.id)}return [...map.values()]}
 const sources=merge(current.sources,old.sources,sourceIds),research=merge(current.research,old.research,researchIds);
 const mappedSource=(id:string)=>sourceIds.get(id)??id;
 const remapBibliography=(b:BibliographicRecord):BibliographicRecord=>({...b,id:mappedSource(b.id),sourceId:mappedSource(b.sourceId),previousVersions:b.previousVersions?.map(previous=>({...previous,id:mappedSource(previous.id),sourceId:mappedSource(previous.sourceId)}))});
 const oldNotes=old.notes.map(n=>({...n,sourceId:n.sourceId?mappedSource(n.sourceId):undefined,researchId:n.researchId?researchIds.get(n.researchId)??n.researchId:undefined,relatedSourceIds:n.relatedSourceIds?.map(mappedSource),citation:n.citation?{...n.citation,sourceId:mappedSource(n.citation.sourceId),editionId:mappedSource(n.citation.editionId),bibliography:n.citation.bibliography?remapBibliography(n.citation.bibliography):undefined}:undefined}));
 const noteIds=new Map(oldNotes.map(n=>[n.id,current.notes.some(existing=>existing.id===n.id&&canonical(existing)!==canonical(n))?`${n.id.slice(0,180)}.local.${hash(n)}`:n.id]));
 const notes=merge(current.notes,oldNotes.map(n=>({...n,id:noteIds.get(n.id)!,quotationIds:n.quotationIds?.map(id=>noteIds.get(id)??id)})) as Note[]);
 const bibliography=new Map((current.bibliography??[]).map(b=>[b.id,b]));
 for(const original of old.bibliography??[]){const incoming=remapBibliography(original),existing=bibliography.get(incoming.id);if(!existing){bibliography.set(incoming.id,incoming);continue}if(canonical(existing)===canonical(incoming))continue;const {previousVersions:prior,...version}=incoming,versions=[...existing.previousVersions??[]];for(const v of [...prior??[],version])if(!versions.some(existingVersion=>canonical(existingVersion)===canonical(v)))versions.push(v);bibliography.set(existing.id,{...existing,previousVersions:versions});}
 const marker=`[Локальная рукопись: ${hash(old.manuscript)}]`;
 const manuscript=old.manuscript===defaultState.manuscript||current.manuscript===old.manuscript||current.manuscript.includes(marker)?current.manuscript:current.manuscript===defaultState.manuscript?old.manuscript:`${current.manuscript}\n\n${marker}\n${old.manuscript}`;
 const oldDesk=old.desk?{...old.desk,leftId:mappedSource(old.desk.leftId),rightId:mappedSource(old.desk.rightId),leftQuoteId:old.desk.leftQuoteId?noteIds.get(old.desk.leftQuoteId)??old.desk.leftQuoteId:undefined,rightQuoteId:old.desk.rightQuoteId?noteIds.get(old.desk.rightQuoteId)??old.desk.rightQuoteId:undefined,researchId:old.desk.researchId?researchIds.get(old.desk.researchId)??old.desk.researchId:undefined}:undefined;
 return {...current,sources,research,notes,bibliography:[...bibliography.values()],bibliographicTemplates:current.bibliographicTemplates??old.bibliographicTemplates,bibliographyTemplate:current.bibliographyTemplate??old.bibliographyTemplate,desk:!current.desk||canonical(current.desk)===canonical(defaultState.desk)?oldDesk??current.desk:current.desk,manuscript,manuscriptTitle:current.manuscriptTitle===defaultState.manuscriptTitle?old.manuscriptTitle:current.manuscriptTitle};
}
