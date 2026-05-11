import { useState, useRef, MouseEvent } from "react";
import type { HotspotData, SectionInfo } from "../types";
import TargetSectionPicker from "./TargetSectionPicker";

interface FullscreenImageViewerProps {
  imageUrl: string;
  imageName: string;
  hotspots: HotspotData[];
  sections: SectionInfo[];
  isVerified: boolean;
  onClose: () => void;
  onUpdateHotspot: (index: number, updates: Partial<HotspotData>) => void;
  onAddHotspot: (hotspot: HotspotData) => void;
  onDeleteHotspot: (index: number) => void;
  onRegionOcr?: (x: number, y: number, w: number, h: number) => Promise<{ label: string; target: string }>;
}

export default function FullscreenImageViewer({
  imageUrl,
  imageName,
  hotspots,
  sections,
  isVerified,
  onClose,
  onUpdateHotspot,
  onAddHotspot,
  onDeleteHotspot,
  onRegionOcr,
}: FullscreenImageViewerProps) {
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });
  const [currentRect, setCurrentRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [showPanel, setShowPanel] = useState(true);
  const [ocrPending, setOcrPending] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);

  const handleMouseDown = (e: MouseEvent<HTMLDivElement>) => {
    if (!imageRef.current || ocrPending) return;
    
    if ((e.target as HTMLElement).closest("[data-panel]")) return;

    const rect = imageRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return;

    setIsDrawing(true);
    setStartPos({ x, y });
    setCurrentRect({ x, y, w: 0, h: 0 });
  };

  const handleMouseMove = (e: MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !imageRef.current) return;

    const rect = imageRef.current.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    const w = currentX - startPos.x;
    const h = currentY - startPos.y;

    setCurrentRect({
      x: w < 0 ? currentX : startPos.x,
      y: h < 0 ? currentY : startPos.y,
      w: Math.abs(w),
      h: Math.abs(h),
    });
  };

  const handleMouseUp = async () => {
    if (!isDrawing || !currentRect || !imageRef.current) {
      setIsDrawing(false);
      return;
    }

    const imgRect = imageRef.current.getBoundingClientRect();

    const xPercent = Math.round((currentRect.x / imgRect.width) * 100);
    const yPercent = Math.round((currentRect.y / imgRect.height) * 100);
    const wPercent = Math.round((currentRect.w / imgRect.width) * 100);
    const hPercent = Math.round((currentRect.h / imgRect.height) * 100);

    setIsDrawing(false);
    setCurrentRect(null);

    if (wPercent < 1 || hPercent < 1) return;

    const coords = { x: xPercent, y: yPercent, w: wPercent, h: hPercent };

    if (onRegionOcr) {
      setOcrPending(true);
      try {
        const ocr = await onRegionOcr(xPercent, yPercent, wPercent, hPercent);
        onAddHotspot({ ...coords, label: ocr.label, desc: ocr.label, target: ocr.target });
      } catch {
        onAddHotspot({ ...coords, label: "", desc: "", target: "" });
      } finally {
        setOcrPending(false);
      }
    } else {
      onAddHotspot({ ...coords, label: "", desc: "", target: "" });
    }

    setSelectedIndex(hotspots.length);
  };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      {}
      <div className="bg-gray-900 text-white p-3 flex justify-between items-center">
        <h2 className="text-lg">{imageName}</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowPanel(!showPanel)}
            className="px-3 py-1 bg-gray-700 text-white rounded hover:bg-gray-600 transition text-sm"
          >
            {showPanel ? "Hide Panel" : "Show Panel"}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition"
          >
            Close
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {}
        <div
          className="flex-1 flex items-center justify-center overflow-auto relative cursor-crosshair"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => {
            if (isDrawing) handleMouseUp();
          }}
        >
          <div className="relative">
            <img
              ref={imageRef}
              src={imageUrl}
              alt={imageName}
              className="max-w-full max-h-full object-contain"
              draggable={false}
            />

            {}
            {ocrPending && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded">
                <div className="bg-gray-900 text-white text-sm px-4 py-2 rounded-lg flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4 text-blue-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Detecting text...
                </div>
              </div>
            )}

            {}
            {currentRect && (
              <div
                className="absolute border-2 border-blue-500 bg-blue-500/20 pointer-events-none"
                style={{
                  left: `${currentRect.x}px`,
                  top: `${currentRect.y}px`,
                  width: `${currentRect.w}px`,
                  height: `${currentRect.h}px`,
                }}
              >
                <div className="absolute -top-6 left-0 bg-blue-500 text-white text-xs px-2 py-1 rounded">
                  {currentRect.w > 0 && currentRect.h > 0 && imageRef.current && (
                    <>
                      {Math.round((currentRect.x / imageRef.current.getBoundingClientRect().width) * 100)}%,{" "}
                      {Math.round((currentRect.y / imageRef.current.getBoundingClientRect().height) * 100)}%,{" "}
                      {Math.round((currentRect.w / imageRef.current.getBoundingClientRect().width) * 100)}%,{" "}
                      {Math.round((currentRect.h / imageRef.current.getBoundingClientRect().height) * 100)}%
                    </>
                  )}
                </div>
              </div>
            )}

            {}
            {imageRef.current &&
              hotspots.map((hs, idx) => {
                if (!hs.w && !hs.h) return null;
                const imgRect = imageRef.current!.getBoundingClientRect();
                const left = (hs.x / 100) * imgRect.width;
                const top = (hs.y / 100) * imgRect.height;
                const width = (hs.w / 100) * imgRect.width;
                const height = (hs.h / 100) * imgRect.height;

                const isSelected = selectedIndex === idx;
                const isMatched = hs.target !== "";

                let borderClass: string;
                let bgClass: string;
                if (isSelected) {
                  borderClass = "border-yellow-400";
                  bgClass = "bg-yellow-400/20";
                } else if (isVerified && !isMatched) {
                  borderClass = "border-amber-500 border-dashed";
                  bgClass = "bg-amber-500/10";
                } else {
                  borderClass = "border-green-500";
                  bgClass = "bg-green-500/10";
                }

                return (
                  <div
                    key={idx}
                    className={`absolute border-2 cursor-pointer ${borderClass} ${bgClass}`}
                    style={{
                      left: `${left}px`,
                      top: `${top}px`,
                      width: `${width}px`,
                      height: `${height}px`,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedIndex(idx);
                    }}
                  >
                    <div
                      className={`absolute -top-6 left-0 text-white text-xs px-2 py-1 rounded ${
                        isSelected ? "bg-yellow-500" : isVerified && !isMatched ? "bg-amber-500" : "bg-green-500"
                      }`}
                    >
                      {hs.label || `#${idx + 1}`}
                    </div>
                  </div>
                );
              })}
          </div>
        </div>

        {}
        {showPanel && (
          <div data-panel className="w-80 bg-gray-900 text-white p-4 overflow-y-auto">
            <h3 className="text-sm font-semibold mb-3 text-gray-300">
              Hotspots ({hotspots.length})
            </h3>

            {hotspots.length === 0 ? (
              <p className="text-xs text-gray-500">Draw on the image to create hotspots.</p>
            ) : (
              <div className="space-y-2">
                {hotspots.map((hs, idx) => (
                  <div
                    key={idx}
                    className={`rounded p-2 cursor-pointer text-sm ${
                      selectedIndex === idx
                        ? "bg-yellow-600/30 border border-yellow-500"
                        : "bg-gray-800 border border-gray-700 hover:border-gray-500"
                    }`}
                    onClick={() => setSelectedIndex(idx)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-gray-400">#{idx + 1}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteHotspot(idx);
                          if (selectedIndex === idx) setSelectedIndex(null);
                        }}
                        className="text-red-400 hover:text-red-300 text-xs"
                      >
                        Delete
                      </button>
                    </div>

                    {selectedIndex === idx ? (
                      <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
                        {}
                        <div className="flex gap-1">
                          {(["x", "y", "w", "h"] as const).map((f) => (
                            <div key={f} className="flex-1">
                              <label className="text-xs text-gray-500">{f}</label>
                              <input
                                type="number"
                                value={hs[f]}
                                onChange={(e) =>
                                  onUpdateHotspot(idx, { [f]: parseFloat(e.target.value) || 0 })
                                }
                                className="w-full px-1 py-0.5 bg-gray-700 border border-gray-600 rounded text-xs text-white"
                              />
                            </div>
                          ))}
                        </div>

                        {}
                        <div>
                          <label className="text-xs text-gray-500">Label</label>
                          <input
                            type="text"
                            value={hs.label}
                            onChange={(e) => onUpdateHotspot(idx, { label: e.target.value })}
                            className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-white"
                            placeholder="Label"
                          />
                        </div>

                        {}
                        <div>
                          <label className="text-xs text-gray-500">Description</label>
                          <input
                            type="text"
                            value={hs.desc}
                            onChange={(e) => onUpdateHotspot(idx, { desc: e.target.value })}
                            className="w-full px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-white"
                            placeholder="Description"
                          />
                        </div>

                        {}
                        <div>
                          <label className="text-xs text-gray-500">Target Section</label>
                          <TargetSectionPicker
                            sections={sections}
                            value={hs.target}
                            onChange={(id) => onUpdateHotspot(idx, { target: id })}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs text-gray-400 flex items-center gap-1">
                        {isVerified && (
                          hs.target !== ""
                            ? <span className="w-2 h-2 rounded-full bg-green-500 inline-block flex-shrink-0" />
                            : <span className="w-2 h-2 rounded-full bg-amber-500 inline-block flex-shrink-0" />
                        )}
                        {hs.label || "(no label)"} — {hs.x},{hs.y} {hs.w}x{hs.h}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {}
      <div className="bg-gray-900 text-white p-2 text-sm text-center">
        Click and drag to draw a hotspot region — text inside will be auto-detected. Click an existing hotspot to select and edit it.
      </div>
    </div>
  );
}
