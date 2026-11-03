// Static safety checks on the UI sources (T033, FR-018): user text must never be rendered as markup.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { ROOT } from "./helpers.js";

const FORBIDDEN = ["innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval(", "new Function", "setTimeout(\"", "javascript:"];
const dirs = [path.join(ROOT, "web", "src", "ui"), path.join(ROOT, "web", "src")];

function sourceFiles() {
  const files = new Set();
  for (const dir of dirs) {
    for (const f of readdirSync(dir)) if (f.endsWith(".js")) files.add(path.join(dir, f));
  }
  files.add(path.join(ROOT, "web", "index.html"));
  return [...files];
}

test("no web source uses an API that turns text into markup or code", () => {
  for (const file of sourceFiles()) {
    const text = readFileSync(file, "utf8");
    for (const bad of FORBIDDEN) assert.equal(text.includes(bad), false, `${path.relative(ROOT, file)} uses ${bad}`);
  }
});

test("the page makes no network request except loading its own rules file", () => {
  for (const file of sourceFiles()) {
    const text = readFileSync(file, "utf8");
    const rel = path.relative(ROOT, file);
    for (const api of ["XMLHttpRequest", "WebSocket", "sendBeacon", "EventSource", "navigator."]) {
      assert.equal(text.includes(api), false, `${rel} uses ${api}`);
    }
    const fetches = text.match(/fetch\(/g) ?? [];
    if (rel.endsWith("main.js")) assert.equal(fetches.length, 1);
    else assert.equal(fetches.length, 0, `${rel} must not call fetch`);
    assert.equal(/https?:\/\//.test(text.replace(/<!doctype[^>]*>/i, "")), false, `${rel} contains an external URL`);
  }
});
