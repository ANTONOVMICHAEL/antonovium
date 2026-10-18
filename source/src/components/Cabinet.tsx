import { useApp } from '../context';
import { Arrow, Label } from './UI';
import NoteList from './NoteList';
import {CloudUploadButton} from './CloudBooks';
export default function Cabinet(){
 const{state,update,openSource,navigate,openResearch,composeNote,openCategory}=useApp();
 const source=state.sources.find(s=>s.id===state.sourceId)??state.sources[0];
 const section=source?.sections.find(s=>s.id===state.sectionId)??source?.sections[0];
 const number=String((source?.sections.findIndex(s=>s.id===section?.id)??0)+1).padStart(2,'0');
 const date=new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',weekday:'long',timeZone:'Europe/Saratov'}).format(new Date());
 return <main className="page cabinet page-enter" id="main"><div className="page-topline"><Label>Личное исследовательское пространство</Label><span>{date}</span></div>
 <div className="page-heading"><h1>Научный <em>кабинет</em><span className="title-period">.</span></h1><div className="cloud-library-actions"><CloudUploadButton/><button className="button outline" onClick={()=>composeNote()}>Записать мысль <span>+</span></button></div></div>
 <div className="cabinet-lead"><section className="reading-feature" aria-label="Продолжить чтение"><div className="feature-top"><Label>{source?.format==='paper'?'Бумажное чтение':'На полях чтения'}</Label><span className="feature-index">SOURCE / {number}</span></div>
 <div className="reading-feature-content"><div className="feature-kicker">{source?.demo?'Демонстрационный источник':source?.author??'Моя библиотека'}</div><h2>{source?.title??'Место для первого источника'}</h2><p>{section?.title??'Заметки по своему изданию'}</p></div>
 <div className="feature-excerpt"><span className="excerpt-bracket">[</span><p>{section?.paragraphs[1]?.text.slice(0,169)??'Запиши мысль по книге и укажи страницу. Все заметки останутся связаны с конкретным источником.'}{section?.paragraphs[1]?'…':''}</p><span className="excerpt-bracket">]</span></div>
 <div className="feature-bottom"><button className="button light" onClick={()=>source&&openSource(source.id)}>Продолжить {source?.format==='paper'?'работу':'чтение'} <Arrow/></button><span>{source?.format==='digital'?`Раздел ${number} · позиция сохранена`:'Рядом с бумажной книгой'}</span></div>
 </section>
 <section className="research-index"><div className="section-head"><Label>Исследовательские линии</Label><button className="text-link" onClick={()=>navigate('lab')}>Все линии <Arrow diagonal/></button></div>
 {state.research.filter(r=>!r.archived).slice(0,2).map((r,i)=><button className="research-line" key={r.id} onClick={()=>openResearch(r.id)}><span className="research-number">0{i+1}</span><div><span className="research-state">{r.demo?'Демонстрационная линия':'В работе'}</span><h2>{r.title}</h2><p>{r.question}</p></div><Arrow diagonal/></button>)}
 <button className="index-action" onClick={()=>navigate('lab')}><span>От вопроса - к исследованию</span><Arrow/></button></section></div>
 <div className="cabinet-bottom"><section className="recent-notes"><div className="section-head"><Label>Последние заметки</Label><button className="text-link" onClick={()=>{update({mode:'research'});navigate('reader');}}>Открыть поля <Arrow diagonal/></button></div><NoteList notes={[...state.notes].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,2)} compact/></section>
 <section className="atlas-preview"><div className="section-head"><Label>Атлас гражданского права</Label><button className="text-link" onClick={()=>navigate('atlas')} aria-label="Открыть атлас"><Arrow diagonal/></button></div><div className="mini-atlas"><svg viewBox="0 0 360 185" aria-hidden="true"><path d="M180 32V84M180 84L75 143M180 84L288 143"/><circle cx="180" cy="84" r="4"/></svg><button className="mini-node node-one" onClick={()=>openCategory('goodfaith')}>Добросовестность</button><button className="mini-node node-two" onClick={()=>openCategory('badfaith')}>Недобросовестность</button><button className="mini-node node-three" onClick={()=>openCategory('abuse')}>Злоупотребление</button><button className="mini-node node-four" onClick={()=>openCategory('fault')}>Вина</button></div><p className="fineprint">Связи как направления поиска</p></section>
 <section className="manuscript-preview"><div className="section-head"><Label>На письменном столе</Label><span className="micro-index">MS / 01</span></div><div><span className="draft-state">Рабочая рукопись</span><h2>{state.manuscriptTitle}</h2><p>Собственные тезисы, фрагменты и проверенные основания.</p></div><button className="text-link strong" onClick={()=>navigate('manuscripts')}>К рукописи <Arrow/></button></section></div>
 </main>;
}
