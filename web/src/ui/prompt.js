// The versioned prompt users give to their own LLM (T025, FR-039, FR-040). It is shown in full on the page.
// The output format is defined in specs/001-card-reward-optimizer/contracts/paste-format.md and enforced by the
// paste-input rule set; the example below is itself checked against that rule set by a test.

export const PROMPT_VERSION = "1";

export const PROMPT_EXAMPLE = {
  formatVersion: PROMPT_VERSION,
  period: { start: "2026-08", end: "2026-10" },
  currency: "TWD",
  cards: [{ issuer: "國泰", name: "範例卡" }],
  channels: [{ name: "加油", total: 3600, mainCard: "範例卡" }],
  largeItems: [{ category: "旅遊訂房 / 機票", amount: 45000 }],
};

export function buildPrompt({ largeItemThreshold = 10000, channelNames = [] } = {}) {
  const channelLine = channelNames.length > 0 ? `通路請盡量歸入以下名稱：${channelNames.join("、")}；其餘歸入「無腦刷」。` : "通路請用常見的簡短名稱。";
  return [
    `你是信用卡消費彙整助手（格式版本 ${PROMPT_VERSION}）。我會提供我自己的信用卡消費紀錄，請你彙整後，只輸出一段 JSON，不要輸出任何其他文字。`,
    "",
    "規則：",
    "1. 只輸出 JSON，欄位與範例完全相同，不得新增欄位。",
    "2. 不要輸出逐筆消費明細、商家名稱、日期明細；只輸出各通路在整個涵蓋期間的總額。",
    "3. 金額一律用新台幣整數（不含小數點）。外幣消費請用帳單上的新台幣入帳金額。",
    "4. 退款請從同一通路的金額中扣除（以淨額計）；分期請用該期間實際入帳的金額。",
    `5. 單筆金額達 ${largeItemThreshold} 元以上的消費，請另外列在 largeItems，只寫類別與金額，不寫商家。`,
    "6. period 是紀錄涵蓋的起訖月份（YYYY-MM）。",
    "7. cards 只寫發卡銀行（國泰、永豐、富邦、台新）與卡名。不要輸出卡號、末四碼、安全碼、姓名或任何個人識別資料。",
    "8. channels 的 mainCard 必須是 cards 裡出現過的卡名，代表該通路主要使用的那張卡。",
    `9. ${channelLine}`,
    "",
    "範例（數字僅為示意）：",
    JSON.stringify(PROMPT_EXAMPLE, null, 2),
  ].join("\n");
}

// Shown next to the prompt (FR-039).
export const PROMPT_NOTICE = "請在把紀錄交給 LLM 之前，自行遮蔽卡號、姓名等敏感資訊。紀錄交給你所選的 LLM 之後如何處理，不受本系統控制。";
