// The 11 default consumption channels from the spec (User Story 1 table, FR-031).
// Ids are internal identifiers; names follow the spec table without the emoji prefixes.

export const CATCHALL_CHANNEL_ID = "catchall";

export const DEFAULT_CHANNELS = Object.freeze(
  [
    ["dept", "百貨 / GlobalMall"],
    ["dining", "餐飲（含連加 LinePay）"],
    ["travel-booking", "旅遊訂房 / 機票"],
    ["overseas-offline", "日本 / 國外實體"],
    ["fuel", "加油"],
    ["overseas-subs", "海外訂閱（Claude / YT / Apple）"],
    ["drinks", "飲料咖啡（連加支付）"],
    ["ride", "叫車 / 交通"],
    ["gov-fees", "政府繳費 / 稅款"],
    ["easycard", "悠遊卡自動儲值"],
    [CATCHALL_CHANNEL_ID, "無腦刷"],
  ].map(([id, name]) => Object.freeze({ id, name, aliases: Object.freeze([]), origin: "default" })),
);
