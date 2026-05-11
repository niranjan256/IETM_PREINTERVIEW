import { useState, useEffect } from "react";
import { Image, Table2 } from "lucide-react";
import { contentService } from "@/services/contentService";
import type { ChapterIndex, ChapterIndexFigure, ChapterIndexTable } from "@/lib/types";

interface DocumentIndexPageProps {
  docId: string;
  mode: "figures" | "tables";
  onNavigate: (nodeId: number, anchorId: string) => void;
}

export function DocumentIndexPage({ docId, mode, onNavigate }: DocumentIndexPageProps) {
  const [index, setIndex] = useState<ChapterIndex | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    setIsLoading(true);
    setIndex(null);
    contentService
      .getDocumentIndex(docId)
      .then((data) => {
        setIndex(data);
        setIsLoading(false);
      })
      .catch(() => {
        setIsLoading(false);
      });
  }, [docId]);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 h-full" style={{ background: "#edf2f7" }}>
        Loading index...
      </div>
    );
  }

  if (!index) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-400 h-full" style={{ background: "#edf2f7" }}>
        Failed to load index.
      </div>
    );
  }

  const items = mode === "figures" ? index.figures : index.tables;
  const title = mode === "figures" ? "List of Figures" : "List of Tables";
  const Icon = mode === "figures" ? Image : Table2;
  const iconColor = mode === "figures" ? "text-[#3b82f6]" : "text-[#10b981]";
  const hoverBg = mode === "figures" ? "hover:bg-[#eff6ff]" : "hover:bg-[#f0fdf4]";
  const textColor = mode === "figures" ? "text-[#1e40af]" : "text-[#065f46]";

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-white">
      {}
      <div className="border-b border-slate-200 px-8 py-6 bg-slate-50">
        <div className="flex items-center gap-3">
          <Icon className={`size-8 ${iconColor}`} />
          <h1 className="text-2xl font-bold text-slate-800 tracking-tight">
            {title}
          </h1>
        </div>
        <p className="text-sm text-slate-500 mt-2">
          {items.length} {mode} found in document {docId.replace(/_/g, " ")}.
        </p>
      </div>

      {}
      <div className="flex-1 overflow-auto bg-white px-8 py-4">
        {items.length === 0 ? (
          <p className="text-slate-400 italic mt-4">
            No {mode} found in this document.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 max-w-4xl border border-slate-200 rounded-lg overflow-hidden shadow-sm">
            {items.map((item: ChapterIndexFigure | ChapterIndexTable, i) => (
              <li key={item.xmlId || `item-${i}`}>
                <button
                  className={`w-full text-left px-5 py-3 text-sm transition-colors group flex items-start gap-4 bg-white ${hoverBg}`}
                  onClick={() => onNavigate(item.nodeId, item.xmlId)}
                >
                  <span className="text-slate-400 font-mono w-20 shrink-0 mt-0.5">
                    {item.number ? `${mode === "figures" ? "Fig" : "Tbl"} ${item.number}` : ""}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className={`block font-medium mb-1 truncate ${textColor} group-hover:underline`}>
                      {item.title || item.xmlId}
                    </span>
                    {item.nodeTitle && (
                      <span className="block text-xs text-slate-500 truncate">
                        Located in: {item.nodeTitle}
                      </span>
                    )}
                  </div>
                  <span className="text-slate-300 group-hover:text-current shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="sr-only">Go to section</span>
                    ↗
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
