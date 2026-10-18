import { useEffect, useRef, type ReactNode } from 'react';
import type { Theme } from '../types';
export function Arrow({diagonal=false}:{diagonal?:boolean}){return <span aria-hidden="true" className="arrow">{diagonal?'↗':'→'}</span>}
export function WMark(){return <svg viewBox="0 0 32 26" fill="none" aria-hidden="true"><path d="M2 3L9 23L16 3L23 23L30 3" stroke="currentColor" strokeWidth="2"/><path d="M2 13H30" stroke="currentColor" strokeWidth="1"/></svg>}
export function ThemePicker({value,onChange}:{value:Theme;onChange:(value:Theme)=>void}){
  return <div className="theme-picker" role="group" aria-label="Цветовая тема">{(['cobalt','plum','emerald'] as Theme[]).map((t,i)=><button key={t} className={`theme-dot ${t} ${value===t?'active':''}`} onClick={()=>onChange(t)} aria-label={['Кобальт и коралл','Слива и цитрин','Изумруд и киноварь'][i]} aria-pressed={value===t} title={['Cobalt / Coral','Plum / Citrine','Emerald / Vermilion'][i]}><i/><i/></button>)}</div>;
}
export function Modal({title,children,onClose,wide=false}:{title:string;children:ReactNode;onClose:()=>void;wide?:boolean}){
  const ref=useRef<HTMLDivElement>(null);
  useEffect(()=>{const prior=document.activeElement as HTMLElement;const node=ref.current;(node?.querySelector<HTMLElement>('input:not([type="file"]),textarea,select')??node?.querySelector<HTMLElement>('button'))?.focus();
    function key(e:KeyboardEvent){if(e.key==='Escape'){e.preventDefault();onClose()}if(e.key==='Tab'){const focusables=Array.from(node?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),select:not(:disabled),[tabindex="0"]')??[]);const first=focusables[0],last=focusables.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus()}}}
    document.addEventListener('keydown',key);const overflow=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.removeEventListener('keydown',key);document.body.style.overflow=overflow;prior?.focus()};},[onClose]);
  return <div className="modal-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><div ref={ref} className={`modal ${wide?'wide':''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-head"><h2 id="modal-title">{title}</h2><button className="icon-button" onClick={onClose} aria-label="Закрыть окно">×</button></div>{children}</div></div>;
}
export function Label({children}:{children:ReactNode}){return <span className="eyebrow">{children}</span>}
export function Empty({title,children}:{title:string;children:ReactNode}){return <div className="empty"><span className="empty-symbol" aria-hidden="true">[ ]</span><h3>{title}</h3><p>{children}</p></div>}
