import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useApp } from '../context';
import { useCloud } from '../cloud';
import { useLocalBooks } from '../localBooks';
import { createQuotation, getBibliography } from '../scientificMemory';
import { askWilkinsReader, getWilkinsReaderContext, clampCompanion, companionBounds, parseWilkinsCommand, type WilkinsCommand, type WilkinsPose } from '../wilkinsCompanion';
import type { Excerpt } from '../types';
import Wilkins3D from './Wilkins3D';
import './wilkins-companion.css';

const PREFIX='antonovium.wilkins.';
const preference=(key:string)=>{try{return localStorage.getItem(PREFIX+key)}catch{return null}};
const persist=(key:string,value:string)=>{try{localStorage.setItem(PREFIX+key,value)}catch{/* Presence preferences are optional. */}};
type Props={called:boolean;suspended:boolean;onDismiss:()=>void;onDetails:()=>void;onSearch:(query:string)=>void};

export default function WilkinsCompanion({called,suspended,onDismiss,onDetails,onSearch}:Props){
 const {state,update,selection,setSelection,navigate,openSource,openNote,composeNote,setWilkins}=useApp();
 const cloud=useCloud(),local=useLocalBooks();
 const [hidden,setHidden]=useState(()=>preference('hidden')==='yes');
 const [parked,setParked]=useState(()=>preference('parked')==='yes');
 const [motion,setMotion]=useState(()=>preference('motion')!=='off');
 const [pose,setPose]=useState<WilkinsPose>('idle'),[facing,setFacing]=useState(0),[reaction,setReaction]=useState(0);
 const [talk,setTalk]=useState(''),[answer,setAnswer]=useState('Я здесь. Что делаем?'),[request,setRequest]=useState('');
 const [list,setList]=useState(false),[examples,setExamples]=useState(false),[scrolling,setScrolling]=useState(false);
 const [viewport,setViewport]=useState(()=>({width:window.innerWidth,height:window.visualViewport?.height??window.innerHeight}));
 const [anchor,setAnchor]=useState({x:0,y:0}),[reduced,setReduced]=useState(()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches);
 const actor=useRef<HTMLDivElement>(null),chat=useRef<HTMLElement>(null),position=useRef({x:0,y:0}),route=useRef(0),initialized=useRef(false);
 const talkTimer=useRef<ReturnType<typeof setTimeout>|null>(null),poseTimer=useRef<ReturnType<typeof setTimeout>|null>(null),scrollTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const reading=state.screen==='reader',bounds=companionBounds(viewport.width,viewport.height,reading),open=called&&!hidden;
 const source=[...state.sources,...local.books,...(cloud.authorized?cloud.books:[])].find(item=>item.id===state.sourceId);
 const currentNotes=state.notes.filter(note=>note.sourceId===state.sourceId||note.relatedSourceIds?.includes(state.sourceId));
 const noteContext:Excerpt|undefined=selection??(source?{sourceId:source.id,sectionId:state.sectionId,quote:'',anchors:[],sourceTitle:source.title,localOnly:('local'in source&&source.local===true)||('localOnly'in source&&source.localOnly===true)}:undefined);
 const visible=!hidden&&!suspended&&(state.wilkinsActivity!=='request'||called);
 const environment=useRef({open,reading,parked,motion:motion&&!reduced,visible,bounds});
 environment.current={open,reading,parked,motion:motion&&!reduced,visible,bounds};
 const basePose=()=>environment.current.parked?'sleep':environment.current.reading?'read':'idle';

 const place=useCallback((x:number,y:number)=>{
  position.current={x,y};if(actor.current)actor.current.style.transform=`translate3d(${x}px,${y}px,0)`;
 },[]);
 const stop=useCallback(()=>{cancelAnimationFrame(route.current);route.current=0},[]);
 const gesture=useCallback((value:WilkinsPose,duration=1800)=>{
  stop();if(poseTimer.current)clearTimeout(poseTimer.current);setPose(value);setReaction(v=>v+1);
  poseTimer.current=setTimeout(()=>setPose(basePose()),duration);
 },[stop]);
 const say=useCallback((text:string,value:WilkinsPose='wave',duration=6500)=>{
  if(talkTimer.current)clearTimeout(talkTimer.current);setTalk(text);gesture(value);
  talkTimer.current=setTimeout(()=>setTalk(''),duration);
 },[gesture]);
 const travel=useCallback((x:number,y:number,done?:()=>void)=>{
  stop();if(poseTimer.current)clearTimeout(poseTimer.current);const env=environment.current,target=clampCompanion(x,y,env.bounds),start={...position.current};
  setFacing(target.x<start.x?-1:1);setTalk('');
  if(!env.motion){place(target.x,target.y);setAnchor(target);setPose(basePose());done?.();return}
  setPose('walk');const distance=Math.hypot(target.x-start.x,target.y-start.y),duration=Math.max(800,Math.min(6500,distance/72*1000));
  let began=0;
  const step=(now:number)=>{if(document.hidden){route.current=0;setPose(basePose());return}if(!began)began=now;const progress=Math.min(1,(now-began)/duration),ease=progress<.5?2*progress*progress:1-Math.pow(-2*progress+2,2)/2;place(start.x+(target.x-start.x)*ease,start.y+(target.y-start.y)*ease);
   if(progress<1)route.current=requestAnimationFrame(step);else{route.current=0;setAnchor(target);setFacing(0);setPose(basePose());done?.()}};
  route.current=requestAnimationFrame(step);
 },[place,stop]);

 useEffect(()=>{
  const resize=()=>setViewport({width:window.innerWidth,height:window.visualViewport?.height??window.innerHeight});
  window.addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);
  const media=window.matchMedia('(prefers-reduced-motion: reduce)'),change=()=>setReduced(media.matches);media.addEventListener('change',change);
  return()=>{window.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('resize',resize);media.removeEventListener('change',change);stop();if(talkTimer.current)clearTimeout(talkTimer.current);if(poseTimer.current)clearTimeout(poseTimer.current);if(scrollTimer.current)clearTimeout(scrollTimer.current)};
 },[stop]);
 useEffect(()=>{
  const env=environment.current;stop();let next={x:env.bounds.maxX-8,y:env.bounds.maxY};
  if(!initialized.current){try{const saved=JSON.parse(preference('position')??'null');if(saved&&Number.isFinite(saved.x)&&Number.isFinite(saved.y))next=clampCompanion(saved.x*viewport.width,saved.y*viewport.height,env.bounds)}catch{}initialized.current=true;place(next.x,next.y);setAnchor(next);setPose(basePose());}
  else{next=clampCompanion(position.current.x,position.current.y,env.bounds);place(next.x,next.y);setAnchor(next);setPose(basePose());}
 },[viewport.width,viewport.height,reading,place,stop]);
 useEffect(()=>{
  if(!visible){stop();return}
  place(position.current.x,position.current.y);
  if(called){setHidden(false);persist('hidden','no');stop();setAnchor({...position.current});setTalk('');setList(false);setExamples(false);gesture('wave');}
 },[called,visible,gesture,place,stop]);
 // A hidden companion can always be recalled from the existing header button.
 useEffect(()=>{if(called){setHidden(false);persist('hidden','no')}},[called]);
 useEffect(()=>{
  if(!visible||open||parked||!motion||reduced)return;
  const wander=()=>{if(document.hidden||document.activeElement?.matches('input,textarea,[contenteditable="true"]'))return;const env=environment.current;if(env.open||!env.visible)return;
   const target=env.reading?env.bounds.maxX-12-Math.random()*24:env.bounds.minX+Math.random()*(env.bounds.maxX-env.bounds.minX);
   travel(target,env.bounds.maxY);
  };
  const first=setTimeout(wander,reading?18000:4500),timer=setInterval(wander,reading?38000:24000);
  return()=>{clearTimeout(first);clearInterval(timer);stop()};
 },[visible,open,parked,motion,reduced,reading,travel,stop]);
 useEffect(()=>{if(!motion||reduced){stop();setPose(basePose())}},[motion,reduced,stop]);
 useEffect(()=>{if(!suspended)setMotion(preference('motion')!=='off')},[suspended]);
 useEffect(()=>{const action=(event:Event)=>{const detail=(event as CustomEvent<{text:string;pose:WilkinsPose}>).detail;if(detail?.text&&environment.current.visible)say(detail.text,detail.pose)};window.addEventListener('antonovium-wilkins-action',action);return()=>window.removeEventListener('antonovium-wilkins-action',action)},[say]);
 const priorSource=useRef(''),priorNote=useRef(state.notes[0]?.id),priorScreen=useRef(state.screen);
 useEffect(()=>{
  if(reading&&source?.id!==priorSource.current){priorSource.current=source?.id??'';if(visible&&!open&&!parked&&state.wilkinsActivity!=='request'){travel(environment.current.bounds.maxX-8,environment.current.bounds.maxY,()=>say('Я рядом. Выдели фрагмент или позови, если захочешь что-то записать.','read',7000))}}
  if(priorScreen.current!==state.screen){priorScreen.current=state.screen;if(!open)setPose(basePose())}
 },[state.screen,source?.id,visible,open,reading,parked,state.wilkinsActivity,travel,say]);
 useEffect(()=>{const next=state.notes[0];if(next?.id!==priorNote.current){priorNote.current=next?.id;if(next&&!next.demo&&visible)say(`Запись «${next.title.slice(0,75)}» сохранена.`,'celebrate')}},[state.notes,visible,say]);
 useEffect(()=>{if(selection?.quote&&visible&&!open&&state.wilkinsActivity!=='request')say('Фрагмент выбран. Могу сохранить цитату или открыть заметку к нему.','think',6000)},[selection?.quote,visible,open,state.wilkinsActivity,say]);
 useEffect(()=>{
  const readingScroll=(event:Event)=>{const target=event.target;if(!(target instanceof Element)||!target.closest('.reader-scroll,.document-scroll,.ms-editor,.cloud-reader-scroll')||environment.current.open)return;stop();setTalk('');setScrolling(true);setPose('read');if(scrollTimer.current)clearTimeout(scrollTimer.current);scrollTimer.current=setTimeout(()=>{setScrolling(false);setPose(basePose())},900)};
  const visibility=()=>{if(document.hidden){stop();setPose('sleep')}else{setPose(basePose());place(position.current.x,position.current.y)}};
  document.addEventListener('scroll',readingScroll,true);document.addEventListener('visibilitychange',visibility);
  return()=>{document.removeEventListener('scroll',readingScroll,true);document.removeEventListener('visibilitychange',visibility)};
 },[stop,place]);
 useEffect(()=>{if(!open)return;const key=(event:KeyboardEvent)=>{if(event.key==='Escape'){onDismiss();actor.current?.querySelector('button')?.focus()}};document.addEventListener('keydown',key);return()=>document.removeEventListener('keydown',key)},[open,onDismiss]);

 function close(){onDismiss();setList(false);setExamples(false)}
 function hide(){stop();setHidden(true);persist('hidden','yes');close()}
 function stay(value:boolean){setParked(value);persist('parked',value?'yes':'no');stop();setPose(value?'sleep':reading?'read':'idle')}
 function toggleMotion(){const next=!motion;setMotion(next);persist('motion',next?'on':'off')}
 function contextAnswer(){return source?`Сейчас открыто: «${source.title}». Связанных записей: ${currentNotes.length}.${selection?.quote?' Выбран фрагмент текста.':''}`:'Источник пока не открыт. Можно начать с библиотеки, своей записи или рукописи.'}
 function saveQuote(){
  if(reading&&askWilkinsReader('quote')){setAnswer('Цитата сохранена с привязкой к источнику.');gesture('celebrate');return}
  if(!selection?.quote||!source||selection.sourceId!==source.id){setAnswer('Сначала выдели фрагмент в открытом источнике. Сохраню его дословно вместе с ориентиром.');gesture('think');return}
  const quote=createQuotation({source,rawText:selection.quote,anchor:selection.fileAnchor,bibliography:getBibliography(source,state.bibliography?.find(item=>item.sourceId===source.id)),origin:'selection',sectionId:selection.sectionId,anchors:selection.anchors});
  update(s=>({...s,notes:[quote,...s.notes]}));setSelection(null);window.getSelection()?.removeAllRanges();setAnswer('Цитата сохранена с привязкой к источнику.');gesture('celebrate');
 }
 function execute(command:WilkinsCommand){
  setList(false);setExamples(false);
  if(command.kind==='navigate'){close();navigate(command.screen);gesture('wave');return}
  if(command.kind==='search'){close();onSearch(command.query);gesture('think');return}
  if(command.kind==='note'){close();composeNote(selection??(reading?getWilkinsReaderContext():undefined)??noteContext,undefined,undefined,command.body?{body:command.body}:undefined);return}
  if(command.kind==='quote'){saveQuote();return}
  if(command.kind==='notes'){if(reading&&askWilkinsReader('notes')){close();return}setList(true);setAnswer(currentNotes.length?`Вот записи к открытому источнику: ${currentNotes.length}.`:'К текущему источнику пока нет записей.');gesture('think');return}
  if(command.kind==='resume'){if(source){close();openSource(source.id);gesture('read')}else setAnswer('Сначала выбери книгу в библиотеке.');return}
  if(command.kind==='reader'){if(reading&&askWilkinsReader(command.action)){close();gesture(command.action==='bookmark'?'think':'read')}else{setAnswer(command.action==='bookmark'?'Поставить постраничную закладку могу в открытом PDF или FB2. Открой книгу и позови меня.':'Перелистывание доступно в постраничном режиме открытого PDF или FB2.');gesture('think')}return}
  if(command.kind==='walk'){close();stay(false);const b=environment.current.bounds;travel(position.current.x>(b.maxX-b.minX)/2?b.minX+8:b.maxX-8,b.maxY,()=>say('Я тут. Далеко не ухожу.','wave',3500));return}
  if(command.kind==='come'){close();const env=environment.current;travel(env.reading?env.bounds.maxX-8:Math.min(env.bounds.maxX,viewport.width*.64),env.bounds.maxY,()=>{setWilkins(true);setAnswer('Подошел. Можешь перетащить меня в удобное место.');gesture('wave')});return}
  if(command.kind==='stay'){stay(true);close();say('Хорошо. Посижу рядом. Позови, когда понадоблюсь.','sleep',4500);return}
  if(command.kind==='wake'){stay(false);setAnswer('На ногах. Чем займемся?');gesture('wave');return}
  if(command.kind==='hide'){hide();return}
  if(command.kind==='greet'){setAnswer('Привет. Я рядом — пойдем читать или запишем мысль?');gesture('wave',2600);return}
  if(command.kind==='context'){setAnswer(contextAnswer());gesture('think');return}
  if(command.kind==='details'){close();onDetails();return}
  if(command.kind==='help'){setAnswer('Можешь просить меня работать с материалами или просто позвать поближе.');setExamples(true);gesture('wave');return}
  setAnswer('С такой просьбой пока не справлюсь. Могу найти материал в твоей библиотеке, открыть источник, записать мысль, показать записи или поставить закладку.');setExamples(true);gesture('think');
 }
 function submit(event:FormEvent){event.preventDefault();if(!request.trim())return;const value=request;setRequest('');execute(parseWilkinsCommand(value))}
 function call(){stop();setAnchor({...position.current});setWilkins(true);setAnswer(selection?.quote?'Фрагмент у меня перед глазами. Сохраним его или запишем твою мысль?':reading?'Я здесь. Записать мысль, найти материал или показать записи?':'Я здесь. Что делаем?');gesture('wave')}

 if(!visible)return null;
 const chatWidth=Math.min(340,viewport.width-24),chatLeft=Math.max(12,Math.min(viewport.width-chatWidth-12,anchor.x+bounds.width/2-chatWidth/2));
 const above=anchor.y-16,below=viewport.height-anchor.y-bounds.height-16;
 const conversationPosition=above>=260?{bottom:viewport.height-anchor.y+5,maxHeight:Math.min(510,above)}:below>=260?{top:anchor.y+bounds.height+5,maxHeight:Math.min(510,below)}:{top:12,maxHeight:viewport.height-24};
 const hintWidth=Math.min(236,viewport.width-24),hintLeft=Math.max(12,Math.min(viewport.width-hintWidth-12,position.current.x+bounds.width/2-hintWidth/2));
 return <div className={`wilkins-companion ${open?'is-open':''} ${scrolling?'is-scrolling':''} ${motion&&!reduced?'has-motion':'no-motion'} ${reading?'is-reading':''}`} data-pose={pose} aria-label="Вилкинс в лаборатории">
  <div ref={actor} className="wilkins-companion-actor" style={{width:bounds.width,height:bounds.height}}>
   <Wilkins3D motion={motion&&!reduced} reaction={reaction} pose={pose} facing={facing} onInteract={call} onGrab={()=>{stop();if(poseTimer.current)clearTimeout(poseTimer.current);setTalk('');setPose('drag');close()}} onMove={(dx,dy)=>{const next=clampCompanion(position.current.x+dx,position.current.y+dy,environment.current.bounds);place(next.x,next.y)}} onDrop={()=>{const next=clampCompanion(position.current.x,position.current.y,environment.current.bounds);setAnchor(next);persist('position',JSON.stringify({x:next.x/viewport.width,y:next.y/viewport.height}));setFacing(0);gesture('wave',1000)}}/>
   <span className="wilkins-companion-name">Вилкинс</span>
  </div>
  {talk&&!open&&<div className="wilkins-companion-hint" style={{left:hintLeft,bottom:Math.max(12,Math.min(viewport.height-170,viewport.height-position.current.y+5)),width:hintWidth}} role="status"><button className="wilkins-hint-close" aria-label="Скрыть реплику Вилкинса" onClick={()=>setTalk('')}>×</button><p>{talk}</p><button className="wilkins-hint-call" onClick={call}>Позвать ↗</button></div>}
  {open&&<section ref={chat} className="wilkins-conversation" role="dialog" aria-modal="false" aria-label="Поговорить с Вилкинсом" style={{left:chatLeft,width:chatWidth,...conversationPosition}}>
   <header><div><i/><strong>Вилкинс</strong><span>{selection?.quote?'рядом с фрагментом':reading?'в читальном зале':'в лаборатории'}</span></div><button aria-label="Закрыть разговор с Вилкинсом" onClick={close}>×</button></header>
   <div className="wilkins-conversation-content"><p className="wilkins-answer" role="status" aria-live="polite">{answer}</p>
    {list&&<div className="wilkins-note-list">{currentNotes.slice(0,6).map(note=><button key={note.id} onClick={()=>{close();openNote(note)}}><strong>{note.title}</strong><span>{note.body.slice(0,90)}</span></button>)}</div>}
    <div className="wilkins-requests"><button onClick={()=>execute({kind:'note'})}>Записать мысль</button>{selection?.quote?<button onClick={()=>execute({kind:'quote'})}>Сохранить цитату</button>:<button onClick={()=>execute({kind:'notes'})}>Мои записи</button>}<button onClick={()=>execute({kind:'walk'})}>Прогуляйся</button>{reading&&<button onClick={()=>execute({kind:'reader',action:'bookmark'})}>Поставь закладку</button>}</div>
    {examples&&<div className="wilkins-command-examples"><span>Например</span>{['Найди недобросовестность','Запиши мысль: проверить основания оценки','Открой рукопись','Что сейчас в работе?','Не мешай'].map(value=><button key={value} onClick={()=>{setRequest(value);chat.current?.querySelector('input')?.focus()}}>{value}</button>)}<p>Научные ответы пока не формулирую. Работаю с действиями и сохраненными материалами.</p></div>}
    <form onSubmit={submit}><label className="sr-only" htmlFor="wilkins-request">Просьба Вилкинсу</label><input id="wilkins-request" maxLength={2000} autoComplete="off" placeholder="Вилкинс, найди…" value={request} onChange={event=>setRequest(event.target.value)}/><button aria-label="Попросить Вилкинса" disabled={!request.trim()} type="submit">↑</button></form>
   </div>
   <footer><button onClick={()=>execute({kind:'help'})}>Что умеешь?</button><button onClick={()=>{stay(!parked);close();say(parked?'Я снова на ногах.':'Посижу рядом.','wave',3500)}}>{parked?'Гулять':'Тише'}</button><button onClick={toggleMotion} aria-pressed={motion}>{motion?'Движение вкл.':'Движение выкл.'}</button><button onClick={onDetails} aria-label="Настройки Вилкинса">⋯</button><button onClick={hide}>Скрыть</button></footer>
  </section>}
 </div>;
}
