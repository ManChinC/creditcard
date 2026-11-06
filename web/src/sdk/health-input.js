// What the health check needs from the user's own stored data (T051, FR-009): for every channel, the monthly amount
// and the card used now, plus the cards the user holds. Read-only; nothing is written and nothing is guessed.
//
// [INFERRED] readings, in the same order of preference as describeRow in mapping.js:
//   - the monthly amount comes from the most recent confirmed snapshot (largest confirmedAt, ties by id) divided by
//     the months it covers; a channel the snapshot does not mention falls back to the user's own approxMonthly;
//     neither means null (unknown);
//   - the card used now is the channel's mapping when the amount came from the snapshot; for a self-reported amount
//     the user's own answer comes first, then the mapping; a card id that matches no stored card is unknown.

import { monthsInPeriod } from "./snapshot.js";

function latestSnapshot(snapshots) {
  let best = null;
  for (const s of snapshots) {
    if (best === null || s.confirmedAt > best.confirmedAt || (s.confirmedAt === best.confirmedAt && s.id > best.id)) best = s;
  }
  return best;
}

// -> { heldCards: [{ issuer, name }], rows: [{ channelName, monthlyAverage, current }] }
export function healthInputs(store, channels) {
  const cards = store.list("cards");
  const mappings = store.list("mappings");
  const habits = store.list("habits");
  const snapshot = latestSnapshot(store.list("snapshots"));
  const months = snapshot ? monthsInPeriod(snapshot.period) : 0;
  const cardById = (id) => (id === undefined ? null : cards.find((c) => c.id === id) ?? null);

  const rows = channels.map((channel) => {
    const mapping = mappings.find((m) => m.channelId === channel.id);
    const habit = habits.find((h) => h.channelId === channel.id);
    const imported = snapshot?.channelTotals.find((t) => t.channelId === channel.id);
    const monthlyAverage = imported && months > 0 ? Math.round(imported.total / months) : habit?.approxMonthly ?? null;
    const card = imported ? cardById(mapping?.cardId) : cardById(habit?.cardId) ?? cardById(mapping?.cardId);
    return { channelId: channel.id, channelName: channel.name, monthlyAverage, current: card ? { issuer: card.issuer, name: card.name } : null };
  });
  return { heldCards: cards.map((c) => ({ issuer: c.issuer, name: c.name })), rows };
}
