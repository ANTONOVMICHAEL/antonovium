import { useApp } from '../context';
import { useCloud } from '../cloud';
import { useLocalBooks, localProgress } from '../localBooks';
import { Arrow } from './UI';
import { CloudUploadButton } from './CloudBooks';

export default function Cabinet() {
  const { state, openSource, openResearch, openNote, navigate, composeNote } = useApp();
  const cloud = useCloud();
  const local = useLocalBooks();
  const book = [...local.books, ...cloud.books].find(item => item.id === state.sourceId);
  const source = state.sources.find(item => item.id === state.sourceId);
  const current = book ?? source;
  const activeLines = state.research.filter(item => !item.archived);
  const line = activeLines.find(item => item.id === state.researchId) ?? activeLines[0];
  const notes = [...state.notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const sourceNote = current && notes.find(item => item.sourceId === current.id);
  const recentNote = notes[0];
  const progress = book && !book.local
    ? cloud.records.find(item => item.kind === 'progress' && item.entity_id === book.id)?.data.anchor
    : book?.local ? localProgress(book.id) : undefined;
  const section = source?.sections.find(item => item.id === state.sectionId) ?? source?.sections[0];
  const location = progress?.format === 'pdf' && progress.page
    ? `Страница ${progress.page} в PDF`
    : progress?.format === 'fb2' && progress.chapter
      ? 'Сохранено место в книге'
      : section?.title ?? (book ? 'Открыть книгу' : 'Выбрать материал');

  return <main className="page cabinet cabinet-v3 page-enter" id="main">
    <div className="cabinet-v3-head">
      <div><span className="cabinet-v3-kicker">ANTONOVIUM <i/> ЛИЧНОЕ ПРОСТРАНСТВО</span>
        <h1>Научный кабинет<span className="cabinet-v3-period">.</span></h1></div>
      <div className="cabinet-v3-actions"><CloudUploadButton/><button className="button outline" onClick={() => composeNote()}>Записать мысль <span aria-hidden="true">+</span></button></div>
    </div>

    <div className="cabinet-v3-current">
      <div className="cabinet-v3-current-head"><span><b>01</b> / ОТКРЫТЫЙ ИСТОЧНИК</span><button onClick={() => navigate('library')}>Библиотека <Arrow diagonal/></button></div>
      <div className="cabinet-v3-current-grid">
        <section className="cabinet-v3-source" aria-labelledby="cabinet-current-title">
          <span className="cabinet-v3-meta">{current ? ('demo' in current && current.demo ? 'Демонстрационный материал' : book?.local ? 'Только на этом устройстве' : book ? 'В личной библиотеке' : 'Собственный текст') : 'Первый источник'}</span>
          <h2 id="cabinet-current-title">{current?.title ?? 'С чего начнем исследование?'}</h2>
          <p className="cabinet-v3-author">{current?.author || (current ? 'Сведения об авторе не указаны' : 'Добавь книгу или текст в библиотеку')}</p>
          {current && <p className="cabinet-v3-location"><span aria-hidden="true">↳</span> {location}</p>}
          <button className="cabinet-v2-primary-action cabinet-v3-primary" onClick={() => current ? openSource(current.id) : navigate('library')}>{current ? 'Продолжить чтение' : 'Открыть библиотеку'} <Arrow/></button>
        </section>
        <aside className="cabinet-v3-margin" aria-label="Запись к открытому источнику">
          <span className="cabinet-v3-meta">НА ПОЛЯХ ЭТОГО ИСТОЧНИКА</span>
          {sourceNote ? <><button className="cabinet-v3-margin-title" onClick={() => openNote(sourceNote)}>{sourceNote.title}</button>
            <p>{sourceNote.body || sourceNote.quote || 'Открыть выделенный фрагмент'}</p>
            <button className="cabinet-v3-small-link" onClick={() => openNote(sourceNote)}>Перейти к записи <Arrow diagonal/></button></>
            : <><p className="cabinet-v3-margin-empty">Заметки к этому источнику появятся здесь, когда ты сохранишь фрагмент или собственное суждение.</p>
              <button className="cabinet-v3-small-link" onClick={() => composeNote()}>Создать заметку <Arrow diagonal/></button></>}
        </aside>
      </div>
    </div>

    <div className="cabinet-v3-work">
      <section className="cabinet-v3-inquiry" aria-labelledby="cabinet-line-title">
        <div className="cabinet-v3-row-head"><span><b>02</b> / ИССЛЕДОВАТЕЛЬСКАЯ ЛИНИЯ</span><button onClick={() => navigate('lab')}>Все линии <Arrow diagonal/></button></div>
        {line ? <><span className="cabinet-v3-meta">{line.demo ? 'ДЕМОНСТРАЦИОННАЯ ЛИНИЯ' : 'В РАБОТЕ'}</span>
          <h2 id="cabinet-line-title">{line.title}</h2>
          <div className="cabinet-v3-question"><span>НАУЧНЫЙ ВОПРОС</span><p>{line.question || 'Вопрос пока не сформулирован'}</p></div>
          {line.hypothesis && <div className="cabinet-v3-hypothesis"><span>РАБОЧАЯ ГИПОТЕЗА</span><p>{line.hypothesis}</p></div>}
          <button className="cabinet-v3-small-link" onClick={() => openResearch(line.id)}>Продолжить исследование <Arrow/></button></>
          : <><h2 id="cabinet-line-title">Поставь исследовательский вопрос</h2><p className="cabinet-v3-empty">В лаборатории можно связать гипотезу, источники и собственные записи.</p><button className="cabinet-v3-small-link" onClick={() => navigate('lab')}>Открыть лабораторию <Arrow/></button></>}
      </section>
      <section className="cabinet-v3-note" aria-labelledby="cabinet-notes-title">
        <div className="cabinet-v3-row-head"><span><b>03</b> / ПОСЛЕДНЯЯ ЗАПИСЬ</span><button onClick={() => composeNote()} aria-label="Создать заметку">+</button></div>
        {recentNote ? <><span className="cabinet-v3-meta">{recentNote.demo ? 'ДЕМОНСТРАЦИОННАЯ ЗАПИСЬ' : 'СОБСТВЕННАЯ ЗАМЕТКА'}</span>
          <h2 id="cabinet-notes-title"><button onClick={() => openNote(recentNote)}>{recentNote.title}</button></h2><p>{recentNote.body || recentNote.quote || 'Открыть выделенный фрагмент'}</p>
          <button className="cabinet-v3-small-link" onClick={() => openNote(recentNote)}>Открыть заметку <Arrow/></button></>
          : <><h2 id="cabinet-notes-title">Место для первого тезиса</h2><p>Запиши наблюдение, вопрос или возражение в ходе чтения.</p><button className="cabinet-v3-small-link" onClick={() => composeNote()}>Создать заметку <Arrow/></button></>}
      </section>
    </div>

    <div className="cabinet-v3-lower">
      <section className="cabinet-v3-manuscript" aria-labelledby="cabinet-writing-title">
        <span><b>04</b> / РУКОПИСЬ</span><div><h2 id="cabinet-writing-title">{state.manuscriptTitle || 'Новая рукопись'}</h2>
          <p>{state.manuscript.trim() ? 'Вернуться к своему тексту' : 'Начать текст'}</p></div>
        <button onClick={() => navigate('manuscripts')} aria-label="Открыть рукопись"><Arrow diagonal/></button>
      </section>
      <nav className="cabinet-v3-shortcuts" aria-label="Рабочие пространства">
        <button onClick={() => navigate('desk')}>Исследовательский стол <Arrow diagonal/></button>
        <button onClick={() => navigate('atlas')}>Интеллектуальный атлас <Arrow diagonal/></button>
      </nav>
    </div>
  </main>;
}
