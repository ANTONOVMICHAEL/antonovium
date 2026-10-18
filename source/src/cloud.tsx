import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {createClient,type Session} from '@supabase/supabase-js';
import {defaultState,newId,STORAGE_KEY} from './storage';
import type {SavedState} from './types';
export const supabase=createClient('https://hmdjcxpogdrveddznedx.supabase.co','sb_publishable_6mDpQ-hKERSZngTl8Ki5LQ_JkHGbOd4',{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'implicit',storageKey:'antonovium.auth'}});
export interface Book {id:string;title:string;author:string;edition:string;format:'pdf'|'fb2';original_name:string;size_bytes:number;status:'uploading'|'ready'|'deleting'|'failed';created_at:string;fingerprint:string;cover?:string}
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
 useEffect(()=>{supabase.auth.getSession().then(({data})=>{setSession(data.session);setLoading(false)});const{data:{subscription}}=supabase.auth.onAuthStateChange((_event,s)=>{setSession(s);setLoading(false)});return()=>subscription.unsubscribe()},[]);
 useEffect(()=>{const ticket=++generation.current;setBooks([]);setRecords([]);setHydrated(false);setAuthorized(false);setStorageReady(false);setError('');setStatus('');if(!session)return;
  fileApi('hello').then(async h=>{if(generation.current!==ticket)return;setVerifiedUser(session.user.id);setAuthorized(true);setStorageReady(h.storage_ready);await refresh()}).catch(e=>{if(generation.current===ticket)setError(e.message)});
 },[session?.user.id]);
 const visible=!!session&&authorized&&verifiedUser===session.user.id;
 return <CloudContext.Provider value={{session,loading,authorized:visible,hydrated:visible&&hydrated,setHydrated,books:visible?books:[],storageReady:visible&&storageReady,error,status,setStatus,setError,refresh,records:visible?records:[],setRecords,loginOpen,setLoginOpen}}>{children}</CloudContext.Provider>;
}
export function flatten(s:SavedState):Record<string,any>{
 const entries:Record<string,any>={};for(const [kind,items] of [['source',s.sources],['note',s.notes],['research',s.research]] as const)for(const item of items)if(!item.demo)entries[`${kind}:${item.id}`]=item;
 entries['settings:reader']={theme:s.theme,fontSize:s.fontSize,lineHeight:s.lineHeight,wide:s.wide,readerFont:s.readerFont??'serif',wilkinsActivity:s.wilkinsActivity};entries['manuscript:main']={title:s.manuscriptTitle,body:s.manuscript};return entries;
}
export function canonical(value:any):string{if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';if(value&&typeof value==='object')return '{'+Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';return JSON.stringify(value);}
const equal=(a:unknown,b:unknown)=>canonical(a)===canonical(b);
export function applyRecords(state:SavedState,rows:Entity[]):SavedState{
 const next={...state};for(const[kind,field]of [['source','sources'],['note','notes'],['research','research']]as const){const map=new Map<string,any>((next[field] as any[]).map(v=>[v.id,v]));for(const r of rows.filter(r=>r.kind===kind)){if(r.data.deleted)map.delete(r.entity_id);else map.set(r.entity_id,r.data)}(next as any)[field]=[...map.values()];}
 for(const r of rows){if(r.kind==='settings')Object.assign(next,r.data);if(r.kind==='manuscript'){next.manuscriptTitle=r.data.title;next.manuscript=r.data.body;}}return next;
}
export function useCloudSync(state:SavedState,update:(v:Partial<SavedState>|((s:SavedState)=>SavedState))=>void){
 const cloud=useCloud(),latest=useRef(state),busy=useRef(false),ready=useRef(false),cache=useRef<Record<string,Entity>>({}),mounted=useRef(true);latest.current=state;
 const cacheKey=`antonovium.sync.${cloud.session?.user.id??'guest'}`;
 function persist(){localStorage.setItem(cacheKey,JSON.stringify(cache.current));}
 async function save(kind:string,id:string,data:any,expected?:number){const prior=cache.current[`${kind}:${id}`];const{data:result,error}=await supabase.rpc('av_save_entity',{p_kind:kind,p_id:id,p_expected:expected??prior?.revision??0,p_data:data});if(error)throw Error(error.message);return result as {ok:boolean;conflict?:boolean;row:Entity|null};}
 async function pull(){const all:Entity[]=[];for(let offset=0;;offset+=500){const{data,error}=await supabase.from('av_entities').select('*').order('kind').order('entity_id').range(offset,offset+499);if(error)throw Error('Не удалось получить облачные записи');all.push(...data??[]);if((data?.length??0)<500)break;}return all;}
 async function run(){if(!ready.current||busy.current||!mounted.current)return;busy.current=true;let success=false,noteConflict=false;try{
  cloud.setStatus('Синхронизация…');const local=flatten(latest.current);
  for(const[key,data]of Object.entries(local)){if(equal(cache.current[key]?.data,data))continue;const colon=key.indexOf(':'),kind=key.slice(0,colon),id=key.slice(colon+1),result=await save(kind,id,data);
   if(!mounted.current)return;
   if(!result.ok){
    if(kind==='note'){
     noteConflict=true;const copy={...data,id:newId(),title:`${data.title} (версия с этого устройства)`};const saved=await save('note',copy.id,copy,0);if(!saved.ok||!saved.row)throw Error('Не удалось сохранить конфликт заметки');cache.current[`note:${copy.id}`]=saved.row;update(s=>applyRecords(s,[...result.row?[result.row]:[],saved.row!]));
    }else{
     const conflict={original_kind:kind,original_id:id,local:data,remote:result.row?.data,remote_revision:result.row?.revision??0,resolved:false,created_at:new Date().toISOString()};const saved=await save('conflict',newId(),conflict,0);if(!saved.ok||!saved.row)throw Error('Не удалось сохранить конфликт');cache.current[`conflict:${saved.row.entity_id}`]=saved.row;if(result.row)update(s=>applyRecords(s,[result.row!]));cloud.setRecords(Object.values(cache.current));
    }
    cloud.setError('Обнаружены изменения с другого устройства. Обе версии сохранены; проверь конфликты.');
   }
   if(result.row)cache.current[key]=result.row;
  }
  const remote=await pull(),snapshot=flatten(latest.current),apply:Entity[]=[];
  for(const row of remote){const key=`${row.kind}:${row.entity_id}`,prior=cache.current[key];if(!prior||equal(snapshot[key],prior.data)||equal(snapshot[key],row.data)){cache.current[key]=row;apply.push(row);}}
  if(!mounted.current)return;if(apply.length)update(s=>applyRecords(s,apply));cloud.setRecords(Object.values(cache.current));persist();const unresolved=Object.values(cache.current).some(r=>r.kind==='conflict'&&!r.data.resolved);cloud.setError(unresolved?'Есть конфликт версий. Открой аккаунт, чтобы выбрать сохраненную версию.':noteConflict?'Сохранены две версии заметки. Обе доступны на полях.':'');cloud.setStatus(unresolved?'Есть конфликт версий':'Сохранено в облаке');success=true;
 }catch(e){cloud.setStatus('Есть неотправленные изменения');cloud.setError((e as Error).message)}finally{busy.current=false;if(success&&Object.entries(flatten(latest.current)).some(([k,v])=>!equal(cache.current[k]?.data,v)))setTimeout(()=>void run(),150);}}
 useEffect(()=>{mounted.current=true;ready.current=false;if(!cloud.authorized)return;
  try{cache.current=JSON.parse(localStorage.getItem(cacheKey)??'{}')}catch{cache.current={};}
  (async()=>{try{const rows=await pull();if(!mounted.current)return;const local=flatten(latest.current),apply:Entity[]=[];
   for(const row of rows){const key=`${row.kind}:${row.entity_id}`,prior=cache.current[key];if(!prior||equal(local[key],prior.data)||equal(local[key],row.data)){if(!prior&&local[key]&&!equal(local[key],row.data)&&!equal(local[key],flatten(defaultState)[key]))continue;cache.current[key]=row;apply.push(row);}}
   update(s=>applyRecords(s,apply));cloud.setRecords(rows);persist();ready.current=true;cloud.setHydrated(true);setTimeout(()=>void run(),100);
  }catch(e){cloud.setError((e as Error).message)}})();
  const interval=setInterval(()=>{void run();void cloud.refresh().catch(e=>cloud.setError(e.message))},20000);const online=()=>void run();window.addEventListener('online',online);return()=>{mounted.current=false;ready.current=false;clearInterval(interval);window.removeEventListener('online',online)};
 },[cloud.authorized,cacheKey]);
 useEffect(()=>{if(!ready.current)return;const changed=Object.entries(flatten(state)).some(([k,v])=>!equal(cache.current[k]?.data,v));if(!changed)return;cloud.setStatus('Ожидает отправки');const timer=setTimeout(()=>void run(),200);return()=>clearTimeout(timer)},[state,cloud.authorized]);
 return {save,flush:run};
}
export async function saveRecord(kind:string,id:string,data:any,expected:number){const{data:r,error}=await supabase.rpc('av_save_entity',{p_kind:kind,p_id:id,p_expected:expected,p_data:data});if(error)throw Error(error.message);if(!r.ok)throw Error('Запись изменилась на другом устройстве. Обнови ее перед сохранением.');return r.row as Entity;}
export function guestBackup(){try{return JSON.parse(localStorage.getItem(STORAGE_KEY)??'null') as SavedState|null}catch{return null}}
