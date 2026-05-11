import { offlineDb } from "./db";
import { bookmarkService } from "@/services/bookmarkService";
import { notesService } from "@/services/notesService";

let isSyncing = false;

export async function drainSyncQueue(): Promise<void> {
  if (isSyncing) return;
  isSyncing = true;
  try {
    const pending = await offlineDb.getPendingActions();
    for (const entry of pending) {
      try {
        const { action } = entry;
        switch (action.type) {
          case "bookmark_add":
            await bookmarkService.add(action.topicTitle, action.topicPath);
            break;
          case "bookmark_remove":
            await bookmarkService.remove(action.id);
            break;
          case "note_save":
            await notesService.save(action.topicId, action.content, action.topicTitle);
            break;
          case "note_remove":
            await notesService.remove(action.topicId);
            break;
        }
        await offlineDb.removePendingAction(entry.id!);
      } catch {
        
      }
    }
  } finally {
    isSyncing = false;
  }
}

export function registerSyncListeners(): void {
  window.addEventListener("online", drainSyncQueue);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") drainSyncQueue();
  });
}
