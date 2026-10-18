import ts from 'typescript';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
const dir=await mkdtemp(resolve('.edge-check-'));
try{
 const paths=[];
 for(const name of ['antonovium-library','antonovium-login']){
  const source=await readFile(`supabase/functions/${name}/index.ts`,'utf8');
  const nodeSource=source.replace(/npm:(@[^'"\s]+)@[0-9]+\.[0-9]+\.[0-9]+/g,'$1');
  const path=resolve(dir,name+'.ts');await writeFile(path,nodeSource);paths.push(path);
 }
 const shim=resolve(dir,'deno.d.ts');await writeFile(shim,'declare const Deno:{env:{get(name:string):string|undefined};serve(handler:(request:Request)=>Promise<Response>|Response):void};');paths.push(shim);
 const options={noEmit:true,strict:true,skipLibCheck:true,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,moduleResolution:ts.ModuleResolutionKind.Bundler,lib:['lib.es2022.d.ts','lib.dom.d.ts']};
 const program=ts.createProgram(paths,options),errors=ts.getPreEmitDiagnostics(program);
 if(errors.length){console.error(ts.formatDiagnosticsWithColorAndContext(errors,{getCurrentDirectory:()=>process.cwd(),getCanonicalFileName:x=>x,getNewLine:()=> '\n'}));process.exitCode=1}else console.log('Both Edge Functions pass TypeScript checks against the pinned local SDK types.');
}finally{await rm(dir,{recursive:true,force:true})}
