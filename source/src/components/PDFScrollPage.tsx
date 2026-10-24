import {useEffect,useRef,useState} from 'react';
import type {PDFDocumentProxy} from '../pdf';
import type {Note} from '../types';

export default function PDFScrollPage({pdf,pageNumber,width,zoom,scrollRoot,notes,onNote}:{pdf:PDFDocumentProxy;pageNumber:number;width:number;zoom:number;scrollRoot:React.RefObject<HTMLDivElement|null>;notes:Note[];onNote:(note:Note)=>void}){
 const frame=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null),layer=useRef<HTMLDivElement>(null);
 const[near,setNear]=useState(false),[height,setHeight]=useState(Math.round(width*1.42)),[failed,setFailed]=useState(false);
 useEffect(()=>{if(!frame.current||!scrollRoot.current)return;const observer=new IntersectionObserver(entries=>setNear(entries[0].isIntersecting),{root:scrollRoot.current,rootMargin:'900px 0px'});observer.observe(frame.current);return()=>observer.disconnect()},[scrollRoot]);
 useEffect(()=>{if(!near||!canvas.current||!layer.current)return;let stopped=false,render:{cancel:()=>void}|undefined,textRender:{cancel:()=>void}|undefined;
  (async()=>{try{const page=await pdf.getPage(pageNumber);if(stopped)return;const natural=page.getViewport({scale:1}),viewport=page.getViewport({scale:width/natural.width*zoom}),ratio=Math.min(2,devicePixelRatio||1,4096/Math.max(viewport.width,viewport.height)),cv=canvas.current!,tl=layer.current!;
   setHeight(viewport.height);setFailed(false);cv.width=Math.max(1,Math.floor(viewport.width*ratio));cv.height=Math.max(1,Math.floor(viewport.height*ratio));cv.style.width=`${viewport.width}px`;cv.style.height=`${viewport.height}px`;delete tl.dataset.textReady;tl.innerHTML='';tl.style.width=`${viewport.width}px`;tl.style.height=`${viewport.height}px`;tl.style.setProperty('--total-scale-factor',String(viewport.scale));
   render=page.render({canvas:cv,viewport,transform:ratio===1?undefined:[ratio,0,0,ratio,0,0]});await (render as any).promise;if(stopped)return;
   const text=await page.getTextContent();if(stopped)return;const {TextLayer}=await import('../pdf');const next=new TextLayer({textContentSource:text,container:tl,viewport});textRender=next;await next.render();if(!stopped)tl.dataset.textReady='true';
  }catch{if(!stopped)setFailed(true)}})();
  return()=>{stopped=true;render?.cancel();textRender?.cancel();if(canvas.current){canvas.current.width=0;canvas.current.height=0}if(layer.current){delete layer.current.dataset.textReady;layer.current.innerHTML=''}};
 },[near,pdf,pageNumber,width,zoom]);
 return <div className="cloud-scroll-page-shell" style={{minHeight:height}}><div className="cloud-pdf-page" ref={frame} data-page={pageNumber} style={{width:width*zoom,minHeight:height}}>
  {near&&<><canvas ref={canvas}/><div className="textLayer" ref={layer}/>{notes.flatMap(note=>(note.fileAnchor?.rects??[]).map((rect,i)=><span key={`${note.id}-${i}`} aria-hidden="true" className="cloud-pdf-highlight" style={{left:`${rect[0]*100}%`,top:`${rect[1]*100}%`,width:`${rect[2]*100}%`,height:`${rect[3]*100}%`}}/>))}{notes.filter(note=>note.fileAnchor?.rects?.length).map(note=><button key={note.id} className="cloud-pdf-note-marker" style={{top:`${Math.max(0,(note.fileAnchor!.rects![0][1])*100)}%`}} onClick={()=>onNote(note)} aria-label={`Открыть заметку: ${note.title}`}>●</button>)}</>}
  {failed&&<span className="cloud-page-error">Не удалось отобразить страницу {pageNumber}</span>}
 </div><span className="cloud-page-number">{pageNumber}</span></div>;
}
