import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useApp } from '../context';
import { useCloud } from '../cloud';
import { useLocalBooks } from '../localBooks';
import { downloadFile } from '../storage';
import type { Note } from '../types';
import './manuscript-studio.css';

type Panel = 'notes' | 'sources' | 'outline';
const POSITION_KEY = 'antonovium.manuscript.editor-position';

export default function Manuscripts() {
  const { state, update, toast, openSource } = useApp();
  const cloud = useCloud();
  const local = useLocalBooks();
  const [showContext, setShowContext] = useState(() => window.matchMedia('(min-width: 900px)').matches);
  const [focus, setFocus] = useState(false);
  const [panel, setPanel] = useState<Panel>('notes');
  const [noteQuery, setNoteQuery] = useState('');
  const [columnWidth, setColumnWidth] = useState(() => {
    const width = Number(localStorage.getItem('antonovium.manuscript.width'));
    return width >= 580 && width <= 940 ? width : 740;
  });
  const editor = useRef<HTMLTextAreaElement>(null);
  const caret = useRef({ start: -1, end: -1 });
  const isDemo = state.manuscript.startsWith('Демонстрационная рукопись');
  const query = noteQuery.trim().toLocaleLowerCase('ru');
  const notes = useMemo(() => state.notes
    .filter(note => `${note.title} ${note.body}`.toLocaleLowerCase('ru').includes(query))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [state.notes, query]);
  const sources = useMemo(() => {
    const ids = new Set(state.notes.map(note => note.sourceId).filter((id): id is string => Boolean(id)));
    return [...state.sources, ...local.books, ...cloud.books].filter(source => ids.has(source.id));
  }, [state.notes, state.sources, local.books, cloud.books]);
  const outline = useMemo(() => {
    const result: { title: string; start: number; level: number }[] = [];
    const re = /^(#{1,4}\s+.+|(?:ГЛАВА|Глава|§)\s*\S.*|\d+(?:\.\d+)*\.?\s+[^\n]{4,100})$/gm;
    for (const match of state.manuscript.matchAll(re)) {
      result.push({ title: match[0].replace(/^#{1,4}\s+/, ''), start: match.index ?? 0, level: match[0].startsWith('#') ? match[0].match(/^#+/)![0].length : 1 });
    }
    return result;
  }, [state.manuscript]);

  useEffect(() => {
    document.documentElement.classList.toggle('manuscript-focus', focus);
    return () => document.documentElement.classList.remove('manuscript-focus');
  }, [focus]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showContext) setShowContext(false);
      else if (focus) setFocus(false);
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [focus, showContext]);
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(POSITION_KEY) || '{}') as { start?: number; end?: number; scroll?: number };
      if (typeof saved.start === 'number' && typeof saved.end === 'number') {
        caret.current = { start: saved.start, end: saved.end };
        editor.current?.setSelectionRange(saved.start, saved.end);
      }
      if (typeof saved.scroll === 'number' && editor.current) editor.current.scrollTop = saved.scroll;
    } catch { /* Working position is optional when browser storage is restricted. */ }
  }, []);

  function rememberPosition() {
    if (!editor.current) return;
    const { selectionStart: start, selectionEnd: end, scrollTop: scroll } = editor.current;
    caret.current = { start, end };
    try { sessionStorage.setItem(POSITION_KEY, JSON.stringify({ start, end, scroll })); } catch { /* Optional working context. */ }
  }
  function jump(start: number) {
    setShowContext(false);
    requestAnimationFrame(() => {
      editor.current?.focus();
      editor.current?.setSelectionRange(start, start);
      caret.current = { start, end: start };
      rememberPosition();
    });
  }
  function insert(note: Note) {
    const at = caret.current.start >= 0 && caret.current.start <= state.manuscript.length
      ? caret.current : { start: state.manuscript.length, end: state.manuscript.length };
    const insertion = `\n\n${note.demo ? '[Демонстрационная заметка] ' : ''}${note.title}\n${note.body}\n`;
    update(s => ({ ...s, manuscript: s.manuscript.slice(0, at.start) + insertion + s.manuscript.slice(at.end) }));
    const pos = at.start + insertion.length;
    caret.current = { start: pos, end: pos };
    setShowContext(false);
    requestAnimationFrame(() => {
      editor.current?.focus();
      editor.current?.setSelectionRange(pos, pos);
      rememberPosition();
    });
    toast('Запись вставлена в рукопись');
  }
  function toggleFocus() {
    if (!focus) { setShowContext(false); setFocus(true); }
    else setFocus(false);
    requestAnimationFrame(() => editor.current?.focus());
  }
  function exportText() {
    downloadFile('ANTONOVIUM_Manuscript.md', `# ${state.manuscriptTitle}\n\n${state.manuscript}`);
    toast('Рукопись экспортирована');
  }

  return <main className={`page manuscript-studio page-enter ${focus ? 'editor-focus' : ''}`} id="main">
    <header className="ms-intro">
      <div className="ms-intro-copy"><span className="ms-kicker">06 / РАБОЧИЙ ТЕКСТ</span><h1>Научный редактор<span aria-hidden="true">.</span></h1><p>Здесь мысль остается твоей. Продолжай рукопись, сверяясь с записями и источниками.</p></div>
      <div className="ms-intro-aside"><span>{isDemo ? 'Демонстрационная заготовка' : 'Личная рукопись'}</span><span className="ms-status"><i aria-hidden="true"/>Изменения сохраняются при вводе{cloud.authorized ? ` · облако: ${cloud.status || 'состояние уточняется'}` : ' · на устройстве'}</span></div>
    </header>

    <div className="ms-commandbar" aria-label="Инструменты редактора">
      <div className="ms-command-group"><span>Рукопись</span><button type="button" onClick={exportText}>Экспорт <span aria-hidden="true">↗</span></button></div>
      <div className="ms-command-group ms-context-command"><span>Рабочий контекст</span><button type="button" aria-expanded={showContext && !focus} onClick={() => { if (focus) setFocus(false); setShowContext(v => !v); }}>{showContext && !focus ? 'Скрыть материалы' : 'Открыть материалы'} <span aria-hidden="true">{showContext && !focus ? '−' : '+'}</span></button></div>
      <div className="ms-command-group ms-view-command"><span>Вид текста</span><label className="ms-width-control">Ширина <input aria-label="Ширина текстовой колонки" type="range" min="580" max="940" step="20" value={columnWidth} onChange={e => { const width = Number(e.target.value); setColumnWidth(width); localStorage.setItem('antonovium.manuscript.width', String(width)); }} /></label><button type="button" className={focus ? 'is-active' : ''} aria-pressed={focus} onClick={toggleFocus}>{focus ? 'Выйти из режима письма' : 'Режим письма'} <span aria-hidden="true">⤢</span></button></div>
    </div>

    <div className={`ms-workspace ${showContext && !focus ? 'has-context' : ''}`}>
      <section className="ms-document" aria-label="Текст рукописи" style={{ '--ms-column-width': `${columnWidth}px` } as CSSProperties}>
        <div className="ms-document-top"><span>РУКОПИСЬ / 01</span><span>СОБСТВЕННЫЙ ТЕКСТ</span></div>
        <div className="ms-document-inner">
          <label className="ms-field-label" htmlFor="ms-title">Название работы</label>
          <textarea id="ms-title" className="ms-title" rows={2} value={state.manuscriptTitle} onChange={e => update({ manuscriptTitle: e.target.value })} placeholder="Название рукописи" maxLength={240}/>
          <div className="ms-divider"/>
          <label className="ms-field-label" htmlFor="ms-body">Текст рукописи</label>
          <textarea ref={editor} id="ms-body" className="ms-body" value={state.manuscript} onChange={e => { update({ manuscript: e.target.value }); rememberPosition(); }} onSelect={rememberPosition} onScroll={rememberPosition} onBlur={rememberPosition} spellCheck style={{ fontSize: state.fontSize, lineHeight: state.lineHeight }} placeholder="Начни писать…"/>
        </div>
        <footer className="ms-document-foot"><span><i aria-hidden="true"/>Автосохранение{cloud.authorized ? ` · ${cloud.status || 'проверка облака'}` : ' на устройстве'}</span><span>{state.manuscript.trim().split(/\s+/).filter(Boolean).length.toLocaleString('ru-RU')} слов</span></footer>
      </section>

      {showContext && !focus && <><button className="ms-context-scrim" type="button" aria-label="Закрыть исследовательские материалы" onClick={() => setShowContext(false)} />
        <aside className="ms-context" aria-label="Исследовательские материалы">
          <div className="ms-context-head"><div><span className="ms-kicker">ПОД РУКОЙ</span><h2>Контекст</h2></div><button className="ms-context-close" type="button" aria-label="Закрыть исследовательские материалы" onClick={() => setShowContext(false)}>×</button></div>
          <div className="ms-tabs" role="group" aria-label="Материалы к рукописи">{([['notes', 'Записи'], ['sources', 'Источники'], ['outline', 'Структура']] as const).map(([key, label]) => <button key={key} type="button" aria-pressed={panel === key} className={panel === key ? 'active' : ''} onClick={() => setPanel(key)}>{label}</button>)}</div>
          <div className="ms-context-scroll">
            {panel === 'notes' && <><p className="ms-panel-intro">Вставь запись в позицию курсора или вернись к первоисточнику.</p><label className="ms-search"><span className="sr-only">Поиск по записям</span><input type="search" value={noteQuery} onChange={e => setNoteQuery(e.target.value)} placeholder="Найти запись"/></label>
              <div className="ms-note-list">{notes.length ? notes.map(note => <article key={note.id} className="ms-note"><span className="ms-note-meta">{note.demo ? 'Демонстрационная' : 'Собственная'} · {note.kind === 'thesis' ? 'тезис' : note.kind === 'question' ? 'вопрос' : 'мысль'}</span><h3>{note.title}</h3>{note.body && <p>{note.body}</p>}<div className="ms-note-actions"><button type="button" onClick={() => insert(note)}>Вставить в текст <span aria-hidden="true">↗</span></button>{note.sourceId && <button type="button" onClick={() => openSource(note.sourceId!, note.sectionId, note.anchors?.[0]?.paragraphId)}>К источнику <span aria-hidden="true">↗</span></button>}</div></article>) : <p className="ms-empty">{query ? 'Записей по запросу нет.' : 'Пока нет исследовательских записей.'}</p>}</div></>}
            {panel === 'sources' && <><p className="ms-panel-intro">Источники, к которым привязаны твои записи. Открой книгу для проверки фрагмента.</p>{sources.length ? sources.map(source => <button type="button" className="ms-source" key={source.id} onClick={() => openSource(source.id)}><span>{'demo' in source && source.demo ? 'Демонстрационный источник' : source.author || 'Источник'}</span><strong>{source.title}</strong><small>Открыть в читальном зале ↗</small></button>) : <p className="ms-empty">Связанных источников пока нет. Привяжи запись к книге в читальном зале.</p>}</>}
            {panel === 'outline' && <><p className="ms-panel-intro">Заголовки определяются по строкам с «#», «Глава», «§» или номером раздела.</p>{outline.length ? outline.map((item, index) => <button type="button" key={`${item.start}-${index}`} className="ms-outline-item" style={{ paddingLeft: `${Math.min(item.level - 1, 3) * 14}px` }} onClick={() => jump(item.start)}><span>{String(index + 1).padStart(2, '0')}</span><strong>{item.title}</strong></button>) : <p className="ms-empty">В тексте пока нет распознанных заголовков.</p>}</>}
          </div>
        </aside></>}
    </div>
  </main>;
}
