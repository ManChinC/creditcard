# Architecture Decisions: 信用卡消費匯入與通路回饋最佳化

依 Constitution III，每項技術選擇須記載：解決什麼問題、考慮過哪些替代方案、為何選擇。使用者未提供的理由一律標 `[RATIONALE NEEDED]`，不由助理代寫。此檔為 `/speckit-plan` 的輸入。

## AD-001 公開版交付形式

- **Status**: 已決定（2026-10-28）
- **解決的問題**: 公開版要讓使用者使用，同時資料不上傳（FR-032）、無持續成本與服務依賴（Assumptions）。
- **考慮過的替代方案**:
  1. 靜態網頁（運算與資料皆在使用者瀏覽器內，無後端）
  2. 可下載的桌面程式
  3. 使用者本機啟動的網頁服務
  4. 靜態網頁加選用的獨立本機 AI 程式
- **選擇**: 靜態網頁
- **理由**: [RATIONALE NEEDED: 靜態網頁 was selected — reason not documented]
- **已知取捨（由助理在提問時說明，非使用者理由）**: 持續成本最低；本機 AI 受瀏覽器能力限制。

## AD-002 公開版 AI 的執行方式

- **Status**: 已決定（2026-10-28）
- **解決的問題**: 靜態網頁不能呼叫雲端 AI，且資料不得離開使用者裝置（FR-032）。
- **考慮過的替代方案**: (1) 瀏覽器內執行小型模型；(2) 呼叫使用者自己安裝的本機 AI 服務；(3) 公開版先不含 AI、只用程式比對；(4) 前兩者皆支援。
- **選擇**: (3) 公開版本階段不含 AI，只用程式比對；AI 說明僅限管理員模式
- **理由**: [RATIONALE NEEDED: 公開版不含 AI was selected — reason not documented]

## AD-003 公開版使用者資料保存方式

- **Status**: 部分決定（2026-10-28）；靜態加密方式待後續題
- **解決的問題**: 資料須保存三年（FR-029），且不上傳（FR-032）。
- **考慮過的替代方案**: (1) 瀏覽器內建儲存空間；(2) 使用者自選的本機加密檔；(3) 瀏覽器儲存空間加定期提醒備份。
- **選擇**: (1) 瀏覽器內建儲存空間
- **理由**: [RATIONALE NEEDED: browser built-in storage was selected — reason not documented]
- **已知取捨（由助理在提問時說明）**: 使用者清除瀏覽器資料或換瀏覽器會遺失，需配合備份匯出（FR-050）。備份檔不加密（2026-11-03，使用者確認）。理由：[RATIONALE NEEDED: unencrypted backup was selected — user's own reason not documented]
- **加密決定（2026-10-29）**: 公開版瀏覽器內資料不加密、不解鎖，僅於介面告知風險（FR-050）。理由：[RATIONALE NEEDED: no encryption was selected — reason not documented]
- **衝突解決（2026-10-29）**: 公開版只保存非敏感資料（卡名、通路、金額彙整），不保存末四碼，定義為非敏感，故與 Constitution VIII 不抵觸；管理員模式資料仍加密。
- **連帶影響**: 無加密則無法以銷毀金鑰方式讓殘留資料失效，到期刪除僅能直接刪除。

## AD-004 管理員模式形態

- **Status**: 已決定（2026-10-28）
- **解決的問題**: 管理員需輸入習慣、呼叫外部 AI、確認並發布回饋資料，且 AI 憑證不得外露（FR-033、FR-034）。
- **考慮過的替代方案**: (1) 本機網頁服務（只綁定本機位址）；(2) 桌面程式；(3) 指令列工具；(4) 同一靜態網頁中的管理員頁面。
- **選擇**: (1) 本機網頁服務（只綁定本機位址）
- **理由**: [RATIONALE NEEDED: local web service was selected — reason not documented]
- **已知取捨（由助理在提問時說明）**: 憑證可由本機服務保管、不進入網頁程式；需另外處理服務只接受本機連線。

## AD-005 憑證保管與資料入口調整

- **Status**: 已決定（2026-10-29）
- **解決的問題**: AI 憑證需登入後才可調用且不得明文保存（FR-034）；公開版資料入口需簡化並避免系統接觸原始消費紀錄。
- **考慮過的替代方案（憑證）**: (1) 金鑰檔本身加密、登入時解密；(2) 明文金鑰檔加作業系統權限（需修改 FR-034）；(3) 作業系統憑證保管庫。
- **選擇（憑證）**: (1) 金鑰檔加密，登入時由密碼衍生金鑰解密
- **理由**: [RATIONALE NEEDED: encrypted key file was selected — reason not documented]
- **資料入口調整**: 公開版改為「網站提供 prompt → 使用者自選 LLM → 彙整結果貼回網頁」加智慧提問，移除表格檔匯入；管理員模式由管理員自行解析明細、直接提供整理好的通路表格後再送外部 LLM（2026-11-03 修訂，原為本機先彙整）。理由：[RATIONALE NEEDED: 使用者表示功能過於複雜，未記載其他理由]
- **產生的衝突與解決**: FR-029／FR-030／Transaction 實體因系統不再保存逐筆明細而衝突，已於 2026-10-29 解決：三年期限適用於彙整表快照，以確認日起算；FR-030 取消；Transaction 改為 SummarySnapshot。

## AD-006 API／SDK 與存取驗證流程

- **Status**: 已決定（2026-10-29）
- **解決的問題**: 公開查詢與需保護的 LLM／憑證操作要有明確的存取邊界（FR-044 到 FR-046）。
- **使用者提出的流程**: 呼叫進入 → 檢查 accessRequirement → 需登入則驗證 accessToken → 檢查 protectionLevel（亦可匿名）→ 匿名走公開業務邏輯層；已登入者可檢查是否近端呼叫並串接 LLM → 任何失敗即拒絕。
- **理由**: [RATIONALE NEEDED: API/SDK packaging and access flow were proposed — reason not documented]
- **公開層位置**: 瀏覽器內 SDK 計算；回饋資料以公開靜態檔案發布，其他程式可讀取。與 AD-001、FR-032 一致。
- **選擇理由**: [RATIONALE NEEDED: browser SDK plus public static data was selected — reason not documented]
- **替代方案**: 伺服器上的公開 API（僅回饋規則查詢）；SDK 加公開資料介面（即本選擇）；瀏覽器內 SDK 單獨使用。

## AD-007 回饋資料靜態檔格式

- **Status**: 部分決定（2026-10-29）；頁面產生方式待後續題
- **解決的問題**: 公開靜態資料須讓瀏覽器 SDK 與其他程式可讀，登錄週期須為結構化欄位（FR-022、FR-048）。
- **考慮過的替代方案**: (1) JSON 檔含結構化欄位與版本號；(2) CSV 檔；(3) 事先產生的靜態網頁（資料嵌入頁面）。
- **選擇**: (1) JSON 檔
- **理由**: [RATIONALE NEEDED: JSON was selected — reason not documented]
- **待補**: 公開頁面（如登錄日曆）是否由同一份 JSON 於瀏覽器內產生：[TBD]

## AD-008 公開網站託管環境

- **Status**: 已決定（2026-10-29）
- **解決的問題**: 公開靜態頁面與 JSON 資料檔需讓大眾存取（FR-048）。
- **考慮過的替代方案**: (1) 免費的靜態網站託管服務；(2) 自己架設的服務器或雲端儲存空間；(3) 其他或暫不決定。
- **選擇**: (1) 免費的靜態網站託管服務；具體服務：[TBD: 尚未選定]
- **理由**: [RATIONALE NEEDED: free static hosting was selected — reason not documented]
- **張力已解決（2026-10-29）**: 使用者將本機優先的理由限縮為「使用者個人資料」範圍（無持續成本與服務依賴）；公開回饋資料與網站託管不在此範圍，依賴第三方託管服務的條款與可用性為已接受的取捨。

## AD-009 測試閘門與 CI

- **Status**: 部分決定（2026-10-29）；測試框架與掃描工具待程式語言決定後選定
- **解決的問題**: Constitution XI 要求合併前通過驗收測試與安全測試；XIII 要求 Validator 可獨立測試。
- **考慮過的替代方案**: (1) 本機腳本為主，託管 CI 同跑同一檔腳本；(2) 只用本機腳本與提交前檢查；(3) 只用託管平台 CI。
- **選擇**: (1) 所有檢查寫成單一本機可執行腳本，託管平台 CI 執行同一腳本，檢查規則只有一份
- **理由**: [RATIONALE NEEDED: local script plus hosted CI was selected — reason not documented]
- **前置條件**: 需先建立版本控制與程式碼託管（目前專案不是 git repository）。程式碼託管平台：GitHub（2026-11-03，使用者決定）；託管 CI 執行同一支 `scripts/check`。選擇理由：[RATIONALE NEEDED: GitHub was selected — reason not documented]；建立版本控制庫：[TBD: 尚未執行，見 tasks.md T001]
- **待補**: 單元／整合測試框架、SAST、相依套件掃描、secrets 掃描的工具：語言已於 AD-010 決定為本機 Python 加瀏覽器 JavaScript，工具須兩邊皆涵蓋。2026-11-03 使用者確認：瀏覽器端不使用 TypeScript；Python 測試使用 pytest；JavaScript 測試使用 Node.js 內建測試功能；SAST 使用 Semgrep（可在本機腳本中執行，不依賴託管平台）；Python 相依套件掃描使用 pip-audit；JavaScript 相依套件掃描使用 npm audit；secrets 掃描使用 gitleaks。版本（2026-11-03，使用者決定）：Python 3.14、Node.js 26；理由：[RATIONALE NEEDED: Python 3.14 and Node.js 26 were selected — reason not documented]。pytest、Semgrep、pip-audit、gitleaks 的版本：[TBD: 建立 repo 時查詢最新版後決定，見 tasks.md T001]

## AD-010 程式語言與 Validator 實作形式

- **Status**: 已決定（2026-11-03）
- **解決的問題**: 公開層 SDK 在瀏覽器內執行（AD-006）、管理員層在本機服務執行（AD-004）；Constitution XIII 要求安全驗證規則只有一份。使用者希望本機端使用 Python。
- **考慮過的替代方案**: (P1) Validator 全用 Python，瀏覽器以 WebAssembly 版 Python 執行環境執行；(P2) 規則檔加各環境薄執行器，共用一致性測試案例；(P3) 全用 JavaScript／TypeScript；(P4) 輸入驗證兩處各自獨立實作（與 XIII 抵觸）。
- **選擇**: (P2) 驗證規則寫成一份規則檔；本機服務用 Python 執行器，瀏覽器用 JavaScript 執行器；兩者通過同一組一致性測試案例。
- **理由**: 使用者希望本機端使用 Python（使用者提供）。其他理由：[RATIONALE NEEDED: rules file plus thin evaluators was selected — reason beyond Python preference not documented]
- **共用範圍（使用者確認 2026-11-03）**: 兩處都執行的只有輸入驗證；存取檢查僅在本機服務。
- **連帶修改**: Constitution XIII 措辭修訂，版本 1.1.0 → 1.2.0。
- **已知取捨（由助理在提問時說明，非使用者理由）**: 兩份執行器的邊界行為可能不一致，僅能靠一致性測試案例擋；CI 要跑兩套工具鏈。
- **待補**: 規則檔格式與一致性測試案例格式（2026-11-03，使用者確認）：規則檔為 JSON 純資料，使用固定詞彙（必填、型別、範圍、列舉、比對模式、與使用者設定門檻比較）；比對模式限定 Python 與 JavaScript 共同可用的子集，並納入一致性測試案例；規則中的金額一律為整數新台幣；一致性測試案例使用同樣的 JSON 格式，每個案例含輸入與預期結果（通過或拒絕加原因代碼）。固定詞彙清單與共同子集的範圍：[TBD: 實作 T010 時定義]。理由：[RATIONALE NEEDED]

## 待決定（依序提問）

- （無尚未提問的項目；AD-010 待使用者之後決定）
