// meta 安全網 harness:困難組合在全局成長後是否變可玩(哲學:內容做強、玩家靠全局升級輾過去)
// 跑法:crayfish sim dev/metatest.js
const E=require('../engine.js');
function play(seed,picks,pol,meta){
  let S=E.init(seed,1.0,picks,meta?JSON.parse(JSON.stringify(meta)):undefined), g=0;
  while(!E.isTerminal(S)&&g++<5000){ const w=E.whoseTurn(S); if(w==='engine'){S=E.engineStep(S);continue;}
    const p=w==='human'?'A':w; const mv=pol(S,p); if(!mv)break; S=E.apply(S,mv);} return E.isTerminal(S)==='win';
}
function rate(picks,pol,meta){ let w=0; for(let s=1;s<=20;s++) if(play(s*13+1,picks,pol,meta))w++; return w*5; }
const MID={shards:0,ups:{vigor:3,might:2,fortune:1}}, MAX={shards:0,ups:{vigor:5,might:5,fortune:3}};
const NAME={yugan:'魚乾',shuimu:'水母',wanzi:'丸子',jin:'金魚'};
console.log('=== meta 安全網(動腦adapter·20seed) ===\n組合            meta0   meta中   meta滿');
for(const p of [['yugan','jin'],['shuimu','wanzi'],['yugan','shuimu']]){
  console.log(`${(NAME[p[0]]+'+'+NAME[p[1]]).padEnd(10,'　')}  ${String(rate(p,E.smart,null)).padStart(3)}%   ${String(rate(p,E.smart,MID)).padStart(3)}%   ${String(rate(p,E.smart,MAX)).padStart(3)}%`);
}
