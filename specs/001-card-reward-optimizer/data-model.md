# Data Model: 信用卡消費匯入與通路回饋最佳化

欄位僅取自 [spec.md](spec.md)。spec 未指定的型別、長度、格式一律標 `[TBD]`，不自行設定。

## 儲存位置總覽

| 資料 | 公開版 | 管理員模式 | 備註 |
|---|---|---|---|
| Card、HabitEntry、SummarySnapshot、Channel、ChannelCardMapping | 瀏覽器內建儲存空間，不加密 | 本機加密檔 `[TBD: 格式]` | 公開版不存末四碼（FR-016） |
| RewardRule（已發布） | 讀取公開 JSON | 產生並發布公開 JSON | FR-048 |
| RewardRule 的使用者修正 | 僅本機，標示「使用者修正」 | 同左 | 不上傳（FR-021） |
| RewardDraft | 無 | 管理員本機 | 公開版不存在草稿 |
| Admin 憑證 | 無 | 加密憑證檔，解密後只在記憶體 | FR-034 |

## 實體

### Card（信用卡）
| 欄位 | 說明 | 規則 |
|---|---|---|
| issuer | 發卡機構 | 初期限國泰、永豐、富邦、台新 |
| name | 卡名 | |
| last4 | 末四碼 | **僅管理員模式保存**；公開版 MUST NOT（FR-016） |
| （無） | 完整卡號、CVV | MUST NOT 儲存（FR-015） |

### Channel（消費通路）
| 欄位 | 說明 | 規則 |
|---|---|---|
| name | 名稱 | 預設 11 項，可自訂新增、修改、刪除（FR-031） |
| aliases | 別名 | 自訂通路可設定；預設通路別名規則 `[TBD]` |
| monthlyAverage | 月均估算（新台幣） | 來源標記見 HabitEntry／SummarySnapshot |

### ChannelCardMapping（通路 × 卡對照）
| 欄位 | 說明 |
|---|---|
| channel | 關聯 Channel |
| card | 現在刷的卡，關聯 Card |
| rewardRate | 回饋率 |
| source | 「匯入清單計算」或「使用者自述估算」（FR-024） |

「無腦刷」為預設通路之一，接收無法歸類的金額（FR-004）。通路無消費時月均為 0 或標示無資料，不得虛構（US1 情境 5）。

### SummarySnapshot（彙整表快照）
| 欄位 | 說明 | 規則 |
|---|---|---|
| confirmedAt | 確認日期 | 三年期限自此日起算（FR-029） |
| coveragePeriod | 涵蓋期間 | 少於三個月時提示但可繼續（FR-002） |
| channelAmounts | 各通路金額（新台幣） | 非新台幣幣別由 Validator 拒絕 |
| source | LLM 彙整／自述估算 | |
| largeItems | 單筆達門檻的獨立項目 | 僅含類別與金額；金額須達門檻，由程式驗證（FR-040、FR-027） |

生命週期：預覽 → 使用者確認 → 保存 → 滿三年前通知並提供匯出 → 到期永久刪除。目前使用中的最新通路表不受快照到期影響。到期機制 `[TBD: R-10]`。系統不保存逐筆消費明細。

### HabitEntry（消費習慣自述）
| 欄位 | 說明 | 規則 |
|---|---|---|
| channel | 通路 | |
| card | 使用的卡 | |
| approxMonthly | 約略月均消費 | 可略過或「不知道」，則標示未知，不以預設值填補（US1 情境 8） |
| source | 固定為「使用者自述估算」 | |

### RewardRule（回饋規則）
FR-054：以「卡片 × 通路 × 支付方式」各自記錄。

| 欄位 | 說明 | 規則 |
|---|---|---|
| card | 卡片 | |
| channel | 通路類別 | |
| paymentMethod | 支付方式 | 支援清單 `[TBD: R-13]` |
| rewardRate | 回饋率 | |
| rewardCap | 回饋金額上限 | 使用者決定為金額上限；未知則標示未知（FR-053） |
| threshold | 門檻 | |
| designatedMerchants | 指定商家清單 | 各卡不同（FR-055） |
| requiresBenefitSwitch | 是否需切換權益 | 用於使用便利性（FR-051 第 5 項）；表示方式 `[TBD: R-13]` |
| stackingStated | 官方是否載明可疊加 | 預設不疊加（FR-054）；疊加的資料表示 `[TBD: R-13]` |
| couponRequirement | 是否需領券 | 領券狀態：需領券／已領／無需領券／未知 |
| coupon | 領券條件、有效期間、登錄週期、名額 | 登錄週期為結構化欄位，「下一次開放日」由程式計算（FR-022） |
| source、verifiedAt | 來源與查證日期 | 必填並於公開頁面顯示（FR-026）；無法判斷的欄位為「官網沒有寫」或未知 |
| isUserOverride | 是否為使用者修正 | 僅本機（FR-021） |

衍生值（由程式計算，不儲存）：月上限門檻 = 依 rewardRate 與 rewardCap 計算「每月刷到多少會碰到回饋上限」（FR-053）；公式 `[TBD: R-12]`。使用者當月已用額度**不追蹤**。

### RewardDraft（回饋資料草稿）
| 欄位 | 說明 |
|---|---|
| content | 草稿內容（結構同 RewardRule） |
| source、collectedAt | 來源與蒐集時間 |
| state | 待確認／已發布／退回 |

狀態轉換：`待確認 → 已發布`（管理員確認）、`待確認 → 退回`（管理員退回）。`已發布` 內容更新時以新草稿進入 `待確認`。已發布版本與草稿不一致時，公開頁面以已發布版本為準（Edge Cases）。

### RewardDataset（已發布的公開資料集）
| 欄位 | 說明 |
|---|---|
| schemaVersion | schema 版本號（FR-048） |
| rules | RewardRule 清單 |
| lastVerifiedAt | 最後查證日期（FR-036） |

僅含公開資訊，不含任何使用者個人資料。詳見 [contracts/published-reward-data.md](contracts/published-reward-data.md)。

### CardEvaluation（新卡評估）
| 欄位 | 說明 |
|---|---|
| input | 使用者輸入的新卡回饋內容（年費、門檻、上限等，FR-012） |
| result | 值得／不值得／視情況，可替換通路與回饋差額（由程式計算） |
| missingFields | 輸入不完整時列出缺漏欄位，不自行假設（US4 情境 4） |

不需長期保存 `[TBD: 是否保存未定義]`。

### Admin（管理員）
單一角色。憑證檔位置由管理員登入後指定；解密後憑證僅存記憶體。登入狀態與一次性令牌（FR-041）為執行期資料，不持久化。

## 驗證規則摘要

完整規則見 [contracts/validator-contract.md](contracts/validator-contract.md)。
- 貼上內容：格式、欄位缺漏、數值範圍、幣別、卡號與 CVV 偵測、可疑內容（FR-025、FR-015、FR-018）。
- 大額項目金額須達使用者設定門檻（預設 10,000 元，單筆判定）。
- 載入公開 JSON 時驗證 schema（FR-048）。
