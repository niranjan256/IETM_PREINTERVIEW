import { useState, useEffect, useRef } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Search,
  X,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "./ui/breadcrumb";
import type { SearchResult } from "@/lib/types";

export interface BreadcrumbEntry {
  id: number;
  title: string;
}

interface HeaderProps {
  breadcrumbs: BreadcrumbEntry[];
  onLogicalPrev: () => void;
  onLogicalNext: () => void;
  onHistoryPrev: () => void;
  onHistoryNext: () => void;
  canGoBack: boolean;
  canGoForward: boolean;
  canLogicalPrev: boolean;
  canLogicalNext: boolean;
  onBreadcrumbClick?: (id: number) => void;
  onSearch: (query: string, mode: string) => Promise<SearchResult[]> | void;
  onSearchResultClick?: (nodeId: number, query?: string, anchorId?: string) => void;
  onClearSearch?: () => void;
}

export function Header({
  breadcrumbs,
  onLogicalPrev,
  onLogicalNext,
  onHistoryPrev,
  onHistoryNext,
  canGoBack,
  canGoForward,
  canLogicalPrev,
  canLogicalNext,
  onBreadcrumbClick,
  onSearch,
  onSearchResultClick,
  onClearSearch,
}: HeaderProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState<"figure" | "headings">("headings");
  const [searchResults, setSearchResults] = useState<SearchResult[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);

  const searchContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setSearchResults(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const clearSearch = () => {
    setSearchQuery("");
    setSearchResults(null);
    setIsSearching(false);
    onClearSearch?.();
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    setIsSearching(true);
    try {
      const results = await onSearch(searchQuery, searchMode);
      if (Array.isArray(results)) {
        setSearchResults(results);
      }
    } finally {
      setIsSearching(false);
    }
  };

  const modes = [
    { id: "figure" as const, label: "Figure" },
    { id: "headings" as const, label: "Heading" },
  ];

  return (
    <div className="shrink-0">
      {}
      <div
        className="flex items-center gap-2 px-4 py-1.5"
        style={{ background: "var(--ietm-action-bar-bg)" }}
      >
        {}
        <Button
          variant="ghost"
          size="sm"
          onClick={onHistoryPrev}
          disabled={!canGoBack}
          className="h-8 px-3 text-xs font-medium hover:text-white disabled:opacity-40"
          style={{
            background: "var(--ietm-action-btn-bg)",
            border: "1px solid var(--ietm-action-btn-border)",
            color: "var(--ietm-text-secondary)",
          }}
          title="Last Opened"
        >
          <ChevronLeft className="size-3 mr-1" />
          Back
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onHistoryNext}
          disabled={!canGoForward}
          className="h-8 px-3 text-xs font-medium hover:text-white disabled:opacity-40"
          style={{
            background: "var(--ietm-action-btn-bg)",
            border: "1px solid var(--ietm-action-btn-border)",
            color: "var(--ietm-text-secondary)",
          }}
          title="Next in history"
        >
          Next
          <ChevronRight className="size-3 ml-1" />
        </Button>

        {}
        <div className="flex-1 flex justify-center mx-3">
          <div className="relative w-full max-w-xl" ref={searchContainerRef}>
            <div
              className="flex items-center h-8 rounded-md overflow-hidden"
              style={{
                border: "1px solid var(--ietm-action-btn-border)",
                background: "var(--ietm-action-btn-bg)",
              }}
            >
              {}
              <div className="flex items-center shrink-0 h-full">
                {modes.map((mode, i) => (
                  <button
                    key={mode.id}
                    onClick={() => setSearchMode(mode.id)}
                    className="h-full px-2.5 text-xs font-medium transition-colors whitespace-nowrap"
                    style={{
                      background: searchMode === mode.id ? "var(--ietm-ring)" : "transparent",
                      color: searchMode === mode.id ? "#fff" : "var(--ietm-text-muted)",
                      borderRight: i < modes.length - 1 ? "1px solid var(--ietm-action-btn-border)" : undefined,
                    }}
                  >
                    {mode.label}
                  </button>
                ))}
                <div className="w-px h-4 shrink-0" style={{ background: "var(--ietm-action-btn-border)" }} />
              </div>

              {}
              <Search
                className="size-4 mx-2 shrink-0 cursor-pointer"
                style={{ color: "var(--ietm-text-muted)" }}
                onClick={handleSearch}
              />

              {}
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                onFocus={() => {
                  if (searchQuery.trim().length > 0 && searchResults === null) {
                    handleSearch();
                  }
                }}
                className="flex-1 h-full bg-transparent text-sm outline-none min-w-0"
                style={{
                  color: "var(--ietm-text-primary)",
                }}
              />

              {}
              {searchQuery && (
                <X
                  className="size-4 mx-2 shrink-0 cursor-pointer"
                  style={{ color: "var(--ietm-text-muted)" }}
                  onClick={clearSearch}
                />
              )}
            </div>

            {}
            {searchResults !== null && (
              <div
                className="absolute top-full left-0 right-0 mt-1 px-4 py-2 text-xs border rounded-lg shadow-xl z-50 max-h-64 overflow-hidden flex flex-col"
                style={{
                  background: "var(--ietm-search-dropdown-bg)",
                  borderColor: "var(--ietm-search-dropdown-border)",
                  color: "var(--ietm-search-dropdown-text)",
                }}
              >
                {isSearching ? (
                  <p>Searching…</p>
                ) : searchResults.length === 0 ? (
                  <p>No results for &quot;{searchQuery}&quot;</p>
                ) : (
                  <>
                    <p className="font-medium mb-1 shrink-0">
                      {searchResults.length} result(s) for &quot;{searchQuery}&quot;
                    </p>
                    <div className="flex-1 overflow-y-auto space-y-0.5 pr-2 custom-scrollbar">
                      {searchResults.map((r) => (
                        <button
                          key={r.nodeId}
                          className="block text-left w-full rounded px-2 py-1.5"
                          style={{ color: "var(--ietm-search-dropdown-text)" }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--ietm-search-dropdown-border)")}
                          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                          onClick={() => {
                            const queryToHighlight = undefined;
                            onSearchResultClick?.(r.nodeId, queryToHighlight, r.anchorId);
                            setSearchResults(null);
                          }}
                        >
                          <span className="font-medium block" style={{ color: "var(--ietm-text-primary)" }}>{r.nodeTitle}</span>
                          {r.snippet && (
                            <span className="block mt-0.5 line-clamp-2" style={{ color: "var(--ietm-text-muted)" }}>{r.snippet}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {}
        <Button
          variant="ghost"
          size="sm"
          onClick={onLogicalPrev}
          disabled={!canLogicalPrev}
          className="h-8 px-3 text-xs font-medium hover:text-white disabled:opacity-40"
          style={{
            background: "var(--ietm-action-btn-bg)",
            border: "1px solid var(--ietm-action-btn-border)",
            color: "var(--ietm-text-secondary)",
          }}
          title="Previous topic"
        >
          <ChevronLeft className="size-3 mr-1" />
          Prev
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onLogicalNext}
          disabled={!canLogicalNext}
          className="h-8 px-3 text-xs font-medium hover:text-white disabled:opacity-40"
          style={{
            background: "var(--ietm-action-btn-bg)",
            border: "1px solid var(--ietm-action-btn-border)",
            color: "var(--ietm-text-secondary)",
          }}
          title="Next topic"
        >
          Next
          <ChevronRight className="size-3 ml-1" />
        </Button>
      </div>

      {}
      <div
        className="px-6 py-1.5 border-b"
        style={{ background: "var(--ietm-breadcrumb-bg)", borderColor: "var(--ietm-breadcrumb-border)" }}
      >
        <Breadcrumb>
          <BreadcrumbList>
            {breadcrumbs.map((crumb, index) => (
              <div key={crumb.id} className="flex items-center">
                {index > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  {index === breadcrumbs.length - 1 ? (
                    <BreadcrumbPage>{crumb.title}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        onBreadcrumbClick?.(crumb.id);
                      }}
                    >
                      {crumb.title}
                    </BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </div>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
    </div>
  );
}
