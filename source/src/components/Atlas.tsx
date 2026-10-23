import { useMemo, useState } from 'react';
import { useApp } from '../context';
import { categories, connections } from '../data';
import { Arrow, Label } from './UI';

type Layer='relations'|'sources'|'notes'|'lines';
const layers:[Layer,string][]=[['relations','Переходы'],['sources','Источники'],['notes','Заметки'],['lines','Линии']];

export default function Atlas(){
 const {state,update,openCategory,openSource,openNote,openResearch}=useApp();
 const [layer,setLayer]=useState<Layer>('relations'),[query,setQuery]=useState(''),[scale,setScale]=useState(1);
 const active=categories.find(c=>c.id===state.categoryId)??categories[1];
 const linked=connections.filter(edge=>edge.includes(active.id)).map(edge=>edge.find(id=>id!==active.id)!).filter(Boolean);
 const sources=state.sources.filter(source=>source.categories.includes(active.id));
 const notes=state.notes.filter(note=>note.categories.includes(active.id));
 const lines=state.research.filter(research=>research.categories.includes(active.id));
 const matching=useMemo(()=>categories.filter(category=>category.title.toLocaleLowerCase('ru').includes(query.trim().toLocaleLowerCase('ru'))),[query]);

 return <main className="page atlas-page atlas-v2 page-enter" id="main">
  <div className="page-topline"><Label>Интеллектуальный атлас</Label><span>Понятия / материалы / направления работы</span></div>
  <div className="page-heading"><h1>Карта <em>вопросов</em><span className="title-period">.</span></h1></div>
  <div className="atlas-v2-intro"><p>Карта помогает переходить от понятия к источникам и собственным записям. Показанные линии обозначают рабочие переходы без установленного юридического типа связи.</p><label className="atlas-v2-search"><span className="sr-only">Найти понятие</span><input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Поиск понятия"/></label></div>

  <div className="atlas-v2-layout">
   <section className="atlas-v2-map" aria-label="Граф понятий">
    <div className="atlas-v2-maphead"><div><span className="atlas-v2-serial">01 / ПОЛЕ</span><span>Выбери точку, чтобы раскрыть ее материалы</span></div><div className="atlas-v2-zoom" role="group" aria-label="Масштаб карты"><button onClick={()=>setScale(v=>Math.max(.8,+(v-.1).toFixed(1)))} aria-label="Уменьшить карту">−</button><output>{Math.round(scale*100)}%</output><button onClick={()=>setScale(v=>Math.min(1.2,+(v+.1).toFixed(1)))} aria-label="Увеличить карту">+</button></div></div>
    {matching.length===0?<div className="atlas-v2-noresult">Понятие не найдено. Измени запрос.</div>:
     <div className="atlas-v2-viewport"><div className="atlas-v2-field" style={{transform:`scale(${scale})`}}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">{connections.map(([a,b])=>{const from=matching.find(c=>c.id===a),to=matching.find(c=>c.id===b);return from&&to?<line key={`${a}-${b}`} className={a===active.id||b===active.id?'active':''} x1={from.x} y1={from.y} x2={to.x} y2={to.y}/>:null})}</svg>
      {matching.map(category=>{const index=categories.findIndex(c=>c.id===category.id)+1;const count=state.notes.filter(note=>note.categories.includes(category.id)).length;return <button key={category.id} style={{left:`${category.x}%`,top:`${category.y}%`}} className={`atlas-v2-node ${category.id===active.id?'active':''} ${linked.includes(category.id)?'linked':''}`} onClick={()=>update({categoryId:category.id})} aria-pressed={category.id===active.id}><span className="atlas-v2-node-mark"/><span className="atlas-v2-node-id">{String(index).padStart(2,'0')}</span><strong>{category.title}</strong><small>{count?count+' зап.':category.subtitle}</small></button>})}
     </div></div>}
    <div className="atlas-v2-mapfoot"><span><i/>Связи показывают направление исследования</span><span>{String(matching.length).padStart(2,'0')} / {String(categories.length).padStart(2,'0')} понятий</span></div>
   </section>

   <aside className="atlas-v2-inspector" aria-label="Материалы выбранного понятия">
    <div className="atlas-v2-inspector-head"><span className="atlas-v2-serial">02 / В ФОКУСЕ</span><span className="atlas-v2-coordinates">УЗЕЛ {String(categories.findIndex(c=>c.id===active.id)+1).padStart(2,'0')} / {String(categories.length).padStart(2,'0')}</span></div>
    <h2>{active.title}</h2><p className="atlas-v2-subtitle">{active.subtitle}</p>
    <div className="atlas-v2-counts"><span><b>{String(linked.length).padStart(2,'0')}</b> переходов</span><span><b>{String(sources.length).padStart(2,'0')}</b> источников</span><span><b>{String(notes.length).padStart(2,'0')}</b> записей</span></div>
    <div className="atlas-v2-tabs" role="group" aria-label="Материалы понятия">{layers.map(([id,label])=><button key={id} className={layer===id?'active':''} aria-pressed={layer===id} onClick={()=>setLayer(id)}>{label}</button>)}</div>
    <div className="atlas-v2-inspector-list">
     {layer==='relations'&&(linked.length?linked.map((id,index)=><button key={id} onClick={()=>openCategory(id)}><span>{String(index+1).padStart(2,'0')} / рабочий переход</span><strong>{categories.find(c=>c.id===id)?.title}</strong><Arrow diagonal/></button>):<p>Связи пока не обозначены.</p>)}
     {layer==='sources'&&(sources.length?sources.map(source=><button key={source.id} onClick={()=>openSource(source.id)}><span>{source.demo?'Демонстрационный текст':'Источник'}</span><strong>{source.title}</strong><Arrow diagonal/></button>):<p>Источников с такой категорией пока нет.</p>)}
     {layer==='notes'&&(notes.length?notes.map(note=><button key={note.id} onClick={()=>openNote(note)}><span>{note.demo?'Пример записи':'Собственная запись'}</span><strong>{note.title}</strong><Arrow diagonal/></button>):<p>Записей с такой категорией пока нет.</p>)}
     {layer==='lines'&&(lines.length?lines.map(line=><button key={line.id} onClick={()=>openResearch(line.id)}><span>{line.archived?'Архивная':'Рабочая'} исследовательская линия</span><strong>{line.title}</strong><Arrow diagonal/></button>):<p>Исследовательских линий с такой категорией пока нет.</p>)}
    </div><button className="atlas-v2-return" onClick={()=>openSource(state.sourceId,state.sectionId)}>Вернуться к чтению <Arrow/></button>
   </aside>
  </div>
  <nav className="atlas-v2-index" aria-label="Все понятия"><span>УКАЗАТЕЛЬ /</span>{categories.map(category=><button key={category.id} className={category.id===active.id?'active':''} aria-current={category.id===active.id?'true':undefined} onClick={()=>openCategory(category.id)}>{category.title}</button>)}</nav>
 </main>;
}
