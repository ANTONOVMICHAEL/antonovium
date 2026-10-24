export type Theme = 'cobalt' | 'plum' | 'emerald';
export type Screen = 'cabinet' | 'library' | 'reader' | 'desk' | 'atlas' | 'lab' | 'manuscripts' | 'horizon' | 'archive' | 'memory';
export type Mode = 'reading' | 'research' | 'compare';
export type NoteKind = 'thought' | 'thesis' | 'question';
export interface Paragraph { id: string; text: string }
export interface Section { id: string; title: string; paragraphs: Paragraph[] }
export interface Source {
  id: string; title: string; subtitle: string; author?: string; year?: string;
  format: 'digital' | 'paper'; demo: boolean; categories: string[]; sections: Section[];localOnly?:boolean;
}
export interface TextAnchor { paragraphId: string; start: number; end: number }
export type BibliographicSourceType = 'monograph' | 'textbook' | 'article' | 'chapter' | 'legal-act' | 'court-document' | 'other';
export type BibliographicProvenance = 'auto' | 'user';
export interface BibliographicRecord {
 id:string; sourceId:string; workId?:string; sourceType:BibliographicSourceType;
 title:string; authors:string[]; subtitle?:string; editor?:string; volume?:string;
 edition?:string; place?:string; publisher?:string; year?:string; extent?:string;
 isbn?:string; doi?:string; containerTitle?:string; issue?:string; pages?:string;
 url?:string; accessedAt?:string; notes?:string;
 provenance:Partial<Record<string,BibliographicProvenance>>; confirmedFields:string[];
 updatedAt:string; previousVersions?:Omit<BibliographicRecord,'previousVersions'>[];localOnly?:boolean;
}
export type EvidenceType = 'note' | 'interpretation' | 'hypothesis' | 'quotation' | 'highlight' | 'argument' | 'objection' | 'conclusion';
export interface CitationProvenance {
 sourceId:string; editionId:string; fingerprint?:string; bibliography?:BibliographicRecord;
 origin:'selection'|'extracted'|'manual'; readonly rawText:string; normalizedText?:string;
 anchor?:import('./cloud').FileAnchor; contextBefore?:string; contextAfter?:string;
 printedPage?:string; printedPageConfirmed?:boolean;
 verification:'unverified'|'user-confirmed'; savedAt:string;
}
export interface Excerpt { sourceId: string; sectionId: string; quote: string; anchors: TextAnchor[]; locator?: string; fileAnchor?:import('./cloud').FileAnchor;sourceTitle?:string;citation?:CitationProvenance;relatedSourceIds?:string[];quotationIds?:string[];localOnly?:boolean }
export interface Note extends Partial<Excerpt> {
  id: string; title: string; body: string; kind: NoteKind; categories: string[];
  researchId?: string; createdAt: string; demo?: boolean;evidenceType?:EvidenceType;
}
export interface Research { id: string; title: string; question: string; hypothesis: string; categories: string[]; archived: boolean; demo?: boolean }
export interface Category { id: string; title: string; subtitle: string; x: number; y: number }
export interface DeskTextAnchor extends TextAnchor {quote?:string;prefix?:string;sectionId?:string}
export interface DeskState { leftId:string; rightId:string; leftSectionId?:string; rightSectionId?:string; leftAnchor?:import('./cloud').FileAnchor;rightAnchor?:import('./cloud').FileAnchor;leftTextAnchor?:DeskTextAnchor;rightTextAnchor?:DeskTextAnchor;leftQuoteId?:string;rightQuoteId?:string;leftLocalOnly?:boolean;rightLocalOnly?:boolean; ratio:number; active:'left'|'right'; researchId?:string }
export interface SavedState {
  version: 1; theme: Theme; screen: Screen; mode: Mode; sourceId: string; sectionId: string;
  fontSize: number; lineHeight: number; wide: boolean; quiet: boolean;
  positions: Record<string, number>; notes: Note[]; sources: Source[]; research: Research[];
  manuscript: string; manuscriptTitle: string; wilkinsActivity: 'request' | 'adaptive' | 'active';
  compareSourceId: string; compareSectionId: string; compareExcerpt?: Excerpt;
  categoryId: string; researchId: string;readerFont?:'serif'|'sans';desk?:DeskState;
  bibliography?:BibliographicRecord[]; bibliographyTemplate?:string;
  bibliographicTemplates?:{bibliography:string;citation:string};
}
