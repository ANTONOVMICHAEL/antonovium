export type Theme = 'cobalt' | 'plum' | 'emerald';
export type Screen = 'cabinet' | 'library' | 'reader' | 'desk' | 'atlas' | 'lab' | 'manuscripts' | 'horizon' | 'archive';
export type Mode = 'reading' | 'research' | 'compare';
export type NoteKind = 'thought' | 'thesis' | 'question';
export interface Paragraph { id: string; text: string }
export interface Section { id: string; title: string; paragraphs: Paragraph[] }
export interface Source {
  id: string; title: string; subtitle: string; author?: string; year?: string;
  format: 'digital' | 'paper'; demo: boolean; categories: string[]; sections: Section[];
}
export interface TextAnchor { paragraphId: string; start: number; end: number }
export interface Excerpt { sourceId: string; sectionId: string; quote: string; anchors: TextAnchor[]; locator?: string; fileAnchor?:import('./cloud').FileAnchor;sourceTitle?:string }
export interface Note extends Partial<Excerpt> {
  id: string; title: string; body: string; kind: NoteKind; categories: string[];
  researchId?: string; createdAt: string; demo?: boolean;evidenceType?:'note'|'interpretation'|'hypothesis'|'quotation'|'highlight';
}
export interface Research { id: string; title: string; question: string; hypothesis: string; categories: string[]; archived: boolean; demo?: boolean }
export interface Category { id: string; title: string; subtitle: string; x: number; y: number }
export interface DeskState { leftId:string; rightId:string; leftSectionId?:string; rightSectionId?:string; ratio:number; active:'left'|'right'; researchId?:string }
export interface SavedState {
  version: 1; theme: Theme; screen: Screen; mode: Mode; sourceId: string; sectionId: string;
  fontSize: number; lineHeight: number; wide: boolean; quiet: boolean;
  positions: Record<string, number>; notes: Note[]; sources: Source[]; research: Research[];
  manuscript: string; manuscriptTitle: string; wilkinsActivity: 'request' | 'adaptive' | 'active';
  compareSourceId: string; compareSectionId: string; compareExcerpt?: Excerpt;
  categoryId: string; researchId: string;readerFont?:'serif'|'sans';desk?:DeskState;
}
