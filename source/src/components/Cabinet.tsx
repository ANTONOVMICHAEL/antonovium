import { useApp } from '../context';
import { useCloud } from '../cloud';
import { useLocalBooks, localProgress } from '../localBooks';
import type { Screen } from '../types';
import { Arrow, Label } from './UI';
import { CloudUploadButton } from './CloudBooks';

export default function Cabinet() {
  const { state, openSource, openResearch, openNote, navigate, composeNote } = useApp();
  const cloud = useCloud();
  const local = useLocalBooks();
  const book = [...local.books, ...cloud.books].find(item => item.id === state.sourceId);
  const source = state.sources.find(item => item.id === state.sourceId);
  const current = book ?? source;
  const recentNote = [...state.notes].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  const activeLines = state.research.filter(item => !item.archived);
  const line = activeLines.find(item => item.id === state.researchId) ?? activeLines[0];
  const linkedNotes = current ? state.notes.filter(item => item.sourceId === current.id) : [];
  const progress = book && !book.local
    ? cloud.records.find(item => item.kind === 'progress' && item.entity_id === book.id)?.data.anchor
    : book?.local ? localProgress(book.id) : undefined;
  const section = source?.sections.find(item => item.id === state.sectionId) ?? source?.sections[0];
  const readLocation = progress?.format === 'pdf' && progress.page
    ? `PDF · страница ${progress.page}`
    : progress?.format === 'fb2' && progress.chapter
      ? 'Позиция в книге сохранена'
      : section?.title ?? (book ? 'Открыть книгу' : 'Выбрать источник');

  return <main className="page cabinet cabinet-v2 page-enter" id="main">
    <div className="cabinet-v2-intro">
      <div><Label>ANTONOVIUM / Рабочее пространство</Label><h1>Научный кабинет<span>.</span></h1>
        <p>Возвращайся к источнику, вопросу или рукописи с того места, где остановился.</p></div>
      <div className="cabinet-v2-quick"><CloudUploadButton/><button className="button outline" onClick={() => composeNote()}>Записать мысль <span aria-hidden="true">+</span></button></div>
    </div>

    <div className="cabinet-v2-grid">
      <section className="cabinet-v2-reading" aria-labelledby="cabinet-reading-title">
        <div className="cabinet-v2-sectiontop"><Label>Продолжить чтение</Label><span>{book?.format?.toUpperCase() ?? (source?.format === 'paper' ? 'БУМАЖНОЕ ИЗДАНИЕ' : 'ТЕКСТ')}</span></div>
        <div className="cabinet-v2-readingbody">
          <span className="cabinet-v2-overline">{current ? ('demo' in current && current.demo ? 'Демонстрационный материал' : current.author || 'Источник из библиотеки') : 'Библиотека'}</span>
          <h2 id="cabinet-reading-title">{current?.title ?? 'Начни со своего первого источника'}</h2>
          <p>{current ? readLocation : 'Добавь PDF, FB2, текст или сведения о бумажной книге.'}</p>
        </div>
        {linkedNotes.length > 0 && <div className="cabinet-v2-readingnote"><span>Связанная заметка</span><button onClick={() => openNote(linkedNotes[0])}>{linkedNotes[0].title}<Arrow diagonal/></button></div>}
        <button className="cabinet-v2-primary-action" onClick={() => current ? openSource(current.id) : navigate('library')}>
          {current ? 'Вернуться к источнику' : 'Открыть библиотеку'} <Arrow/>
        </button>
      </section>

      <section className="cabinet-v2-line" aria-labelledby="cabinet-line-title">
        <div className="cabinet-v2-sectiontop"><Label>Исследовательская линия</Label><button onClick={() => navigate('lab')} aria-label="Открыть все исследовательские линии"><Arrow diagonal/></button></div>
        {line ? <><span className="cabinet-v2-overline">{line.demo ? 'Демонстрационная линия' : 'Текущая работа'}</span>
          <h2 id="cabinet-line-title">{line.title}</h2><div className="cabinet-v2-question"><span>Вопрос</span><p>{line.question || 'Научный вопрос еще не сформулирован'}</p></div>
          <button className="cabinet-v2-link" onClick={() => openResearch(line.id)}>Продолжить рассуждение <Arrow/></button></>
          : <><h2 id="cabinet-line-title">Начни с научного вопроса</h2><p>Исследовательские линии появятся здесь после создания.</p><button className="cabinet-v2-link" onClick={() => navigate('lab')}>Открыть лабораторию <Arrow/></button></>}
      </section>

      <section className="cabinet-v2-notes" aria-labelledby="cabinet-notes-title">
        <div className="cabinet-v2-sectiontop"><Label>Последняя запись</Label><button onClick={() => composeNote()} aria-label="Создать заметку">+</button></div>
        {recentNote ? <><span className="cabinet-v2-overline">{recentNote.demo ? 'Демонстрационная запись' : 'Собственная заметка'}</span>
          <h2 id="cabinet-notes-title"><button onClick={() => openNote(recentNote)}>{recentNote.title}</button></h2>
          <p>{recentNote.body || recentNote.quote || 'Открыть выделенный фрагмент'}</p><button className="cabinet-v2-link" onClick={() => openNote(recentNote)}>Открыть заметку <Arrow/></button></>
          : <><h2 id="cabinet-notes-title">Мысль начинается здесь</h2><p>Сохрани свой тезис или вопрос, чтобы вернуться к нему позже.</p><button className="cabinet-v2-link" onClick={() => composeNote()}>Создать заметку <Arrow/></button></>}
      </section>

      <section className="cabinet-v2-writing" aria-labelledby="cabinet-writing-title">
        <div className="cabinet-v2-sectiontop"><Label>Рукопись</Label><span>ПИСЬМЕННЫЙ СТОЛ</span></div>
        <h2 id="cabinet-writing-title">{state.manuscriptTitle || 'Новая рукопись'}</h2>
        <p>{state.manuscript.trim() ? 'Продолжить работу над собственным текстом.' : 'Чистый лист для следующего рассуждения.'}</p>
        <button className="cabinet-v2-link" onClick={() => navigate('manuscripts')}>К рукописи <Arrow/></button>
      </section>

      <div className="cabinet-v2-access"><button onClick={() => navigate('library')}>Вся библиотека <Arrow diagonal/></button><button onClick={() => navigate('desk' as Screen)}>Исследовательский стол <Arrow diagonal/></button><button onClick={() => navigate('atlas')}>Интеллектуальный атлас <Arrow diagonal/></button></div>
    </div>
  </main>;
}
