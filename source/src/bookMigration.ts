import {useEffect,useRef} from 'react';
import {useCloud,saveRecord,supabase} from './cloud';
import {listLocalBooks,readLocalFile,localBookmarks,localProgress} from './localBooks';
import {uploadShared} from './bookUpload';
import type {SavedState} from './types';
const prefix='antonovium.shared-books.';
export function sharedBookAliases(userId?:string):Record<string,string>{try{return JSON.parse(localStorage.getItem(prefix+(userId??'guest'))??'{}')}catch{return {}}}
export function useLibraryMigration(update:(fn:(s:SavedState)=>SavedState)=>void){
 const c=useCloud(),busy=useRef(false),latest=useRef(c);latest.current=c;
 useEffect(()=>{if(!c.authorized||!c.storageReady)return;let stopped=false;const userId=c.session!.user.id;
  async function migrate(){if(stopped||busy.current||!navigator.onLine)return;busy.current=true;try{for(const book of await listLocalBooks()){
   if(stopped)return;const aliases=sharedBookAliases(userId);if(aliases[book.id]||book.deviceOnly)continue;
   latest.current.setStatus(`Перенос книги: ${book.title}`);
   const blob=await readLocalFile(book.id),file=new File([blob],book.original_name,{type:blob.type});
   const shared=await uploadShared(file,book);if(stopped)return;
   const progress=localProgress(book.id);if(progress){const{data,error}=await supabase.from('av_entities').select('*').eq('kind','progress').eq('entity_id',shared.id).maybeSingle();if(error)throw error;if(!data)await saveRecord('progress',shared.id,{bookId:shared.id,anchor:progress},0)}
   for(const bookmark of localBookmarks(book.id)){const id=`migrated.${book.id}.${bookmark.entity_id}`;const {data,error}=await supabase.from('av_entities').select('revision').eq('kind','bookmark').eq('entity_id',id).maybeSingle();if(error)throw error;if(!data)await saveRecord('bookmark',id,{...bookmark.data,bookId:shared.id},0)}
   if(stopped)return;aliases[book.id]=shared.id;localStorage.setItem(prefix+userId,JSON.stringify(aliases));
   update(s=>({...s,sourceId:s.sourceId===book.id?shared.id:s.sourceId,notes:s.notes.map(n=>n.sourceId===book.id?{...n,sourceId:shared.id}:n)}));
   await latest.current.refresh();window.dispatchEvent(new Event('antonovium-shared-books'));window.dispatchEvent(new Event('antonovium-sync'));
  }}catch(e){if(!stopped)latest.current.setError(`Перенос книги не завершен; оригинал сохранен на устройстве. ${(e as Error).message}`)}finally{busy.current=false}}
  const kickoff=setTimeout(()=>void migrate(),500),interval=setInterval(()=>void migrate(),30000);window.addEventListener('online',migrate);window.addEventListener('antonovium-local-books',migrate);return()=>{stopped=true;clearTimeout(kickoff);clearInterval(interval);window.removeEventListener('online',migrate);window.removeEventListener('antonovium-local-books',migrate)};
 },[c.authorized,c.storageReady,c.session?.user.id,update]);
}
