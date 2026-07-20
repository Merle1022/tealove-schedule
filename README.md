# 飲料店排班系統｜Tealove Schedule

飲料店店務管理 Demo，整合員工登入、每週排班、工時與預估薪資統計、原物料庫存管理，以及 CSV 匯出。

- 線上展示：https://merle1022.github.io/tealove-schedule/
- 專案代號：`tealove-schedule`
- 常用別名：鮮茶樂、飲料店排班系統、Tealove、飲料店班表

## 功能

- 管理員／店員兩種角色
- 一週排班網格與班別設定
- 工時、薪資與每日出勤人次統計
- Google Apps Script／Google Sheets 雲端資料同步
- 原物料庫存管理
- 排班與庫存 CSV 匯出

## 專案結構

```text
index.html       功能入口
login.html       登入頁
schedule.html    排班與統計
inventory.html   庫存管理
BUILDLOG.md      公開開發歷程
```

## 技術

HTML、JavaScript、Tailwind CSS CDN、Google Apps Script、Google Sheets、GitHub Pages。

## 本機修改

直接開啟 HTML 檔即可檢視介面。修改完成後提交並推送到 `main`，GitHub Pages 會重新發布網站。

## 展示與資安邊界

此專案目前是作品展示與流程驗證版本，尚未經過獨立資安稽核。請勿在公開展示環境放入真實員工個資、正式薪資、密碼或敏感庫存資料。正式營運前應補上伺服器端工作階段、逐次權限驗證、稽核紀錄與備份機制。

公開 repo 不提供正式帳號密碼、API 金鑰或實際服務端點說明。
