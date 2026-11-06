// Failed channel searches kept for the administrator (decision 2026-11-06; T092 option "local queue + user export").
// The public page has no back end and sends nothing (FR-032, SC-010): a search that matches no published channel is
// written to a queue in THIS browser, and the user decides whether to copy the report text and pass it on.
// Only the typed channel name (at most 30 characters, no markup, no card-number-like digits) and the date are kept;
// the Validator (stored-feedback) refuses anything else. Nothing here touches the network or the clipboard.
//
// [INFERRED] (not confirmed by the user): the record fields, the 50-record cap (oldest dropped), one record per
// distinct text, and the report layout. How the report reaches the administrator is [TBD: T092].

import { makeFeedback } from "./models.js";
import { todayDate } from "./snapshot.js";

export const MAX_FEEDBACK = 50;
export const KIND_CHANNEL_NOT_FOUND = "channel-not-found";

const clean = (s) => String(s ?? "").normalize("NFKC").trim().replace(/\s+/g, " ");

// Same text -> same id, so repeating a search does not add a second record (FNV-1a, 32 bit; not a security feature).
export function feedbackId(kind, text) {
  let h = 0x811c9dc5;
  for (const ch of `${kind}|${clean(text).toLowerCase()}`) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `fb-${h.toString(16).padStart(8, "0")}`;
}

export function listFeedback(store) {
  return store.list("feedback").sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1));
}

// -> { ok, recorded } . Empty text is ignored; a text the Validator refuses is not stored (ok:false).
export function recordFailure(store, kind, text, now = new Date()) {
  const value = clean(text);
  if (value === "") return { ok: true, recorded: false };
  const id = feedbackId(kind, value);
  if (store.get("feedback", id) !== undefined) return { ok: true, recorded: false };
  const record = makeFeedback({ id, kind, text: value, createdAt: todayDate(now) });
  if (!store.validate("feedback", record).ok) return { ok: false, recorded: false };
  const existing = listFeedback(store);
  for (const old of existing.slice(0, Math.max(0, existing.length - MAX_FEEDBACK + 1))) store.remove("feedback", old.id);
  const result = store.put("feedback", record);
  return { ok: result.ok, recorded: result.ok };
}

export function clearFeedback(store) {
  for (const r of store.list("feedback")) store.remove("feedback", r.id);
  return { ok: true };
}

// Plain text the user can copy. lastVerifiedAt is the published data's date (public information) or null.
export function buildReport(store, { lastVerifiedAt = null, now = new Date() } = {}) {
  const items = listFeedback(store);
  const lines = [
    "通路比對失敗回報（由使用者自行複製與傳送，本頁不會自動送出）",
    `產生日期：${todayDate(now)}`,
    `回饋資料最後查證日期：${lastVerifiedAt ?? "未知"}`,
    `筆數：${items.length}`,
    "",
    ...items.map((r) => `- ${r.text}（${r.createdAt}）`),
  ];
  return lines.join("\n");
}
