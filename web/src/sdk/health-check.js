// Card health check (T050, FR-009, FR-010, FR-013). For each channel the user spends in, the card they use now is
// compared with every card in the published reward data, in whole TWD per month. Every amount is computed here by
// code, never by an LLM (Constitution X, SC-004). Nothing here reads storage or the network.
//
// If the reward data could not be read or did not pass the Validator there is no conclusion at all. The public page
// does not judge whether the data is "stale" (user decision 2026-11-04); it only reports lastVerifiedAt, and each
// better card carries its own rule (source and verifiedAt) so the page can show where the figure comes from.
//
// Readings of the spec that the user has not confirmed yet ([INFERRED]):
//   - the monthly reward of a card is floor(monthlyAverage x effective rate / 10000), where the effective rate is the
//     one the ranking uses (first tier, plus stacking when the rule states it), limited to rewardCap when the rule
//     states one and does not also say noCap (that contradiction is "cap unknown": no limit applied);
//   - the better card is the one with the largest limited reward; ties keep the ranking order, and a tie with the
//     current card means the current card is best;
//   - no current card, or a current card with no usable rule for the channel and payment method, is "current-unknown":
//     the best card is shown but no difference is computed;
//   - the verdict is "no-change" only when every channel was judged and the current card is best in all of them.

import { rankCards, resolveChannel } from "./query.js";
import { channelCandidates } from "./channels.js";

const RATE_UNITS = 10000n;
const isAmount = (n) => Number.isSafeInteger(n) && n > 0;

function rewardOf(item, monthly) {
  const raw = Number((BigInt(monthly) * BigInt(item.effectiveRate)) / RATE_UNITS);
  const rule = item.rule;
  const limit = rule.noCap !== true && Number.isSafeInteger(rule.rewardCap) && rule.rewardCap >= 1 ? rule.rewardCap : null;
  const reward = limit === null ? raw : Math.min(raw, limit);
  return { reward, capped: reward < raw };
}

function describe(item, monthly) {
  const { reward, capped } = rewardOf(item, monthly);
  return {
    issuer: item.issuer, cardName: item.cardName, held: item.held, effectiveRate: item.effectiveRate,
    reward, capped, couponState: item.couponState, rule: item.rule,
  };
}

function judgeRow(row, { rules, heldCards, paymentMethod, dataChannels, userChannels }) {
  const base = { channelId: row.channelId ?? null, channelName: row.channelName, channel: null, candidates: [], monthlyAverage: row.monthlyAverage ?? null, current: null, best: null, difference: null };
  if (!isAmount(row.monthlyAverage)) return { ...base, status: "no-spend" };

  const channel = resolveChannel(row.channelName, dataChannels, userChannels);
  if (channel === null) return { ...base, status: "no-data", candidates: channelCandidates(row.channelName, dataChannels, userChannels) };
  base.channel = channel;

  // No held cards are passed: the comparison is by reward, not by "the user already has it".
  const { ranked } = rankCards({ rules, heldCards: [], channel, paymentMethod });
  if (ranked.length === 0) return { ...base, status: "no-data" };

  const isHeld = (item) => heldCards.some((h) => h.issuer === item.issuer && h.name === item.cardName);
  const options = ranked.map((item) => describe({ ...item, held: isHeld(item) }, row.monthlyAverage));
  let top = options[0];
  for (const o of options) if (o.reward > top.reward) top = o;

  const cur = row.current ?? null;
  const current = cur ? options.find((o) => o.issuer === cur.issuer && o.cardName === cur.name) ?? null : null;
  if (current === null) return { ...base, status: "current-unknown", best: top };

  if (top.reward > current.reward) {
    return { ...base, status: "better-available", current, best: top, difference: top.reward - current.reward };
  }
  return { ...base, status: "current-best", current, best: current, difference: 0 };
}

export function healthCheck({ rewardState, rules, heldCards = [], rows = [], paymentMethod, userChannels = [] }) {
  if (rewardState === null || typeof rewardState !== "object" || rewardState.status !== "ok") {
    const status = rewardState?.status === "invalid" ? "invalid" : "unavailable";
    return status === "invalid" ? { status, failures: rewardState.failures ?? [] } : { status };
  }
  const list = Array.isArray(rules) ? rules : [];
  const dataChannels = [...new Set(list.filter((r) => r !== null && typeof r === "object").map((r) => r.channel))];
  const judged = rows.map((row) => judgeRow(row, { rules: list, heldCards, paymentMethod, dataChannels, userChannels }));

  const better = judged.filter((r) => r.status === "better-available");
  const complete = judged.length > 0 && judged.every((r) => r.status === "better-available" || r.status === "current-best");
  const verdict = better.length > 0 ? "changes-suggested" : complete ? "no-change" : "incomplete";
  const totalMonthlyGain = better.reduce((sum, r) => sum + r.difference, 0);
  return { status: "ok", lastVerifiedAt: rewardState.lastVerifiedAt, verdict, complete, totalMonthlyGain, rows: judged };
}
