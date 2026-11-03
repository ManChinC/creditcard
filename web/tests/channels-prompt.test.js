// Tests for channels (T027), the prompt (T025) and settings.
import test from "node:test";
import assert from "node:assert/strict";
import { freshStore, rules, SETTINGS } from "./helpers.js";
import { evaluate } from "../src/validator/executor.js";
import { seedDefaultChannels, matchChannel, addChannel, updateChannel, removeChannel, normalizeName } from "../src/sdk/channels.js";
import { CATCHALL_CHANNEL_ID, DEFAULT_CHANNELS } from "../src/sdk/default-channels.js";
import { makeHabit, makeMapping } from "../src/sdk/models.js";
import { loadSettings, saveSettings } from "../src/sdk/settings.js";
import { buildPrompt, PROMPT_EXAMPLE, PROMPT_VERSION, PROMPT_NOTICE } from "../src/ui/prompt.js";

test("seeding puts the 11 defaults in storage once and never overwrites a user's edit", () => {
  const { store } = freshStore({ seed: false });
  assert.equal(seedDefaultChannels(store).length, 11);
  updateChannel(store, "fuel", { name: "加油（自訂）" });
  assert.equal(seedDefaultChannels(store).length, 11);
  assert.equal(store.get("channels", "fuel").name, "加油（自訂）");
});

test("matching ignores case, spacing and full-width forms, and falls back to the catch-all (FR-004)", () => {
  const { store } = freshStore();
  const channels = store.list("channels");
  assert.deepEqual(matchChannel("  加油 ", channels), { id: "fuel", matched: true });
  assert.deepEqual(matchChannel("百貨 / globalmall", channels), { id: "dept", matched: true });
  assert.deepEqual(matchChannel("Ｇｌｏｂａｌ", channels), { id: CATCHALL_CHANNEL_ID, matched: false });
  assert.deepEqual(matchChannel("完全不認識", channels), { id: CATCHALL_CHANNEL_ID, matched: false });
  assert.equal(normalizeName("ＡＢ  c"), "ab c");
});

test("custom channels can be added with aliases, and aliases are used for matching (FR-031)", () => {
  const { store } = freshStore();
  const added = addChannel(store, { name: "健身房", aliases: ["gym", "健身"] });
  assert.equal(added.ok, true);
  assert.equal(added.channel.origin, "custom");
  assert.equal(matchChannel("GYM", store.list("channels")).id, added.channel.id);
});

test("a name or alias that already exists is refused, for add and update", () => {
  const { store } = freshStore();
  assert.equal(addChannel(store, { name: "加油" }).failures[0].code, "DUPLICATE_NAME");
  const gym = addChannel(store, { name: "健身房", aliases: ["gym"] }).channel;
  assert.equal(addChannel(store, { name: "新通路", aliases: ["GYM"] }).failures[0].code, "DUPLICATE_NAME");
  assert.equal(updateChannel(store, gym.id, { name: "加油" }).failures[0].code, "DUPLICATE_NAME");
  assert.equal(updateChannel(store, gym.id, { name: "健身房 2" }).ok, true);
  assert.equal(updateChannel(store, "nope", { name: "x" }).failures[0].code, "UNKNOWN_CHANNEL");
});

test("the catch-all can never be removed; other channels can, along with their habit and mapping (FR-004, FR-031)", () => {
  const { store } = freshStore();
  assert.equal(removeChannel(store, CATCHALL_CHANNEL_ID).failures[0].code, "CATCHALL_PROTECTED");
  store.put("mappings", makeMapping({ channelId: "fuel", source: "imported" }));
  store.put("habits", makeHabit({ channelId: "fuel" }));
  assert.equal(removeChannel(store, "fuel").ok, true);
  assert.equal(store.get("channels", "fuel"), undefined);
  assert.equal(store.get("mappings", "fuel"), undefined);
  assert.equal(store.get("habits", "fuel"), undefined);
  assert.equal(removeChannel(store, "fuel").failures[0].code, "UNKNOWN_CHANNEL");
});

test("settings default to 10,000 and keep the user's choice (FR-027)", () => {
  const { store } = freshStore();
  assert.deepEqual(loadSettings(store), { largeItemThreshold: 10000 });
  assert.equal(saveSettings(store, { largeItemThreshold: 30000 }).ok, true);
  assert.deepEqual(loadSettings(store), { largeItemThreshold: 30000 });
  assert.equal(saveSettings(store, { largeItemThreshold: 0 }).ok, false);
  assert.deepEqual(loadSettings(store), { largeItemThreshold: 30000 });
});

test("the example inside the prompt passes the real paste-input rules, so the prompt cannot drift from the format", () => {
  assert.equal(evaluate(rules, "paste-input", PROMPT_EXAMPLE, SETTINGS).decision, "allow");
  assert.equal(PROMPT_EXAMPLE.formatVersion, PROMPT_VERSION);
});

test("the prompt asks for JSON only, TWD only, totals only and never asks for card numbers or names (FR-039)", () => {
  const prompt = buildPrompt();
  assert.ok(prompt.includes(`格式版本 ${PROMPT_VERSION}`));
  assert.ok(prompt.includes("只輸出 JSON"));
  assert.ok(prompt.includes("新台幣"));
  assert.ok(prompt.includes("不要輸出逐筆消費明細"));
  assert.ok(prompt.includes("不要輸出卡號、末四碼、安全碼、姓名"));
  assert.equal(/請(提供|輸入|列出)[^。\n]*卡號/.test(prompt), false);
});

test("the prompt carries the user's large-item threshold and the channel names (FR-040)", () => {
  const prompt = buildPrompt({ largeItemThreshold: 25000, channelNames: DEFAULT_CHANNELS.map((c) => c.name) });
  assert.ok(prompt.includes("25000"));
  assert.ok(prompt.includes("單筆"));
  for (const c of DEFAULT_CHANNELS) assert.ok(prompt.includes(c.name), c.name);
  assert.ok(buildPrompt().includes("10000"));
});

test("the page warns the user to mask sensitive data before giving records to an LLM (FR-039)", () => {
  assert.ok(PROMPT_NOTICE.includes("遮蔽"));
  assert.ok(PROMPT_NOTICE.includes("不受本系統控制"));
});
