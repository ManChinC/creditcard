// Runs every conformance case (conformance/*.json) against the browser executor (T013).
// The Python executor runs the same files in admin/tests/test_conformance.py.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { evaluate } from "../src/validator/executor.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = path.join(ROOT, "conformance");
const files = readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();

test("conformance directory has case files", () => {
  assert.ok(files.length > 0);
});

for (const file of files) {
  const suite = JSON.parse(readFileSync(path.join(DIR, file), "utf8"));
  const rules = JSON.parse(readFileSync(path.join(ROOT, suite.rules), "utf8"));
  for (const c of suite.cases) {
    test(`${file}: ${c.id}`, () => {
      assert.deepEqual(evaluate(rules, c.ruleSet, c.input, c.settings), c.expect);
    });
  }
}
