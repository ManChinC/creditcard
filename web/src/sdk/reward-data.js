// Loading the published reward data (T041, FR-048, FR-036). The file is public; it is read as text by the caller
// (the page fetches it, tests pass a string) and must pass the Validator rule set `published-data` before any
// of it is used. Nothing here fetches, so this module has no network access of its own.
//
// How old is too old is not defined by the spec [TBD: Edge Cases]. The caller may pass staleAfterDays; without it
// `stale` is null (not judged) and the age is still reported so the page can show it.

import { evaluate } from "../validator/executor.js";

const DAY_MS = 86400000;

function daysBetween(from, to) {
  const a = /^(\d{4})-(\d{2})-(\d{2})$/.exec(from);
  const b = /^(\d{4})-(\d{2})-(\d{2})$/.exec(to);
  if (!a || !b) return null;
  return Math.round((Date.UTC(+b[1], +b[2] - 1, +b[3]) - Date.UTC(+a[1], +a[2] - 1, +a[3])) / DAY_MS);
}

const invalid = (code, failures) => ({ status: "invalid", failures: failures ?? [{ rule: "", path: "", code }] });

// text: the file content, or null/undefined when it could not be read.
// -> { status: "unavailable" } | { status: "invalid", failures } | { status: "ok", data, lastVerifiedAt, ageDays, stale }
export function loadRewardData({ text, rules, today, staleAfterDays }) {
  if (typeof text !== "string") return { status: "unavailable" };
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return invalid("NOT_JSON");
  }
  const verdict = evaluate(rules, "published-data", data, {});
  if (verdict.decision !== "allow") return invalid("", verdict.failures);

  const ageDays = daysBetween(data.lastVerifiedAt, today);
  const stale = staleAfterDays === undefined || ageDays === null ? null : ageDays > staleAfterDays;
  return { status: "ok", data, lastVerifiedAt: data.lastVerifiedAt, ageDays, stale };
}
