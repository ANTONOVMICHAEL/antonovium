import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useApp } from '../context';
import { useCloud } from '../cloud';
import { useLocalBooks } from '../localBooks';
import { categoryTitle } from '../data';
import { WMark, Label } from './UI';
import {formatBibliography} from '../scientificMemory';
import Wilkins3D from './Wilkins3D';

const DB_NAME='antonovium.private-avatar.v1', EVENT='antonovium-avatar-change';
function openAvatarDB():Promise<IDBDatabase>{
 return new Promise((resolve,reject)=>{
  const req=indexedDB.open(DB_NAME,1);
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('images'))req.result.createObjectStore('images')};
  req.onsuccess=()=>resolve(req.result);
  req.onerror=()=>reject(req.error);
 });
}
async function readAvatar():Promise<Blob|undefined>{
 const db=await openAvatarDB();
 try{return await new Promise((resolve,reject)=>{const req=db.transaction('images').objectStore('images').get('wilkins');req.onsuccess=()=>resolve(req.result instanceof Blob?req.result:undefined);req.onerror=()=>reject(req.error)})}
 finally{db.close()}
}
async function writeAvatar(file:Blob|null):Promise<void>{
 const db=await openAvatarDB();
 try{await new Promise<void>((resolve,reject)=>{const tx=db.transaction('images','readwrite');file?tx.objectStore('images').put(file,'wilkins'):tx.objectStore('images').delete('wilkins');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}
 finally{db.close()}
 window.dispatchEvent(new Event(EVENT));
}
function useAvatar(){
 const [url,setURL]=useState<string|null>(null);
 useEffect(()=>{let active=true,objectURL:string|null=null;
  const refresh=()=>{void readAvatar().then(blob=>{if(!active)return;if(objectURL)URL.revokeObjectURL(objectURL);objectURL=blob?URL.createObjectURL(blob):null;setURL(objectURL)}).catch(()=>{if(active)setURL(null)})};
  refresh();window.addEventListener(EVENT,refresh);
  return()=>{active=false;window.removeEventListener(EVENT,refresh);if(objectURL)URL.revokeObjectURL(objectURL)};
 },[]);
 return url;
}
/** The owner-supplied image stays in this browser's IndexedDB. No asset is bundled or uploaded. */
export function WilkinsAvatar({compact=false}:{compact?:boolean}){
 const url=useAvatar();
 return <span className={`wilkins-v2-avatar ${compact?'compact':''}`} aria-hidden="true">{url?<img src={url} alt=""/>:<WMark/>}</span>;
}
export default function Wilkins({onClose}:{onClose:()=>void}){
 const {state,update,selection,openSource,openCategory,composeNote,toast,navigate}=useApp();
 const cloud=useCloud(),local=useLocalBooks();
 const [prompt,setPrompt]=useState(''),[prepared,setPrepared]=useState(''),[avatarError,setAvatarError]=useState('');
 const [motion,setMotion]=useState(()=>localStorage.getItem('antonovium.wilkins.motion')!=='off');
 const [activity,setActivity]=useState<'open'|'success'|'error'>('open');
 const panel=useRef<HTMLElement>(null);
 const fileInput=useRef<HTMLInputElement>(null);
 const [reaction,setReaction]=useState(0);
 const [representation,setRepresentation]=useState<'model'|'photo'>(()=>localStorage.getItem('antonovium.wilkins.representation')==='photo'?'photo':'model');
 const [imagePosition,setImagePosition]=useState(()=>{
  const saved=Number(localStorage.getItem('antonovium.wilkins.imagePosition'));
  return Number.isFinite(saved)&&saved>=0&&saved<=100?saved:38;
 });
 const avatar=useAvatar();
 const activeId=selection?.sourceId??state.sourceId;
 const source=state.sources.find(s=>s.id===activeId);
 const book=local.books.find(b=>b.id===activeId)??(cloud.authorized?cloud.books.find(b=>b.id===activeId):undefined);
 const section=source?.sections.find(s=>s.id===(selection?.sectionId??state.sectionId));
 const currentTitle=source?.title??book?.title;
 const notes=state.notes.filter(n=>n.sourceId===activeId||n.relatedSourceIds?.includes(activeId)),quotations=notes.filter(note=>note.citation?.sourceId===activeId),bibliography=state.bibliography?.find(record=>record.sourceId===activeId);
 const noteContext=selection??(currentTitle?{sourceId:activeId,sectionId:section?.id??'',quote:'',anchors:[],sourceTitle:currentTitle,localOnly:!!book?.local||source?.localOnly}:undefined);
 const messages=selection?.quote?
  ['Фрагмент выделен. Сохранить его вместе с мыслью?',`К этому источнику уже есть записей: ${notes.length}.`,'Можно перейти от цитаты к собственной заметке.']:
  currentTitle?['Источник открыт. Продолжим чтение?',`К источнику сохранено заметок: ${notes.length}.`,'Могу открыть записи или помочь сформулировать запрос.']:
  ['Начнем с источника или запишем мысль?','Книгу можно добавить прямо с устройства.','Здесь доступны заметки и научная картотека.'];
 const spoken=messages[reaction%messages.length];
 useEffect(()=>{if(activity==='open')return;const timer=setTimeout(()=>setActivity('open'),1500);return()=>clearTimeout(timer)},[activity]);
 useEffect(()=>{const prior=document.activeElement as HTMLElement|null;const previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';panel.current?.querySelector<HTMLElement>('.wilkins-v2-head .icon-button')?.focus();
  const key=(event:KeyboardEvent)=>{if(event.key!=='Tab'||!panel.current)return;const focusables=Array.from(panel.current.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]')).filter(el=>el.getClientRects().length>0);const first=focusables[0],last=focusables.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}};
  document.addEventListener('keydown',key);return()=>{document.removeEventListener('keydown',key);document.body.style.overflow=previousOverflow;prior?.focus()};
 },[]);
 async function chooseAvatar(e:ChangeEvent<HTMLInputElement>){
  const file=e.target.files?.[0];e.target.value='';if(!file)return;
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>2*1024*1024){setAvatarError('Нужен PNG, JPEG или WebP размером до 2 МБ.');setActivity('error');return}
  try{await writeAvatar(file);setAvatarError('');setActivity('success');setRepresentation('photo');localStorage.setItem('antonovium.wilkins.representation','photo');toast('Изображение сохранено только на этом устройстве')}
  catch{setAvatarError('Браузер не разрешил сохранить изображение на устройстве.');setActivity('error')}
 }
 async function removeAvatar(){try{await writeAvatar(null);setRepresentation('model');localStorage.setItem('antonovium.wilkins.representation','model');setAvatarError('');setActivity('success');toast('Личное изображение удалено с этого устройства')}catch{setAvatarError('Не удалось удалить локальный файл.');setActivity('error')}}
 function changeRepresentation(value:'model'|'photo'){setRepresentation(value);localStorage.setItem('antonovium.wilkins.representation',value)}
 function prepare(e:React.FormEvent){
  e.preventDefault();
  setPrepared(`Рабочий запрос\n\nИсточник: ${currentTitle??'не выбран'}${source?.demo?' (демонстрационный материал)':''}\nРаздел: ${section?.title??(book?'место в файле не выбрано':'не выбран')}\n\n${selection?.quote?`Выбранный фрагмент:\n${selection.quote}\n\n`:''}Задача исследователя:\n${prompt.trim()}\n\nНе выдумывай цитаты, реквизиты, судебные акты и источники. Разграничивай проверенные данные, интерпретацию и предположения.`);
  setActivity('success');
 }
 return <aside ref={panel} className={`wilkins-panel wilkins-v2-panel ${motion?'motion-on':'motion-off'}`} data-activity={activity} role="dialog" aria-modal="true" aria-label="Вилкинс — рабочий контекст">
  <div className="wilkins-head wilkins-v2-head"><div><strong>Вилкинс</strong><span>Рядом с твоей работой</span></div><button className="icon-button" aria-label="Закрыть Вилкинса" onClick={onClose}>×</button></div>
  <div className="wilkins-body">
   <section className="wilkins-presence" aria-label="Вилкинс">
    <div className="wilkins-presence-top"><span className="wilkins-presence-kicker"><i/> НА СВЯЗИ</span><span>{currentTitle?'ИСТОЧНИК ОТКРЫТ':'РАБОЧЕЕ ПРОСТРАНСТВО'}</span></div>
    <div className="wilkins-character-space">
     {representation==='photo'&&avatar?<button type="button" className="wilkins-character" onClick={()=>{setReaction(v=>v+1);setActivity('success')}} aria-label="Обратиться к Вилкинсу"><span className="wilkins-character-aura" aria-hidden="true"/><span key={reaction} className="wilkins-character-portrait has-image" style={{'--portrait-y':`${imagePosition}%`} as React.CSSProperties}><img src={avatar} alt=""/></span><span className="wilkins-character-shadow" aria-hidden="true"/></button>:<Wilkins3D motion={motion} reaction={reaction} onInteract={()=>{setReaction(v=>v+1);setActivity('success')}}/>}
    </div>
    <div className="wilkins-mode"><span>{representation==='photo'&&avatar?'Личное фото':'Объёмный образ · поворачивай жестом'}</span>{avatar&&<div role="group" aria-label="Вид Вилкинса"><button type="button" className={representation==='model'?'selected':''} aria-pressed={representation==='model'} onClick={()=>changeRepresentation('model')}>3D</button><button type="button" className={representation==='photo'?'selected':''} aria-pressed={representation==='photo'} onClick={()=>changeRepresentation('photo')}>Фото</button></div>}</div>
    <div className="wilkins-speech" role="status" aria-live="polite"><span className="wilkins-speech-name">Вилкинс</span><p>{spoken}</p></div>
    {!avatar&&<button type="button" className="wilkins-presence-upload" onClick={()=>fileInput.current?.click()}>Добавить фото Вилкинса <span aria-hidden="true">↗</span></button>}
    {avatarError&&<p className="wilkins-presence-error" role="alert">{avatarError}</p>}
    <input ref={fileInput} className="wilkins-visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" aria-label="Добавить фото Вилкинса" onChange={e=>void chooseAvatar(e)}/>
   </section>
   <div className="wilkins-v2-status"><span className="status-line"/>Подсказывает доступные действия на основе открытого материала; интеллектуальный анализ не подключен.</div>
   <div className="wilkins-v2-context"><Label>Сейчас в работе</Label><button onClick={()=>{if(currentTitle)openSource(activeId,section?.id);onClose()}} disabled={!currentTitle}><strong>{currentTitle??'Источник не выбран'}</strong><span>{section?.title??(book?(book.local?'Книга на этом устройстве':'Книга в личной библиотеке'):'Открой материал в библиотеке')} ↗</span></button>{selection?.quote&&<blockquote>{selection.quote}</blockquote>}</div>
   <div className="wilkins-v2-actions"><button onClick={()=>{composeNote(noteContext);onClose()}}>{book?'Записать мысль о книге':'Записать собственную мысль'} <span>+</span></button><button disabled={!currentTitle} onClick={()=>{openSource(activeId);update({mode:'research'});onClose();toast(`Заметок к источнику: ${notes.length}`)}}>Заметки к источнику · {notes.length} <span>↗</span></button><button onClick={()=>{navigate('memory');onClose()}}>Научная память <span>↗</span></button>{(state.wilkinsActivity!=='request'||selection)&&source?.categories.slice(0,state.wilkinsActivity==='active'?4:2).map(id=><button key={id} onClick={()=>{openCategory(id);onClose()}}>{categoryTitle(id)} <span>↗</span></button>)}</div>
   {currentTitle&&<div className="wilkins-v2-context"><Label>Проверяемые материалы</Label><p>Сохранено цитат: {quotations.length}. Сверено с оригиналом: {quotations.filter(note=>note.citation?.verification==='user-confirmed').length}.</p>{bibliography?<><p>{formatBibliography(bibliography,state.bibliographicTemplates?.bibliography??state.bibliographyTemplate)}</p><p className="fineprint">Подтверждено реквизитов: {bibliography.confirmedFields.length}. {bibliography.localOnly?'Карточка хранится на этом устройстве.':''}</p></>:<p>Библиографическая карточка пока не заполнена.</p>}<p className="fineprint">Это сводка сохраненных данных, без оценки содержания источника.</p></div>}
   <details className="wilkins-v2-details"><summary>Присутствие и изображение</summary><label className="assistant-activity">Показывать контекст<select value={state.wilkinsActivity} onChange={e=>update({wilkinsActivity:e.target.value as typeof state.wilkinsActivity})}><option value="request">Только по запросу</option><option value="adaptive">При работе с фрагментом</option><option value="active">Подробнее при чтении</option></select></label><label className="wilkins-v2-motion"><input type="checkbox" checked={motion} onChange={e=>{setMotion(e.target.checked);localStorage.setItem('antonovium.wilkins.motion',e.target.checked?'on':'off')}}/>Анимация персонажа</label><div className="wilkins-v2-upload"><p>Для личного использования можно добавить собственное изображение. Файл остается в этом браузере и не публикуется на GitHub.</p><button className="button outline" type="button" onClick={()=>fileInput.current?.click()}>{avatar?'Заменить изображение':'Выбрать изображение'}</button>{avatar&&<><label className="wilkins-image-position">Положение изображения <input type="range" min="0" max="100" value={imagePosition} onChange={e=>{const value=Number(e.target.value);setImagePosition(value);localStorage.setItem('antonovium.wilkins.imagePosition',String(value))}}/></label><button className="text-link" onClick={()=>void removeAvatar()}>Удалить изображение с устройства</button></>}{avatarError&&<p role="alert">{avatarError}</p>}</div></details>
   <details className="wilkins-v2-details"><summary>Подготовить исследовательский запрос</summary><p>Запрос собирается локально. Ответ языковой модели не запрашивается.</p><form className="wilkins-prompt" onSubmit={prepare}><label>Что нужно проверить?<textarea value={prompt} onChange={e=>setPrompt(e.target.value)} rows={3} placeholder="Сформулируй исследовательский вопрос…" required/></label><button className="button outline" disabled={!prompt.trim()}>Собрать с контекстом →</button></form>{prepared&&<div className="prepared-prompt"><Label>Подготовленный запрос</Label><textarea aria-label="Запрос с контекстом" value={prepared} onChange={e=>setPrepared(e.target.value)} rows={8}/><button className="text-link" onClick={async()=>{try{await navigator.clipboard.writeText(prepared);toast('Запрос скопирован')}catch{toast('Буфер обмена недоступен. Выдели текст вручную.')}}}>Скопировать текст ↗</button></div>}</details>
  </div>
 </aside>;
}
