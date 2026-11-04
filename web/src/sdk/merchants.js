// Designated merchants (T045, FR-055, FR-018, FR-008).
// Matching was confirmed by the user on 2026-11-04 (data-model.md): after NFKC normalisation the input matches a
// merchant when it contains the name or an alias, or the name or an alias contains the input. Input shorter than
// two characters is not matched. A miss means "not listed, check the official site", never "no reward".
// Everything here returns plain data; the input is never interpreted.

import { normalizeName } from "./channels.js";

export const MIN_INPUT_CHARS = 2;

const charCount = (s) => [...s].length;

function namesOf(merchant) {
  if (merchant === null || typeof merchant !== "object" || typeof merchant.name !== "string") return [];
  const aliases = Array.isArray(merchant.aliases) ? merchant.aliases.filter((a) => typeof a === "string") : [];
  return [merchant.name, ...aliases].map(normalizeName).filter((n) => n !== "");
}

// "Input contains the name" is only tried for names of at least two characters, for the same reason the input
// itself must have two: a one-character name would match almost any input.
function matches(query, merchant) {
  return namesOf(merchant).some(
    (n) => n.includes(query) || (charCount(n) >= MIN_INPUT_CHARS && query.includes(n)),
  );
}

// merchants: the card's published list, or undefined when the list is not known.
export function matchMerchant(input, merchants) {
  const query = normalizeName(typeof input === "string" ? input : "");
  if (charCount(query) < MIN_INPUT_CHARS) return { status: "too-short" };
  if (!Array.isArray(merchants)) return { status: "unknown" };
  const found = [];
  for (const m of merchants) {
    if (matches(query, m) && !found.includes(m.name)) found.push(m.name);
  }
  return found.length > 0 ? { status: "matched", merchants: found } : { status: "not-listed" };
}

// One entry per card with a rule in the channel. A card's designated merchants belong to the card, so the lists on
// its rules (one per payment method) are merged. No list on any of its rules means the list is not known.
export function designatedByCard(rules, channel) {
  const cards = new Map();
  for (const rule of Array.isArray(rules) ? rules : []) {
    if (rule === null || typeof rule !== "object" || rule.channel !== channel) continue;
    const key = `${rule.issuer}\u0000${rule.cardName}`;
    if (!cards.has(key)) cards.set(key, { issuer: rule.issuer, cardName: rule.cardName, status: "unknown", merchants: [] });
    const entry = cards.get(key);
    if (!Array.isArray(rule.designatedMerchants)) continue;
    entry.status = "listed";
    for (const m of rule.designatedMerchants) {
      if (m === null || typeof m !== "object" || typeof m.name !== "string") continue;
      const aliases = Array.isArray(m.aliases) ? m.aliases.filter((a) => typeof a === "string") : [];
      const existing = entry.merchants.find((x) => x.name === m.name);
      if (!existing) {
        entry.merchants.push(aliases.length > 0 ? { name: m.name, aliases: [...aliases] } : { name: m.name });
      } else if (aliases.length > 0) {
        existing.aliases = [...new Set([...(existing.aliases ?? []), ...aliases])];
      }
    }
  }
  return [...cards.values()];
}
