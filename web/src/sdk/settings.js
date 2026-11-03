// User settings (FR-027): the large-item threshold, default 10,000, judged per single transaction.

import { DEFAULT_LARGE_ITEM_THRESHOLD, makeSettings, SETTINGS_ID } from "./models.js";

export function loadSettings(store) {
  const saved = store.get("settings", SETTINGS_ID);
  return saved ? { largeItemThreshold: saved.largeItemThreshold } : { largeItemThreshold: DEFAULT_LARGE_ITEM_THRESHOLD };
}

export function saveSettings(store, { largeItemThreshold }) {
  return store.put("settings", makeSettings({ largeItemThreshold }));
}
