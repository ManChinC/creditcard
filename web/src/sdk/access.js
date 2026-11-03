// Operation access declarations and gate (T016, FR-044 to FR-046).
//
// This module only DECLARES access requirements and hands facts to the Validator. It makes no allow/deny
// decision of its own (Constitution XIII): the decision comes from the "access-public" rule set.
// Facts about the operation come from the declarations below, never from what the caller claims.

import { evaluate as defaultEvaluate } from "../validator/executor.js";

export const ACCESS_REQUIREMENTS = Object.freeze(["anonymous", "login-required"]);

function assertDeclaration(name, decl) {
  if (typeof name !== "string" || name === "") throw new TypeError("operation name must be a non-empty string");
  if (decl === null || typeof decl !== "object") throw new TypeError(`declaration for ${name} must be an object`);
  if (!ACCESS_REQUIREMENTS.includes(decl.accessRequirement)) {
    throw new TypeError(`${name}: accessRequirement must be one of ${ACCESS_REQUIREMENTS.join(", ")}`);
  }
  // The set of protectionLevel values is not defined by the spec yet; it is treated as an opaque string.
  if (typeof decl.protectionLevel !== "string" || decl.protectionLevel === "") {
    throw new TypeError(`${name}: protectionLevel must be a non-empty string`);
  }
}

export function createOperationRegistry() {
  const table = new Map();
  return {
    declare(name, decl) {
      assertDeclaration(name, decl);
      if (table.has(name)) throw new Error(`operation already declared: ${name}`);
      table.set(name, Object.freeze({ accessRequirement: decl.accessRequirement, protectionLevel: decl.protectionLevel }));
    },
    get(name) {
      return table.get(name);
    },
    names() {
      return [...table.keys()];
    },
  };
}

// Public-layer operations (contracts/sdk-operations.md). All are anonymous: the browser has no trust boundary,
// so nothing that needs protection may be declared here.
// [INFERRED] protectionLevel "public" is a placeholder: the spec does not yet define the set of levels.
export const PUBLIC_OPERATIONS = Object.freeze([
  "validateAndPreviewPaste",
  "smartQuestion",
  "queryChannel",
  "healthCheck",
  "evaluateNewCard",
  "recommend",
  "loadRewardData",
  "exportBackup",
  "clearData",
  "deleteAllData",
  "markCouponClaimed",
  "overrideRewardRule",
]);

export function createPublicRegistry() {
  const registry = createOperationRegistry();
  for (const name of PUBLIC_OPERATIONS) registry.declare(name, { accessRequirement: "anonymous", protectionLevel: "public" });
  return registry;
}

// The gate builds the document the "access" rule set judges (access-public). Caller-supplied claims are never forwarded.
export function createAccessGate({ registry, rules, evaluate = defaultEvaluate }) {
  return {
    check(operation) {
      const doc = { operation: typeof operation === "string" ? operation : "" };
      const declaration = typeof operation === "string" ? registry.get(operation) : undefined;
      if (declaration) doc.declaration = { ...declaration };
      // In the browser nobody is authenticated and nothing is a trusted local call.
      doc.caller = { authenticated: false, isLocal: false };
      return evaluate(rules, "access-public", doc);
    },
  };
}
