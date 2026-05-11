import { apiClient } from "@/lib/apiClient";
import { offlineDb } from "@/lib/db";
import type { Bookmark } from "@/lib/types";

interface ApiBookmark {
  id: number;
  user_id: number;
  topic_title: string;
  topic_path: string;
  created_at: string | null;
}

function adapt(b: ApiBookmark): Bookmark {
  return {
    id: String(b.id),
    title: b.topic_title,
    path: b.topic_path,
    date: b.created_at
      ? new Date(b.created_at).toLocaleDateString()
      : new Date().toLocaleDateString(),
  };
}

export const bookmarkService = {
  async list(): Promise<Bookmark[]> {
    const cached = await offlineDb.getBookmarks().catch(() => undefined);
    try {
      const data = await apiClient.get<ApiBookmark[]>("/bookmarks/");
      const bookmarks = data.map(adapt);
      offlineDb.setBookmarks(bookmarks).catch(() => {});
      return bookmarks;
    } catch (err) {
      if (cached) return cached;
      throw err;
    }
  },

  async add(topicTitle: string, topicPath: string): Promise<Bookmark> {
    try {
      const data = await apiClient.post<ApiBookmark>("/bookmarks/", {
        topic_title: topicTitle,
        topic_path: topicPath,
      });
      return adapt(data);
    } catch {
      
      await offlineDb.queueAction({ type: "bookmark_add", topicTitle, topicPath });
      
      const temp: Bookmark = {
        id: `temp-${Date.now()}`,
        title: topicTitle,
        path: topicPath,
        date: new Date().toLocaleDateString(),
      };
      const current = (await offlineDb.getBookmarks()) ?? [];
      await offlineDb.setBookmarks([temp, ...current]);
      return temp;
    }
  },

  async remove(id: string): Promise<void> {
    try {
      await apiClient.delete(`/bookmarks/${id}/`);
    } catch {
      await offlineDb.queueAction({ type: "bookmark_remove", id });
      const current = (await offlineDb.getBookmarks()) ?? [];
      await offlineDb.setBookmarks(current.filter((b) => b.id !== id));
    }
  },
};
