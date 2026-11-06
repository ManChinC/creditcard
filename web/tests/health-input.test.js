// What the health check reads from the user's stored data (T051): monthly amounts, current cards, held cards.
import test from "node:test";
import assert from "node:assert/strict";
import { freshStore } from "./helpers.js";
import { seedDefaultChannels } from "../src/sdk/channels.js";
import { makeCard, makeMapping, makeHabit, makeSnapshot } from "../src/sdk/models.js";
import { healthInputs } from "../src/sdk/health-input.js";

const CUBE = makeCard({ id: "card-a", issuer: "國泰", name: "CUBE 卡" });
const J = makeCard({ id: "card-b", issuer: "富邦", name: "J 卡" });

function setup() {
  const { store } = freshStore();
  const channels = seedDefaultChannels(store);
  store.put("cards", CUBE);
  store.put("cards", J);
  return { store, channels };
}
const snap = (id, confirmedAt, totals) =>
  makeSnapshot({ id, confirmedAt, period: { start: "2026-08", end: "2026-10" }, channelTotals: totals, source: "llm-paste" });

test("the monthly amount is the latest snapshot's total divided by the months it covers, and the card is the mapping's", () => {
  const { store, channels } = setup();
  const [a, b] = channels;
  assert.equal(store.put("snapshots", snap("snap-1", "2026-11-01", [{ channelId: a.id, total: 10000 }, { channelId: b.id, total: 3500 }])).ok, true);
  store.put("mappings", makeMapping({ channelId: a.id, cardId: "card-a", source: "imported" }));
  const { rows } = healthInputs(store, channels);
  assert.deepEqual(rows[0], { channelId: a.id, channelName: a.name, monthlyAverage: 3333, current: { issuer: "國泰", name: "CUBE 卡" } });
  assert.equal(rows[1].monthlyAverage, 1167); // 3500 / 3 = 1166.67
  assert.equal(rows[1].current, null); // no mapping: unknown, not guessed
});

test("the most recent snapshot is the one used", () => {
  const { store, channels } = setup();
  const a = channels[0];
  store.put("snapshots", snap("snap-old", "2026-09-01", [{ channelId: a.id, total: 3000 }]));
  store.put("snapshots", snap("snap-new", "2026-11-01", [{ channelId: a.id, total: 9000 }]));
  assert.equal(healthInputs(store, channels).rows[0].monthlyAverage, 3000);
});

test("a channel the snapshot does not mention uses the user's own answer, card first from the answer", () => {
  const { store, channels } = setup();
  const [a, b] = channels;
  store.put("snapshots", snap("snap-1", "2026-11-01", [{ channelId: a.id, total: 9000 }]));
  store.put("habits", makeHabit({ channelId: b.id, cardId: "card-b", approxMonthly: 2000 }));
  store.put("mappings", makeMapping({ channelId: b.id, cardId: "card-a", source: "imported" }));
  const row = healthInputs(store, channels).rows[1];
  assert.equal(row.monthlyAverage, 2000);
  assert.deepEqual(row.current, { issuer: "富邦", name: "J 卡" });
});

test("with no snapshot at all, only the user's own answers are used", () => {
  const { store, channels } = setup();
  const a = channels[0];
  store.put("habits", makeHabit({ channelId: a.id, approxMonthly: 700 }));
  const { rows } = healthInputs(store, channels);
  assert.equal(rows[0].monthlyAverage, 700);
  assert.equal(rows[0].current, null);
  assert.equal(rows[1].monthlyAverage, null);
});

test("an answered 'don't know' stays unknown, and held cards are listed", () => {
  const { store, channels } = setup();
  store.put("habits", makeHabit({ channelId: channels[0].id }));
  const { rows, heldCards } = healthInputs(store, channels);
  assert.equal(rows[0].monthlyAverage, null);
  assert.deepEqual(heldCards, [{ issuer: "國泰", name: "CUBE 卡" }, { issuer: "富邦", name: "J 卡" }]);
});

test("a mapping that points at a card that is no longer stored is unknown", () => {
  const { store, channels } = setup();
  const a = channels[0];
  store.put("snapshots", snap("snap-1", "2026-11-01", [{ channelId: a.id, total: 3000 }]));
  store.put("mappings", makeMapping({ channelId: a.id, cardId: "card-gone", source: "imported" }));
  assert.equal(healthInputs(store, channels).rows[0].current, null);
});
