import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Search, ChevronLeft, ChevronRight, X, Box, FileText, Play, ListChecks, List } from "lucide-react";
import { Input } from "./ui/input";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "./ui/resizable";
import { ScrollArea } from "./ui/scroll-area";
import { MediaFullscreen } from "./MediaFullscreen";
import { ModelViewer3D } from "./ModelViewer3D";
import { contentService } from "@/services/contentService";
import type { ContentBlock, MediaItem, MeshHotspot } from "@/lib/types";

interface ContentAreaProps {
  blocks: ContentBlock[];
  topicId?: number;
  onNavigateWithAnchor?: (nodeId: number, anchorId: string) => void;
  onSearchResultClick?: (nodeId: number) => void;
  onHotspotClick?: (nodeId: number, sourceMediaXmlId?: string) => void;
  pendingAnchor?: string | null;
  pendingSearchQuery?: string | null;
  
  pendingMediaXmlId?: string | null;
}

export function ContentArea({ blocks, topicId, onNavigateWithAnchor, onSearchResultClick, onHotspotClick, pendingAnchor, pendingSearchQuery, pendingMediaXmlId }: ContentAreaProps) {
  const { t } = useTranslation();
  
  const mediaBlocks = blocks.filter((b) => b.media != null);
  const [activeMediaBlockId, setActiveMediaBlockId] = useState<number | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const thumbnailsRef = useRef<HTMLDivElement>(null);

  const [localSearchQuery, setLocalSearchQuery] = useState("");
  const [localMatchCount, setLocalMatchCount] = useState(0);
  const [localActiveMatch, setLocalActiveMatch] = useState(0);
  const [isLocalSearchOpen, setIsLocalSearchOpen] = useState(false);

  const [checklistMode, setChecklistMode] = useState(false);

  useEffect(() => {
    if (mediaBlocks.length === 0) {
      setActiveMediaBlockId(null);
      return;
    }
    if (pendingMediaXmlId) {
      const match = mediaBlocks.find((b) => b.media?.xmlId === pendingMediaXmlId);
      if (match?.blockId != null) {
        setActiveMediaBlockId(match.blockId);
        return;
      }
    }
    setActiveMediaBlockId(mediaBlocks[0].blockId ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topicId]);

  useEffect(() => {
    if (!thumbnailsRef.current || mediaBlocks.length === 0) return;
    const idx = mediaBlocks.findIndex((b) => b.blockId === activeMediaBlockId);
    if (idx < 0) return;
    const container = thumbnailsRef.current;
    const activeBtn = container.children[idx] as HTMLElement;
    if (activeBtn) {
      activeBtn.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  }, [activeMediaBlockId, mediaBlocks]);

  const clearLocalHighlights = useCallback(() => {
    if (!contentRef.current) return;
    const marks = contentRef.current.querySelectorAll("mark.local-search-hl");
    marks.forEach((mark) => {
      const parent = mark.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(mark.textContent || ""), mark);
        parent.normalize();
      }
    });
  }, []);

  const performLocalSearch = useCallback((query: string) => {
    clearLocalHighlights();
    if (!query.trim() || !contentRef.current) {
      setLocalMatchCount(0);
      setLocalActiveMatch(0);
      return;
    }

    const walker = document.createTreeWalker(
      contentRef.current,
      NodeFilter.SHOW_TEXT,
      null
    );

    const textNodes: Text[] = [];
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      if (node.nodeValue && node.nodeValue.toLowerCase().includes(query.toLowerCase())) {
        textNodes.push(node);
      }
    }

    let totalMatches = 0;
    textNodes.forEach((textNode) => {
      const text = textNode.nodeValue || "";
      const lowerText = text.toLowerCase();
      const lowerQuery = query.toLowerCase();
      const parent = textNode.parentNode;
      if (!parent) return;

      const fragment = document.createDocumentFragment();
      let lastIndex = 0;
      let idx = lowerText.indexOf(lowerQuery, lastIndex);

      while (idx !== -1) {
        totalMatches++;
        
        if (idx > lastIndex) {
          fragment.appendChild(document.createTextNode(text.substring(lastIndex, idx)));
        }
        
        const mark = document.createElement("mark");
        mark.className = "local-search-hl px-0.5 rounded transition-colors";
        mark.style.backgroundColor = "#FFD700";
        mark.style.color = "#000";
        mark.dataset.index = String(totalMatches - 1); 
        mark.textContent = text.substring(idx, idx + query.length);
        fragment.appendChild(mark);

        lastIndex = idx + query.length;
        idx = lowerText.indexOf(lowerQuery, lastIndex);
      }
      
      if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
      }

      parent.replaceChild(fragment, textNode);
    });

    setLocalMatchCount(totalMatches);
    if (totalMatches > 0) {
      setLocalActiveMatch(1);
      setTimeout(() => highlightActiveMatch(0), 10);
    } else {
      setLocalActiveMatch(0);
    }
  }, [clearLocalHighlights]);

  useEffect(() => {
    if (pendingSearchQuery && blocks.length > 0) {
      setLocalSearchQuery(pendingSearchQuery);
      setIsLocalSearchOpen(true);
      
      const timer = setTimeout(() => performLocalSearch(pendingSearchQuery), 100);
      return () => clearTimeout(timer);
    }
  }, [pendingSearchQuery, blocks, performLocalSearch]);

  useEffect(() => {
    clearLocalHighlights();
    setLocalSearchQuery("");
    setLocalMatchCount(0);
    setLocalActiveMatch(0);
    setIsLocalSearchOpen(false);
  }, [blocks, clearLocalHighlights]);

  const highlightActiveMatch = (index: number) => {
    if (!contentRef.current) return;
    
    contentRef.current.querySelectorAll("mark.local-search-hl").forEach((m) => {
      (m as HTMLElement).style.backgroundColor = "#FFD700";
    });
    
    const active = contentRef.current.querySelector(
      `mark.local-search-hl[data-index="${index}"]`
    ) as HTMLElement | null;
    if (active) {
      active.style.backgroundColor = "#DC3545";
      active.style.color = "#fff";
      active.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const handleLocalSearchChange = (query: string) => {
    setLocalSearchQuery(query);
    performLocalSearch(query);
  };

  const handleLocalPrev = () => {
    if (localMatchCount === 0) return;
    const newIndex = localActiveMatch <= 1 ? localMatchCount : localActiveMatch - 1;
    setLocalActiveMatch(newIndex);
    highlightActiveMatch(newIndex - 1);
  };

  const handleLocalNext = () => {
    if (localMatchCount === 0) return;
    const newIndex = localActiveMatch >= localMatchCount ? 1 : localActiveMatch + 1;
    setLocalActiveMatch(newIndex);
    highlightActiveMatch(newIndex - 1);
  };

  const handleCloseLocalSearch = () => {
    setIsLocalSearchOpen(false);
    clearLocalHighlights();
    setLocalSearchQuery("");
    setLocalMatchCount(0);
    setLocalActiveMatch(0);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setIsLocalSearchOpen(true);
      }
      if (e.key === "Escape" && isLocalSearchOpen) {
        handleCloseLocalSearch();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isLocalSearchOpen]);

  const scrollToTarget = useCallback((targetId: string) => {
    
    const matchedBlock = mediaBlocks.find(
      (b) => b.media?.xmlId?.toLowerCase() === targetId.toLowerCase()
    );
    if (matchedBlock?.blockId != null) {
      setActiveMediaBlockId(matchedBlock.blockId);
      
      setTimeout(() => {
        const mediaEl = document.querySelector(
          `[data-xml-id="${matchedBlock.media!.xmlId}"]`
        );
        if (mediaEl) {
          mediaEl.scrollIntoView({ behavior: "smooth", block: "center" });
          mediaEl.classList.add("active-image-container");
          setTimeout(() => mediaEl.classList.remove("active-image-container"), 3000);
        }
      }, 100);
      return true;
    }

    const mediaEl =
      document.querySelector(`[data-xml-id="${targetId}"]`) ||
      document.querySelector(`[data-xml-id="${targetId.toLowerCase()}"]`);
    if (mediaEl) {
      mediaEl.scrollIntoView({ behavior: "smooth", block: "center" });
      mediaEl.classList.add("active-image-container");
      setTimeout(() => mediaEl.classList.remove("active-image-container"), 3000);
      return true;
    }

    const inlineEl = document.getElementById(targetId) ||
      document.getElementById(targetId.toLowerCase());
    if (inlineEl) {
      const highlightTarget = inlineEl.closest(".table-wrapper") || inlineEl;
      highlightTarget.scrollIntoView({ behavior: "smooth", block: "center" });
      highlightTarget.classList.add("section-highlight");
      setTimeout(() => highlightTarget.classList.remove("section-highlight"), 3000);
      return true;
    }

    return false;
  }, [mediaBlocks]);

  useEffect(() => {
    if (!pendingAnchor) return;
    const timer = setTimeout(() => {
      scrollToTarget(pendingAnchor);
    }, 150);
    return () => clearTimeout(timer);
  }, [pendingAnchor, scrollToTarget]);

  const handleContentClick = useCallback((e: MouseEvent) => {
    const target = e.target as HTMLElement;

    const navigateWithAnchor = (nodeId: number, anchorId: string) => {
      if (onNavigateWithAnchor) {
        onNavigateWithAnchor(nodeId, anchorId);
      } else {
        onSearchResultClick?.(nodeId);
      }
    };

    const imgRefEl = target.closest("[data-img-ref]") as HTMLElement | null;
    if (imgRefEl) {
      e.preventDefault();
      const refId = imgRefEl.getAttribute("data-img-ref")!;
      if (!scrollToTarget(refId)) {
        contentService.resolveXref(refId).then(({ nodeId }) => {
          navigateWithAnchor(nodeId, refId);
        }).catch(() => {});
      }
      return;
    }

    const tableRefEl = target.closest("[data-table-ref]") as HTMLElement | null;
    if (tableRefEl) {
      e.preventDefault();
      const refId = tableRefEl.getAttribute("data-table-ref")!;
      if (!scrollToTarget(refId)) {
        contentService.resolveXref(refId).then(({ nodeId }) => {
          navigateWithAnchor(nodeId, refId);
        }).catch(() => {});
      }
      return;
    }

    const xrefLink = target.closest('a.xref') as HTMLAnchorElement | null;
    if (!xrefLink) return;

    e.preventDefault();
    e.stopPropagation();

    const xrefTarget = xrefLink.getAttribute("data-target");
    if (!xrefTarget) return;

    if (xrefTarget.includes("#")) {
      const [topicXmlId, anchorId] = xrefTarget.split("#");
      contentService.resolveXref(topicXmlId).then(({ nodeId }) => {
        navigateWithAnchor(nodeId, anchorId);
      }).catch(() => {});
    } else {
      if (!scrollToTarget(xrefTarget)) {
        contentService.resolveXref(xrefTarget).then(({ nodeId }) => {
          navigateWithAnchor(nodeId, xrefTarget);
        }).catch(() => {});
      }
    }
  }, [onSearchResultClick, scrollToTarget]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    el.addEventListener("click", handleContentClick);
    return () => el.removeEventListener("click", handleContentClick);
  }, [handleContentClick]);

  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;

    el.querySelectorAll("input.__checklist-cb").forEach((cb) => cb.remove());
    el.querySelectorAll(".checklist-mode").forEach((list) => {
      list.classList.remove("checklist-mode");
    });
    el.querySelectorAll(".checked-item").forEach((li) => {
      li.classList.remove("checked-item");
    });

    if (!checklistMode) return;

    const lists = el.querySelectorAll("ol, ul");
    lists.forEach((list, listIdx) => {
      list.classList.add("checklist-mode");
      const items = list.querySelectorAll(":scope > li");
      items.forEach((li, itemIdx) => {
        const storageKey = `checklist_${topicId ?? "none"}_${listIdx}_${itemIdx}`;
        const isChecked = localStorage.getItem(storageKey) === "1";

        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.className = "__checklist-cb";
        cb.checked = isChecked;
        if (isChecked) li.classList.add("checked-item");

        cb.addEventListener("change", () => {
          if (cb.checked) {
            localStorage.setItem(storageKey, "1");
            li.classList.add("checked-item");
          } else {
            localStorage.removeItem(storageKey);
            li.classList.remove("checked-item");
          }
        });
        li.insertBefore(cb, li.firstChild);
      });
    });
  }, [checklistMode, blocks, topicId]);

  const activeMediaBlockIndex = activeMediaBlockId == null
    ? -1
    : mediaBlocks.findIndex((b) => b.blockId === activeMediaBlockId);
  const activeMedia: MediaItem | null =
    activeMediaBlockIndex >= 0 ? (mediaBlocks[activeMediaBlockIndex].media ?? null) : null;
  const hasMedia = mediaBlocks.length > 0;

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0" style={{ background: "var(--ietm-content-bg)", color: "var(--ietm-content-text)" }}>
      <ResizablePanelGroup direction="horizontal" className="flex-1 w-full h-full overflow-hidden">
        <ResizablePanel defaultSize={hasMedia ? 60 : 100} minSize={30}>
          <div className="h-full flex flex-col overflow-hidden min-w-0">
            {}
            {isLocalSearchOpen && (
              <div
                className="flex items-center gap-2 px-4 py-2 border-b"
                style={{ background: "var(--ietm-local-search-bg)", borderColor: "var(--ietm-local-search-border)" }}
              >
                <Search className="size-4 shrink-0" style={{ color: "var(--ietm-text-muted)" }} />
                <Input
                  type="text"
                  placeholder={t("content.search_placeholder")}
                  value={localSearchQuery}
                  onChange={(e) => handleLocalSearchChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.shiftKey ? handleLocalPrev() : handleLocalNext();
                    }
                  }}
                  className="h-7 text-sm bg-white/10 placeholder:text-gray-400 flex-1 max-w-xs"
                  style={{ borderColor: "var(--ietm-local-search-border)", color: "var(--ietm-text-primary)" }}
                  autoFocus
                />
                <span className="text-xs whitespace-nowrap min-w-[60px] text-center"
                  style={{ background: "var(--ietm-local-search-bg)", color: "var(--ietm-text-primary)" }}
                >
                  {localMatchCount > 0
                    ? `${localActiveMatch} / ${localMatchCount}`
                    : localSearchQuery
                    ? "0 results"
                    : ""}
                </span>
                <button
                  onClick={handleLocalPrev}
                  disabled={localMatchCount === 0}
                  className="p-1 hover:text-white disabled:opacity-30" style={{ color: "var(--ietm-text-secondary)" }}
                >
                  <ChevronLeft className="size-4" />
                </button>
                <button
                  onClick={handleLocalNext}
                  disabled={localMatchCount === 0}
                  className="p-1 hover:text-white disabled:opacity-30" style={{ color: "var(--ietm-text-secondary)" }}
                >
                  <ChevronRight className="size-4" />
                </button>
                <button
                  onClick={handleCloseLocalSearch}
                  className="p-1 hover:text-white" style={{ color: "var(--ietm-text-secondary)" }}
                >
                  <X className="size-4" />
                </button>
              </div>
            )}

            {}
            <div
              className="flex items-center justify-end px-4 py-1 border-b shrink-0"
              style={{ borderColor: "var(--ietm-local-search-border)", background: "var(--ietm-content-bg)" }}
            >
              <button
                onClick={() => setChecklistMode((v) => !v)}
                className="flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors"
                style={{
                  color: checklistMode ? "#2563eb" : "var(--ietm-text-muted)",
                  background: checklistMode ? "rgba(37,99,235,0.1)" : "transparent",
                }}
                title="Toggle checklist mode"
              >
                {checklistMode ? <ListChecks className="size-4" /> : <List className="size-4" />}
                {checklistMode ? t("content.checklist_on") : t("content.checklist_off")}
              </button>
            </div>

            <ScrollArea className="flex-1 min-h-0 min-w-0">
              <div ref={contentRef} className="p-8 prose max-w-none">
                <style>{`
                  ol.checklist-mode, ul.checklist-mode {
                    list-style: none !important;
                    padding-left: 1.5rem !important;
                  }
                  ol.checklist-mode > li, ul.checklist-mode > li {
                    display: flex;
                    align-items: flex-start;
                    gap: 0.5rem;
                  }
                  .__checklist-cb {
                    margin-top: 0.3rem;
                    min-width: 16px;
                    min-height: 16px;
                    accent-color: #2563eb;
                    cursor: pointer;
                  }
                  li.checked-item {
                    text-decoration: line-through;
                    opacity: 0.55;
                  }
                `}</style>
                {blocks.length === 0 && (
                  <p className="text-gray-400 italic">{t("content.no_content")}</p>
                )}
                {blocks.map((block, index) => (
                  <div
                    key={block.blockId != null ? `b-${block.blockId}` : `i-${index}`}
                    data-block-id={block.blockId ?? undefined}
                    data-block-type={block.blockType}
                    className={`mb-4 ${block.blockType === "table" ? "overflow-x-auto" : "min-w-0"}`}
                    dangerouslySetInnerHTML={{ __html: block.contentHtml }}
                  />
                ))}
              </div>
            </ScrollArea>
          </div>
        </ResizablePanel>

        {hasMedia && (
          <>
            <ResizableHandle withHandle className="bg-gradient-to-b from-gray-200 to-gray-300" />

            <ResizablePanel defaultSize={40} minSize={20}>
              <div className="h-full flex flex-col overflow-hidden min-w-0" style={{ background: "var(--ietm-content-panel-bg)" }}>
                {}
                {activeMedia && (
                  <div className="flex-1 flex flex-col overflow-hidden min-h-0 min-w-0">
                    <div
                      data-xml-id={activeMedia.xmlId}
                      className="flex-1 flex flex-col overflow-hidden min-h-0 min-w-0"
                    >
                      {}
                      <div
                        className="p-3 border-b shrink-0"
                        style={{ background: "var(--ietm-media-title-bg)", borderColor: "var(--ietm-breadcrumb-border)" }}
                      >
                        <p className="text-sm font-semibold text-gray-800">
                          {activeMedia.title}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5">
                          Figure {activeMediaBlockIndex + 1} of {mediaBlocks.length}
                          {activeMedia.xmlId && (
                            <span className="ml-2 text-gray-400">({activeMedia.xmlId})</span>
                          )}
                        </p>
                      </div>
                      <div className="relative flex-1 flex flex-col overflow-hidden min-h-0" style={{ background: "var(--ietm-media-bg)" }}>
                        {activeMedia.type === "model3d" ? (
                          <ModelViewer3D
                            url={activeMedia.url}
                            meshHotspots={activeMedia.meshHotspots}
                            onHotspotClick={(hs: MeshHotspot, _idx: number) => {
                              const sourceXmlId = activeMedia.xmlId;
                              if (hs.targetNodeId) {
                                onHotspotClick?.(hs.targetNodeId, sourceXmlId);
                              } else if (hs.targetXmlId) {
                                contentService.resolveXref(hs.targetXmlId).then(({ nodeId }) => {
                                  onHotspotClick?.(nodeId, sourceXmlId);
                                }).catch(() => {});
                              }
                            }}
                            autoRotate={false}
                          />
                        ) : activeMedia.type === "pdf" ? (
                          <object
                            data={activeMedia.url}
                            type="application/pdf"
                            style={{ width: "100%", flex: 1, minHeight: "300px", height: "100%" }}
                          >
                            <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-500 p-6">
                              <FileText className="size-12 text-gray-400" />
                              <p className="text-sm text-center">PDF preview unavailable in this browser.</p>
                              <a
                                href={activeMedia.url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm text-blue-500 underline"
                              >
                                Open PDF
                              </a>
                            </div>
                          </object>
                        ) : (
                          
                          <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
                            {activeMedia.type === "image" ? (
                              <div className="relative inline-block" style={{ lineHeight: 0 }}>
                                <img
                                  src={activeMedia.url}
                                  alt={activeMedia.title}
                                  className="block max-w-full max-h-full object-contain rounded shadow-sm"
                                  style={{ maxHeight: "calc(100vh - 280px)" }}
                                />
                                {activeMedia.hotspots?.map((hs, i) => (
                                  <div
                                    key={i}
                                    className="image-hotspot"
                                    style={{
                                      left: `${hs.x}%`,
                                      top: `${hs.y}%`,
                                      width: `${hs.width}%`,
                                      height: `${hs.height}%`,
                                    }}
                                    title={hs.label}
                                    onClick={() => {
                                      const sourceXmlId = activeMedia.xmlId;
                                      if (hs.targetNodeId) {
                                        onHotspotClick?.(hs.targetNodeId, sourceXmlId);
                                      } else if (hs.targetXmlId) {
                                        contentService.resolveXref(hs.targetXmlId).then(({ nodeId }) => {
                                          onHotspotClick?.(nodeId, sourceXmlId);
                                        }).catch(() => {});
                                      }
                                    }}
                                  />
                                ))}
                              </div>
                            ) : (
                              <video
                                src={activeMedia.url}
                                controls
                                className="max-w-full max-h-full object-contain rounded shadow-sm"
                              />
                            )}
                          </div>
                        )}
                        {}
                        {(activeMedia.type === "image" || activeMedia.type === "video") && (
                          <MediaFullscreen
                            src={activeMedia.url}
                            title={activeMedia.title}
                            type={activeMedia.type === "image" ? "image" : "video"}
                            hotspots={activeMedia.type === "image" ? activeMedia.hotspots : undefined}
                            onHotspotClick={onHotspotClick}
                            resolveXref={(id) => contentService.resolveXref(id)}
                            sourceMediaXmlId={activeMedia.xmlId}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {}
                {mediaBlocks.length > 1 && (
                  <div className="flex items-center gap-2 p-3 border-t border-gray-200 bg-gray-50 shrink-0 w-full min-w-0">
                    <button
                      onClick={() => {
                        const prev = mediaBlocks[Math.max(0, activeMediaBlockIndex - 1)];
                        if (prev?.blockId != null) setActiveMediaBlockId(prev.blockId);
                      }}
                      disabled={activeMediaBlockIndex <= 0}
                      className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                    >
                      <ChevronLeft className="size-4 text-gray-600" />
                    </button>
                    <div ref={thumbnailsRef} className="flex gap-2 overflow-x-auto flex-1 min-w-0 py-1 scroll-smooth">
                      {mediaBlocks.map((block, i) => {
                        const item = block.media!;
                        const isActive = block.blockId === activeMediaBlockId;
                        return (
                          <button
                            key={block.blockId ?? `mb-${i}`}
                            onClick={() => {
                              if (block.blockId != null) setActiveMediaBlockId(block.blockId);
                            }}
                            className={`shrink-0 h-16 w-20 rounded overflow-hidden border-2 transition-colors ${
                              isActive
                                ? "border-[#3b82f6] shadow-md"
                                : "border-transparent hover:border-gray-300"
                            }`}
                          >
                            {item.type === "image" ? (
                              <img
                                src={item.url}
                                alt={item.title}
                                className="h-full w-full object-cover"
                              />
                            ) : item.type === "model3d" ? (
                              <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-blue-700 to-indigo-800">
                                <Box className="size-6 text-white/80" />
                              </div>
                            ) : item.type === "pdf" ? (
                              <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-red-800 to-rose-900">
                                <FileText className="size-6 text-white/80" />
                              </div>
                            ) : (
                              <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-gray-700 to-gray-900">
                                <Play className="size-6 text-white/80" />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                    <button
                      onClick={() => {
                        const next = mediaBlocks[Math.min(mediaBlocks.length - 1, activeMediaBlockIndex + 1)];
                        if (next?.blockId != null) setActiveMediaBlockId(next.blockId);
                      }}
                      disabled={activeMediaBlockIndex >= mediaBlocks.length - 1}
                      className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
                    >
                      <ChevronRight className="size-4 text-gray-600" />
                    </button>
                  </div>
                )}
              </div>
            </ResizablePanel>
          </>
        )}
      </ResizablePanelGroup>
    </div>
  );
}
