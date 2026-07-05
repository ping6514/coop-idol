// 平衡回歸 harness:掃全 6 種角色組合、meta0 基礎難度、greedy(貪心) vs smart(動腦) 各 20 seed
// 跑法:crayfish sim dev/balance.js (或 jellyfish sim / node dev/balance.js)
// 判準:貪心<50%(不無腦贏) · 動腦>貪心(有深度) · 動腦別太低(>=40 不勸退) · 0 STALL
const E=require('../engine.js');
const ROSTER=E.ROSTER, NAME={yugan:'魚乾',shuimu:'水母',wanzi:'丸子',jin:'金魚'}, N=20;
function play(seed,picks,pol){
  let S=E.init(seed,1.0,picks), guard=0, stalled=false;
  while(!E.isTerminal(S)){ if(guard++>=5000){stalled=true;break;} const who=E.whoseTurn(S);
    if(who==='engine'){S=E.engineStep(S);continue;} const player=who==='human'?'A':who;
    const mv=pol(S,player); if(!mv){stalled=true;break;} S=E.apply(S,mv); }
  return {win:E.isTerminal(S)==='win',stalled};
}
function run(picks,pol){ let w=0,st=0; for(let s=1;s<=N;s++){const r=play(s*13+1,picks,pol); if(r.win)w++; if(r.stalled)st++;} return {w,st}; }
const pairs=[]; for(let i=0;i<ROSTER.length;i++)for(let j=i+1;j<ROSTER.length;j++)pairs.push([ROSTER[i],ROSTER[j]]);
console.log('=== 平衡 pass:6 組合 × 20 seed × (貪心/動腦) · meta0 ===');
console.log('組合                貪心   動腦   gap   判讀'); let flags=[];
for(const p of pairs){ const g=run(p,E.greedy), sm=run(p,E.smart); const gw=g.w*5,sw=sm.w*5,gap=sw-gw; let v=[];
  if(gw>=50)v.push('⚠貪心太高'); if(gap<20)v.push('⚠深度淺'); if(sw<40)v.push('⚠動腦太低');
  if(sw>85)v.push('⚠太簡單'); if(g.st||sm.st)v.push('❌STALL'+(g.st+sm.st)); if(!v.length)v.push('✓健康');
  console.log(`${(NAME[p[0]]+'+'+NAME[p[1]]).padEnd(14,'　')}  ${String(gw).padStart(3)}%  ${String(sw).padStart(3)}%  ${String(gap>=0?'+'+gap:gap).padStart(4)}  ${v.join(' ')}`);
  if(v.some(x=>x[0]==='⚠'||x[0]==='❌'))flags.push(NAME[p[0]]+'+'+NAME[p[1]]);
}
console.log('\n需關注:', flags.length?flags.join(' | '):'無、全健康 🎉');
