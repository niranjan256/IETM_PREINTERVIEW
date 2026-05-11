import { apiClient } from "@/lib/apiClient";
import { offlineDb } from "@/lib/db";
import type { TocItem, TopicContent, SearchResult, ChapterIndex } from "@/lib/types";

export interface DocumentInfo {
  doc_id: string;
  title: string;
  doc_type: string;
  classification: string;
}

export interface PrepagesInfo {
  url: string;
  title: string;
  filename: string;
}

export interface AbbreviationEntry {
  abbr: string;
  full: string;
}

export interface AbbreviationsPayload {
  title: string;
  rows: AbbreviationEntry[];
}

interface FlatTocItem {
  id: number;
  parentId: number | null;
  title: string;
  nodeType: string;
  level: number;
  order: number;
  path: string;
  hasContent?: boolean;
}

function buildTree(flat: FlatTocItem[]): TocItem[] {
  const map = new Map<string, TocItem>();
  const roots: TocItem[] = [];

  for (const item of flat) {
    map.set(String(item.id), {
      id: String(item.id),
      parentId: item.parentId !== null ? String(item.parentId) : null,
      title: item.title,
      nodeType: item.nodeType as TocItem["nodeType"],
      level: item.level,
      order: item.order,
      path: item.path,
      hasContent: item.hasContent ?? true,
      children: [],
    });
  }

  for (const item of map.values()) {
    if (item.parentId && map.has(item.parentId)) {
      map.get(item.parentId)!.children!.push(item);
    } else {
      roots.push(item);
    }
  }

  return roots;
}

export const contentService = {
  async getDocuments(): Promise<DocumentInfo[]> {
    return apiClient.get<DocumentInfo[]>("/content/documents/");
  },

  async getToc(docId: string): Promise<TocItem[]> {
    const cached = await offlineDb.getToc(docId).catch(() => undefined);
    try {
      const flat = await apiClient.get<FlatTocItem[]>(`/content/tree/${docId}/`);
      const tree = buildTree(flat);
      offlineDb.setToc(docId, tree).catch(() => {});
      return tree;
    } catch (err) {
      if (cached) return cached;
      throw err;
    }
  },

  async getTopic(pk: number): Promise<TopicContent> {
    const cached = await offlineDb.getTopic(pk).catch(() => undefined);
    try {
      const fresh = await apiClient.get<TopicContent>(`/content/topic/${pk}/`);
      offlineDb.setTopic(pk, fresh).catch(() => {});
      return fresh;
    } catch (err) {
      if (cached) return cached;
      throw err;
    }
  },

  async resolveXref(xmlId: string): Promise<{ nodeId: number; title: string }> {
    const cached = await offlineDb.getXref(xmlId).catch(() => undefined);
    try {
      const result = await apiClient.get<{ nodeId: number; title: string }>(
        `/content/resolve-xref/?xml_id=${encodeURIComponent(xmlId)}`
      );
      offlineDb.setXref(xmlId, result).catch(() => {});
      return result;
    } catch (err) {
      if (cached) return cached;
      throw err;
    }
  },

  async search(query: string, mode: string = "text"): Promise<SearchResult[]> {
    
    return apiClient.get<SearchResult[]>(
      `/content/search/?q=${encodeURIComponent(query)}&mode=${mode}`
    );
  },

  async getDocumentIndex(docId: string): Promise<ChapterIndex> {
    return apiClient.get<ChapterIndex>(`/content/document-index/${docId}/`);
  },

  async getPrepages(): Promise<PrepagesInfo | null> {
    try {
      return await apiClient.get<PrepagesInfo>("/content/prepages/");
    } catch {
      return null;
    }
  },

  async getAbbreviations(): Promise<AbbreviationsPayload | null> {
    try {
      return await apiClient.get<AbbreviationsPayload>("/content/abbreviations/");
    } catch {
      return null;
    }
  },
};
