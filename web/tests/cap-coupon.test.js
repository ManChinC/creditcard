// Tests for the monthly-cap threshold (FR-053) and the coupon state / next open date (FR-022). T037.
// Written before the implementation (web/src/sdk/cap.js and web/src/sdk/coupon.js).
//
// Formula confirmed by the user on 2026-11-04 (data-model.md):
//   single rate: threshold = cap / rate; tiers: accumulate reward tier by tier until it reaches the cap;
//   a non-integer result is rounded up; unknown cap or rate -> unknown, never guessed.
// Rates are basis points (3.5% = 350), amounts are whole TWD.
//
// Interface under test:
//   capThreshold(rule)              -> { status: "known", amount } | { status: "unknown" } | { status: "no-cap" } | { status: "not-reached" }
//   capExplanation(rule, allRules)  -> { threshold: <capThreshold result>, sharedWith: [{ channel, paymentMethod }] }
//   nextOpenDate(cycle, today)      -> { status: "known", date } | { status: "ended" } | { status: "unknown" }   (today and date are "YYYY-MM-DD")
//   couponState(rule, claimed)      -> "required" | "claimed" | "not-required" | "unknown"
//
// The registrationCycle anchors are not in the spec; the user confirmed them on 2026-11-04: weekday 1..7 (Monday = 1),
// day 1..28, quarters start in January, April, July and October (monthOfQuarter 1..3 is the month within the
// quarter), and "today" counts as an open day.
import test from "node:test";
import assert from "node:assert/strict";
import { capThreshold, capExplanation } from "../src/sdk/cap.js";
import { nextOpenDate, couponState } from "../src/sdk/coupon.js";

const known = (amount) => ({ status: "known", amount });

// ---- capThreshold ----

test("single rate: cap 500 at 5% is reached at 10,000 (the user's own example)", () => {
  assert.deepEqual(capThreshold({ tiers: [{ rate: 500 }], rewardCap: 500 }), known(10000));
});

test("a non-integer threshold is rounded up, because the cap is only reached at that amount", () => {
  // 100 / 3% = 3333.33...; at 3333 the reward is 99.99, at 3334 it is 100.02.
  assert.deepEqual(capThreshold({ tiers: [{ rate: 300 }], rewardCap: 100 }), known(3334));
});

test("a 100% rate reaches the cap at the cap amount", () => {
  assert.deepEqual(capThreshold({ tiers: [{ rate: 10000 }], rewardCap: 1 }), known(1));
});

test("tiers: reward accumulates tier by tier", () => {
  // 5,000 at 2% = 100, then 5% on the rest: cap 300 needs 200 more = 4,000 more.
  const rule = { tiers: [{ upTo: 5000, rate: 200 }, { rate: 500 }], rewardCap: 300 };
  assert.deepEqual(capThreshold(rule), known(9000));
});

test("tiers: a cap reached inside the first tier ignores later tiers", () => {
  const rule = { tiers: [{ upTo: 5000, rate: 200 }, { rate: 500 }], rewardCap: 50 };
  assert.deepEqual(capThreshold(rule), known(2500));
});

test("tiers: a cap reached exactly at a tier boundary", () => {
  const rule = { tiers: [{ upTo: 5000, rate: 200 }, { rate: 500 }], rewardCap: 100 };
  assert.deepEqual(capThreshold(rule), known(5000));
});

test("tiers: fractional rewards at a boundary are handled exactly, then rounded up once", () => {
  // 1,000 at 3.33% = 33.3, the other 66.7 at 1% = 6,670 more -> 7,670 exactly.
  assert.deepEqual(capThreshold({ tiers: [{ upTo: 1000, rate: 333 }, { rate: 100 }], rewardCap: 100 }), known(7670));
  // 5,000 at 2% = 100, the last 2 at 3% = 66.67 more -> rounded up to 67 -> 5,067.
  assert.deepEqual(capThreshold({ tiers: [{ upTo: 5000, rate: 200 }, { rate: 300 }], rewardCap: 102 }), known(5067));
});

test("tiers: three tiers", () => {
  // 2,000 at 1% = 20; 4,000 at 3% = 120 (140 at 6,000); the last 60 at 5% = 1,200 more -> 7,200.
  const rule = { tiers: [{ upTo: 2000, rate: 100 }, { upTo: 6000, rate: 300 }, { rate: 500 }], rewardCap: 200 };
  assert.deepEqual(capThreshold(rule), known(7200));
});

test("an unknown cap is reported as unknown, not guessed (FR-053, FR-008)", () => {
  assert.deepEqual(capThreshold({ tiers: [{ rate: 500 }] }), { status: "unknown" });
});

test("a rule stating there is no cap is reported as no cap", () => {
  assert.deepEqual(capThreshold({ tiers: [{ rate: 500 }], noCap: true }), { status: "no-cap" });
});

test("[INFERRED] a rule that states both a cap and no cap contradicts itself and is reported as unknown", () => {
  assert.deepEqual(capThreshold({ tiers: [{ rate: 500 }], rewardCap: 500, noCap: true }), { status: "unknown" });
});

test("missing or empty tiers give unknown", () => {
  assert.deepEqual(capThreshold({ rewardCap: 500 }), { status: "unknown" });
  assert.deepEqual(capThreshold({ tiers: [], rewardCap: 500 }), { status: "unknown" });
});

test("a cap that the rates can never reach is reported as not reached", () => {
  assert.deepEqual(capThreshold({ tiers: [{ rate: 0 }], rewardCap: 500 }), { status: "not-reached" });
  assert.deepEqual(capThreshold({ tiers: [{ upTo: 5000, rate: 200 }, { rate: 0 }], rewardCap: 300 }), { status: "not-reached" });
  // ...but reaching it exactly at the last paying tier's end still counts.
  assert.deepEqual(capThreshold({ tiers: [{ upTo: 5000, rate: 200 }, { rate: 0 }], rewardCap: 100 }), known(5000));
});

test("malformed tiers give unknown rather than a number", () => {
  assert.deepEqual(capThreshold({ tiers: [{ upTo: 5000 }], rewardCap: 100 }), { status: "unknown" });
  assert.deepEqual(capThreshold({ tiers: [{ rate: 3.5 }], rewardCap: 100 }), { status: "unknown" });
  assert.deepEqual(capThreshold({ tiers: [{ rate: 300 }], rewardCap: 0 }), { status: "unknown" });
});

// ---- capExplanation (capGroup) ----

test("rules of the same card in the same capGroup share one cap, and the explanation names the other rules", () => {
  const a = { issuer: "富邦", cardName: "J 卡", channel: "百貨", paymentMethod: "行動支付", tiers: [{ rate: 500 }], rewardCap: 500, capGroup: "g" };
  const b = { issuer: "富邦", cardName: "J 卡", channel: "餐飲", paymentMethod: "行動支付", tiers: [{ rate: 500 }], rewardCap: 500, capGroup: "g" };
  const result = capExplanation(a, [a, b]);
  assert.deepEqual(result.threshold, known(10000));
  assert.deepEqual(result.sharedWith, [{ channel: "餐飲", paymentMethod: "行動支付" }]);
});

test("a rule without capGroup shares with nobody, and another card's identical group name is not shared", () => {
  const a = { issuer: "富邦", cardName: "J 卡", channel: "百貨", paymentMethod: "行動支付", tiers: [{ rate: 500 }], rewardCap: 500 };
  const other = { issuer: "國泰", cardName: "CUBE 卡", channel: "餐飲", paymentMethod: "行動支付", tiers: [{ rate: 500 }], rewardCap: 500, capGroup: "g" };
  const sameGroupOtherCard = { ...other, channel: "百貨" };
  assert.deepEqual(capExplanation(a, [a, other]).sharedWith, []);
  const grouped = { ...a, capGroup: "g" };
  assert.deepEqual(capExplanation(grouped, [grouped, sameGroupOtherCard]).sharedWith, []);
});

// ---- nextOpenDate ----
// 2026-11-04 is a Wednesday.

test("weekly: the next matching weekday, today included", () => {
  assert.deepEqual(nextOpenDate({ kind: "weekly", weekday: 3 }, "2026-11-04"), { status: "known", date: "2026-11-04" });
  assert.deepEqual(nextOpenDate({ kind: "weekly", weekday: 5 }, "2026-11-04"), { status: "known", date: "2026-11-06" });
  assert.deepEqual(nextOpenDate({ kind: "weekly", weekday: 1 }, "2026-11-04"), { status: "known", date: "2026-11-09" });
  assert.deepEqual(nextOpenDate({ kind: "weekly", weekday: 2 }, "2026-11-04"), { status: "known", date: "2026-11-10" });
});

test("monthly: this month if the day is not past, otherwise next month, across a year end", () => {
  assert.deepEqual(nextOpenDate({ kind: "monthly", day: 15 }, "2026-11-04"), { status: "known", date: "2026-11-15" });
  assert.deepEqual(nextOpenDate({ kind: "monthly", day: 4 }, "2026-11-04"), { status: "known", date: "2026-11-04" });
  assert.deepEqual(nextOpenDate({ kind: "monthly", day: 3 }, "2026-11-04"), { status: "known", date: "2026-12-03" });
  assert.deepEqual(nextOpenDate({ kind: "monthly", day: 5 }, "2026-12-20"), { status: "known", date: "2027-01-05" });
});

test("quarterly: quarters start in January, April, July and October", () => {
  // monthOfQuarter 1 -> Jan/Apr/Jul/Oct; 2 -> Feb/May/Aug/Nov; 3 -> Mar/Jun/Sep/Dec.
  assert.deepEqual(nextOpenDate({ kind: "quarterly", monthOfQuarter: 1, day: 10 }, "2026-11-04"), { status: "known", date: "2027-01-10" });
  assert.deepEqual(nextOpenDate({ kind: "quarterly", monthOfQuarter: 2, day: 4 }, "2026-11-04"), { status: "known", date: "2026-11-04" });
  assert.deepEqual(nextOpenDate({ kind: "quarterly", monthOfQuarter: 2, day: 3 }, "2026-11-04"), { status: "known", date: "2027-02-03" });
  assert.deepEqual(nextOpenDate({ kind: "quarterly", monthOfQuarter: 3, day: 1 }, "2026-11-04"), { status: "known", date: "2026-12-01" });
});

test("once per campaign: upcoming, open now, or ended", () => {
  const cycle = { kind: "once", opensOn: "2026-12-01", closesOn: "2026-12-31" };
  assert.deepEqual(nextOpenDate(cycle, "2026-11-04"), { status: "known", date: "2026-12-01" });
  assert.deepEqual(nextOpenDate(cycle, "2026-12-15"), { status: "known", date: "2026-12-15" });
  assert.deepEqual(nextOpenDate(cycle, "2026-12-31"), { status: "known", date: "2026-12-31" });
  assert.deepEqual(nextOpenDate(cycle, "2027-01-01"), { status: "ended" });
});

test("a missing or incomplete cycle is unknown, never guessed (FR-008)", () => {
  assert.deepEqual(nextOpenDate(undefined, "2026-11-04"), { status: "unknown" });
  assert.deepEqual(nextOpenDate({}, "2026-11-04"), { status: "unknown" });
  assert.deepEqual(nextOpenDate({ kind: "weekly" }, "2026-11-04"), { status: "unknown" });
  assert.deepEqual(nextOpenDate({ kind: "monthly" }, "2026-11-04"), { status: "unknown" });
  assert.deepEqual(nextOpenDate({ kind: "once", opensOn: "2026-12-01" }, "2026-11-04"), { status: "unknown" });
  assert.deepEqual(nextOpenDate({ kind: "daily" }, "2026-11-04"), { status: "unknown" });
});

test("the date is computed from the day the caller passes in, so the result is deterministic", () => {
  const cycle = { kind: "monthly", day: 15 };
  assert.deepEqual(nextOpenDate(cycle, "2026-01-31"), { status: "known", date: "2026-02-15" });
  assert.deepEqual(nextOpenDate(cycle, "2026-01-31"), nextOpenDate(cycle, "2026-01-31"));
});

// ---- couponState ----

test("coupon state: needs one, claimed, not needed, unknown (FR-022)", () => {
  assert.equal(couponState({ couponRequired: true }, false), "required");
  assert.equal(couponState({ couponRequired: true }, true), "claimed");
  assert.equal(couponState({ couponRequired: false }, false), "not-required");
  assert.equal(couponState({}, false), "unknown");
});

test("a local 'claimed' mark never turns an unknown or not-required rule into something else", () => {
  assert.equal(couponState({ couponRequired: false }, true), "not-required");
  assert.equal(couponState({}, true), "unknown");
});
