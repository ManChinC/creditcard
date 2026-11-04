// Monthly cap explanation (T043, FR-053, Constitution X). The amount is computed by code from the published rate
// and cap; nothing here tracks what the user has already spent this month.
//
// Formula confirmed by the user on 2026-11-04 (data-model.md): reward accumulates tier by tier; the threshold is
// the spend at which the accumulated reward reaches the cap, rounded up. Rates are basis points, amounts whole TWD.
// Integer arithmetic uses BigInt so no rounding error can creep in.

const RATE_UNITS = 10000n; // 100% in basis points
const unknown = () => ({ status: "unknown" });

const isInt = (n) => Number.isSafeInteger(n);
const ceilDiv = (a, b) => (a + b - 1n) / b;

// -> { status: "known", amount } | { status: "unknown" } | { status: "no-cap" } | { status: "not-reached" }
export function capThreshold(rule) {
  if (rule === null || typeof rule !== "object") return unknown();
  const hasCap = rule.rewardCap !== undefined;
  if (rule.noCap === true) return hasCap ? unknown() : { status: "no-cap" }; // both stated: contradiction
  if (!isInt(rule.rewardCap) || rule.rewardCap < 1) return unknown();

  const tiers = rule.tiers;
  if (!Array.isArray(tiers) || tiers.length === 0) return unknown();
  const capUnits = BigInt(rule.rewardCap) * RATE_UNITS;
  let accumulated = 0n; // reward so far, in units of 1/10000 TWD
  let previousBound = 0n;

  for (let i = 0; i < tiers.length; i++) {
    const tier = tiers[i];
    const last = i === tiers.length - 1;
    if (tier === null || typeof tier !== "object") return unknown();
    if (!isInt(tier.rate) || tier.rate < 0 || tier.rate > 10000) return unknown();
    const rate = BigInt(tier.rate);

    if (last) {
      if (tier.upTo !== undefined) return unknown();
      if (rate === 0n) return { status: "not-reached" };
      return toResult(previousBound + ceilDiv(capUnits - accumulated, rate));
    }
    if (!isInt(tier.upTo) || BigInt(tier.upTo) <= previousBound) return unknown();
    const bound = BigInt(tier.upTo);
    const gain = (bound - previousBound) * rate;
    if (accumulated + gain >= capUnits) return toResult(previousBound + ceilDiv(capUnits - accumulated, rate));
    accumulated += gain;
    previousBound = bound;
  }
  return unknown();
}

function toResult(amount) {
  return amount <= BigInt(Number.MAX_SAFE_INTEGER) ? { status: "known", amount: Number(amount) } : unknown();
}

// Rules of the same card with the same capGroup share one cap; the explanation only says which ones (no tracking).
export function capExplanation(rule, allRules) {
  const sharedWith = [];
  if (rule !== null && typeof rule === "object" && typeof rule.capGroup === "string" && Array.isArray(allRules)) {
    for (const other of allRules) {
      if (other === null || typeof other !== "object" || other === rule) continue;
      if (other.issuer !== rule.issuer || other.cardName !== rule.cardName || other.capGroup !== rule.capGroup) continue;
      if (other.channel === rule.channel && other.paymentMethod === rule.paymentMethod) continue;
      if (!sharedWith.some((s) => s.channel === other.channel && s.paymentMethod === other.paymentMethod)) {
        sharedWith.push({ channel: other.channel, paymentMethod: other.paymentMethod });
      }
    }
  }
  return { threshold: capThreshold(rule), sharedWith };
}
