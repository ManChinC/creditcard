# Specification Quality Checklist: 信用卡消費匯入與通路回饋最佳化

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-10-16
**Last Validated**: 2026-11-03（第二次）
**Feature**: [spec.md](../spec.md)

## Content Quality

- [ ] No implementation details (languages, frameworks, APIs)（FR-043 至 FR-049、SC-012 含 API／SDK、accessToken、protectionLevel、JSON、Validator；來自使用者明確要求，但屬實作層用語）
- [x] Focused on user value and business needs
- [ ] Written for non-technical stakeholders（FR-041 至 FR-049 為技術性條文）
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] No [INFERRED] markers remain（以搜尋確認 spec 與 architecture-decisions 皆為 0）
- [x] No unresolved [CONFLICT] markers（第一次驗證發現的 4 項衝突已於 2026-11-03 同步修正）
- [ ] Requirements are testable and unambiguous（仍含 `[TBD]`，見 MISSING 2）
- [ ] Success criteria are measurable（SC-006、SC-013、SC-014、SC-015 含 `[TBD]`；SC-014 在不保存逐筆明細下無從量測）
- [ ] Success criteria are technology-agnostic (no implementation details)（SC-012 含 token、protectionLevel）
- [ ] All acceptance scenarios are defined（FR-041 至 FR-055 無 Given／When／Then 情境，僅 SC-010 至 SC-012 可稽核）
- [x] Edge cases are identified（處理方式部分仍為 `[TBD]`）
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [ ] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [ ] Feature meets measurable outcomes defined in Success Criteria（實作前無法評估）
- [ ] No implementation details leak into specification（同 Content Quality 第一項）

## Review (Constitution V)

### ISSUES

1. 上列未打勾的三類項目（實作層用語、驗收情境不足、SC 不可量測）為現存問題。其中 SC-014 需要「實際到帳回饋」資料，而系統不保存逐筆明細且公開版不上傳資料，目前無法量測。

### MISSING

1. **FR-041 至 FR-055 的驗收情境**。
2. **未決 TBD（依 plan 前的必要程度分級，此分級為助理判斷）**：
   - 第一級（建議 plan 前）：無。2026-11-03 已決定或明確留到 plan 者見下。
   - 第二級（plan 階段處理）：
     - FR-028：「內容相同」判定方式與有效範圍
     - FR-040：大額驗證不通過的處理方式
     - FR-033：忘記密碼時如何確認操作者為管理員本人（使用者決定留到 plan），及重設後其他加密資料是否可讀（取決於 Constitution VIII 的金鑰管理）
     - FR-034：憑證閒置清除時機
     - FR-029：到期刪除機制
     - FR-021：本專案具體作業流程、各銀行更新週期
     - FR-051：第 5 項金額門檻、「不需切換權益」「回饋穩定」的資料表示、支援的支付方式清單、載明可疊加時的資料表示
     - FR-053：回饋金額上限的計算公式（含分段回饋率）、跨通路共用上限
     - FR-055：商家名稱比對方式、指定商家清單蒐集流程
     - 技術選型：公開網站託管服務、程式碼託管平台、測試與掃描工具、規則檔與一致性測試案例格式、加密演算法與金鑰管理
     - Constitution：效能目標與 SLA、其他合規、程式碼審查流程、修訂核准者
   - 第三級（不擋 plan）：
     - SC-006、SC-013、SC-014、SC-015 的量測方式
     - Edge Cases 的 `[TBD]`（重複貼上、退款與分期、預覽修正方式、決勝規則、別名辨識、資料過期提示）
     - FR-038：公開版後續是否加入本機 AI
     - 外幣後續是否支援
3. **理由欄**：AD-001 至 AD-010、AD-003 備份不加密、Assumptions 兩處的 `[RATIONALE NEEDED]`，需使用者提供。

### SUGGESTIONS（選擇性）

1. 若要滿足 Content Quality 兩項，可將 FR-043 至 FR-049 移至 plan 階段文件，spec 只保留行為層描述。是否採用由使用者決定。
2. SC-009 可補測量方式（例如以多少百分位數計）；目前為「目標，非硬性上限」。

## Notes

- 依 Constitution I，使用者未提供的效能目標、保留期限、技術選型一律標 [TBD]，不視為缺陷。
- spec-kit 的 plan 流程本身不因 `[TBD]` 阻擋；上述分級僅為建議。
