# 飲料店排班系統｜Tealove Schedule

飲料店店務管理 Demo，整合員工登入、每週排班、營運儀表板、原物料庫存管理，以及 CSV 匯出。

- 線上展示：https://merle1022.github.io/tealove-schedule/
- 專案代號：`tealove-schedule`
- 常用別名：鮮茶樂、飲料店排班系統、Tealove、飲料店班表

## 功能

- 管理員／店員兩種角色
- 一週排班網格與班別設定
- 每週總工時、預估人事成本與上週比較
- 每位員工工時、每日人力與班別分布圖表
- 人力不足、超時與低庫存提醒
- 日期／週次篩選與 Demo 測試資料重設
- Google Apps Script／Google Sheets 雲端資料同步
- 原物料庫存管理
- 排班與庫存 CSV 匯出

## 公開 Demo

線上展示完成更新後，可使用以下匿名測試帳號：

- 帳號：`demo_admin`
- 密碼：`TeaLove2026!`

登入頁也提供「一鍵帶入」。這組帳號只連到 Demo 試算表；可以測試排班、儀表板、庫存與資料重設，不包含正式門市或員工資料。

## 專案結構

```text
index.html       店務營運儀表板
app.js          API 呼叫與登入 session 共用模組
login.html       登入頁
schedule.html    排班與統計
inventory.html   庫存管理
gas/             Google Apps Script API v2 原始碼與部署說明
BUILDLOG.md      公開開發歷程
```

## 技術

HTML、JavaScript、Tailwind CSS CDN、Google Apps Script、Google Sheets、GitHub Pages。

## 本機修改

介面可由本機靜態伺服器預覽；涉及登入與雲端資料的功能需連線至 Demo GAS API。修改完成後提交並推送到 `main`，GitHub Pages 會重新發布網站。

## 展示與資安邊界

此專案目前是作品展示與流程驗證版本，尚未經過獨立資安稽核。公開環境只可放匿名測試資料，不得放入真實員工個資、正式薪資、正式門市密碼或敏感庫存資料。API 已使用短期 session、伺服器端逐次角色驗證、資料驗證與操作紀錄；正式營運前仍應補上第三方身分驗證、速率限制、完整稽核、備份與災難復原。

公開 repo 可提供專用 Demo 帳號，但不得記錄正式帳號密碼、API 金鑰或正式服務端點。
