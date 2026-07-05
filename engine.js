/* 合作肉鴿 · headless 引擎（純函式 + seeded rng · 可 node 跑）
 * API: init(seed) / legalMoves(S,p) / apply(S,move) / whoseTurn(S) / engineStep(S) / isTerminal(S)
 * 確定性：所有隨機走 S.rng（LCG），同 seed+同 moves = 同結果。
 * 用法自測： node engine.js
 */
'use strict';

/* ---- seeded RNG (mutates S.rng) ---- */
function rnd(S){ S.rng = (S.rng*1103515245 + 12345) & 0x7fffffff; return S.rng / 0x7fffffff; }
function ri(S,n){ return Math.floor(rnd(S)*n); }
function shuffle(S,a){ for(let i=a.length-1;i>0;i--){ const j=ri(S,i+1); [a[i],a[j]]=[a[j],a[i]]; } return a; }

/* ---- 卡牌 ---- */
const C = {
  strike:{h:'A',n:'打擊',c:1,atk:6},
  heavy:{h:'A',n:'重擊',c:2,atk:12,fac:'爆發'},
  focus:{h:'A',n:'蓄力',c:1,focus:1,fac:'爆發'},
  barrage:{h:'A',n:'連射',c:1,atk:3,hits:2,fac:'連擊'},
  ember:{h:'A',n:'餘燼',c:1,burn:3,fac:'連擊'},
  guardself:{h:'A',n:'護體',c:1,selfblock:5},
  gift:{h:'A',n:'送能量→隊友',c:0,cross:'energy',bond:1},
  resonate:{h:'A',n:'共鳴斬',c:1,atk:6,bondcost:2,bonus:12,fac:'借力'},

  block:{h:'B',n:'格擋',c:1,selfblock:6},
  ironwall:{h:'B',n:'鐵壁',c:1,selfblock:12,fac:'銅牆'},
  shield:{h:'B',n:'護盾→隊友',c:1,cross:'block',v:8,bond:1},
  inspire:{h:'B',n:'鼓舞→隊友',c:1,cross:'empower',v:5,bond:1,fac:'增幅'},
  battlefield:{h:'B',n:'戰域',c:1,cross:'battlefield',v:3,bond:1,fac:'增幅'},
  heal:{h:'B',n:'治療→隊友',c:2,cross:'heal',v:9,bond:1,rev:true,fac:'慈光'},
  taunt:{h:'B',n:'嘲諷',c:1,taunt:true,bond:1,fac:'銅牆'},
  reflect:{h:'B',n:'反震',c:1,reflectatk:true,fac:'銅牆',d:'消耗自身全部格擋、對敵造成等量傷害'},
  resonance:{h:'B',n:'共振',c:0,bond:2,noblock:true,fac:'增幅'},
  // 新增卡(擴流派)
  thousand:{h:'A',n:'千刃',c:2,atk:2,hits:4,fac:'連擊'},
  cleave:{h:'A',n:'裂斬',c:2,atk:9,fac:'爆發'},
  rain:{h:'B',n:'甘霖',c:2,cross:'healboth',v:5,bond:1,fac:'慈光'},
  command:{h:'B',n:'傳令',c:1,cross:'battlefield',v:6,bond:1,fac:'增幅'},
  // ③效果詞條卡(帶制約)
  bloodblade:{h:'A',n:'血刃',c:1,atk:16,selfharm:4,fac:'爆發',d:'16傷、但自傷4(真代價、不可同回合免費治癒)'},
  insight:{h:'A',n:'洞察',c:0,draw:2,d:'抽2張(卡差/過濾)'},
  warcry:{h:'A',n:'戰意',c:1,sustain:2,sustainRounds:3,fac:'連擊',d:'3回合內攻擊+2(每回合衰減、本場清零)'},
  tempo:{h:'B',n:'節奏',c:1,extraDraw:1,drawRounds:3,fac:'增幅',d:'3回合內每回合開始多抽1(全來源+2硬上限)'},
  rally:{h:'B',n:'激勵',c:2,teamAtk:2,teamRounds:2,bond:1,fac:'增幅',d:'全隊攻擊+2(2回合)=團隊池(heroTeam)buff示範;加此卡零改戰鬥碼(sumAtk自動聚合)'},
  weaken:{h:'B',n:'弱化',c:1,weaken:6,weakenRounds:2,fac:'銅牆',d:'目標敵人攻擊-6(2回合、遞減;疊加上限-10、地板保留基礎25%=減傷非免疫)=多對多戰術:壓大威脅或清小怪的取捨'},
  // 共通牌池(中立·兩人都能抽·增加流派可能性、給凪輸出agency但不變第二個炎)
  quickjab:{h:'*',n:'速刺',c:1,atk:5,fac:'通用',d:'造成5傷(通用小chip/補刀、凪也能出)'},
  siphon:{h:'*',n:'汲取',c:1,draw:1,selfblock:3,fac:'通用',d:'抽1張+自己+3盾'},
  bondknot:{h:'*',n:'羈絆結',c:0,bond:1,fac:'通用',d:'+1羈絆(加速雙方combo)'},
  coverguard:{h:'*',n:'覆盾→隊友',c:1,cross:'block',v:5,fac:'通用',d:'隊友+5盾(互保)'},
  // 凪新輸出(專屬·防禦即輸出=為自己而非只服務炎)
  thornshield:{h:'B',n:'棘盾',c:1,blockdmg:true,fac:'銅牆',d:'造成等於自身當前格擋的傷害(無視護甲);打完格擋砍半=取捨打or守'},
  // 丸子(控制/狀態流·debuff疊加→計數爆發·放大隊友)
  tint:{h:'M',n:'上色',c:1,vuln:2,fac:'調色',d:'目標易傷+2(受傷+25%/層·上限6)=放大隊友輸出'},
  miasma:{h:'M',n:'瘴氣',c:1,burn:3,weaken:4,weakenRounds:2,fac:'調色',d:'目標灼傷3+攻-4(多重debuff)'},
  wither:{h:'M',n:'枯萎',c:2,weakenAll:6,fac:'調色',d:'全體敵攻-6(2回合·面狀控制)'},
  bloom:{h:'M',n:'綻放',c:2,debuffBurst:3,fac:'調色',d:'傷害=目標每層debuff(灼傷/弱化/易傷)×3=計數爆發'},
  // 金魚(速攻/連打tempo·出牌越多滾越大·吃雙方出牌數=co-op tempo)
  streamdraw:{h:'F',n:'川流',c:1,draw:2,fac:'速攻',d:'抽2張(牌差引擎·能量限制不濫抽)'},
  dartvolley:{h:'F',n:'飛鏢',c:1,atk:3,hits:3,fac:'速攻',d:'3傷×3(多段·可靠基礎傷)'},
  flurry:{h:'F',n:'亂舞',c:1,comboAtk:3,per:2,fac:'速攻',d:'傷害=3+本輪雙方已出牌數×2(越打越猛)'},
  crescendo:{h:'F',n:'漸強',c:2,comboAtk:4,per:3,fac:'速攻',d:'傷害=4+本輪雙方已出牌數×3(tempo爆發)'},
  // 召喚物共通卡(God Field 式亂數item感·主角後敵人前自動行動·持續數回合)
  sprite:{h:'*',n:'召喚·治療靈',c:1,summon:{kind:'heal',v:4,rounds:3},fac:'召喚',d:'召喚:每回合隨機補一位隊友4血、持續3回合'},
  dartsprite:{h:'*',n:'召喚·箭靈',c:1,summon:{kind:'attack',v:5,rounds:3},fac:'召喚',d:'召喚:每回合隨機射一個敵人5傷、持續3回合'},
  wisp:{h:'*',n:'召喚·亂靈',c:1,summon:{kind:'random',v:6,rounds:3},fac:'召喚',d:'召喚:每回合隨機(補隊友6血 或 打敵人6傷)、持續3回合(亂數)'},
  // 屬性元素卡(共通·打對弱點×1.5·打抗性×0.5)
  flamedart:{h:'*',n:'火矢',c:1,atk:6,elem:'fire',fac:'元素',d:'6火傷(打怕火的敵人×1.5)'},
  frostdart:{h:'*',n:'冰矢',c:1,atk:6,elem:'ice',fac:'元素',d:'6冰傷(打怕冰的敵人×1.5)'},
  zap:{h:'*',n:'電矢',c:1,atk:6,elem:'thunder',fac:'元素',d:'6雷傷(打怕雷的敵人×1.5·蟹類剋星)'},
  // AoE(補玩家端範圍傷缺口·多敵人戰答案)
  scatter:{h:'*',n:'散射',c:2,atk:4,aoe:true,fac:'範圍',d:'對全體敵人各4傷(通用AoE)'},
  tidalwave:{h:'F',n:'浪潮',c:2,atk:5,aoe:true,fac:'速攻',d:'對全體敵人各5傷(金魚範圍)'},
  plague:{h:'M',n:'疫',c:2,vulnAll:2,fac:'調色',d:'全體敵人易傷+2(丸子範圍放大·配AoE爆)'},
  // 營火/商人升級版(卡片編號強化·擴充升級路徑)
  strikeP:{h:'A',n:'打擊+',c:1,atk:9},
  heavyP:{h:'A',n:'重擊+',c:2,atk:16,fac:'爆發'},
  blockP:{h:'B',n:'格擋+',c:1,selfblock:9},
  shieldP:{h:'B',n:'護盾+→隊友',c:1,cross:'block',v:12,bond:1},
  barrageP:{h:'A',n:'連射+',c:1,atk:4,hits:3,fac:'連擊'},
  thousandP:{h:'A',n:'千刃+',c:2,atk:3,hits:4,fac:'連擊'},
  cleaveP:{h:'A',n:'裂斬+',c:2,atk:13,fac:'爆發'},
  bloodbladeP:{h:'A',n:'血刃+',c:1,atk:22,selfharm:4,fac:'爆發'},
  warcryP:{h:'A',n:'戰意+',c:1,sustain:3,sustainRounds:3,fac:'連擊'},
  weakenP:{h:'B',n:'弱化+',c:1,weaken:9,weakenRounds:2,fac:'銅牆'},
  inspireP:{h:'B',n:'鼓舞+→隊友',c:1,cross:'empower',v:8,bond:1,fac:'增幅'},
  ironwallP:{h:'B',n:'鐵壁+',c:1,selfblock:16,fac:'銅牆'},
  healP:{h:'B',n:'治療+→隊友',c:2,cross:'heal',v:13,bond:1,rev:true,fac:'慈光'},
  rallyP:{h:'B',n:'激勵+',c:2,teamAtk:3,teamRounds:2,bond:1,fac:'增幅'},
  commandP:{h:'B',n:'傳令+',c:1,cross:'battlefield',v:9,bond:1,fac:'增幅'},
  // 紀念卡(清困難房間獲得·獨特強卡、不進一般 draft)
  memento_a:{h:'A',n:'深海之證',c:1,atk:8,aoe:true,bond:2,fac:'紀念',d:'對全體敵人8傷+產2羈絆(紀念:征服困難房間)'},
  memento_b:{h:'B',n:'守護之潮',c:2,selfblock:10,cross:'block',v:10,bond:2,fac:'紀念',d:'自己+10盾、隊友+10盾、產2羈絆(紀念:征服困難房間)'},
};
const UPGRADE={strike:'strikeP',heavy:'heavyP',block:'blockP',shield:'shieldP',
  barrage:'barrageP',thousand:'thousandP',cleave:'cleaveP',bloodblade:'bloodbladeP',warcry:'warcryP',
  weaken:'weakenP',inspire:'inspireP',ironwall:'ironwallP',heal:'healP',rally:'rallyP',command:'commandP'};
/* 稀有度(獎勵/寶箱分級用·tag)：Common 基礎/常見、Rare 流派定義級、Epic 紀念卡。+版繼承 base 稀有度 */
const RARE=new Set(['heavy','cleave','thousand','bloodblade','warcry','weaken','ironwall','heal','battlefield','command','rain','reflect','resonance','resonate','tempo','taunt','ember','rally','insight']);
const EPIC=new Set(['memento_a','memento_b']);
function rarity(key){ const base=(key||'').replace(/P$/,''); return EPIC.has(base)?'E':(RARE.has(base)?'R':'C'); }
function chestTier(coef){ const k=coef||1; return k>=1.25?'金':(k>=1.1?'銀':'木'); } // 通關寶箱分級:地城係數越高、寶箱越好
const CHEST_RAR={'木':'C','銀':'R','金':'R'}; // 寶箱對應可抽稀有度(金=稀有+額外遺物)
/* 角色 roster(開局4選2·slot A=第一位/B=第二位;POOL 由 init 依選角填入) */
const HERO_DEFS = {
  yugan: {name:'魚乾', role:'attacker', hp:42, passive:'firstStrike', pdesc:'首擊爆發:每場戰鬥首次攻擊+3傷', start:['strike','strike','guardself','gift','heavy','focus','barrage'],
         pool:['heavy','focus','barrage','ember','resonate','guardself','thousand','cleave','bloodblade','insight','warcry']},
  shuimu:{name:'水母', role:'guardian', hp:56, passive:'startBlock', pdesc:'潮護:每場戰鬥開場自帶5格擋', start:['block','block','shield','inspire','taunt','heal','ironwall'],
         pool:['ironwall','shield','inspire','battlefield','heal','taunt','resonance','rain','command','reflect','tempo','insight','weaken','rally','thornshield']},
  wanzi:{name:'丸子', role:'control', hp:48, passive:'startDraw', pdesc:'洞悉:每場戰鬥開場多抽1張(utility·不加傷)', start:['tint','tint','miasma','weaken','quickjab','guardself','bloom'],
         pool:['tint','miasma','wither','bloom','weaken','ember','quickjab','coverguard','siphon','insight','plague']},
  jin:  {name:'金魚', role:'tempo', hp:46, maxE:4, passive:'startDraw', pdesc:'手感:每場戰鬥開場多抽1張(不加能量·避免首回合爆)', start:['dartvolley','dartvolley','streamdraw','flurry','quickjab','barrage','crescendo'],
         pool:['dartvolley','streamdraw','flurry','crescendo','barrage','tempo','quickjab','siphon','insight','tidalwave']}, // maxE4:tempo 需多打牌
};
const POOL = { A:[], B:[] }; // init 依選角填入(POOL.A=slotA英雄池、POOL.B=slotB英雄池)
const POOL_COMMON = ['quickjab','siphon','bondknot','coverguard','sprite','dartsprite','wisp','scatter','flamedart','frostdart','zap']; // 共通池:中立+召喚+AoE+元素卡(兩人都能抽)
const BOND_SKILLS = { burst:{n:'共鳴爆發',cost:6}, wall:{n:'絕對防線',cost:5} };
const ENEMIES = {
  // 難度調校(7/5):敵人打更痛+更肉、逼凪取捨、製造瀕死。splash/bleed 不可完全格擋防禦(chip壓力)
  slime:{n:'史萊姆娘',hp:66,weak:['fire'],ins:[{t:'smash',v:17,tgt:'A'},{t:'splash',v:8},{t:'smash',v:17,tgt:'B'}]}, // 怕火
  crab:{n:'硬殼蟹娘',hp:80,armor:7,resist:['phys'],weak:['thunder'],ins:[{t:'pinch',v:16,tgt:'A'},{t:'pinch',v:16,tgt:'A'},{t:'sweep',v:9}]}, // 護甲+抗物理·怕雷(用電矢/開窗破)
  jelly:{n:'水母',hp:34,grp:'swarm',weak:['thunder'],ins:[{t:'smash',v:11,tgt:'A'},{t:'sweep',v:6}]}, // 分裂群·怕雷(電矢AoE剋)
  priest:{n:'珊瑚祭司',hp:84,weak:['fire'],ins:[{t:'smash',v:15,tgt:'A'},{t:'heal_self',v:14}]}, // 怕火(燃燒也剋治療)
  eel:{n:'電鰻姬',hp:74,resist:['thunder'],weak:['ice'],ins:[{t:'shock'},{t:'smash',v:14,tgt:'B'}]}, // 電鰻抗雷·怕冰
  crabgen:{n:'深淵蟹將',hp:96,armor:9,resist:['phys'],weak:['thunder'],ins:[{t:'pinch',v:17,tgt:'A'},{t:'sweep',v:11},{t:'pinch',v:17,tgt:'B'}]}, // 抗物理·怕雷
  murk:{n:'深海魚人',hp:110,weak:['ice'],ins:[{t:'smash',v:24,tgt:'A'},{t:'guard'},{t:'smash',v:24,tgt:'B'},{t:'splash',v:11}]}, // 怕冰
  boss:{n:'深海女王莎菈',hp:168,boss:true,resist:['fire'],weak:['ice'],ins:[{t:'summon',minion:'shade'},{t:'smash',v:26,tgt:'A'},{t:'bleed',v:7},{t:'smash',v:26,tgt:'B'}]}, // 抗火·怕冰·召喚深海殘影
  // 敵方召喚小兵 + 強怪(meta兜底·後段用)
  shade:{n:'深海殘影',hp:22,ins:[{t:'smash',v:9,tgt:'A'},{t:'smash',v:9,tgt:'B'}]}, // boss召喚的小兵·脆但煩(逼AoE/選目標)
  leviath:{n:'古潮巨獸',hp:200,boss:true,resist:['ice','phys'],weak:['fire'],ins:[{t:'summon',minion:'shade'},{t:'smash',v:30,tgt:'A'},{t:'sweep',v:16},{t:'smash',v:30,tgt:'B'},{t:'guard'}]}, // 強boss:抗冰抗物理·怕火·召喚+橫掃+高smash
  abyssking:{n:'深淵古神',hp:240,boss:true,resist:['fire','ice'],weak:['thunder'],ins:[{t:'summon',minion:'shade'},{t:'smash',v:28,tgt:'A'},{t:'bleed',v:9},{t:'sweep',v:16},{t:'smash',v:28,tgt:'B'},{t:'guard'}]}, // 第二章最終boss:抗火抗冰·怕雷·召喚+流血+橫掃+高smash
};
const PIERCE={splash:0.5, bleed:1, sweep:0.5}; // 這些攻擊穿透部分/全部格擋(不可完全龜)
const WEAKEN_CAP=10; // 弱化疊加上限:單一敵人最多-10攻(防無限疊加/負防禦爆表、敵人不會被龜到全無害)
const WEAKEN_FLOOR=0.25; // 弱化傷害地板:弱化後攻擊至少保留基礎25%、大怪打擊永不被完全歸零=弱化是減傷不是免疫
const wkd=(base,wk)=>Math.max(Math.ceil((base||0)*WEAKEN_FLOOR), (base||0)-(wk||0)); // 套弱化(含地板)

/* ---- 統一 Status 系統（低耦合·registry 驅動；加新 buff＝只加一筆、戰鬥碼不動） ----
 * 每單位一個 u.st = { key:{v,rounds} }。scope 四池:hero/heroTeam/enemy/enemyTeam。
 * decay: round(每回合遞減歸零清除) / reset(每回合開始清) / use(用掉即清) / perm(持久) / tickHp(每回合造成傷害+衰減)。
 * hooks: myAtk(v)=英雄出手攻擊加成 / out(base,v)=敵出手攻擊轉換 / inc(dmg,v,u)=受擊減傷。
 * 讀值只用 getV;寫值只用 applyStatus/removeStatus;回合邊界 tickStatuses。value 負=削減(有地板、不會成負)。 */
const STATUS = {
  weaken:      { scope:'enemy', decay:'round', cap:WEAKEN_CAP, defRounds:2, out:(base,v)=>wkd(base,v) }, // 敵出手攻擊-v(含地板)
  burn:        { scope:'enemy', decay:'tickHp', dot:3 },                                                 // 每回合-v、v 再-3衰減(特殊在 engineStep)
  empower:     { scope:'hero',  decay:'use',   myAtk:(v)=>v },     // 鼓舞:下次攻擊+v、用掉
  focus:       { scope:'hero',  decay:'use',   myAtk:(v)=>5*v },   // 蓄力:下次攻擊+5/層、用掉
  sustain:     { scope:'hero',  decay:'round', defRounds:3, myAtk:(v)=>v }, // 戰意:持續+v、遞減
  battlefield: { scope:'hero',  decay:'reset', myAtk:(v)=>v },     // 戰域:本回合+v、回合開始清
  extraDraw:   { scope:'hero',  decay:'round', defRounds:3 },      // 節奏:回合開始多抽(效果在 startRound、+2硬上限)
  teamAtk:     { scope:'heroTeam', decay:'round', defRounds:2, myAtk:(v)=>v }, // 團隊池示範:全隊攻擊+v、獨立tick(每人各一份)
  rage:        { scope:'enemyTeam', decay:'perm', out:(base,v)=>base+v }, // 困難房間:敵全體出手攻擊+v(enemyTeam池、out hook相加=示範同系統做房間修正詞)
  vulnerable:  { scope:'enemy', decay:'round', defRounds:2, cap:5, inc:(dmg,v)=>Math.round(dmg*(1+0.20*v)) }, // 丸子:易傷、目標受傷+20%/層(上限5=+100%)、inc hook放大
};
function getV(u,key){ return (u&&u.st&&u.st[key])?u.st[key].v:0; }
function applyStatus(u,key,val,rounds){ if(!u.st)u.st={}; const def=STATUS[key]||{};
  const cur=u.st[key]||{v:0,rounds:0}; let nv=cur.v+val;
  if(def.cap!=null)nv=Math.min(def.cap,nv); nv=Math.max(0,nv); // dispel 地板:不成負
  if(nv<=0){ delete u.st[key]; return; }
  const r = rounds!=null ? Math.max(cur.rounds||0,rounds) : (cur.rounds || def.defRounds || 0);
  u.st[key]={v:nv, rounds:r}; }
function removeStatus(u,key){ if(u&&u.st) delete u.st[key]; }
function tickStatuses(u){ if(!u||!u.st)return; for(const key of Object.keys(u.st)){ const def=STATUS[key]||{}, s=u.st[key];
  if(def.decay==='reset'){ delete u.st[key]; }
  else if(def.decay==='round'){ if(s.rounds>0){ s.rounds--; if(s.rounds<=0) delete u.st[key]; } } } } // use/perm/tickHp 由使用端處理
function sumAtk(u){ let b=0; if(u&&u.st){ for(const key in u.st){ const h=STATUS[key]; if(h&&h.myAtk) b+=h.myAtk(u.st[key].v); } } return b; } // 英雄出手加成合計
function applyOut(u,base){ let v=base; if(u&&u.st){ for(const key in u.st){ const h=STATUS[key]; if(h&&h.out) v=h.out(v,u.st[key].v); } } return Math.max(0,Math.round(v)); } // 敵出手經所有 out hook
function applyInc(u,dmg){ let v=dmg; if(u&&u.st){ for(const key in u.st){ const h=STATUS[key]; if(h&&h.inc) v=h.inc(v,u.st[key].v,u); } } return Math.max(0,v); } // 受擊經所有 inc hook
function applyScoped(S,side,key,val,rounds){ const def=STATUS[key]||{}; // side:'hero'|'enemy';team scope 對該陣營每個成員各寫一份(各自獨立 tick)
  const team = (def.scope==='heroTeam'||def.scope==='enemyTeam');
  const units = side==='hero' ? (team?['A','B']:[]).map(h=>S.battle.combat[h]) : (team?aliveEnemies(S):[]);
  if(team) units.forEach(u=>applyStatus(u,key,val,rounds));
}
/* ---- 困難房間·房間修正詞（掛在 status 系統上;加房間＝註冊一筆、戰鬥碼零改） ----
 * apply(S) 進場施一組 battle-scoped status;reward 給更好獎勵。分歧路線做好後這些房間變玩家可選(高風險高報酬)。 */
const ROOM_MODS = {
  frenzy: { name:'狂暴海域', d:'敵全體攻擊+4', apply:(S)=>applyScoped(S,'enemy','rage',4,Infinity), reward:'relic' },
  // 未來房間例:'toxic'(每回合流失)、'silence'(禁某流派)…都只在這註冊一筆
};
const MAP = [ // 兩章·第一章(淺海)→第二章(深淵)、越後越硬。fork=可選路;隱藏boss=條件解鎖
  // 第一章·淺海
  {t:'battle',e:'slime'},{t:'battle',e:'crab'},{t:'chest'},{t:'battle',e:'eel'},{t:'campfire'},{t:'relic'},
  {t:'battle',e:'priest'},{t:'battle',e:'murk'},{t:'campfire'},
  {t:'fork', label:'岔路·兩人一起選一條', choices:[
    {desc:'🛡️安全路:普通戰×1(分裂水母群)', nodes:[{t:'battle',e:['jelly','jelly']}]},
    {desc:'🔥困難路:狂暴海域(敵全體攻擊+4) + 額外遺物、給較多探索值', nodes:[{t:'battle',e:'crabgen',mod:'frenzy'}]},
    {desc:'❓神秘漩渦·隱藏BOSS 古潮巨獸(需探索值≥4·極硬·大獎)', cond:s=>((s.run.explore||0)>=4), nodes:[{t:'battle',e:'leviath',hidden:true},{t:'relic'}]} ], // 隱藏boss:探索值夠才浮現
  },
  {t:'shop'},{t:'campfire'},{t:'boss',e:'boss',final:true} ]; // 匯流後→商人→休息→最終boss 莎菈
  // 第二章(ch2)+最終boss深淵古神 已設計、但需回復節奏/boss防stall/revive 才 shippable(見 ROADMAP)、暫維持單章

/* ---- 初始化 ---- */
function assignHeroes(S,picks){ // 依選角(2個hero-id)指派 slot A/B + 填 POOL
  const da=HERO_DEFS[picks[0]], db=HERO_DEFS[picks[1]];
  POOL.A=da.pool.slice(); POOL.B=db.pool.slice(); S.picks=picks.slice();
  S.heroes={ A:{id:picks[0],name:da.name,hp:da.hp,max:da.hp,deck:da.start.slice(),role:da.role},
             B:{id:picks[1],name:db.name,hp:db.hp,max:db.hp,deck:db.start.slice(),role:db.role} };
}
function baseRun(seed,coef){ return { seed, rng:(seed||1)>>>0, log:[],
  run:{node:0, gold:0, bond:0, explore:0, coef:(coef||1), shopCounter:3, relics:[], map:MAP.map(x=>Object.assign({},x))}, battle:null, offer:null }; }
function init(seed,coef,picks,meta){ // 直接開局(headless/給定選角);預設炎+凪;meta=全局成長
  const S=baseRun(seed,coef); S.phase='map'; assignHeroes(S,(picks&&picks.length===2)?picks:['yugan','shuimu']); if(meta)applyMeta(S,meta); return S;
}
function initSelect(seed,coef,meta){ // 互動開局:先進角色選擇(4選2)
  const S=baseRun(seed,coef); S.phase='select'; S.selPicks=[]; S.heroes=null; S._meta=meta||null; return S;
}
const ROSTER=['yugan','shuimu','wanzi','jin']; // 可選角色(4隻bot persona)
/* 全局成長(meta·跨局)：meta={shards, ups:{vigor,might,fortune}}。引擎套用+結算星屑;存檔跨局由外層(UI localStorage)管 */
const META_UPS = {
  vigor:  {name:'體魄', max:5, cost:l=>3+l*2, d:'+6 maxHP/級(兩英雄)'},
  might:  {name:'銳氣', max:5, cost:l=>4+l*2, d:'所有攻擊+1傷/級'},
  fortune:{name:'財運', max:3, cost:l=>4+l*3, d:'開局+3探索值/級;2級起附贈遺物'},
};
function metaBuy(meta,id){ const u=META_UPS[id]; if(!u)return meta; const lv=(meta.ups[id]||0); if(lv>=u.max)return meta; const c=u.cost(lv); if((meta.shards||0)<c)return meta; meta.shards-=c; meta.ups[id]=lv+1; return meta; } // 花星屑升級(外層跨局用)
function applyMeta(S,meta){ if(!meta||!meta.ups)return; const u=meta.ups; S.run.dmgUp=(u.might||0); // 銳氣:攻擊+傷(在攻擊加成讀)
  const hpUp=(u.vigor||0)*6; ['A','B'].forEach(h=>{ if(hpUp){S.heroes[h].hp+=hpUp;S.heroes[h].max+=hpUp;} });
  if(u.fortune){ S.run.explore=(S.run.explore||0)+u.fortune*3; if(u.fortune>=2){ const all=Object.keys(RELICS_K).filter(r=>!S.run.relics.includes(r)); shuffle(S,all); if(all.length)S.run.relics.push(all[0]); } }
}
function ev(S,t){ S.log.push(t); }

/* ---- 戰鬥開始 ---- */
function mkEnemy(id,coef){ const e=ENEMIES[id]; const k=1+(((coef||1)-1)*0.5); const hp=Math.round(e.hp*k); // 阻尼:hp+攻同時放大是複利、用半速避免陡到不能玩(coef1.2→+10%、1.5→+25%、2.0→+50%)
  const ins=e.ins.map(it=> it.v!=null ? Object.assign({},it,{v:Math.round(it.v*k)}) : it); // 地城係數:敵HP/攻擊×阻尼後係數
  return {id,name:e.n,hp,max:hp,block:0,armor:e.armor||0,exposeCount:0,grp:e.grp||null,ins,ii:0,boss:!!e.boss,tauntT:null,enraged:0,weak:e.weak||null,resist:e.resist||null,st:{}}; } // weak/resist=屬性弱點抗性
function startBattle(S,eid){
  const ids = Array.isArray(eid)?eid:[eid];
  const mkc=(h)=>({hand:[],draw:shuffle(S,S.heroes[h].deck.slice()),disc:[],energy:0,maxE:(HERO_DEFS[S.heroes[h].id]&&HERO_DEFS[S.heroes[h].id].maxE)||3,block:0,thorns:0,downed:false,st:{}}); // maxE 依角色(金魚tempo用4)
  S.battle={ enemies: ids.map(id=>mkEnemy(id,S.run.coef)),
             turn:'A', round:1, atk:0, cardsThisRound:0, passStreak:0, combat:{A:mkc('A'),B:mkc('B')}, feed:[], immune:{A:false,B:false}, dbl:false, summons:[] };
  S.phase='battle';
  const nd=S.run.map[S.run.node]; if(nd && nd.mod && ROOM_MODS[nd.mod]){ ROOM_MODS[nd.mod].apply(S); S.battle.mod=nd.mod; S.battle.feed.unshift('⚠️困難房間·'+ROOM_MODS[nd.mod].name+':'+ROOM_MODS[nd.mod].d); } // 房間修正詞=battle-scoped status
  startRound(S,true);
}
function aliveEnemies(S){ return S.battle.enemies.filter(e=>e.hp>0); }
function lowestAlive(S){ const a=aliveEnemies(S); return a.length? a.reduce((m,e)=>e.hp<m.hp?e:m):null; }
function allDead(S){ return aliveEnemies(S).length===0; }
function lowestHero(S){ const hs=['A','B'].filter(h=>!S.battle.combat[h].downed); if(!hs.length)return null; return hs.reduce((m,h)=>S.heroes[h].hp<S.heroes[m].hp?h:m); }
function onEnemyDeath(S,te){ const B=S.battle; const others=aliveEnemies(S); if(te.grp && others.some(o=>o.grp===te.grp)){ others.forEach(o=>{ if(o.grp===te.grp){o.enraged=(o.enraged||0)+1;} }); B.feed.unshift('分裂水母死了一隻、另一隻暴怒(+傷)!'); }
  if(others.length>0 && B._actor && B.combat[B._actor] && !B.combat[B._actor].downed){ const cs=B.combat[B._actor]; cs.energy+=1; draw(S,cs,1); B.feed.unshift(`${S.heroes[B._actor].name}擊殺${te.name}·+1能量+抽1(集火獎勵)`); } } // 擊殺獎勵:只在還有其他敵人時給(=集火順序策略;殺最後一隻=戰鬥結束不給)
function draw(S,cs,n){ for(let k=0;k<n;k++){ if(!cs.draw.length){cs.draw=shuffle(S,cs.disc);cs.disc=[];} if(cs.draw.length)cs.hand.push(cs.draw.pop()); } }
function startRound(S,first){
  const B=S.battle;
  for(const h of ['A','B']){ const cs=B.combat[h]; if(cs.downed)continue;
    const pas=(HERO_DEFS[S.heroes[h].id]||{}).passive;
    cs.energy=cs.maxE + (first&&S.run.relics.includes('watch')?1:0) + (first&&pas==='firstRoundEnergy'?1:0); // 金魚熱身:首回合+1能量
    cs.block=0; cs.guardFrom=0;
    if(first&&pas==='startBlock') cs.block+=5;              // 水母潮護:開場5盾
    if(cs.hand.length<5) draw(S,cs,5-cs.hand.length);
    if(first&&pas==='startDraw') draw(S,cs,1);              // 丸子洞悉:開場多抽1
    if(first&&pas==='firstStrike') cs.firstStrike=true;      // 魚乾首擊爆發:標記
    const ex=Math.min(getV(cs,'extraDraw'),2); if(ex>0) draw(S,cs,ex); // 回合開始多抽、+2硬上限(讀取在 tick 前)
    tickStatuses(cs); } // battlefield(reset)清、sustain/extraDraw(round)遞減、及未來所有英雄 status
  B.turn='A'; B.atk=0; B.cardsThisRound=0; B.dmgThisRound=0; B.passStreak=0;
}

/* ---- 合法動作 ---- */
function whoseTurn(S){
  if(S.phase==='select'||S.phase==='map'||S.phase==='campfire'||S.phase==='relic'||S.phase==='draft'||S.phase==='mapfork'||S.phase==='shop') return 'human'; // 選單類、任一方(或裁判前進)
  if(S.phase==='battle'){ if((S.battle.passStreak||0)>=2) return 'engine'; return S.battle.turn; }
  return 'engine';
}
function legalMoves(S,player){
  const M=[];
  if(S.phase==='select'){ ROSTER.filter(h=>!S.selPicks.includes(h)).forEach(h=>M.push({type:'select_hero',hero:h})); return M; } // 4選2
  if(S.phase==='map'){ M.push({type:'map_advance'}); return M; }
  if(S.phase==='mapfork'){ S.offer.choices.forEach(c=>M.push({type:'map_choice',pick:c.i})); return M; }
  if(S.phase==='campfire'){ M.push({type:'campfire',choice:'rest'},{type:'campfire',choice:'remove'},{type:'campfire',choice:'upgrade'},{type:'campfire',choice:'leave'});
    if((S.run.explore||0)>=3 && Object.keys(RELICS_K).some(r=>!S.run.relics.includes(r))) M.push({type:'campfire',choice:'explore'}); // 探索值夠+有遺物可拿→premium探險
    return M; }
  if(S.phase==='relic'){ S.offer.picks.forEach(r=>M.push({type:'relic_pick',pick:r})); return M; }
  if(S.phase==='shop'){ const ex=S.run.explore||0, c=shopCost(S); // 移除+升級共用漲價counter;稀有卡另計
    if(ex>=c && (hasRemovable(S,'A')||hasRemovable(S,'B'))) M.push({type:'shop',act:'remove'});
    if(ex>=c && (S.heroes.A.deck.some(k=>UPGRADE[k])||S.heroes.B.deck.some(k=>UPGRADE[k]))) M.push({type:'shop',act:'upgrade'});
    if(ex>=shopCardCost(S)) M.push({type:'shop',act:'card'});
    M.push({type:'shop',act:'leave'}); return M; }
  if(S.phase==='draft'){ const dh=S.offer.hero; S.offer.cards.forEach(c=>M.push({type:'draft_pick',player:dh,pick:c})); M.push({type:'draft_pick',player:dh,pick:'skip'}); if(hasRemovable(S,dh)) M.push({type:'draft_pick',player:dh,pick:'remove'}); return M; } // 獎勵可改成移除一張=牌組精簡主動選擇
  if(S.phase==='battle'){
    const t=S.battle.turn; if(t!==player) return M;
    if(S.battle.combat[player].downed){ M.push({type:'end_turn',player}); return M; } // 倒下只能pass
    const cs=S.battle.combat[player];
    if((S.battle.cardsThisRound||0)<40){ // 防迴圈保證:單回合出牌破40(如0費抽牌卡循環)就只剩end_turn、強制回合推進(配合round>15 decay保證終止);40遠高於任何合理連打
      cs.hand.forEach((k,i)=>{ const c=C[k]; if(cs.energy>=c.c && !(c.bondcost&&S.run.bond<c.bondcost)) M.push({type:'play_card',player,cardIdx:i}); });
      Object.keys(BOND_SKILLS).forEach(sk=>{ if(S.run.bond>=BOND_SKILLS[sk].cost) M.push({type:'use_bond',player,skill:sk}); });
    }
    M.push({type:'end_turn',player});
  }
  return M;
}

/* ---- 套用 move ---- */
function gainBond(S,v,h,why){ S.run.bond=Math.min(10,S.run.bond+v); if(S.battle) S.battle.feed.unshift(`${S.heroes[h]?S.heroes[h].name:h} ${why} +${v}羈絆`); if(S.run.bond>=10&&S.run.relics.includes('bondr')){S.heroes.A.hp=Math.min(S.heroes.A.max,S.heroes.A.hp+3);S.heroes.B.hp=Math.min(S.heroes.B.max,S.heroes.B.hp+3);} }
function hitEnemy(S,d,te,pierceArmor,elem){ if(!te||te.hp<=0) return 0; let dmg=d;
  const blk=Math.min(te.block,dmg);te.block-=blk;dmg-=blk;
  if(!pierceArmor && te.armor>0 && (te.exposeCount||0)<=0){ dmg=Math.max(1,dmg-te.armor); } // 護甲:未破綻時每擊減傷(min1);B嘲諷開破綻;凪反震/棘盾無視護甲
  if(elem){ if(te.weak&&te.weak.includes(elem)) dmg=Math.round(dmg*1.5); else if(te.resist&&te.resist.includes(elem)) dmg=Math.round(dmg*0.5); } // 屬性:打弱點×1.5·打抗性×0.5
  dmg=applyInc(te,dmg); // 易傷等 inc hook:放大受傷(丸子的易傷在此生效)
  te.hp=Math.max(0,te.hp-dmg); S.battle.atk++; S.battle.dmgThisRound=(S.battle.dmgThisRound||0)+dmg;
  if(te.hp<=0) onEnemyDeath(S,te); return dmg; }
function apply(S,m){
  if(m.type==='select_hero'){ if(S.selPicks.length<2 && !S.selPicks.includes(m.hero)) S.selPicks.push(m.hero); if(S.selPicks.length>=2){ assignHeroes(S,S.selPicks); if(S._meta)applyMeta(S,S._meta); S.phase='map'; } return S; } // 選滿2人→套meta→開始
  if(m.type==='map_advance'){ enterNode(S); return S; }
  if(m.type==='map_choice'){ const fork=S.run.map[S.run.node]; const chosen=fork&&fork.choices[m.pick];
    if(chosen){ S.run.map.splice(S.run.node+1,0,...chosen.nodes.map(x=>Object.assign({},x))); } // 選中路徑接在岔路後、走完自然匯流回主線
    S.offer=null; advance(S); return S; }
  if(m.type==='campfire'){
    if(m.choice==='rest'){S.heroes.A.hp=Math.min(S.heroes.A.max,S.heroes.A.hp+20);S.heroes.B.hp=Math.min(S.heroes.B.max,S.heroes.B.hp+20); S.run.explore=(S.run.explore||0)+1;} // 休息也探索一點
    else if(m.choice==='remove'){ removeBasic(S); }
    else if(m.choice==='upgrade'){ upgradeCard(S); }
    else if(m.choice==='explore'){ S.run.explore=(S.run.explore||0)-3; const all=Object.keys(RELICS_K).filter(r=>!S.run.relics.includes(r)); if(all.length){ shuffle(S,all); S.run.relics.push(all[0]); } } // 花3探索值換一個遺物(premium)
    advance(S); return S; }
  if(m.type==='relic_pick'){ if(m.pick!=='skip')S.run.relics.push(m.pick); S.offer=null; advance(S); return S; }
  if(m.type==='shop'){ // 學偶式:移除+升級共用漲價counter(每買+1)、稀有卡另計;買完留店可續買、leave才前進
    if(m.act==='leave'){ S.offer=null; advance(S); return S; }
    const c=shopCost(S), ex=S.run.explore||0;
    if(m.act==='remove' && ex>=c){ if(removeBasicHero(S,'A')||removeBasicHero(S,'B')){ S.run.explore-=c; S.run.shopCounter+=1; } }
    else if(m.act==='upgrade' && ex>=c){ const before=S.heroes.A.deck.concat(S.heroes.B.deck).join(','); upgradeCard(S); if(S.heroes.A.deck.concat(S.heroes.B.deck).join(',')!==before){ S.run.explore-=c; S.run.shopCounter+=1; } }
    else if(m.act==='card' && ex>=shopCardCost(S)){ const rares=POOL['A'].filter(k=>rarity(k)==='R'); const pick=(rares.length?shuffle(S,rares.slice()):shuffle(S,POOL['A'].slice()))[0]; S.heroes.A.deck.push(pick); S.run.explore-=shopCardCost(S); } // 探索值買的是稀有卡(rarity R)
    return S; }
  if(m.type==='draft_pick'){ const hero=S.offer.hero;
    if(m.pick==='remove'){ removeBasicHero(S,hero); } else if(m.pick!=='skip'){ S.heroes[hero].deck.push(m.pick); }
    const q=S.offer.queue||[]; const idx=q.indexOf(hero);
    if(idx>=0 && idx+1<q.length){ const nh=q[idx+1]; S.offer={kind:'draft',queue:q,hero:nh,cards:draftOffer(S,nh)}; return S; } // 換下一位英雄各自選獎勵(2專屬+1共通)
    S.offer=null;
    const nd=S.run.map[S.run.node]; // 困難房間額外獎勵:雙選完再送一個遺物
    if(nd && nd.mod && ROOM_MODS[nd.mod] && ROOM_MODS[nd.mod].reward==='relic'){ const all=Object.keys(RELICS_K).filter(r=>!S.run.relics.includes(r)); if(all.length){ shuffle(S,all); S.offer={kind:'relic',picks:all.slice(0,2)}; S.phase='relic'; return S; } }
    advance(S); return S; }
  if(S.phase!=='battle') return S;
  const B=S.battle, p=B.combat[m.player], foe=B.combat[m.player==='A'?'B':'A'];
  const target = (m.target!=null && B.enemies[m.target] && B.enemies[m.target].hp>0) ? B.enemies[m.target] : lowestAlive(S);
  if(m.type==='use_bond'){ const s=BOND_SKILLS[m.skill]; if(S.run.bond<s.cost)return S; S.run.bond-=s.cost; B.passStreak=0;
    if(m.skill==='burst'){ applyStatus(B.combat.A,'empower',20); B.combat.B.block+=10; B.feed.unshift('羈絆技·共鳴爆發! 炎+20 凪+10盾'); }
    if(m.skill==='wall'){ B.immune.A=true;B.immune.B=true;B.dbl=true; B.feed.unshift('羈絆技·絕對防線!'); }
    return S; }
  if(m.type==='end_turn'){ endTurn(S); return S; }
  if(m.type==='play_card'){
    const k=p.hand[m.cardIdx], c=C[k]; if(!c||p.energy<c.c) return S; if(c.bondcost&&S.run.bond<c.bondcost) return S;
    B._actor=m.player; // 擊殺獎勵歸屬:這張牌造成的擊殺算此人
    p.energy-=c.c; if(c.bondcost)S.run.bond-=c.bondcost;
    if(c.atk!=null){ let bonus=(c.bonus||0)+sumAtk(p)+(S.run.dmgUp||0); if(p.firstStrike){bonus+=3;p.firstStrike=false;B.feed.unshift(`${S.heroes[m.player].name}首擊爆發+3`);} let hits=c.hits||1; // 加成＝Σ myAtk hook + 魚乾首擊被動 + 全局銳氣dmgUp
      for(let i=0;i<hits;i++){ const dmg=c.atk+(i===0?bonus:0); if(c.aoe){ aliveEnemies(S).forEach(te=>hitEnemy(S,dmg,te,false,c.elem)); } else { hitEnemy(S,dmg,target,false,c.elem); } } // 帶元素
      const emp=getV(p,'empower'); if(emp){B.feed.unshift(`${S.heroes[m.player].name}攻擊+${emp}(隊友鼓舞)`);} removeStatus(p,'empower'); removeStatus(p,'focus'); } // use型:攻擊後消耗
    if(c.focus) applyStatus(p,'focus',c.focus);
    if(c.selfblock!=null && !p.noblock) p.block+=c.selfblock;
    if(c.burn && target) applyStatus(target,'burn',c.burn);
    if(c.weaken && target){ applyStatus(target,'weaken',c.weaken,c.weakenRounds||2); B.feed.unshift(`${target.name} 被弱化 -${getV(target,'weaken')}攻(上限${WEAKEN_CAP}、${target.st.weaken.rounds}回合)`); }
    if(c.vuln && target){ applyStatus(target,'vulnerable',c.vuln); B.feed.unshift(`${target.name} 易傷+${c.vuln}(受傷放大)`); } // 丸子:上色
    if(c.weakenAll){ aliveEnemies(S).forEach(te=>applyStatus(te,'weaken',c.weakenAll,2)); B.feed.unshift(`全體敵弱化 -${c.weakenAll}攻`); } // 丸子:枯萎(面狀)
    if(c.vulnAll){ aliveEnemies(S).forEach(te=>applyStatus(te,'vulnerable',c.vulnAll)); B.feed.unshift(`全體敵易傷+${c.vulnAll}`); } // 丸子:疫(面狀易傷)
    if(c.debuffBurst && target){ const st=getV(target,'weaken')+getV(target,'burn')+getV(target,'vulnerable'); const d=st*c.debuffBurst; if(d>0){ hitEnemy(S,d,target); B.feed.unshift(`${S.heroes[m.player].name}綻放:${st}層debuff→${d}傷`);} if(allDead(S)){winBattle(S);return S;} } // 丸子:計數爆發
    if(c.comboAtk!=null){ const d=c.comboAtk+(B.cardsThisRound||0)*(c.per||2)+sumAtk(p)+(S.run.dmgUp||0); hitEnemy(S,d,target); removeStatus(p,'empower');removeStatus(p,'focus'); B.feed.unshift(`${S.heroes[m.player].name}連打:本輪${B.cardsThisRound||0}張→${d}傷`); if(allDead(S)){winBattle(S);return S;} } // 金魚:傷害隨本輪雙方出牌數scale
    if(c.summon){ B.summons.push(Object.assign({owner:m.player},c.summon)); B.feed.unshift(`${S.heroes[m.player].name}召喚了${c.n.replace('召喚·','')}(${c.summon.rounds}回合)`); } // 召喚物:進場、主角後敵人前自動行動
    if(c.reflectatk){ const d=p.block||0; p.block=0; if(d>0){ hitEnemy(S,d,target,true); B.feed.unshift(`${S.heroes[m.player].name}反震:消耗${d}格擋→${d}傷(無視護甲)`);} if(allDead(S)){winBattle(S);return S;} } // 反震穿甲:主動輸出不再被護甲廢掉
    if(c.blockdmg){ const d=p.block||0; if(d>0){ hitEnemy(S,d,target,true); p.block=Math.floor(p.block/2); B.feed.unshift(`${S.heroes[m.player].name}棘盾:格擋${d}→${d}傷(無視護甲、盾砍半剩${p.block})`);} if(allDead(S)){winBattle(S);return S;} } // 棘盾:傷害=當前格擋、打完盾砍半(取捨:打or守)
    if(c.taunt){ aliveEnemies(S).forEach(te=>{ te.tauntT=m.player; if(te.armor>0) te.exposeCount=2; }); if(aliveEnemies(S).some(te=>te.armor>0)) B.feed.unshift('嘲諷把護甲敵人引出破綻!下輪隊友可無視護甲'); }
    if(c.noblock){ p.noblock=true; }
    if(c.selfharm){ const hh=S.heroes[m.player]; hh.hp=Math.max(0,hh.hp-c.selfharm); if(hh.hp<=0){p.downed=true;B.feed.unshift(`${hh.name}自傷過度倒下`);} } // 自傷=真代價、不可同回合免費治癒
    if(c.draw) draw(S,p,c.draw); // scry-lite:卡差(完整look-choose在UI層)
    if(c.sustain){ applyStatus(p,'sustain',c.sustain,c.sustainRounds||3); } // 持續攻擊buff、每回合衰減(tickStatuses)、本場清零
    if(c.extraDraw){ applyStatus(p,'extraDraw',c.extraDraw,c.drawRounds||3); } // 回合開始多抽(startRound硬上限+2、round-decay)
    if(c.teamAtk){ applyScoped(S,'hero','teamAtk',c.teamAtk,c.teamRounds||2); B.feed.unshift(`全隊攻擊+${c.teamAtk}(${c.teamRounds||2}回合)`); } // heroTeam池:對兩英雄各施一份
    if(c.cross){ const t=foe;
      if(c.cross==='energy') t.energy++;
      if(c.cross==='block'){ t.block+=c.v; t.guardFrom=(t.guardFrom||0)+c.v; if(S.run.relics.includes('totem'))p.block+=2; }
      if(c.cross==='empower') applyStatus(t,'empower',c.v);
      if(c.cross==='battlefield') applyStatus(t,'battlefield',c.v);
      if(c.cross==='energydraw'){ t.energy+=2; draw(S,t,1); }
      if(c.cross==='healboth'){ ['A','B'].forEach(h=>{ S.heroes[h].hp=Math.min(S.heroes[h].max,S.heroes[h].hp+c.v); }); } }
    // heal 特例：治療隊友的是英雄 hp(可救起倒下隊友)
    if(c.cross==='heal'){ const th=(foe===B.combat.A)?'A':'B'; const was=B.combat[th].downed; S.heroes[th].hp=Math.min(S.heroes[th].max,S.heroes[th].hp+c.v); if(was){B.combat[th].downed=false; S.heroes[th].hp=Math.max(S.heroes[th].hp,8); B.feed.unshift('把倒下的隊友救起來了!');} }
    if(c.bond) gainBond(S,c.bond,m.player,c.n);
    p.disc.push(k); p.hand.splice(m.cardIdx,1); B.cardsThisRound=(B.cardsThisRound||0)+1; B.passStreak=0;
    if(allDead(S)) winBattle(S);
    return S;
  }
  return S;
}
function endTurn(S){ const B=S.battle; B.passStreak=(B.passStreak||0)+1; if(B.passStreak<2){ B.turn=(B.turn==='A'?'B':'A'); B.atk=0; } } // pass/交棒:連續2次pass才換敵人(自由交錯出牌)

/* ---- 裁判步（敵人/換輪） ---- */
function engineStep(S){
  if(S.phase!=='battle'||(S.battle.passStreak||0)<2) return S;
  const B=S.battle; B._actor=null; // 敵人回合:召喚物/燃燒/敵方造成的擊殺不給玩家獎勵
  if(B.round>15){ const decay=(B.round-15)*3; B.enemies.forEach(e=>{ if(e.hp>0){ e.enraged=(e.enraged||0)+1; e.hp=Math.max(0,e.hp-decay); } }); if(B.round===16)B.feed.unshift('⏳戰鬥拖太久·敵人狂暴+持續崩解、強制收尾!'); if(allDead(S)){ winBattle(S); return S; } } // 防軟鎖:過久敵人遞增暴怒(+傷)且每回合遞增真傷崩解(decay=(round-15)*3)、連自療敵也保證死→強制收尾(杜絕打不死也死不了的stall)
  if(B.summons && B.summons.length){ // 召喚物:主角回合結束後、敵人行動前自動動作(隨機目標·God Field式)
    for(const su of B.summons){ let act=su.kind; if(act==='random') act=rnd(S)<0.5?'heal':'attack';
      if(act==='heal'){ const hs=['A','B'].filter(h=>!B.combat[h].downed); if(hs.length){ const h=hs[ri(S,hs.length)]; S.heroes[h].hp=Math.min(S.heroes[h].max,S.heroes[h].hp+su.v); B.feed.unshift(`召喚物治療${S.heroes[h].name}+${su.v}`);} }
      else if(act==='attack'){ const te=aliveEnemies(S); if(te.length){ const t=te[ri(S,te.length)]; hitEnemy(S,su.v,t); B.feed.unshift(`召喚物射${t.name}${su.v}傷`);} }
      su.rounds--; }
    B.summons=B.summons.filter(su=>su.rounds>0);
    if(allDead(S)){ winBattle(S); return S; }
  }
  for(const e of B.enemies){
    if(e.hp<=0) continue;
    const bn=getV(e,'burn'); if(bn>0){ e.hp=Math.max(0,e.hp-bn); applyStatus(e,'burn',-3); if(e.hp<=0){ onEnemyDeath(S,e); continue; } } // 燃燒DoT:每回合-bn、bn再-3衰減
    const it=e.ins[e.ii%e.ins.length];
    // 敵出手攻擊一律過 applyOut(walk 所有 enemy status 的 out hook;weaken 即其一)＝加新減傷詞條不動這段
    if(it.t==='guard') e.block+=14;
    else if(it.t==='heal_self'){ if(!(getV(e,'burn')>0)) e.hp=Math.min(e.max,e.hp+it.v); else B.feed.unshift(e.name+'燃燒中、治療失效!'); }
    else if(it.t==='shock'){ const cards=B.cardsThisRound||0; const v=applyOut(e,cards*3); hitHero(S,lowestHero(S)||'A',v,0.5); B.feed.unshift(`${e.name}放電:本輪${cards}張牌→${v}傷(50%穿)`); }
    else if(it.t==='summon'){ if(it.minion && aliveEnemies(S).length<4 && (e.summonsMade||0)<2){ B.enemies.push(mkEnemy(it.minion,S.run.coef)); e.summonsMade=(e.summonsMade||0)+1; B.feed.unshift(`${e.name}召喚了${ENEMIES[it.minion].n}!`); } else e.enraged=(e.enraged||0)+1; } // 敵方召喚:生小兵(場上上限4·每召喚者上限2)、否則暴怒
    else if(it.t==='bleed'){ const v=applyOut(e,it.v||9); hitHero(S,'A',v,PIERCE.bleed);hitHero(S,'B',v,PIERCE.bleed); }
    else if(it.t==='smash'){ let tgt=e.tauntT||lowestHero(S)||it.tgt||'A'; if(B.combat[tgt]&&B.combat[tgt].downed)tgt=(tgt==='A'?'B':'A'); hitHero(S,tgt,applyOut(e,it.v+(e.enraged?5:0))); }
    else if(it.t==='splash'){ const v=applyOut(e,it.v); hitHero(S,'A',v,PIERCE.splash);hitHero(S,'B',v,PIERCE.splash); }
    else if(it.t==='sweep'){ const v=applyOut(e,it.v); hitHero(S,'A',v,PIERCE.sweep);hitHero(S,'B',v,PIERCE.sweep); }
    e.tauntT=null; e.ii++;
    if(e.exposeCount>0) e.exposeCount--;
    tickStatuses(e); // weaken 等 round-decay 統一由此遞減
  }
  if(allDead(S)){ winBattle(S); return S; }
  for(const h of ['A','B']){ const cs=B.combat[h]; cs.thorns=Math.max(0,(cs.thorns||0)-1); cs.noblock=false; }
  B.immune={A:false,B:false}; B.round++;
  if(B.combat.A.downed&&B.combat.B.downed){ S.phase='lose'; return S; }
  startRound(S,false);
  return S;
}
function hitHero(S,h,v,pierce){ const B=S.battle, cs=B.combat[h]; if(cs.downed)return; pierce=pierce||0;
  if(B.immune[h]){ B.feed.unshift(`免傷! ${S.heroes[h].name}擋下`); return; }
  const fromMate=cs.guardFrom||0;
  const pierceDmg=Math.floor(v*pierce), blockable=v-pierceDmg;   // pierce部分無視格擋
  const blk=Math.min(cs.block,blockable);cs.block-=blk;let dmg=(blockable-blk)+pierceDmg;
  S.heroes[h].hp=Math.max(0,S.heroes[h].hp-dmg);
  if(fromMate>0&&blk>0) B.feed.unshift(`隊友的護盾幫${S.heroes[h].name}擋下${blk}!`);
  if(cs.thorns>0){ const te=lowestAlive(S); if(te){ te.hp=Math.max(0,te.hp-4); if(te.hp<=0)onEnemyDeath(S,te); } }
  if(S.heroes[h].hp<=0){ cs.downed=true; B.feed.unshift(`${S.heroes[h].name}倒下了`); }
}

/* ---- 勝負 / 節點 ---- */
function draftOffer(S,hero){ const ex=shuffle(S,POOL[hero].slice()); const com=POOL_COMMON[(S.run.node+(hero==='B'?1:0))%POOL_COMMON.length]; return [ex[0],ex[1],com].filter(Boolean); } // 2專屬+1共通(共通決定性選、不額外remap RNG)
function winBattle(S){
  const node=S.run.map[S.run.node];
  S.run.gold+=15;
  if(S.run.relics.includes('tome')) S.run.explore=(S.run.explore||0)+2; // 探險誌:勝利+2探索值
  if(node.mod){ S.run.explore=(S.run.explore||0)+3; // 困難房間:較多探索值 + 紀念卡(獨特強卡)
    if(!S.heroes.A.deck.includes('memento_a')) S.heroes.A.deck.push('memento_a');
    if(!S.heroes.B.deck.includes('memento_b')) S.heroes.B.deck.push('memento_b'); }
  S.battle=null;
  ['A','B'].forEach(h=>{ if(S.heroes[h].hp<=0) S.heroes[h].hp=Math.round(S.heroes[h].max*0.4); }); // 戰後自動復活:倒下隊友回40%(軟失敗·防死亡雪崩·長跑容錯)
  if(node.t==='boss' && node.final){ S.run.clearScore=Math.round(100*(S.run.coef||1))+(S.run.explore||0)*2; S.run.clearChest=chestTier(S.run.coef); S.phase='win'; return; } // 只有最終boss才通關;章節boss(非final)走下面draft+續進下一章
  if(node.t==='boss' && !node.final){ ['A','B'].forEach(h=>{ S.heroes[h].hp=S.heroes[h].max; }); S.battle=null; } // 章節過關:全體回滿血(章節恢復·解長跑attrition·ch2 fresh start)
  // draft:清房後兩位英雄各自選自己的獎勵(A→B依序、2張專屬+1張共通=保identity+增流派)
  const q=['A','B'];
  S.offer={kind:'draft',queue:q,hero:'A',cards:draftOffer(S,'A')};
  S.phase='draft';
}
function enterNode(S){
  const n=S.run.map[S.run.node];
  if(n.t==='battle'||n.t==='boss') startBattle(S,n.e);
  else if(n.t==='campfire'){ S.phase='campfire'; }
  else if(n.t==='relic'){ const all=Object.keys(RELICS_K).filter(r=>!S.run.relics.includes(r)); shuffle(S,all); S.offer={kind:'relic',picks:all.slice(0,2)}; S.phase='relic'; }
  else if(n.t==='shop'){ S.phase='shop'; S.offer={kind:'shop'}; } // 學偶式商人:花探索值買移除/升級/稀有卡
  else if(n.t==='chest'){ // 寶箱=稀有度過濾的三選一(複用 draft 流程);金寶箱另送遺物
    const tier=n.tier||chestTier(S.run.coef); const hero=(S.run.node%2===0)?'A':'B'; const want=CHEST_RAR[tier];
    let pool=POOL[hero].filter(k=>rarity(k)===want); if(pool.length<3) pool=POOL[hero].slice(); shuffle(S,pool);
    if(tier==='金'){ const rel=Object.keys(RELICS_K).filter(r=>!S.run.relics.includes(r)); if(rel.length){shuffle(S,rel);S.run.relics.push(rel[0]);} } // 金寶箱附遺物
    S.offer={kind:'chest',tier,hero,cards:[pool[0],pool[1],pool[2]].filter(Boolean)}; S.phase='draft'; }
}
function shopCost(S){ return Math.round(S.run.shopCounter * (S.run.coef||1)); } // 移除/升級共用價(×地城係數)
function shopCardCost(S){ return Math.round(4 * (S.run.coef||1)); }
const RELIC_DEFS={
  watch:{n:'懷錶',d:'每場戰鬥首回合 +1 能量'},
  totem:{n:'共鳴圖騰',d:'隊友替你擋刀(給格擋)時、你自己也 +2 格擋'},
  tome:{n:'探險誌',d:'每場戰鬥勝利額外 +2 探索值(經濟)'},
  bondr:{n:'羈絆之環',d:'羈絆達 10 時、每次觸發雙人各回 +3 HP'},
};
const RELICS_K={watch:1,totem:1,tome:1,bondr:1};
function relicName(r){ return (RELIC_DEFS[r]&&RELIC_DEFS[r].n)||r; }
function removeBasic(S){ // 移除一張基礎牌以減少流派稀釋(優先移A多餘打擊、B多餘格擋)
  const tryRm=(h,card)=>{ const d=S.heroes[h].deck; const i=d.indexOf(card); const cnt=d.filter(x=>x===card).length; if(i>=0&&cnt>1){ d.splice(i,1); return true; } return false; };
  if(tryRm('A','strike')||tryRm('B','block')||tryRm('A','guardself')||tryRm('B','ironwall')) return;
}
const REMOVABLE={A:['strike','guardself','barrage'],B:['block','ironwall']}; // 可移除的基礎牌(留至少一張)
function hasRemovable(S,h){ const d=S.heroes[h].deck; return REMOVABLE[h].some(card=>d.filter(x=>x===card).length>1); }
function removeBasicHero(S,h){ const d=S.heroes[h].deck; for(const card of REMOVABLE[h]){ const i=d.indexOf(card); if(i>=0 && d.filter(x=>x===card).length>1){ d.splice(i,1); return true; } } return false; } // 獎勵畫面主動精簡:移一張多餘基礎牌
const UPGRADE_PREF=['bloodblade','cleave','heavy','thousand','barrage','warcry','rally','weaken','command','inspire','heal','ironwall','strike','shield','block']; // 升級優先序(先強化高價值牌)
function upgradeCard(S){ // 升級一張可升級的牌(營火/商人共用);回傳是否成功
  for(const card of UPGRADE_PREF){ if(!UPGRADE[card])continue; for(const h of ['A','B']){ const d=S.heroes[h].deck; const i=d.indexOf(card); if(i>=0){ d[i]=UPGRADE[card]; return true; } } }
  return false;
}
function advance(S){ S.run.node++; if(S.run.node>=S.run.map.length){ S.phase='win'; return; }
  const n=S.run.map[S.run.node];
  if(n.t==='fork'){ S.phase='mapfork'; S.offer={kind:'fork', label:n.label, choices:n.choices.map((c,i)=>({i,desc:c.desc,cond:c.cond})).filter(o=>!o.cond||o.cond(S)).map(o=>({i:o.i,desc:o.desc}))}; } // 到岔路→給選路(cond過濾隱藏選項·如探索值不夠不顯示)
  else S.phase='map'; }
function isTerminal(S){ return S.phase==='win'?'win':(S.phase==='lose'?'lose':null); }

/* ---- 貪心 adapter（自測用；A 拼傷害、B 保 A+產羈絆） ---- */
function greedy(S,player){
  const moves=legalMoves(S,player);
  if(S.phase!=='battle'){ // 選單:優先前進/rest/拿第一個
    if(S.phase==='mapfork') return {type:'map_choice',pick:0}; // 貪心:永遠走安全路(不搏獎勵=對比組)
    if(S.phase==='shop') return {type:'shop',act:'leave'}; // 貪心:不逛商店(不經營探索值=對比組)
    if(S.phase==='campfire'){ const need=(S.heroes.A.hp<S.heroes.A.max*0.6||S.heroes.B.hp<S.heroes.B.max*0.5); if(need)return {type:'campfire',choice:'rest'}; return {type:'campfire',choice: S.run.node<4?'upgrade':'remove'}; }
    if(S.phase==='draft'){ return moves.find(m=>m.pick!=='skip'&&m.pick!=='remove')||moves[0]; } // 貪心:永遠加牌(會越加越胖=稀釋、教學對比組)
    if(S.phase==='relic'){ return moves[0]; }
    return moves.find(m=>m.type==='map_advance')||moves[0];
  }
  const role=S.heroes[player].role, ally=(player==='A'?'B':'A');
  const cs=S.battle.combat[player], cards=moves.filter(m=>m.type==='play_card');
  const pick=(order)=>{ for(const key of order){ const idx=cs.hand.findIndex(k=>k===key||UPGRADE[key]===k); if(idx>=0){ const mv=cards.find(m=>m.cardIdx===idx); if(mv) return mv; } } return null; };
  if(role==='guardian'){
    const e=lowestAlive(S);
    const healNeed = S.heroes[ally].hp < S.heroes[ally].max*0.4 || S.battle.combat[ally].downed;
    let order;
    if(e && e.armor>0 && (e.exposeCount||0)<=0) order=['taunt','shield','inspire','heal','battlefield','ironwall','block','resonance'];
    else if(healNeed) order=['heal','shield','inspire','battlefield','taunt','ironwall','block','resonance'];
    else order=['memento_b','inspire','battlefield','rally','command','tempo','shield','weaken','taunt','heal','rain','ironwall','block','coverguard','siphon','bondknot','quickjab','thornshield','insight','resonance'];
    return pick(order)||{type:'end_turn',player};
  } else if(role==='control'){ // 丸子:先疊debuff→(疫/枯萎面狀)→綻放計數爆發
    const order=['miasma','tint','plague','wither','weaken','ember','bloom','scatter','quickjab','siphon','coverguard','bondknot'];
    return pick(order)||{type:'end_turn',player};
  } else if(role==='tempo'){ // 金魚:streamdraw鋪→傷害牌+多段(浪潮AoE)→flurry/crescendo
    const order=['streamdraw','dartvolley','tidalwave','scatter','barrage','quickjab','flamedart','frostdart','zap','tempo','flurry','crescendo','siphon','bondknot'];
    return pick(order)||{type:'end_turn',player};
  } else { // attacker(炎)
    if(S.run.bond>=6){ const bs=moves.find(m=>m.type==='use_bond'&&m.skill==='burst'); if(bs) return bs; }
    return pick(['memento_a','resonate','cleave','heavy','bloodblade','thousand','warcry','barrage','ember','insight','strike','quickjab','flamedart','frostdart','zap','focus','gift','guardself'])||{type:'end_turn',player};
  }
}

/* ---- 「會思考」adapter（代表 LLM 級決策：存羈絆給boss/絕對防線擋大招/A等破窗才爆/B三選一救命） ---- */
function smart(S,player){
  const moves=legalMoves(S,player);
  if(S.phase!=='battle'){
    if(S.phase==='mapfork'){ const hasDef=['A','B'].some(h=>S.heroes[h].role==='guardian'||S.heroes[h].role==='control'); const thr=hasDef?0.6:0.85; const healthy=S.heroes.A.hp>=S.heroes.A.max*thr && S.heroes.B.hp>=S.heroes.B.max*thr; return {type:'map_choice',pick: healthy?1:0}; } // 高手:血夠走困難路搏獎勵、否則安全;無守護的脆皮組(玻璃砲)要更高門檻(0.85)才敢冒險、別過度延伸被中段硬仗打死
    if(S.phase==='shop'){ const rm=moves.find(m=>m.act==='remove'), up=moves.find(m=>m.act==='upgrade'); // 高手:牌組胖先精簡、否則升級關鍵牌、花探索值換戰力
      const bloated=(S.heroes.A.deck.length+S.heroes.B.deck.length)>=22;
      if(bloated && rm) return rm; if(up) return up; return {type:'shop',act:'leave'}; }
    if(S.phase==='campfire'){ const bossNext=S.run.map[S.run.node+1]&&S.run.map[S.run.node+1].t==='boss';
      const hasDef=['A','B'].some(h=>S.heroes[h].role==='guardian'||S.heroes[h].role==='control'); const restThr=hasDef?0.7:0.9; // 純攻擊組(無守護無控制)沒減傷手段→營火更該休息(門檻拉到0.9)
      const hurt=S.heroes.A.hp<S.heroes.A.max*restThr||S.heroes.B.hp<S.heroes.B.max*restThr;
      if(hurt||bossNext) return {type:'campfire',choice:'rest'};
      const canExplore=moves.find(m=>m.choice==='explore'); if(canExplore) return canExplore; // 高手:探索值夠就換遺物(經營資源)
      return {type:'campfire',choice:S.run.node<3?'upgrade':'remove'}; }
    if(S.phase==='draft'){ const h=S.offer.hero; const big=S.heroes[h].deck.length>=11; // 高手:牌組胖了就主動移除精簡、否則挑一張
      const rm=moves.find(m=>m.pick==='remove'), skip=moves.find(m=>m.pick==='skip'), take=moves.find(m=>m.pick!=='skip'&&m.pick!=='remove');
      return (big ? (rm||skip) : take)||moves[0]; }
    if(S.phase==='relic') return moves[0];
    return moves.find(m=>m.type==='map_advance')||moves[0];
  }
  const B=S.battle,e=lowestAlive(S)||{ins:[{t:'',v:0}],ii:0,armor:0,boss:false,hp:0,enraged:0,tauntT:null,exposeCount:0},cs=B.combat[player],cards=moves.filter(m=>m.type==='play_card');
  const it=e.ins[e.ii%e.ins.length];
  const incomingSmash=it.t==='smash'?(it.v+(e.enraged?5:0)):0;
  const wall=moves.find(m=>m.type==='use_bond'&&m.skill==='wall');
  const burst=moves.find(m=>m.type==='use_bond'&&m.skill==='burst');
  const canPierce=!(e.armor>0&&(e.exposeCount||0)<=0);
  const role=S.heroes[player].role, ally=(player==='A'?'B':'A');
  const pick=(order)=>{ for(const k of order){const i=cs.hand.findIndex(x=>x===k||UPGRADE[k]===x);if(i>=0){const mv=cards.find(m=>m.cardIdx===i);if(mv)return mv;}} return null; };
  if(role==='guardian'){
    if(wall&&e.boss&&incomingSmash>=24) return wall;                 // boss大招→絕對防線
    const someoneDown=B.combat.A.downed||B.combat.B.downed;
    const allyLethal=incomingSmash>0 && S.heroes[ally].hp<=incomingSmash+2 && (it.tgt===ally||e.tauntT===ally);
    let order;
    if(someoneDown) order=['heal','shield','inspire','taunt','ironwall','block'];
    else if(e.armor>0&&(e.exposeCount||0)<=0) order=['taunt','shield','inspire','ironwall','block','heal']; // 破甲敵→開窗;若隊友沒攻擊手可改棘盾自打
    else if(allyLethal) order=['shield','taunt','heal','ironwall','inspire','block'];  // 保隊友命優先
    else order=['memento_b','inspire','battlefield','rally','command','tempo','shield','weaken','taunt','ironwall','block','rain','coverguard','siphon','bondknot','quickjab','thornshield','insight','resonance'];
    return pick(order)||{type:'end_turn',player};
  } else if(role==='control'){ // 丸子:先疊debuff→(疫/枯萎面狀)→綻放計數爆發
    return pick(['miasma','tint','plague','wither','weaken','ember','bloom','scatter','quickjab','siphon','coverguard','bondknot'])||{type:'end_turn',player};
  } else if(role==='tempo'){ // 金魚:streamdraw鋪→傷害牌+浪潮AoE→連打payoff
    return pick(['streamdraw','dartvolley','tidalwave','scatter','barrage','quickjab','flamedart','frostdart','zap','tempo','flurry','crescendo','siphon','bondknot'])||{type:'end_turn',player};
  } else { // attacker(炎)
    if(burst&&(e.boss||e.hp<=40)&&canPierce) return burst;          // 只在boss戰/收頭才爆羈絆
    const order = canPierce ? ['memento_a','resonate','cleave','heavy','bloodblade','thousand','warcry','barrage','ember','insight','strike','quickjab','flamedart','frostdart','zap','focus','gift','guardself']
                            : ['focus','gift','warcry','ember','insight','guardself','barrage','strike']; // 穿不了甲別浪費大牌、改蓄力/鋪
    return pick(order)||{type:'end_turn',player};
  }
}

/* ---- 跑一整局 ---- */
function runGame(seed,adapters,verbose){
  let S=init(seed), guard=0;
  while(!isTerminal(S) && guard++<5000){
    const who=whoseTurn(S);
    if(who==='engine'){ S=engineStep(S); continue; }
    const player = who==='human' ? 'A' : who;
    const mv=adapters[player]? adapters[player](S,player) : greedy(S,player);
    if(!mv){ break; }
    S=apply(S,mv);
    if(verbose && S.battle){ /* 可加 log */ }
  }
  return {result:isTerminal(S), node:S.run.node, round:S.battle?S.battle.round:'-', A:S.heroes.A.hp, B:S.heroes.B.hp, bond:S.run.bond, explore:S.run.explore, coef:S.run.coef, clearScore:S.run.clearScore, clearChest:S.run.clearChest, shards:S.run.node*2+(S.phase==='win'?15:0)+Math.floor((S.run.clearScore||0)/5), decks:{A:S.heroes.A.deck.length,B:S.heroes.B.deck.length}, relics:S.run.relics};
}

const ENGINE_API={ init, initSelect, legalMoves, apply, whoseTurn, engineStep, isTerminal, runGame, greedy, smart, C, ENEMIES, BOND_SKILLS, rarity, UPGRADE, HERO_DEFS, ROSTER, META_UPS, metaBuy, RELIC_DEFS, relicName, shopCost, shopCardCost, hasRemovable };
if(typeof module!=='undefined'&&module.exports){ module.exports=ENGINE_API; } // Node
if(typeof window!=='undefined'){ window.ENGINE=ENGINE_API; } // 瀏覽器:掛到 window.ENGINE 供 UI 用

/* ---- 自測 ---- */
if(typeof require!=='undefined' && require.main===module){ // 僅 node 直跑時自測(瀏覽器不執行)
  const run=(pol)=>{ let w=0,close=0; const rows=[]; for(let s=1;s<=20;s++){ const r=runGame(s*13+1,{A:pol,B:pol}); const m=Math.min(r.A,r.B); if(r.result==='win'){w++; if(m<=12)close++;} rows.push(r.result==='win'?'✅':'❌'); } return {w,close,rows}; };
  console.log('=== 深度驗證：同 20 seed、貪心bot vs 會思考adapter ===');
  const g=run(greedy), sm=run(smart);
  console.log('貪心bot :',g.rows.join(''));
  console.log('會思考  :',sm.rows.join(''));
  console.log(`--- 貪心bot 通關 ${g.w}/20 (${g.w*5}%)  |  會思考 ${sm.w}/20 (${sm.w*5}%)  |  提升 +${(sm.w-g.w)*5}%點 ---`);
  console.log(`險勝(≤12血): 貪心${g.close} / 思考${sm.close}`);
  console.log('判讀:貪心<50% + 思考顯著>貪心 = 需要腦袋才能玩(深度成立、非RNG非自動贏)。');
}
