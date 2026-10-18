import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
let html=await readFile(resolve(root,'dist/index.html'),'utf8');
const scripts=[...html.matchAll(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g)];
for(const match of scripts){let code=await readFile(resolve(root,'dist',match[1].replace(/^\.\//,'')),'utf8');code=code.replace(/<\/script/gi,'<\\/script');html=html.replace(match[0],()=>`<script type="module">${code}</script>`)}
const styles=[...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g)];
for(const match of styles){const css=await readFile(resolve(root,'dist',match[1].replace(/^\.\//,'')),'utf8');html=html.replace(match[0],()=>`<style>${css}</style>`)}
await writeFile(resolve(root,'ANTONOVIUM.html'),html);
console.log('Standalone: ANTONOVIUM.html');
