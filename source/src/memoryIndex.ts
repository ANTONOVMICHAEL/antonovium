import { useEffect, useState } from 'react';
import { fileApi, supabase, useCloud, type Book, type FileAnchor } from './cloud';
import { readLocalFile, useLocalBooks } from './localBooks';
import { sharedBookAliases } from './bookMigration';
import { decodeXML, parseFB2 } from './fb2';
import { INDEX_VERSION, INDEX_RAW_BUDGET, matchExcerpt, normalizeSearch, pdfExtractedText, splitLiteral, textMatches, validIndexAnchor, type EmbeddedMetadata, type IndexChunk, type IndexDocument, type IndexProgress, type LibraryHit } from './indexTypes';

const DATABASE = 'antonovium.scientific-index.v1';
const progress = new Map<string, IndexProgress>();
const subscribers = new Set<() => void>();
const attempted = new Set<string>();
const scheduled = new Set<string>();
type Task = { book: Book; owner: string; queueKey?:string; metadata?: (book: Book, value: EmbeddedMetadata) => void };
let tasks: Task[] = [], working = false, generation = 0, activeOwner = '', notifyTimer = 0;
const catalogs = new Set<string>();
const tick = () => new Promise<void>(resolve => setTimeout(resolve, 0));
const keyOf = (book: Book, owner: string) => `${book.local ? 'local' : owner}:${book.id}`;
function notify() { if (!notifyTimer) notifyTimer = window.setTimeout(() => { notifyTimer = 0; for (const callback of subscribers) callback(); window.dispatchEvent(new Event('antonovium-index-progress')); }, 50); }
function setProgress(task: Task, value: IndexDocument, extra: Partial<IndexProgress> = {}) {
  progress.set(keyOf(task.book, task.owner), { ...value, local: !!task.book.local, title: task.book.title, ...extra }); notify();
}
export function useIndexProgress() {
  const [value, setValue] = useState<IndexProgress[]>(() => [...progress.entries()].filter(([key]) => key.startsWith('local:') || !!activeOwner && key.startsWith(`${activeOwner}:`)).map(([, p]) => p));
  useEffect(() => { const update = () => setValue([...progress.entries()].filter(([key]) => key.startsWith('local:') || key.startsWith(`${activeOwner}:`)).map(([, p]) => p)); subscribers.add(update); update(); return () => { subscribers.delete(update); }; }, []);
  return value;
}
function database(): Promise<IDBDatabase> { return new Promise((resolve, reject) => { const r = indexedDB.open(DATABASE, 1); r.onupgradeneeded = () => { r.result.createObjectStore('documents', { keyPath: 'key' }); const chunks = r.result.createObjectStore('chunks', { keyPath: 'key' }); chunks.createIndex('book', 'book_id'); }; r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); }); }
async function localDocument(book: Book): Promise<IndexDocument | undefined> {
  const db = await database(); return new Promise((resolve, reject) => { const tx = db.transaction('documents'), r = tx.objectStore('documents').get(book.id); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); tx.oncomplete = () => db.close(); });
}
async function localBegin(book: Book, total: number): Promise<IndexDocument> {
  const previous = await localDocument(book);
  if (previous?.fingerprint === book.fingerprint && previous.index_version === INDEX_VERSION) return previous;
  const next: IndexDocument = { book_id: book.id, fingerprint: book.fingerprint, index_version: INDEX_VERSION, status: 'processing', next_unit: 0, total_units: total, chunk_count: 0, raw_bytes: 0, text_units: 0 };
  const db = await database();
  return new Promise((resolve, reject) => { const tx = db.transaction(['documents', 'chunks'], 'readwrite'), store = tx.objectStore('chunks'), cursor = store.index('book').openKeyCursor(IDBKeyRange.only(book.id)); cursor.onsuccess = () => { const c = cursor.result; if (c) { store.delete(c.primaryKey); c.continue(); } }; tx.objectStore('documents').put({ ...next, key: book.id }); tx.oncomplete = () => { db.close(); resolve(next); }; tx.onerror = () => { db.close(); reject(tx.error); }; });
}
async function localPut(doc: IndexDocument, chunks: IndexChunk[], nextUnit: number): Promise<IndexDocument> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['documents', 'chunks'], 'readwrite'), store = tx.objectStore('chunks'); let remaining = chunks.length, addedBytes = 0, addedCount = 0; const addedUnits = new Set<number>();
    const next = { ...doc, next_unit: nextUnit, status: 'processing' as IndexDocument['status'] };
    const finish = () => { next.raw_bytes += addedBytes; next.chunk_count += addedCount; next.text_units += addedUnits.size; tx.objectStore('documents').put({ ...next, key: doc.book_id }); };
    if (!remaining) finish();
    for (const chunk of chunks) {
      const key = `${doc.book_id}:${chunk.chunk_id}`, r = store.get(key);
      r.onsuccess = () => { const prior = r.result, bytes = new TextEncoder().encode(chunk.body).length; if (doc.raw_bytes + addedBytes + bytes - (prior?.bytes ?? 0) > INDEX_RAW_BUDGET) { next.status = 'size_limit'; next.next_unit = doc.next_unit; } else if (next.status !== 'size_limit') { addedBytes += bytes - (prior?.bytes ?? 0); if (!prior) { addedCount++; if(chunk.chunk_id.endsWith(':0'))addedUnits.add(chunk.unit); } store.put({ ...chunk, key, book_id: doc.book_id, fingerprint: doc.fingerprint, bytes }); } if (!--remaining) finish(); };
    }
    tx.oncomplete = () => { db.close(); resolve(next); }; tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
async function localFinish(doc: IndexDocument, status: IndexDocument['status'], error = '') {
  const next = { ...doc, status, error, updated_at: new Date().toISOString() }, db = await database();
  await new Promise<void>((resolve, reject) => { const tx = db.transaction('documents', 'readwrite'); tx.objectStore('documents').put({ ...next, key: doc.book_id }); tx.oncomplete = () => { db.close(); resolve(); }; tx.onerror = () => { db.close(); reject(tx.error); }; }); return next;
}
async function rpc<T>(name: string, parameters: Record<string, unknown>, task?: Task): Promise<T> {
  if (task && !task.book.local) { const { data } = await supabase.auth.getSession(); if (data.session?.user.id !== task.owner || activeOwner !== task.owner) throw Error('Индексирование приостановлено при смене учетной записи'); }
  const { data, error } = await supabase.rpc(name, parameters); if (error) throw Error(error.message); return data as T;
}
function embeddedFB2(xml: string): EmbeddedMetadata {
  // parseFB2 has already rejected DOCTYPE/entities before this metadata-only pass.
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const get = (root: Element | Document | null, selector: string) => root?.querySelector(selector)?.textContent?.trim() || undefined;
  const info = doc.querySelector('description > title-info'), publish = doc.querySelector('description > publish-info');
  const authors = Array.from(info?.querySelectorAll(':scope > author') ?? []).map(a => ['first-name', 'middle-name', 'last-name'].map(n => get(a, n)).filter(Boolean).join(' ') || get(a, 'nickname') || '').filter(Boolean);
  return { title: get(info, 'book-title'), authors, publisher: get(publish, 'publisher'), place: get(publish, 'city'), year: get(publish, 'year'), isbn: get(publish, 'isbn') };
}
function emptyDoc(book: Book, error = ''): IndexDocument { return { book_id: book.id, fingerprint: book.fingerprint, index_version: INDEX_VERSION, status: 'error', next_unit: 0, total_units: 0, chunk_count: 0, raw_bytes: 0, text_units: 0, error }; }
function completed(doc: IndexDocument, book: Book) { return ['ready','no_text'].includes(doc.status) || book.format==='pdf' && doc.status==='partial' && doc.next_unit===doc.total_units && doc.text_units<doc.total_units; }
async function indexBook(task: Task, ticket: number) {
  const { book } = task; let doc: IndexDocument | undefined; let pdfTask: { destroy: () => Promise<void> } | undefined;
  const alive = () => ticket === generation && (book.local ? !activeOwner || !sharedBookAliases(activeOwner)[book.id] : task.owner === activeOwner);
  const begin = async (total: number) => book.local ? localBegin(book, total) : rpc<IndexDocument>('av_memory_begin', { p_book_id: book.id, p_fingerprint: book.fingerprint, p_total_units: total, p_format: book.format }, task);
  const put = async (chunks: IndexChunk[], next: number) => {
    if (!alive()) throw Error('Индексирование приостановлено');
    doc = book.local ? await localPut(doc!, chunks, next) : await rpc<IndexDocument>('av_memory_put', { p_book_id: book.id, p_fingerprint: book.fingerprint, p_chunks: chunks, p_next_unit: next, p_total_units: doc!.total_units }, task);
    if (alive()) setProgress(task, doc); if (doc.status === 'size_limit') throw Error('Достигнут бюджет индекса: 64 МиБ извлеченного текста');
  };
  const finish = async (status: IndexDocument['status'], error = '') => {
    if (!doc) return;
    doc = book.local ? await localFinish(doc, status, error) : await rpc<IndexDocument>('av_memory_finish', { p_book_id: book.id, p_fingerprint: book.fingerprint, p_status: status, p_error: error }, task);
    if (alive()) setProgress(task, doc);
  };
  try {
    const original = book.local ? await readLocalFile(book.id) : (await fileApi('read', { id: book.id })).url as string;
    if (!alive()) return;
    if (book.format === 'pdf') {
      const { openPDF, openLocalPDF } = await import('./pdf');
      pdfTask = typeof original === 'string' ? openPDF(original) : await openLocalPDF(new File([original], book.original_name));
      const pdf = await (pdfTask as ReturnType<typeof openPDF>).promise;
      if (!alive()) return;
      doc = await begin(pdf.numPages); if (!alive()) return; setProgress(task, doc);
      if (completed(doc,book) && doc.next_unit === pdf.numPages) return;
      const metadata = await pdf.getMetadata().catch(() => null), info = metadata?.info as { Title?: unknown; Author?: unknown } | undefined;
      const embedded = { title: typeof info?.Title === 'string' ? info.Title : undefined, authors: typeof info?.Author === 'string' && info.Author ? [info.Author] : undefined };
      if (alive()) task.metadata?.(book, embedded);
      let textPages = doc.text_units;
      for (let pageNumber = doc.next_unit + 1; pageNumber <= pdf.numPages; pageNumber++) {
        if (!alive()) throw Error('Индексирование приостановлено');
        const page = await pdf.getPage(pageNumber), content = await page.getTextContent();
        const raw = pdfExtractedText(content.items);
        const chunks = raw.trim() ? splitLiteral(raw).map((part, i) => ({ chunk_id: `pdf:${pageNumber}:${i}`, body: part.text, search_text: normalizeSearch(part.text, true), anchor: { format: 'pdf', page: pageNumber, offset: part.offset } as FileAnchor, locator: `Страница PDF ${pageNumber}`, unit: pageNumber - 1 })) : [];
        for (let i = 0; i < Math.max(1, chunks.length); i += 16) await put(chunks.slice(i, i + 16), i + 16 >= chunks.length ? pageNumber : pageNumber - 1);
        if (chunks.length) textPages++; doc.text_units = textPages; page.cleanup(); await tick();
      }
      await finish(textPages === 0 ? 'no_text' : textPages < pdf.numPages ? 'partial' : 'ready', textPages < pdf.numPages ? `${pdf.numPages - textPages} страниц без текстового слоя; OCR не выполнялся` : '');
    } else {
      const response = typeof original === 'string' ? await fetch(original, { cache: 'no-store' }) : null;
      if (response && !response.ok) throw Error('Не удалось получить FB2 для индексирования');
      const blob = response ? await response.blob() : original as Blob;
      if (blob.size > 64 * 1024 * 1024) throw Error('FB2 превышает безопасный объем обработки: 64 МиБ XML');
      await tick(); const xml = decodeXML(new Uint8Array(await blob.arrayBuffer())), parsed = parseFB2(xml);
      const units: { chapter: string; paragraph: string; text: string; title: string }[] = [];
      for (const chapter of parsed.chapters) { const root = document.createElement('div'); root.innerHTML = chapter.html; for (const p of root.querySelectorAll<HTMLElement>('[data-fb2-paragraph]')) units.push({ chapter: chapter.id, paragraph: p.id, text: p.textContent ?? '', title: chapter.title }); await tick(); }
      if (!alive()) return;
      doc = await begin(units.length); if (!alive()) return; setProgress(task, doc);
      if (alive()) task.metadata?.(book, embeddedFB2(xml));
      if (['ready', 'no_text'].includes(doc.status) && doc.next_unit === units.length) return;
      for (let unit = doc.next_unit; unit < units.length; unit++) {
        const p = units[unit], chunks = p.text.trim() ? splitLiteral(p.text).map((part, i) => ({ chunk_id: `${p.paragraph}:${i}`, body: part.text, search_text: normalizeSearch(part.text), anchor: { format: 'fb2', chapter: p.chapter, paragraph: p.paragraph, offset: part.offset, endParagraph: p.paragraph, endOffset: part.offset + part.text.length } as FileAnchor, locator: p.title, unit })) : [];
        for (let i = 0; i < Math.max(1, chunks.length); i += 16) await put(chunks.slice(i, i + 16), i + 16 >= chunks.length ? unit + 1 : unit);
        if (unit % 8 === 0) await tick();
      }
      await finish(doc.chunk_count ? 'ready' : 'no_text');
    }
  } catch (error) {
    const message = (error as Error).message;
    if (doc && doc.status !== 'size_limit' && (book.local || task.owner === activeOwner)) { try { await finish(ticket !== generation ? 'partial' : 'error', message); } catch { /* Keep the last committed unit; never claim completeness. */ } }
    if (alive()) setProgress(task, doc?.status === 'size_limit' ? doc : { ...(doc ?? emptyDoc(book)), status: ticket !== generation ? 'partial' : 'error', error: message });
  } finally { await pdfTask?.destroy().catch(() => {}); }
}
async function drain() { if (working) return; working = true; try { while (tasks.length) { const task = tasks.shift()!; try { if (task.book.local ? !activeOwner || !sharedBookAliases(activeOwner)[task.book.id] : task.owner === activeOwner) await indexBook(task, generation); } finally { if(task.queueKey)scheduled.delete(task.queueKey); } } } finally { working = false; } }
export function pauseIndexing() { generation++; tasks = []; scheduled.clear();for (const [key, doc] of progress) if (doc.status === 'processing' || doc.queued) progress.set(key, { ...doc, status: 'partial', queued: false, error: 'Индексирование приостановлено. Продолжи при необходимости.' }); notify(); }
export async function queueIndexing(books: Book[], options: { owner: string; force?: boolean; onMetadata?: Task['metadata'] }) {
  const ticket=generation;
  const cloudBooks = books.filter(book => !book.local);
  if (cloudBooks.length && !catalogs.has(options.owner)) {
    catalogs.add(options.owner);
    try { for (let offset = 0;; offset += 500) { const { data, error } = await supabase.from('av_memory_documents').select('*').eq('owner_id', options.owner).range(offset, offset + 499); if (error) throw error; if (ticket!==generation||activeOwner !== options.owner) {catalogs.delete(options.owner);return;} for (const row of data ?? []) { const book = cloudBooks.find(b => b.id === row.book_id); if (book) setProgress({ book, owner: options.owner }, row); } if ((data?.length ?? 0) < 500) break; } } catch { catalogs.delete(options.owner); }
  }
  for (const book of books) {
    if (book.status !== 'ready' || !book.local && options.owner !== activeOwner) continue;
    const key = keyOf(book, options.owner), attempt = `${key}:${book.fingerprint}:${INDEX_VERSION}`,queueKey=`${attempt}:${generation}`;
    if(scheduled.has(queueKey))continue;
    let previous:IndexDocument|undefined;
    try{previous = book.local ? await localDocument(book) : progress.get(key);}catch(error){if(ticket!==generation)return;attempted.add(attempt);setProgress({book,owner:options.owner},emptyDoc(book,`Индекс на устройстве недоступен: ${(error as Error).message}`));continue;}
    if(!book.local&&!previous){const {data,error}=await supabase.from('av_memory_documents').select('*').eq('owner_id',options.owner).eq('book_id',book.id).maybeSingle();if(!error&&data)previous=data;}
    if(ticket!==generation||options.owner!==activeOwner)return;
    if(scheduled.has(queueKey))continue;
    if (previous) setProgress({ book, owner: options.owner }, previous);
    if (previous?.fingerprint === book.fingerprint && previous.index_version === INDEX_VERSION && completed(previous,book)) continue;
    if (!options.force && attempted.has(attempt)) continue;
    attempted.add(attempt);scheduled.add(queueKey); const task = { book, owner: options.owner,queueKey, metadata: options.onMetadata };
    setProgress(task, previous?.fingerprint === book.fingerprint ? previous : { ...emptyDoc(book), status: 'processing' }, { queued: true }); tasks.push(task);
  }
  void drain();
}
export function useLibraryIndexing(onMetadata?: Task['metadata']) {
  const cloud = useCloud(), local = useLocalBooks(); const owner = cloud.authorized ? cloud.session!.user.id : '';
  const aliases=owner?sharedBookAliases(owner):{},books=[...local.books.filter(book=>!aliases[book.id]),...(owner?cloud.books:[])];
  useEffect(() => { if (activeOwner !== owner) { activeOwner = owner; generation++; tasks = [];scheduled.clear();attempted.clear();notify(); } }, [owner]);
  const signature = books.map(b => `${b.id}:${b.fingerprint}:${b.status}`).join('|');
  useEffect(() => { void queueIndexing(books, { owner, onMetadata }).catch(() => {}); }, [owner, signature]);
}
export async function searchLibrary(query: string, books: Book[], options: { owner?: string; bookId?: string; author?: string; limit?: number; onError?:(message:string)=>void } = {}): Promise<LibraryHit[]> {
  const hits: LibraryHit[] = [], limit = Math.min(80, Math.max(1, options.limit ?? 40));
  const allowed = books.filter(book => (!options.bookId || book.id === options.bookId) && (!book.local || !options.author || normalizeSearch([book.author,(book as Book&{originalAuthor?:string}).originalAuthor].filter(Boolean).join('; ')).includes(normalizeSearch(options.author))));
  if (options.owner && allowed.some(b => !b.local)) {
    const {data:{session}}=await supabase.auth.getSession();if(session?.user.id!==options.owner||activeOwner!==options.owner)return[];
    try{
     const rows = await rpc<any[]>('av_memory_search', { p_query: query, p_book_id: options.bookId || null, p_author: options.author ?? '', p_limit: limit });
     if(activeOwner!==options.owner)return[];
     for (const row of rows ?? []) { const book = allowed.find(b => !b.local && b.id === row.book_id); if (!book || !validIndexAnchor(row.anchor)) continue; const found = matchExcerpt(row.body, row.match_term||query, book.format === 'pdf'); const anchor: FileAnchor = { ...row.anchor, quote: found.quote, prefix: found.before }; if (book.format === 'fb2') { anchor.offset = (row.anchor.offset ?? 0) + found.start; anchor.endOffset = (row.anchor.offset ?? 0) + found.end; } hits.push({ id: `cloud:${book.id}:${row.chunk_id}`, bookId: book.id, title: book.title, author: book.author, local: false, format: book.format, body: row.body, ...found, anchor, locator: row.locator, status: row.document_status,matchedTerm:row.match_term }); }
    }catch(error){if(!options.onError)throw error;options.onError((error as Error).message);}
  }
  for (const book of allowed.filter(b => b.local)) {
    const doc = await localDocument(book); if (!doc || doc.fingerprint !== book.fingerprint || doc.index_version !== INDEX_VERSION) continue;
    const db = await database(); const chunks = await new Promise<any[]>((resolve, reject) => { const tx = db.transaction('chunks'), request = tx.objectStore('chunks').index('book').getAll(IDBKeyRange.only(book.id)); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); tx.oncomplete = () => db.close(); });
    for (let i = 0; i < chunks.length; i++) { if (i % 64 === 0) await tick();const row = chunks[i]; if (row.fingerprint !== book.fingerprint || !validIndexAnchor(row.anchor) || !textMatches(row.body, query, book.format === 'pdf')) continue; const found = matchExcerpt(row.body, query, book.format === 'pdf'), anchor: FileAnchor = { ...row.anchor, quote: found.quote, prefix: found.before }; if (book.format === 'fb2') { anchor.offset = (row.anchor.offset ?? 0) + found.start; anchor.endOffset = (row.anchor.offset ?? 0) + found.end; } hits.push({ id: `local:${book.id}:${row.chunk_id}`, bookId: book.id, title: book.title, author: book.author, local: true, format: book.format, body: row.body, ...found, anchor, locator: row.locator, status: doc.status }); if (hits.length >= limit) break; }
    if (hits.length >= limit) break;
  }
  const seen = new Set<string>(); return hits.filter(hit => { if(!hit.local&&options.owner!==activeOwner)return false;const key = `${hit.bookId}:${hit.anchor.chapter ?? hit.anchor.page}:${hit.quote}`; if (seen.has(key)) return false; seen.add(key); return true; }).slice(0, limit);
}
