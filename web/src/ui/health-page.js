// Card health check screen (T051, FR-009, FR-010, FR-013, FR-035). Every figure comes from healthCheck (SDK); this
// file only reads the payment method choice and shows the result as text. The public page does not judge whether the
// reward data is old: it shows the last verification date and each rule's own source (user decision 2026-11-04).
// Not checked in a real browser by an automated test: web/tests/ui-safety.test.js scans it statically.

import { el, clear, formatMoney, formatRate } from "./render.js";
import { healthCheck } from "../sdk/health-check.js";
import { healthInputs } from "../sdk/health-input.js";
import { applyOverrides, listOverrides, OVERRIDE_LABEL } from "../sdk/override.js";
import { KIND_CHANNEL_NOT_FOUND, recordFailure } from "../sdk/feedback.js";
import { seedDefaultChannels, setCanonical } from "../sdk/channels.js";
import { COUPON_LABELS, DISCLAIMER, sourceCell } from "./query-page.js";

export const ESTIMATE_NOTE = "回饋為依月均消費估算的每月金額，已套用月上限，實際回饋以發卡行結算為準。";

const ROW_NOTES = Object.freeze({
  "better-available": "有回饋更高的卡",
  "current-best": "目前的卡已是最佳",
  "current-unknown": "目前使用的卡在這個通路沒有資料（或未指定），無法比較差額",
  "no-spend": "沒有月均金額，無法判斷",
  "no-data": "公開資料沒有這個通路",
});

const VERDICTS = Object.freeze({
  "no-change": "每個通路目前使用的卡都是回饋最高的，無需更換。",
  incomplete: "有通路無法判斷，因此無法確定是否需要更換。",
});

const cardText = (c) => `${c.issuer} ${c.cardName}${c.rule.isUserOverride ? `（${OVERRIDE_LABEL}）` : ""}`;
const rewardText = (c) => `${formatMoney(c.reward)}${c.capped ? "（已達月上限）" : ""}`;

export function mountHealthPage(root, { store, rewardState, onFeedback = () => {} }) {
  const section = el("section", { class: "health" }, [el("h2", { text: "信用卡健檢" })]);
  root.append(section);

  if (rewardState.status !== "ok") {
    const message = rewardState.status === "unavailable"
      ? "目前讀不到公開回饋資料，無法健檢。"
      : "公開回饋資料驗證未通過，為了安全不使用這份資料，也不提供結論。";
    section.append(el("p", { text: message }), el("p", { text: DISCLAIMER }));
    return;
  }

  const published = rewardState.data.rules;
  const paymentMethods = [...new Set(published.map((r) => r.paymentMethod))];
  const method = el("select", {}, paymentMethods.map((m) => el("option", { value: m, text: m })));
  const out = el("div", { class: "health-out" });

  function run() {
    clear(out);
    const channels = seedDefaultChannels(store);
    const { heldCards, rows } = healthInputs(store, channels);
    if (heldCards.length === 0 && rows.every((r) => r.monthlyAverage === null)) {
      out.append(el("p", { text: "尚未建立你的消費資料與持卡資料，請先在下方匯入或回答問題。" }));
      return;
    }
    const rulesNow = applyOverrides(published, listOverrides(store));
    const result = healthCheck({ rewardState, rules: rulesNow, heldCards, rows, paymentMethod: method.value, userChannels: channels });

    let queued = false;
    for (const r of result.rows) if (r.status === "no-data" && r.channel === null && recordFailure(store, KIND_CHANNEL_NOT_FOUND, r.channelName).recorded) queued = true;
    if (queued) onFeedback();

    out.append(el("p", { text: result.verdict === "changes-suggested"
      ? `有 ${result.rows.filter((r) => r.status === "better-available").length} 個通路找到回饋更高的卡，每月預估合計可多拿 ${formatMoney(result.totalMonthlyGain)}。${result.complete ? "" : "另有通路無法判斷。"}`
      : VERDICTS[result.verdict] }));
    out.append(
      el("table", {}, [
        el("thead", {}, [el("tr", {}, ["通路", "月均消費", "目前使用", "目前月回饋", "回饋最高的卡", "回饋率", "月回饋", "每月差額", "領券", "說明", "來源"].map((h) => el("th", { text: h })))]),
        el("tbody", {}, result.rows.map(row)),
      ]),
      el("p", { text: ESTIMATE_NOTE }),
      el("p", { text: `回饋資料最後查證日期：${result.lastVerifiedAt}` }),
      el("p", { text: DISCLAIMER }),
    );
  }

  // Published channels whose name overlaps this one. Nothing is applied until the user confirms one.
  function candidateButtons(r) {
    if (r.status !== "no-data" || r.channelId === null) return [];
    return r.candidates.map((name) => el("button", { type: "button", text: `這是公開資料的「${name}」`, onclick: () => { setCanonical(store, r.channelId, name); run(); } }));
  }

  function row(r) {
    const b = r.best;
    return el("tr", {}, [
      el("td", { text: r.channelName }),
      el("td", { text: r.monthlyAverage === null ? "未知" : formatMoney(r.monthlyAverage) }),
      el("td", { text: r.current ? cardText(r.current) : "未知" }),
      el("td", { text: r.current ? rewardText(r.current) : "未知" }),
      el("td", { text: b ? cardText(b) : "—" }),
      el("td", { text: b ? formatRate(b.effectiveRate) : "—" }),
      el("td", { text: b ? rewardText(b) : "—" }),
      el("td", { text: r.status === "better-available" ? `+${formatMoney(r.difference)}` : r.status === "current-best" ? formatMoney(0) : "未知" }),
      el("td", { text: b ? COUPON_LABELS[b.couponState] : "—" }),
      el("td", {}, [el("span", { text: ROW_NOTES[r.status] }), ...candidateButtons(r)]),
      el("td", {}, [b ? sourceCell(b.rule) : el("span", { text: "—" })]),
    ]);
  }

  section.append(
    el("p", { text: "拿你每個通路的月均消費，和公開資料裡所有的卡比較，估算每月回饋差額。" }),
    el("label", { text: "支付方式 " }), method,
    el("button", { type: "button", text: "開始健檢", onclick: run }),
    out,
  );
}
