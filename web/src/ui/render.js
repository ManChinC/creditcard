// Safe rendering helpers (T033, FR-018). Everything the user pasted or typed is shown as text, never as markup:
// only textContent is used, and no file under web/src may use the DOM properties or functions that parse markup.
// A test (web/tests/ui-safety.test.js) scans the sources for the forbidden names, comments included.

// el("p", {class: "note"}, ["text", childElement]) - strings become text nodes.
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "text") node.textContent = String(v);
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, "");
    else if (v !== false && v !== undefined && v !== null) node.setAttribute(k, String(v));
  }
  for (const child of [].concat(children)) {
    node.append(typeof child === "string" ? document.createTextNode(child) : child);
  }
  return node;
}

export function clear(node) {
  node.replaceChildren();
}

export function table(headers, rows) {
  return el("table", {}, [
    el("thead", {}, [el("tr", {}, headers.map((h) => el("th", { text: h })))]),
    el("tbody", {}, rows.map((r) => el("tr", {}, r.map((cell) => el("td", { text: cell ?? "未知" }))))),
  ]);
}

export function formatMoney(n) {
  return n === null || n === undefined ? "未知" : `NT$ ${Number(n).toLocaleString("zh-TW")}`;
}

// Basis points -> percent text with at most two decimals: 350 -> "3.5%", 300 -> "3%", 333 -> "3.33%".
export function formatRate(bp) {
  if (!Number.isSafeInteger(bp) || bp < 0) return "未知";
  const whole = Math.trunc(bp / 100);
  const fraction = String(bp % 100).padStart(2, "0").replace(/0+$/, "");
  return `${whole}${fraction === "" ? "" : `.${fraction}`}%`;
}
