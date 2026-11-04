// Tests for the browser storage module (T017).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createStore, browserBackend } from "../src/storage/store.js";
import { makeCard, makeChannel, makeMapping, makeHabit, makeSnapshot, makeSettings, makeClaim, makeOverride, COLLECTIONS } from "../src/sdk/models.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const rules = JSON.parse(readFileSync(path.join(ROOT, "rules", "validator-rules.json"), "utf8"));

function memoryBackend() {
  const data = new Map();
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => void data.set(k, String(v)),
    removeItem: (k) => void data.delete(k),
  };
}

const card = makeCard({ id: "cathay-cube", issuer: "國泰", name: "CUBE 卡" });

test("a valid record is stored and read back", () => {
  const store = createStore({ backend: memoryBackend(), rules });
  assert.equal(store.put("cards", card).ok, true);
  assert.deepEqual(store.get("cards", "cathay-cube"), card);
  assert.deepEqual(store.list("cards"), [card]);
});

test("last four digits, card numbers and CVV are never stored (FR-016)", () => {
  const backend = memoryBackend();
  const store = createStore({ backend, rules });
  for (const extra of [{ last4: "1234" }, { cardNumber: "4111111111111111" }, { cvv: "123" }]) {
    const result = store.put("cards", { ...card, ...extra });
    assert.equal(result.ok, false);
    assert.equal(result.failures[0].code, "UNKNOWN_FIELD");
  }
  assert.equal(backend.data.size, 0, "nothing may reach the backend");
});

test("per-transaction details cannot be stored in a snapshot (FR-029)", () => {
  const backend = memoryBackend();
  const store = createStore({ backend, rules });
  const snap = makeSnapshot({
    id: "s1",
    confirmedAt: "2026-11-03",
    period: { start: "2026-08", end: "2026-10" },
    channelTotals: [{ channelId: "fuel", total: 3600 }],
    source: "llm-paste",
  });
  assert.equal(store.put("snapshots", snap).ok, true);
  const withDetail = { ...snap, id: "s2", transactions: [{ merchant: "x", amount: 5 }] };
  assert.equal(store.put("snapshots", withDetail).ok, false);
  assert.equal(store.get("snapshots", "s2"), undefined);
});

test("every record kind built by the model factories passes its rule set", () => {
  const store = createStore({ backend: memoryBackend(), rules });
  const records = {
    cards: card,
    channels: makeChannel({ id: "custom-1", name: "我的通路", aliases: ["別名"] }),
    mappings: makeMapping({ channelId: "fuel", cardId: "cathay-cube", source: "imported" }),
    habits: makeHabit({ channelId: "fuel" }),
    snapshots: makeSnapshot({
      id: "s1",
      confirmedAt: "2026-11-03",
      period: { start: "2026-08", end: "2026-10" },
      channelTotals: [{ channelId: "fuel", total: 3600 }],
      source: "self-reported",
      largeItems: [{ category: "旅遊", amount: 45000 }],
    }),
    settings: makeSettings(),
    claims: makeClaim({ id: "claim-0a1b2c3d", issuer: "國泰", cardName: "CUBE 卡", channel: "餐飲", paymentMethod: "行動支付", claimedAt: "2026-11-04" }),
    overrides: makeOverride({ id: "override-0a1b2c3d", overriddenAt: "2026-11-04", rule: { issuer: "國泰", cardName: "CUBE 卡", channel: "餐飲", paymentMethod: "行動支付", tiers: [{ rate: 350 }] } }),
  };
  assert.deepEqual(Object.keys(records).sort(), Object.keys(COLLECTIONS).sort());
  for (const [collection, record] of Object.entries(records)) {
    assert.equal(store.put(collection, record).ok, true, collection);
  }
});

test("an unknown collection is refused", () => {
  const store = createStore({ backend: memoryBackend(), rules });
  assert.equal(store.put("passwords", { id: "x" }).failures[0].code, "UNKNOWN_COLLECTION");
  assert.deepEqual(store.list("passwords"), []);
  assert.equal(store.get("passwords", "x"), undefined);
});

test("records edited by hand into invalid shapes are dropped on read", () => {
  const backend = memoryBackend();
  const store = createStore({ backend, rules });
  store.put("cards", card);
  const raw = JSON.parse(backend.data.get("ccs:cards"));
  raw["tampered"] = { id: "tampered", issuer: "國泰", name: "x", last4: "9999" };
  backend.data.set("ccs:cards", JSON.stringify(raw));
  assert.deepEqual(store.list("cards"), [card]);
  assert.equal(store.get("cards", "tampered"), undefined);
});

test("unreadable stored text is treated as empty", () => {
  const backend = memoryBackend();
  const store = createStore({ backend, rules });
  for (const junk of ["not json", "[1,2]", "null", "5"]) {
    backend.data.set("ccs:cards", junk);
    assert.deepEqual(store.list("cards"), [], junk);
  }
});

test("an id like __proto__ is an ordinary key", () => {
  const store = createStore({ backend: memoryBackend(), rules });
  const odd = makeCard({ id: "__proto__", issuer: "永豐", name: "奇怪的 id" });
  assert.equal(store.put("cards", odd).ok, true);
  assert.deepEqual(store.get("cards", "__proto__"), odd);
  assert.equal(({}).issuer, undefined, "Object.prototype must not be touched");
});

test("a backend that throws is reported, not crashed", () => {
  const broken = {
    getItem: () => {
      throw new Error("blocked");
    },
    setItem: () => {
      throw new Error("quota");
    },
    removeItem: () => {
      throw new Error("blocked");
    },
  };
  const store = createStore({ backend: broken, rules });
  assert.equal(store.put("cards", card).failures[0].code, "STORAGE_UNAVAILABLE");
  assert.deepEqual(store.list("cards"), []);
  assert.equal(store.clearAll().failures[0].code, "STORAGE_UNAVAILABLE");
});

test("remove deletes one record and clearAll empties every collection (FR-050)", () => {
  const backend = memoryBackend();
  const store = createStore({ backend, rules });
  store.put("cards", card);
  store.put("settings", makeSettings());
  assert.equal(store.remove("cards", "cathay-cube").ok, true);
  assert.deepEqual(store.list("cards"), []);
  assert.equal(store.clearAll().ok, true);
  assert.equal(backend.data.size, 0);
});

test("stored data is plain JSON, not encrypted (AD-003)", () => {
  const backend = memoryBackend();
  createStore({ backend, rules }).put("cards", card);
  assert.deepEqual(JSON.parse(backend.data.get("ccs:cards")), { "cathay-cube": card });
});

test("browserBackend returns null when there is no localStorage (for example in Node)", () => {
  assert.equal(browserBackend(), null);
});
