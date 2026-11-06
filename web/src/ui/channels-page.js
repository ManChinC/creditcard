// Channel list screen (FR-031, decision 2026-11-06): add and remove aliases, add or remove custom channels, and see
// or clear the published channel a channel was confirmed to be. Names are changed through the SDK, which asks the
// Validator; this file only reads inputs and shows results as text. Checked statically by web/tests/ui-safety.test.js.

import { el, clear } from "./render.js";
import { addChannel, removeChannel, seedDefaultChannels, setCanonical, updateChannel } from "../sdk/channels.js";
import { CATCHALL_CHANNEL_ID } from "../sdk/default-channels.js";

const MESSAGES = Object.freeze({
  DUPLICATE_NAME: "名稱或別名與其他通路重複。",
  CATCHALL_PROTECTED: "「無腦刷」不能刪除。",
});

export function mountChannelsPage(root, { store, onChange = () => {} }) {
  const section = el("section", { class: "channels" }, [el("h2", { text: "我的消費通路與別名" })]);
  const list = el("div", { class: "channels-list" });
  const note = el("p", { class: "channels-note" });
  root.append(section);

  function apply(result) {
    note.textContent = result.ok ? "" : MESSAGES[result.failures?.[0]?.code] ?? `無法儲存（${result.failures?.[0]?.code ?? "未知"}）`;
    render();
    if (result.ok) onChange();
  }

  function render() {
    clear(list);
    for (const c of seedDefaultChannels(store)) {
      const alias = el("input", { type: "text", placeholder: "新增別名" });
      const items = c.aliases.map((a) => el("li", {}, [
        el("span", { text: a }),
        el("button", { type: "button", text: "移除", onclick: () => apply(updateChannel(store, c.id, { aliases: c.aliases.filter((x) => x !== a) })) }),
      ]));
      const parts = [
        el("strong", { text: c.name }),
        c.canonicalId !== undefined ? el("span", { text: `（對應公開資料的「${c.canonicalId}」）` }) : el("span"),
        c.canonicalId !== undefined ? el("button", { type: "button", text: "取消對應", onclick: () => apply(setCanonical(store, c.id, null)) }) : el("span"),
        el("ul", {}, items),
        alias,
        el("button", { type: "button", text: "加入別名", onclick: () => {
          const text = alias.value.trim();
          if (text !== "") apply(updateChannel(store, c.id, { aliases: [...c.aliases, text] }));
        } }),
      ];
      if (c.origin === "custom" && c.id !== CATCHALL_CHANNEL_ID) {
        parts.push(el("button", { type: "button", text: "刪除這個通路", onclick: () => apply(removeChannel(store, c.id)) }));
      }
      list.append(el("div", { class: "channel" }, parts));
    }
  }

  const newName = el("input", { type: "text", placeholder: "新通路名稱" });
  section.append(
    el("p", { text: "別名用來把你的說法對應到公開回饋資料的通路名稱；名稱太長或帶括號時，系統也會先去掉括號再比對。" }),
    note, list, newName,
    el("button", { type: "button", text: "新增通路", onclick: () => {
      const text = newName.value.trim();
      if (text === "") return;
      const result = addChannel(store, { name: text });
      if (result.ok) newName.value = "";
      apply(result);
    } }),
  );
  render();
}
