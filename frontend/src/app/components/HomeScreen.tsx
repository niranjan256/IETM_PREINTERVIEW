import { useState, useRef, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "motion/react";
import { Search, BookOpen, FileText, ChevronRight, Box, Play, X } from "lucide-react";
import { ModelViewer3D } from "./ModelViewer3D";
import type { DocumentInfo } from "@/services/contentService";
import type { SearchResult } from "@/lib/types";

const DEMO_ITEMS = [
  {
    type: "model3d" as const,
    label: "3D Assembly",
    desc: "2-Cylinder Engine",
    url: "/examples/2CylinderEngine.glb",
    gradient: "linear-gradient(135deg, #2563eb, #4338ca)",
    icon: "box",
  },
  {
    type: "model3d" as const,
    label: "3D Model",
    desc: "Battle-Damaged Helmet",
    url: "/examples/DamagedHelmet.glb",
    gradient: "linear-gradient(135deg, #4f46e5, #7c3aed)",
    icon: "box",
  },
  {
    type: "video" as const,
    label: "Video Procedure",
    desc: "Maintenance walkthrough",
    url: "/examples/procedure_demo.mp4",
    gradient: "linear-gradient(135deg, #e11d48, #db2777)",
    icon: "play",
  },
  {
    type: "pdf" as const,
    label: "PDF Reference",
    desc: "Engineering Drawing Standards",
    url: "/examples/engineering_manual.pdf",
    gradient: "linear-gradient(135deg, #d97706, #ea580c)",
    icon: "file",
  },
];

type DemoItem = typeof DEMO_ITEMS[number];

function MediaDemoModal({
  item,
  onClose,
  onSearch,
  onNavigate,
}: {
  item: DemoItem;
  onClose: () => void;
  onSearch: (q: string, mode: string) => Promise<SearchResult[]>;
  onNavigate: (nodeId: number) => void;
}) {
  
  const [topicPool, setTopicPool] = useState<SearchResult[]>([]);
  const [navHint, setNavHint] = useState<string | null>(null);

  useEffect(() => {
    if (item.type !== "model3d") return;
    onSearch("system", "text").then((res) => setTopicPool(res.slice(0, 20))).catch(() => {});
  }, [item.type, onSearch]);

  const handleMeshHotspot = useCallback((_hs: unknown, meshIndex: number) => {
    if (topicPool.length === 0) return;
    const target = topicPool[meshIndex % topicPool.length];
    setNavHint(`→ ${target.nodeTitle}`);
    setTimeout(() => {
      onNavigate(target.nodeId);
      onClose();
    }, 600);
  }, [topicPool, onNavigate, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: "rgba(0,0,0,0.92)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {}
      <div className="flex items-center justify-between px-6 py-4 shrink-0 border-b border-white/10">
        <div>
          <p className="text-white font-semibold text-base">{item.label}</p>
          <p className="text-slate-400 text-sm">
            {navHint ?? item.desc}
          </p>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-white/10 transition-colors text-slate-400 hover:text-white"
        >
          <X className="size-5" />
        </button>
      </div>

      {}
      <div className="flex-1 overflow-hidden min-h-0">
        {item.type === "model3d" && (
          <ModelViewer3D
            url={item.url}
            autoRotate
            onHotspotClick={handleMeshHotspot as any}
          />
        )}
        {item.type === "video" && (
          <div className="h-full flex items-center justify-center p-8">
            <video
              src={item.url}
              controls
              autoPlay
              className="max-w-full max-h-full rounded-lg shadow-2xl"
            />
          </div>
        )}
        {item.type === "pdf" && (
          <object
            data={item.url}
            type="application/pdf"
            style={{ width: "100%", height: "100%" }}
          >
            <div className="h-full flex flex-col items-center justify-center gap-4 text-slate-400">
              <FileText className="size-16" />
              <p className="text-base">PDF preview unavailable in this browser.</p>
              <a href={item.url} target="_blank" rel="noreferrer" className="text-blue-400 underline text-sm">
                Open PDF
              </a>
            </div>
          </object>
        )}
      </div>
    </div>
  );
}

interface HomeScreenProps {
  documents: DocumentInfo[];
  onDocumentClick: (docId: string) => void;
  onSearch: (query: string, mode: string) => Promise<SearchResult[]>;
  onSearchResultClick: (nodeId: number, anchorId?: string) => void;
}

export function HomeScreen({
  documents,
  onDocumentClick,
  onSearch,
  onSearchResultClick,
}: HomeScreenProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [activeDemoItem, setActiveDemoItem] = useState<DemoItem | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleInputChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setResults([]);
      setShowResults(false);
      return;
    }
    setIsSearching(true);
    setShowResults(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await onSearch(value.trim(), "headings");
        setResults(res.slice(0, 12));
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 350);
  };

  const handleResultClick = (nodeId: number, anchorId?: string) => {
    setShowResults(false);
    setQuery("");
    onSearchResultClick(nodeId, anchorId);
  };

  const cardColors = [
    { bg: "rgba(59,130,246,0.12)", border: "rgba(59,130,246,0.25)", icon: "#3b82f6" },
    { bg: "rgba(16,185,129,0.12)", border: "rgba(16,185,129,0.25)", icon: "#10b981" },
    { bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.25)", icon: "#f59e0b" },
    { bg: "rgba(139,92,246,0.12)", border: "rgba(139,92,246,0.25)", icon: "#8b5cf6" },
    { bg: "rgba(236,72,153,0.12)", border: "rgba(236,72,153,0.25)", icon: "#ec4899" },
    { bg: "rgba(14,165,233,0.12)", border: "rgba(14,165,233,0.25)", icon: "#0ea5e9" },
    { bg: "rgba(168,85,247,0.12)", border: "rgba(168,85,247,0.25)", icon: "#a855f7" },
    { bg: "rgba(234,88,12,0.12)", border: "rgba(234,88,12,0.25)", icon: "#ea580c" },
    { bg: "rgba(20,184,166,0.12)", border: "rgba(20,184,166,0.25)", icon: "#14b8a6" },
  ];

  return (
    <motion.div
      className="flex-1 relative overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      {}
      <div
        className="absolute inset-0"
        style={{
          background: "linear-gradient(135deg, #0f172a 0%, #1e3a5f 25%, #0f172a 50%, #1a2744 75%, #0f172a 100%)",
          backgroundSize: "400% 400%",
          animation: "gradientShift 15s ease infinite",
        }}
      />
      <style>{`
        @keyframes gradientShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
      `}</style>

      {}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
        style={{ filter: "brightness(0.3)" }}
      >
        <source src="/home-bg.mp4" type="video/mp4" />
        <source src="/home-bg.webm" type="video/webm" />
      </video>

      {}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(15,23,42,0.7) 0%, rgba(15,23,42,0.4) 40%, rgba(15,23,42,0.8) 100%)",
        }}
      />

      {}
      <div className="relative z-10 h-full flex flex-col items-center justify-center px-6">
        {}
        <div className="text-center mb-8">
          <h1
            className="text-4xl font-bold tracking-tight mb-2"
            style={{
              background: "linear-gradient(135deg, #e2e8f0, #ffffff)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
            }}
          >
            {t("home.hero_title")}
          </h1>
          <p className="text-sm text-slate-400 tracking-wide">
            {t("home.hero_subtitle")}
          </p>
        </div>

        {}
        <div ref={searchRef} className="relative w-full max-w-2xl mb-10">
          <div
            className="flex items-center gap-3 px-5 py-4 rounded-2xl border transition-all duration-300"
            style={{
              background: "rgba(255,255,255,0.07)",
              borderColor: query
                ? "rgba(59,130,246,0.5)"
                : "rgba(255,255,255,0.12)",
              backdropFilter: "blur(20px)",
              boxShadow: query
                ? "0 0 30px rgba(59,130,246,0.15)"
                : "0 4px 30px rgba(0,0,0,0.3)",
            }}
          >
            <Search className="size-5 text-slate-400 shrink-0" />
            <input
              type="text"
              value={query}
              onChange={(e) => handleInputChange(e.target.value)}
              onFocus={() => results.length > 0 && setShowResults(true)}
              placeholder={t("home.search_placeholder")}
              className="flex-1 bg-transparent text-white placeholder-slate-500 outline-none text-base"
            />
            {isSearching && (
              <div className="size-5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
            )}
          </div>

          {}
          {showResults && results.length > 0 && (
            <div
              className="absolute top-full left-0 right-0 mt-2 rounded-xl overflow-hidden overflow-y-auto border"
              style={{
                background: "rgba(30,41,59,0.95)",
                borderColor: "rgba(255,255,255,0.1)",
                backdropFilter: "blur(20px)",
                boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
                maxHeight: "320px",
              }}
            >
              {results.map((r, i) => (
                <button
                  key={`${r.nodeId}-${i}`}
                  onClick={() => handleResultClick(r.nodeId, r.anchorId)}
                  className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-white/5 transition-colors border-b border-white/5 last:border-0"
                >
                  <FileText className="size-4 text-blue-400 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-200 truncate">
                      {r.nodeTitle}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                      {r.snippet.replace(/<[^>]+>/g, "")}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {showResults && query.trim().length >= 2 && results.length === 0 && !isSearching && (
            <div
              className="absolute top-full left-0 right-0 mt-2 rounded-xl p-4 text-center text-sm text-slate-500 border"
              style={{
                background: "rgba(30,41,59,0.95)",
                borderColor: "rgba(255,255,255,0.1)",
                backdropFilter: "blur(20px)",
              }}
            >
              {t("home.no_results")} &quot;{query}&quot;
            </div>
          )}
        </div>

        {}
        <div className="w-full max-w-4xl">
          <p className="text-xs uppercase tracking-widest text-slate-500 mb-4 text-center font-medium">
            {t("home.available_manuals")}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {documents.map((doc, i) => {
              const color = cardColors[i % cardColors.length];
              const displayName = doc.doc_id.replace(/_/g, " ");
              return (
                <button
                  key={doc.doc_id}
                  onClick={() => onDocumentClick(doc.doc_id)}
                  className="group flex items-center gap-2.5 px-4 py-2.5 rounded-lg border transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
                  style={{
                    background: color.bg,
                    borderColor: color.border,
                  }}
                >
                  <BookOpen
                    className="size-4 shrink-0"
                    style={{ color: color.icon }}
                  />
                  <span className="text-sm font-medium text-slate-200 whitespace-nowrap">
                    {displayName}
                  </span>
                  <ChevronRight
                    className="size-3.5 text-slate-500 group-hover:text-slate-300 transition-colors"
                  />
                </button>
              );
            })}
          </div>
        </div>

        {}
        <div className="w-full max-w-4xl mt-8">
          <p className="text-xs uppercase tracking-widest text-slate-500 mb-4 text-center font-medium">
            {t("home.media_capabilities")}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {DEMO_ITEMS.map((item) => (
              <button
                key={item.url}
                onClick={() => setActiveDemoItem(item)}
                className="group flex flex-col items-center gap-2 px-5 py-4 rounded-xl border border-white/10 transition-all duration-200 hover:scale-[1.04] active:scale-[0.97] hover:border-white/25 min-w-[130px]"
                style={{ background: "rgba(255,255,255,0.05)" }}
              >
                <div
                  className="size-10 rounded-lg flex items-center justify-center shadow-md"
                  style={{ background: item.gradient }}
                >
                  {item.icon === "box"  && <Box      className="size-5 text-white" />}
                  {item.icon === "play" && <Play     className="size-5 text-white" />}
                  {item.icon === "file" && <FileText className="size-5 text-white" />}
                </div>
                <span className="text-xs font-semibold text-slate-200 whitespace-nowrap">{item.label}</span>
                <span className="text-[10px] text-slate-500 whitespace-nowrap">{item.desc}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {}
      {activeDemoItem && (
        <MediaDemoModal
          item={activeDemoItem}
          onClose={() => setActiveDemoItem(null)}
          onSearch={onSearch}
          onNavigate={(nodeId) => {
            setActiveDemoItem(null);
            onSearchResultClick(nodeId);
          }}
        />
      )}
    </motion.div>
  );
}
