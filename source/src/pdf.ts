import {GlobalWorkerOptions,getDocument,TextLayer,PDFDataRangeTransport,type PDFDocumentProxy} from 'pdfjs-dist';
import workerURL from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
class EmbeddedPDFResources {async fetch(params:{filename:string}){const {EmbeddedPDFResources:Factory}=await import('./pdf-resources');return new Factory().fetch(params)}}
GlobalWorkerOptions.workerSrc=workerURL;
export {TextLayer};
export type {PDFDocumentProxy};
const resources={BinaryDataFactory:EmbeddedPDFResources,useWorkerFetch:false,useSystemFonts:true};
export const openPDF=(input:string|Uint8Array)=>getDocument(typeof input==='string'?{...resources,url:input,disableAutoFetch:true,disableStream:true,rangeChunkSize:524288}:{...resources,data:input});
export async function openLocalPDF(file:File){
 const initial=new Uint8Array(await file.slice(0,65536).arrayBuffer());
 class FileRanges extends PDFDataRangeTransport{stopped=false;requestDataRange(begin:number,end:number){void file.slice(begin,end).arrayBuffer().then(b=>{if(!this.stopped)this.onDataRange(begin,new Uint8Array(b))})}abort(){this.stopped=true}}
 return getDocument({...resources,range:new FileRanges(file.size,initial,true,file.name),disableAutoFetch:true,disableStream:true});
}
