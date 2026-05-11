import { motion } from "motion/react";
import type { LayoutNode } from "./types";

interface TreeConnectorsProps {
  nodes: Map<string, LayoutNode>;
  accentColor: string;
}

export function TreeConnectors({ nodes, accentColor }: TreeConnectorsProps) {
  const connections: { key: string; d: string }[] = [];

  for (const [, node] of nodes) {
    for (const childId of node.childIds) {
      const child = nodes.get(childId);
      if (!child) continue;

      const x1 = node.x + node.width;
      const y1 = node.y + node.height / 2;
      const x2 = child.x;
      const y2 = child.y + child.height / 2;
      const midX = (x1 + x2) / 2;

      connections.push({
        key: `${node.id}-${childId}`,
        d: `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`,
      });
    }
  }

  let maxX = 0;
  let maxY = 0;
  for (const [, node] of nodes) {
    maxX = Math.max(maxX, node.x + node.width + 100);
    maxY = Math.max(maxY, node.y + node.height + 100);
  }

  return (
    <svg
      className="absolute top-0 left-0 pointer-events-none"
      width={maxX}
      height={maxY}
      style={{ overflow: "visible" }}
    >
      <defs>
        <filter id="connector-glow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {connections.map((conn) => (
        <motion.path
          key={conn.key}
          d={conn.d}
          fill="none"
          stroke={accentColor}
          strokeWidth={1.5}
          strokeOpacity={0.5}
          filter="url(#connector-glow)"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
        />
      ))}
    </svg>
  );
}
