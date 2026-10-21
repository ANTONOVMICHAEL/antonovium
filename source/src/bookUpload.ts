import {sha256} from '@noble/hashes/sha2.js';
import {fileApi,type Book} from './cloud';
export async function fingerprint(file:Blob){const h=sha256.create();for(let n=0;n<file.size;n+=4*1024*1024)h.update(new Uint8Array(await file.slice(n,n+4*1024*1024).arrayBuffer()));return Array.from(h.digest(),v=>v.toString(16).padStart(2,'0')).join('')}
export async function uploadShared(file:File,details:Pick<Book,'title'|'author'|'edition'|'cover'>,onProgress?:(n:number)=>void):Promise<Book>{
 const begin=await fileApi('init',{...details,name:file.name,size:file.size,format:/\.pdf$/i.test(file.name)?'pdf':'fb2',fingerprint:await fingerprint(file)});const id=begin.book.id;
 if(begin.duplicate)return begin.book;
 if(!begin.needs_completion){const step=begin.multipart?begin.part_size:file.size;for(let start=0,part=1;start<file.size;start+=step,part++){
  for(let attempt=0;;attempt++){try{const url=begin.multipart?(await fileApi('parts',{id,parts:[part]})).parts[0].url:begin.url;
   const response=await fetch(url,{method:'PUT',headers:begin.multipart?{}:{'Content-Type':/\.pdf$/i.test(file.name)?'application/pdf':'application/xml'},body:file.slice(start,start+step)});if(!response.ok)throw Error(`Передача книги прервана (${response.status})`);break;
  }catch(e){if(attempt>=2)throw e}}
  onProgress?.(Math.min(99,Math.round(100*Math.min(start+step,file.size)/file.size)));
 }}return (await fileApi('complete',{id})).book;
}
