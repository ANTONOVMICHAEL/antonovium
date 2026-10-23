import {useApp} from '../context';

export default function ReaderRail({title,author,location,format,onTools,onSearch}:{title:string;author?:string;location:string;format:string;onTools?:()=>void;onSearch?:()=>void}){
 const {navigate}=useApp();
 return <aside className="reader-rail" aria-label="Навигация читального зала">
  <button className="reader-rail-brand" onClick={()=>navigate('cabinet')} aria-label="ANTONOVIUM · научный кабинет"><span className="reader-rail-monogram">A<span>·</span></span><span className="reader-rail-wordmark">ANTONOVIUM</span></button>
  <div className="reader-rail-source"><span className="reader-rail-kicker">Читальный зал</span><strong title={title}>{title}</strong>{author&&<p>{author}</p>}<span className="reader-rail-format">{format}</span></div>
  <div className="reader-rail-spacer"/>
  <div className="reader-rail-location"><span>Место в книге</span><strong>{location}</strong></div>
  {onSearch&&<button className="reader-rail-tool" onClick={onSearch}>Поиск в источнике <span aria-hidden="true">↗</span></button>}
  {onTools&&<button className="reader-rail-tool" onClick={onTools}>Инструменты чтения <span aria-hidden="true">↗</span></button>}
  <nav className="reader-rail-nav" aria-label="Разделы"><button onClick={()=>navigate('library')}>Библиотека <span>↗</span></button><button onClick={()=>navigate('desk')}>Исследовательский стол <span>↗</span></button><button onClick={()=>navigate('cabinet')}>Кабинет <span>↗</span></button></nav>
 </aside>
}
