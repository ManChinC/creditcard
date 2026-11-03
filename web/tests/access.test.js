// Tests for operation access declarations and the gate (T016, T065 browser part).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { evaluate } from "../src/validator/executor.js";
import { createOperationRegistry, createPublicRegistry, createAccessGate, PUBLIC_OPERATIONS } from "../src/sdk/access.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const rules = JSON.parse(readFileSync(path.join(ROOT, "rules", "validator-rules.json"), "utf8"));

test("every public operation is declared and anonymous", () => {
  const registry = createPublicRegistry();
  assert.deepEqual(registry.names().sort(), [...PUBLIC_OPERATIONS].sort());
  for (const name of registry.names()) assert.equal(registry.get(name).accessRequirement, "anonymous");
});

test("declarations are frozen so callers cannot change them", () => {
  const registry = createPublicRegistry();
  assert.throws(() => {
    registry.get("queryChannel").accessRequirement = "anonymous-but-edited";
  }, TypeError);
});

test("invalid or duplicate declarations are rejected", () => {
  const registry = createOperationRegistry();
  assert.throws(() => registry.declare("x", { accessRequirement: "sometimes", protectionLevel: "p" }), TypeError);
  assert.throws(() => registry.declare("x", { accessRequirement: "anonymous", protectionLevel: "" }), TypeError);
  assert.throws(() => registry.declare("", { accessRequirement: "anonymous", protectionLevel: "p" }), TypeError);
  registry.declare("x", { accessRequirement: "anonymous", protectionLevel: "p" });
  assert.throws(() => registry.declare("x", { accessRequirement: "anonymous", protectionLevel: "p" }), Error);
});

test("with the real rules, every declared public operation is allowed", () => {
  const gate = createAccessGate({ registry: createPublicRegistry(), rules });
  for (const name of PUBLIC_OPERATIONS) assert.equal(gate.check(name).decision, "allow", name);
});

test("an undeclared operation is denied (FR-046)", () => {
  const gate = createAccessGate({ registry: createPublicRegistry(), rules });
  const result = gate.check("deleteEverythingOnTheServer");
  assert.equal(result.decision, "deny");
  assert.ok(result.failures.some((f) => f.code === "UNDECLARED"));
});

test("operation names that are not plain identifiers are denied", () => {
  const gate = createAccessGate({ registry: createPublicRegistry(), rules });
  for (const bad of [undefined, null, 5, {}, ["queryChannel"], "", "query channel", "queryChannel;drop", "__proto__"]) {
    assert.equal(gate.check(bad).decision, "deny", String(bad));
  }
});

test("a login-required operation is denied in the browser", () => {
  const registry = createOperationRegistry();
  registry.declare("adminOnly", { accessRequirement: "login-required", protectionLevel: "p" });
  const result = createAccessGate({ registry, rules }).check("adminOnly");
  assert.equal(result.decision, "deny");
  assert.ok(result.failures.some((f) => f.code === "NOT_ANONYMOUS"));
});

test("caller claims are never forwarded to the Validator", () => {
  const registry = createOperationRegistry();
  registry.declare("adminOnly", { accessRequirement: "login-required", protectionLevel: "p" });
  let seen;
  const spy = (r, set, doc) => {
    seen = doc;
    return evaluate(r, set, doc);
  };
  const gate = createAccessGate({ registry, rules, evaluate: spy });
  // Extra arguments (a caller trying to claim anonymous access) must be ignored.
  const result = gate.check("adminOnly", { accessRequirement: "anonymous", authenticated: true, isLocal: true });
  assert.equal(result.decision, "deny");
  assert.deepEqual(Object.keys(seen).sort(), ["caller", "declaration", "operation"]);
  assert.deepEqual(seen.caller, { authenticated: false, isLocal: false });
  assert.equal(seen.declaration.accessRequirement, "login-required");
});

test("the local-service rule set stays empty and denies everything until T065", () => {
  assert.equal(evaluate(rules, "access-admin", { operation: "queryChannel" }).failures[0].code, "NO_RULES");
});
