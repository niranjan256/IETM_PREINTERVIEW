import type { DocumentInfo, FigureData, SectionInfo, FigureHotspotsPayload, HotspotData } from "../types";

const API_BASE = "http://localhost:3001";

export async function fetchDocuments(): Promise<DocumentInfo[]> {
  const res = await fetch(`${API_BASE}/api/documents`);
  if (!res.ok) throw new Error("Failed to fetch documents");
  return res.json();
}

export async function fetchFigures(docId: string): Promise<FigureData[]> {
  const res = await fetch(`${API_BASE}/api/documents/${encodeURIComponent(docId)}/figures`);
  if (!res.ok) throw new Error("Failed to fetch figures");
  return res.json();
}

export async function fetchSections(docId: string): Promise<SectionInfo[]> {
  const res = await fetch(`${API_BASE}/api/documents/${encodeURIComponent(docId)}/sections`);
  if (!res.ok) throw new Error("Failed to fetch sections");
  return res.json();
}

export async function submitHotspots(docId: string, payload: FigureHotspotsPayload): Promise<{ message: string; backupPath: string }> {
  const res = await fetch(`${API_BASE}/api/documents/${encodeURIComponent(docId)}/hotspots`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error || "Failed to write hotspots");
  }
  return res.json();
}

export async function autoDetectHotspots(docId: string, figId: string): Promise<{ hotspots: HotspotData[]; count: number }> {
  const res = await fetch(
    `${API_BASE}/api/documents/${encodeURIComponent(docId)}/figures/${encodeURIComponent(figId)}/auto-detect`,
    { method: "POST" }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error || "Auto-detection failed");
  }
  return res.json();
}

export async function aiDetectHotspots(docId: string, figId: string): Promise<{ hotspots: HotspotData[]; count: number }> {
  const res = await fetch(
    `${API_BASE}/api/documents/${encodeURIComponent(docId)}/figures/${encodeURIComponent(figId)}/ai-detect`,
    { method: "POST" }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error || "AI detection failed");
  }
  return res.json();
}

export async function writeFigureHotspots(docId: string, figId: string, hotspots: HotspotData[]): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/documents/${encodeURIComponent(docId)}/figures/${encodeURIComponent(figId)}/hotspots`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hotspots }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error || "Failed to sync hotspots to XML");
  }
}

export async function ocrRegion(
  docId: string, figId: string,
  x: number, y: number, w: number, h: number
): Promise<{ label: string; target: string }> {
  const res = await fetch(
    `${API_BASE}/api/documents/${encodeURIComponent(docId)}/figures/${encodeURIComponent(figId)}/ocr-region`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ x, y, w, h }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error || "OCR region failed");
  }
  return res.json();
}

export async function removeAllHotspots(docId: string): Promise<void> {
  const res = await fetch(
    `${API_BASE}/api/documents/${encodeURIComponent(docId)}/hotspots`,
    { method: "DELETE" }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error || "Failed to remove hotspots");
  }
}

export function getImageUrl(docId: string, graphicSrc: string): string {
  
  const filename = graphicSrc.replace(/^images\
  
  const encodedFilename = filename.split("/").map(encodeURIComponent).join("/");
  return `${API_BASE}/api/images/${encodeURIComponent(docId)}/${encodedFilename}`;
}

export async function checkDocsRoot(): Promise<{ configured: boolean; path: string | null }> {
  const res = await fetch(`${API_BASE}/api/docs-root`);
  if (!res.ok) throw new Error("Failed to check docs root");
  return res.json();
}

export async function setDocsRoot(folderPath: string): Promise<{ ok: boolean; path: string }> {
  const res = await fetch(`${API_BASE}/api/set-docs-root`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: folderPath }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Unknown error" }));
    throw new Error(err.error || "Failed to set docs root");
  }
  return res.json();
}

export function getExportZipUrl(): string {
  return `${API_BASE}/api/export-zip`;
}

export async function checkExpiry(): Promise<{ expired: boolean; expiryDate: string }> {
  const res = await fetch(`${API_BASE}/api/expiry`);
  if (!res.ok) throw new Error("Failed to check expiry");
  return res.json();
}
