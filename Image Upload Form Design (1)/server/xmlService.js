import fs from "fs";
import path from "path";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

// ── Dynamic docs root (set at runtime via API) ─────────────────────────────
let _docsRoot = null;

export function setDocsRoot(p) {
  _docsRoot = path.resolve(p);
}

export function getDocsRoot() {
  return _docsRoot;
}

function requireDocsRoot() {
  if (!_docsRoot) throw new Error("Docs root not configured. Select a docs folder first.");
  return _docsRoot;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function getXmlPath(docId) {
  return path.join(requireDocsRoot(), docId, "ietm_output.xml");
}

function parseXmlFile(filePath) {
  const xml = fs.readFileSync(filePath, "utf-8");
  return new DOMParser().parseFromString(xml, "text/xml");
}

function getElementsByTagName(parent, tag) {
  const doc = parent;
  const els = doc.getElementsByTagName
    ? doc.getElementsByTagName(tag)
    : (parent.ownerDocument || parent).getElementsByTagName(tag);
  const result = [];
  for (let i = 0; i < els.length; i++) {
    result.push(els.item(i));
  }
  return result;
}

// ── Public API ───────────────────────────────────────────────────────────────

export function listDocuments() {
  const masterPath = path.join(requireDocsRoot(), "master.xml");
  if (!fs.existsSync(masterPath)) return [];

  const doc = parseXmlFile(masterPath);
  const manuals = getElementsByTagName(doc, "manual");

  return manuals.map((m) => ({
    docId: m.getAttribute("docId") || "",
    title: m.getAttribute("title") || "",
  }));
}

export function getFigures(docId) {
  const xmlPath = getXmlPath(docId);
  if (!fs.existsSync(xmlPath)) return [];

  const doc = parseXmlFile(xmlPath);
  const figures = getElementsByTagName(doc, "figure");

  return figures.map((fig) => {
    const id = fig.getAttribute("id") || "";
    const number = fig.getAttribute("number") || "";

    // Title
    const titleEls = getElementsByTagName(fig, "title");
    const title = titleEls.length > 0 ? (titleEls[0].textContent || "") : "";

    // Graphic src
    const graphicEls = getElementsByTagName(fig, "graphic");
    const graphicSrc = graphicEls.length > 0
      ? (graphicEls[0].getAttribute("src") || "")
      : "";

    // Hotspots
    const hotspots = [];
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

/**
 * Extract up to maxWords words of plain text from DIRECT <para> and <step>
 * children only — does NOT recurse into child sections, figures, tables, or
 * hotspots. This keeps each section's snippet about its own content only.
 */
function extractSnippet(el, maxWords = 80) {
  const words = [];

  // Only look at direct children of the section/leaf element
  const children = el.childNodes;
  if (!children) return "";

  for (let i = 0; i < children.length; i++) {
    const child = children.item(i);
    if (!child || child.nodeType !== 1) continue;

    const tag = (child.tagName || "").toLowerCase();

    // Only pull text from paragraph and step nodes — ignore everything else
    if (tag !== "para" && tag !== "step") continue;

    // Get text content of this para/step, stripping extra whitespace
    const raw = (child.textContent || "").replace(/\s+/g, " ").trim();
    if (!raw) continue;

    words.push(...raw.split(" ").filter(Boolean));
    if (words.length >= maxWords) break;
  }

  return words.slice(0, maxWords).join(" ");
}

export function getSections(docId) {
  const xmlPath = getXmlPath(docId);
  if (!fs.existsSync(xmlPath)) return [];

  const doc = parseXmlFile(xmlPath);
  const sections = [];

  // Collect <section> elements
  const sectionEls = getElementsByTagName(doc, "section");
  for (const sec of sectionEls) {
    sections.push({
      id: sec.getAttribute("id") || "",
      number: sec.getAttribute("number") || "",
      title: sec.getAttribute("title") || "",
      level: parseInt(sec.getAttribute("level") || "1", 10),
      snippet: extractSnippet(sec),
    });
  }

  // Collect <leaf> elements
  const leafEls = getElementsByTagName(doc, "leaf");
  for (const leaf of leafEls) {
    sections.push({
      id: leaf.getAttribute("id") || "",
      number: leaf.getAttribute("number") || "",
      title: leaf.getAttribute("title") || "",
      level: 0,
      snippet: extractSnippet(leaf),
    });
  }

  return sections;
}

export function getImagesDir(docId) {
  return path.join(requireDocsRoot(), docId, "images");
}

export function writeHotspots(
  docId,
  figureHotspots
) {
  const xmlPath = getXmlPath(docId);
  if (!fs.existsSync(xmlPath)) {
    return { success: false, error: `XML file not found: ${xmlPath}` };
  }

  // Create timestamped backup
  const timestamp = new Date().toISOString().replace(/[:.]/g, "").slice(0, 15);
  const backupPath = `${xmlPath}.bak.${timestamp}`;
  fs.copyFileSync(xmlPath, backupPath);

  // Parse the XML
  const doc = parseXmlFile(xmlPath);
  const figures = getElementsByTagName(doc, "figure");

  for (const fig of figures) {
    const figId = fig.getAttribute("id") || "";
    const newHotspots = figureHotspots[figId];
    if (!newHotspots) continue;

    // Remove existing <hotspots> element(s)
    const existingHotspotContainers = getElementsByTagName(fig, "hotspots");
    for (const existing of existingHotspotContainers) {
      fig.removeChild(existing);
    }

    // Skip if no hotspots to add
    if (newHotspots.length === 0) continue;

    // Create new <hotspots> element
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

    // Insert after <graphic> element (or at end of figure)
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

  // Serialize and write back
  const serializer = new XMLSerializer();
  let xmlStr = serializer.serializeToString(doc);

  // Ensure XML declaration
  if (!xmlStr.startsWith("<?xml")) {
    xmlStr = "<?xml version='1.0' encoding='UTF-8'?>\n" + xmlStr;
  }

  fs.writeFileSync(xmlPath, xmlStr, "utf-8");

  return { success: true, backupPath };
}

/**
 * Write hotspots for a single figure — used for immediate sync on deletion.
 * No backup created (avoids backup spam on every delete).
 */
export function writeFigureHotspots(
  docId,
  figId,
  hotspots
) {
  const xmlPath = getXmlPath(docId);
  if (!fs.existsSync(xmlPath)) {
    return { success: false, error: `XML file not found: ${xmlPath}` };
  }

  const doc = parseXmlFile(xmlPath);
  const figures = getElementsByTagName(doc, "figure");

  for (const fig of figures) {
    if ((fig.getAttribute("id") || "") !== figId) continue;

    // Remove existing <hotspots> element(s)
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

/**
 * Remove all hotspots from every figure in a document in a single XML pass.
 */
export function removeAllHotspots(
  docId
) {
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
