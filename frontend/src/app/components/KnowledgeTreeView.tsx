import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { motion } from "motion/react";
import { Plus, Minus, Locate, ArrowLeft } from "lucide-react";
import type { TocItem } from "@/lib/types";
import type { DocumentInfo } from "@/services/contentService";
import { useTreeLayout } from "./knowledge-tree/useTreeLayout";
import { TreeCanvas } from "./knowledge-tree/TreeCanvas";
import { NODE_HEIGHT, V_GAP } from "./knowledge-tree/types";

interface KnowledgeTreeViewProps {
  docId: string;
  tocItems: TocItem[];
  documents: DocumentInfo[];
  onLeafClick: (id: string) => void;
  onBack: () => void;
}

const CARD_COLORS = [
  "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899",
  "#0ea5e9", "#a855f7", "#ea580c", "#14b8a6",
];

export function KnowledgeTreeView({
  docId,
  tocItems,
  documents,
  onLeafClick,
  onBack,
}: KnowledgeTreeViewProps) {
  const docIndex = documents.findIndex((d) => d.doc_id === docId);
  const accentColor = CARD_COLORS[docIndex >= 0 ? docIndex % CARD_COLORS.length : 0];
  const displayName = docId.replace(/_/g, " ");

  const docGroup = tocItems.find((t) => t.id === `doc-${docId}`);
  
  const root: TocItem | null = useMemo(() => {
    if (!docGroup) return null;
    return {
      ...docGroup,
      id: `root-${docId}`,
      title: displayName,
      children: (docGroup.children ?? []).filter((c) => !c.id.startsWith("index-")),
    };
  }, [docGroup, docId, displayName]);

  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    return new Set(root ? [root.id] : []);
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const [transform, setTransform] = useState({ x: 80, y: 0, scale: 1 });
  const hasCentered = useRef(false);

  useEffect(() => {
    if (hasCentered.current || !containerRef.current || !root) return;
    hasCentered.current = true;
    const h = containerRef.current.clientHeight;
    const childCount = (root.children ?? []).length;
    const treeHeight = childCount * (NODE_HEIGHT + V_GAP);
    setTransform((t) => ({ ...t, y: Math.max(40, (h - treeHeight) / 2) }));
  }, [root]);

  const nodes = useTreeLayout(root, expandedNodes);

  const handleToggle = useCallback((id: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleZoomIn = () =>
    setTransform((t) => ({ ...t, scale: Math.min(t.scale + 0.2, 2.5) }));
  const handleZoomOut = () =>
    setTransform((t) => ({ ...t, scale: Math.max(t.scale - 0.2, 0.3) }));
  const handleRecenter = () => {
    if (!containerRef.current) return;
    const h = containerRef.current.clientHeight;
    const childCount = (root?.children ?? []).length;
    const treeHeight = childCount * (NODE_HEIGHT + V_GAP);
    setTransform({ x: 80, y: Math.max(40, (h - treeHeight) / 2), scale: 1 });
  };

  return (
    <motion.div
      ref={containerRef}
      className="flex-1 relative overflow-hidden"
      style={{
        background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 40%, #0f172a 100%)",
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {}
      <button
        onClick={onBack}
        className="absolute top-4 left-4 z-20 flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-200 hover:brightness-125"
        style={{
          background: "rgba(30,41,59,0.8)",
          borderColor: "rgba(255,255,255,0.1)",
          backdropFilter: "blur(12px)",
        }}
      >
        <ArrowLeft className="size-4 text-slate-300" />
        <span className="text-sm text-slate-300">Back</span>
      </button>

      {}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20">
        <h2
          className="text-lg font-semibold tracking-tight"
          style={{ color: accentColor }}
        >
          {displayName}
        </h2>
      </div>

      {}
      <TreeCanvas
        nodes={nodes}
        expandedNodes={expandedNodes}
        onToggle={handleToggle}
        onLeafClick={onLeafClick}
        accentColor={accentColor}
        transform={transform}
        onTransformChange={setTransform}
      />

      {}
      <div
        className="absolute bottom-6 right-6 z-20 flex flex-col gap-2"
      >
        {[
          { icon: Plus, onClick: handleZoomIn, label: "Zoom in" },
          { icon: Minus, onClick: handleZoomOut, label: "Zoom out" },
          { icon: Locate, onClick: handleRecenter, label: "Re-center" },
        ].map(({ icon: Icon, onClick, label }) => (
          <button
            key={label}
            onClick={onClick}
            title={label}
            className="size-10 flex items-center justify-center rounded-lg border transition-all duration-200 hover:brightness-125"
            style={{
              background: "rgba(30,41,59,0.85)",
              borderColor: "rgba(255,255,255,0.1)",
              backdropFilter: "blur(12px)",
              boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
            }}
          >
            <Icon className="size-4 text-slate-300" />
          </button>
        ))}
      </div>
    </motion.div>
  );
}
