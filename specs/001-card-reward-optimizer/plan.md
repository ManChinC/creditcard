# Implementation Plan: 信用卡消費匯入與通路回饋最佳化

**Branch**: `001-card-reward-optimizer` | **Date**: 2026-11-03 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-card-reward-optimizer/spec.md`

**Note**: 依 Constitution I，使用者未決定的技術選型、版本號、效能數字一律標 `[TBD]`；本 plan 不代為選定。已決定的選擇記載於 [architecture-decisions.md](architecture-decisions.md)（AD-001 至 AD-010）。

## Summary

提供兩種執行形態：

- **公開版**：靜態網頁加瀏覽器內 SDK（AD-001、AD-006）。訪客以「網站提供的 prompt 加自選 LLM 貼回彙整結果」或「智慧提問」建立通路 × 卡對照表，由程式比對已發布的公開 JSON 回饋資料，提供通路查詢、健檢、新卡試算與情境推薦。不含 AI（AD-002、FR-038），個人資料只存在瀏覽器內建儲存空間且不加密（AD-003、FR-050），不上傳（FR-032）。
- **管理員模式**：只綁定本機位址的網頁服務（AD-004、FR-041），本機解鎖驗證，AI 憑證檔加密、登入後解密（AD-005、FR-034）。管理員提供自行整理好的通路表格，確認後送外部 LLM（FR-019、FR-028、FR-042），並確認、發布回饋資料草稿成公開 JSON（FR-021、FR-048）。

所有安全驗證規則寫成一份規則檔，由本機 Python 執行器與瀏覽器 JavaScript 執行器分別執行，並通過同一組一致性測試案例（AD-010、Constitution XIII v1.2.0）。

## Technical Context

**Language/Version**: 本機服務使用 Python，瀏覽器端使用 JavaScript（AD-010）；版本：`[TBD: 版本未決定]`；瀏覽器端是否使用 TypeScript：`[TBD: 未決定]`

**Primary Dependencies**: `[TBD: 本機網頁服務框架、前端框架或無框架、金鑰衍生與加密函式庫尚未選定]`

**Storage**: 公開版為瀏覽器內建儲存空間（不加密，AD-003）；管理員模式為加密的本機檔案，格式與金鑰管理 `[TBD: Constitution VIII 尚未決定]`；公開回饋資料為 JSON 靜態檔（AD-007）

**Testing**: `[TBD: Python 與 JavaScript 的測試框架、SAST、相依套件掃描、secrets 掃描工具尚未選定（AD-009）]`；檢查寫成單一本機可執行腳本，託管 CI 執行同一腳本（AD-009）

**Target Platform**: PC（Assumptions）；支援的瀏覽器與作業系統：`[TBD: 未指定]`

**Project Type**: 靜態網站（公開）加本機網頁服務（管理員）加共用規則檔

**Performance Goals**: 智慧提問每次回應 30 秒內為目標，非硬性上限（SC-009）；平均每次決策時間低於 10 秒（SC-013，起訖點 `[TBD]`）；其餘 `[TBD: SC-006 與 SLA 未提供]`

**Constraints**:
- 公開模式不得傳送或儲存任何個人消費資料（FR-032、SC-010）
- 管理員模式與 AI 憑證不得出現在公開部署內容（FR-034、SC-011）
- 管理員本機服務僅接受本機連線（FR-041）
- 金額一律由程式計算，不由 LLM 計算（FR-013）
- 僅新台幣，不做外幣換算（Assumptions）
- 個人資料部分無持續成本與服務依賴（Assumptions）

**Scale/Scope**: 初期銀行 4 間（國泰、永豐、富邦、台新）、預設通路 11 項、使用者自訂通路；基準資料筆數 `[TBD: 未定義]`

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原則 | 評估 | 說明 |
|---|---|---|
| I 僅依據已提供資訊 | 通過 | 未決事項皆標 `[TBD]`，本 plan 無自行選定的技術名稱、版本或數字。目錄名稱為依 AD-004／006／010 推得，標 `[INFERRED]` |
| II 矛盾顯性化 | **待決定** | 見下方「待決定的閘門項目」第 1 項 |
| III 技術決策附理由 | 通過（帶標記） | AD-001 至 AD-010 理由欄為 `[RATIONALE NEEDED]`，依原則 III 允許 |
| IV 章節結構固定 | 通過 | 沿用 plan 範本章節 |
| V、VI 審查與輸出格式 | 通過 | |
| VII 資料最小化 | 通過 | 不存完整卡號與 CVV；公開模式不存末四碼（FR-015、FR-016）；Validator 規則含卡號偵測（見 contracts/validator-contract.md） |
| VIII 傳輸與儲存安全 | **待決定** | 公開模式資料以「非敏感」定義免加密；管理員資料加密，演算法與金鑰管理 `[TBD]`；TLS 見下方第 1 項 |
| IX AI 唯讀 | 通過 | 介面只有分析類操作，無金流動作（contracts/sdk-operations.md） |
| X 金額由程式計算 | 通過 | 回饋差額、月上限門檻、大額驗證皆由程式（FR-013、FR-040、FR-053） |
| XI 測試門檻 | **待決定** | 要求先有驗收與安全測試才能合併；工具與 CI 平台未選，需先建立版本控制（AD-009） |
| XII 隱私與資料主權 | 通過（細節 TBD） | 匯出與完整刪除（FR-017）、三年快照（FR-029）；到期刪除機制 `[TBD]` |
| XIII Validator 集中 | 通過（有後續待辦） | 一份規則檔加兩個執行器、共用一致性測試案例；規則檔格式 `[TBD]` |

### 待決定的閘門項目

1. **Constitution VIII「傳輸一律使用 TLS」與管理員本機服務**：AD-004 與 FR-041 規定本機服務只綁定本機位址；本機回送連線是否也須 TLS，文件未定義。若須 TLS，本機服務需自行處理憑證。這是 Constitution II 要求顯性化的潛在矛盾：`[CONFLICT?: Constitution VIII says all transport uses TLS, AD-004 specifies a loopback-only local web service without stating TLS — needs resolution]`。公開網站的 TLS 取決於託管服務（AD-008，`[TBD]`）。
2. **XI 的前置條件**：專案目前不是版本控制庫，且託管平台未選（AD-009）。實作開始前必須先建立。
3. **VIII 的金鑰管理**：憑證檔以密碼衍生金鑰加密（FR-034）；管理員其他加密資料用何金鑰、忘記密碼重設後是否可讀（FR-033）取決於此。

這三項不阻擋產出設計文件，但在 `/speckit-tasks` 產生實作任務前需決定或明確列為任務。

## Project Structure

### Documentation (this feature)

```text
specs/001-card-reward-optimizer/
├── plan.md                    # This file
├── research.md                # Phase 0 output
├── data-model.md              # Phase 1 output
├── quickstart.md              # Phase 1 output
├── contracts/                 # Phase 1 output
│   ├── sdk-operations.md
│   ├── published-reward-data.md
│   ├── admin-local-service.md
│   └── validator-contract.md
├── architecture-decisions.md  # AD-001 至 AD-010
├── checklists/requirements.md
└── tasks.md                   # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

`[INFERRED: 目錄名稱依 AD-004、AD-006、AD-007、AD-010 推得，使用者未提供；需人工確認]`

```text
rules/                         # 驗證規則檔（單一來源，Constitution XIII）
conformance/                   # 兩個執行器共用的一致性測試案例（含拒絕情境）

web/                           # 公開版靜態網頁與瀏覽器內 SDK（JavaScript）
├── src/
│   ├── sdk/                   # 公開業務邏輯層（通路查詢、健檢、新卡試算、情境推薦）
│   ├── validator/             # 瀏覽器端規則執行器
│   ├── storage/               # 瀏覽器內建儲存空間存取、匯出備份、一鍵清除
│   └── ui/                    # 貼上流程、智慧提問、風險告知（FR-050）
└── tests/

admin/                         # 管理員本機服務（Python）
├── src/
│   ├── api/                   # 僅本機連線、來源檢查、一次性令牌（FR-041）
│   ├── validator/             # 本機規則執行器
│   ├── credentials/           # 加密憑證檔載入、記憶體保存、閒置清除（FR-034）
│   ├── llm/                   # 送出前檢視確認（FR-028）與外部 LLM 呼叫
│   └── publishing/            # 草稿蒐集、確認、產生公開 JSON（FR-021）
└── tests/

data/                          # 已發布的公開回饋資料（JSON，AD-007）
scripts/                       # 單一本機檢查腳本（AD-009）
```

**Structure Decision**: 公開版與管理員模式分為兩個頂層專案（`web/`、`admin/`），中間只共用 `rules/` 與 `conformance/`，兩者之間不共用程式碼。這確保公開部署內容不含管理員模式程式與 AI 憑證（FR-034、SC-011）。部署時僅發布 `web/` 與 `data/`。

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| 驗證規則有兩個執行器（Python、JavaScript） | AD-010 的使用者決定；Constitution XIII 已於 v1.2.0 修訂以容許此形式 | 全部使用 JavaScript／TypeScript（P3）被排除，因為使用者希望本機端使用 Python（使用者提供）；其他理由 `[RATIONALE NEEDED]` |
| 兩個頂層專案（web、admin） | 公開部署內容不得含管理員程式與憑證（FR-034、SC-011） | 單一專案加建置時排除：容易誤把管理員程式發布出去；此理由為助理說明，非使用者提供，`[RATIONALE NEEDED: 使用者尚未確認專案切分方式]` |
