---

description: "Task list for 信用卡消費匯入與通路回饋最佳化"
---

# Tasks: 信用卡消費匯入與通路回饋最佳化

**Input**: Design documents from `/specs/001-card-reward-optimizer/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Tests**: 本專案**必須**包含測試任務。Constitution XI 要求所有功能先有驗收測試與安全測試才能合併；各 story 的測試任務須在實作前完成並確認失敗。測試框架依 T003 選定；檔案副檔名依 T003 決定（下列路徑以 JavaScript／Python 為預設，若 T003 選 TypeScript 則改副檔名）。

**Organization**: 依 user story 分組，使 story 可獨立實作與測試。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可平行（不同檔案、無相依）
- **[Story]**: 所屬 user story
- **⚠️ DECISION**: 需要使用者決定的任務。助理不得代選（Constitution I）；結果須寫回所列文件，並附理由或 `[RATIONALE NEEDED]`。未完成者會擋住標明的後續任務。

## Path Conventions

依 plan.md 的專案結構：`rules/`、`conformance/`、`web/`（公開版）、`admin/`（管理員本機服務）、`data/`、`scripts/`。

---

## Phase 1: Setup（共用基礎）

**Purpose**: 版本控制、決定未決技術項目、專案骨架、單一檢查腳本

- [ ] T001 ✅ 平台已決定為 GitHub（2026-11-03，AD-009）；✅ 已完成：git 庫已連到 GitHub 並推送 `main`（commit 041aab9）、`.gitignore` 已建立、工具版本已查詢並寫入 AD-009。**待執行**：依 T003 建立相依檔並鎖定版本。**Constitution XI 的前置條件，擋住 T008 及所有合併**
- [ ] T002 ⚠️ DECISION **TLS**：決定管理員本機服務的本機回送連線是否須使用 TLS（plan.md 待決定閘門第 1 項、research.md R-01）。若須 TLS，記錄於 AD-004 並保留 T068；若豁免，修訂 `.specify/memory/constitution.md` 原則 VIII（依 Governance 記錄理由、更新版本與 Last Amended 日期）並在 AD-004 與 `contracts/admin-local-service.md` 移除 `[CONFLICT?]`。**擋住 T067、T068**
- [x] T003 ✅ 已決定（2026-11-03，AD-009、AD-010）：Python 3.14、Node.js 26、不用 TypeScript、pytest、Node.js 內建測試、Semgrep、pip-audit、npm audit、gitleaks；工具版本於 T001 建 repo 時查詢後確認。副檔名使用 `.js` 與 `.py`
- [x] T004 ✅ 已決定（2026-11-03）：規則檔與一致性測試案例皆為 JSON，固定詞彙、比對模式限共同子集、金額為整數新台幣；已寫入 `contracts/validator-contract.md` 與 Constitution XIII。固定詞彙清單與共同子集範圍於 T010 定義
- [ ] T005 ⚠️ DECISION 決定管理員加密資料的演算法與金鑰管理（R-02）；寫入 Constitution VIII 與 AD-005。**擋住 T069、T070、T071**
- [x] T006 依 plan.md 建立目錄骨架（各目錄以 `.gitkeep` 佔位，`admin/src/ui/` 待 T056）：`rules/`、`conformance/`、`web/src/{sdk,validator,storage,ui}`、`web/tests/`、`admin/src/{api,validator,credentials,llm,publishing}`、`admin/tests/`、`data/`、`scripts/`
- [x] T007 ✅ 已建立 `scripts/check.py`（PASS／FAIL／SKIP／WARN；`CHECK_STRICT=1` 時 SKIP 視同失敗）與 `requirements-dev.txt`。Semgrep 已隔離於獨立環境（pip-audit 對專案環境通過，見 AD-009）；gitleaks 未安裝、Semgrep 規則集未決定，目前以 SKIP 顯示，CI 的嚴格模式下會失敗，需在 T008／T009 前處理。（原任務：建立單一本機檢查腳本骨架 `scripts/check`（副檔名依 T003 與作業系統），依序呼叫 Python 測試、JavaScript 測試、一致性測試、掃描；檢查規則只有這一份（AD-009）（依 T003、T006））
- [ ] T008 [P] 設定託管 CI，**只執行** `scripts/check`，不另寫檢查規則（AD-009）（依 T001、T007）
- [ ] T009 [P] 在 `scripts/check` 中接入 secrets 掃描、相依套件掃描、SAST（依 T003、T007）

---

## Phase 2: Foundational（阻擋所有 story）

**Purpose**: Validator 規則檔與兩個執行器、一致性測試、存取宣告、儲存與共用模型

**⚠️ CRITICAL**: 此階段完成前不得開始任何 user story

- [x] T010 ✅ 詞彙已由使用者確認（2026-11-03）；比對模式子集於 T011／T012 為求兩邊一致而收窄，見 `rules/validator-rules.json`。建立規則檔骨架，含預設拒絕：未明確允許的請求一律拒絕，於 `rules/`（檔名與格式依 T004）（Constitution XIII、FR-046）
- [x] T011 [P] 實作瀏覽器端規則執行器，只讀規則檔，禁止自帶規則，於 `web/src/validator/executor.js`（依 T010）
- [x] T012 [P] 實作本機端 Python 規則執行器，只讀規則檔，禁止自帶規則，於 `admin/src/validator/executor.py`（依 T010）
- [x] T013 [P] 建立瀏覽器端一致性測試載入器，載入 `conformance/` 同一組案例，於 `web/tests/conformance.test.js`（依 T003、T004）
- [x] T014 [P] 建立 Python 一致性測試載入器，載入 `conformance/` 同一組案例，於 `admin/tests/test_conformance.py`（依 T003、T004）
- [x] T015 ✅ 另含 `conformance/vocabulary.json`（41 項，涵蓋全部 13 個詞彙與兩邊易不一致的邊界）。建立預設拒絕的一致性案例（未宣告規則、未知請求皆拒絕），於 `conformance/deny-by-default.*`；兩個載入器皆須通過（依 T011 至 T014）
- [x] T016 ✅ 登錄本身不做允許／拒絕判斷，只宣告並把事實交給 Validator 的 `access` 規則集；該規則集的正式規則留給 T065，在那之前一律預設拒絕。實作操作存取宣告登錄：每個操作宣告 accessRequirement 與 protectionLevel，未宣告者拒絕，不由呼叫端宣稱，於 `web/src/sdk/access.js`（FR-044、FR-046；依 T011）
- [x] T017 ✅ 每次讀寫都經 Validator 的 `stored-*` 規則集（允許清單，故末四碼、卡號、CVV、逐筆明細都存不進去）；儲存 API 目前用 localStorage，AD-003 未指定，標 `[TBD]`；長度與數量上限為佔位值，spec 未定義。實作瀏覽器儲存模組：僅存非敏感資料（卡名、通路、金額彙整），**公開版 MUST NOT 保存末四碼**，資料不加密，於 `web/src/storage/store.js`（FR-016、AD-003）
- [x] T018 ✅ 內部 id 與 `catchall`（無腦刷）為助理擬定。實作共用模型與預設 11 個通路（Card、Channel、ChannelCardMapping、SummarySnapshot、HabitEntry），欄位約束依 data-model.md，於 `web/src/sdk/models.js` 與 `web/src/sdk/default-channels.js`

**Checkpoint**: 規則檔、兩個執行器與一致性測試可運作

---

## Phase 3: User Story 1 - 匯入消費清單並建立對照表（Priority: P1）🎯 MVP

**Goal**: 公開訪客以「貼上 LLM 彙整結果」或「智慧提問」建立持卡清單與「通路 × 現有卡」對照表

**Independent Test**: 貼上測試用彙整結果，各通路月均與貼上內容 100% 一致，格式錯誤測試集 100% 被拒絕；含卡號或 CVV 者被拒絕或遮罩；智慧提問的未知與略過標示為未知（SC-001、SC-002、SC-009）

### 決定與測試（實作前）

- [x] T019 [US1] ✅ 已決定（2026-11-03）：格式為 JSON、總額、不含回饋率，已寫入 `contracts/paste-format.md`；欄位名稱與三個邊界情況為 `[INFERRED]` 待確認。（原任務：定義「貼上的彙整結果」固定格式（欄位、幣別、涵蓋期間表示），寫入新檔 `specs/001-card-reward-optimizer/contracts/paste-format.md`；同時決定 Edge Cases 的 `[TBD]`：重複貼上、退款與分期、預覽中如何發現與修正錯誤數字，寫回 spec.md。原本擋住 T020、T024、T025，現已解除）
- [x] T020 [P] [US1] 建立貼上驗證的一致性案例：格式錯誤、欄位缺漏、數值超出範圍、非新台幣、完整卡號、CVV、可疑網頁語法、單筆大額項目金額未達門檻（預設 10,000 元，單筆判定）、涵蓋期間不足三個月（應提示但允許繼續），於 `conformance/paste-input.*`（FR-025、FR-015、FR-018、FR-040、FR-002；依 T019）
- [x] T021 [P] [US1] 測試匯入流程：驗證通過→預覽→使用者確認才寫入；各通路月均與貼上內容 100% 一致；無法歸類金額歸入「無腦刷」；無消費通路為 0 或標示無資料，於 `web/tests/paste-import.test.js`（SC-001；依 T003）
- [x] T022 [P] [US1] 測試智慧提問：略過或「不知道」標示為未知且不以預設值填補；來源標示「使用者自述估算」，於 `web/tests/smart-questions.test.js`（FR-023、FR-024）
- [x] T023 [P] [US1] 測試儲存隱私：公開版儲存內容不含末四碼、完整卡號、CVV；不含逐筆明細，於 `web/tests/storage-privacy.test.js`（SC-002）

### 實作

- [x] T024 [US1] ✅ 另新增兩個檢查 `noCardNumber`（13 位以上連續數字，容許單一空格或連字號）與 `plainText`（拒絕 `<`、`>` 與控制字元），因為比對模式為求兩邊一致已禁用否定與非 ASCII，無法表達；兩個執行器與 `conformance/text-checks.json` 同步更新。 在規則檔加入貼上內容的驗證規則（格式、欄位、數值範圍、新台幣、卡號與 CVV 偵測、可疑內容、大額項目門檻），於 `rules/`（依 T019、T020）
- [x] T025 [P] [US1] ✅ prompt 以 JavaScript 常數實作（`web/src/ui/prompt.js`），沒有另設 `.txt`，才能在 Node 測試；prompt 內的範例由測試對照真實的 `paste-input` 規則，避免格式漂移。 建立版本化 prompt 並完整顯示：要求 LLM 僅輸出固定格式、不重複輸出逐筆明細、金額僅以新台幣、單筆達門檻者獨立列出、**不得索取卡號與姓名**；網站須提醒使用者自行遮蔽敏感資訊，並說明交給所選 LLM 後的處理不受本系統控制，於 `web/src/ui/prompt-v1.txt` 與 `web/src/ui/prompt.js`（FR-039、FR-040；依 T019）
- [x] T026 [US1] 實作匯入管線：驗證→預覽→確認→寫入，不寫入不完整資料，於 `web/src/sdk/import.js`（FR-001、FR-025；依 T017、T018、T024）
- [x] T027 [P] [US1] 實作通路歸類、「無腦刷」、使用者手動調整、自訂通路（名稱與別名），於 `web/src/sdk/channels.js`（FR-004、FR-006、FR-031；依 T018）
- [x] T028 [US1] 建立持卡清單與通路 × 卡對照表，標示資料來源（匯入計算／自述估算），於 `web/src/sdk/mapping.js`（FR-003、FR-005、FR-024；依 T026、T027）
- [x] T029 [P] [US1] 實作智慧提問：依通路逐題，可略過，於 `web/src/sdk/smart-questions.js`（FR-023、SC-009；依 T018）
- [x] T030 [US1] 實作彙整表快照保存：記錄確認日期，三年期限自確認日起算；不保存逐筆明細；大額項目僅含類別與金額，於 `web/src/sdk/snapshot.js`（FR-029、FR-027；依 T026）
- [x] T031 [US1] 實作備份匯出（不加密，匯出前提示明文）、一鍵清除、完整刪除，於 `web/src/storage/backup.js`（FR-017、FR-050；依 T017）
- [x] T032 [US1] ⚠️ 尚未在真實瀏覽器驗證（邏輯已由 `web/tests` 涵蓋，畫面只是接線）；另建 `web/index.html` 與 `web/src/main.js`。發布時必須把 `rules/validator-rules.json` 放到與 `index.html` 同一層（T085）。 建立貼上與智慧提問的畫面，於 `web/src/ui/import-page.js`（依 T025、T026、T029）
- [x] T033 [P] [US1] ✅ 以 `web/tests/ui-safety.test.js` 靜態掃描所有網頁原始碼，禁止會把文字當標記或程式碼的 API，並限制除載入規則檔外不得有任何網路請求。 建立資料保存風險告知（未加密、同瀏覽器可讀、清除會遺失）與安全渲染：貼上內容一律當文字顯示，不以網頁語法渲染，於 `web/src/ui/risk-notice.js` 與 `web/src/ui/render.js`（FR-050、FR-018）

**Checkpoint**: User Story 1 可獨立運作與測試（MVP）

---

## Phase 4: User Story 2 - 查詢通路應用哪張卡與是否領券（Priority: P2）

**Goal**: 輸入通路與支付方式，回傳該用已持有的哪張卡、是否需領券、月上限說明與各卡指定商家

**Independent Test**: 使用固定市場回饋資料，推薦卡與預先標註最佳卡一致率 100%（SC-003）；未知欄位標示未知

### 決定與測試（實作前）

- [x] T034 [US2] ⚠️ DECISION（2026-11-04 完成；R-14 商家比對見 data-model.md）決定 RewardRule 細節：回饋金額上限的計算公式（含分段回饋率）與跨通路共用上限（R-12）、支援的支付方式清單、可疊加的資料表示、「不需切換權益」與「回饋穩定」的表示與金額門檻（R-13）、商家名稱比對方式（R-14）；寫入 `specs/001-card-reward-optimizer/data-model.md` 與 `contracts/published-reward-data.md`。**擋住 T035 至 T045**
- [x] T035 [P] [US2] 建立公開 JSON schema 的一致性案例：版本號、必要欄位、缺漏、無法判斷欄位為未知，於 `conformance/published-data.*`（FR-048；依 T034）
- [x] T036 [P] [US2] 測試推薦排序：持有卡→最高有效回饋（依所選支付方式，不疊加，除非公告載明）→月上限僅說明不參與排序→登錄／指定通路→便利性；逐項依序比較，不加權，於 `web/tests/query-ordering.test.js`（FR-051、FR-054）
- [x] T037 [P] [US2] 測試月上限門檻由程式計算、領券「下一次開放日」由程式依登錄週期與今日日期計算、領券狀態四種（需領券／已領／無需領券／未知），於 `web/tests/cap-coupon.test.js`（FR-053、FR-022）
- [x] T038 [P] [US2] 測試指定商家：條列各卡指定商家、自由輸入商家名稱的比對、輸入內容當資料不執行、未知標示未知，於 `web/tests/merchants.test.js`（FR-055、FR-018、FR-008）

### 實作

- [x] T039 [US2] 在規則檔加入公開回饋資料的 schema 規則，於 `rules/`（依 T034、T035）
- [x] T040 [US2] 建立固定測試資料集（合成資料，明確標示非真實回饋）與預先標註的最佳卡，於 `web/tests/fixtures/reward-data.json`（SC-003）
- [x] T041 [US2] 實作公開回饋資料載入與 schema 驗證，失敗或過期時回報資料狀態，於 `web/src/sdk/reward-data.js`（FR-048；依 T039）
- [x] T042 [US2] 實作通路查詢與推薦排序（FR-051、FR-054），於 `web/src/sdk/query.js`（依 T041、T028）
- [x] T043 [P] [US2] 實作月上限門檻說明（依回饋率與回饋金額上限由程式計算，不追蹤已用額度；上限未知標示未知），於 `web/src/sdk/cap.js`（FR-053；依 T034）
- [x] T044 [P] [US2] 實作領券狀態、下一次開放日計算、使用者本機標記「已領」；系統不代使用者領券，於 `web/src/sdk/coupon.js`（FR-022）
- [x] T045 [P] [US2] 實作指定商家比對，於 `web/src/sdk/merchants.js`（FR-055；依 T034）
- [x] T046 [P] [US2] 實作使用者本機覆寫回饋規則，標示「使用者修正」且不上傳，於 `web/src/sdk/override.js`（FR-021、FR-032）
- [x] T047 [US2] 建立查詢畫面，顯示來源、查證日期、免責聲明，無法判斷欄位顯示「官網沒有寫」或未知，於 `web/src/ui/query-page.js`（FR-035、FR-036、FR-026；依 T042 至 T045）

**Checkpoint**: User Stories 1 與 2 皆可獨立運作

---

## Phase 5: User Story 3 - 信用卡健檢（Priority: P3）

**Goal**: 以已發布的回饋資料與使用者通路消費比對，評估是否有更優的卡；全部由程式在本機計算

**Independent Test**: 固定市場資料與使用者消費結構，回饋差額與人工試算一致；金額與程式獨立重算 100% 一致（SC-004）

- [ ] T048 [US3] ⚠️ DECISION 決定已發布資料「過期」的時間長度與提示方式（Edge Cases `[TBD]`），寫回 spec.md。**擋住 T050 的過期判斷**
- [ ] T049 [P] [US3] 測試健檢：逐通路比較與回饋差額、現有卡皆最佳時回報無需更換、資料失敗或過期時不給確定性結論，於 `web/tests/health-check.test.js`（FR-009、SC-004）
- [ ] T050 [US3] 實作健檢，標示資料來源與取得時間，金額一律由程式計算，於 `web/src/sdk/health-check.js`（FR-009、FR-010、FR-013；依 T042、T048）
- [ ] T051 [US3] 建立健檢畫面，於 `web/src/ui/health-page.js`（依 T050）

**Checkpoint**: User Stories 1 至 3 可獨立運作

---

## Phase 6: User Story 4 - 新卡評估與情境推薦（Priority: P4）

**Goal**: 使用者輸入想辦的卡，程式試算是否值得、可替換的通路與優缺點；並支援情境推薦與候選卡挑選

**Independent Test**: 輸入一組新卡回饋條件，可替換通路與回饋差額和人工試算一致；缺漏欄位被指出而不自行假設

- [ ] T052 [P] [US4] 測試新卡評估與情境推薦：年費、門檻、上限納入試算；結論值得／不值得／視情況；缺漏欄位被指出，於 `web/tests/card-evaluation.test.js`（FR-011、FR-012、FR-047）
- [ ] T053 [US4] 實作新卡試算，於 `web/src/sdk/card-evaluation.js`（FR-011、FR-012、FR-013；依 T042）
- [ ] T054 [US4] 實作情境推薦與候選卡挑選，沿用健檢與新卡評估的比對與限制，於 `web/src/sdk/scenario-recommend.js`（FR-047；依 T050、T053）
- [ ] T055 [US4] 建立新卡評估與情境推薦畫面，於 `web/src/ui/evaluate-page.js`（依 T053、T054）

---

## Phase 7: User Story 5 - 管理員模式（Priority: P5）

**Goal**: 管理員在本機登入，提供自行整理好的通路表格，確認後送外部 LLM；確認並發布回饋資料草稿

**Independent Test**: 管理員登入後可取得 AI 分析；非管理員、非本機、無效令牌皆被拒絕；送出內容不含逐筆明細與完整卡號（SC-008、SC-012）

### 決定與測試（實作前）

- [ ] T056 [US5] 在 `specs/001-card-reward-optimizer/plan.md` 的專案結構補上 `admin/src/ui/`（管理員畫面），並標示為 `[INFERRED]` 待確認
- [ ] T057 [US5] ⚠️ DECISION 忘記密碼時如何確認操作者為管理員本人（R-03）、憑證閒置清除時機（R-09）；寫入 spec.md FR-033、FR-034。**擋住 T069、T071**
- [ ] T058 [US5] ⚠️ DECISION 「內容相同」的判定方式與已確認狀態的有效範圍（R-07）、大額驗證不通過時拒絕整份或僅標示該項（R-08）；寫入 spec.md FR-028、FR-040。**擋住 T073**
- [ ] T059 [US5] ⚠️ DECISION 回饋資料蒐集的具體作業流程與各銀行更新週期（R-11）；寫入 spec.md FR-021。**擋住 T075**
- [ ] T060 [P] [US5] 建立存取控制一致性案例：無 token、過期 token、竄改 protectionLevel、非近端呼叫、匿名呼叫受保護操作，於 `conformance/access-control.*`（FR-044 至 FR-046、SC-012；依 T004）
- [ ] T061 [P] [US5] 測試連線限制：僅本機連線、請求來源檢查、每次登入一次性令牌、其他網頁呼叫被拒，於 `admin/tests/test_server_limits.py`（FR-041）
- [ ] T062 [P] [US5] 測試憑證：憑證檔加密、登入時解密、只讀取管理員指定的單一檔案、不出現在日誌與畫面、閒置清除、重設密碼後舊憑證檔無法解密，於 `admin/tests/test_credentials.py`（FR-034、FR-033）
- [ ] T063 [P] [US5] 測試送出稽核：送出內容不含逐筆明細、商家明細、完整卡號；首次確認、內容變動再確認；AI 安全測試集（惡意指令文字、金流要求）中執行金流動作與遵從嵌入指令次數為 0，於 `admin/tests/test_llm_send.py`（FR-019、FR-028、FR-014、SC-005、SC-008）
- [ ] T064 [P] [US5] 測試草稿流程：待確認→已發布／退回、無法判斷欄位顯示「官網沒有寫」、來源與查證日期必填，於 `admin/tests/test_publishing.py`（FR-021、FR-026）

### 實作

- [ ] T065 [US5] （瀏覽器部分 `access-public` 已於 2026-11-03 提前完成，剩 `access-admin`）在規則檔加入存取檢查規則，於 `rules/`（依 T060）
- [ ] T066 [P] [US5] 實作不含個人資料的拒絕紀錄，錯誤回應不洩漏內部細節，於 `admin/src/api/deny_log.py`（FR-046）
- [ ] T067 [US5] 實作本機網頁服務：只綁定本機位址、來源檢查、一次性令牌、存取宣告檢查，於 `admin/src/api/server.py`（FR-041、FR-044、FR-045；依 T002、T012、T016、T061、T065、T066）
- [ ] T068 [US5] 依 T002 的結果實作本機連線 TLS；若 T002 決定豁免，標記本任務為不適用，於 `admin/src/api/tls.py`（Constitution VIII）
- [ ] T069 [US5] 實作本機解鎖驗證，於 `admin/src/credentials/unlock.py`（FR-033；依 T005、T057）
- [ ] T070 [US5] 實作憑證檔載入：登入後由管理員指定位置、只讀該單一檔案、以密碼衍生金鑰解密、僅存記憶體、不入日誌，於 `admin/src/credentials/keyfile.py`（FR-034；依 T005、T062、T069）
- [ ] T071 [US5] 實作忘記密碼重設：舊憑證檔失效，須重新輸入並加密保存，於 `admin/src/credentials/reset.py`（FR-033；依 T057、T070）
- [ ] T072 [P] [US5] 實作載入管理員自行整理好的通路表格，系統不解析原始明細，於 `admin/src/llm/table.py`（FR-042）
- [ ] T073 [US5] 實作送出前檢視與確認閘門，於 `admin/src/llm/confirm.py`（FR-028；依 T058、T072）
- [ ] T074 [US5] 實作外部 LLM 呼叫：僅限已登入且近端；僅唯讀分析，不得執行金流動作；回傳結果直接帶入，於 `admin/src/llm/client.py`（FR-019、FR-014、FR-042、FR-045；依 T070、T073）
- [ ] T075 [P] [US5] 實作回饋資料草稿蒐集，於 `admin/src/publishing/collect.py`（FR-021；依 T059）
- [ ] T076 [US5] 實作草稿審核與狀態轉換，於 `admin/src/publishing/review.py`（依 T064、T075）
- [ ] T077 [US5] 實作發布：產生公開 JSON 至 `data/`，每筆含來源與查證日期，僅含公開資訊，於 `admin/src/publishing/publish.py`（FR-048、FR-026；依 T076）
- [ ] T078 [US5] 建立管理員畫面，於 `admin/src/ui/`（依 T056、T067、T073、T076）

**Checkpoint**: 全部 user story 可獨立運作

---

## Phase 8: Polish 與跨切面

- [ ] T079 ⚠️ DECISION 到期刪除的執行時機與機制（R-10）；寫入 spec.md FR-029。**擋住 T080**
- [ ] T080 實作快照到期：到期前通知並提供匯出，到期後永久刪除；最新使用中通路表不受影響，公開版於 `web/src/storage/retention.js`（FR-029；依 T030、T079）
- [ ] T081 [P] 建立網路請求稽核測試：完整操作公開版流程，含使用者個人消費資料的對外請求為 0，於 `web/tests/network-audit.test.js`（SC-010、FR-032）
- [ ] T082 [P] 建立公開部署內容稽核腳本，檢查管理員程式、AI 憑證、可觸發 AI 呼叫的途徑出現次數為 0，並接入 `scripts/check`，於 `scripts/audit-deploy`（SC-011）
- [ ] T083 為 FR-041 至 FR-055 補上 Given／When／Then 驗收情境，寫入 `specs/001-card-reward-optimizer/spec.md`（checklists/requirements.md MISSING 1）
- [ ] T084 ⚠️ DECISION SC-006、SC-013、SC-014、SC-015 的量測方式（R-15）；SC-014 目前因不保存逐筆明細而無法量測，需決定改指標或接受人工抽查；寫回 spec.md
- [ ] T085 ⚠️ DECISION 選定公開網站託管服務（R-06）並設定僅發布 `web/` 與 `data/`（AD-008）
- [ ] T086 ⚠️ 由使用者補齊 AD-001 至 AD-010、AD-003 備份不加密與 Assumptions 的 `[RATIONALE NEEDED]`；助理不得代寫
- [ ] T087 ⚠️ DECISION 決定 Constitution 的 `[TBD]`：程式碼審查流程與核准者、修訂核准者、效能目標與 SLA、其他合規要求
- [ ] T088 安全強化審查：公開 JSON 完整性（是否簽章，research.md 風險 3）、兩個執行器行為差異、貼上內容注入
- [ ] T089 依 `quickstart.md` 執行全部 10 個驗證情境
- [ ] T090 重新驗證 `specs/001-card-reward-optimizer/checklists/requirements.md`

---

## Dependencies & Execution Order

### Phase 依賴

- **Setup（Phase 1）**: 可立即開始；其中 DECISION 任務 T001 至 T005 需使用者回覆，各自擋住的任務已於其描述標出
- **Foundational（Phase 2）**: 依賴 T004、T006；**擋住所有 story**
- **User Stories（Phase 3 至 7）**: 皆依賴 Phase 2；可依優先順序或平行進行
- **Polish（Phase 8）**: 依賴所有欲交付的 story

### Story 依賴

- **US1（P1）**: Phase 2 之後即可開始，無其他 story 相依
- **US2（P2）**: 需 US1 的對照表（T028）；其 JSON 載入與排序可與 US1 平行開發
- **US3（P3）**: 依賴 US2 的查詢（T042）
- **US4（P4）**: 依賴 US2、US3
- **US5（P5）**: 與公開版 story 彼此獨立，僅共用規則檔；發布的 JSON（T077）是 US2 資料的來源

### 每個 story 內

- 測試先寫並確認失敗，再實作（Constitution XI）
- 模型→服務→畫面

### 平行機會

- Phase 1：T008、T009
- Phase 2：T011 至 T014、T017、T018
- US1 測試：T020 至 T023；實作：T025、T027、T029、T033
- US2 測試：T035 至 T038；實作：T043 至 T046
- US5 測試：T060 至 T064
- US5 與公開版 story 可由不同人平行

## Parallel Example: User Story 1

```text
# 測試一起啟動：
Task: "建立貼上驗證的一致性案例於 conformance/paste-input.*"
Task: "測試匯入流程於 web/tests/paste-import.test.js"
Task: "測試智慧提問於 web/tests/smart-questions.test.js"
Task: "測試儲存隱私於 web/tests/storage-privacy.test.js"
```

---

## Implementation Strategy

### MVP First（只做 User Story 1）

1. 完成 Phase 1：T001 至 T004（T005 可等到 US5）、T006 至 T009
2. 完成 Phase 2
3. 完成 Phase 3（含 T019 決定）
4. **停下來驗證**：依 quickstart.md 情境 1、2、5 獨立測試

### 增量交付

1. Setup + Foundational → 基礎就緒
2. US1 → 驗證 → 部署（MVP）
3. US2 → 驗證；US3、US4 依序
4. US5 可與公開版 story 平行進行；US2 的真實資料依賴 US5 發布
5. 每個 story 加值而不破壞前面的 story

### 需使用者回覆的 DECISION 任務一覽

T001、T002（TLS）、T003、T004、T005、T019、T034、T048、T057、T058、T059、T079、T084、T085、T086、T087。其中開工前最少需要 **T001、T003、T004**；**T002（TLS）** 在做 US5 前決定即可。

## 未來工作（已決定延後，不在目前任務範圍）

- **Validator 新增「上層存在時才必填」詞彙（例如 `requiredIfParent`）**（使用者 2026-11-04 決定先接受現況、延後）：目前詞彙無法表達此條件，指定商家的 `name`、`validPeriod` 起訖日、`registrationCycle.kind` 漏填，驗證器會放行，消費端程式一律視為未知。同時可評估是否新增「陣列至少一筆」詞彙（`tiers: []` 現在也會放行）。新增詞彙須使用者確認，兩個執行器與一致性案例同步更新。建議在 US5（管理員發布流程）時重新評估。見 `contracts/validator-contract.md`。

## Notes

- 標示 ⚠️ DECISION 的任務由使用者決定，助理只整理選項並記錄，不代選
- [P] 任務＝不同檔案、無相依
- 副檔名與測試框架依 T003 調整
- 每個任務或邏輯群組完成後提交（需 T001 先建立版本控制）
