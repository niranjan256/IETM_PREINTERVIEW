import type { TocItem } from "@/lib/types";

export const NODE_WIDTH = 220;
export const NODE_HEIGHT = 48;
export const H_GAP = 100;
export const V_GAP = 16;

export interface LayoutNode {
  id: string;
  title: string;
  nodeType: TocItem["nodeType"];
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  parentId: string | null;
  hasChildren: boolean;
  childIds: string[];
}
