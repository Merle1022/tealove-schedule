# GAS API v2 部署說明

本資料夾保存可公開的 Google Apps Script 原始碼，不保存 Script ID、Spreadsheet ID、部署網址、帳號密碼或 OAuth 憑證。

## 升級順序

1. 從「鮮茶樂營運儀表板 Demo 資料庫」開啟「擴充功能 → Apps Script」。
2. 在「專案設定」確認時區為 `Asia/Taipei`，並取得 Script ID；Script ID 只供本機設定，不提交 GitHub。
3. 將 `Code.gs` 貼入 Demo Apps Script 專案。
4. 手動執行 `setupV2()`，授權程式綁定 Demo 試算表並建立 Script Properties。
5. 手動執行 `migrateDemoPasswords()`；它會將 C 欄 Demo 密碼轉為 HMAC 後清空明文。
6. 以新的 Web App deployment 發布：執行身分使用擁有者，存取範圍需允許 Demo 訪客呼叫登入端點。
7. 先測試 `health`、錯誤登入、正確登入、session 失效、排班讀取與儀表板讀取。
8. 完成讀寫與重設測試後，才把新 deployment URL 套用到 GitHub Pages。

## API 動作

不需 token：

- `health`
- `login`

需有效 token：

- `logout`
- `getSchedule`
- `saveShift`
- `getInventory`
- `saveInventory`（admin）
- `getDashboard`（admin）
- `getAlerts`（admin）
- `resetDemoData`（admin、且僅 Demo 模式）

## 資安邊界

- GAS Web App URL 會出現在靜態前端，不能當成祕密。
- v2 以短期 session token、伺服器端角色判定、資料白名單、範圍驗證與 `LockService` 保護寫入。
- HMAC 密碼僅改善 Demo 明文問題，不等同完整企業級身分系統。
- Demo 工時提醒門檻僅供視覺化測試，不構成勞動法令判定。
