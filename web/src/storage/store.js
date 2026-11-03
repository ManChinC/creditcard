// Browser storage module (T017, AD-003, FR-016, FR-050).
//
// Public mode keeps only non-sensitive data in the browser's built-in storage, unencrypted and without any
// unlock. Every write and every read goes through the Validator (stored-* rule sets); this module makes no
// security decision of its own (Constitution XIII). The storage backend is injected so it can be tested.
// Which built-in storage API is used (localStorage here) is not fixed by AD-003: [TBD].

import { evaluate as defaultEvaluate } from "../validator/executor.js";
import { COLLECTIONS } from "../sdk/models.js";

const DEFAULT_PREFIX = "ccs:";

function fail(code) {
  return { ok: false, failures: [{ rule: "", path: "", code }] };
}

export function createStore({ backend, rules, evaluate = defaultEvaluate, prefix = DEFAULT_PREFIX }) {
  const keyOf = (collection) => `${prefix}${collection}`;

  // Returns {id: record} read from the backend; anything unreadable counts as empty. The result has no
  // prototype so an id such as "__proto__" is an ordinary key and cannot change object behaviour.
  function readAll(collection) {
    const out = Object.create(null);
    let raw;
    try {
      raw = backend.getItem(keyOf(collection));
    } catch {
      return out;
    }
    if (typeof raw !== "string") return out;
    try {
      const parsed = JSON.parse(raw);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        for (const [k, v] of Object.entries(parsed)) out[k] = v;
      }
    } catch {
      // unreadable: treated as empty
    }
    return out;
  }

  function isValid(collection, record) {
    return evaluate(rules, COLLECTIONS[collection], record).decision === "allow";
  }

  return {
    // Dry run: what the Validator would say about a record, without writing anything.
    validate(collection, record) {
      if (!Object.prototype.hasOwnProperty.call(COLLECTIONS, collection)) return { ok: false, failures: fail("UNKNOWN_COLLECTION").failures };
      const verdict = evaluate(rules, COLLECTIONS[collection], record);
      return { ok: verdict.decision === "allow", failures: verdict.failures };
    },

    put(collection, record) {
      if (!Object.prototype.hasOwnProperty.call(COLLECTIONS, collection)) return fail("UNKNOWN_COLLECTION");
      const verdict = evaluate(rules, COLLECTIONS[collection], record);
      if (verdict.decision !== "allow") return { ok: false, failures: verdict.failures };
      const all = readAll(collection);
      all[record.id] = record;
      try {
        backend.setItem(keyOf(collection), JSON.stringify(all));
      } catch {
        return fail("STORAGE_UNAVAILABLE");
      }
      return { ok: true, failures: [] };
    },

    // Records that no longer pass the Validator (for example edited by hand in dev tools) are dropped.
    list(collection) {
      if (!Object.prototype.hasOwnProperty.call(COLLECTIONS, collection)) return [];
      return Object.values(readAll(collection)).filter((r) => isValid(collection, r));
    },

    get(collection, id) {
      if (!Object.prototype.hasOwnProperty.call(COLLECTIONS, collection)) return undefined;
      const all = readAll(collection);
      const record = typeof id === "string" ? all[id] : undefined;
      return record !== undefined && isValid(collection, record) ? record : undefined;
    },

    remove(collection, id) {
      if (!Object.prototype.hasOwnProperty.call(COLLECTIONS, collection)) return fail("UNKNOWN_COLLECTION");
      const all = readAll(collection);
      delete all[id];
      try {
        backend.setItem(keyOf(collection), JSON.stringify(all));
      } catch {
        return fail("STORAGE_UNAVAILABLE");
      }
      return { ok: true, failures: [] };
    },

    // One-click clear (FR-050). Returns ok:false if any collection could not be removed.
    clearAll() {
      let ok = true;
      for (const collection of Object.keys(COLLECTIONS)) {
        try {
          backend.removeItem(keyOf(collection));
        } catch {
          ok = false;
        }
      }
      return ok ? { ok: true, failures: [] } : fail("STORAGE_UNAVAILABLE");
    },
  };
}

// The real backend in a browser. Access can throw (private windows, blocked site data), so it is wrapped.
export function browserBackend() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}
