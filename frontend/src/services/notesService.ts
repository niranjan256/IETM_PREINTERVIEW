import { apiClient } from "@/lib/apiClient";
import { offlineDb } from "@/lib/db";
import type { Note } from "@/lib/types";

interface ApiNote {
  topic_id: string;
  topic_title?: string;
  user_id: number;
  content: string;
  updated_at: string;
}

function adapt(n: ApiNote): Note {
  return {
    id: n.topic_id,
    content: n.content,
    date: new Date(n.updated_at).toLocaleDateString(),
    topic: n.topic_title || n.topic_id,
    topicPath: n.topic_id,
  };
}

export const notesService = {
  async list(): Promise<Note[]> {
    const cached = await offlineDb.getAllNotes().catch(() => []);
    try {
      const data = await apiClient.get<ApiNote[]>("/topic-notes/");
      const notes = data.map(adapt);
      
      for (const note of notes) {
        offlineDb.setNote(note).catch(() => {});
      }
      return notes;
    } catch (err) {
      if (cached.length > 0) return cached;
      throw err;
    }
  },

  async get(topicId: string): Promise<Note | null> {
    const cached = await offlineDb.getNote(topicId).catch(() => undefined);
    try {
      const data = await apiClient.get<ApiNote>(`/topic-notes/${topicId}/`);
      const note = adapt(data);
      offlineDb.setNote(note).catch(() => {});
      return note;
    } catch {
      return cached ?? null;
    }
  },

  async save(topicId: string, content: string, topicTitle?: string): Promise<Note> {
    const optimistic: Note = {
      id: topicId,
      content,
      date: new Date().toLocaleDateString(),
      topic: topicTitle || topicId,
      topicPath: topicId,
    };
    try {
      const data = await apiClient.post<ApiNote>("/topic-notes/", { topicId, content });
      const note = adapt(data);
      offlineDb.setNote(note).catch(() => {});
      return note;
    } catch {
      await offlineDb.queueAction({ type: "note_save", topicId, content, topicTitle });
      await offlineDb.setNote(optimistic);
      return optimistic;
    }
  },

  async remove(topicId: string): Promise<void> {
    await offlineDb.deleteNote(topicId).catch(() => {});
    try {
      await apiClient.delete(`/topic-notes/${topicId}/`);
    } catch {
      await offlineDb.queueAction({ type: "note_remove", topicId });
    }
  },
};
