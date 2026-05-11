import { useMemo } from "react";
import type { TocItem } from "@/lib/types";
import { NODE_WIDTH, NODE_HEIGHT, H_GAP, V_GAP, type LayoutNode } from "./types";

export function useTreeLayout(
  root: TocItem | null,
  expandedNodes: Set<string>,
): Map<string, LayoutNode> {
  return useMemo(() => {
    if (!root) return new Map();

    const nodes = new Map<string, LayoutNode>();
    let nextY = 0;

    function layout(item: TocItem, depth: number, parentId: string | null): LayoutNode {
      const x = depth * (NODE_WIDTH + H_GAP);
      const isExpanded = expandedNodes.has(item.id);
      const visibleChildren = isExpanded
        ? (item.children ?? []).filter((c) => !c.id.startsWith("index-"))
        : [];

      if (visibleChildren.length === 0) {
        const y = nextY;
        nextY += NODE_HEIGHT + V_GAP;
        const node: LayoutNode = {
          id: item.id,
          title: item.title,
          nodeType: item.nodeType,
          x,
          y,
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
          depth,
          parentId,
          hasChildren: (item.children ?? []).filter((c) => !c.id.startsWith("index-")).length > 0,
          childIds: [],
        };
        nodes.set(item.id, node);
        return node;
      }

      const childLayouts = visibleChildren.map((c) => layout(c, depth + 1, item.id));
      const firstY = childLayouts[0].y;
      const lastY = childLayouts[childLayouts.length - 1].y;
      const y = (firstY + lastY) / 2;

      const node: LayoutNode = {
        id: item.id,
        title: item.title,
        nodeType: item.nodeType,
        x,
        y,
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        depth,
        parentId,
        hasChildren: true,
        childIds: childLayouts.map((c) => c.id),
      };
      nodes.set(item.id, node);
      return node;
    }

    layout(root, 0, null);
    return nodes;
  }, [root, expandedNodes]);
}
