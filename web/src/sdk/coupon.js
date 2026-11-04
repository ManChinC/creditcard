// Coupons (T044, FR-022): the coupon state shown to the user, the next open date computed by code from the
// structured registration cycle, and the user's own "claimed" marks kept in this browser only.
// The system never claims a coupon for the user. Anchors of registrationCycle were confirmed on 2026-11-04
// (data-model.md): weekday 1..7 with Monday = 1, day 1..28, quarters starting in January, April, July and
// October, and today counts as an open day.

import { cardIdFor } from "./mapping.js";
import { makeClaim } from "./models.js";
import { todayDate } from "./snapshot.js";

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad = (n, width = 2) => String(n).padStart(width, "0");
const fmt = (y, m, d) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
const unknown = () => ({ status: "unknown" });
const known = (date) => ({ status: "known", date });

function parseDate(s) {
  const m = typeof s === "string" ? DATE.exec(s) : null;
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const check = new Date(Date.UTC(y, mo - 1, d));
  return check.getUTCFullYear() === y && check.getUTCMonth() === mo - 1 && check.getUTCDate() === d ? { y, mo, d } : null;
}

const inRange = (n, lo, hi) => Number.isInteger(n) && n >= lo && n <= hi;

function addDays({ y, mo, d }, days) {
  const t = new Date(Date.UTC(y, mo - 1, d + days));
  return fmt(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

// First date >= today on which one of the given months has the given day, looking at most 13 months ahead.
function nextMonthDay(today, months, day) {
  for (let offset = 0; offset <= 13; offset++) {
    const index = today.mo - 1 + offset;
    const y = today.y + Math.floor(index / 12);
    const mo = (index % 12) + 1;
    if (!months.includes(mo)) continue;
    const candidate = fmt(y, mo, day);
    if (candidate >= fmt(today.y, today.mo, today.d)) return candidate;
  }
  return null;
}

// -> { status: "known", date } | { status: "ended" } | { status: "unknown" }. today is "YYYY-MM-DD".
export function nextOpenDate(cycle, today) {
  const now = parseDate(today);
  if (!now) throw new TypeError("today must be a date in YYYY-MM-DD form");
  if (cycle === null || typeof cycle !== "object") return unknown();

  switch (cycle.kind) {
    case "weekly": {
      if (!inRange(cycle.weekday, 1, 7)) return unknown();
      const jsDay = new Date(Date.UTC(now.y, now.mo - 1, now.d)).getUTCDay(); // 0 = Sunday
      const todayWeekday = jsDay === 0 ? 7 : jsDay;
      return known(addDays(now, (cycle.weekday - todayWeekday + 7) % 7));
    }
    case "monthly": {
      if (!inRange(cycle.day, 1, 28)) return unknown();
      const date = nextMonthDay(now, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], cycle.day);
      return date ? known(date) : unknown();
    }
    case "quarterly": {
      if (!inRange(cycle.monthOfQuarter, 1, 3) || !inRange(cycle.day, 1, 28)) return unknown();
      const months = [0, 3, 6, 9].map((q) => q + cycle.monthOfQuarter);
      const date = nextMonthDay(now, months, cycle.day);
      return date ? known(date) : unknown();
    }
    case "once": {
      const opens = parseDate(cycle.opensOn);
      const closes = parseDate(cycle.closesOn);
      if (!opens || !closes || cycle.closesOn < cycle.opensOn) return unknown();
      const current = fmt(now.y, now.mo, now.d);
      if (current < cycle.opensOn) return known(cycle.opensOn);
      if (current <= cycle.closesOn) return known(current);
      return { status: "ended" };
    }
    default:
      return unknown();
  }
}

// -> "required" | "claimed" | "not-required" | "unknown" (FR-022). A local mark only matters when a coupon is required.
export function couponState(rule, claimed) {
  if (rule === null || typeof rule !== "object") return "unknown";
  if (rule.couponRequired === true) return claimed === true ? "claimed" : "required";
  if (rule.couponRequired === false) return "not-required";
  return "unknown";
}

// ---- the user's own "claimed" marks, stored in this browser only ----

export function claimId(rule) {
  return `claim-${cardIdFor(rule.issuer, `${rule.cardName}|${rule.channel}|${rule.paymentMethod}`).slice("card-".length)}`;
}

function sameRule(record, rule) {
  return record.issuer === rule.issuer && record.cardName === rule.cardName && record.channel === rule.channel && record.paymentMethod === rule.paymentMethod;
}

export function isClaimed(store, rule) {
  const record = store.get("claims", claimId(rule));
  return record !== undefined && sameRule(record, rule);
}

export function markClaimed(store, rule, now = new Date()) {
  return store.put("claims", makeClaim({
    id: claimId(rule), issuer: rule.issuer, cardName: rule.cardName, channel: rule.channel,
    paymentMethod: rule.paymentMethod, claimedAt: todayDate(now),
  }));
}

export function unmarkClaimed(store, rule) {
  return store.remove("claims", claimId(rule));
}
