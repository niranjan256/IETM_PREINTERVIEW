import { openDB, type IDBPDatabase } from "idb";
import type { TocItem, TopicContent, Bookmark, Note } from "./types";

interface IETMSchema {
  toc: {
    key: string; 
    value: TocItem[];
  };
  topics: {
    key: number; 
    value: TopicContent;
  };
  bookmarks: {
    key: "list";
    value: Bookmark[];
  };
  notes: {
    key: string; 
    value: Note;
  };
  pendingSync: {
    key: number; 
    value: PendingSyncEntry;
  };
  xrefCache: {
    key: string; 
    value: { nodeId: number; title: string };
  };
}

export type PendingSyncAction =
  | { type: "bookmark_add"; topicTitle: string; topicPath: string }
  | { type: "bookmark_remove"; id: string }
  | { type: "note_save"; topicId: string; content: string; topicTitle?: string }
  | { type: "note_remove"; topicId: string };

export interface PendingSyncEntry {
  id?: number;
  action: PendingSyncAction;
  createdAt: number;
}

let _db: IDBPDatabase<IETMSchema> | null = null;

async function getDb(): Promise<IDBPDatabase<IETMSchema>> {
  if (_db) return _db;
  _db = await openDB<IETMSchema>("ietm-offline", 2, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore("toc");
        db.createObjectStore("topics");
        db.createObjectStore("bookmarks");
        db.createObjectStore("notes");
        db.createObjectStore("pendingSync", { keyPath: "id", autoIncrement: true });
      }
      if (oldVersion < 2) {
        db.createObjectStore("xrefCache");
      }
    },
  });
  return _db;
}

export const offlineDb = {
  
  async getToc(docId: string): Promise<TocItem[] | undefined> {
    return (await getDb()).get("toc", docId);
  },
  async setToc(docId: string, items: TocItem[]): Promise<void> {
    await (await getDb()).put("toc", items, docId);
  },

  async getTopic(pk: number): Promise<TopicContent | undefined> {
    return (await getDb()).get("topics", pk);
  },
  async setTopic(pk: number, topic: TopicContent): Promise<void> {
    await (await getDb()).put("topics", topic, pk);
  },

  async getBookmarks(): Promise<Bookmark[] | undefined> {
    return (await getDb()).get("bookmarks", "list");
  },
  async setBookmarks(bookmarks: Bookmark[]): Promise<void> {
    await (await getDb()).put("bookmarks", bookmarks, "list");
  },

  async getNote(topicId: string): Promise<Note | undefined> {
    return (await getDb()).get("notes", topicId);
  },
  async setNote(note: Note): Promise<void> {
    await (await getDb()).put("notes", note, note.id);
  },
  async deleteNote(topicId: string): Promise<void> {
    await (await getDb()).delete("notes", topicId);
  },
  async getAllNotes(): Promise<Note[]> {
    return (await getDb()).getAll("notes");
  },

  async getXref(xmlId: string): Promise<{ nodeId: number; title: string } | undefined> {
    return (await getDb()).get("xrefCache", xmlId);
  },
  async setXref(xmlId: string, result: { nodeId: number; title: string }): Promise<void> {
    await (await getDb()).put("xrefCache", result, xmlId);
  },

  async queueAction(action: PendingSyncAction): Promise<void> {
    await (await getDb()).add("pendingSync", { action, createdAt: Date.now() });
  },
  async getPendingActions(): Promise<PendingSyncEntry[]> {
    return (await getDb()).getAll("pendingSync");
  },
  async removePendingAction(id: number): Promise<void> {
    await (await getDb()).delete("pendingSync", id);
  },
};
