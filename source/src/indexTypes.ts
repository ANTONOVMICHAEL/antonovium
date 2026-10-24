import type { FileAnchor } from './cloud';

export const INDEX_VERSION = 1;
export const INDEX_RAW_BUDGET = 64 * 1024 * 1024;
export type IndexStatus = 'processing' | 'ready' | 'no_text' | 'partial' | 'size_limit' | 'error';
export interface EmbeddedMetadata { title?: string; authors?: string[]; subtitle?: string; publisher?: string; place?: string; year?: string; isbn?: string; edition?: string }
export interface IndexDocument {
  book_id: string; fingerprint: string; index_version: number; status: IndexStatus;
  next_unit: number; total_units: number; chunk_count: number; raw_bytes: number; text_units: number;
  error?: string; updated_at?: string;
}
export interface IndexProgress extends IndexDocument { local: boolean; title: string; queued?: boolean; metadata?: EmbeddedMetadata }
export interface IndexChunk { chunk_id: string; body: string; search_text: string; anchor: FileAnchor; locator: string; unit: number }
export interface LibraryHit { id: string; bookId: string; title: string; author: string; local: boolean; format: 'pdf' | 'fb2'; body: string; quote: string; before: string; after: string; anchor: FileAnchor; locator: string; status?: IndexStatus; matchedTerm?:string }
export function pdfExtractedText(items:({str:string;hasEOL?:boolean}|object)[]) {return items.map(item=>'str'in item&&typeof item.str==='string'?item.str+('hasEOL'in item&&item.hasEOL?'\n':' '):'').join('');}

/** Normalization belongs exclusively to search; raw text is never rewritten. */
export function searchMap(raw: string, pdf = false): { text: string; map: number[] } {
  let text = ''; const map: number[] = [];
  for (let i = 0; i < raw.length; i++) {
    const char = raw[i];
    if (char === '\u00ad') continue;
    if (pdf && char === '-' && /[\p{L}]/u.test(raw[i - 1] ?? '')) {
      const rest = raw.slice(i + 1).match(/^[ \t]*\r?\n\s*(?=\p{L})/u);
      if (rest) { i += rest[0].length; continue; }
    }
    if (/\s/.test(char)) {
      if (text && !text.endsWith(' ')) { text += ' '; map.push(i); }
      continue;
    }
    const normalized = char.toLocaleLowerCase('ru').replace(/ё/g, 'е');
    for (const letter of normalized) { text += letter; map.push(i); }
  }
  if (text.endsWith(' ')) { text = text.slice(0, -1); map.pop(); }
  return { text, map };
}
export const normalizeSearch = (raw: string, pdf = false) => {
  let text=raw.replace(/\u00ad/g,'');
  if(pdf)text=text.replace(/(\p{L})-[ \t]*\r?\n\s*(?=\p{L})/gu,'$1');
  return text.toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/\s+/g,' ').trim();
};
export function queryTerms(query: string) {
  const terms: string[] = [];
  for (const match of query.matchAll(/"([^"]+)"|(\S+)/g)) {
    const term = normalizeSearch(match[1] ?? match[2]); if (term) terms.push(term);
  }
  return terms;
}
export function textMatches(text: string, query: string, pdf = false) {
  const normalized = normalizeSearch(text, pdf), terms = queryTerms(query);
  return terms.length > 0 && terms.every(term => normalized.includes(term));
}
export function matchExcerpt(raw: string, query: string, pdf = false) {
  const { text, map } = searchMap(raw, pdf), terms = queryTerms(query);
  const matches = terms.map(term => ({ term, at: text.indexOf(term) })).filter(m => m.at >= 0).sort((a, b) => a.at - b.at);
  const first = matches[0];
  const start = first ? map[first.at] ?? 0 : 0;
  const end = first ? (map[first.at + first.term.length - 1] ?? start) + 1 : Math.min(raw.length, 100);
  // A bounded literal context, not a generated paraphrase or an entire book page.
  let from = Math.max(0, start - 140), to = Math.min(raw.length, end + 220);
  const preceding = raw.lastIndexOf('\n', start); if (preceding >= from) from = preceding + 1;
  const following = raw.indexOf('\n', end); if (following >= 0 && following <= to) to = following;
  return { quote: raw.slice(from, to), before: raw.slice(Math.max(0, from - 80), from), after: raw.slice(to, to + 80), start: from, end: to, matchStart: start, matchEnd: end };
}
export function splitLiteral(text: string, max = 7000, overlap = 512): { text: string; offset: number }[] {
  if (!Number.isInteger(max) || max < 500 || !Number.isInteger(overlap) || overlap < 0 || overlap >= max) throw Error('Invalid text chunk geometry');
  const chunks: { text: string; offset: number }[] = [];
  for (let offset = 0; offset < text.length;) {
    let end = Math.min(text.length, offset + max);
    if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
    chunks.push({ text: text.slice(offset, end), offset });
    if (end === text.length) break;
    let next = end - overlap;
    if (/[\uDC00-\uDFFF]/.test(text[next] ?? '') && /[\uD800-\uDBFF]/.test(text[next - 1] ?? '')) next--;
    // Even the maximum overlap must advance without splitting a code point.
    offset = next > offset ? next : offset + (/[\uD800-\uDBFF]/.test(text[offset]) ? 2 : 1);
  }
  return chunks;
}
export function validIndexAnchor(anchor: FileAnchor, totalUnits?: number) {
  if (!anchor || typeof anchor !== 'object') return false;
  if (anchor.format === 'pdf') return Number.isInteger(anchor.page) && anchor.page! >= 1 && (!totalUnits || anchor.page! <= totalUnits);
  const stableId = /^fb2-\d+(?:\.\d+)*$/;
  return anchor.format === 'fb2' && anchor.page === undefined && stableId.test(anchor.chapter ?? '') && stableId.test(anchor.paragraph ?? '') && (anchor.endParagraph === undefined || stableId.test(anchor.endParagraph)) && Number.isInteger(anchor.offset) && anchor.offset! >= 0 && Number.isInteger(anchor.endOffset) && anchor.endOffset! >= anchor.offset!;
}
