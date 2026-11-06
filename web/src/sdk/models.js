// Shared record shapes (T018, data-model.md). These factories only build plain objects.
// Whether a record is acceptable is decided by the Validator (rule sets stored-*), not here.
// Public mode never stores the last four digits, full card numbers or CVV (FR-015, FR-016):
// the stored-card rule set is an allow-list, so those fields are rejected as unknown.

export const ISSUERS = Object.freeze(["國泰", "永豐", "富邦", "台新"]);
export const MAPPING_SOURCES = Object.freeze(["imported", "self-reported"]);
export const SNAPSHOT_SOURCES = Object.freeze(["llm-paste", "self-reported"]);
export const CHANNEL_ORIGINS = Object.freeze(["default", "custom"]);

// Large-item threshold: user-configurable, default 10,000, judged per single transaction (FR-027).
export const DEFAULT_LARGE_ITEM_THRESHOLD = 10000;

// Collection name -> Validator rule set that every record in it must pass.
export const COLLECTIONS = Object.freeze({
  cards: "stored-card",
  channels: "stored-channel",
  mappings: "stored-mapping",
  habits: "stored-habit",
  snapshots: "stored-snapshot",
  settings: "stored-settings",
  claims: "stored-claim",
  overrides: "stored-override",
});

export const SETTINGS_ID = "settings";

export function makeCard({ id, issuer, name }) {
  return { id, issuer, name };
}

// canonicalId (optional): the channel name in the published reward data that the user confirmed this channel to be.
// The published data has no channel ids, so the value is that data's own channel name.
export function makeChannel({ id, name, aliases = [], origin = "custom", canonicalId }) {
  const channel = { id, name, aliases: [...aliases], origin };
  if (canonicalId !== undefined) channel.canonicalId = canonicalId;
  return channel;
}

// One mapping per channel (id = channelId). cardId is omitted when the user does not know the card.
export function makeMapping({ channelId, cardId, source }) {
  const m = { id: channelId, channelId, source };
  if (cardId !== undefined) m.cardId = cardId;
  return m;
}

// Smart-question answer. approxMonthly and cardId are omitted for "don't know" or skipped (US1 scenario 8).
export function makeHabit({ channelId, cardId, approxMonthly }) {
  const h = { id: channelId, channelId, source: "self-reported" };
  if (cardId !== undefined) h.cardId = cardId;
  if (approxMonthly !== undefined) h.approxMonthly = approxMonthly;
  return h;
}

// A confirmed summary snapshot. No per-transaction details are ever stored (FR-029).
export function makeSnapshot({ id, confirmedAt, period, channelTotals, source, largeItems = [] }) {
  return {
    id,
    confirmedAt,
    period: { start: period.start, end: period.end },
    channelTotals: channelTotals.map(({ channelId, total }) => ({ channelId, total })),
    source,
    largeItems: largeItems.map(({ category, amount }) => ({ category, amount })),
  };
}

// The user's own "coupon claimed" mark for one reward rule (card x channel x payment method). Local only (FR-022).
export function makeClaim({ id, issuer, cardName, channel, paymentMethod, claimedAt }) {
  return { id, issuer, cardName, channel, paymentMethod, claimedAt };
}

// The user's own correction of one reward rule, kept in this browser only (FR-021, FR-032).
export function makeOverride({ id, overriddenAt, rule }) {
  return { id, overriddenAt, rule };
}

export function makeSettings({ largeItemThreshold = DEFAULT_LARGE_ITEM_THRESHOLD } = {}) {
  return { id: SETTINGS_ID, largeItemThreshold };
}
