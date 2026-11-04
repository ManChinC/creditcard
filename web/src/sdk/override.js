// Local overrides of reward rules (T046, FR-021, FR-032). The user can correct a rule for their own use. The correction
// is kept in this browser only, is marked "使用者修正" (isUserOverride) wherever it is shown, and is never uploaded:
// this module has no network access, and the storage module only writes to the browser's own storage.
//
// An override replaces the published rule with the same card, channel and payment method. An override that matches no
// published rule is added as a rule of its own. Whether an override is acceptable is the Validator's call
// (stored-override, which has the same field rules as published-data); source and verifiedAt are not part of it,
// because the user's correction has no official source.

import { cardIdFor } from "./mapping.js";
import { makeOverride } from "./models.js";
import { todayDate } from "./snapshot.js";

export const OVERRIDE_LABEL = "使用者修正";

export function overrideId(rule) {
  return `override-${cardIdFor(rule.issuer, `${rule.cardName}|${rule.channel}|${rule.paymentMethod}`).slice("card-".length)}`;
}

const sameRule = (a, b) => a.issuer === b.issuer && a.cardName === b.cardName && a.channel === b.channel && a.paymentMethod === b.paymentMethod;

// Fields that never belong to an override, whatever the caller passes (for example a copy of a published rule).
const NOT_KEPT = ["source", "verifiedAt", "isUserOverride"];

function ownFields(rule) {
  const copy = {};
  for (const [k, v] of Object.entries(rule)) if (!NOT_KEPT.includes(k)) copy[k] = structuredClone(v);
  return copy;
}

export function saveOverride(store, rule, now = new Date()) {
  if (rule === null || typeof rule !== "object") return { ok: false, failures: [{ rule: "rule", path: "rule", code: "RULE_INVALID" }] };
  return store.put("overrides", makeOverride({ id: overrideId(rule), overriddenAt: todayDate(now), rule: ownFields(rule) }));
}

export function removeOverride(store, rule) {
  return store.remove("overrides", overrideId(rule));
}

export function listOverrides(store) {
  return store.list("overrides").filter((o) => o.id === overrideId(o.rule));
}

// -> a new list; the published rules are not changed. Overridden rules carry isUserOverride: true and overriddenAt.
export function applyOverrides(rules, overrides) {
  const remaining = [...overrides];
  const out = rules.map((published) => {
    const index = remaining.findIndex((o) => sameRule(o.rule, published));
    if (index === -1) return published;
    const [o] = remaining.splice(index, 1);
    return { ...structuredClone(o.rule), isUserOverride: true, overriddenAt: o.overriddenAt };
  });
  for (const o of remaining) out.push({ ...structuredClone(o.rule), isUserOverride: true, overriddenAt: o.overriddenAt });
  return out;
}
