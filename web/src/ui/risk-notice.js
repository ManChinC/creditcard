// Data storage risk notice (T033, FR-050) with one-click clear and plain-text backup export.

import { el } from "./render.js";
import { BACKUP_NOTICE, exportBackup, serializeBackup, clearAllData } from "../storage/backup.js";

export const RISK_NOTICE_LINES = Object.freeze([
  "你的資料以未加密形式保存在這個瀏覽器的儲存空間，不會上傳。",
  "使用同一個瀏覽器的人可能讀取這些資料。",
  "清除瀏覽器資料會使它們遺失，請定期匯出備份。",
]);

export function mountRiskNotice(root, { store, onCleared = () => {} }) {
  const download = () => {
    if (!globalThis.confirm(BACKUP_NOTICE)) return;
    const blob = new Blob([serializeBackup(exportBackup(store))], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = el("a", { href: url, download: "card-backup.json" });
    a.click();
    URL.revokeObjectURL(url);
  };
  const clearIt = () => {
    if (!globalThis.confirm("確定要清除這個瀏覽器中的所有資料嗎？此動作無法復原。")) return;
    clearAllData(store);
    onCleared();
  };
  root.append(
    el("section", { class: "risk-notice" }, [
      el("h2", { text: "資料保存風險" }),
      el("ul", {}, RISK_NOTICE_LINES.map((t) => el("li", { text: t }))),
      el("button", { type: "button", text: "匯出備份", onclick: download }),
      el("button", { type: "button", text: "一鍵清除", onclick: clearIt }),
    ]),
  );
}
