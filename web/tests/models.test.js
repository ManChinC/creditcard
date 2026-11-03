// Tests for shared models and the 11 default channels (T018).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { evaluate } from "../src/validator/executor.js";
import { DEFAULT_CHANNELS, CATCHALL_CHANNEL_ID } from "../src/sdk/default-channels.js";
import { ISSUERS, MAPPING_SOURCES, SNAPSHOT_SOURCES, CHANNEL_ORIGINS, DEFAULT_LARGE_ITEM_THRESHOLD, makeChannel, makeMapping, makeHabit, makeSettings } from "../src/sdk/models.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const rules = JSON.parse(readFileSync(path.join(ROOT, "rules", "validator-rules.json"), "utf8"));

function enumOf(ruleSet, ruleId) {
  const rule = rules.ruleSets[ruleSet].rules.find((r) => r.id === ruleId);
  return rule.checks.find((c) => "enum" in c).enum;
}

test("there are exactly the 11 default channels from the spec", () => {
  assert.equal(DEFAULT_CHANNELS.length, 11);
  assert.deepEqual(
    DEFAULT_CHANNELS.map((c) => c.name),
    [
      "百貨 / GlobalMall",
      "餐飲（含連加 LinePay）",
      "旅遊訂房 / 機票",
      "日本 / 國外實體",
      "加油",
      "海外訂閱（Claude / YT / Apple）",
      "飲料咖啡（連加支付）",
      "叫車 / 交通",
      "政府繳費 / 稅款",
      "悠遊卡自動儲值",
      "無腦刷",
    ],
  );
});

test("default channel ids are unique and the catch-all exists (FR-004)", () => {
  const ids = DEFAULT_CHANNELS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes(CATCHALL_CHANNEL_ID));
  assert.equal(DEFAULT_CHANNELS.find((c) => c.id === CATCHALL_CHANNEL_ID).name, "無腦刷");
});

test("every default channel passes the stored-channel rules", () => {
  for (const c of DEFAULT_CHANNELS) {
    assert.equal(evaluate(rules, "stored-channel", c).decision, "allow", c.id);
  }
});

test("default channels cannot be changed at run time", () => {
  assert.throws(() => {
    DEFAULT_CHANNELS[0].name = "改掉";
  }, TypeError);
  assert.throws(() => DEFAULT_CHANNELS.push({}), TypeError);
});

test("constant lists in models.js match the enums in the rules file (no drift)", () => {
  assert.deepEqual([...ISSUERS], enumOf("stored-card", "issuer"));
  assert.deepEqual([...MAPPING_SOURCES], enumOf("stored-mapping", "source"));
  assert.deepEqual([...SNAPSHOT_SOURCES], enumOf("stored-snapshot", "source"));
  assert.deepEqual([...CHANNEL_ORIGINS], enumOf("stored-channel", "origin"));
});

test("the default large-item threshold is 10,000 and settings use it (FR-027)", () => {
  assert.equal(DEFAULT_LARGE_ITEM_THRESHOLD, 10000);
  assert.equal(makeSettings().largeItemThreshold, 10000);
  assert.equal(makeSettings({ largeItemThreshold: 20000 }).largeItemThreshold, 20000);
});

test("unknown answers are omitted, never filled with defaults (US1 scenario 8)", () => {
  assert.equal("cardId" in makeHabit({ channelId: "fuel" }), false);
  assert.equal("approxMonthly" in makeHabit({ channelId: "fuel", cardId: "c1" }), false);
  assert.equal("cardId" in makeMapping({ channelId: "fuel", source: "self-reported" }), false);
});

test("factories copy their input so later edits do not leak in", () => {
  const aliases = ["a"];
  const channel = makeChannel({ id: "x", name: "x", aliases });
  aliases.push("b");
  assert.deepEqual(channel.aliases, ["a"]);
});
