// Entry point for the public page. The rules file is fetched from the same place as the page; the build/deploy
// step must publish rules/validator-rules.json next to index.html (see tasks.md T085).

import { createStore, browserBackend } from "./storage/store.js";
import { mountImportPage } from "./ui/import-page.js";
import { mountRiskNotice } from "./ui/risk-notice.js";
import { el } from "./ui/render.js";

async function start() {
  const root = document.getElementById("app");
  const backend = browserBackend();
  if (!backend) {
    root.append(el("p", { text: "這個瀏覽器目前無法使用內建儲存空間（可能是隱私模式或已封鎖網站資料）。資料無法保存。" }));
    return;
  }
  const response = await fetch("./validator-rules.json");
  if (!response.ok) {
    root.append(el("p", { text: "無法載入驗證規則，為了安全不會繼續。" }));
    return;
  }
  const rules = await response.json();
  const store = createStore({ backend, rules });
  mountRiskNotice(root, { store, onCleared: () => location.reload() });
  mountImportPage(root, { store, rules });
}

start();
