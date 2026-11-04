// Local overrides of reward rules (T046, FR-021, FR-032).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ROOT, rules, freshStore } from "./helpers.js";
import { saveOverride, removeOverride, listOverrides, applyOverrides, overrideId, OVERRIDE_LABEL } from "../src/sdk/override.js";
import { rankCards } from "../src/sdk/query.js";
import { exportBackup, clearAllData } from "../src/storage/backup.js";

const data = JSON.parse(readFileSync(path.join(ROOT, "web", "tests", "fixtures", "reward-data.json"), "utf8"));
const published = (card, channel, method) => data.rules.find((r) => r.cardName === card && r.channel === channel && r.paymentMethod === method);
const NOW = new Date(2026, 10, 4);

test("an override replaces the published rule for the same card, channel and payment method, and is marked", () => {
  const { store } = freshStore();
  const original = published("測試卡甲", "餐飲", "實體卡");
  const edited = { ...original, tiers: [{ rate: 450 }] };
  assert.equal(saveOverride(store, edited, NOW).ok, true);
  const applied = applyOverrides(data.rules, listOverrides(store));
  assert.equal(applied.length, data.rules.length);
  const changed = applied.find((r) => r.cardName === "測試卡甲" && r.channel === "餐飲" && r.paymentMethod === "實體卡");
  assert.deepEqual(changed.tiers, [{ rate: 450 }]);
  assert.equal(changed.isUserOverride, true);
  assert.equal(changed.overriddenAt, "2026-11-04");
  assert.equal(OVERRIDE_LABEL, "使用者修正");
  assert.equal(applied.filter((r) => r.isUserOverride).length, 1);
});

test("the published rules are never modified, and the override has no official source of its own", () => {
  const { store } = freshStore();
  const copy = structuredClone(data.rules);
  const original = published("測試卡甲", "餐飲", "實體卡");
  saveOverride(store, { ...original, tiers: [{ rate: 450 }] }, NOW);
  applyOverrides(data.rules, listOverrides(store));
  assert.deepEqual(data.rules, copy);
  const stored = listOverrides(store)[0];
  assert.equal("source" in stored.rule, false);
  assert.equal("verifiedAt" in stored.rule, false);
});

test("an isUserOverride flag passed in is dropped; only stored overrides are marked", () => {
  const { store } = freshStore();
  const original = published("測試卡甲", "餐飲", "實體卡");
  saveOverride(store, { ...original, isUserOverride: true }, NOW);
  assert.equal("isUserOverride" in listOverrides(store)[0].rule, false);
  assert.equal(applyOverrides(data.rules, []).some((r) => r.isUserOverride), false);
});

test("an override for a rule the published data does not have is added as its own rule", () => {
  const { store } = freshStore();
  const mine = { issuer: "國泰", cardName: "我的卡", channel: "餐飲", paymentMethod: "實體卡", tiers: [{ rate: 100 }] };
  saveOverride(store, mine, NOW);
  const applied = applyOverrides(data.rules, listOverrides(store));
  assert.equal(applied.length, data.rules.length + 1);
  assert.equal(applied.at(-1).cardName, "我的卡");
  assert.equal(applied.at(-1).isUserOverride, true);
});

test("removing an override brings the published rule back", () => {
  const { store } = freshStore();
  const original = published("測試卡甲", "餐飲", "實體卡");
  saveOverride(store, { ...original, tiers: [{ rate: 450 }] }, NOW);
  assert.equal(removeOverride(store, original).ok, true);
  assert.deepEqual(listOverrides(store), []);
  assert.deepEqual(applyOverrides(data.rules, listOverrides(store)), data.rules);
});

test("saving again for the same rule replaces the earlier override", () => {
  const { store } = freshStore();
  const original = published("測試卡甲", "餐飲", "實體卡");
  saveOverride(store, { ...original, tiers: [{ rate: 450 }] }, NOW);
  saveOverride(store, { ...original, tiers: [{ rate: 500 }] }, NOW);
  assert.equal(listOverrides(store).length, 1);
  assert.deepEqual(listOverrides(store)[0].rule.tiers, [{ rate: 500 }]);
});

test("the Validator rejects bad overrides and nothing is stored", () => {
  const { store } = freshStore();
  const original = published("測試卡甲", "餐飲", "實體卡");
  const bad = [
    { ...original, tiers: [{ rate: 3.5 }] },
    { ...original, cardName: "<b>卡</b>" },
    { ...original, requiresBenefitSwitch: "false" },
    { ...original, last4: "1234" },
    { ...original, issuer: "某銀行" },
  ];
  for (const rule of bad) assert.equal(saveOverride(store, rule, NOW).ok, false);
  assert.equal(saveOverride(store, null, NOW).ok, false);
  assert.deepEqual(listOverrides(store), []);
});

test("an override changes the ranking the same way a published rule would", () => {
  const { store } = freshStore();
  const jia = published("測試卡甲", "餐飲", "實體卡");
  const held = [{ issuer: "國泰", name: "測試卡甲" }, { issuer: "富邦", name: "測試卡乙" }];
  const query = (list) => rankCards({ rules: list, heldCards: held, channel: "餐飲", paymentMethod: "實體卡" }).ranked.filter((r) => r.held).map((r) => r.cardName);
  assert.deepEqual(query(data.rules), ["測試卡乙", "測試卡甲"]);
  saveOverride(store, { ...jia, tiers: [{ rate: 900 }] }, NOW);
  assert.deepEqual(query(applyOverrides(data.rules, listOverrides(store))), ["測試卡甲", "測試卡乙"]);
});

test("the override id depends on card, channel and payment method", () => {
  const a = published("測試卡甲", "餐飲", "實體卡");
  assert.equal(overrideId(a), overrideId({ ...a, tiers: [{ rate: 1 }] }));
  assert.notEqual(overrideId(a), overrideId({ ...a, paymentMethod: "行動支付" }));
  assert.notEqual(overrideId(a), overrideId({ ...a, channel: "加油" }));
  assert.match(overrideId(a), /^override-[0-9a-f]{8}$/);
});

test("an override record whose id does not match its rule is ignored", () => {
  const { store } = freshStore();
  const rule = { issuer: "國泰", cardName: "我的卡", channel: "餐飲", paymentMethod: "實體卡", tiers: [{ rate: 100 }] };
  store.put("overrides", { id: "override-deadbeef", overriddenAt: "2026-11-04", rule });
  assert.deepEqual(listOverrides(store), []);
});

test("overrides stay in this browser: they are part of the plain backup and removed by one-click clear", () => {
  const { store, backend } = freshStore();
  saveOverride(store, published("測試卡甲", "餐飲", "實體卡"), NOW);
  const backup = exportBackup(store, NOW);
  assert.equal(backup.collections.overrides.length, 1);
  assert.equal(clearAllData(store).ok, true);
  assert.equal(backend.data.size, 0);
});

test("the stored-override rules stay in step with the published-data rules they are derived from", () => {
  const pub = rules.ruleSets["published-data"].rules;
  const stored = rules.ruleSets["stored-override"].rules;
  const skipped = new Set(["known-fields", "schema-version", "last-verified", "rules", "source", "verified-at"]);
  for (const p of pub.filter((r) => !skipped.has(r.id))) {
    const o = stored.find((r) => r.id === p.id);
    assert.ok(o, `stored-override lacks ${p.id}`);
    if (p.id === "rule-item") {
      assert.equal(o.path, "rule");
      assert.deepEqual(o.checks[0].noUnknownFields, p.checks[0].noUnknownFields.filter((f) => f !== "source" && f !== "verifiedAt"));
    } else {
      assert.equal(o.path, p.path.replace(/^rules\[\]\./, "rule."));
      assert.deepEqual(o.checks, p.checks);
    }
    assert.equal(o.reason, p.reason);
  }
  const extra = stored.filter((r) => !pub.some((p) => p.id === r.id)).map((r) => r.id).sort();
  assert.deepEqual(extra, ["id", "overridden-at", "rule"]);
});
