// Channel query and recommendation ordering (T042, FR-051, FR-054).
//
// Cards are compared one step at a time and the first step that separates two cards decides; only a tie moves to
// the next step. There is no score and no weighting.
//   1 a card the user holds      2 higher effective reward (basis points)
//   3 monthly cap                (explanation only, never used to order: FR-051, FR-053)
//   4 coupon                     (no coupon needed or already claimed ranks above a coupon still to claim)
//   5 convenience                (no benefit switch and no minimum spend)
// The final tie-break between fully tied cards is not defined by the spec [TBD]; ties keep the order of `rules`.
//
// Readings of the spec:
//   - confirmed 2026-11-04: step 2 compares the first tier's rate, since usage is not tracked;
//   - [INFERRED] stacking adds the first-tier rate of the same card's rules for the payment methods named in stacksWith,
//     and only when stackingStated is true; names with no rule (for example an activity) add nothing;
//   - [INFERRED] an unknown coupon state ranks with "required" in step 4, and a rule whose benefit switch or minimum
//     spend is unknown is not treated as convenient in step 5.

import { couponState } from "./coupon.js";
import { extractCore, matchChannel, normalizeName } from "./channels.js";

const sameCard = (a, b) => a.issuer === b.issuer && a.cardName === b.cardName;

function firstTierRate(rule) {
  const tier = Array.isArray(rule.tiers) ? rule.tiers[0] : undefined;
  return tier !== null && typeof tier === "object" && Number.isSafeInteger(tier.rate) && tier.rate >= 0 ? tier.rate : null;
}

function effectiveRate(rule, rules) {
  const own = firstTierRate(rule);
  if (own === null) return null;
  let total = own;
  if (rule.stackingStated === true && Array.isArray(rule.stacksWith)) {
    for (const method of new Set(rule.stacksWith)) {
      if (method === rule.paymentMethod) continue;
      const other = rules.find((r) => sameCard(r, rule) && r.channel === rule.channel && r.paymentMethod === method);
      const extra = other ? firstTierRate(other) : null;
      if (extra !== null) total += extra;
    }
  }
  return total;
}

const couponRank = (state) => (state === "not-required" || state === "claimed" ? 0 : 1);
const convenienceRank = (rule) => (rule.requiresBenefitSwitch === false && rule.threshold === 0 ? 0 : 1);

// rules: published RewardRule objects. heldCards: [{ issuer, name }]. isClaimed(rule) -> boolean (the user's local marks).
export function rankCards({ rules, heldCards = [], channel, paymentMethod, isClaimed = () => false }) {
  const all = Array.isArray(rules) ? rules.filter((r) => r !== null && typeof r === "object") : [];
  const held = (card) => heldCards.some((h) => h.issuer === card.issuer && h.name === card.cardName);

  const ranked = [];
  const seen = new Set();
  for (const rule of all) {
    if (rule.channel !== channel || rule.paymentMethod !== paymentMethod) continue;
    const key = `${rule.issuer}\u0000${rule.cardName}`;
    if (seen.has(key)) continue;
    const rate = effectiveRate(rule, all);
    if (rate === null) continue; // a rule without a usable rate is treated like no rule: the card stays unknown
    seen.add(key);
    ranked.push({
      issuer: rule.issuer, cardName: rule.cardName, held: held(rule), effectiveRate: rate,
      couponState: couponState(rule, isClaimed(rule)), rule,
    });
  }

  ranked.sort((a, b) =>
    (b.held - a.held) ||
    (b.effectiveRate - a.effectiveRate) ||
    (couponRank(a.couponState) - couponRank(b.couponState)) ||
    (convenienceRank(a.rule) - convenienceRank(b.rule)));

  const unknown = heldCards
    .filter((h) => !seen.has(`${h.issuer}\u0000${h.name}`))
    .map((h) => ({ issuer: h.issuer, cardName: h.name }));
  return { ranked, unknown };
}

// Which channel string of the published data the user means. The text is compared with the data's own channel names;
// failing that, it is matched against the user's channel list (names and aliases, FR-004/FR-031) and the matched
// channel's names are compared with the data's. Returns null when the data has nothing for it (no guessing).
export function resolveChannel(input, dataChannels, userChannels = []) {
  const text = typeof input === "string" ? input : "";
  if (normalizeName(text) === "") return null;
  const byName = new Map(dataChannels.map((c) => [normalizeName(c), c]));
  const byCore = new Map();
  for (const c of dataChannels) {
    const core = extractCore(c);
    if (core !== "") byCore.set(core, byCore.has(core) ? null : c); // null: two published names share the core
  }
  const same = (name) => {
    if (byName.has(normalizeName(name))) return byName.get(normalizeName(name));
    const core = extractCore(name);
    return core !== "" && byCore.get(core) ? byCore.get(core) : null;
  };
  const direct = same(text);
  if (direct !== null) return direct;
  const hit = matchChannel(input, userChannels);
  if (!hit.matched) return null;
  const channel = userChannels.find((c) => c.id === hit.id);
  if (channel.canonicalId !== undefined && byName.has(normalizeName(channel.canonicalId))) return byName.get(normalizeName(channel.canonicalId));
  for (const name of [channel.name, ...channel.aliases]) {
    const found = same(name);
    if (found !== null) return found;
  }
  return null;
}
