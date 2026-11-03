// Shared helpers for tests (not a test file).
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createStore } from "../src/storage/store.js";
import { seedDefaultChannels } from "../src/sdk/channels.js";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const rules = JSON.parse(readFileSync(path.join(ROOT, "rules", "validator-rules.json"), "utf8"));

export function memoryBackend() {
  const data = new Map();
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => void data.set(k, String(v)),
    removeItem: (k) => void data.delete(k),
  };
}

export function freshStore({ seed = true } = {}) {
  const backend = memoryBackend();
  const store = createStore({ backend, rules });
  if (seed) seedDefaultChannels(store);
  return { backend, store };
}

export const SETTINGS = { largeItemThreshold: 10000 };

export function validPaste() {
  return {
    formatVersion: "1",
    period: { start: "2026-08", end: "2026-10" },
    currency: "TWD",
    cards: [
      { issuer: "國泰", name: "CUBE 卡" },
      { issuer: "富邦", name: "J 卡" },
    ],
    channels: [
      { name: "加油", total: 3600, mainCard: "CUBE 卡" },
      { name: "餐飲（含連加 LinePay）", total: 21000, mainCard: "J 卡" },
    ],
    largeItems: [{ category: "旅遊訂房 / 機票", amount: 45000 }],
  };
}
