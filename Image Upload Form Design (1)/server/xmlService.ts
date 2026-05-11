import fs from "fs";
import path from "path";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

let _docsRoot: string | null = null;

export function setDocsRoot(p: string): void {
  _docsRoot = path.resolve(p);
}

export function getDocsRoot(): string | null {
  return _docsRoot;
}

function requireDocsRoot(): string {
  if (!_docsRoot) throw new Error("Docs root not configured. Select a docs folder first.");
  return _docsRoot;
}

export interface DocumentInfo {
  docId: string;
  title: string;
}

export interface HotspotData {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  desc: string;
  target: string;
  matchSource?: "string" | "semantic";
}

export interface FigureData {
  id: string;
  number: string;
  title: string;
  graphicSrc: string;
  hotspots: HotspotData[];
}

export interface SectionInfo {
  id: string;
  number: string;
  title: string;
  level: number;
}

function getXmlPath(docId: string): string {
  return path.join(requireDocsRoot(), docId, "ietm_output.xml");
}

function parseXmlFile(filePath: string): Document {
  const xml = fs.readFileSync(filePath, "utf-8");
  return new DOMParser().parseFromString(xml, "text/xml");
}

function getElementsByTagName(parent: Node, tag: string): Element[] {
  const doc = parent as any;
  const els = doc.getElementsByTagName
    ? doc.getElementsByTagName(tag)
    : (parent.ownerDocument || parent as any).getElementsByTagName(tag);
  const result: Element[] = [];
  for (let i = 0; i < els.length; i++) {
    result.push(els.item(i) as Element);
  }
  return result;
}

export function listDocuments(): DocumentInfo[] {
  const masterPath = path.join(requireDocsRoot(), "master.xml");
  if (!fs.existsSync(masterPath)) return [];

  const doc = parseXmlFile(masterPath);
  const manuals = getElementsByTagName(doc, "manual");

  return manuals.map((m) => ({
    docId: m.getAttribute("docId") || "",
    title: m.getAttribute("title") || "",
  }));
}

export function getFigures(docId: string): FigureData[] {
  const xmlPath = getXmlPath(docId);
  if (!fs.existsSync(xmlPath)) return [];

  const doc = parseXmlFile(xmlPath);
  const figures = getElementsByTagName(doc, "figure");

  return figures.map((fig) => {
    const id = fig.getAttribute("id") || "";
    const number = fig.getAttribute("number") || "";

    const titleEls = getElementsByTagName(fig, "title");
    const title = titleEls.length > 0 ? (titleEls[0].textContent || "") : "";

    const graphicEls = getElementsByTagName(fig, "graphic");
    const graphicSrc = graphicEls.length > 0
      ? (graphicEls[0].getAttribute("src") || "")
      : "";

    const hotspots: HotspotData[] = [];
    const hotspotEls = getElementsByTagName(fig, "hotspot");
    for (const hs of hotspotEls) {
      hotspots.push({
        x: parseFloat(hs.getAttribute("x") || "0"),
        y: parseFloat(hs.getAttribute("y") || "0"),
        w: parseFloat(hs.getAttribute("w") || "0"),
        h: parseFloat(hs.getAttribute("h") || "0"),
        label: hs.getAttribute("label") || hs.getAttribute("text") || "",
        desc: hs.getAttribute("desc") || "",
        target: hs.getAttribute("target") || "",
      });
    }

    return { id, number, title, graphicSrc, hotspots };
  });
}

export function getSections(docId: string): SectionInfo[] {
  const xmlPath = getXmlPath(docId);
  if (!fs.existsSync(xmlPath)) return [];

  const doc = parseXmlFile(xmlPath);
  const sections: SectionInfo[] = [];

  const sectionEls = getElementsByTagName(doc, "section");
  for (const sec of sectionEls) {
    sections.push({
      id: sec.getAttribute("id") || "",
      number: sec.getAttribute("number") || "",
      title: sec.getAttribute("title") || "",
      level: parseInt(sec.getAttribute("level") || "1", 10),
    });
  }

  const leafEls = getElementsByTagName(doc, "leaf");
  for (const leaf of leafEls) {
    sections.push({
      id: leaf.getAttribute("id") || "",
      number: leaf.getAttribute("number") || "",
      title: leaf.getAttribute("title") || "",
      level: 0, 
    });
  }

  return sections;
}

export function getImagesDir(docId: string): string {
  return path.join(requireDocsRoot(), docId, "images");
}

export function writeHotspots(
  docId: string,
  figureHotspots: Record<string, HotspotData[]>
): { success: boolean; backupPath?: string; error?: string } {
  const xmlPath = getXmlPath(docId);
  if (!fs.existsSync(xmlPath)) {
    return { success: false, error: `XML file not found: ${xmlPath}` };
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
  const backupPath = `${xmlPath}.bak.${timestamp}`;
  fs.copyFileSync(xmlPath, backupPath);

  const doc = parseXmlFile(xmlPath);
  const figures = getElementsByTagName(doc, "figure");

  for (const fig of figures) {
    const figId = fig.getAttribute("id") || "";
    const newHotspots = figureHotspots[figId];
    if (!newHotspots) continue;

    const existingHotspotContainers = getElementsByTagName(fig, "hotspots");
    for (const existing of existingHotspotContainers) {
      fig.removeChild(existing);
    }

    if (newHotspots.length === 0) continue;

    const hotspotsEl = doc.createElement("hotspots");
    for (const hs of newHotspots) {
      const hsEl = doc.createElement("hotspot");
      hsEl.setAttribute("x", String(Math.round(hs.x)));
      hsEl.setAttribute("y", String(Math.round(hs.y)));
      hsEl.setAttribute("w", String(Math.round(hs.w)));
      hsEl.setAttribute("h", String(Math.round(hs.h)));
      hsEl.setAttribute("label", hs.label);
      hsEl.setAttribute("desc", hs.desc);
      hsEl.setAttribute("target", hs.target);
      hotspotsEl.appendChild(hsEl);
    }

    const graphicEls = getElementsByTagName(fig, "graphic");
    if (graphicEls.length > 0) {
      const graphic = graphicEls[0];
      if (graphic.nextSibling) {
        fig.insertBefore(hotspotsEl, graphic.nextSibling);
      } else {
        fig.appendChild(hotspotsEl);
      }
    } else {
      fig.appendChild(hotspotsEl);
    }
  }

  const serializer = new XMLSerializer();
  let xmlStr = serializer.serializeToString(doc);

  if (!xmlStr.startsWith("<?xml")) {
    xmlStr = "<?xml version='1.0' encoding='UTF-8'?>\n" + xmlStr;
  }

  fs.writeFileSync(xmlPath, xmlStr, "utf-8");

  return { success: true, backupPath };
}

export function writeFigureHotspots(
  docId: string,
  figId: string,
  hotspots: HotspotData[]
): { success: boolean; error?: string } {
  const xmlPath = getXmlPath(docId);
  if (!fs.existsSync(xmlPath)) {
    return { success: false, error: `XML file not found: ${xmlPath}` };
  }

  const doc = parseXmlFile(xmlPath);
  const figures = getElementsByTagName(doc, "figure");

  for (const fig of figures) {
    if ((fig.getAttribute("id") || "") !== figId) continue;

    const existingContainers = getElementsByTagName(fig, "hotspots");
    for (const existing of existingContainers) {
      fig.removeChild(existing);
    }

    if (hotspots.length > 0) {
      const hotspotsEl = doc.createElement("hotspots");
      for (const hs of hotspots) {
        const hsEl = doc.createElement("hotspot");
        hsEl.setAttribute("x", String(Math.round(hs.x)));
        hsEl.setAttribute("y", String(Math.round(hs.y)));
        hsEl.setAttribute("w", String(Math.round(hs.w)));
        hsEl.setAttribute("h", String(Math.round(hs.h)));
        hsEl.setAttribute("label", hs.label);
        hsEl.setAttribute("desc", hs.desc);
        hsEl.setAttribute("target", hs.target);
        hotspotsEl.appendChild(hsEl);
      }
      const graphicEls = getElementsByTagName(fig, "graphic");
      if (graphicEls.length > 0 && graphicEls[0].nextSibling) {
        fig.insertBefore(hotspotsEl, graphicEls[0].nextSibling);
      } else {
        fig.appendChild(hotspotsEl);
      }
    }
    break;
  }

  const serializer = new XMLSerializer();
  let xmlStr = serializer.serializeToString(doc);
  if (!xmlStr.startsWith("<?xml")) {
    xmlStr = "<?xml version='1.0' encoding='UTF-8'?>\n" + xmlStr;
  }
  fs.writeFileSync(xmlPath, xmlStr, "utf-8");

  return { success: true };
}

export function removeAllHotspots(
  docId: string
): { success: boolean; error?: string } {
  const xmlPath = getXmlPath(docId);
  if (!fs.existsSync(xmlPath)) {
    return { success: false, error: `XML file not found: ${xmlPath}` };
  }

  const doc = parseXmlFile(xmlPath);
  const figures = getElementsByTagName(doc, "figure");

  for (const fig of figures) {
    const containers = getElementsByTagName(fig, "hotspots");
    for (const container of containers) {
      fig.removeChild(container);
    }
  }

  const serializer = new XMLSerializer();
  let xmlStr = serializer.serializeToString(doc);
  if (!xmlStr.startsWith("<?xml")) {
    xmlStr = "<?xml version='1.0' encoding='UTF-8'?>\n" + xmlStr;
  }
  fs.writeFileSync(xmlPath, xmlStr, "utf-8");

  return { success: true };
}
