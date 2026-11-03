// Browser-side Validator executor (T011). Reads rules/validator-rules.json; carries no rules of its own.
// Must behave exactly like admin/src/validator/executor.py (Constitution XIII); conformance/ cases enforce this.

const MAX_SAFE = Number.MAX_SAFE_INTEGER;
const MISSING = Symbol("missing");
const TYPES = ["string", "integer", "array", "object"];

function isObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function isInteger(v) {
  return typeof v === "number" && Number.isFinite(v) && Number.isInteger(v) && Math.abs(v) <= MAX_SAFE;
}

function typeOf(v) {
  if (v === null) return "null";
  if (typeof v === "string") return "string";
  if (typeof v === "number") return "number";
  if (Array.isArray(v)) return "array";
  if (isObject(v)) return "object";
  return typeof v; // boolean, undefined
}

function same(a, b) {
  const ta = a === null ? "null" : typeof a;
  const tb = b === null ? "null" : typeof b;
  if (ta !== tb) return false;
  if (ta === "object") return false; // arrays and objects never compare equal
  return a === b;
}

// Path syntax: "" is the root; "a.b" walks keys; a "[]" suffix on a key iterates an array.
function resolve(doc, path) {
  if (path === "") return [{ path: "", value: doc }];
  let entries = [{ path: "", value: doc }];
  for (const token of path.split(".")) {
    const iterate = token.endsWith("[]");
    const key = iterate ? token.slice(0, -2) : token;
    const next = [];
    for (const e of entries) {
      const here = e.path === "" ? key : `${e.path}.${key}`;
      if (!isObject(e.value) || !Object.prototype.hasOwnProperty.call(e.value, key)) {
        next.push({ path: here, value: MISSING });
        continue;
      }
      const v = e.value[key];
      if (!iterate) {
        next.push({ path: here, value: v });
      } else if (!Array.isArray(v)) {
        next.push({ path: here, value: MISSING });
      } else {
        v.forEach((item, i) => next.push({ path: `${here}[${i}]`, value: item }));
      }
    }
    entries = next;
  }
  return entries;
}

// Pattern subset shared with Python: ASCII only; literals, [..] classes (no negation), \d \w and escaped
// metacharacters, groups, alternation, quantifiers. No '.', '^', '$', '\s', lookaround, backreferences.
function patternSupported(p) {
  if (typeof p !== "string" || p === "" || /[^\x20-\x7e]/.test(p)) return false;
  let inClass = false;
  for (let i = 0; i < p.length; i++) {
    const c = p[i];
    if (c === "\\") {
      const n = p[i + 1];
      if (n === undefined || !/[dw\\.\-\[\](){}|*+?\/^$]/.test(n)) return false;
      i++;
      continue;
    }
    if (inClass) {
      if (c === "]") inClass = false;
      else if (c === "[") return false;
      continue;
    }
    if (c === "[") {
      if (p[i + 1] === "^") return false;
      inClass = true;
    } else if (c === "." || c === "^" || c === "$") {
      return false;
    } else if (c === "(" && p[i + 1] === "?") {
      if (p.slice(i, i + 3) !== "(?:") return false;
    }
  }
  if (inClass) return false;
  try {
    new RegExp(`^(?:${p})$`);
  } catch {
    return false;
  }
  return true;
}

const MONTH = /^[0-9]{4}-(0[1-9]|1[0-2])$/;

// 13 or more ASCII digits in a row, where a single space or hyphen between digits does not break the run.
// Other characters (including full-width digits) reset it. Mirrors admin/src/validator/executor.py.
function hasCardNumber(s) {
  let count = 0;
  let pendingSeparator = false;
  for (const ch of s) {
    if (ch >= "0" && ch <= "9") {
      count++;
      pendingSeparator = false;
      if (count >= 13) return true;
    } else if ((ch === " " || ch === "-") && count > 0 && !pendingSeparator) {
      pendingSeparator = true;
    } else {
      count = 0;
      pendingSeparator = false;
    }
  }
  return false;
}

// Plain text only: no '<', no '>', no control characters (U+0000-U+001F, U+007F).
function isPlainText(s) {
  for (const ch of s) {
    const code = ch.codePointAt(0);
    if (ch === "<" || ch === ">" || code <= 0x1f || code === 0x7f) return false;
  }
  return true;
}

// Returns true when the value passes the check. `ctx` carries the document, settings and the resolved object.
function runCheck(name, param, value, ctx) {
  switch (name) {
    case "required":
      return value !== MISSING;
    case "noUnknownFields":
      return isObject(value) && Array.isArray(param) && Object.keys(value).every((k) => param.includes(k));
    case "type":
      if (!TYPES.includes(param)) return false;
      return param === "integer" ? isInteger(value) : typeOf(value) === param;
    case "min":
      return isInteger(value) && isInteger(param) && value >= param;
    case "max":
      return isInteger(value) && isInteger(param) && value <= param;
    case "minLength":
      return typeof value === "string" && isInteger(param) && [...value].length >= param;
    case "maxLength":
      return typeof value === "string" && isInteger(param) && [...value].length <= param;
    case "maxItems":
      return Array.isArray(value) && isInteger(param) && value.length <= param;
    case "enum":
      return Array.isArray(param) && param.some((x) => same(value, x));
    case "pattern":
      return typeof value === "string" && new RegExp(`^(?:${param})$`).test(value);
    case "noCardNumber":
      return typeof value === "string" && !hasCardNumber(value);
    case "plainText":
      return typeof value === "string" && isPlainText(value);
    case "refersTo": {
      if (typeof param !== "string") return false;
      return resolve(ctx.doc, param).some((e) => e.value !== MISSING && same(value, e.value));
    }
    case "atLeastSetting": {
      const s = ctx.settings && Object.prototype.hasOwnProperty.call(ctx.settings, param) ? ctx.settings[param] : undefined;
      return isInteger(value) && isInteger(s) && value >= s;
    }
    case "periodOrder": {
      if (!isObject(value) || !Array.isArray(param) || param.length !== 2) return false;
      const a = value[param[0]];
      const b = value[param[1]];
      return typeof a === "string" && typeof b === "string" && MONTH.test(a) && MONTH.test(b) && a <= b;
    }
    default:
      return false; // unknown check: default deny
  }
}

export function evaluate(rules, ruleSetName, document, settings = {}) {
  const deny = (failures) => ({ decision: "deny", failures });
  const set = rules && isObject(rules.ruleSets) && Object.prototype.hasOwnProperty.call(rules.ruleSets, ruleSetName) ? rules.ruleSets[ruleSetName] : undefined;
  if (!set) return deny([{ rule: "", path: "", code: "UNKNOWN_RULESET" }]);
  if (!isObject(document)) return deny([{ rule: "", path: "", code: "INVALID_INPUT" }]);
  const list = Array.isArray(set.rules) ? set.rules : [];
  if (list.length === 0) return deny([{ rule: "", path: "", code: "NO_RULES" }]);

  const failures = [];
  for (const rule of list) {
    if (!isObject(rule) || typeof rule.id !== "string" || typeof rule.reason !== "string" || typeof rule.path !== "string" || !Array.isArray(rule.checks)) {
      failures.push({ rule: isObject(rule) && typeof rule.id === "string" ? rule.id : "", path: "", code: "INVALID_RULE" });
      continue;
    }
    for (const entry of resolve(document, rule.path)) {
      for (const check of rule.checks) {
        const keys = isObject(check) ? Object.keys(check) : [];
        const name = keys[0];
        const param = check[name];
        let ok;
        if (keys.length !== 1) ok = false;
        else if (entry.value === MISSING && name !== "required") continue; // optional field absent
        else if (name === "pattern" && !patternSupported(param)) {
          failures.push({ rule: rule.id, path: entry.path, code: "UNSUPPORTED_PATTERN" });
          break;
        } else ok = runCheck(name, param, entry.value, { doc: document, settings });
        if (!ok) {
          failures.push({ rule: rule.id, path: entry.path, code: rule.reason });
          break;
        }
      }
    }
  }
  return failures.length === 0 ? { decision: "allow", failures: [] } : deny(failures);
}
