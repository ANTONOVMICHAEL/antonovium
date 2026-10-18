import { createContext, useContext } from 'react';
import type { Excerpt, Note, SavedState, Screen } from './types';
export interface WorkspaceContext {
 state:SavedState; update:(change:Partial<SavedState>|((s:SavedState)=>SavedState))=>void;
 navigate:(screen:Screen)=>void; openSource:(id:string,section?:string,paragraph?:string)=>void;
 openCategory:(id:string)=>void; openResearch:(id:string)=>void;
 composeNote:(excerpt?:Excerpt,note?:Note,researchId?:string)=>void;
 openNote:(note:Note)=>void; toast:(message:string)=>void;
 selection:Excerpt|null; setSelection:(value:Excerpt|null)=>void;
 focusParagraph:string|null; setFocusParagraph:(id:string|null)=>void;
 selectedNoteId:string|null; setSelectedNoteId:(id:string|null)=>void;
 setWilkins:(value:boolean)=>void; setSettings:(value:boolean)=>void;
}
export const Context=createContext<WorkspaceContext|null>(null);
export const useApp=()=>{const c=useContext(Context);if(!c)throw new Error('Workspace missing');return c;};
