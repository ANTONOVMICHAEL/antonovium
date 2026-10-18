import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createCanvas,DOMMatrix,Path2D,ImageData} from '@napi-rs/canvas';
globalThis.DOMMatrix=DOMMatrix;globalThis.Path2D=Path2D;globalThis.ImageData=ImageData;
const {getDocument,PDFDataRangeTransport}=await import('pdfjs-dist/legacy/build/pdf.mjs');
const stream=(data,extra='')=>Buffer.concat([Buffer.from(`<< /Length ${data.length} ${extra} >>\nstream\n`),data,Buffer.from('\nendstream')]);
const image=Buffer.alloc(32*32);for(let y=0;y<32;y++)for(let x=0;x<32;x++)image[y*32+x]=((x>>2)+(y>>2))%2?230:20;
const objects=[Buffer.from('<< /Type /Catalog /Pages 2 0 R >>'),Buffer.from('<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>'),Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << /Font << /F1 6 0 R >> >> /Contents 5 0 R >>'),Buffer.from('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /Resources << /XObject << /Im0 8 0 R >> >> /Contents 7 0 R >>'),stream(Buffer.from('BT /F1 18 Tf 20 350 Td (ANTONOVIUM PDF check) Tj ET')),Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'),stream(Buffer.from('q 200 0 0 300 20 20 cm /Im0 Do Q')),stream(image,'/Type /XObject /Subtype /Image /Width 32 /Height 32 /ColorSpace /DeviceGray /BitsPerComponent 8'),stream(Buffer.alloc(66*1024*1024,32))];
const pieces=[Buffer.from('%PDF-1.7\n')],offsets=[0];let offset=pieces[0].length;
objects.forEach((data,i)=>{offsets.push(offset);const object=Buffer.concat([Buffer.from(`${i+1} 0 obj\n`),data,Buffer.from('\nendobj\n')]);pieces.push(object);offset+=object.length});
const xref=offset;pieces.push(Buffer.from(`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`));
const bytes=Buffer.concat(pieces);assert.ok(bytes.length>50*1024*1024);
let transferred=65536;
class FixtureRanges extends PDFDataRangeTransport{requestDataRange(begin,end){transferred+=end-begin;queueMicrotask(()=>this.onDataRange(begin,new Uint8Array(bytes.subarray(begin,end))))}}
const task=getDocument({range:new FixtureRanges(bytes.length,new Uint8Array(bytes.subarray(0,65536)),true),disableAutoFetch:true,disableStream:true,standardFontDataUrl:new URL('../node_modules/pdfjs-dist/standard_fonts/',import.meta.url).pathname,wasmUrl:new URL('../node_modules/pdfjs-dist/wasm/',import.meta.url).pathname});
const checks=[];
try{
 const doc=await task.promise;assert.equal(doc.numPages,2);checks.push('A valid 66+ MiB PDF opens through range transport');
 const text=await(await doc.getPage(1)).getTextContent();assert.match(text.items.map(i=>i.str??'').join(' '),/ANTONOVIUM PDF check/);checks.push('The actual PDF text layer is extracted');
 const page=await doc.getPage(2),scanned=await page.getTextContent();assert.equal(scanned.items.length,0);const cv=createCanvas(300,400);await page.render({canvas:cv,viewport:page.getViewport({scale:1})}).promise;const pixels=cv.getContext('2d').getImageData(100,100,1,1).data;assert.notEqual(pixels[0],255);checks.push('An image-only scanned page renders without fabricating text');
 assert.ok(transferred<2*1024*1024,`Range transport unexpectedly read ${transferred} bytes`);checks.push('Metadata and the first two pages do not load the 66 MiB payload into the reader');
 await writeFile('docs/pdf-validation.json',JSON.stringify({scope:'Local PDF.js parser/rendering and large-file range test. No Yandex upload was performed.',file_bytes:bytes.length,range_bytes:transferred,checks},null,2));console.log(JSON.stringify({checks:checks.length,file_bytes:bytes.length,range_bytes:transferred}));
}finally{await task.destroy()}
