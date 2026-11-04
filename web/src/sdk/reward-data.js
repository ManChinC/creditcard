// Loading the published reward data (T041, FR-048, FR-036). The file is public; it is read as text by the caller
// (the page fetches it, tests pass a string) and must pass the Validator rule set `published-data` before any
// of it is used. Nothing here fetches, so this module has no network access of its own.
//
// There is no "stale" judgement here (user decision 2026-11-04, spec Edge Cases): the public page only shows the
// last verification date. Reminding the administrator to re-verify belongs to administrator mode (US5).

import { evaluate } from "../validator/executor.js";

const invalid = (code, failures) => ({ status: "invalid", failures: failures ?? [{ rule: "", path: "", code }] });

// text: the file content, or null/undefined when it could not be read.
// -> { status: "unavailable" } | { status: "invalid", failures } | { status: "ok", data, lastVerifiedAt }
export function loadRewardData({ text, rules }) {
  if (typeof text !== "string") return { status: "unavailable" };
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return invalid("NOT_JSON");
  }
  const verdict = evaluate(rules, "published-data", data, {});
  if (verdict.decision !== "allow") return invalid("", verdict.failures);
  return { status: "ok", data, lastVerifiedAt: data.lastVerifiedAt };
}
