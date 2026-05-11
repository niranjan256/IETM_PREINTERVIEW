import { motion } from "motion/react";
import { Plus, Minus, FileText, FolderOpen } from "lucide-react";
import type { LayoutNode } from "./types";

interface TreeNodeProps {
  node: LayoutNode;
  isExpanded: boolean;
  onToggle: (id: string) => void;
  onLeafClick: (id: string) => void;
  accentColor: string;
  index: number;
}

export function TreeNode({
  node,
  isExpanded,
  onToggle,
  onLeafClick,
  accentColor,
  index,
}: TreeNodeProps) {
  const isLeaf = !node.hasChildren;

  const handleClick = () => {
    if (isLeaf) {
      onLeafClick(node.id);
    } else {
      onToggle(node.id);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.15, delay: index * 0.02 }}
      className="absolute select-none"
      style={{
        left: node.x,
        top: node.y,
        width: node.width,
        height: node.height,
      }}
    >
      <button
        onClick={handleClick}
        className="w-full h-full flex items-center gap-2 px-3 rounded-lg border transition-all duration-200 hover:brightness-125 cursor-pointer group"
        style={{
          pointerEvents: "auto",
          background: "rgba(30,41,59,0.85)",
          borderColor: "rgba(255,255,255,0.08)",
          borderLeftWidth: 3,
          borderLeftColor: accentColor,
          boxShadow: `0 0 12px ${accentColor}22, 0 2px 8px rgba(0,0,0,0.3)`,
        }}
      >
        {isLeaf ? (
          <FileText className="size-3.5 shrink-0" style={{ color: accentColor }} />
        ) : (
          <FolderOpen className="size-3.5 shrink-0" style={{ color: accentColor }} />
        )}
        <span className="flex-1 text-xs font-medium text-slate-200 truncate text-left">
          {node.title}
        </span>
        {node.hasChildren && (
          <span
            className="size-5 flex items-center justify-center rounded-full transition-colors shrink-0"
            style={{
              background: isExpanded ? `${accentColor}30` : "rgba(255,255,255,0.06)",
            }}
          >
            {isExpanded ? (
              <Minus className="size-3 text-slate-300" />
            ) : (
              <Plus className="size-3 text-slate-400" />
            )}
          </span>
        )}
      </button>
    </motion.div>
  );
}
