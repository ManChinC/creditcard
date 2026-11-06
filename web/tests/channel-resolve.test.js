// Matching a user's channel to the channel names in the published reward data (decision 2026-11-06).
// Order: exact name -> same core name (brackets and "含..." removed) -> the user's own channel (canonicalId, then its
// name and aliases) -> nothing. Names that only partly overlap are offered as candidates for the user to confirm;
// they are never applied by themselves (no guessing).
import test from "node:test";
import assert from "node:assert/strict";
import { freshStore } from "./helpers.js";
import { extractCore, seedDefaultChannels, updateChannel, setCanonical, channelCandidates, MIN_CORE_CHARS } from "../src/sdk/channels.js";
import { resolveChannel } from "../src/sdk/query.js";

const DATA = ["餐飲", "加油", "百貨"];

test("extractCore removes bracketed text and a trailing 含... part, and nothing else", () => {
  assert.equal(extractCore("餐飲（含連加 LinePay）"), "餐飲");
  assert.equal(extractCore("餐飲(含連加)"), "餐飲");
  assert.equal(extractCore("海外訂閱（Claude / YT / Apple）"), "海外訂閱");
  assert.equal(extractCore("飲料咖啡（連加支付）"), "飲料咖啡");
  assert.equal(extractCore("餐飲含連加"), "餐飲");
  assert.equal(extractCore("  Ｇｌｏｂａｌ  Mall "), "global mall");
  assert.equal(extractCore("百貨 / GlobalMall"), "百貨 / globalmall"); // a slash is not stripped
  assert.equal(extractCore("加油"), "加油");
  assert.equal(extractCore("（含）"), ""); // nothing left: callers treat "" as no name
});

test("a user's default channel resolves to the published name through the core name, without an alias", () => {
  const { store } = freshStore();
  const channels = seedDefaultChannels(store);
  assert.equal(resolveChannel("餐飲（含連加 LinePay）", DATA, channels), "餐飲");
  assert.equal(resolveChannel("餐飲", DATA, channels), "餐飲");
  assert.equal(resolveChannel(" 加油 ", DATA, channels), "加油");
});

test("the core name must identify exactly one published channel", () => {
  const { store } = freshStore();
  const channels = seedDefaultChannels(store);
  assert.equal(resolveChannel("餐飲（含連加 LinePay）", ["餐飲（外送）", "餐飲（堂食）"], channels), null);
});

test("a partly overlapping name is not applied; it is offered as a candidate", () => {
  const { store } = freshStore();
  const channels = seedDefaultChannels(store);
  assert.equal(resolveChannel("百貨 / GlobalMall", DATA, channels), null);
  assert.deepEqual(channelCandidates("百貨 / GlobalMall", DATA, channels), ["百貨"]);
  assert.deepEqual(channelCandidates("加油站", DATA, channels), ["加油"]);
  assert.deepEqual(channelCandidates("完全不認識", DATA, channels), []);
});

test("candidates need at least two characters on both sides, so a single character never matches", () => {
  assert.equal(MIN_CORE_CHARS, 2);
  assert.deepEqual(channelCandidates("油", DATA, []), []);
  assert.deepEqual(channelCandidates("加油", ["油"], []), []);
});

test("the user's own aliases feed the candidates and the match", () => {
  const { store } = freshStore();
  const channels = seedDefaultChannels(store);
  updateChannel(store, "dept", { aliases: ["百貨公司"] });
  const now = store.list("channels");
  assert.equal(resolveChannel("百貨 / GlobalMall", ["百貨公司"], now), "百貨公司");
  assert.deepEqual(channelCandidates("旅遊訂房 / 機票", ["訂房"], now), ["訂房"]); // the longer name contains the published one
  assert.equal(channels.length, 11);
});

test("a confirmed canonicalId resolves the channel from then on", () => {
  const { store } = freshStore();
  seedDefaultChannels(store);
  assert.equal(setCanonical(store, "dept", "百貨").ok, true);
  assert.equal(store.get("channels", "dept").canonicalId, "百貨");
  assert.equal(resolveChannel("百貨 / GlobalMall", DATA, store.list("channels")), "百貨");
});

test("a canonicalId that the published data no longer has is ignored, and can be cleared", () => {
  const { store } = freshStore();
  seedDefaultChannels(store);
  setCanonical(store, "dept", "已下架通路");
  assert.equal(resolveChannel("百貨 / GlobalMall", DATA, store.list("channels")), null);
  assert.equal(setCanonical(store, "dept", null).ok, true);
  assert.equal("canonicalId" in store.get("channels", "dept"), false);
});

test("setCanonical rejects an unknown channel and a bad value", () => {
  const { store } = freshStore();
  seedDefaultChannels(store);
  assert.equal(setCanonical(store, "nope", "餐飲").ok, false);
  assert.equal(setCanonical(store, "dept", "").ok, false);
  assert.equal(setCanonical(store, "dept", "<b>x</b>").ok, false);
});

test("editing a channel's name or aliases keeps its canonicalId", () => {
  const { store } = freshStore();
  seedDefaultChannels(store);
  setCanonical(store, "dept", "百貨");
  updateChannel(store, "dept", { aliases: ["百貨公司"] });
  assert.equal(store.get("channels", "dept").canonicalId, "百貨");
});
