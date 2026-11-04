// Tests for the recommendation ordering (T036, FR-051, FR-054). Written before the implementation (web/src/sdk/query.js).
//
// Ordering is a sequence of comparisons, never a weighted score:
//   1 held card  2 effective reward  3 (monthly cap: explanation only, not ordered)  4 coupon  5 convenience.
// The first comparison that separates two cards decides; only a tie moves to the next.
//
// Interface under test:
//   rankCards({ rules, heldCards, channel, paymentMethod, isClaimed? })
//     -> { ranked: [{ issuer, cardName, held, effectiveRate, couponState }], unknown: [{ issuer, cardName }] }
//   rules: published RewardRule objects (contracts/published-reward-data.md); heldCards: [{ issuer, name }].
//   effectiveRate is an integer in basis points. Cards with no rule for the chosen channel and payment method
//   are listed in `unknown`, never guessed (FR-008).
//
// [INFERRED] markers below are readings of the spec that the user has not confirmed yet:
//   - (confirmed by the user on 2026-11-04) the rate compared in step 2 is the first tier's rate;
//   - stacking adds the first-tier rates of the same card's rules for the payment methods named in stacksWith;
//   - "convenient" in step 5 means requiresBenefitSwitch is false and threshold is 0; anything unknown is not convenient.
import test from "node:test";
import assert from "node:assert/strict";
import { rankCards } from "../src/sdk/query.js";

function rule(over = {}) {
  return {
    issuer: "國泰", cardName: "A 卡", channel: "餐飲", paymentMethod: "實體卡",
    tiers: [{ rate: 300 }], threshold: 0, requiresBenefitSwitch: false, couponRequired: false,
    source: "https://example.com/synthetic", verifiedAt: "2026-11-03",
    ...over,
  };
}
const held = (...names) => names.map((n) => ({ issuer: "國泰", name: n }));
const names = (result) => result.ranked.map((r) => r.cardName);
const base = { channel: "餐飲", paymentMethod: "實體卡" };

test("step 1: a held card ranks above a card the user does not hold, whatever the rate", () => {
  const rules = [rule({ cardName: "未持有卡", tiers: [{ rate: 1000 }] }), rule({ cardName: "持有卡", tiers: [{ rate: 100 }] })];
  const result = rankCards({ ...base, rules, heldCards: held("持有卡") });
  assert.deepEqual(names(result), ["持有卡", "未持有卡"]);
  assert.deepEqual(result.ranked.map((r) => r.held), [true, false]);
});

test("step 2: among held cards the higher effective reward wins", () => {
  const rules = [rule({ cardName: "低", tiers: [{ rate: 100 }] }), rule({ cardName: "高", tiers: [{ rate: 500 }] }), rule({ cardName: "中", tiers: [{ rate: 300 }] })];
  const result = rankCards({ ...base, rules, heldCards: held("低", "高", "中") });
  assert.deepEqual(names(result), ["高", "中", "低"]);
  assert.deepEqual(result.ranked.map((r) => r.effectiveRate), [500, 300, 100]);
});

test("step 2 uses the reward of the payment method the user chose (FR-054)", () => {
  const rules = [
    rule({ cardName: "A 卡", paymentMethod: "實體卡", tiers: [{ rate: 200 }] }),
    rule({ cardName: "A 卡", paymentMethod: "行動支付", tiers: [{ rate: 500 }] }),
    rule({ cardName: "B 卡", paymentMethod: "實體卡", tiers: [{ rate: 300 }] }),
  ];
  const cards = held("A 卡", "B 卡");
  const physical = rankCards({ ...base, paymentMethod: "實體卡", rules, heldCards: cards });
  assert.deepEqual(names(physical), ["B 卡", "A 卡"]);
  const mobile = rankCards({ ...base, paymentMethod: "行動支付", rules, heldCards: cards });
  assert.deepEqual(names(mobile), ["A 卡"]);
  assert.deepEqual(mobile.unknown, [{ issuer: "國泰", cardName: "B 卡" }]);
});

test("payment methods do not stack unless the bank says so (FR-054)", () => {
  const rules = [
    rule({ cardName: "A 卡", paymentMethod: "實體卡", tiers: [{ rate: 200 }] }),
    rule({ cardName: "A 卡", paymentMethod: "行動支付", tiers: [{ rate: 300 }] }),
  ];
  const result = rankCards({ ...base, paymentMethod: "行動支付", rules, heldCards: held("A 卡") });
  assert.equal(result.ranked[0].effectiveRate, 300);
});

test("[INFERRED] a stated stacking adds the named payment method's rate, and unmatched names add nothing", () => {
  const stacked = [
    rule({ cardName: "A 卡", paymentMethod: "實體卡", tiers: [{ rate: 200 }] }),
    rule({ cardName: "A 卡", paymentMethod: "行動支付", tiers: [{ rate: 300 }], stackingStated: true, stacksWith: ["實體卡"] }),
    rule({ cardName: "B 卡", paymentMethod: "行動支付", tiers: [{ rate: 400 }] }),
  ];
  const result = rankCards({ ...base, paymentMethod: "行動支付", rules: stacked, heldCards: held("A 卡", "B 卡") });
  assert.deepEqual(names(result), ["A 卡", "B 卡"]);
  assert.equal(result.ranked[0].effectiveRate, 500);

  const activityOnly = [
    rule({ cardName: "A 卡", paymentMethod: "行動支付", tiers: [{ rate: 300 }], stackingStated: true, stacksWith: ["某活動"] }),
  ];
  const plain = rankCards({ ...base, paymentMethod: "行動支付", rules: activityOnly, heldCards: held("A 卡") });
  assert.equal(plain.ranked[0].effectiveRate, 300);
});

test("stacking is not applied when stacksWith is present but stackingStated is not true", () => {
  const rules = [
    rule({ cardName: "A 卡", paymentMethod: "實體卡", tiers: [{ rate: 200 }] }),
    rule({ cardName: "A 卡", paymentMethod: "行動支付", tiers: [{ rate: 300 }], stacksWith: ["實體卡"] }),
  ];
  const result = rankCards({ ...base, paymentMethod: "行動支付", rules, heldCards: held("A 卡") });
  assert.equal(result.ranked[0].effectiveRate, 300);
});

test("step 2 compares the first tier's rate (confirmed 2026-11-04)", () => {
  const rules = [
    rule({ cardName: "分段卡", tiers: [{ upTo: 1000, rate: 100 }, { rate: 900 }] }),
    rule({ cardName: "單一卡", tiers: [{ rate: 300 }] }),
  ];
  const result = rankCards({ ...base, rules, heldCards: held("分段卡", "單一卡") });
  assert.deepEqual(names(result), ["單一卡", "分段卡"]);
  assert.equal(result.ranked[1].effectiveRate, 100);
});

test("step 3: the monthly cap never changes the order, it is explanation only (FR-051, FR-053)", () => {
  // Same rate, same coupon state. The card with the huge cap is the inconvenient one, so a cap-based order would put it first.
  const rules = [
    rule({ cardName: "小上限但方便", tiers: [{ rate: 300 }], rewardCap: 10, requiresBenefitSwitch: false }),
    rule({ cardName: "大上限但要切換", tiers: [{ rate: 300 }], rewardCap: 99999, requiresBenefitSwitch: true }),
  ];
  assert.deepEqual(names(rankCards({ ...base, rules, heldCards: held("小上限但方便", "大上限但要切換") })), ["小上限但方便", "大上限但要切換"]);
  // Swap which card is convenient: the order follows convenience, not the cap.
  const swapped = [
    rule({ cardName: "小上限但要切換", tiers: [{ rate: 300 }], rewardCap: 10, requiresBenefitSwitch: true }),
    rule({ cardName: "大上限但方便", tiers: [{ rate: 300 }], rewardCap: 99999, requiresBenefitSwitch: false }),
  ];
  assert.deepEqual(names(rankCards({ ...base, rules: swapped, heldCards: held("小上限但要切換", "大上限但方便") })), ["大上限但方便", "小上限但要切換"]);
});

test("step 4: at equal rate a card that needs no coupon ranks above one that does; a claimed coupon counts as no coupon needed", () => {
  const rules = [
    rule({ cardName: "要領券", couponRequired: true }),
    rule({ cardName: "免領券", couponRequired: false }),
  ];
  const cards = held("要領券", "免領券");
  assert.deepEqual(names(rankCards({ ...base, rules, heldCards: cards })), ["免領券", "要領券"]);
  const states = Object.fromEntries(rankCards({ ...base, rules, heldCards: cards }).ranked.map((r) => [r.cardName, r.couponState]));
  assert.deepEqual(states, { 免領券: "not-required", 要領券: "required" });

  // Once claimed, the coupon card ties on step 4, so convenience (step 5) decides: make it the convenient one.
  const claimedRules = [
    rule({ cardName: "要領券", couponRequired: true, requiresBenefitSwitch: false }),
    rule({ cardName: "免領券", couponRequired: false, requiresBenefitSwitch: true }),
  ];
  const result = rankCards({ ...base, rules: claimedRules, heldCards: cards, isClaimed: (r) => r.cardName === "要領券" });
  assert.deepEqual(names(result), ["要領券", "免領券"]);
  assert.equal(result.ranked[0].couponState, "claimed");
});

test("step 5: at a full tie the card with no benefit switch and no minimum spend ranks first", () => {
  const rules = [
    rule({ cardName: "要切換", requiresBenefitSwitch: true }),
    rule({ cardName: "有低消", threshold: 500 }),
    rule({ cardName: "最方便", requiresBenefitSwitch: false, threshold: 0 }),
  ];
  const result = rankCards({ ...base, rules, heldCards: held("要切換", "有低消", "最方便") });
  assert.equal(names(result)[0], "最方便");
});

test("[INFERRED] a card whose switch or minimum is unknown is not treated as convenient", () => {
  const rules = [
    rule({ cardName: "不明", requiresBenefitSwitch: undefined, threshold: undefined }),
    rule({ cardName: "方便", requiresBenefitSwitch: false, threshold: 0 }),
  ];
  const result = rankCards({ ...base, rules, heldCards: held("不明", "方便") });
  assert.equal(names(result)[0], "方便");
});

test("the comparison is sequential, not weighted: a 1 bp lead beats every later advantage", () => {
  const rules = [
    rule({ cardName: "略高但全是缺點", tiers: [{ rate: 301 }], couponRequired: true, requiresBenefitSwitch: true, threshold: 1000 }),
    rule({ cardName: "略低但最方便", tiers: [{ rate: 300 }], couponRequired: false, requiresBenefitSwitch: false, threshold: 0 }),
  ];
  assert.deepEqual(names(rankCards({ ...base, rules, heldCards: held("略高但全是缺點", "略低但最方便") })), ["略高但全是缺點", "略低但最方便"]);
});

test("the comparison is sequential: the coupon step (4) is decided before convenience (5)", () => {
  const rules = [
    rule({ cardName: "要領券但方便", couponRequired: true, requiresBenefitSwitch: false }),
    rule({ cardName: "免領券但要切換", couponRequired: false, requiresBenefitSwitch: true }),
  ];
  assert.deepEqual(names(rankCards({ ...base, rules, heldCards: held("要領券但方便", "免領券但要切換") })), ["免領券但要切換", "要領券但方便"]);
});

test("held status outranks a much better reward and a worse coupon state together", () => {
  const rules = [
    rule({ cardName: "持有", tiers: [{ rate: 50 }], couponRequired: true, requiresBenefitSwitch: true }),
    rule({ cardName: "未持有", tiers: [{ rate: 2000 }], couponRequired: false }),
  ];
  assert.deepEqual(names(rankCards({ ...base, rules, heldCards: held("持有") })), ["持有", "未持有"]);
});

test("rules for other channels are ignored; cards without a matching rule are listed as unknown, not guessed (FR-008)", () => {
  const rules = [
    rule({ cardName: "A 卡", channel: "餐飲" }),
    rule({ cardName: "A 卡", channel: "加油", tiers: [{ rate: 900 }] }),
    rule({ cardName: "B 卡", channel: "加油" }),
  ];
  const result = rankCards({ ...base, rules, heldCards: held("A 卡", "B 卡", "C 卡") });
  assert.deepEqual(names(result), ["A 卡"]);
  assert.equal(result.ranked[0].effectiveRate, 300);
  // B has a rule only for another channel, C has none at all: both are unknown for this channel.
  assert.deepEqual(result.unknown.map((u) => u.cardName).sort(), ["B 卡", "C 卡"]);
});

test("no score or weight is exposed on the result", () => {
  const rules = [rule({ cardName: "A 卡" }), rule({ cardName: "B 卡" })];
  const result = rankCards({ ...base, rules, heldCards: held("A 卡") });
  for (const item of result.ranked) {
    for (const key of ["score", "weight", "points"]) assert.equal(key in item, false);
  }
});

test("[TBD: spec Edge Cases, final tie-break] fully tied cards are all returned; their relative order is not asserted", () => {
  const rules = [rule({ cardName: "甲" }), rule({ cardName: "乙" })];
  const result = rankCards({ ...base, rules, heldCards: held("甲", "乙") });
  assert.deepEqual(names(result).sort(), ["乙", "甲"]);
});

test("ranking does not modify its inputs", () => {
  const rules = [rule({ cardName: "A 卡" }), rule({ cardName: "B 卡", tiers: [{ rate: 500 }] })];
  const cards = held("A 卡", "B 卡");
  const freeze = (o) => { Object.values(o).forEach((v) => typeof v === "object" && v !== null && freeze(v)); return Object.freeze(o); };
  freeze(rules); freeze(cards);
  assert.doesNotThrow(() => rankCards({ ...base, rules, heldCards: cards }));
});

test("rule text is returned as data and never interpreted", () => {
  const rules = [rule({ cardName: "<img src=x onerror=alert(1)>" })];
  const result = rankCards({ ...base, rules, heldCards: [{ issuer: "國泰", name: "<img src=x onerror=alert(1)>" }] });
  assert.equal(result.ranked[0].cardName, "<img src=x onerror=alert(1)>");
});

// ---- resolveChannel and formatRate (T047) ----
import { resolveChannel } from "../src/sdk/query.js";
import { formatRate } from "../src/ui/render.js";
import { DEFAULT_CHANNELS } from "../src/sdk/default-channels.js";

const userChannels = DEFAULT_CHANNELS.map((c) => ({ ...c, aliases: [...(c.aliases ?? [])] }));

test("a channel typed as the data's own name is used as is, ignoring case, spacing and full-width forms", () => {
  assert.equal(resolveChannel("餐飲", ["餐飲", "加油"], userChannels), "餐飲");
  assert.equal(resolveChannel("  ＡＢ ", ["ab"], userChannels), "ab");
});

test("a channel typed as one of the user's own channel names or aliases maps to the data's name for it", () => {
  const fuel = userChannels.find((c) => c.id === "fuel");
  assert.equal(resolveChannel(fuel.name, [fuel.name], userChannels), fuel.name);
  const custom = [{ id: "custom-1", name: "我的加油站", aliases: ["加油"], origin: "custom" }];
  assert.equal(resolveChannel("我的加油站", ["加油"], custom), "加油");
});

test("a channel the data does not have is not guessed", () => {
  assert.equal(resolveChannel("不存在的通路", ["餐飲"], userChannels), null);
  assert.equal(resolveChannel("", ["餐飲"], userChannels), null);
  assert.equal(resolveChannel(undefined, ["餐飲"], userChannels), null);
});

test("rates are shown as percentages from basis points", () => {
  assert.equal(formatRate(350), "3.5%");
  assert.equal(formatRate(300), "3%");
  assert.equal(formatRate(333), "3.33%");
  assert.equal(formatRate(5), "0.05%");
  assert.equal(formatRate(0), "0%");
  assert.equal(formatRate(10000), "100%");
  assert.equal(formatRate(undefined), "未知");
  assert.equal(formatRate(-1), "未知");
  assert.equal(formatRate(3.5), "未知");
});
