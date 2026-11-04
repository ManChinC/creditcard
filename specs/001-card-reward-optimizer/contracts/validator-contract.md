# Contract: Validator（規則檔與執行器）

依 Constitution XIII（v1.2.0）、FR-049、AD-010。

## 結構

- **規則檔**：驗證規則唯一來源，以資料形式定義。格式為 JSON 純資料、固定詞彙、比對模式限共同子集、金額為整數新台幣（使用者 2026-11-03 確認，見 AD-010）。
- **執行器**：瀏覽器 JavaScript 執行器、本機 Python 執行器。只讀規則檔，**禁止**自帶規則或另加判斷。
- **一致性測試案例**：兩個執行器共用同一組，含拒絕情境；任一執行器未通過即不得合併。格式 `[TBD: R-04]`。
- 預設拒絕：未明確允許的請求一律拒絕。
- 必須可獨立於完整 API 呼叫測試。

## 執行範圍

| 類別 | 瀏覽器執行器 | 本機服務執行器 |
|---|---|---|
| 輸入驗證 | 是 | 是 |
| 存取檢查（accessRequirement、accessToken、protectionLevel、近端呼叫） | 僅匿名判定 | 是 |

存取檢查在瀏覽器內不具信任邊界，所有需保護的操作只在本機服務（見 [sdk-operations.md](sdk-operations.md)）。

## 規則類別（取自 spec，細節待規則檔定義）

### 貼上內容與輸入（FR-025、FR-018、FR-015）
- 格式正確、必要欄位齊全，缺漏或錯誤給明確訊息，不寫入不完整資料。
- 數值範圍合理；金額幣別僅新台幣，非新台幣拒絕（Assumptions）。
- 偵測完整卡號與 CVV：拒絕或遮罩，不保存；公開模式連末四碼也不保存。
- 偵測可疑內容（例如網頁語法）：拒絕並指出問題，內容一律當資料，不執行、不以網頁語法渲染。
- 重複貼上同一份結果的處理：`[TBD: Edge Cases]`。
- 涵蓋期間不足三個月：提示但允許繼續（FR-002）。

### 大額項目（FR-040、FR-027）
- 每個獨立列出的大額項目金額須達使用者所設門檻（預設 10,000 元，單筆判定）。
- 不通過時的處理 `[TBD: R-08]`。

### 公開資料（FR-048）
- 載入 JSON 時驗證 schema 版本與結構；失敗時不使用該資料並告知狀態。

### 存取（FR-044 至 FR-046）
- 操作須有存取宣告，未宣告則拒絕。
- 需登入者：accessToken 有效且 protectionLevel 足夠。
- LLM 相關操作：已登入且近端呼叫。
- 任一失敗拒絕；回應不洩漏內部細節；拒絕紀錄不含個人資料。

## 執行器介面與判定語意（T011、T012）

- 介面：`evaluate(rules, ruleSetName, document, settings)` 回傳 `{decision: "allow"|"deny", failures: [{rule, path, code}]}`。
- 允許條件：規則集存在、輸入為 JSON 物件、規則集至少有一條規則、所有規則通過；其餘一律拒絕。
- 失敗代碼：規則自帶的 `reason`，加上執行器層級的 `UNKNOWN_RULESET`、`INVALID_INPUT`、`NO_RULES`、`INVALID_RULE`、`UNSUPPORTED_PATTERN`。
- 路徑、整數、長度、相等、比對模式的語意見 `rules/validator-rules.json` 的 `semantics` 與 `patternSubset`。
- 使用者確認的 13 個詞彙之外，US1 新增 `noCardNumber`（字串不得含 13 位以上連續數字，單一空格或連字號不中斷計數）與 `plainText`（字串不得含 `<`、`>`、控制字元），原因是比對模式子集無法在兩個語言一致地表達；兩者已有一致性案例。
- 案例檔格式：`{"rules": "<規則檔路徑>", "cases": [{"id", "ruleSet", "input", "settings", "expect": {"decision", "failures"}}]}`，位於 `conformance/*.json`；`conformance/fixtures/test-rules.json` 為涵蓋全部詞彙的測試用規則集，非正式規則。

## 已存在的規則集

| 規則集 | 狀態 | 用途 |
|---|---|---|
| `stored-card`、`stored-channel`、`stored-mapping`、`stored-habit`、`stored-snapshot`、`stored-settings`、`stored-claim`（T044，使用者本機「已領券」標記） | 已實作（T017、T018） | 瀏覽器儲存的讀寫驗證。以允許清單禁止末四碼、卡號、CVV、逐筆明細；長度與數量上限為佔位值 `[TBD: spec 未定義]` |
| `paste-input` | 空（T024） | 貼上內容 |
| `published-data` | 已實作（T039，限制見下） | 公開回饋資料；欄位缺漏代表未知；上限數值為佔位值 `[TBD: spec 未定義]` |
| `access-public` | 已實作（T065 瀏覽器部分，提前完成） | 瀏覽器內存取檢查：只放行已宣告的匿名操作 |
| `access-admin` | 空（T065 本機部分） | 本機服務存取檢查；在此之前一律預設拒絕 |

`published-data` 的限制：現有詞彙無法表達「上層欄位出現時，下層欄位才必填」與「陣列至少一筆」，因此指定商家的 `name`、`validPeriod` 起訖日、`registrationCycle.kind` 漏填，以及 `tiers: []`，驗證器會放行，由消費端程式視為未知。是否新增詞彙 `[TBD: 待使用者決定]`。

## 一致性測試案例的最低涵蓋

- 每條規則至少一個通過案例與一個拒絕案例。
- SC-001 的格式錯誤測試集須 100% 被拒絕。
- SC-005 的惡意指令文字與金流要求案例，系統執行金流動作與遵從嵌入指令的次數為 0。
- SC-012 的存取控制測試集，錯誤放行為 0。
- 案例以資料檔形式存放於 `conformance/`，兩個執行器各自載入同一份。
