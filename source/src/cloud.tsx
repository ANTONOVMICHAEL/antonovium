import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {createClient,type Session} from '@supabase/supabase-js';
import {decodeState,newId,STORAGE_KEY} from './storage';
import {mergeMigration} from './migration';
import {flatten,applyRecords,equal,syncKey,managed,localValue,unchanged,firstContact} from './sync';
export {flatten,applyRecords,canonical} from './sync';
import type {SavedState} from './types';
export const supabase=createClient('https://hmdjcxpogdrveddznedx.supabase.co','sb_publishable_6mDpQ-hKERSZngTl8Ki5LQ_JkHGbOd4',{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'implicit',storageKey:'antonovium.auth'}});
export interface Book {id:string;title:string;author:string;edition:string;format:'pdf'|'fb2';original_name:string;size_bytes:number;status:'uploading'|'ready'|'deleting'|'failed';created_at:string;fingerprint:string;cover?:string;local?:boolean}
export interface FileAnchor {format:'pdf'|'fb2';page?:number;chapter?:string;paragraph?:string;offset?:number;endParagraph?:string;endOffset?:number;quote?:string;prefix?:string;rects?:number[][];fraction?:number}
export interface Entity {kind:string;entity_id:string;revision:number;data:any;updated_at:string}
type Cloud={session:Session|null;loading:boolean;authorized:boolean;hydrated:boolean;setHydrated:(v:boolean)=>void;books:Book[];storageReady:boolean;error:string;status:string;setStatus:(s:string)=>void;setError:(s:string)=>void;refresh:()=>Promise<void>;records:Entity[];setRecords:(e:Entity[])=>void;loginOpen:boolean;setLoginOpen:(v:boolean)=>void};
const CloudContext=createContext<Cloud|null>(null);
export const useCloud=()=>{const v=useContext(CloudContext);if(!v)throw Error('Cloud context missing');return v};
export async function fileApi(action:string,p:Record<string,unknown>={}){
 const {data:{session}}=await supabase.auth.getSession();if(!session)throw Error('Войди в личную учетную запись');
 const response=await fetch('https://hmdjcxpogdrveddznedx.supabase.co/functions/v1/antonovium-library',{method:'POST',headers:{'Content-Type':'application/json','apikey':'sb_publishable_6mDpQ-hKERSZngTl8Ki5LQ_JkHGbOd4','Authorization':`Bearer ${session.access_token}`},body:JSON.stringify({action,...p})});
 const data=await response.json();if(!response.ok)throw Error(data.error??'Ошибка облачного хранилища');return data;
}
export function CloudProvider({children}:{children:ReactNode}){
 const[session,setSession]=useState<Session|null>(null),[loading,setLoading]=useState(true),[hydrated,setHydrated]=useState(false),[authorized,setAuthorized]=useState(false),[verifiedUser,setVerifiedUser]=useState(''),[books,setBooks]=useState<Book[]>([]),[storageReady,setStorageReady]=useState(false),[error,setError]=useState(''),[status,setStatus]=useState(''),[records,setRecords]=useState<Entity[]>([]),[loginOpen,setLoginOpen]=useState(false);
 const generation=useRef(0);
 async function refresh(){const ticket=generation.current;const {data,error}=await supabase.from('av_books').select('id,title,author,edition,format,original_name,size_bytes,status,created_at,fingerprint,cover').order('created_at',{ascending:false});if(error)throw Error('Не удалось обновить каталог');if(generation.current===ticket)setBooks(data??[]);}
 useEffect(()=>{supabase.auth.getSession().then(({data})=>{setSession(data.session);setLoading(false)}).catch(()=>{setLoading(false);setError('Не удалось восстановить вход. Проверь соединение.')});const{data:{subscription}}=supabase.auth.onAuthStateChange((_event,s)=>{setSession(s);setLoading(false)});return()=>subscription.unsubscribe()},[]);
 useEffect(()=>{const ticket=++generation.current;setBooks([]);setRecords([]);setHydrated(false);setAuthorized(false);setStorageReady(false);setError('');setStatus('');if(!session)return;
  const verify=()=>{void fileApi('hello').then(async h=>{if(generation.current!==ticket)return;setVerifiedUser(session.user.id);setAuthorized(true);setStorageReady(h.storage_ready);setError('');await refresh()}).catch(e=>{if(generation.current===ticket)setError(e.message)})};
  verify();window.addEventListener('online',verify);return()=>{++generation.current;window.removeEventListener('online',verify)};
 },[session?.user.id]);
 const visible=!!session&&authorized&&verifiedUser===session.user.id;
 return <CloudContext.Provider value={{session,loading,authorized:visible,hydrated:visible&&hydrated,setHydrated,books:visible?books:[],storageReady:visible&&storageReady,error,status,setStatus,setError,refresh,records:visible?records:[],setRecords,loginOpen,setLoginOpen}}>{children}</CloudContext.Provider>;
}
export function useCloudSync(state:SavedState,update:(v:Partial<SavedState>|((s:SavedState)=>SavedState))=>void){
 const cloud=useCloud(),latest=useRef(state),ready=useRef(false),generation=useRef(0),cache=useRef<Record<string,Entity>>({}),pending=useRef(false);latest.current=state;
 const cacheKey=`antonovium.sync.${cloud.session?.user.id??'guest'}`,runner=useRef<()=>Promise<void>>(async()=>{});
 function change(fn:(s:SavedState)=>SavedState){latest.current=fn(latest.current);update(fn)}
 function persist(){localStorage.setItem(cacheKey,JSON.stringify(cache.current))}
 async function pull(){const all:Entity[]=[];for(let offset=0;;offset+=500){const{data,error}=await supabase.from('av_entities').select('*').order('kind').order('entity_id').range(offset,offset+499);if(error)throw Error('Не удалось получить общие записи. Изменения сохранены на устройстве.');all.push(...data??[]);if((data?.length??0)<500)break}return all}
 async function save(kind:string,id:string,data:any,expected=cache.current[`${kind}:${id}`]?.revision??0){const{data:r,error}=await supabase.rpc('av_save_entity',{p_kind:kind,p_id:id,p_expected:expected,p_data:data});if(error)throw Error(error.message);return r as {ok:boolean;row:Entity|null}}
 async function conflict(kind:string,id:string,data:any,remote:Entity|null){
  if(kind==='note'&&!data.deleted){const copy={...data,id:newId(),title:`${data.title} (версия с другого устройства)`};const r=await save('note',copy.id,copy,0);if(!r.ok||!r.row)throw Error('Не удалось сохранить вторую версию заметки');cache.current[syncKey(r.row)]=r.row;change(s=>applyRecords(s,[r.row!]));}
  else{const conflictId=newId(),r=await save('conflict',conflictId,{original_kind:kind,original_id:id,local:data,remote:remote?.data,remote_revision:remote?.revision??0,resolved:false,created_at:new Date().toISOString()},0);if(!r.ok||!r.row)throw Error('Не удалось сохранить обе версии');cache.current[syncKey(r.row)]=r.row;}
 }
 async function run(){if(!ready.current||pending.current)return;pending.current=true;const ticket=generation.current,active=()=>generation.current===ticket;let successful=false;try{
  cloud.setStatus('Синхронизация…');
  // Read remote revisions before writing, so an idle device never overwrites new work.
  const remote=await pull();if(!active())return;
  for(const row of remote){const key=syncKey(row),prior=cache.current[key],local=flatten(latest.current);
   if(!managed(row)){cache.current[key]=row;continue}
   const value=localValue(local,key,prior);
   if(unchanged(local,key,prior)||equal(value,row.data)||!prior&&firstContact(local,key)){
    cache.current[key]=row;
    if(!equal(value,row.data)&&!(row.data.deleted&&!(key in local)))change(s=>{const now=flatten(s);return unchanged(now,key,prior)||equal(localValue(now,key,prior),row.data)||!prior&&firstContact(now,key)?applyRecords(s,[row]):s});
   }else if(!prior||row.revision!==prior.revision){
    await conflict(row.kind,row.entity_id,value,row);if(!active())return;cache.current[key]=row;
    change(s=>equal(localValue(flatten(s),key,prior),value)?applyRecords(s,[row]):s);
   }
  }
  // React may batch updates; yield once before taking the outgoing snapshot.
  await new Promise<void>(resolve=>setTimeout(resolve,0));if(!active())return;
  const local=flatten(latest.current),keys=new Set([...Object.keys(local),...Object.keys(cache.current).filter(k=>managed(cache.current[k]))]);
  for(const key of keys){const prior=cache.current[key];if(unchanged(local,key,prior))continue;const value=localValue(local,key,prior);if(value===undefined)continue;const colon=key.indexOf(':'),kind=key.slice(0,colon),id=key.slice(colon+1),r=await save(kind,id,value);if(!active())return;
   if(!r.ok){await conflict(kind,id,value,r.row);if(r.row)change(s=>equal(localValue(flatten(s),key,prior),value)?applyRecords(s,[r.row!]):s)}if(r.row)cache.current[key]=r.row;
  }
  if(!active())return;cloud.setRecords(Object.values(cache.current));persist();const unresolved=Object.values(cache.current).some(r=>r.kind==='conflict'&&!r.data.resolved);cloud.setError(unresolved?'Сохранены обе версии правок. Выбери нужную в личном аккаунте.':'');cloud.setStatus(unresolved?'Есть две версии правок':'Все изменения сохранены');successful=true;
 }catch(e){if(active()){cloud.setStatus('Есть неотправленные изменения');cloud.setError((e as Error).message)}}finally{if(active()){pending.current=false;if(successful&&Object.entries(flatten(latest.current)).some(([k,v])=>!equal(cache.current[k]?.data,v)))setTimeout(()=>void runner.current(),150)}}}
 runner.current=run;
 useEffect(()=>{const ticket=++generation.current;ready.current=false;pending.current=false;cache.current={};if(!cloud.authorized)return;
  try{cache.current=JSON.parse(localStorage.getItem(cacheKey)??'{}')}catch{}
  // Import the original device workspace automatically, once per account and browser.
  const marker=`antonovium.migrated.${cloud.session!.user.id}`;
  if(!localStorage.getItem(marker)){try{const old=guestBackup();if(old)change(s=>mergeMigration(s,decodeState(old)));localStorage.setItem(marker,'1')}catch{cloud.setError('Локальные записи сохранены. Для переноса открой личный аккаунт.')}}
  ready.current=true;cloud.setHydrated(true);const kickoff=setTimeout(()=>void runner.current(),50);
  const interval=setInterval(()=>{void runner.current();void cloud.refresh().catch(e=>cloud.setError(e.message))},5000);
  const wake=()=>{if(document.visibilityState!=='hidden'){void runner.current();void cloud.refresh().catch(e=>cloud.setError(e.message))}};
  window.addEventListener('online',wake);window.addEventListener('focus',wake);document.addEventListener('visibilitychange',wake);window.addEventListener('antonovium-sync',wake);
  return()=>{if(generation.current===ticket){++generation.current;ready.current=false;pending.current=false}clearTimeout(kickoff);clearInterval(interval);window.removeEventListener('online',wake);window.removeEventListener('focus',wake);document.removeEventListener('visibilitychange',wake);window.removeEventListener('antonovium-sync',wake)};
 },[cloud.authorized,cacheKey]);
 useEffect(()=>{if(!ready.current)return;cloud.setStatus('Сохранение…');const timer=setTimeout(()=>void runner.current(),350);return()=>clearTimeout(timer)},[state,cloud.authorized]);
 return {save,flush:run};
}
export async function saveRecord(kind:string,id:string,data:any,expected:number){const{data:r,error}=await supabase.rpc('av_save_entity',{p_kind:kind,p_id:id,p_expected:expected,p_data:data});if(error)throw Error(error.message);if(!r.ok)throw Error('Запись изменилась на другом устройстве. Обнови ее перед сохранением.');return r.row as Entity;}
export function guestBackup(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)??'null') as SavedState|null}catch{return null}}
