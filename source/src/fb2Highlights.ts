import type {Note} from './types';

function textPoint(element:Element,offset:number):{node:Node;offset:number}|null{
 const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT);let node:Node|null;
 let remaining=Math.max(0,offset),last:Node|null=null;
 while((node=walker.nextNode())){last=node;const length=node.textContent?.length??0;if(remaining<=length)return {node,offset:remaining};remaining-=length;}
 return last?{node:last,offset:last.textContent?.length??0}:null;
}

/** Rebuild text marks after a chapter or its notes change. Text offsets survive reflow. */
export function paintFB2Highlights(root:HTMLElement,notes:Note[]){
 root.querySelectorAll<HTMLElement>('mark[data-cloud-highlight]').forEach(mark=>mark.replaceWith(...Array.from(mark.childNodes)));
 root.normalize();
 for(const note of notes){
  const anchor=note.fileAnchor;if(anchor?.format!=='fb2'||!anchor.paragraph||!note.quote)continue;
  const startElement=root.querySelector<HTMLElement>(`#${CSS.escape(anchor.paragraph)}`);
  const endElement=root.querySelector<HTMLElement>(`#${CSS.escape(anchor.endParagraph??anchor.paragraph)}`);
  if(!startElement||!endElement)continue;
  const start=textPoint(startElement,anchor.offset??0);
  const end=textPoint(endElement,anchor.endOffset??(anchor.offset??0)+note.quote.length);
  if(!start||!end)continue;
  const range=document.createRange();
  try{range.setStart(start.node,start.offset);range.setEnd(end.node,end.offset);}catch{continue}
  if(range.collapsed)continue;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),pieces:{node:Text;start:number;end:number}[]=[];
  let node:Node|null;while((node=walker.nextNode())){
   if(!range.intersectsNode(node))continue;
   const length=node.textContent?.length??0;
   const from=node===range.startContainer?range.startOffset:0,to=node===range.endContainer?range.endOffset:length;
   if(to>from)pieces.push({node:node as Text,start:from,end:to});
  }
  for(const piece of pieces.reverse()){
   const tail=piece.end<piece.node.length?piece.node.splitText(piece.end):null;
   const selected=piece.start?piece.node.splitText(piece.start):piece.node;
   const mark=document.createElement('mark');mark.dataset.cloudHighlight=note.id;
   mark.className='cloud-fb2-highlight';mark.title=note.body?`Комментарий: ${note.title}`:'Открыть выделение';
   selected.replaceWith(mark);mark.append(selected);
   void tail;
  }
 }
}
