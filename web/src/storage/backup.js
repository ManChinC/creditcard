// Backup export, one-click clear and full delete (T031, FR-017, FR-050).
// The backup file is plain text and holds only non-sensitive data (AD-003). Restoring a backup is not part of
// the current task list.

import { COLLECTIONS } from "../sdk/models.js";

export const BACKUP_VERSION = 1;

// Shown before every export (FR-050).
export const BACKUP_NOTICE = "備份檔以明文保存，任何拿到檔案的人都能讀取其中內容。請自行妥善保管。";

export function exportBackup(store, now = new Date()) {
  const collections = {};
  for (const name of Object.keys(COLLECTIONS)) collections[name] = store.list(name);
  return { backupVersion: BACKUP_VERSION, plaintext: true, exportedAt: now.toISOString(), collections };
}

export function serializeBackup(backup) {
  return JSON.stringify(backup, null, 2);
}

// In public mode all data lives in this browser, so clearing it and deleting everything are the same action.
export function clearAllData(store) {
  return store.clearAll();
}
export const deleteAllData = clearAllData;
