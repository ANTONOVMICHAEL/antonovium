// Package-owned fonts, CMaps and image decoders are bundled with the reader.
// Private books never cause resource requests to a third-party CDN.
const files={...import.meta.glob('../node_modules/pdfjs-dist/cmaps/*.bcmap',{eager:true,query:'?url',import:'default'}),...import.meta.glob('../node_modules/pdfjs-dist/standard_fonts/*.{pfb,ttf}',{eager:true,query:'?url',import:'default'}),...import.meta.glob('../node_modules/pdfjs-dist/wasm/*.wasm',{eager:true,query:'?url',import:'default'})} as Record<string,string>;
const resources=Object.fromEntries(Object.entries(files).map(([path,value])=>[path.split('/').at(-1)!,value]));
export class EmbeddedPDFResources {
 async fetch({filename}:{filename:string}){const url=resources[filename];if(!url)throw Error('PDF resource not found');const response=await fetch(url);if(!response.ok)throw Error('PDF resource unavailable');return new Uint8Array(await response.arrayBuffer());}
}
