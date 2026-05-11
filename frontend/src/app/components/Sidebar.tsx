import { useState, useEffect, useMemo } from "react";
import { ChevronDown, ChevronRight, BookOpen } from "lucide-react";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import type { TocItem } from "@/lib/types";

interface SidebarProps {
  isOpen: boolean;
  tocItems: TocItem[];
  onItemClick: (id: string) => void;
  activeItemId?: string;
}

function findAncestorIds(items: TocItem[], targetId: string): Set<string> {
  const result = new Set<string>();
  function walk(nodes: TocItem[], ancestors: string[]): boolean {
    for (const node of nodes) {
      if (node.id === targetId) {
        ancestors.forEach((id) => result.add(id));
        return true;
      }
      if (node.children?.length && walk(node.children, [...ancestors, node.id])) {
        return true;
      }
    }
    return false;
  }
  walk(items, []);
  return result;
}

function TocNode({ item, onItemClick, level = 0, activeId, expandedIds }: {
  item: TocItem;
  onItemClick: (id: string) => void;
  level?: number;
  activeId?: string;
  expandedIds: Set<string>;
}) {
  const [isManuallyToggled, setIsManuallyToggled] = useState(false);
  const [manualExpanded, setManualExpanded] = useState(false);

  const hasChildren = item.children && item.children.length > 0;
  const isActive = item.id === activeId;
  const isExpanded = isManuallyToggled ? manualExpanded : expandedIds.has(item.id);
  const isDocGroupItem = item.isDocGroup;

  useEffect(() => {
    setIsManuallyToggled(false);
  }, [expandedIds]);

  const handleClick = () => {
    if (isDocGroupItem) {
      setIsManuallyToggled(true);
      setManualExpanded(!isExpanded);
      return;
    }
    
    if (hasChildren) {
      setIsManuallyToggled(true);
      setManualExpanded(!isExpanded);
    }
    
    if (item.hasContent) {
      onItemClick(item.id);
    }
  };

  return (
    <div>
      <div
        data-toc-id={item.id}
        className={`flex items-center gap-1 py-2 px-3 cursor-pointer rounded transition-colors group ${
          isDocGroupItem
            ? "border-b mb-0.5"
            : isActive
            ? "text-white font-medium"
            : "hover:bg-white/10"
        }`}
        style={{
          paddingLeft: `${level * 16 + 12}px`,
          ...(isDocGroupItem
            ? { background: "var(--ietm-sidebar-doc-group-bg)", borderColor: "var(--ietm-sidebar-border)", color: "var(--ietm-sidebar-text)" }
            : isActive
            ? { background: "var(--ietm-sidebar-active-accent)", color: "var(--ietm-sidebar-text)" }
            : { color: "var(--ietm-sidebar-text)" }),
        }}
      >
        {hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsManuallyToggled(true);
              setManualExpanded(!isExpanded);
            }}
            className="p-0.5 hover:bg-white/10 rounded transition-colors"
          >
            {isExpanded ? (
              <ChevronDown className="size-3.5" style={{ color: "var(--ietm-text-muted)" }} />
            ) : (
              <ChevronRight className="size-3.5" style={{ color: "var(--ietm-text-muted)" }} />
            )}
          </button>
        )}
        {!hasChildren && <span className="w-4" />}
        {isDocGroupItem && <BookOpen className="size-4 shrink-0" style={{ color: "var(--ietm-accent-color)" }} />}
        <span
          className={`text-sm flex-1 transition-colors ${
            isDocGroupItem
              ? "font-semibold uppercase tracking-wide text-xs"
              : isActive ? "text-white" : "group-hover:text-white"
          }`}
          style={isDocGroupItem ? { color: "var(--ietm-accent-color)" } : undefined}
          onClick={handleClick}
        >
          {item.title}
        </span>
      </div>
      {hasChildren && isExpanded && (
        <div>
          {item.children!.map((child) => (
            <TocNode
              key={child.id}
              item={child}
              onItemClick={onItemClick}
              level={level + 1}
              activeId={activeId}
              expandedIds={expandedIds}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function Sidebar({ isOpen, tocItems, onItemClick, activeItemId }: SidebarProps) {
  const expandedIds = useMemo(() => {
    if (!activeItemId) return new Set<string>();
    const ids = findAncestorIds(tocItems, activeItemId);
    ids.add(activeItemId);
    return ids;
  }, [activeItemId, tocItems]);

  useEffect(() => {
    if (!activeItemId) return;
    const timer = setTimeout(() => {
      const el = document.querySelector(`[data-toc-id="${activeItemId}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    return () => clearTimeout(timer);
  }, [activeItemId]);

  return (
    <div
      className={`flex flex-col shadow-lg transition-all duration-300 ease-in-out ${
        isOpen ? "w-72 opacity-100" : "w-0 overflow-hidden opacity-0"
      }`}
      style={{ background: "var(--ietm-sidebar-bg)" }}
    >
      {}
      <div className="p-3 border-b" style={{ borderColor: "var(--ietm-sidebar-border)" }}>
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ietm-sidebar-text)" }}>
            Table of Contents
          </span>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="py-2">
          {tocItems.map((item) => (
            <TocNode
              key={item.id}
              item={item}
              onItemClick={onItemClick}
              activeId={activeItemId}
              expandedIds={expandedIds}
            />
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
