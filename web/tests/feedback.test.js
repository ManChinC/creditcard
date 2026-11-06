// Local queue of failed channel searches (T092 option "local queue + user export"). Nothing is sent anywhere.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ROOT, freshStore } from "./helpers.js";
import { MAX_FEEDBACK, KIND_CHANNEL_NOT_FOUND as KIND, buildReport, clearFeedback, feedbackId, listFeedback, recordFailure } from "../src/sdk/feedback.js";

const day = (n) => new Date(2026, 10, 1 + n);

test("a failed search is queued once, with only the text and the date", () => {
  const { store } = freshStore();
  assert.deepEqual(recordFailure(store, KIND, "  CPC   加油 ", day(5)), { ok: true, recorded: true });
  assert.deepEqual(recordFailure(store, KIND, "cpc 加油", day(6)), { ok: true, recorded: false });
  const [r] = listFeedback(store);
  assert.deepEqual(Object.keys(r).sort(), ["createdAt", "id", "kind", "text"]);
  assert.equal(r.text, "CPC 加油");
  assert.equal(r.createdAt, "2026-11-06");
  assert.equal(r.id, feedbackId(KIND, "CPC 加油"));
});

test("empty text, markup and card-number-like text are not queued", () => {
  const { store } = freshStore();
  assert.equal(recordFailure(store, KIND, "   ").recorded, false);
  assert.equal(recordFailure(store, KIND, "<b>x</b>").ok, false);
  assert.equal(recordFailure(store, KIND, "4111 1111 1111 1111").ok, false);
  assert.equal(recordFailure(store, KIND, "x".repeat(31)).ok, false);
  assert.equal(listFeedback(store).length, 0);
});

test("the queue keeps the newest records when it is full", () => {
  const { store } = freshStore();
  for (let i = 0; i < MAX_FEEDBACK + 5; i++) recordFailure(store, KIND, `通路${i}`, day(i % 20));
  const items = listFeedback(store);
  assert.equal(items.length, MAX_FEEDBACK);
  assert.ok(items.some((r) => r.text === `通路${MAX_FEEDBACK + 4}`));
});

test("the report lists the queue as plain text and says nothing is sent automatically", () => {
  const { store } = freshStore();
  recordFailure(store, KIND, "CPC 加油", day(5));
  recordFailure(store, KIND, "百貨 / GlobalMall", day(5));
  const text = buildReport(store, { lastVerifiedAt: "2026-11-01", now: day(6) });
  assert.match(text, /不會自動送出/);
  assert.match(text, /回饋資料最後查證日期：2026-11-01/);
  assert.match(text, /筆數：2/);
  assert.match(text, /- CPC 加油（2026-11-06）/);
  assert.equal(buildReport(store, { now: day(6) }).includes("最後查證日期：未知"), true);
});

test("clearing empties the queue, and the one-click clear of all data removes it too", () => {
  const { store, backend } = freshStore();
  recordFailure(store, KIND, "CPC 加油");
  clearFeedback(store);
  assert.equal(listFeedback(store).length, 0);
  recordFailure(store, KIND, "CPC 加油");
  assert.equal(store.clearAll().ok, true);
  assert.equal([...backend.data.keys()].some((k) => k.endsWith("feedback")), false);
});

test("the report module and page make no network or clipboard call", () => {
  for (const f of ["web/src/sdk/feedback.js", "web/src/ui/feedback-page.js"]) {
    const text = readFileSync(path.join(ROOT, f), "utf8");
    for (const api of ["fetch(", "navigator", "sendBeacon", "XMLHttpRequest"]) assert.equal(text.replace(/\/\/.*$/gm, "").includes(api), false, `${f} ${api}`);
  }
});
