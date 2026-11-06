// Channels (T027, FR-004, FR-006, FR-031): classification, the catch-all, and user-defined channels.
// Whether a stored channel record is acceptable is the Validator's call (stored-channel); the checks
// here (duplicate names, protecting the catch-all) are product rules about the user's own list.

import { DEFAULT_CHANNELS, CATCHALL_CHANNEL_ID } from "./default-channels.js";
import { makeChannel } from "./models.js";

export function normalizeName(s) {
  return String(s).normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
}

// The name without its bracketed text and without a trailing "含..." part: "餐飲（含連加 LinePay）" -> "餐飲".
// Used only to line a user's channel up with the channel names of the published reward data (decision 2026-11-06).
// No domain-specific suffix is removed yet [TBD: the user's list of suffixes such as 加油站]. May return "".
export function extractCore(name) {
  return normalizeName(name)
    .replace(/\([^)]*\)/g, "")
    .replace(/含.*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

// A core name shorter than this is never used for a partial (candidate) match.
export const MIN_CORE_CHARS = 2;
const length = (s) => [...s].length;

// Published channel names that overlap the given text without being the same name: one core name contains the other,
// both at least MIN_CORE_CHARS long. Candidates are only suggestions; the user confirms one with setCanonical.
// The user's own channel (found by exact name or alias) contributes its name and aliases as well.
export function channelCandidates(input, dataChannels, userChannels = []) {
  const texts = [String(input)];
  const hit = matchChannel(input, userChannels);
  if (hit.matched) {
    const channel = userChannels.find((c) => c.id === hit.id);
    texts.push(channel.name, ...channel.aliases);
  }
  const cores = texts.map(extractCore).filter((c) => length(c) >= MIN_CORE_CHARS);
  return dataChannels.filter((name) => {
    const core = extractCore(name);
    return length(core) >= MIN_CORE_CHARS && cores.some((c) => c.includes(core) || core.includes(c));
  });
}

// Puts the default channels into storage on first use. Existing records are never overwritten.
export function seedDefaultChannels(store) {
  const have = new Set(store.list("channels").map((c) => c.id));
  for (const c of DEFAULT_CHANNELS) {
    if (!have.has(c.id)) store.put("channels", makeChannel(c));
  }
  return store.list("channels");
}

// Exact match on name or alias (after normalisation). Anything else belongs to the catch-all (FR-004).
export function matchChannel(name, channels) {
  const wanted = normalizeName(name);
  for (const c of channels) {
    if (normalizeName(c.name) === wanted || c.aliases.some((a) => normalizeName(a) === wanted)) {
      return { id: c.id, matched: true };
    }
  }
  return { id: CATCHALL_CHANNEL_ID, matched: false };
}

function namesTaken(channels, exceptId) {
  const taken = new Set();
  for (const c of channels) {
    if (c.id === exceptId) continue;
    taken.add(normalizeName(c.name));
    for (const a of c.aliases) taken.add(normalizeName(a));
  }
  return taken;
}

function duplicate(code = "DUPLICATE_NAME") {
  return { ok: false, failures: [{ rule: "", path: "", code }] };
}

export function addChannel(store, { name, aliases = [] }) {
  const channels = store.list("channels");
  const taken = namesTaken(channels, null);
  if ([name, ...aliases].some((n) => taken.has(normalizeName(n)))) return duplicate();
  let n = 1;
  const ids = new Set(channels.map((c) => c.id));
  while (ids.has(`custom-${n}`)) n++;
  const record = makeChannel({ id: `custom-${n}`, name, aliases, origin: "custom" });
  const result = store.put("channels", record);
  return result.ok ? { ...result, channel: record } : result;
}

export function updateChannel(store, id, { name, aliases }) {
  const channels = store.list("channels");
  const current = channels.find((c) => c.id === id);
  if (!current) return duplicate("UNKNOWN_CHANNEL");
  const next = makeChannel({ id, name: name ?? current.name, aliases: aliases ?? current.aliases, origin: current.origin, canonicalId: current.canonicalId });
  const taken = namesTaken(channels, id);
  if ([next.name, ...next.aliases].some((n) => taken.has(normalizeName(n)))) return duplicate();
  return store.put("channels", next);
}

// Records which published channel name the user's channel is (null removes it). The value is checked by the Validator.
export function setCanonical(store, id, canonicalId) {
  const current = store.list("channels").find((c) => c.id === id);
  if (!current) return duplicate("UNKNOWN_CHANNEL");
  return store.put("channels", makeChannel({ ...current, canonicalId: canonicalId === null ? undefined : canonicalId }));
}

// The catch-all can never be removed: it receives everything that matches no other channel (FR-004).
// Habits and mappings of the removed channel go with it; past snapshots keep their numbers.
export function removeChannel(store, id) {
  if (id === CATCHALL_CHANNEL_ID) return duplicate("CATCHALL_PROTECTED");
  if (!store.list("channels").some((c) => c.id === id)) return duplicate("UNKNOWN_CHANNEL");
  store.remove("mappings", id);
  store.remove("habits", id);
  return store.remove("channels", id);
}
