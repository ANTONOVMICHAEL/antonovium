import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import {createServer} from 'vite';
const w=new Window({url:'http://localhost/'});
for(const key of ['window','document','navigator','localStorage','HTMLElement','Event'])Object.defineProperty(globalThis,key,{value:w[key],configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const vite=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
let roots=[];
try{
 const React=await import('react'),{createRoot}=await import('react-dom/client'),{act}=React;
 const {CloudProvider,useCloudSync,useCloud,supabase}=await vite.ssrLoadModule('/src/cloud.tsx');
 const {defaultState}=await vite.ssrLoadModule('/src/storage.ts');
 const {flatten,applyRecords,localValue,unchanged}=await vite.ssrLoadModule('/src/sync.ts');
 const rows=new Map();let offline=false,saves=0;
 const session={access_token:'unit-test-only',user:{id:'test-owner',email:'unit-test@example.invalid'}};
 supabase.auth.getSession=async()=>({data:{session},error:null});supabase.auth.onAuthStateChange=()=>({data:{subscription:{unsubscribe(){}}}});
 globalThis.fetch=async()=>new Response(JSON.stringify({storage_ready:true}),{status:200});
 supabase.from=()=>{const api={select(){return api},order(){return api},range:async()=>({data:offline?null:[...rows.values()].map(v=>structuredClone(v)),error:offline?{message:'offline'}:null}),then(resolve){return Promise.resolve({data:[],error:null}).then(resolve)}};return api};
 supabase.rpc=async(_name,p)=>{if(offline)return {error:{message:'offline'},data:null};const key=p.p_kind+':'+p.p_id,prior=rows.get(key);if(prior&&JSON.stringify(prior.data)===JSON.stringify(p.p_data))return {error:null,data:{ok:true,row:structuredClone(prior)}};if((prior?.revision??0)!==p.p_expected)return {error:null,data:{ok:false,row:structuredClone(prior??null)}};const row={kind:p.p_kind,entity_id:p.p_id,revision:(prior?.revision??0)+1,data:structuredClone(p.p_data),updated_at:new Date().toISOString()};saves++;rows.set(key,row);return {error:null,data:{ok:true,row:structuredClone(row)}}};
 const probes={};function Probe({id}){const[state,setState]=React.useState(()=>structuredClone(defaultState));const update=React.useCallback(v=>setState(s=>typeof v==='function'?v(s):{...s,...v}),[]);const sync=useCloudSync(state,update),cloud=useCloud();probes[id]={state,update,sync,cloud};return null}
 async function settle(){await act(async()=>{await new Promise(r=>setTimeout(r,80))})}
 async function mount(id){const node=document.createElement('div');document.body.append(node);const root=createRoot(node);roots.push(root);await act(async()=>root.render(React.createElement(CloudProvider,null,React.createElement(Probe,{id}))));await settle();await act(async()=>await probes[id].sync.flush());await settle()}
 async function edit(id,v){await act(async()=>probes[id].update(v));await act(async()=>await probes[id].sync.flush());await settle()}
 await mount('A');await mount('B');
 const note={id:'shared-note',title:'Общий тезис',body:'Текст с компьютера',kind:'thought',categories:[],createdAt:'2026-10-21'};
 await edit('A',s=>({...s,notes:[...s.notes,note]}));await act(async()=>await probes.B.sync.flush());assert.equal(probes.B.state.notes.find(n=>n.id===note.id)?.body,note.body);console.log('PASS note created on A appears on B');
 await edit('B',s=>({...s,notes:s.notes.map(n=>n.id===note.id?{...n,body:'Правка с телефона'}:n)}));await act(async()=>await probes.A.sync.flush());assert.equal(probes.A.state.notes.find(n=>n.id===note.id)?.body,'Правка с телефона');assert.equal([...rows.values()].filter(r=>r.kind==='conflict').length,0);console.log('PASS idle device pulls new revision without overwriting it');
 await edit('A',{manuscript:'Общий текст рукописи'});await act(async()=>await probes.B.sync.flush());assert.equal(probes.B.state.manuscript,'Общий текст рукописи');console.log('PASS manuscript changes reach second device');
 // Both clients edit from the same baseline; A uploads first, B retains a separate version.
 await act(async()=>{probes.A.update({manuscript:'Версия A'});probes.B.update({manuscript:'Версия B'})});await act(async()=>await probes.A.sync.flush());await act(async()=>await probes.B.sync.flush());assert.equal(rows.get('manuscript:main').data.body,'Версия A');assert.ok([...rows.values()].some(r=>r.kind==='conflict'&&r.data.local.body==='Версия B'));console.log('PASS simultaneous manuscript edits preserve both versions');
 offline=true;await edit('A',s=>({...s,notes:[...s.notes,{...note,id:'offline-note',body:'Без связи'}]}));assert.equal(rows.has('note:offline-note'),false);assert.ok(probes.A.state.notes.some(n=>n.id==='offline-note'));offline=false;await act(async()=>await probes.A.sync.flush());assert.equal(rows.get('note:offline-note').data.body,'Без связи');console.log('PASS offline edits upload after reconnection');
 await edit('A',s=>({...s,notes:s.notes.filter(n=>n.id!==note.id)}));await act(async()=>await probes.B.sync.flush());assert.equal(probes.B.state.notes.some(n=>n.id===note.id),false);assert.equal(rows.get('note:shared-note').data.deleted,true);console.log('PASS deletions propagate without resurrection');
 await edit('A',s=>({...s,positions:{...s.positions,'source:chapter':420}}));await act(async()=>await probes.B.sync.flush());assert.equal(probes.B.state.positions['source:chapter'],420);console.log('PASS text reading position syncs');
 const before=saves;await act(async()=>{await probes.A.sync.flush();await probes.B.sync.flush()});assert.equal(saves,before);console.log('PASS unchanged state creates no writes');
 assert.equal(unchanged({},'note:x',{kind:'note',data:{deleted:true}}),true);assert.deepEqual(localValue({},'note:x',{kind:'note',data:note}),{deleted:true});
 console.log('8 integration scenarios passed with two independent React workspaces and a simulated transport.');
}finally{const {act}=await import('react');await act(async()=>{for(const root of roots)root.unmount()});await vite.close();await w.happyDOM.close()}
process.exit(0);

