import {useEffect,useRef} from 'react';
import {useCloud,saveRecord,supabase} from './cloud';
import {listLocalBooks,readLocalFile,localBookmarks,localProgress} from './localBooks';
import {uploadShared} from './bookUpload';
import type {SavedState,Excerpt,BibliographicRecord} from './types';
const prefix='antonovium.shared-books.';
export function sharedBookAliases(userId?:string):Record<string,string>{try{return JSON.parse(localStorage.getItem(prefix+(userId??'guest'))??'{}')}catch{return {}}}
// Promotion changes the storage identity, never the text or the edition itself.
// Deliberately device-only books are excluded by the caller before this runs.
export function promoteBookReferences(state:SavedState,localId:string,sharedId:string,remainingLocalIds:string[]=[]):SavedState{
 const id=(value:string)=>value===localId?sharedId:value;
 const privateSources=new Set([...remainingLocalIds,...state.sources.filter(source=>source.localOnly).map(source=>source.id),...(state.bibliography??[]).filter(record=>record.localOnly).map(record=>record.sourceId)].filter(sourceId=>sourceId!==localId&&sourceId!==sharedId));
 const sharedSources=new Set([sharedId,...state.sources.filter(source=>!source.localOnly).map(source=>source.id),...(state.bibliography??[]).filter(record=>!record.localOnly).map(record=>record.sourceId)]);
 const notesById=new Map(state.notes.map(note=>[note.id,note]));
 // An absent original or quotation cannot establish that a private dependency
 // has become public. Only the promoted instance is known to have moved.
 const remainsPrivate=(item:Partial<Excerpt>,visited=new Set<string>()):boolean=>{
  const sources=[item.sourceId,item.citation?.sourceId,...item.relatedSourceIds??[]].filter((value):value is string=>!!value);
  if(sources.some(sourceId=>sourceId!==localId&&sourceId!==sharedId&&(privateSources.has(sourceId)||!sharedSources.has(sourceId))))return true;
  for(const quotationId of item.quotationIds??[]){
   const quotation=notesById.get(quotationId);
   if(!quotation||visited.has(quotationId))return true;
   if(remainsPrivate(quotation,new Set([...visited,quotationId])))return true;
  }
  return !sources.length&&!item.quotationIds?.length&&item.localOnly===true;
 };
 const bibliography=(record:BibliographicRecord):BibliographicRecord=>record.sourceId===localId?{...record,id:id(record.id),sourceId:sharedId,localOnly:undefined}:record;
 const excerpt=<T extends Partial<Excerpt>>(item:T):T=>{
  const sourceId=item.sourceId?id(item.sourceId):undefined,relatedSourceIds=item.relatedSourceIds?.map(id);
  const stillLocal=remainsPrivate(item);
  return {...item,sourceId,relatedSourceIds,localOnly:item.localOnly&&stillLocal?true:undefined,...item.citation?{citation:{...item.citation,sourceId:id(item.citation.sourceId),editionId:id(item.citation.editionId),bibliography:item.citation.bibliography?bibliography(item.citation.bibliography):undefined}}:{}};
 };
 return {...state,sourceId:id(state.sourceId),compareSourceId:id(state.compareSourceId),notes:state.notes.map(note=>note.sourceId===localId||note.relatedSourceIds?.includes(localId)||note.citation?.sourceId===localId?excerpt(note):note),bibliography:state.bibliography?.map(bibliography),compareExcerpt:state.compareExcerpt?excerpt(state.compareExcerpt):undefined,desk:state.desk?{...state.desk,leftId:id(state.desk.leftId),rightId:id(state.desk.rightId),...state.desk.leftId===localId?{leftLocalOnly:false}:{},...state.desk.rightId===localId?{rightLocalOnly:false}:{}}:undefined};
}
export function useLibraryMigration(update:(fn:(s:SavedState)=>SavedState)=>void){
 const c=useCloud(),busy=useRef(false),latest=useRef(c);latest.current=c;
 useEffect(()=>{if(!c.authorized||!c.storageReady)return;let stopped=false;const userId=c.session!.user.id;
  async function migrate(){if(stopped||busy.current||!navigator.onLine)return;busy.current=true;try{const localBooks=await listLocalBooks();for(const book of localBooks){
   if(stopped)return;const aliases=sharedBookAliases(userId);if(aliases[book.id]||book.deviceOnly)continue;
   latest.current.setStatus(`Перенос книги: ${book.title}`);
   const blob=await readLocalFile(book.id),file=new File([blob],book.original_name,{type:blob.type});
   const shared=await uploadShared(file,book);if(stopped)return;
   const progress=localProgress(book.id);if(progress){const{data,error}=await supabase.from('av_entities').select('*').eq('kind','progress').eq('entity_id',shared.id).maybeSingle();if(error)throw error;if(!data)await saveRecord('progress',shared.id,{bookId:shared.id,anchor:progress},0)}
   for(const bookmark of localBookmarks(book.id)){const id=`migrated.${book.id}.${bookmark.entity_id}`;const {data,error}=await supabase.from('av_entities').select('revision').eq('kind','bookmark').eq('entity_id',id).maybeSingle();if(error)throw error;if(!data)await saveRecord('bookmark',id,{...bookmark.data,bookId:shared.id},0)}
   if(stopped)return;aliases[book.id]=shared.id;localStorage.setItem(prefix+userId,JSON.stringify(aliases));
   update(s=>promoteBookReferences(s,book.id,shared.id,localBooks.filter(b=>b.id!==book.id&&!aliases[b.id]).map(b=>b.id)));
   await latest.current.refresh();window.dispatchEvent(new Event('antonovium-shared-books'));window.dispatchEvent(new Event('antonovium-sync'));
  }}catch(e){if(!stopped)latest.current.setError(`Перенос книги не завершен; оригинал сохранен на устройстве. ${(e as Error).message}`)}finally{busy.current=false}}
  const kickoff=setTimeout(()=>void migrate(),500),interval=setInterval(()=>void migrate(),30000);window.addEventListener('online',migrate);window.addEventListener('antonovium-local-books',migrate);return()=>{stopped=true;clearTimeout(kickoff);clearInterval(interval);window.removeEventListener('online',migrate);window.removeEventListener('antonovium-local-books',migrate)};
 },[c.authorized,c.storageReady,c.session?.user.id,update]);
}
