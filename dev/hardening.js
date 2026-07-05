// 窮舉硬化掃描:全6組×greedy/smart×meta0/中/滿×多地城係數×40seed → 確認引擎任何情況都不卡死/不拋錯
// 跑法:crayfish sim dev/hardening.js  (內容擴充/改動後跑、確保沒引入stall或crash)
const E=require('../engine.js');
const ROSTER=E.ROSTER, pairs=[];
for(let i=0;i<ROSTER.length;i++)for(let j=i+1;j<ROSTER.length;j++)pairs.push([ROSTER[i],ROSTER[j]]);
const metas=[null,{shards:0,ups:{vigor:3,might:2,fortune:1}},{shards:0,ups:{vigor:5,might:5,fortune:3}},
  {shards:0,ups:{},ch1cleared:true},{shards:0,ups:{vigor:5,might:5,fortune:3},ch1cleared:true}]; // 後2個=解鎖第二章路徑(兩章)也要掃
const coefs=[0.8,1.0,1.3];
function play(seed,picks,pol,meta,coef){
  let S, g=0;
  try{ S=E.init(seed,coef,picks,meta?JSON.parse(JSON.stringify(meta)):undefined); }catch(e){ return {err:'init:'+e.message}; }
  while(!E.isTerminal(S)){
    if(g++>=5000) return {stall:true,round:S.battle?S.battle.round:'-',node:S.run.node};
    let who,mv;
    try{ who=E.whoseTurn(S); if(who==='engine'){ S=E.engineStep(S); continue; } const p=who==='human'?'A':who; mv=pol(S,p); if(!mv) return {stall:true,nomove:true,phase:S.phase}; S=E.apply(S,mv); }
    catch(e){ return {err:e.message,phase:S.phase,node:S.run.node}; }
  }
  return {ok:true};
}
let games=0, stalls=[], errs=[];
for(const p of pairs)for(const pol of [E.greedy,E.smart])for(const meta of metas)for(const coef of coefs)
  for(let s=1;s<=40;s++){ games++; const r=play(s*137+7,p,pol,meta,coef);
    if(r.stall) stalls.push({p:p.join('+'),coef,s,...r});
    if(r.err) errs.push({p:p.join('+'),coef,s,...r}); }
console.log(`=== 窮舉硬化掃描:${games} 場 (6組×2adapter×${metas.length}meta[含解鎖兩章]×${coefs.length}coef×40seed) ===`);
console.log('STALL:', stalls.length, stalls.length?JSON.stringify(stalls.slice(0,5)):'✓ 零卡死');
console.log('CRASH:', errs.length, errs.length?JSON.stringify(errs.slice(0,5)):'✓ 零拋錯');
console.log(stalls.length||errs.length ? '❌ 有問題、需修' : '🎉 引擎在所有情況下都穩定終止、不卡死不崩');
