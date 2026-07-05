// 卡片使用率審計:全6組×smart×多seed·統計每張卡「被出次數/手牌出現次數」→ 找死卡(adapter幾乎不出)
// 跑法:crayfish sim dev/cardaudit.js  ·純讀取分析、不改設計
const E=require('../engine.js');
const ROSTER=E.ROSTER, pairs=[];
for(let i=0;i<ROSTER.length;i++)for(let j=i+1;j<ROSTER.length;j++)pairs.push([ROSTER[i],ROSTER[j]]);
const played={}, seen={}, bk=k=>k.replace(/P$/,'');
function play(seed,picks){ let S=E.init(seed,1.0,picks), g=0;
  while(!E.isTerminal(S)&&g++<5000){ const who=E.whoseTurn(S); if(who==='engine'){S=E.engineStep(S);continue;}
    const p=who==='human'?'A':who; const mv=E.smart(S,p); if(!mv)break;
    if(mv.type==='play_card'&&S.battle){ const k=S.battle.combat[p].hand[mv.cardIdx]; if(k)played[bk(k)]=(played[bk(k)]||0)+1; }
    if((who==='A'||who==='B')&&S.battle) S.battle.combat[who].hand.forEach(k=>seen[bk(k)]=(seen[bk(k)]||0)+1);
    S=E.apply(S,mv); } }
for(const p of pairs) for(let s=1;s<=15;s++) play(s*29+3,p);
const C=E.C, rows=[];
for(const k of Object.keys(C)){ if(/P$/.test(k))continue; const pl=played[k]||0,sn=seen[k]||0; rows.push({n:C[k].n,pl,sn,rate:sn?pl/sn*100:0}); }
rows.sort((a,b)=>a.rate-b.rate);
console.log('=== 卡片使用率審計(smart·全6組×15seed) ===');
console.log('最少出的10張(死卡候選):'); rows.filter(r=>r.sn>=5).slice(0,10).forEach(r=>console.log(`  ${r.n.padEnd(8,'　')} ${r.rate.toFixed(0)}% (出${r.pl}/現${r.sn})`));
console.log('smart從不出:', rows.filter(r=>r.pl===0).map(r=>r.n).join('、')||'無');
console.log('最常出8張:'); rows.slice().sort((a,b)=>b.pl-a.pl).slice(0,8).forEach(r=>console.log(`  ${r.n.padEnd(8,'　')} ${r.pl}次`));
