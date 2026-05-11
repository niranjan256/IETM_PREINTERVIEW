import { useRef, useState, useCallback, type MouseEvent } from "react";
import type { LayoutNode } from "./types";
import { TreeNode } from "./TreeNode";
import { TreeConnectors } from "./TreeConnectors";

interface TreeCanvasProps {
  nodes: Map<string, LayoutNode>;
  expandedNodes: Set<string>;
  onToggle: (id: string) => void;
  onLeafClick: (id: string) => void;
  accentColor: string;
  transform: { x: number; y: number; scale: number };
  onTransformChange: (t: { x: number; y: number; scale: number }) => void;
}

export function TreeCanvas({
  nodes,
  expandedNodes,
  onToggle,
  onLeafClick,
  accentColor,
  transform,
  onTransformChange,
}: TreeCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

  const handleMouseDown = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      
      if ((e.target as HTMLElement).closest("button")) return;
      e.preventDefault();
      setIsPanning(true);
      panStart.current = {
        x: e.clientX,
        y: e.clientY,
        tx: transform.x,
        ty: transform.y,
      };
    },
    [transform.x, transform.y],
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      if (!isPanning) return;
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      onTransformChange({
        ...transform,
        x: panStart.current.tx + dx,
        y: panStart.current.ty + dy,
      });
    },
    [isPanning, transform, onTransformChange],
  );

  const handleMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (e.ctrlKey) {
        
        const delta = e.deltaY > 0 ? -0.1 : 0.1;
        onTransformChange({
          ...transform,
          scale: Math.min(2.5, Math.max(0.3, transform.scale + delta)),
        });
      } else {
        
        onTransformChange({
          ...transform,
          x: transform.x - e.deltaX,
          y: transform.y - e.deltaY,
        });
      }
    },
    [transform, onTransformChange],
  );

  const sortedNodes = Array.from(nodes.values()).sort((a, b) => a.depth - b.depth || a.y - b.y);

  return (
    <div
      ref={containerRef}
      className="w-full h-full overflow-hidden relative"
      style={{ cursor: isPanning ? "grabbing" : "grab" }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      <div
        style={{
          transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
          transformOrigin: "0 0",
          position: "relative",
          pointerEvents: "none",
        }}
      >
        <TreeConnectors nodes={nodes} accentColor={accentColor} />
        {sortedNodes.map((node, i) => (
          <TreeNode
            key={node.id}
            node={node}
            isExpanded={expandedNodes.has(node.id)}
            onToggle={onToggle}
            onLeafClick={onLeafClick}
            accentColor={accentColor}
            index={i}
          />
        ))}
      </div>
    </div>
  );
}
