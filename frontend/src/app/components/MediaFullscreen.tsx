import { useCallback, useEffect, useRef, useState } from "react";
import { X, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { Button } from "./ui/button";
import type { Hotspot } from "../../lib/types";

interface MediaFullscreenProps {
  src: string;
  title: string;
  type: 'image' | 'video';
  hotspots?: Hotspot[];
  onHotspotClick?: (nodeId: number, sourceMediaXmlId?: string) => void;
  resolveXref?: (xmlId: string) => Promise<{ nodeId: number }>;
  
  sourceMediaXmlId?: string;
}

export function MediaFullscreen({
  src,
  title,
  type,
  hotspots,
  onHotspotClick,
  resolveXref,
  sourceMediaXmlId,
}: MediaFullscreenProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragState = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const resetView = () => {
    setZoom(100);
    setPan({ x: 0, y: 0 });
  };

  const handleZoomIn = () => setZoom(z => Math.min(z + 25, 400));
  const handleZoomOut = () => setZoom(z => {
    const next = Math.max(z - 25, 50);
    if (next <= 100) setPan({ x: 0, y: 0 });
    return next;
  });

  const close = () => {
    setIsOpen(false);
    resetView();
  };

  const handleHotspotClick = useCallback(async (hs: Hotspot) => {
    if (hs.targetNodeId != null) {
      close();
      onHotspotClick?.(hs.targetNodeId, sourceMediaXmlId);
      return;
    }
    if (hs.targetXmlId && resolveXref) {
      try {
        const { nodeId } = await resolveXref(hs.targetXmlId);
        close();
        onHotspotClick?.(nodeId, sourceMediaXmlId);
      } catch {
        
      }
    }
  }, [onHotspotClick, resolveXref, sourceMediaXmlId]);

  const beginPan = (e: React.PointerEvent) => {
    if (zoom <= 100) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    dragState.current = { startX: e.clientX, startY: e.clientY, origX: pan.x, origY: pan.y };
  };
  const handlePan = (e: React.PointerEvent) => {
    if (!dragState.current) return;
    const { startX, startY, origX, origY } = dragState.current;
    setPan({ x: origX + (e.clientX - startX), y: origY + (e.clientY - startY) });
  };
  const endPan = (e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    dragState.current = null;
  };

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "+" || e.key === "=") handleZoomIn();
      if (e.key === "-" || e.key === "_") handleZoomOut();
      if (zoom > 100) {
        const step = 40;
        if (e.key === "ArrowUp") setPan(p => ({ ...p, y: p.y + step }));
        if (e.key === "ArrowDown") setPan(p => ({ ...p, y: p.y - step }));
        if (e.key === "ArrowLeft") setPan(p => ({ ...p, x: p.x + step }));
        if (e.key === "ArrowRight") setPan(p => ({ ...p, x: p.x - step }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, zoom]);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(true)}
        className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white"
      >
        <Maximize2 className="size-4" />
      </Button>

      {isOpen && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col">
          <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between">
            <h3 className="text-white text-lg font-semibold bg-black/50 px-4 py-2 rounded-lg backdrop-blur-sm">
              {title}
            </h3>
            <div className="flex items-center gap-2">
              {type === 'image' && (
                <>
                  <Button variant="ghost" size="sm" onClick={handleZoomOut} className="bg-black/50 hover:bg-black/70 text-white">
                    <ZoomOut className="size-4" />
                  </Button>
                  <span className="text-white text-sm bg-black/50 px-3 py-1 rounded-lg">{zoom}%</span>
                  <Button variant="ghost" size="sm" onClick={handleZoomIn} className="bg-black/50 hover:bg-black/70 text-white">
                    <ZoomIn className="size-4" />
                  </Button>
                </>
              )}
              <Button variant="ghost" size="sm" onClick={close} className="bg-black/50 hover:bg-black/70 text-white">
                <X className="size-4" />
              </Button>
            </div>
          </div>

          <div
            ref={viewportRef}
            className="flex-1 overflow-hidden relative flex items-center justify-center"
            onPointerDown={beginPan}
            onPointerMove={handlePan}
            onPointerUp={endPan}
            onPointerCancel={endPan}
            style={{
              touchAction: zoom > 100 ? 'none' : 'auto',
              cursor: zoom > 100 ? (dragState.current ? 'grabbing' : 'grab') : 'default',
            }}
          >
            {type === 'image' ? (
              <div
                className="relative inline-block"
                style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom / 100})`,
                  transformOrigin: 'center center',
                  willChange: 'transform',
                  transition: dragState.current ? 'none' : 'transform 0.15s ease-out',
                }}
              >
                <img
                  src={src}
                  alt={title}
                  className="block max-w-[90vw] max-h-[85vh] select-none"
                  draggable={false}
                />
                {hotspots?.map((hs, i) => (
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
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => { e.stopPropagation(); handleHotspotClick(hs); }}
                  />
                ))}
              </div>
            ) : (
              <video src={src} controls className="max-w-full max-h-full" />
            )}
          </div>
        </div>
      )}
    </>
  );
}
