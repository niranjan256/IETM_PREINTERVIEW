
export interface AuthUser {
  id: number;
  username: string;
  role: "admin" | "viewer";
  department: string | null;
}

export interface TocItem {
  id: string; 
  parentId: string | null;
  title: string;
  nodeType: "section" | "leaf_group" | "leaf";
  level: number;
  order: number;
  path: string;
  hasContent?: boolean; 
  children?: TocItem[]; 
  isDocGroup?: boolean; 
}

export interface ContentBlock {
  blockType: string;
  contentHtml: string;
  
  blockId?: number | null;
  
  xmlId?: string;
  
  media?: MediaItem | null;
  
  leafXmlId?: string;
}

export interface Hotspot {
  x: number;       
  y: number;       
  width: number;   
  height: number;  
  label: string;
  targetNodeId: number | null;
  targetXmlId: string;
}

export interface MeshHotspot {
  meshName: string;
  targetNodeId?: number | null;
  targetXmlId?: string;
  text: string;
}

export interface MediaItem {
  id: number;
  type: "image" | "video" | "audio" | "document" | "model3d" | "pdf";
  url: string;
  title: string;
  xmlId?: string;
  hotspots?: Hotspot[];
  meshHotspots?: MeshHotspot[];
}

export interface BreadcrumbItem {
  id: number;
  title: string;
}

export interface TopicContent {
  node: {
    id: number;
    title: string;
    number?: string;
    nodeType: string;
    path: string;
  };
  doc_pk: number;
  blocks: ContentBlock[];
  breadcrumbs: BreadcrumbItem[];
  prevNode: { id: number; title: string } | null;
  nextNode: { id: number; title: string } | null;
  pageInfo?: { current: number; total: number };
}

export interface SearchResult {
  nodeId: number;
  nodeTitle: string;
  snippet: string;
  anchorId?: string;
}

export interface ChapterIndexFigure {
  xmlId: string;
  number: string;
  title: string;
  nodeId: number;
  nodeTitle?: string;
}

export interface ChapterIndexTable {
  xmlId: string;
  number: string;
  title: string;
  nodeId: number;
  nodeTitle?: string;
}

export interface ChapterIndex {
  figures: ChapterIndexFigure[];
  tables: ChapterIndexTable[];
}

export interface Bookmark {
  id: string;
  title: string;
  path: string;
  date: string;
}

export interface Note {
  id: string;
  content: string;
  date: string;
  topic: string;
  topicPath: string;
}

export interface AdminUser {
  id: number;
  username: string;
  role: "admin" | "viewer";
  department: string | null;
  is_active: boolean;
}

export interface Group {
  id: number;
  name: string;
  description?: string;
}
