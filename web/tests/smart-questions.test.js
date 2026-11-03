// Tests for smart questioning (T022, FR-023, FR-024, US1 scenarios 6 to 8).
import test from "node:test";
import assert from "node:assert/strict";
import { freshStore } from "./helpers.js";
import { createSmartSession, commitSmartSession } from "../src/sdk/smart-questions.js";
import { cardIdFor } from "../src/sdk/mapping.js";
import { DEFAULT_CHANNELS } from "../src/sdk/default-channels.js";

const CUBE = { issuer: "國泰", name: "CUBE 卡" };

function startedSession(cards = [CUBE]) {
  const s = createSmartSession({ channels: DEFAULT_CHANNELS });
  s.answerCards(cards);
  return s;
}

test("the first question is about the cards the user holds, then one question per channel (US1 scenario 6)", () => {
  const s = createSmartSession({ channels: DEFAULT_CHANNELS });
  assert.equal(s.current().step, "cards");
  s.answerCards([CUBE]);
  const seen = [];
  while (s.current().step === "channel") {
    seen.push(s.current().channel.id);
    s.skip();
  }
  assert.deepEqual(seen, DEFAULT_CHANNELS.map((c) => c.id));
  assert.equal(s.current().step, "done");
});

test("answers keep the card and the self-reported amount, labelled as self-reported (FR-024)", () => {
  const s = startedSession();
  const cardId = cardIdFor(CUBE.issuer, CUBE.name);
  assert.equal(s.current().channel.id, "dept");
  s.answerChannel({ cardId, approxMonthly: 1200 });
  const habit = s.result().habits[0];
  assert.deepEqual(habit, { id: "dept", channelId: "dept", cardId, approxMonthly: 1200, source: "self-reported" });
});

test("'don't know' and skipping leave fields out instead of filling defaults (US1 scenario 7)", () => {
  const s = startedSession();
  s.skip();
  s.answerChannel({ cardId: cardIdFor(CUBE.issuer, CUBE.name) }); // card known, amount unknown
  const [skipped, partial] = s.result().habits;
  assert.deepEqual(Object.keys(skipped).sort(), ["channelId", "id", "source"]);
  assert.equal("approxMonthly" in partial, false);
  assert.equal("cardId" in partial, true);
});

test("a card the user did not list, or a bad amount, is refused and the question stays open", () => {
  const s = startedSession();
  assert.equal(s.answerChannel({ cardId: "card-deadbeef" }).code, "UNKNOWN_CARD");
  assert.equal(s.answerChannel({ approxMonthly: -1 }).code, "BAD_AMOUNT");
  assert.equal(s.answerChannel({ approxMonthly: 12.5 }).code, "BAD_AMOUNT");
  assert.equal(s.answerChannel({ approxMonthly: "100" }).code, "BAD_AMOUNT");
  assert.equal(s.current().channel.id, "dept");
});

test("cards can be answered only once, duplicates are merged, and an empty list is allowed", () => {
  const s = createSmartSession({ channels: DEFAULT_CHANNELS });
  assert.equal(s.answerCards([CUBE, CUBE, { issuer: "國泰", name: "cube 卡" }]).ok, true);
  assert.equal(s.result().cards.length, 1);
  assert.equal(s.answerCards([]).code, "ALREADY_ANSWERED");
  const none = createSmartSession({ channels: DEFAULT_CHANNELS });
  assert.equal(none.answerCards([]).ok, true);
  assert.equal(none.current().step, "channel");
});

test("answering after the last question does nothing", () => {
  const s = startedSession();
  while (s.current().step === "channel") s.skip();
  assert.equal(s.skip().code, "NO_QUESTION");
});

test("committing a finished session stores cards, habits and mappings only where a card was named", () => {
  const { store } = freshStore();
  const s = startedSession();
  const cardId = cardIdFor(CUBE.issuer, CUBE.name);
  s.answerChannel({ cardId, approxMonthly: 1200 });
  while (s.current().step === "channel") s.skip();
  assert.equal(commitSmartSession(store, s).ok, true);
  assert.equal(store.list("cards").length, 1);
  assert.equal(store.list("habits").length, DEFAULT_CHANNELS.length);
  assert.equal(store.list("mappings").length, 1);
  assert.equal(store.get("mappings", "dept").source, "self-reported");
});

test("an unfinished session cannot be committed", () => {
  const { store, backend } = freshStore();
  const before = backend.data.size;
  const result = commitSmartSession(store, startedSession());
  assert.equal(result.ok, false);
  assert.equal(result.failures[0].code, "SESSION_NOT_FINISHED");
  assert.equal(backend.data.size, before);
});

test("a card that fails the Validator stops the commit before anything is written", () => {
  const { store, backend } = freshStore();
  const s = startedSession([{ issuer: "不存在的銀行", name: "x" }]);
  while (s.current().step === "channel") s.skip();
  const before = backend.data.size;
  assert.equal(commitSmartSession(store, s).ok, false);
  assert.equal(backend.data.size, before);
});

test("answering all 11 channels takes far less than the 30 second target (SC-009)", () => {
  const start = performance.now();
  const s = startedSession();
  while (s.current().step === "channel") s.answerChannel({ cardId: cardIdFor(CUBE.issuer, CUBE.name), approxMonthly: 1000 });
  assert.ok(performance.now() - start < 1000);
});
