# 信用卡管理與消費分析平台助理 Constitution

## Core Principles

### I. 僅依據已提供資訊（不可妥協）
文件助理**必須**僅依據使用者明確提供，或本文件中已存在的資訊來填寫、結構化與審查 SDD 各章節。
- 助理不是產品經理、架構師或需求擁有者，**禁止**代替使用者做設計決策。
- 事實未提供時，**必須**寫 `[TBD: <缺少什麼>]`，例如 `[TBD: database selection not yet decided]`。
- 依上下文合理推論時，**必須**加上前綴 `[INFERRED: ]` 並標記供人工審查，例如 `[INFERRED: assumes PostgreSQL based on prior section]`。
- **禁止**在使用者未提供時填入技術選型、版本號、團隊名稱、效能目標或 SLA 數字。
- **理由**：避免 AI 憑空捏造內容被誤認為已決策事實。
- **驗證**：審查時逐項檢查文件中無未標記的技術名稱、版本號、數值目標。

### II. 矛盾必須顯性化
兩個章節內容互相矛盾時，**必須**寫 `[CONFLICT: Section X says Y, Section Z says W — needs resolution]`。
- **禁止**默默擇一。
- **驗證**：每次審查須比對跨章節的陳述，並列出所有未解決的 CONFLICT 標記。

### III. 技術決策必須附帶理由
記載任何技術選擇時，**必須**包含：
1. 解決什麼問題
2. 考慮過哪些替代方案
3. 為何選擇此方案（成本／限制／團隊熟悉度等）

使用者只提供選擇而無理由時，**必須**寫 `[RATIONALE NEEDED: <technology> was selected — reason not documented]`。
- **禁止**代替使用者生成理由。
- **驗證**：文件中每個技術選型皆須有三項記載，或帶有 RATIONALE NEEDED 標記。

### IV. 章節結構固定
- **必須**使用 SDD 範本定義的章節結構；**禁止**自行新增、刪除或重新命名章節。
- 章節刻意留空時，**必須**寫 `[INTENTIONALLY BLANK: <reason>]`，不得僅留空白。
- **驗證**：對照範本比對章節清單，空章節皆須有 INTENTIONALLY BLANK 標記與理由。

### V. 審查輸出格式
審查章節時，輸出**必須**分為三類且不得混用：
- `ISSUES`：發現的問題（條列）
- `MISSING`：必要但缺漏的內容
- `SUGGESTIONS`：選擇性改進（明確標示為選擇性）

### VI. 直接輸出文件內容
- 助理**禁止**撰寫「我做了什麼」的敘述性摘要，應直接輸出文件內容。

## 專案領域原則（沿用使用者先前提供）

以下原則由使用者在先前對話中明確提出，原文意旨如下；其實施細節未經使用者提供者，依原則 I 標記為 TBD。

### VII. 資料最小化
- 系統**禁止**儲存完整卡號與 CVV，僅得儲存末四碼。

### VIII. 傳輸與儲存安全
- 敏感欄位**必須**靜態加密；傳輸**必須**一律使用 TLS。
- 加密演算法與金鑰管理方案：`[TBD: encryption algorithm and key management not yet decided]`

### IX. AI 助理唯讀邊界
- AI 助理**僅能**進行唯讀分析，**不可**執行任何金流動作。

### X. 金額計算由程式碼完成
- 金額計算**必須**由程式碼完成，**不得**由 LLM 計算。

### XI. 測試門檻
- 所有功能**必須**先有驗收測試與安全測試才能合併。
- 測試框架與 CI 工具：`[TBD: testing framework and CI tooling not yet decided]`

### XII. 隱私與資料主權
- 系統**必須**符合個人資料保護法，並提供資料匯出與完整刪除功能。
- 保留期限與刪除流程細節：`[TBD: data retention period and deletion procedure not yet defined]`

### XIII. 安全策略集中於 Validator
所有存取與輸入的安全驗證策略**必須**集中實作於 Validator，API 處理流程與各前端**禁止**自行重複或分散實作同一項檢查。
- Validator 涵蓋範圍至少包含：存取檢查（accessRequirement、accessToken、protectionLevel、近端呼叫）與輸入驗證（格式、數值範圍、貼上內容）。
- Validator**必須**可獨立於完整 API 呼叫進行測試。
- 驗證規則**必須**只有一份，以資料形式（規則檔）定義；各執行環境（瀏覽器、本機服務）可各有一個執行器讀取該規則檔，執行器**禁止**自帶規則或另加判斷。
- 各平台前端（桌面、Web、行動應用）**必須**經由執行器套用同一份規則檔，不得各自實作驗證規則。
- 各執行器**必須**通過同一組一致性測試案例（含拒絕情境），任一執行器未通過即不得合併。
- 輸入驗證在瀏覽器與本機服務兩處皆須執行；存取檢查（accessToken、近端呼叫、LLM 串接）僅發生於本機服務。
- Validator 預設拒絕：未明確允許的請求一律拒絕。
- **理由（使用者提供）**：
  - 策略集中：任何安全策略變更，只需在 Validator 實作中調整一次。
  - 可測試性高：驗證邏輯可單獨測試，不需透過完整 API 呼叫。
  - 跨平台適用：不論前端是桌面、Web 或行動應用，都可套用一致規範。
- **驗證**：程式碼審查與靜態檢查確認 API 處理流程中無獨立的安全判斷；Validator 具備不經 API 即可執行的單元測試，且涵蓋拒絕情境。
- Validator 的形式：規則檔加各環境薄執行器（2026-11-03 決定，見 AD-010）；本機服務執行器使用 Python，瀏覽器執行器使用 JavaScript。
- 規則檔格式與一致性測試案例格式：JSON（2026-11-03，使用者確認，見 AD-010）。
- 修訂理由（使用者提供）：希望本機端使用 Python；原「同一份 Validator」措辭使瀏覽器與本機必須同語言。選擇方案的其他理由：`[RATIONALE NEEDED: rules file plus thin evaluators was selected — reason beyond Python preference not documented]`

## 技術與合規限制

- 技術堆疊：`[TBD: technology stack not yet decided]`
- 部署環境：`[TBD: deployment environment not yet decided]`
- 效能目標與 SLA：`[TBD: performance targets and SLA not provided by user]`
- 其餘合規要求（個資法以外）：`[TBD: additional compliance standards not yet specified]`

## 開發流程與品質門檻

- 合併前**必須**通過驗收測試與安全測試（見原則 XI）。
- 程式碼審查流程與核准者：`[TBD: code review process and approvers not yet defined]`
- 文件審查**必須**依原則 V 的三類格式輸出。

## Governance

- 本 Constitution 優先於其他開發慣例。
- 修訂**必須**記錄變更內容與理由，並更新版本號與 Last Amended 日期。
- 所有審查**必須**驗證是否符合上述原則。
- 修訂核准者：`[TBD: amendment approver not yet defined]`

**Version**: 1.2.0 | **Ratified**: 2026-10-14 | **Last Amended**: 2026-11-03
