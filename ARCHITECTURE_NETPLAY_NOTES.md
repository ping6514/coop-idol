# 架構決策：框架 / 部署 / 連線對打（2026-07-05）

> 使用者問：要不要改用框架？對 Vercel 部署、P2P 連線對打有沒有幫助？
> 結論：**兩個目標都不需要框架。現在的「確定性引擎 + 薄客戶端」架構，正好就是連線對打的最佳地基。**

## 現況架構
- `engine.js`：**headless、純函式、確定性、種子亂數**的狀態機。核心 API `apply(S, move) → S'`。零依賴。
- `coop.html`：薄客戶端，只 `render(S)` + 送 `move`，不持有遊戲邏輯。單一真相源 = 引擎。
- player = 可抽換 adapter（現在 HTTP/本機；設計上可換成 bus / 遠端）。

## 一、框架對「Vercel 部署」有沒有幫助？
**沒有。** 我們是純靜態 2 個檔，Vercel（或 GitHub Pages / Netlify / Cloudflare Pages）直接吃、零設定。
框架（Next/Nuxt/Vite）只會多一層 build step，對純靜態遊戲不加分。

## 二、框架對「P2P / 連線對打」有沒有幫助？
**不是關鍵，關鍵在引擎的確定性——而我們已經有了。**

因為 `apply(S, move)` 是**確定性純函式**（同輸入必得同輸出），連線對打可用最省頻寬的 **lockstep / rollback netcode**：
- 兩端**只交換動作（move，很小的 JSON）**，不傳整個狀態。
- 各端跑**同一顆引擎**、各自 `apply`，狀態自動保持一致。
- 這正是格鬥遊戲 / RTS 的做法。

netcode 活在引擎外的**傳輸層**（WebRTC / relay），與 UI 用不用框架完全無關。
而且 `player = 可抽換 adapter` 早就為遠端玩家鋪好路。

### 🔒 唯一鐵則：引擎內永遠不可有非確定性來源
- **禁用 `Date.now()` / `Math.random()`**（會讓兩端不同步）。
- 我們已用**種子 LCG rng（`S.rng`）**鎖死一切隨機 → **天生 netplay-ready**。
- 未來加任何內容都要守這條：所有隨機走 `S.rng`，時間類邏輯用回合數不用真實時鐘。

## 三、框架真正、也唯一的好處
UI 變複雜時（多畫面、補間動畫、響應式狀態），Vue / Svelte 比手刻 `innerHTML` 字串好維護。
——這是**視圖層維護性**問題，不是部署或連線問題。

## 建議路線
1. **引擎永遠保持純 JS、零依賴、確定性**。它的確定性 = 連線的本錢，絕對別動、別框架化。
2. **UI 現在維持薄客戶端**（vanilla）。等哪天畫面複雜到痛了，再換**輕框架（優先 Svelte）只包 view 層**，引擎原封不動。
3. **部署**：純靜態，Vercel / GitHub Pages / Cloudflare Pages 任選，隨時可上。
4. **連線對打（未來）**：
   - 傳輸層二選一——**P2P（WebRTC/PeerJS）**：無 server，但有 NAT 穿透 / 配對麻煩；或**輕 relay server**：較簡單，Vercel serverless function 可做配對 / 中繼。
   - 不論哪種，引擎不動，只在外面包一層「收發 move + 同步 rng seed」。

## 一句話總結
> 我們缺的從來不是框架，是把現有的確定性引擎接上一條傳輸線。地基已經對了。
