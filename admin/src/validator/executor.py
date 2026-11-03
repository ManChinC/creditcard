"""Local Validator executor (T012). Reads rules/validator-rules.json; carries no rules of its own.

Must behave exactly like web/src/validator/executor.js (Constitution XIII); conformance/ cases enforce this.
"""
import json
import re
from pathlib import Path

MAX_SAFE = 9007199254740991
_MISSING = object()
_TYPES = ("string", "integer", "array", "object")
_MONTH = re.compile(r"[0-9]{4}-(0[1-9]|1[0-2])")


def load_rules(path):
    return json.loads(Path(path).read_text(encoding="utf-8"))


def _is_object(v):
    return isinstance(v, dict)


def _is_number(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def _is_integer(v):
    if not _is_number(v):
        return False
    if isinstance(v, float) and not (v == v and v not in (float("inf"), float("-inf")) and v.is_integer()):
        return False
    return abs(v) <= MAX_SAFE


def _type_of(v):
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "boolean"
    if isinstance(v, str):
        return "string"
    if _is_number(v):
        return "number"
    if isinstance(v, list):
        return "array"
    if isinstance(v, dict):
        return "object"
    return "other"


def _same(a, b):
    ta, tb = _type_of(a), _type_of(b)
    if ta != tb:
        return False
    if ta in ("array", "object"):
        return False
    return a == b


def _resolve(doc, path):
    """Path syntax: '' is the root; 'a.b' walks keys; a '[]' suffix on a key iterates an array."""
    if path == "":
        return [(path, doc)]
    entries = [("", doc)]
    for token in path.split("."):
        iterate = token.endswith("[]")
        key = token[:-2] if iterate else token
        nxt = []
        for p, value in entries:
            here = key if p == "" else f"{p}.{key}"
            if not _is_object(value) or key not in value:
                nxt.append((here, _MISSING))
                continue
            v = value[key]
            if not iterate:
                nxt.append((here, v))
            elif not isinstance(v, list):
                nxt.append((here, _MISSING))
            else:
                nxt.extend((f"{here}[{i}]", item) for i, item in enumerate(v))
        entries = nxt
    return entries


_ESCAPABLE = set("dw\\.-[](){}|*+?/^$")


def _pattern_supported(p):
    """ASCII only; literals, [..] classes (no negation), \\d \\w and escaped metacharacters, groups,
    alternation, quantifiers. No '.', '^', '$', '\\s', lookaround, backreferences."""
    if not isinstance(p, str) or p == "" or any(not (0x20 <= ord(c) <= 0x7E) for c in p):
        return False
    in_class = False
    i = 0
    while i < len(p):
        c = p[i]
        if c == "\\":
            n = p[i + 1] if i + 1 < len(p) else None
            if n is None or n not in _ESCAPABLE:
                return False
            i += 2
            continue
        if in_class:
            if c == "]":
                in_class = False
            elif c == "[":
                return False
        elif c == "[":
            if p[i + 1:i + 2] == "^":
                return False
            in_class = True
        elif c in ".^$":
            return False
        elif c == "(" and p[i + 1:i + 2] == "?":
            if p[i:i + 3] != "(?:":
                return False
        i += 1
    if in_class:
        return False
    try:
        re.compile(f"(?:{p})", re.ASCII)
    except re.error:
        return False
    return True


def _has_card_number(s):
    """13 or more ASCII digits in a row; a single space or hyphen between digits does not break the run.
    Other characters (including full-width digits) reset it. Mirrors web/src/validator/executor.js."""
    count = 0
    pending_separator = False
    for ch in s:
        if "0" <= ch <= "9":
            count += 1
            pending_separator = False
            if count >= 13:
                return True
        elif ch in (" ", "-") and count > 0 and not pending_separator:
            pending_separator = True
        else:
            count = 0
            pending_separator = False
    return False


def _is_plain_text(s):
    """No '<', no '>', no control characters (U+0000-U+001F, U+007F)."""
    return all(ch not in "<>" and ord(ch) > 0x1F and ord(ch) != 0x7F for ch in s)


def _run_check(name, param, value, doc, settings):
    if name == "required":
        return value is not _MISSING
    if name == "noUnknownFields":
        return _is_object(value) and isinstance(param, list) and all(k in param for k in value)
    if name == "type":
        if param not in _TYPES:
            return False
        return _is_integer(value) if param == "integer" else _type_of(value) == param
    if name == "min":
        return _is_integer(value) and _is_integer(param) and value >= param
    if name == "max":
        return _is_integer(value) and _is_integer(param) and value <= param
    if name == "minLength":
        return isinstance(value, str) and _is_integer(param) and len(value) >= param
    if name == "maxLength":
        return isinstance(value, str) and _is_integer(param) and len(value) <= param
    if name == "maxItems":
        return isinstance(value, list) and _is_integer(param) and len(value) <= param
    if name == "enum":
        return isinstance(param, list) and any(_same(value, x) for x in param)
    if name == "pattern":
        return isinstance(value, str) and re.fullmatch(param, value, re.ASCII) is not None
    if name == "noCardNumber":
        return isinstance(value, str) and not _has_card_number(value)
    if name == "plainText":
        return isinstance(value, str) and _is_plain_text(value)
    if name == "refersTo":
        if not isinstance(param, str):
            return False
        return any(v is not _MISSING and _same(value, v) for _, v in _resolve(doc, param))
    if name == "atLeastSetting":
        s = settings.get(param) if isinstance(settings, dict) and isinstance(param, str) else None
        return _is_integer(value) and _is_integer(s) and value >= s
    if name == "periodOrder":
        if not _is_object(value) or not isinstance(param, list) or len(param) != 2:
            return False
        a, b = value.get(param[0]), value.get(param[1])
        return isinstance(a, str) and isinstance(b, str) and bool(_MONTH.fullmatch(a)) and bool(_MONTH.fullmatch(b)) and a <= b
    return False  # unknown check: default deny


def evaluate(rules, rule_set_name, document, settings=None):
    settings = settings or {}

    def deny(failures):
        return {"decision": "deny", "failures": failures}

    sets = rules.get("ruleSets") if _is_object(rules) else None
    rule_set = sets.get(rule_set_name) if _is_object(sets) else None
    if rule_set is None:
        return deny([{"rule": "", "path": "", "code": "UNKNOWN_RULESET"}])
    if not _is_object(document):
        return deny([{"rule": "", "path": "", "code": "INVALID_INPUT"}])
    rule_list = rule_set.get("rules") if _is_object(rule_set) and isinstance(rule_set.get("rules"), list) else []
    if not rule_list:
        return deny([{"rule": "", "path": "", "code": "NO_RULES"}])

    failures = []
    for rule in rule_list:
        if (not _is_object(rule) or not isinstance(rule.get("id"), str) or not isinstance(rule.get("reason"), str)
                or not isinstance(rule.get("path"), str) or not isinstance(rule.get("checks"), list)):
            rid = rule.get("id") if _is_object(rule) and isinstance(rule.get("id"), str) else ""
            failures.append({"rule": rid, "path": "", "code": "INVALID_RULE"})
            continue
        for path, value in _resolve(document, rule["path"]):
            for check in rule["checks"]:
                keys = list(check.keys()) if _is_object(check) else []
                if len(keys) != 1:
                    ok = False
                else:
                    name = keys[0]
                    param = check[name]
                    if value is _MISSING and name != "required":
                        continue  # optional field absent
                    if name == "pattern" and not _pattern_supported(param):
                        failures.append({"rule": rule["id"], "path": path, "code": "UNSUPPORTED_PATTERN"})
                        break
                    ok = _run_check(name, param, value, document, settings)
                if not ok:
                    failures.append({"rule": rule["id"], "path": path, "code": rule["reason"]})
                    break
    if failures:
        return deny(failures)
    return {"decision": "allow", "failures": []}
