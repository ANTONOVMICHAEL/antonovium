import assert from 'node:assert/strict';
import {createServer} from 'vite';
const vite=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},appType:'custom'});
try{
 const {parseWilkinsCommand:parse,companionBounds,clampCompanion,registerWilkinsReader,askWilkinsReader,getWilkinsReaderContext}=await vite.ssrLoadModule('/src/wilkinsCompanion.ts');
 assert.deepEqual(parse('Вилкинс, найди: презумпция недобросовестности'),{kind:'search',query:'презумпция недобросовестности'});
 const literal='Проверить § 1.2; «сделка» — не любое действие.\nВторая строка.';
 assert.deepEqual(parse('Запиши мысль: '+literal),{kind:'note',body:literal});
 assert.deepEqual(parse('Открой рукопись'),{kind:'navigate',screen:'manuscripts'});
 assert.deepEqual(parse('Поставь закладку'),{kind:'reader',action:'bookmark'});
 assert.deepEqual(parse('Вилкинс, следующая страница'),{kind:'reader',action:'next'});
 assert.deepEqual(parse('Не мешай'),{kind:'stay'});assert.deepEqual(parse('Прогуляйся'),{kind:'walk'});
 assert.deepEqual(parse('Придумай судебный акт'),{kind:'unknown'});assert.deepEqual(parse('Удали все записи'),{kind:'unknown'});
 for(const [width,height,reading] of [[360,780,false],[390,844,true],[1366,900,true],[360,390,true]]){
  const b=companionBounds(width,height,reading),p=clampCompanion(9999,-9999,b);
  assert.ok(p.x+b.width<=width&&p.y>=65);const floor=clampCompanion(-100,9999,b);assert.ok(floor.x>=0&&floor.y+b.height<height);
 }
 assert.equal(askWilkinsReader('bookmark'),false);const calls=[];
 const first=registerWilkinsReader(action=>{calls.push('old:'+action);return true},()=>({sourceId:'old',sectionId:'s1',quote:'',anchors:[]}));
 const last=registerWilkinsReader(action=>{calls.push('active:'+action);return action==='bookmark'},()=>({sourceId:'active',sectionId:'pdf:7',quote:'',anchors:[],fileAnchor:{format:'pdf',page:7}}));
 first();assert.equal(askWilkinsReader('bookmark'),true);assert.equal(getWilkinsReaderContext().fileAnchor.page,7);assert.equal(askWilkinsReader('next'),false);last();assert.equal(askWilkinsReader('bookmark'),false);assert.equal(getWilkinsReaderContext(),undefined);assert.deepEqual(calls,['active:bookmark','active:next']);
 console.log('PASS Wilkins: literal draft/search requests, supported actions, safe rejection, viewport/keyboard bounds and active-reader ownership.');
}finally{await vite.close()}
