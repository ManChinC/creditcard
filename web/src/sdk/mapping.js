// Cards and the channel x card mapping (T028, FR-003, FR-005, FR-024).

import { makeCard, makeMapping } from "./models.js";

// Deterministic id for a card, derived from issuer and name (FNV-1a, 32 bit). Not a security feature.
export function cardIdFor(issuer, name) {
  let h = 0x811c9dc5;
  for (const ch of `${issuer}|${String(name).normalize("NFKC").trim().toLowerCase()}`) {
    h ^= ch.codePointAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `card-${h.toString(16).padStart(8, "0")}`;
}

// From a validated preview: the card list and one mapping per channel (the card with the largest total wins).
export function buildCardsAndMappings(preview) {
  const idByName = new Map();
  const cards = preview.cards.map((c) => {
    const id = cardIdFor(c.issuer, c.name);
    idByName.set(c.name, id);
    return makeCard({ id, issuer: c.issuer, name: c.name });
  });
  const best = new Map(); // channelId -> {total, cardName}
  for (const e of preview.entries) {
    const cur = best.get(e.channelId);
    if (!cur || e.total > cur.total) best.set(e.channelId, { total: e.total, cardName: e.mainCard });
  }
  const mappings = [...best].map(([channelId, v]) =>
    makeMapping({ channelId, cardId: idByName.get(v.cardName), source: "imported" }),
  );
  return { cards, mappings };
}

// What the table shows for one channel. rate comes from published reward data, never from pasted text (FR-005);
// until that data is loaded it is reported as unknown rather than guessed.
export function describeRow({ channel, mapping, habit, byChannel, cards, months }) {
  const card = mapping?.cardId ? cards.find((c) => c.id === mapping.cardId) ?? null : null;
  const fromImport = byChannel?.find((b) => b.channelId === channel.id);
  if (fromImport) {
    return {
      channelId: channel.id,
      channelName: channel.name,
      monthlyAverage: Math.round(fromImport.total / months),
      amountSource: "imported",
      cardName: card?.name ?? null,
      rate: "unknown",
    };
  }
  const habitCard = habit?.cardId ? cards.find((c) => c.id === habit.cardId) ?? null : null;
  return {
    channelId: channel.id,
    channelName: channel.name,
    monthlyAverage: habit?.approxMonthly ?? null,
    amountSource: habit ? "self-reported" : "none",
    cardName: habitCard?.name ?? card?.name ?? null,
    rate: "unknown",
  };
}
