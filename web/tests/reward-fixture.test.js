// The fixed test data set (T040, SC-003) and the published-data loader (T041, FR-048).
// The data in fixtures/reward-data.json is synthetic: card names start with "測試", sources point to example.com,
// and none of the rates are real. The best card of each scenario is annotated by hand in reward-data.expected.json.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ROOT, rules, freshStore } from "./helpers.js";
import { evaluate } from "../src/validator/executor.js";
import { loadRewardData } from "../src/sdk/reward-data.js";
import { rankCards } from "../src/sdk/query.js";
import { capThreshold, capExplanation } from "../src/sdk/cap.js";
import { nextOpenDate, isClaimed, markClaimed, unmarkClaimed, claimId } from "../src/sdk/coupon.js";
import { designatedByCard, matchMerchant } from "../src/sdk/merchants.js";

const FIXTURES = path.join(ROOT, "web", "tests", "fixtures");
const text = readFileSync(path.join(FIXTURES, "reward-data.json"), "utf8");
const data = JSON.parse(text);
const expected = JSON.parse(readFileSync(path.join(FIXTURES, "reward-data.expected.json"), "utf8"));
const byKey = (card, channel, method) => data.rules.find((r) => r.cardName === card && r.channel === channel && r.paymentMethod === method);

function best(s) {
  return rankCards({
    rules: data.rules, heldCards: s.held, channel: s.channel, paymentMethod: s.paymentMethod,
    isClaimed: (r) => s.claimed.includes(r.cardName),
  });
}

test("the fixed data set passes the published-data rules and is clearly synthetic", () => {
  assert.equal(evaluate(rules, "published-data", data, {}).decision, "allow");
  for (const r of data.rules) {
    assert.ok(r.cardName.startsWith("測試"), r.cardName);
    assert.ok(r.source.startsWith("https://example.com/synthetic/"), r.source);
  }
});

for (const s of expected.scenarios) {
  test(`scenario ${s.id}: the annotated best card and order are returned`, () => {
    const result = best(s);
    assert.equal(result.ranked[0]?.cardName ?? null, s.expectedBest);
    assert.deepEqual(result.ranked.map((r) => r.cardName), s.expectedOrder);
    assert.deepEqual(result.unknown.map((u) => u.cardName), s.expectedUnknown);
  });
}

test("the fixed set reaches 100% agreement with the annotated best cards (SC-003 shape)", () => {
  const right = expected.scenarios.filter((s) => (best(s).ranked[0]?.cardName ?? null) === s.expectedBest).length;
  assert.equal(right, expected.scenarios.length);
});

test("cap thresholds computed from the fixture", () => {
  assert.deepEqual(capThreshold(byKey("測試卡甲", "餐飲", "行動支付")), { status: "known", amount: 6000 });
  // 3,000 at 2% = 60, the other 340 at 6% = 5,666.67 -> 5,667 more.
  assert.deepEqual(capThreshold(byKey("測試卡乙", "餐飲", "行動支付")), { status: "known", amount: 8667 });
  assert.deepEqual(capThreshold(byKey("測試卡丙", "餐飲", "實體卡")), { status: "unknown" });
  assert.deepEqual(capThreshold(byKey("測試卡乙", "加油", "實體卡")), { status: "no-cap" });
});

test("a shared cap names the other rules of the same card", () => {
  const rule = byKey("測試卡甲", "餐飲", "行動支付");
  assert.deepEqual(capExplanation(rule, data.rules).sharedWith, [{ channel: "百貨", paymentMethod: "行動支付" }]);
  assert.deepEqual(capExplanation(byKey("測試卡乙", "餐飲", "行動支付"), data.rules).sharedWith, []);
});

test("next open dates from the fixture's registration cycles (2026-11-04 is a Wednesday)", () => {
  assert.deepEqual(nextOpenDate(byKey("測試卡甲", "餐飲", "行動支付").registrationCycle, "2026-11-04"), { status: "known", date: "2026-12-01" });
  assert.deepEqual(nextOpenDate(byKey("測試卡丙", "加油", "實體卡").registrationCycle, "2026-11-04"), { status: "known", date: "2026-11-04" });
  assert.deepEqual(nextOpenDate(byKey("測試卡乙", "加油", "實體卡").registrationCycle, "2026-11-04"), { status: "unknown" });
});

test("designated merchants are listed per card and a typed name is matched against them", () => {
  const cards = designatedByCard(data.rules, "百貨");
  assert.deepEqual(cards.map((c) => [c.cardName, c.merchants.map((m) => m.name)]), [
    ["測試卡甲", ["測試百貨甲"]],
    ["測試卡丙", ["測試百貨丙", "測試百貨甲"]],
  ]);
  const jia = cards.find((c) => c.cardName === "測試卡甲");
  assert.deepEqual(matchMerchant("甲百", jia.merchants), { status: "matched", merchants: ["測試百貨甲"] });
  assert.deepEqual(matchMerchant("測試百貨丙", jia.merchants), { status: "not-listed" });
  assert.deepEqual(designatedByCard(data.rules, "餐飲").find((c) => c.cardName === "測試卡乙"), { issuer: "富邦", cardName: "測試卡乙", status: "unknown", merchants: [] });
});

// ---- loader ----

const TODAY = "2026-11-04";

test("the loader accepts the fixed data set and reports its verification date, with no stale judgement", () => {
  const result = loadRewardData({ text, rules });
  assert.equal(result.status, "ok");
  assert.equal(result.lastVerifiedAt, "2026-11-01");
  assert.equal("stale" in result, false); // user decision 2026-11-04: the public page only shows the date
  assert.equal("ageDays" in result, false);
  assert.equal(result.data.rules.length, data.rules.length);
});

test("a file that could not be read is unavailable", () => {
  assert.deepEqual(loadRewardData({ text: null, rules }), { status: "unavailable" });
  assert.deepEqual(loadRewardData({ text: undefined, rules }), { status: "unavailable" });
});

test("text that is not JSON is invalid and no data is returned", () => {
  const result = loadRewardData({ text: "<html>not json</html>", rules });
  assert.equal(result.status, "invalid");
  assert.equal(result.failures[0].code, "NOT_JSON");
  assert.equal("data" in result, false);
});

test("data that fails the rules is invalid, with the Validator's reasons and no data (FR-048, US3 scenario 3)", () => {
  const result = loadRewardData({ text: JSON.stringify({ ...data, schemaVersion: "2" }), rules });
  assert.equal(result.status, "invalid");
  assert.deepEqual(result.failures, [{ rule: "schema-version", path: "schemaVersion", code: "SCHEMA_VERSION_UNSUPPORTED" }]);
  assert.equal("data" in result, false);
});

test("a missing rule set makes the loader refuse everything", () => {
  assert.equal(loadRewardData({ text, rules: { ruleSets: {} } }).status, "invalid");
});

// ---- the user's local "claimed" marks ----

test("claimed marks are stored locally per rule and can be removed", () => {
  const { store, backend } = freshStore();
  const rule = byKey("測試卡甲", "餐飲", "行動支付");
  const other = byKey("測試卡甲", "餐飲", "實體卡");
  assert.equal(isClaimed(store, rule), false);
  assert.equal(markClaimed(store, rule, new Date(2026, 10, 4)).ok, true);
  assert.equal(isClaimed(store, rule), true);
  assert.equal(isClaimed(store, other), false);
  assert.equal(store.get("claims", claimId(rule)).claimedAt, "2026-11-04");
  assert.equal(unmarkClaimed(store, rule).ok, true);
  assert.equal(isClaimed(store, rule), false);
  markClaimed(store, rule);
  for (const v of backend.data.values()) assert.equal(/last4|cvv/i.test(v), false);
});

test("a stored claim for a different rule that happens to share the id is not trusted", () => {
  const { store } = freshStore();
  const rule = byKey("測試卡甲", "餐飲", "行動支付");
  store.put("claims", { id: claimId(rule), issuer: "富邦", cardName: "別張卡", channel: "加油", paymentMethod: "實體卡", claimedAt: "2026-11-04" });
  assert.equal(isClaimed(store, rule), false);
});
