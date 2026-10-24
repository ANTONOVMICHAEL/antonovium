import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {Window} from 'happy-dom';

const window=new Window({url:'https://quote-anchors.test/'}),previous=new Map();
for(const name of ['window','document','Node','NodeFilter','CSS']){previous.set(name,globalThis[name]);globalThis[name]=name==='window'?window:window[name]}
const vite=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
try{
 const {locateQuote,quoteContext,sourceParagraphContext,verifiedFB2Anchor,verifiedTextAnchor,normalizedQuoteRects}=await vite.ssrLoadModule('/src/quoteAnchors.ts');
 const root=window.document.createElement('article');window.document.body.append(root);
 root.textContent='Перед.  Буквальная цитата с «ё».\nВторая строка.  После.';
 const literal='  Буквальная цитата с «ё».\nВторая строка.  ',hit=locateQuote(root,literal);
 assert.ok(hit?.exact);assert.equal(hit.range.toString(),literal);assert.deepEqual(quoteContext(root,hit.range),{contextBefore:'Перед.',contextAfter:'После.'});
 console.log('PASS exact quotation retains leading/trailing whitespace and real surrounding context');
 root.innerHTML='<span>Научная</span><span>память</span><span>с ё</span>';
 const pdf=locateQuote(root,'Научная память с е');assert.ok(pdf);assert.equal(pdf.exact,false);assert.equal(pdf.range.toString(),'Научнаяпамятьс ё');assert.equal(pdf.range.startContainer,root.firstChild.firstChild);
 console.log('PASS PDF span gaps and ё normalization map to actual original DOM nodes');
 root.textContent='Первый контекст. Повтор. Второй контекст. Повтор.';
 const repeated=locateQuote(root,'Повтор.','Второй контекст. ');assert.equal(repeated.start,root.textContent.lastIndexOf('Повтор.'));
 assert.equal(locateQuote(root,'Повтор.','Посторонний контекст'),null);assert.equal(locateQuote(root,'Отсутствующая строка'),null);
 assert.equal(locateQuote(root,'Повтор.'),null,'An ambiguous sentence without context is not an exact location');
 root.innerHTML='<p data-paragraph="a">Первый контекст. Повтор.</p><p data-paragraph="b">Второй контекст. Повтор.</p>';
 assert.equal(verifiedTextAnchor(root,{paragraphId:'gone',start:0,end:7,quote:'Повтор.'}).found,false);
 assert.equal(verifiedTextAnchor(root,{paragraphId:'gone',start:0,end:7,quote:'Повтор.',prefix:'Второй контекст. '}).paragraph.dataset.paragraph,'b');
 console.log('PASS real context disambiguates repeated text; unrelated context never guesses a repeated occurrence');
 root.innerHTML='<p id="p1" data-fb2-paragraph>Начало. Точная цитата. Конец.</p><p id="p2" data-fb2-paragraph>Следующий абзац.</p>';
 const at={format:'fb2',chapter:'ch1',paragraph:'p1',offset:8,quote:'Точная цитата.',page:6},exact=verifiedFB2Anchor(root,at);
 assert.equal(exact.found,true);assert.equal(exact.exact,true);assert.equal(exact.anchor.offset,8);assert.equal(exact.anchor.page,undefined);
 const stale=verifiedFB2Anchor(root,{...at,offset:0});assert.equal(stale.found,true);assert.equal(stale.anchor.offset,8);
 const missing=verifiedFB2Anchor(root,{...at,quote:'Другой текст'});assert.equal(missing.found,false);assert.equal(missing.anchor.paragraph,'p1');
 console.log('PASS FB2 literal verifies stable offsets, repairs stale offsets, and explicitly retains only a nearest anchor on failure');
 root.innerHTML='<div><span>01</span><p data-paragraph="one">  Первый абзац.  </p><button>+</button></div><div><span>02</span><p data-paragraph="two">Второй абзац. Конец.</p><button>+</button></div>';
 const multi=verifiedTextAnchor(root,{paragraphId:'one',start:2,end:16,quote:'Первый абзац.  \n\nВторой абзац.'});assert.equal(multi.found,true);assert.equal(multi.exact,true);assert.equal(multi.range.startContainer.parentElement.dataset.paragraph,'one');assert.equal(multi.range.endContainer.parentElement.dataset.paragraph,'two');
 const context=sourceParagraphContext(root,[{paragraphId:'one',start:2,end:16},{paragraphId:'two',start:0,end:13}]);assert.equal(context.contextBefore,'  ');assert.equal(context.contextAfter,' Конец.');assert.ok(!context.contextBefore.includes('01'));assert.ok(!context.contextAfter.includes('+'));
 console.log('PASS source-only paragraph quotes and contexts exclude control labels across a multi-paragraph selection');
 const noMatch=verifiedTextAnchor(root,{paragraphId:'two',start:0,end:5,quote:'Такого фрагмента нет'});assert.equal(noMatch.found,false);assert.equal(noMatch.range,null);assert.equal(noMatch.paragraph.dataset.paragraph,'two');
 const rects=normalizedQuoteRects({getClientRects:()=>[{left:25,top:60,width:50,height:20}]},{getBoundingClientRect:()=>({left:0,top:10,width:100,height:100})});assert.deepEqual(rects,[[.25,.5,.5,.2]]);
 console.log('PASS missing literal yields no invented range; PDF highlight geometry uses only returned DOM rectangles');
 console.log('7 quotation-anchor scenarios passed. Layout geometry and native mobile gestures are covered separately by browser checks.');
}finally{
 await vite.close();await window.happyDOM.close();for(const[name,value]of previous){if(value===undefined)delete globalThis[name];else globalThis[name]=value}
}
