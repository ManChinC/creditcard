// End-to-end privacy test for public mode storage (T023, SC-002, FR-015, FR-016, FR-029).
// After every kind of use, nothing that identifies a card or a transaction may exist in storage or in a backup.
import test from "node:test";
import assert from "node:assert/strict";
import { freshStore, rules, SETTINGS, validPaste } from "./helpers.js";
import { previewPaste, confirmImport } from "../src/sdk/import.js";
import { createSmartSession, commitSmartSession } from "../src/sdk/smart-questions.js";
import { cardIdFor } from "../src/sdk/mapping.js";
import { saveSettings } from "../src/sdk/settings.js";
import { addChannel } from "../src/sdk/channels.js";
import { exportBackup, serializeBackup, clearAllData } from "../src/storage/backup.js";
import { DEFAULT_CHANNELS } from "../src/sdk/default-channels.js";

const NOW = new Date(2026, 10, 3, 12, 0, 0);

function useEverything() {
  const { store, backend } = freshStore();
  const ctx = { rules, settings: SETTINGS, channels: store.list("channels"), snapshots: [] };
  const preview = previewPaste(JSON.stringify(validPaste()), ctx);
  assert.equal(confirmImport({ store, preview, now: NOW }).ok, true);
  const s = createSmartSession({ channels: DEFAULT_CHANNELS });
  s.answerCards([{ issuer: "台新", name: "Richart" }]);
  while (s.current().step === "channel") s.answerChannel({ cardId: cardIdFor("台新", "Richart"), approxMonthly: 800 });
  assert.equal(commitSmartSession(store, s).ok, true);
  saveSettings(store, { largeItemThreshold: 20000 });
  addChannel(store, { name: "我的健身房", aliases: ["gym"] });
  return { store, backend };
}

const FORBIDDEN_KEYS = ["last4", "cardNumber", "cvv", "merchant", "transactions", "password", "token"];

function allStoredText(backend, store) {
  return [...backend.data.values()].join("\n") + "\n" + serializeBackup(exportBackup(store, NOW));
}

test("storage and backup contain no card numbers, last four digits, CVV or transaction details", () => {
  const { store, backend } = useEverything();
  const text = allStoredText(backend, store);
  for (const key of FORBIDDEN_KEYS) assert.equal(text.includes(`"${key}"`), false, `found key ${key}`);
  assert.equal(/\d{13,}/.test(text.replace(/\s|-/g, "")), false, "no run of 13 or more digits");
  assert.equal(/\d[ -]?\d[ -]?\d[ -]?\d[ -]?\d[ -]?\d[ -]?\d[ -]?\d[ -]?\d[ -]?\d[ -]?\d[ -]?\d[ -]?\d/.test(text), false);
});

test("a snapshot holds only channel totals and large-item categories with amounts", () => {
  const { store } = useEverything();
  const [snap] = store.list("snapshots");
  for (const t of snap.channelTotals) assert.deepEqual(Object.keys(t).sort(), ["channelId", "total"]);
  for (const l of snap.largeItems) assert.deepEqual(Object.keys(l).sort(), ["amount", "category"]);
});

test("public mode never stores the last four digits, even if something tries to (FR-016)", () => {
  const { store, backend } = freshStore();
  const attempt = store.put("cards", { id: "x", issuer: "國泰", name: "CUBE 卡", last4: "1234" });
  assert.equal(attempt.ok, false);
  assert.equal(allStoredText(backend, store).includes("1234"), false);
});

test("the backup says it is plain text, and holds exactly the collections that were stored", () => {
  const { store } = useEverything();
  const backup = exportBackup(store, NOW);
  assert.equal(backup.plaintext, true);
  assert.equal(backup.exportedAt, NOW.toISOString());
  assert.deepEqual(Object.keys(backup.collections).sort(), ["cards", "channels", "claims", "feedback", "habits", "mappings", "overrides", "settings", "snapshots"]);
  assert.equal(backup.collections.settings[0].largeItemThreshold, 20000);
});

test("one-click clear leaves nothing behind (FR-050, SC-007)", () => {
  const { store, backend } = useEverything();
  assert.ok(backend.data.size > 0);
  assert.equal(clearAllData(store).ok, true);
  assert.equal(backend.data.size, 0);
  assert.deepEqual(exportBackup(store, NOW).collections.cards, []);
});
