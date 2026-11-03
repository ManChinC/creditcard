// Import and smart-question screens (T032). Not yet checked in a real browser: the logic it calls is covered
// by web/tests; this file only wires inputs to those functions and renders results as text.

import { el, clear, table, formatMoney } from "./render.js";
import { buildPrompt, PROMPT_NOTICE } from "./prompt.js";
import { previewPaste, confirmImport } from "../sdk/import.js";
import { seedDefaultChannels } from "../sdk/channels.js";
import { createSmartSession, commitSmartSession } from "../sdk/smart-questions.js";
import { loadSettings } from "../sdk/settings.js";
import { ISSUERS } from "../sdk/models.js";

export function mountImportPage(root, { store, rules }) {
  const channels = () => seedDefaultChannels(store);
  const settings = () => loadSettings(store);
  const out = el("div", { class: "out" });

  const promptBox = el("textarea", { readonly: true, rows: 12, cols: 80 });
  promptBox.value = buildPrompt({ largeItemThreshold: settings().largeItemThreshold, channelNames: channels().map((c) => c.name) });
  const pasteBox = el("textarea", { rows: 12, cols: 80, placeholder: "把 LLM 回傳的 JSON 貼在這裡" });

  function showFailures(failures) {
    clear(out);
    out.append(el("h3", { text: "無法使用這份內容" }), el("ul", {}, failures.map((f) => el("li", { text: `${f.code}${f.path ? `（${f.path}）` : ""}` }))));
  }

  function showPreview(preview) {
    clear(out);
    const names = new Map(channels().map((c) => [c.id, c.name]));
    out.append(el("h3", { text: "預覽（確認前不會儲存）" }));
    if (preview.warnings.includes("PERIOD_SHORT")) {
      out.append(el("p", { text: `涵蓋期間只有 ${preview.months} 個月，少於建議的三個月；仍可繼續。` }));
    }
    out.append(
      table(
        ["通路", "涵蓋期間總額", "月均", "歸入", "主要使用的卡"],
        preview.entries.map((e) => [e.name, formatMoney(e.total), formatMoney(e.monthlyAverage), names.get(e.channelId) + (e.recognised ? "" : "（未辨識，歸入兜底通路）"), e.mainCard]),
      ),
    );
    const confirm = (onOverlap) => {
      const result = confirmImport({ store, preview, onOverlap });
      if (result.needsDecision) return askOverlap(preview);
      if (result.cancelled) return clear(out);
      if (!result.ok) return showFailures(result.failures);
      clear(out);
      out.append(el("p", { text: "已儲存。" }));
    };
    out.append(el("button", { type: "button", text: "確認並儲存", onclick: () => confirm() }));
  }

  function askOverlap(preview) {
    const again = (choice) => confirmImport({ store, preview, onOverlap: choice });
    out.append(
      el("p", { text: "這段期間與已儲存的彙整表重疊。請選擇處理方式：" }),
      el("button", { type: "button", text: "取代既有", onclick: () => finish(again("replace")) }),
      el("button", { type: "button", text: "另存為新的", onclick: () => finish(again("new")) }),
      el("button", { type: "button", text: "取消", onclick: () => clear(out) }),
    );
    function finish(result) {
      clear(out);
      out.append(el("p", { text: result.ok ? "已儲存。" : "未儲存。" }));
    }
  }

  const previewButton = el("button", {
    type: "button",
    text: "預覽",
    onclick: () => {
      const result = previewPaste(pasteBox.value, { rules, settings: settings(), channels: channels(), snapshots: store.list("snapshots") });
      if (!result.ok) return showFailures(result.failures);
      showPreview(result);
    },
  });

  function startSmartQuestions() {
    clear(out);
    const session = createSmartSession({ channels: channels() });
    const issuer = el("select", {}, ISSUERS.map((i) => el("option", { value: i, text: i })));
    const cardName = el("input", { type: "text", placeholder: "卡名" });
    const held = [];
    const heldList = el("ul");
    const next = () => {
      clear(out);
      const q = session.current();
      if (q.step === "done") {
        const r = commitSmartSession(store, session);
        return out.append(el("p", { text: r.ok ? "已儲存。" : "無法儲存。" }));
      }
      const amount = el("input", { type: "number", min: 0, step: 1, placeholder: "每月約略金額（不知道可留白）" });
      const pick = el("select", {}, [el("option", { value: "", text: "不知道" }), ...q.cards.map((c) => el("option", { value: c.id, text: c.name }))]);
      out.append(
        el("h3", { text: q.channel.name }),
        pick,
        amount,
        el("button", { type: "button", text: "下一題", onclick: () => {
          session.answerChannel({ cardId: pick.value || undefined, approxMonthly: amount.value === "" ? undefined : Number(amount.value) });
          next();
        } }),
        el("button", { type: "button", text: "略過", onclick: () => { session.skip(); next(); } }),
      );
    };
    out.append(
      el("h3", { text: "你持有哪些卡？" }),
      issuer,
      cardName,
      el("button", { type: "button", text: "加入", onclick: () => {
        if (cardName.value.trim() === "") return;
        held.push({ issuer: issuer.value, name: cardName.value.trim() });
        heldList.append(el("li", { text: `${issuer.value} ${cardName.value.trim()}` }));
        cardName.value = "";
      } }),
      heldList,
      el("button", { type: "button", text: "開始", onclick: () => { session.answerCards(held); next(); } }),
    );
  }

  root.append(
    el("h2", { text: "建立你的通路 × 卡對照表" }),
    el("p", { text: "1. 複製下面的 prompt，連同你自己的消費紀錄交給你選擇的 LLM。" }),
    el("p", { text: PROMPT_NOTICE }),
    promptBox,
    el("p", { text: "2. 把 LLM 回傳的 JSON 貼在這裡。" }),
    pasteBox,
    previewButton,
    el("button", { type: "button", text: "改用智慧提問", onclick: startSmartQuestions }),
    out,
  );
}
