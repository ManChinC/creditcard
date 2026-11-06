// Channel query screen (T047, FR-007, FR-035, FR-036, FR-026, FR-055). The ranking, caps, coupon dates and merchant
// matching all come from the tested SDK modules; this file only reads the inputs and shows their results as text.
// Not yet checked in a real browser by an automated test: web/tests/ui-safety.test.js scans it statically.

import { el, clear, formatMoney, formatRate } from "./render.js";
import { rankCards, resolveChannel } from "../sdk/query.js";
import { capExplanation } from "../sdk/cap.js";
import { nextOpenDate, isClaimed, markClaimed, unmarkClaimed } from "../sdk/coupon.js";
import { designatedByCard, matchMerchant, MIN_INPUT_CHARS } from "../sdk/merchants.js";
import { applyOverrides, listOverrides, OVERRIDE_LABEL } from "../sdk/override.js";
import { channelCandidates, matchChannel, seedDefaultChannels, setCanonical } from "../sdk/channels.js";
import { todayDate } from "../sdk/snapshot.js";

export const DISCLAIMER = "回饋內容以發卡行官方公告為準，本工具僅供參考。";
export const NOT_WRITTEN = "官網沒有寫";

export const COUPON_LABELS = Object.freeze({ required: "需領券", claimed: "已領", "not-required": "無需領券", unknown: "未知" });
const MERCHANT_MESSAGES = Object.freeze({
  "too-short": `請至少輸入 ${MIN_INPUT_CHARS} 個字。`,
  "not-listed": "未列在指定商家，請以官網為準。",
  unknown: `這張卡的指定商家清單${NOT_WRITTEN}。`,
});

function capText(rule, allRules) {
  const { threshold, sharedWith } = capExplanation(rule, allRules);
  let text;
  if (threshold.status === "known") text = `每月刷到 ${formatMoney(threshold.amount)} 會碰到回饋上限`;
  else if (threshold.status === "no-cap") text = "沒有回饋上限";
  else if (threshold.status === "not-reached") text = "這個回饋率達不到上限";
  else text = `上限未知（${NOT_WRITTEN}）`;
  if (sharedWith.length > 0) text += `；與 ${sharedWith.map((s) => `${s.channel}／${s.paymentMethod}`).join("、")} 共用上限`;
  return text;
}

function convenienceText(rule) {
  const sw = rule.requiresBenefitSwitch === true ? "需切換權益" : rule.requiresBenefitSwitch === false ? "不需切換權益" : "切換權益未知";
  const min = rule.threshold === 0 ? "無低消" : Number.isSafeInteger(rule.threshold) ? `單筆低消 ${formatMoney(rule.threshold)}` : "低消未知";
  return `${sw}；${min}`;
}

// A source link is only made from a published address that starts with https; anything else is shown as plain text.
export function sourceCell(rule) {
  if (rule.isUserOverride) return el("span", { text: `${OVERRIDE_LABEL}（${rule.overriddenAt ?? ""}，無官方來源）` });
  const parts = [];
  if (typeof rule.source === "string" && /^https:\/{2}/.test(rule.source)) {
    parts.push(el("a", { href: rule.source, target: "_blank", rel: "noopener noreferrer", text: rule.source }));
  } else {
    parts.push(el("span", { text: NOT_WRITTEN }));
  }
  parts.push(el("span", { text: `（查證日期 ${rule.verifiedAt ?? "未知"}）` }));
  return el("span", {}, parts);
}

export function mountQueryPage(root, { store, rules, rewardState, today = todayDate() }) {
  const section = el("section", { class: "query" }, [el("h2", { text: "通路查詢" })]);
  root.append(section);

  if (rewardState.status !== "ok") {
    const message = rewardState.status === "unavailable"
      ? "目前讀不到公開回饋資料，無法查詢。"
      : "公開回饋資料驗證未通過，為了安全不使用這份資料，也不提供結論。";
    section.append(el("p", { text: message }));
    if (rewardState.status === "invalid") {
      section.append(el("ul", {}, rewardState.failures.map((f) => el("li", { text: `${f.code}${f.path ? `（${f.path}）` : ""}` }))));
    }
    section.append(el("p", { text: DISCLAIMER }));
    return;
  }

  const published = rewardState.data.rules;
  const dataChannels = [...new Set(published.map((r) => r.channel))];
  const paymentMethods = [...new Set(published.map((r) => r.paymentMethod))];

  section.append(
    el("p", { text: `回饋資料最後查證日期：${rewardState.lastVerifiedAt}` }),
    el("p", { text: DISCLAIMER }),
  );

  const channelInput = el("input", { type: "text", placeholder: "通路名稱", list: "query-channels" });
  const datalist = el("datalist", { id: "query-channels" }, dataChannels.map((c) => el("option", { value: c })));
  const method = el("select", {}, paymentMethods.map((m) => el("option", { value: m, text: m })));
  const out = el("div", { class: "query-out" });
  const merchantsOut = el("div", { class: "merchants-out" });

  function render() {
    clear(out);
    clear(merchantsOut);
    const channel = resolveChannel(channelInput.value, dataChannels, seedDefaultChannels(store));
    if (channel === null) {
      out.append(el("p", { text: `資料裡沒有這個通路的回饋。目前有資料的通路：${dataChannels.join("、")}` }));
      // Overlapping names are only offered; the user confirms one. If the typed text is one of the user's own
      // channels the confirmation is remembered (canonicalId), otherwise it is used for this query only.
      const userChannels = seedDefaultChannels(store);
      for (const name of channelCandidates(channelInput.value, dataChannels, userChannels)) {
        out.append(el("button", { type: "button", text: `你是指「${name}」嗎？`, onclick: () => {
          const own = matchChannel(channelInput.value, userChannels);
          if (own.matched) setCanonical(store, own.id, name);
          else channelInput.value = name;
          render();
        } }));
      }
      return;
    }
    const rulesNow = applyOverrides(published, listOverrides(store));
    const held = store.list("cards").map((c) => ({ issuer: c.issuer, name: c.name }));
    const result = rankCards({ rules: rulesNow, heldCards: held, channel, paymentMethod: method.value, isClaimed: (r) => isClaimed(store, r) });

    if (held.length === 0) out.append(el("p", { text: "尚未建立你的持卡資料，以下依回饋列出所有卡。" }));
    if (result.ranked.length === 0) {
      out.append(el("p", { text: `${channel}／${method.value} 沒有可比較的回饋規則。` }));
    } else {
      out.append(el("table", {}, [
        el("thead", {}, [el("tr", {}, ["順位", "卡", "持有", "回饋率", "月上限說明", "領券", "使用便利性", "來源"].map((h) => el("th", { text: h })))]),
        el("tbody", {}, result.ranked.map((item, i) => row(item, i + 1, rulesNow))),
      ]));
    }
    if (result.unknown.length > 0) {
      out.append(el("p", { text: `這些持有的卡在 ${channel}／${method.value} 沒有資料，無法比較：${result.unknown.map((u) => u.cardName).join("、")}` }));
    }
    renderMerchants(rulesNow, channel);
  }

  function row(item, rank, allRules) {
    const rule = item.rule;
    const couponCell = [el("span", { text: COUPON_LABELS[item.couponState] })];
    if (item.couponState === "required" || item.couponState === "claimed") {
      const next = nextOpenDate(rule.registrationCycle, today);
      const when = next.status === "known" ? `下一次開放日 ${next.date}` : next.status === "ended" ? "活動已結束" : "開放日未知";
      couponCell.push(el("br"), el("span", { text: when }), el("br"));
      const claimed = item.couponState === "claimed";
      couponCell.push(el("button", {
        type: "button", text: claimed ? "取消已領" : "我已領券",
        onclick: () => { (claimed ? unmarkClaimed : markClaimed)(store, rule); render(); },
      }));
    }
    return el("tr", {}, [
      el("td", { text: String(rank) }),
      el("td", { text: `${item.issuer} ${item.cardName}${rule.isUserOverride ? `（${OVERRIDE_LABEL}）` : ""}` }),
      el("td", { text: item.held ? "是" : "否" }),
      el("td", { text: formatRate(item.effectiveRate) }),
      el("td", { text: capText(rule, allRules) }),
      el("td", {}, couponCell),
      el("td", { text: convenienceText(rule) }),
      el("td", {}, [sourceCell(rule)]),
    ]);
  }

  function renderMerchants(allRules, channel) {
    const cards = designatedByCard(allRules, channel);
    const list = el("ul", {}, cards.map((c) => el("li", { text: `${c.issuer} ${c.cardName}：${c.status === "unknown" ? NOT_WRITTEN : c.merchants.length === 0 ? "沒有指定商家" : c.merchants.map((m) => m.name).join("、")}` })));
    const typed = el("input", { type: "text", placeholder: "輸入你要去的商家名稱" });
    const answers = el("ul");
    merchantsOut.append(
      el("h3", { text: "各卡的指定商家" }), list,
      typed,
      el("button", { type: "button", text: "查是否為指定商家", onclick: () => {
        clear(answers);
        for (const c of cards) {
          const r = matchMerchant(typed.value, c.status === "unknown" ? undefined : c.merchants);
          const text = r.status === "matched" ? `是指定商家：${r.merchants.join("、")}` : MERCHANT_MESSAGES[r.status];
          answers.append(el("li", { text: `${c.issuer} ${c.cardName}：${text}` }));
        }
      } }),
      answers,
    );
  }

  section.append(
    el("label", { text: "通路 " }), channelInput, datalist,
    el("label", { text: " 支付方式 " }), method,
    el("button", { type: "button", text: "查詢", onclick: render }),
    out, merchantsOut,
  );
}
