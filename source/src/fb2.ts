export interface FB2Chapter {id:string;title:string;html:string}
export interface FB2Document {title:string;author:string;edition:string;cover?:string;chapters:FB2Chapter[];toc:{id:string;title:string;chapter:string}[];targets:Record<string,string>}
const MAX_XML=64*1024*1024;
export function decodeXML(bytes:Uint8Array){
 if(bytes.byteLength>MAX_XML)throw Error('FB2 превышает безопасный объем обработки в браузере: 64 МБ XML. Оригинал не изменен.');
 let encoding='utf-8';if(bytes[0]===255&&bytes[1]===254)encoding='utf-16le';else if(bytes[0]===254&&bytes[1]===255)encoding='utf-16be';else{const head=new TextDecoder('windows-1251').decode(bytes.subarray(0,400));encoding=head.match(/<\?xml[^>]*encoding\s*=\s*["']([^"']+)["']/i)?.[1]??encoding;}
 if(!/^(utf-?8|utf-?16(?:le|be)?|windows-1251|cp1251|koi8-r|iso-8859-5)$/i.test(encoding))throw Error('Кодировка FB2 не поддерживается');
 return new TextDecoder(encoding,{fatal:true}).decode(bytes);
}
export function parseFB2(xml:string):FB2Document{
 if(xml.length>MAX_XML||/<!DOCTYPE|<!ENTITY|<\?xml-stylesheet/i.test(xml))throw Error('В FB2 обнаружены запрещенные XML-конструкции');
 const doc=new DOMParser().parseFromString(xml,'application/xml');if(doc.querySelector('parsererror')||doc.documentElement.localName!=='FictionBook')throw Error('Некорректный XML FictionBook');
 const root=doc.documentElement,path=new WeakMap<Element,string>(),original=new Map<string,string>(),binaries=new Map<string,string>();let count=0,totalImage=0;
 function index(el:Element,key:string,depth:number){if(++count>200000||depth>64)throw Error('Слишком сложная структура FB2');path.set(el,`fb2-${key}`);const id=el.getAttribute('id');if(id&&!original.has(id))original.set(id,`fb2-${key}`);Array.from(el.children).forEach((child,i)=>index(child,`${key}.${i}`,depth+1));}
 index(root,'0',0);
 const children=(el:Element,name:string)=>Array.from(el.children).filter(n=>n.localName===name);
 const first=(el:Element|undefined,name:string)=>el?children(el,name)[0]:undefined;
 const content=(el:Element|undefined)=>el?.textContent?.trim()??'';
 const description=first(root,'description'),info=first(description,'title-info'),publish=first(description,'publish-info');
 const title=content(first(info,'book-title')),author=info?children(info,'author').map(a=>['first-name','middle-name','last-name'].map(n=>content(first(a,n))).filter(Boolean).join(' ')||content(first(a,'nickname'))).filter(Boolean).join('; '):'';
 for(const binary of children(root,'binary')){const id=binary.getAttribute('id')??'',mime=binary.getAttribute('content-type')??'',data=content(binary).replace(/\s/g,'');if(!/^image\/(png|jpe?g|gif|webp)$/.test(mime)||!/^[A-Za-z0-9+/]*={0,2}$/.test(data)||data.length>7*1024*1024)continue;totalImage+=data.length;if(totalImage>28*1024*1024)throw Error('Слишком большой объем встроенных иллюстраций');binaries.set(id,`data:${mime};base64,${data}`);}
 const href=(el:Element)=>el.getAttributeNS('http://www.w3.org/1999/xlink','href')??el.getAttribute('href')??Array.from(el.attributes).find(a=>a.localName==='href'||a.name.endsWith(':href'))?.value??'';
 const coverNode=info?first(first(info,'coverpage'),'image'):undefined,cover=coverNode?binaries.get(href(coverNode).replace(/^#/,'')):undefined;
 const tags:Record<string,string>={p:'p',v:'p',text:'div',section:'section',title:'h2',subtitle:'h3',strong:'strong',emphasis:'em',strikethrough:'s',sub:'sub',sup:'sup',code:'code',epigraph:'blockquote',cite:'blockquote',poem:'div',stanza:'div','text-author':'cite',date:'span',table:'table',tr:'tr',td:'td',th:'th',annotation:'div'};
 function convert(el:Element):Node|null{
  const name=el.localName,id=path.get(el)!;
  if(name==='empty-line')return document.createElement('br');
  if(name==='image'){const url=binaries.get(href(el).replace(/^#/,''));if(!url)return null;const img=document.createElement('img');img.src=url;img.alt='Иллюстрация из книги';img.loading='lazy';img.id=id;return img;}
  let result:HTMLElement;
  if(name==='a'){const target=href(el);result=document.createElement('a');if(target.startsWith('#')&&original.has(target.slice(1)))result.setAttribute('href',`#${original.get(target.slice(1))}`);else if(/^https:\/\//i.test(target)){result.setAttribute('href',target);result.setAttribute('target','_blank');result.setAttribute('rel','noopener noreferrer');}else result=document.createElement('span');}
  else{const tag=tags[name];if(!tag)return null;result=document.createElement(tag);}
  result.id=id;if(['p','v','subtitle','text-author'].includes(name))result.dataset.fb2Paragraph=id;
  if(name==='td'||name==='th')for(const attr of ['colspan','rowspan']){const n=Number(el.getAttribute(attr));if(Number.isInteger(n)&&n>0&&n<=20)result.setAttribute(attr,String(n));}
  for(const child of Array.from(el.childNodes)){if(child.nodeType===3)result.append(document.createTextNode(child.textContent??''));else if(child.nodeType===1){const node=convert(child as Element);if(node)result.append(node);}}
  return result;
 }
 const chapters:FB2Chapter[]=[],toc:FB2Document['toc']=[],targets:Record<string,string>={};
 for(const body of children(root,'body')){
  const sections=children(body,'section'),intro=Array.from(body.children).filter(n=>n.localName!=='section'),hasIntro=intro.some(n=>content(n)||n.localName==='image');const units=sections.length?(hasIntro?[body,...sections]:sections):[body];
  for(const unit of units){const id=path.get(unit)!,title=content(first(unit,'title'))||content(first(body,'title'))||(body.getAttribute('name')==='notes'?'Примечания':`Раздел ${chapters.length+1}`);const fragment=document.createElement('div');
   if(unit===body){for(const child of Array.from(unit.children).filter(n=>!sections.length||n.localName!=='section')){const result=convert(child);if(result)fragment.append(result)}}else{const result=convert(unit);if(result)fragment.append(result)}
   chapters.push({id,title,html:fragment.innerHTML});toc.push({id,title,chapter:id});for(const el of (unit===body&&sections.length?[body,...intro.flatMap(n=>[n,...Array.from(n.querySelectorAll('*'))])]:[unit,...Array.from(unit.querySelectorAll('*'))])){const target=path.get(el)!;targets[target]=id;if(el!==unit&&el.localName==='section')toc.push({id:target,title:content(first(el,'title'))||'Раздел',chapter:id});}
  }
 }
 if(!chapters.length)throw Error('В FB2 не найден текст произведения');
 return {title,author,edition:[content(first(publish,'publisher')),content(first(publish,'city')),content(first(publish,'year')),content(first(publish,'isbn'))].filter(Boolean).join(' · '),cover,chapters,toc,targets};
}
