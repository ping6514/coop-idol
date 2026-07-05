// 機制驗證測試:斷言核心機制正確(元素×1.5/×0.5·AoE全體·蓄力·弱化·戰後復活)。純測試不改設計。
// 跑法:crayfish sim dev/mechtest.js  ·改動engine後跑、確保機制沒被改壞
const E=require('../engine.js');
let pass=0, fail=0;
function ok(name,cond,extra){ if(cond){pass++;console.log('  ✓ '+name);} else {fail++;console.log('  ✗ '+name+(extra?' — '+extra:''));} }
function battle(picks){ let S=E.init(7,1.0,picks||['yugan','shuimu']); S=E.apply(S,{type:'map_advance'}); return S; }
function setup(hand){ const S=battle(); const p=S.battle.combat.A; p.hand=hand.slice(); p.energy=9; p.firstStrike=false; p.st={}; S.battle.turn='A'; return S; }
function dmg(card,weak,resist){ const S=setup([card]); const e=S.battle.enemies[0]; e.weak=weak||[]; e.resist=resist||[]; e.block=0; e.armor=0; const before=e.hp; E.apply(S,{type:'play_card',player:'A',cardIdx:0,target:0}); return before-S.battle.enemies[0].hp; }

console.log('=== 機制驗證 ===');
const wk=dmg('flamedart',['fire'],[]), nu=dmg('flamedart',[],[]), rs=dmg('flamedart',[],['fire']);
console.log(`  (火矢傷害 怕火=${wk} 中性=${nu} 抗火=${rs})`);
ok('元素打弱點 ×1.5', Math.abs(wk/nu-1.5)<0.2, `${wk}/${nu}`);
ok('元素打抗性 ×0.5', Math.abs(rs/nu-0.5)<0.2, `${rs}/${nu}`);
{ const S=setup(['scatter']); const e0=S.battle.enemies[0]; e0.block=0;e0.armor=0;
  S.battle.enemies.push({id:'x',name:'測試靶',hp:50,max:50,block:0,armor:0,exposeCount:0,grp:null,ins:[{t:'smash',v:5}],ii:0,boss:false,tauntT:null,weak:null,resist:null,st:{}});
  const b0=e0.hp,b1=S.battle.enemies[1].hp; E.apply(S,{type:'play_card',player:'A',cardIdx:0,target:0});
  ok('AoE(散射)打全體敵人', S.battle.enemies[0].hp<b0 && S.battle.enemies[1].hp<b1); }
{ const base=dmg('strike',[],[]); const S=setup(['focus','strike']); const e=S.battle.enemies[0]; e.weak=[];e.resist=[];e.block=0;e.armor=0;
  let S2=E.apply(S,{type:'play_card',player:'A',cardIdx:0,target:0}); const before=S2.battle.enemies[0].hp;
  S2=E.apply(S2,{type:'play_card',player:'A',cardIdx:0,target:0}); const fdmg=before-S2.battle.enemies[0].hp;
  ok('蓄力(focus)放大下次攻擊', fdmg>base, `focus後=${fdmg} vs 基礎=${base}`); }
{ const S=setup(['weaken']); E.apply(S,{type:'play_card',player:'A',cardIdx:0,target:0});
  const w=(S.battle.enemies[0].st&&S.battle.enemies[0].st.weaken)?S.battle.enemies[0].st.weaken.v:0;
  ok('弱化施加減攻詞條', w>0, 'weaken='+w); }
{ const S=setup(['heavy','heavy','heavy']); S.battle.combat.B.downed=true; S.heroes.B.hp=0;
  const e=S.battle.enemies[0]; e.hp=1; e.weak=[];e.resist=[];e.block=0;e.armor=0;
  let S2=E.apply(S,{type:'play_card',player:'A',cardIdx:0,target:0});
  const revived=S2.heroes.B.hp, expect=Math.round(S2.heroes.B.max*0.4);
  ok('戰後自動復活倒地隊友(~40%)', revived>0 && Math.abs(revived-expect)<=1, `B=${revived} 期望≈${expect}`); }
console.log(`\n結果:${pass} 過 / ${fail} 失敗 ${fail?'❌':'🎉 核心機制全部正確'}`);
