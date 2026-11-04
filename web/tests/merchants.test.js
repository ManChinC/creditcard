// Tests for designated merchants (T038, FR-055, FR-018, FR-008). Written before the implementation (web/src/sdk/merchants.js).
//
// Matching rule confirmed by the user on 2026-11-04 (data-model.md): after NFKC normalisation, the input matches a
// merchant when it contains the name or an alias, or the name or an alias contains the input. Input shorter than two
// characters is not matched. A miss is "not listed, check the official site", never "no reward".
//
// Interface under test:
//   matchMerchant(input, merchants) -> { status: "matched", merchants: [name] } | { status: "not-listed" } |
//                                      { status: "too-short" } | { status: "unknown" }
//     merchants: [{ name, aliases? }] as published; undefined means the card's list is not known.
//   designatedByCard(rules, channel) -> [{ issuer, cardName, status: "listed" | "unknown", merchants: [{ name, aliases? }] }]
//     one entry per card with a rule in the channel; merchants are merged across that card's payment methods.
import test from "node:test";
import assert from "node:assert/strict";
import { matchMerchant, designatedByCard } from "../src/sdk/merchants.js";

const LIST = [
  { name: "遠東百貨", aliases: ["遠百"] },
  { name: "SOGO 百貨", aliases: ["sogo", "太平洋崇光"] },
];

test("an exact alias or name matches", () => {
  assert.deepEqual(matchMerchant("遠百", LIST), { status: "matched", merchants: ["遠東百貨"] });
  assert.deepEqual(matchMerchant("遠東百貨", LIST), { status: "matched", merchants: ["遠東百貨"] });
});

test("input that contains an alias matches (a user typing the place and the branch)", () => {
  assert.deepEqual(matchMerchant("我要去遠百信義店", LIST), { status: "matched", merchants: ["遠東百貨"] });
});

test("input that is part of a name matches", () => {
  assert.deepEqual(matchMerchant("遠東", LIST), { status: "matched", merchants: ["遠東百貨"] });
});

test("case and full-width forms do not matter (NFKC)", () => {
  assert.deepEqual(matchMerchant("SOGO", LIST), { status: "matched", merchants: ["SOGO 百貨"] });
  assert.deepEqual(matchMerchant("ＳＯＧＯ", LIST), { status: "matched", merchants: ["SOGO 百貨"] });
  assert.deepEqual(matchMerchant("  Sogo  ", LIST), { status: "matched", merchants: ["SOGO 百貨"] });
});

test("input shared by several merchants returns all of them, in list order", () => {
  assert.deepEqual(matchMerchant("百貨", LIST), { status: "matched", merchants: ["遠東百貨", "SOGO 百貨"] });
});

test("input shorter than two characters is not matched (too short, not a miss)", () => {
  assert.deepEqual(matchMerchant("百", LIST), { status: "too-short" });
  assert.deepEqual(matchMerchant("", LIST), { status: "too-short" });
  assert.deepEqual(matchMerchant("   ", LIST), { status: "too-short" });
  assert.deepEqual(matchMerchant(" 遠 ", LIST), { status: "too-short" });
});

test("length is counted in characters, not UTF-16 units", () => {
  assert.deepEqual(matchMerchant("😀", LIST), { status: "too-short" });
});

test("a merchant that is not in the list is 'not listed', never 'no reward'", () => {
  assert.deepEqual(matchMerchant("新光三越", LIST), { status: "not-listed" });
});

test("an empty published list means nothing is designated: not listed", () => {
  assert.deepEqual(matchMerchant("遠百", []), { status: "not-listed" });
});

test("a list that is not known is reported as unknown, not as a miss (FR-008)", () => {
  assert.deepEqual(matchMerchant("遠百", undefined), { status: "unknown" });
});

test("a merchant without aliases still matches by name", () => {
  assert.deepEqual(matchMerchant("大潤發", [{ name: "大潤發" }]), { status: "matched", merchants: ["大潤發"] });
});

test("user input is data: markup and script text neither throw nor match, and nothing is echoed back as markup (FR-018)", () => {
  for (const hostile of ["<script>alert(1)</script>", "<img src=x onerror=alert(1)>", "'; DROP TABLE x; --", "javascript:alert(1)"]) {
    const result = matchMerchant(hostile, LIST);
    assert.deepEqual(result, { status: "not-listed" });
    assert.equal(JSON.stringify(result).includes(hostile), false);
  }
});

test("markup around a real alias is still only data: the alias matches and the markup is ignored", () => {
  const result = matchMerchant("<b>遠百</b>", LIST);
  assert.deepEqual(result, { status: "matched", merchants: ["遠東百貨"] });
});

test("matching does not modify the published list", () => {
  const list = Object.freeze([Object.freeze({ name: "遠東百貨", aliases: Object.freeze(["遠百"]) })]);
  assert.doesNotThrow(() => matchMerchant("遠百", list));
});

// ---- designatedByCard ----

const RULES = [
  { issuer: "國泰", cardName: "CUBE 卡", channel: "百貨", paymentMethod: "實體卡", designatedMerchants: [{ name: "遠東百貨", aliases: ["遠百"] }] },
  { issuer: "國泰", cardName: "CUBE 卡", channel: "百貨", paymentMethod: "行動支付", designatedMerchants: [{ name: "遠東百貨", aliases: ["遠百"] }, { name: "SOGO 百貨" }] },
  { issuer: "富邦", cardName: "J 卡", channel: "百貨" },
  { issuer: "富邦", cardName: "J 卡", channel: "餐飲", designatedMerchants: [{ name: "某餐廳" }] },
  { issuer: "永豐", cardName: "DAWAY 卡", channel: "餐飲", designatedMerchants: [] },
];

test("each card with a rule in the channel is listed once, with its designated merchants merged across payment methods (FR-055)", () => {
  const result = designatedByCard(RULES, "百貨");
  assert.deepEqual(result.map((r) => r.cardName), ["CUBE 卡", "J 卡"]);
  const cube = result[0];
  assert.equal(cube.status, "listed");
  assert.deepEqual(cube.merchants.map((m) => m.name), ["遠東百貨", "SOGO 百貨"]);
});

test("a card whose rules do not state designated merchants is unknown, not 'none' (FR-008)", () => {
  const j = designatedByCard(RULES, "百貨").find((r) => r.cardName === "J 卡");
  assert.deepEqual(j, { issuer: "富邦", cardName: "J 卡", status: "unknown", merchants: [] });
});

test("an explicitly empty list is listed with no merchants", () => {
  const result = designatedByCard(RULES, "餐飲");
  const daway = result.find((r) => r.cardName === "DAWAY 卡");
  assert.deepEqual(daway, { issuer: "永豐", cardName: "DAWAY 卡", status: "listed", merchants: [] });
});

test("the same card in another channel keeps its own list", () => {
  const result = designatedByCard(RULES, "餐飲");
  assert.deepEqual(result.find((r) => r.cardName === "J 卡").merchants.map((m) => m.name), ["某餐廳"]);
  assert.equal(result.some((r) => r.cardName === "CUBE 卡"), false);
});

test("a channel nobody has a rule for gives an empty list", () => {
  assert.deepEqual(designatedByCard(RULES, "加油"), []);
});
