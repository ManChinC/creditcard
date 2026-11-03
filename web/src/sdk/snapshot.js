// Summary snapshots (T030, FR-029, FR-027). No per-transaction details are ever stored.
// The 3-year retention runs from the confirmation date (confirmedAt); expiry is handled in T080.

import { makeSnapshot } from "./models.js";

function parseMonth(m) {
  const [y, mo] = m.split("-").map(Number);
  return { y, mo };
}

// Inclusive number of calendar months covered by {start, end} ("YYYY-MM").
export function monthsInPeriod(period) {
  const a = parseMonth(period.start);
  const b = parseMonth(period.end);
  return (b.y - a.y) * 12 + (b.mo - a.mo) + 1;
}

// FR-002: fewer than three months is allowed but must be flagged.
export const RECOMMENDED_MIN_MONTHS = 3;
export function isShortPeriod(period) {
  return monthsInPeriod(period) < RECOMMENDED_MIN_MONTHS;
}

export function periodsOverlap(a, b) {
  return a.start <= b.end && b.start <= a.end;
}

export function overlappingSnapshots(period, snapshots) {
  return snapshots.filter((s) => periodsOverlap(period, s.period));
}

// Local calendar date as YYYY-MM-DD.
export function todayDate(now = new Date()) {
  const y = String(now.getFullYear()).padStart(4, "0");
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function snapshotId(confirmedAt, existingIds = []) {
  const base = `snap-${confirmedAt}`;
  if (!existingIds.includes(base)) return base;
  let n = 2;
  while (existingIds.includes(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

// preview.byChannel: [{channelId, total}], preview.document.period, preview.largeItems
export function snapshotFromPreview(preview, confirmedAt, existingIds = []) {
  return makeSnapshot({
    id: snapshotId(confirmedAt, existingIds),
    confirmedAt,
    period: preview.document.period,
    channelTotals: preview.byChannel.map(({ channelId, total }) => ({ channelId, total })),
    source: "llm-paste",
    largeItems: preview.largeItems,
  });
}
