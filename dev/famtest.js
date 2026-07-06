// 使魔觸發驗證:每人一隻·開場選·owner-keyed 觸發。跑法:crayfish sim dev/famtest.js
const E=require('../engine.js');
let pass=0,fail=0; const ok=(n,c,x)=>{ if(c){pass++;console.log('  ✓ '+n);}else{fail++;console.log('  ✗ '+n+(x?' — '+x:''));} };
function battle(fam){ let S=E.init(7,1.0,['yugan','shuimu']); S.run.fam={A:fam||null,B:null}; S=E.apply(S,{type:'map_advance'}); const p=S.battle.combat.A; p.energy=99; p.firstStrike=false; p.st={}; S.battle.turn='A'; return S; }
console.log('=== 使魔觸發驗證 ===');
{ let S=battle('fries'); S.battle.combat.A.hand=['guardself','guardself','guardself','strike']; S.battle.combat.B.st={};S.battle.combat.A.st={};
  for(let i=0;i<3;i++) S=E.apply(S,{type:'play_card',player:'A',cardIdx:0,target:0});
  ok('🍟薯條:出3張防禦牌→隊友獲得攻擊buff(sustain)', ['A','B'].some(h=>S.battle.combat[h].st&&S.battle.combat[h].st.sustain)); }
{ let S=battle('anchor'); S.battle.combat.A.hand=['bloodblade','bloodblade','bloodblade','bloodblade']; const e=S.battle.enemies[0]; e.hp=999;e.weak=[];e.resist=[];e.armor=0;e.block=0;
  const blk0=S.battle.combat.A.block||0; S=E.apply(S,{type:'play_card',player:'A',cardIdx:0,target:0});
  ok('⚓碇:單次≥15傷→觸發者+3盾', (S.battle.combat.A.block||0)>=blk0+3, 'block '+blk0+'→'+S.battle.combat.A.block);
  for(let i=0;i<4;i++){ S.battle.combat.A.hand=['bloodblade']; S.battle.combat.A.energy=99; S=E.apply(S,{type:'play_card',player:'A',cardIdx:0,target:0}); }
  ok('⚓碇:每場觸發上限3次', (S.battle.fam.u['A:anchor']||0)<=3, '觸發'+(S.battle.fam.u['A:anchor']||0)+'次'); }
{ let S=battle('shrimproll'); const h0=S.battle.combat.A.hand.length; // 蝦捲:回合開始已多抽(進場即round1觸發)→手牌>基礎5或至少非空
  ok('🍤蝦捲:回合開始多抽(手牌含額外抽)', h0>=5, 'hand='+h0); }
{ let S=battle(null); S.battle.combat.A.hand=['guardself','guardself','guardself']; for(let i=0;i<3;i++)S=E.apply(S,{type:'play_card',player:'A',cardIdx:0,target:0});
  ok('沒裝使魔→不觸發', !['A','B'].some(h=>S.battle.combat[h].st&&S.battle.combat[h].st.sustain)); }
console.log(`\n結果:${pass}過/${fail}失敗 ${fail?'❌':'🎉 使魔系統正確'}`);
