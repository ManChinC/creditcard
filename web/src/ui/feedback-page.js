// Channel-match failure report (decision 2026-11-06, T092 option "local queue + user export"). Shows what is in the
// local queue and the plain-text report. Nothing is sent: the user selects the text and copies it themselves
// (the clipboard API is not used on purpose; web/tests/ui-safety.test.js forbids it). Checked statically there.

import { el, clear } from "./render.js";
import { buildReport, clearFeedback, listFeedback } from "../sdk/feedback.js";

export function mountFeedbackPage(root, { store, rewardState }) {
  const section = el("section", { class: "feedback" }, [
    el("h2", { text: "找不到的通路回報" }),
    el("p", { text: "查詢或健檢時找不到的通路名稱，只會記在這個瀏覽器裡，不會自動傳給任何人。你可以檢視內容，自己決定要不要複製後傳給管理者，或直接清除。" }),
  ]);
  const body = el("div", { class: "feedback-body" });
  section.append(body);
  root.append(section);

  function render() {
    clear(body);
    const items = listFeedback(store);
    if (items.length === 0) {
      body.append(el("p", { text: "目前沒有記錄。" }));
      return;
    }
    const lastVerifiedAt = rewardState?.status === "ok" ? rewardState.lastVerifiedAt : null;
    const area = el("textarea", { rows: 8, cols: 50, readonly: true });
    area.value = buildReport(store, { lastVerifiedAt });
    body.append(
      el("p", { text: `共 ${items.length} 筆。以下文字只含你輸入的通路名稱與日期。` }),
      area,
      el("button", { type: "button", text: "全選文字（再按 Ctrl+C 複製）", onclick: () => area.select() }),
      el("button", { type: "button", text: "清除全部記錄", onclick: () => { clearFeedback(store); render(); } }),
    );
  }

  render();
  return { refresh: render };
}
