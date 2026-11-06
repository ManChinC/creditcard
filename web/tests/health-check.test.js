// Tests for the card health check (T049, FR-009, FR-010, FR-013, SC-004). Written before web/src/sdk/health-check.js.
//
// Interface under test:
//   healthCheck({ rewardState, rules, heldCards, rows, paymentMethod, userChannels })
//     rewardState: what loadRewardData returned. Anything but status "ok" gives no conclusion.
//     rules:       RewardRule list (published, overrides already applied by the caller).
//     rows:        [{ channelName, monthlyAverage (integer TWD or null), current: { issuer, name } | null }]
//   -> { status: "unavailable" | "invalid", failures? }                                  (no rows, no verdict)
//    | { status: "ok", lastVerifiedAt, verdict, complete, totalMonthlyGain, rows: [...] }
//   verdict: "changes-suggested" (some channel has a better card) | "no-change" (every channel's current card is
//            best) | "incomplete" (nothing better found, but some channel could not be judged).
//   row.status: "better-available" | "current-best" | "current-unknown" | "no-spend" | "no-data".
//   Amounts are integer TWD per month, computed by code (Constitution X).
//
// Readings of the spec that the user has not confirmed yet ([INFERRED]):
//   - the monthly reward of a card is floor(monthlyAverage x first-tier rate / 10000), limited to rewardCap when the
//     rule states one (the ranking also compares first-tier rates because usage is not tracked);
//   - the better card is the one with the largest limited reward; ties keep the ranking order and a tie with the
//     current card means "current-best";
//   - a current card with no rule for the channel and payment method, or no current card, makes the row
//     "current-unknown": the best card is still shown but no difference is computed.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ROOT, rules as validatorRules } from "./helpers.js";
import { loadRewardData } from "../src/sdk/reward-data.js";
import { healthCheck } from "../src/sdk/health-check.js";

const text = readFileSync(path.join(ROOT, "web", "tests", "fixtures", "reward-data.json"), "utf8");
const rewardState = loadRewardData({ text, rules: validatorRules });
const data = JSON.parse(text);

const 甲 = { issuer: "國泰", name: "測試卡甲" };
const 乙 = { issuer: "富邦", name: "測試卡乙" };
const 丙 = { issuer: "永豐", name: "測試卡丙" };
const 丁 = { issuer: "台新", name: "測試卡丁" };

function run(rows, over = {}) {
  return healthCheck({ rewardState, rules: data.rules, heldCards: [甲, 乙], rows, paymentMethod: "實體卡", userChannels: [], ...over });
}
const row = (channelName, monthlyAverage, current) => ({ channelName, monthlyAverage, current });

test("a better card is found per channel, with the difference computed from the limited rewards", () => {
  // 餐飲 30000: 甲 2% = 600 limited to its cap 200; 乙 3% = 900 -> cap 500; 丙 3% = 900 (no cap); 丁 10% = 3000 -> cap 100.
  const result = run([row("餐飲", 30000, 甲)]);
  assert.equal(result.status, "ok");
  const r = result.rows[0];
  assert.equal(r.status, "better-available");
  assert.deepEqual([r.best.issuer, r.best.cardName], ["永豐", "測試卡丙"]);
  assert.equal(r.best.reward, 900);
  assert.equal(r.best.capped, false);
  assert.equal(r.current.reward, 200);
  assert.equal(r.current.capped, true);
  assert.equal(r.difference, 700);
  assert.equal(result.verdict, "changes-suggested");
  assert.equal(result.totalMonthlyGain, 700);
});

test("rewards are rounded down to whole TWD", () => {
  // 加油 3333: 甲 3% = 99.99 -> 99; 乙 3% (no cap) = 99; 丙 4% = 133.32 -> 133, under its cap 200.
  const r = run([row("加油", 3333, 乙)]).rows[0];
  assert.equal(r.current.reward, 99);
  assert.equal(r.best.reward, 133);
  assert.equal(r.difference, 34);
});

test("the coupon state and the source of the better card are carried to the result (FR-010)", () => {
  const result = run([row("加油", 4000, 乙)]);
  const r = result.rows[0];
  assert.equal(r.best.cardName, "測試卡丙");
  assert.equal(r.best.couponState, "required");
  assert.equal(r.best.rule.source, "https://example.com/synthetic/10");
  assert.equal(r.best.rule.verifiedAt.length, 10);
  assert.equal(result.lastVerifiedAt, "2026-11-01");
});

test("when the current card is already the best the channel says so and no difference is shown", () => {
  // 百貨 8000: 甲 1% = 80, 丙 1.5% = 120.
  const r = run([row("百貨", 8000, 丙)]).rows[0];
  assert.equal(r.status, "current-best");
  assert.equal(r.difference, 0);
  assert.equal(r.best.cardName, "測試卡丙");
});

test("a tie with the current card counts as the current card being best", () => {
  // Without 丙, 加油 1000 gives 甲 3% = 30 and 乙 3% = 30: a pure tie, so the current card (乙) stays best.
  const rulesWithoutBing = data.rules.filter((x) => x.cardName !== "測試卡丙");
  const r = run([row("加油", 1000, 乙)], { rules: rulesWithoutBing }).rows[0];
  assert.equal(r.status, "current-best");
  assert.equal(r.current.reward, 30);
});

test("every channel's current card best gives 'no-change' (US3 scenario 2)", () => {
  const result = run([row("百貨", 8000, 丙), row("餐飲", 1000, 丁)]);
  assert.equal(result.verdict, "no-change");
  assert.equal(result.complete, true);
  assert.equal(result.totalMonthlyGain, 0);
});

test("the gain is the sum of the channels that have a better card", () => {
  const result = run([row("餐飲", 30000, 甲), row("百貨", 8000, 丙), row("加油", 10000, 丙)]);
  // 加油 10000: 丙 4% = 400 -> cap 200; 乙 3% = 300 (no cap); 甲 3% = 300 -> cap 150. Best 乙 300, gain 100.
  assert.equal(result.rows[2].status, "better-available");
  assert.equal(result.rows[2].difference, 100);
  assert.equal(result.totalMonthlyGain, 800);
  assert.equal(result.verdict, "changes-suggested");
});

test("a current card without a rule for the channel is unknown: the best card is shown, no difference", () => {
  const r = run([row("加油", 4000, 丁)]).rows[0]; // 丁 has no 加油 rule
  assert.equal(r.status, "current-unknown");
  assert.equal(r.current, null);
  assert.equal(r.difference, null);
  assert.equal(r.best.cardName, "測試卡丙");
});

test("no current card in a channel is unknown, not a guess", () => {
  const r = run([row("餐飲", 5000, null)]).rows[0];
  assert.equal(r.status, "current-unknown");
  assert.equal(r.difference, null);
});

test("no monthly amount (null or 0) cannot be judged and is not guessed", () => {
  const result = run([row("餐飲", null, 甲), row("百貨", 0, 丙)]);
  assert.deepEqual(result.rows.map((r) => r.status), ["no-spend", "no-spend"]);
  assert.equal(result.rows[0].best, null);
  assert.equal(result.verdict, "incomplete");
  assert.equal(result.complete, false);
});

test("a channel the published data does not cover is 'no-data'", () => {
  const result = run([row("旅遊", 9000, 甲)]);
  assert.equal(result.rows[0].status, "no-data");
  assert.equal(result.verdict, "incomplete");
});

test("'no-change' is never claimed while some channel could not be judged", () => {
  const result = run([row("百貨", 8000, 丙), row("旅遊", 9000, 甲)]);
  assert.equal(result.verdict, "incomplete");
  assert.equal(result.complete, false);
});

test("a better card in one channel is still reported when another channel could not be judged", () => {
  const result = run([row("餐飲", 30000, 甲), row("旅遊", 9000, 甲)]);
  assert.equal(result.verdict, "changes-suggested");
  assert.equal(result.complete, false);
});

test("no channels at all gives no conclusion", () => {
  const result = run([]);
  assert.equal(result.verdict, "incomplete");
  assert.equal(result.complete, false);
});

test("the channel name is resolved through the user's channel aliases", () => {
  const userChannels = [{ id: "c1", name: "吃飯", aliases: ["餐飲"], origin: "custom" }];
  const r = run([row("吃飯", 30000, 甲)], { userChannels }).rows[0];
  assert.equal(r.channel, "餐飲");
  assert.equal(r.status, "better-available");
});

test("data that could not be read or did not pass the Validator gives no conclusion (US3 scenario 3)", () => {
  for (const state of [{ status: "unavailable" }, { status: "invalid", failures: [{ rule: "x", path: "", code: "C" }] }]) {
    const result = run([row("餐飲", 30000, 甲)], { rewardState: state });
    assert.equal(result.status, state.status);
    assert.equal("verdict" in result, false);
    assert.equal("rows" in result, false);
  }
});

test("a rule with an unusable rate leaves the card out; a held card without a rule is unknown, never zero", () => {
  const broken = data.rules.map((x) => (x.cardName === "測試卡甲" && x.channel === "餐飲" && x.paymentMethod === "實體卡" ? { ...x, tiers: [] } : x));
  const r = run([row("餐飲", 30000, 甲)], { rules: broken }).rows[0];
  assert.equal(r.status, "current-unknown");
  assert.equal(r.difference, null);
});

test("a rule overridden by the user is marked in the result", () => {
  const edited = data.rules.map((x) => (x.cardName === "測試卡甲" && x.channel === "餐飲" && x.paymentMethod === "實體卡"
    ? { ...x, tiers: [{ rate: 900 }], rewardCap: 5000, isUserOverride: true, overriddenAt: "2026-11-04" } : x));
  const r = run([row("餐飲", 30000, 乙)], { rules: edited }).rows[0];
  assert.equal(r.best.cardName, "測試卡甲");
  assert.equal(r.best.rule.isUserOverride, true);
});

test("the amounts agree with an independent recomputation for every fixture channel and card (SC-004)", () => {
  for (const channel of [...new Set(data.rules.map((x) => x.channel))]) {
    for (const monthly of [1, 999, 10000, 123456]) {
      for (const current of [甲, 乙, 丙, 丁]) {
        const r = run([row(channel, monthly, current)]).rows[0];
        const mine = data.rules.filter((x) => x.channel === channel && x.paymentMethod === "實體卡")
          .map((x) => {
            const raw = Math.floor((monthly * x.tiers[0].rate) / 10000);
            return { name: x.cardName, reward: x.rewardCap !== undefined && x.noCap !== true ? Math.min(raw, x.rewardCap) : raw };
          });
        const cur = mine.find((m) => m.name === current.name);
        if (!cur) { assert.equal(r.status, "current-unknown"); continue; }
        const top = Math.max(...mine.map((m) => m.reward));
        assert.equal(r.best.reward, Math.max(top, cur.reward), `${channel} ${monthly} ${current.name}`);
        assert.equal(r.current.reward, cur.reward);
        assert.equal(r.difference, Math.max(0, top - cur.reward));
      }
    }
  }
});

test("a channel whose name only overlaps a published one is 'no-data' with that name offered as a candidate", () => {
  const userChannels = [{ id: "dept", name: "百貨 / GlobalMall", aliases: [], origin: "default" }];
  const r = run([{ channelId: "dept", channelName: "百貨 / GlobalMall", monthlyAverage: 8000, current: 丙 }], { userChannels }).rows[0];
  assert.equal(r.status, "no-data");
  assert.equal(r.channelId, "dept");
  assert.deepEqual(r.candidates, ["百貨"]);
});

test("a channel the user confirmed as a published one (canonicalId) is compared like any other", () => {
  const userChannels = [{ id: "dept", name: "百貨 / GlobalMall", aliases: [], origin: "default", canonicalId: "百貨" }];
  const r = run([{ channelId: "dept", channelName: "百貨 / GlobalMall", monthlyAverage: 8000, current: 丙 }], { userChannels }).rows[0];
  assert.equal(r.status, "current-best");
  assert.equal(r.channel, "百貨");
});
