// Import pipeline for a pasted LLM summary (T026, FR-001, FR-025): parse -> validate -> preview -> confirm -> write.
// Nothing is written before the user confirms, and nothing incomplete is ever written.
// Every acceptance decision comes from the Validator (paste-input rule set); this module computes and orchestrates.

import { evaluate as defaultEvaluate } from "../validator/executor.js";
import { matchChannel, seedDefaultChannels } from "./channels.js";
import { buildCardsAndMappings } from "./mapping.js";
import { isShortPeriod, monthsInPeriod, overlappingSnapshots, snapshotFromPreview, todayDate } from "./snapshot.js";

// Upper bound on pasted text. [TBD: the spec defines no size limit; this is a placeholder.]
export const MAX_PASTE_CHARS = 200000;

function failure(code) {
  return { ok: false, failures: [{ rule: "", path: "", code }] };
}

// LLMs often wrap JSON in a Markdown code fence; a single surrounding fence is removed, nothing else is repaired.
function stripFence(text) {
  const t = text.trim();
  const m = /^```[A-Za-z]*\r?\n([\s\S]*?)\r?\n```$/.exec(t);
  return m ? m[1] : t;
}

export function parsePaste(text) {
  if (typeof text !== "string") return failure("NOT_TEXT");
  if (text.length > MAX_PASTE_CHARS) return failure("TOO_LARGE");
  try {
    return { ok: true, document: JSON.parse(stripFence(text)) };
  } catch {
    return failure("NOT_JSON");
  }
}

// Monthly averages are computed by the program (FR-013). Rounding to a whole TWD uses Math.round.
// [TBD: the spec does not define the rounding rule.]
function average(total, months) {
  return Math.round(total / months);
}

// overrides: {entryIndex: channelId} - manual reassignment of one pasted channel (FR-006).
// The same function serves an edited preview: change the document, build again, and it is re-validated.
export function buildPreview(document, { rules, settings, channels, snapshots = [], overrides = {}, evaluate = defaultEvaluate }) {
  const verdict = evaluate(rules, "paste-input", document, { largeItemThreshold: settings.largeItemThreshold });
  if (verdict.decision !== "allow") return { ok: false, failures: verdict.failures };

  const known = new Set(channels.map((c) => c.id));
  for (const [i, id] of Object.entries(overrides)) {
    if (!known.has(id) || !Number.isInteger(Number(i)) || Number(i) < 0 || Number(i) >= document.channels.length) {
      return failure("BAD_OVERRIDE");
    }
  }

  const months = monthsInPeriod(document.period);
  const entries = document.channels.map((c, i) => {
    const m = matchChannel(c.name, channels);
    return {
      name: c.name,
      total: c.total,
      mainCard: c.mainCard,
      channelId: overrides[i] ?? m.id,
      recognised: overrides[i] !== undefined || m.matched,
      monthlyAverage: average(c.total, months),
    };
  });

  const totals = new Map();
  for (const e of entries) totals.set(e.channelId, (totals.get(e.channelId) ?? 0) + e.total);
  const byChannel = [...totals].map(([channelId, total]) => ({ channelId, total, monthlyAverage: average(total, months) }));

  return {
    ok: true,
    document,
    months,
    warnings: isShortPeriod(document.period) ? ["PERIOD_SHORT"] : [],
    cards: document.cards.map((c) => ({ issuer: c.issuer, name: c.name })),
    entries,
    byChannel,
    largeItems: document.largeItems.map((x) => ({ category: x.category, amount: x.amount })),
    overlaps: overlappingSnapshots(document.period, snapshots).map((s) => s.id),
  };
}

export function previewPaste(text, context) {
  const parsed = parsePaste(text);
  if (!parsed.ok) return parsed;
  return buildPreview(parsed.document, context);
}

// onOverlap: "replace" | "new" | "cancel". Without it, an overlapping period stops and asks (Edge Cases).
export function confirmImport({ store, preview, now = new Date(), onOverlap }) {
  if (!preview?.ok) return failure("NO_PREVIEW");
  if (preview.overlaps.length > 0) {
    if (onOverlap === "cancel") return { ok: false, cancelled: true, failures: [] };
    if (onOverlap !== "replace" && onOverlap !== "new") return { ok: false, needsDecision: "overlap", overlaps: preview.overlaps, failures: [] };
  }

  seedDefaultChannels(store);
  const existing = store.list("snapshots");
  const keptIds = existing.filter((s) => !(onOverlap === "replace" && preview.overlaps.includes(s.id))).map((s) => s.id);
  const { cards, mappings } = buildCardsAndMappings(preview);
  const snapshot = snapshotFromPreview(preview, todayDate(now), keptIds);

  // Validate everything first so a rejected record cannot leave a half-imported state.
  const records = [
    ...cards.map((r) => ["cards", r]),
    ...mappings.map((r) => ["mappings", r]),
    ["snapshots", snapshot],
  ];
  const rejected = [];
  for (const [collection, record] of records) {
    const v = store.validate(collection, record);
    if (!v.ok) rejected.push(...v.failures);
  }
  if (rejected.length > 0) return { ok: false, failures: rejected };

  if (onOverlap === "replace") for (const id of preview.overlaps) store.remove("snapshots", id);
  for (const [collection, record] of records) {
    const r = store.put(collection, record);
    if (!r.ok) return r;
  }
  return { ok: true, failures: [], snapshotId: snapshot.id };
}
