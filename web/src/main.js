// Entry point for the public page. The page makes exactly two requests, both for its own static files next to
// index.html: validator-rules.json and reward-data.json. The deploy step must publish rules/validator-rules.json
// and the published reward data there (see tasks.md T085).

import { createStore, browserBackend } from "./storage/store.js";
import { mountImportPage } from "./ui/import-page.js";
import { mountQueryPage } from "./ui/query-page.js";
import { mountHealthPage } from "./ui/health-page.js";
import { mountChannelsPage } from "./ui/channels-page.js";
import { loadRewardData } from "./sdk/reward-data.js";
import { todayDate } from "./sdk/snapshot.js";
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
  let rewardText = null;
  try {
    const rewardResponse = await fetch("./reward-data.json");
    if (rewardResponse.ok) rewardText = await rewardResponse.text();
  } catch {
    rewardText = null;
  }
  const rewardState = loadRewardData({ text: rewardText, rules });
  mountRiskNotice(root, { store, onCleared: () => location.reload() });
  mountQueryPage(root, { store, rules, rewardState });
  mountHealthPage(root, { store, rewardState });
  mountChannelsPage(root, { store });
  mountImportPage(root, { store, rules });
}

start();
