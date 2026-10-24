/** Match against actual rendered text nodes. Geometry always comes from a DOM Range. */
export interface LocatedQuote {range:Range;exact:boolean;start:number;end:number}
type Segment={node:Text;start:number;end:number};
const normalized=(value:string)=>value.toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/\s+/g,' ').trim();

export function quoteContext(root:HTMLElement,range:Range):{contextBefore:string;contextAfter:string}{
 const before=document.createRange(),after=document.createRange();
 before.selectNodeContents(root);before.setEnd(range.startContainer,range.startOffset);
 after.selectNodeContents(root);after.setStart(range.endContainer,range.endOffset);
 return {contextBefore:before.toString().slice(-180),contextAfter:after.toString().slice(0,180)};
}

/** Source paragraph controls are UI, so context is read only from source text. */
export function sourceParagraphContext(root:HTMLElement,anchors:import('./types').TextAnchor[],attribute='data-paragraph'):{contextBefore:string;contextAfter:string}{
 const paragraphs=Array.from(root.querySelectorAll<HTMLElement>(`[${attribute}]`)),first=anchors[0],last=anchors.at(-1);if(!first||!last)return {contextBefore:'',contextAfter:''};
 const start=paragraphs.findIndex(p=>p.getAttribute(attribute)===first.paragraphId),end=paragraphs.findIndex(p=>p.getAttribute(attribute)===last.paragraphId);if(start<0||end<start)return {contextBefore:'',contextAfter:''};
 const before=[...paragraphs.slice(0,start).map(p=>p.textContent??''),(paragraphs[start].textContent??'').slice(0,first.start)].join('\n\n'),after=[(paragraphs[end].textContent??'').slice(last.end),...paragraphs.slice(end+1).map(p=>p.textContent??'')].join('\n\n');
 return {contextBefore:before.slice(-180),contextAfter:after.slice(0,180)};
}

function sourceText(root:HTMLElement,separate:boolean){
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),segments:Segment[]=[];let node:Node|null,text='';
 while((node=walker.nextNode())){
  const value=node.textContent??'';if(!value)continue;
  // PDF.js stores visual word gaps between span nodes, not as DOM characters.
  if(separate&&text&&!/\s$/.test(text)&&!/^\s/.test(value))text+=' ';
  const start=text.length;text+=value;segments.push({node:node as Text,start,end:text.length});
 }
 return {text,segments};
}

function occurrence(text:string,query:string,prefix?:string){
 let at=text.indexOf(query);if(at<0)return -1;
 const wanted=normalized(prefix??'').slice(-100);
 const fallback=at;let count=0,matched=-1,matches=0;
 while(at>=0){count++;if(wanted&&normalized(text.slice(Math.max(0,at-(prefix?.length??0)-30),at)).endsWith(wanted)){matched=at;matches++}at=text.indexOf(query,at+1)}
 // A repeated sentence with an unrelated context is not a reliable locator.
 return matches===1?matched:count===1?fallback:-1;
}

function rangeAt(segments:Segment[],start:number,end:number):Range|null{
 const first=segments.find(s=>s.end>start),last=[...segments].reverse().find(s=>s.start<end);
 if(!first||!last)return null;
 const range=document.createRange();range.setStart(first.node,Math.max(0,start-first.start));range.setEnd(last.node,Math.min(last.node.length,end-last.start));return range;
}

/** Normalized fallback is explicitly identified; the stored literal is never rewritten. */
function locateSources(sources:ReturnType<typeof sourceText>[],literal:string,prefix?:string):LocatedQuote|null{
 if(!literal.length||literal.length>200000)return null;
 const direct=sources[0],at=occurrence(direct.text,literal,prefix);
 if(at>=0){const range=rangeAt(direct.segments,at,at+literal.length);return range?{range,exact:true,start:at,end:at+literal.length}:null}
 for(const source of sources){
  const map:number[]=[];let value='',space=false;
  for(let i=0;i<source.text.length;i++){
   const c=source.text[i];if(/\s/.test(c)){if(value&&!space){value+=' ';map.push(i);space=true}continue}
   value+=c.toLocaleLowerCase('ru').replace(/ё/g,'е');map.push(i);space=false;
  }
  const query=normalized(literal),index=occurrence(value,query,prefix);if(index<0||!query)continue;
  const start=map[index],end=(map[index+query.length-1]??start)+1,range=rangeAt(source.segments,start,end);
  if(range)return {range,exact:false,start,end};
 }
 return null;
}

export function locateQuote(root:HTMLElement,literal:string,prefix?:string):LocatedQuote|null{return locateSources([sourceText(root,false),sourceText(root,true)],literal,prefix)}

function sourceParagraphText(root:HTMLElement,attribute:string){
 const segments:Segment[]=[];let text='';for(const paragraph of root.querySelectorAll<HTMLElement>(`[${attribute}]`)){if(text)text+='\n\n';const part=sourceText(paragraph,false),start=text.length;text+=part.text;segments.push(...part.segments.map(segment=>({...segment,start:segment.start+start,end:segment.end+start})))}return {text,segments};
}

export function normalizedQuoteRects(range:Range,page:HTMLElement):number[][]{
 const box=page.getBoundingClientRect();if(!box.width||!box.height)return [];
 return Array.from(range.getClientRects()).filter(r=>r.width>0&&r.height>0).slice(0,200).map(r=>[(r.left-box.left)/box.width,(r.top-box.top)/box.height,r.width/box.width,r.height/box.height].map(v=>Math.max(0,Math.min(1,v))));
}

export function showPDFQuoteMatch(page:HTMLElement,range:Range):()=>void{
 const marks=normalizedQuoteRects(range,page).map(rect=>{
  const mark=document.createElement('span');mark.className='cloud-pdf-highlight';mark.dataset.memoryQuoteFocus='true';mark.setAttribute('aria-hidden','true');
  Object.assign(mark.style,{left:`${rect[0]*100}%`,top:`${rect[1]*100}%`,width:`${rect[2]*100}%`,height:`${rect[3]*100}%`});page.append(mark);return mark;
 });
 return ()=>marks.forEach(mark=>mark.remove());
}

/** Stable source paragraph offsets are checked against the literal before being used. */
export function verifiedTextAnchor(root:HTMLElement,at:import('./types').TextAnchor&{quote?:string;prefix?:string},attribute='data-paragraph'):{paragraph:HTMLElement|null;range:Range|null;found:boolean;exact:boolean}{
 const paragraph=root.querySelector<HTMLElement>(`[${attribute}="${CSS.escape(at.paragraphId)}"]`),literal=at.quote;
 if(paragraph){
  const source=sourceText(paragraph,false),start=Math.max(0,at.start),end=Math.min(source.text.length,Math.max(start,at.end));
  const range=rangeAt(source.segments,start,end);
  if(range&&(!literal||range.toString()===literal))return {paragraph,range,found:true,exact:true};
 }
 if(literal){const hit=(paragraph&&locateQuote(paragraph,literal,at.prefix))||locateSources([sourceParagraphText(root,attribute)],literal,at.prefix);if(hit){const element=(hit.range.startContainer.nodeType===1?hit.range.startContainer as Element:hit.range.startContainer.parentElement)?.closest<HTMLElement>(`[${attribute}]`)??null;return {paragraph:element,range:hit.range,found:true,exact:hit.exact}}}
 return {paragraph,range:null,found:false,exact:false};
}

/** A text match supersedes stale FB2 offsets; failure returns the original nearby anchor. */
export function verifiedFB2Anchor(root:HTMLElement,at:import('./cloud').FileAnchor):{anchor:import('./cloud').FileAnchor;found:boolean;exact:boolean}{
 if(!at.quote)return {anchor:at,found:!at.paragraph||!!root.querySelector(`#${CSS.escape(at.paragraph)}`),exact:true};
 const preferred=at.paragraph?root.querySelector<HTMLElement>(`#${CSS.escape(at.paragraph)}`):null;
 if(preferred&&at.offset!==undefined&&(preferred.textContent??'').slice(at.offset,at.offset+at.quote.length)===at.quote)return {anchor:{...at,page:undefined},found:true,exact:true};
 const hit=(preferred&&locateQuote(preferred,at.quote,at.prefix))||locateQuote(root,at.quote,at.prefix);
 if(!hit)return {anchor:at,found:false,exact:false};
 const element=(hit.range.startContainer.nodeType===1?hit.range.startContainer as Element:hit.range.startContainer.parentElement)?.closest<HTMLElement>('[data-fb2-paragraph]');
 if(!element)return {anchor:at,found:false,exact:false};
 const before=document.createRange();before.selectNodeContents(element);before.setEnd(hit.range.startContainer,hit.range.startOffset);
 return {anchor:{...at,paragraph:element.id,offset:before.toString().length,page:undefined},found:true,exact:hit.exact};
}
