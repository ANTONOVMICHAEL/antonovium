import assert from 'node:assert/strict';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {build} from 'vite';
import {Window} from 'happy-dom';

const directory=resolve('.test-data/memory-card-ui');await mkdir(directory,{recursive:true});
const entry=resolve(directory,'entry.jsx');
await writeFile(entry,`
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import ScientificMemory from '../../src/components/ScientificMemory';
import {CloudProvider} from '../../src/cloud';
import {Context} from '../../src/context';
import {defaultState} from '../../src/storage';
import {createQuotation,getBibliography} from '../../src/scientificMemory';
const source={id:'paper-fixture',title:'Контрольное издание',author:'Тестовый Автор',year:'2026',subtitle:'Материал пользователя',format:'paper',demo:false,localOnly:true,categories:[],sections:[]};
const quote=createQuotation({source,rawText:'  Буквальная цитата с «ё».\\nВторая строка.  ',origin:'manual',printedPage:'139',printedPageConfirmed:true,comment:'Комментарий отдельно.',sectionId:'section-fixture',anchors:[{paragraphId:'paragraph-fixture',start:2,end:40}]});
quote.id='quote-fixture';
const own={id:'thought-fixture',title:'Собственное предположение',body:'Проверить различие оснований.',kind:'thought',evidenceType:'hypothesis',categories:[],quotationIds:['quote-fixture'],relatedSourceIds:[source.id],createdAt:'2026-10-24T12:00:00Z'};
function Test(){const[state,setState]=useState({...structuredClone(defaultState),screen:'memory',notes:[quote,own],sources:[source],bibliography:[getBibliography(source)],research:[],desk:{leftId:'previous-left',rightId:'preserved-right',leftAnchor:{format:'pdf',page:2},rightAnchor:{format:'pdf',page:7},active:'right',ratio:.5}});
 const update=value=>setState(previous=>typeof value==='function'?value(previous):{...previous,...value});
 const context={state,update,navigate:screen=>update({screen}),openSource:(...args)=>window.fixtureSource=args,openCategory:()=>{},openResearch:()=>{},composeNote:()=>{},openNote:()=>{},toast:()=>{},selection:null,setSelection:()=>{},focusParagraph:null,setFocusParagraph:value=>window.fixtureFocus=value,selectedNoteId:null,setSelectedNoteId:()=>{},setWilkins:()=>{},setSettings:()=>{}};
 return <Context.Provider value={context}><ScientificMemory/><output id="fixture-state">{JSON.stringify(state)}</output></Context.Provider>}
createRoot(document.getElementById('root')).render(<CloudProvider><Test/></CloudProvider>);
`);
let window;
try{
 const bundled=await build({configFile:false,logLevel:'error',define:{'process.env.NODE_ENV':'"production"'},build:{write:false,minify:false,lib:{entry,name:'MemoryCardsTest',formats:['iife']},rollupOptions:{external:id=>id==='../pdf'||id.endsWith('/pdf'),output:{inlineDynamicImports:true}}}});
 const code=(Array.isArray(bundled)?bundled[0]:bundled).output.find(item=>item.type==='chunk').code;
 window=new Window({url:'https://memory-cards.test/',settings:{enableJavaScriptEvaluation:true}});
 window.structuredClone=structuredClone;window.crypto.randomUUID=randomUUID;
 const errors=[];window.console.error=(...args)=>errors.push(args.join(' '));window.addEventListener('error',event=>errors.push(event.message));
 window.document.write('<!doctype html><html><body><div id="root"></div></body></html>');window.eval(code);
 const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 async function until(fn,message){for(let n=0;n<100;n++){if(fn())return;await pause(20)}throw Error(message)}
 await until(()=>window.document.getElementById('fixture-state'),'Fixture did not mount');
 const state=()=>JSON.parse(window.document.getElementById('fixture-state').textContent);
 const buttons=()=>[...window.document.querySelectorAll('button')];
 const button=text=>buttons().find(item=>item.textContent.trim()===text||item.textContent.trim().startsWith(text));
 async function click(el){assert.ok(el,'Expected UI action exists');el.click();await pause(70)}
 async function field(el,value){assert.ok(el,'Expected UI field exists');const ctor=el.tagName==='TEXTAREA'?window.HTMLTextAreaElement:el.tagName==='SELECT'?window.HTMLSelectElement:window.HTMLInputElement;Object.getOwnPropertyDescriptor(ctor.prototype,'value').set.call(el,value);el.dispatchEvent(new window.Event(el.tagName==='SELECT'?'change':'input',{bubbles:true}));await pause(50)}
 const label=text=>[...window.document.querySelectorAll('label')].find(item=>item.childNodes[0]?.textContent.trim()===text)?.querySelector('input,textarea,select');
 const raw='  Буквальная цитата с «ё».\nВторая строка.  ';
 assert.equal(window.document.querySelector('.memory-literal').textContent,raw);assert.equal(state().notes[0].body,'Комментарий отдельно.');console.log('PASS quotation literal and comment remain separate in the cards');
 await click(button('Библиография'));await click(button('Уточнить сведения'));await field(label('Издательство'),'Проверенное издательство');
 await click(button('Сохранить сведения'));assert.equal(state().bibliography[0].publisher,'Проверенное издательство');assert.equal(state().bibliography[0].isbn,undefined);assert.equal(state().sources[0].title,'Контрольное издание');console.log('PASS bibliography edits preserve source identity and do not fabricate missing ISBN');
 await click(button('Цитаты'));await click(button('Сверка и связи'));assert.equal(window.document.querySelector('textarea[readonly]').value,raw);
 await field(label('Страница издания'),'140');await field(label('Собственный комментарий'),'Новый самостоятельный комментарий.');await click(button('Сохранить связи и комментарий'));
 assert.equal(state().notes[0].quote,raw);assert.equal(state().notes[0].citation.rawText,raw);assert.equal(state().notes[0].citation.printedPage,'140');assert.equal(state().notes[0].citation.printedPageConfirmed,false);assert.equal(state().notes[0].body,'Новый самостоятельный комментарий.');console.log('PASS verification fields change independently of the immutable quotation');
 await click(button('Ввести цитату вручную'));const manual='  Точный ручной фрагмент.\nСледующая строка. ';
 await field(label('Буквальный текст цитаты'),manual);await field(label('Собственный комментарий'),'Ручной комментарий');await click(button('Сохранить цитату'));
 const saved=state().notes.find(note=>note.quote===manual);assert.equal(saved.citation.origin,'manual');assert.equal(saved.sourceId,'paper-fixture');assert.equal(saved.body,'Ручной комментарий');assert.equal(saved.citation.verification,'unverified');assert.equal(saved.localOnly,true);console.log('PASS manual transcription records its source, local privacy and honest unverified provenance');
 await field(label('Автор'),'Отсутствующий автор');assert.equal(window.document.querySelectorAll('.memory-record').length,0);await click(button('Сбросить фильтры'));assert.equal(window.document.querySelectorAll('.memory-record').length,2);console.log('PASS author filtering affects the view without removing scientific records');
 await click(button('Экспорт и восстановление'));await click(button('Шаблоны описания и цитат'));await field(label('Библиографическое описание'),'{authors}{title} ({year})');await field(label('Цитата со ссылкой'),'{quote}\n{source} {locator}');await click(button('Сохранить шаблоны'));
 assert.equal(state().bibliographicTemplates.bibliography,'{authors}{title} ({year})');assert.equal(state().notes.find(note=>note.id==='quote-fixture').quote,raw);console.log('PASS editable export templates leave original quotations intact');
 const card=[...window.document.querySelectorAll('.memory-record')].find(item=>item.querySelector('.memory-literal')?.textContent===raw);
 await click([...card.querySelectorAll('button')].find(item=>item.textContent==='Открыть в источнике'));assert.deepEqual(Array.from(window.fixtureSource),['paper-fixture','section-fixture']);assert.deepEqual(JSON.parse(window.fixtureFocus.slice(5)),{paragraphId:'paragraph-fixture',start:2,end:40,quote:raw});
 await click([...card.querySelectorAll('button')].find(item=>item.textContent==='В левую область'));assert.equal(state().desk.leftId,'paper-fixture');assert.equal(state().desk.leftAnchor,undefined);assert.equal(state().desk.leftTextAnchor.quote,raw);assert.equal(state().desk.leftLocalOnly,true);assert.equal(state().desk.rightId,'preserved-right');assert.equal(state().desk.rightAnchor.page,7);console.log('PASS exact source and desk text anchors clear stale file anchors and preserve the opposite pane');
 await click(button('Мои рассуждения'));await click(button('Связи записи'));await click(button('Сохранить связи и комментарий'));assert.equal(state().notes.find(note=>note.id==='thought-fixture').localOnly,true);assert.ok(window.document.querySelector('.memory-local'));console.log('PASS own thoughts linked to local material retain local privacy and show the device label');
 assert.deepEqual(errors,[],'No component runtime errors');
 console.log('8 scientific-memory component scenarios passed. This suite does not validate real cloud sessions or browser geometry.');
}finally{if(window)await window.happyDOM.close();await rm(directory,{recursive:true,force:true})}
