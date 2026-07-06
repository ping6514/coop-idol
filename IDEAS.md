# 待開發 Backlog / Roadmap（未來 arc·非現在做）

## 🎓 訓練卡系統（Gakumas 式·2026-07-06 使用者提案）
戰前/開跑前的準備 modifier，參考學園偶像大師的訓練卡。
- **抽牌權重**：訓練卡影響「個別角色」抽到特定 `fac` 標籤卡片的機率（偏爆發/連擊/銅牆/調色…）。接現有的卡片標籤(`fac`) + draft 系統：draft offer 依裝備的訓練卡加權。
- **設施 / 強敵房**：新地圖節點類型——訪問設施或挑戰強敵房 → 額外資金(探索值)/能力提升。地圖是 data-driven，加節點類型很輕（照 ROOM_MODS / MAP 模式）。
- 架構契合：訓練卡可比照使魔的 registry 模式（宣告式、低耦合）；選擇時機類似開場選使魔或另一準備階段。

## 🃏 卡片機制 backlog（早期提案·需新機制+可能UI）
賭博類(打出下一張抽到的牌)、重洗手牌、檢索/捨牌、改牌組頂端2張(scry)、暫存區(最多2張)。發散多、排後面。

## ⚔️ adapter 覆蓋盲點 + rebalance（需人盯）
smart AI 幾乎不用召喚/元素/AoE(真因:draft 階段沒抽進牌組)。要做:①smart draft-AI 主動評估情境價值 ②或提高這些共通卡 draft 出現率/放起始牌組。改完 smart 勝率上升→一併重調敵人數值(rebalance loop)。見 BALANCE.md。

## 🌊 第二章難度微調（選項D已上·可續調）
ch2 已進階解鎖(首通莎菈開放)。若要調 meta0 手感可縮短/降深淵古神數值(見 CH2_DECISION.md 選項C)。

## 🚀 連線對打（netplay·地基已備）
確定性引擎已 netplay-ready。傳輸層決議:輕 relay 優先(Cloudflare Worker WS)。見 ARCHITECTURE_NETPLAY_NOTES.md。

## 🛠️ 部署穩定性
GitHub Pages legacy build 偶爾卡很久。若持續，改用 GitHub Actions Pages 部署更可靠。

---
（開任一項前先跟使用者確認方向+範圍。每次內容改動後跑 dev/ 的 balance/hardening/mechtest/famtest 確認無回歸。）
