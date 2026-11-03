// Smart questioning (T029, FR-023): walks the user through channels one at a time, entirely in the browser.
// Every step is local, synchronous work, so each answer gets its response immediately (SC-009 target: 30 s).
// "I don't know" and skipping never fill in defaults: the field is left out and shown as unknown (US1 scenario 8).

import { makeCard, makeHabit, makeMapping } from "./models.js";
import { cardIdFor } from "./mapping.js";

export function createSmartSession({ channels }) {
  const queue = channels.map((c) => ({ id: c.id, name: c.name }));
  let cards = [];
  let cardsAnswered = false;
  let index = 0;
  const habits = [];

  function current() {
    if (!cardsAnswered) return { step: "cards" };
    if (index >= queue.length) return { step: "done" };
    return { step: "channel", channel: queue[index], cards: cards.map((c) => ({ id: c.id, issuer: c.issuer, name: c.name })) };
  }

  return {
    current,

    // The cards the user holds. May be empty. Duplicates (same issuer and name) are merged.
    answerCards(list) {
      if (cardsAnswered) return { ok: false, code: "ALREADY_ANSWERED" };
      const byId = new Map();
      for (const { issuer, name } of list) {
        const id = cardIdFor(issuer, name);
        if (!byId.has(id)) byId.set(id, makeCard({ id, issuer, name }));
      }
      cards = [...byId.values()];
      cardsAnswered = true;
      return { ok: true };
    },

    // cardId must be one of the held cards. Omit cardId and approxMonthly (or pass skip) for "don't know".
    answerChannel({ cardId, approxMonthly, skip = false } = {}) {
      const step = current();
      if (step.step !== "channel") return { ok: false, code: "NO_QUESTION" };
      if (!skip) {
        if (cardId !== undefined && !cards.some((c) => c.id === cardId)) return { ok: false, code: "UNKNOWN_CARD" };
        if (approxMonthly !== undefined && !(Number.isInteger(approxMonthly) && approxMonthly >= 0)) return { ok: false, code: "BAD_AMOUNT" };
      }
      habits.push(skip ? makeHabit({ channelId: step.channel.id }) : makeHabit({ channelId: step.channel.id, cardId, approxMonthly }));
      index++;
      return { ok: true };
    },

    skip() {
      return this.answerChannel({ skip: true });
    },

    // Everything a finished session produces. Mappings exist only where the user named a card.
    result() {
      const mappings = habits.filter((h) => h.cardId !== undefined).map((h) => makeMapping({ channelId: h.channelId, cardId: h.cardId, source: "self-reported" }));
      return { done: current().step === "done", cards: [...cards], habits: habits.map((h) => ({ ...h })), mappings };
    },
  };
}

// Writes a finished session. Everything is validated first; nothing is written if any record is rejected.
export function commitSmartSession(store, session) {
  const out = session.result();
  if (!out.done) return { ok: false, failures: [{ rule: "", path: "", code: "SESSION_NOT_FINISHED" }] };
  const records = [...out.cards.map((r) => ["cards", r]), ...out.habits.map((r) => ["habits", r]), ...out.mappings.map((r) => ["mappings", r])];
  const rejected = [];
  for (const [collection, record] of records) {
    const v = store.validate(collection, record);
    if (!v.ok) rejected.push(...v.failures);
  }
  if (rejected.length > 0) return { ok: false, failures: rejected };
  for (const [collection, record] of records) {
    const r = store.put(collection, record);
    if (!r.ok) return r;
  }
  return { ok: true, failures: [] };
}
