import { useMemo, useState } from 'react';
import { useApp } from '../context';
import { categories } from '../data';
import { Arrow, Modal } from './UI';
export default function Search({onClose}:{onClose:()=>void}){
 const{state,openSource,openCategory,openResearch,openNote,navigate}=useApp();const[q,setQ]=useState('');
 const results=useMemo(()=>{const query=q.trim().toLowerCase();if(!query)return[];return [
 ...state.sources.map(s=>({key:s.id,type:'Источник',title:s.title,text:s.sections.flatMap(x=>x.paragraphs.map(p=>p.text)).join(' '),action:()=>openSource(s.id)})),
 ...state.notes.map(n=>({key:n.id,type:n.demo?'Пример заметки':'Моя заметка',title:n.title,text:n.body,action:()=>openNote(n)})),
 ...categories.map(c=>({key:c.id,type:'Категория',title:c.title,text:c.subtitle,action:()=>openCategory(c.id)})),
 ...state.research.map(r=>({key:r.id,type:r.archived?'Архив':'Исследовательская линия',title:r.title,text:r.question,action:()=>{openResearch(r.id);if(r.archived)navigate('archive')}})),
 {key:'manuscript',type:'Рукопись',title:state.manuscriptTitle,text:state.manuscript,action:()=>navigate('manuscripts')},
 ].filter(x=>`${x.title} ${x.text}`.toLowerCase().includes(query)).slice(0,16)},[q,state]);
 return <Modal title="Найти в ANTONOVIUM" onClose={onClose} wide><input className="global-search-input" autoFocus aria-label="Поиск по материалам" placeholder="Понятие, источник, мысль…" value={q} onChange={e=>setQ(e.target.value)}/><div className="search-results">{q.trim()?results.length?results.map(r=><button key={`${r.type}-${r.key}`} onClick={()=>{r.action();onClose()}}><span>{r.type}</span><strong>{r.title}</strong><Arrow diagonal/></button>):<p>Совпадений нет. Попробуй другое слово.</p>:<div className="search-suggestions"><p>Поиск работает по названиям, текстам, заметкам и исследовательским вопросам.</p>{['недобросовестность','основания','вина'].map(word=><button key={word} className="tag" onClick={()=>setQ(word)}>{word}</button>)}</div>}</div><div className="search-footer">Esc - закрыть <span>Ctrl / ⌘ K - открыть поиск</span></div></Modal>;
}
