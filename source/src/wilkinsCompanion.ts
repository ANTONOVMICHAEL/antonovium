import type { Excerpt, Screen } from './types';

export type WilkinsPose = 'idle' | 'walk' | 'read' | 'wave' | 'think' | 'celebrate' | 'sleep' | 'drag';
export type ReaderRequest = 'next' | 'previous' | 'bookmark' | 'notes' | 'quote';
type ReaderHandler = (action: ReaderRequest) => boolean;
let readerHandler: ReaderHandler | null = null;
let readerContext: (()=>Excerpt) | null = null;
/** Readers own paging and saving. The companion never simulates clicks or guesses a file position. */
export function registerWilkinsReader(handler: ReaderHandler, context?:()=>Excerpt) {
  readerHandler = handler;readerContext=context??null;
  return () => { if (readerHandler === handler) { readerHandler = null;readerContext=null; } };
}
export function askWilkinsReader(action: ReaderRequest) { return readerHandler?.(action) ?? false; }
export function getWilkinsReaderContext() { return readerContext?.(); }
export function announceWilkins(text:string,pose:WilkinsPose='wave') {
  window.dispatchEvent(new CustomEvent('antonovium-wilkins-action',{detail:{text,pose}}));
}

export type WilkinsCommand =
  | { kind: 'navigate'; screen: Screen }
  | { kind: 'search'; query: string }
  | { kind: 'note'; body?: string }
  | { kind: 'quote' | 'notes' | 'resume' | 'context' | 'greet' | 'help' | 'walk' | 'come' | 'stay' | 'hide' | 'wake' | 'details' }
  | { kind: 'reader'; action: ReaderRequest }
  | { kind: 'unknown' };

export function parseWilkinsCommand(raw: string): WilkinsCommand {
  const text = raw.trim().replace(/^(?:вилкинс|wilkins)[,!: .]*/iu, '').trim();
  const q = text.toLocaleLowerCase('ru').replaceAll('ё', 'е').replace(/[.!?]+$/u, '').trim();
  const note = text.match(/^(?:запиши|запомни|сохрани)\s+(?:мысль|заметку|запись)\s*[:—-]\s*([\s\S]+)$/iu)
    ?? text.match(/^(?:запиши|запомни)\s*[:—-]\s*([\s\S]+)$/iu);
  if (note) return { kind: 'note', body: note[1].trim() };
  const search = text.match(/^(?:найди|найти|поищи|покажи\s+совпадения|поиск)\s*[:—-]?\s+([\s\S]+)$/iu);
  if (search) return { kind: 'search', query: search[1].trim() };
  if (/^(?:не мешай|посиди|стой|останься|тише|побудь рядом|я читаю)/u.test(q)) return { kind: 'stay' };
  if (/^(?:спрячься|скройся|уйди|убрать персонажа)/u.test(q)) return { kind: 'hide' };
  if (/^(?:проснись|оживи|гуляй снова|можешь ходить)/u.test(q)) return { kind: 'wake' };
  if (/^(?:прогуляйся|пройдись|походи|погуляй|пойдем гулять|пройди по экрану)/u.test(q)) return { kind: 'walk' };
  if (/^(?:иди сюда|подойди|ко мне|появись|ты где)/u.test(q)) return { kind: 'come' };
  if (/^(?:привет|здравствуй|добрый|доброе|помаши)/u.test(q)) return { kind: 'greet' };
  if (/^(?:что умеешь|что ты умеешь|помощь|команды|что можно попросить)/u.test(q)) return { kind: 'help' };
  if (/^(?:чем занимаемся|что открыто|где мы|мой контекст|что сейчас в работе)/u.test(q)) return { kind: 'context' };
  if (/^(?:сохрани|запомни|добавь)\s+(?:эту\s+)?(?:цитату|фрагмент|выделение)/u.test(q)) return { kind: 'quote' };
  if (/^(?:записать|запиши|создай|создать|добавь|новая)\s+(?:собственную\s+)?(?:мысль|заметку|запись)/u.test(q)) return { kind: 'note' };
  if (/^(?:(?:покажи|открой)\s+)?(?:мои\s+)?(?:заметки|записи)(?:\s+к\s+(?:книге|источнику))?$/u.test(q)) return { kind: 'notes' };
  if (/^(?:продолжим читать|продолжить чтение|вернись к книге|открой текущую книгу|читать дальше|продолжим чтение)/u.test(q)) return { kind: 'resume' };
  if (/^(?:следующая страница|перелистни|переверни страницу|листай дальше)/u.test(q)) return { kind: 'reader', action: 'next' };
  if (/^(?:предыдущая страница|страницу назад|листай назад)/u.test(q)) return { kind: 'reader', action: 'previous' };
  if (/^(?:(?:поставь|добавь|сделай|сохрани)\s+)?закладк/u.test(q)) return { kind: 'reader', action: 'bookmark' };
  if (/^(?:настройки вилкинса|твои настройки|личное фото|параметры персонажа)/u.test(q)) return { kind: 'details' };
  const sections: [RegExp, Screen][] = [
    [/^(?:(?:открой|покажи|перейди в|перейди к)\s+)?библиотек/u, 'library'],
    [/^(?:(?:открой|покажи|перейди в|перейди к)\s+)?(?:рукопис|редактор)/u, 'manuscripts'],
    [/^(?:(?:открой|покажи|перейди в|перейди к)\s+)?(?:исследовательский\s+)?стол/u, 'desk'],
    [/^(?:(?:открой|покажи|перейди в|перейди к)\s+)?атлас/u, 'atlas'],
    [/^(?:(?:открой|покажи|перейди в|перейди к)\s+)?лаборатори/u, 'lab'],
    [/^(?:(?:открой|покажи|перейди в|перейди к)\s+)?(?:картотек|научную память)/u, 'memory'],
    [/^(?:(?:открой|покажи|перейди в|перейди к)\s+)?кабинет/u, 'cabinet'],
  ];
  for (const [match, screen] of sections) if (match.test(q)) return { kind: 'navigate', screen };
  return { kind: 'unknown' };
}

export function companionBounds(width: number, height: number, reading: boolean) {
  const mobile = width < 720, size = mobile ? { width: 94, height: 134 } : { width: 124, height: 174 };
  const bottom = mobile ? (reading ? 54 : 78) : 20;
  return { ...size, mobile, minX: 4, maxX: Math.max(4, width - size.width - 5), minY: 65,
    maxY: Math.max(65, height - size.height - bottom) };
}
export function clampCompanion(x: number, y: number, bounds: ReturnType<typeof companionBounds>) {
  return { x: Math.max(bounds.minX, Math.min(bounds.maxX, x)), y: Math.max(bounds.minY, Math.min(bounds.maxY, y)) };
}
