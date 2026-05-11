import { useState, useEffect, useCallback } from "react";
import { Toaster, toast } from "sonner";
import FullscreenImageViewer from "./components/FullscreenImageViewer";
import TargetSectionPicker from "./components/TargetSectionPicker";
import ApprovalPanel from "./components/ApprovalPanel";
import { fetchDocuments, fetchFigures, fetchSections, submitHotspots, autoDetectHotspots, aiDetectHotspots, writeFigureHotspots, removeAllHotspots, ocrRegion, getImageUrl, checkDocsRoot, setDocsRoot, getExportZipUrl, checkExpiry } from "./lib/api";
import type { DocumentInfo, FigureData, SectionInfo, HotspotData } from "./types";

export default function App() {
  
  const [docsRootConfigured, setDocsRootConfigured] = useState<boolean | null>(null); 
  const [folderPath, setFolderPath] = useState("");
  const [folderError, setFolderError] = useState("");
  const [settingFolder, setSettingFolder] = useState(false);

  const [expired, setExpired] = useState(false);
  const [expiryDate, setExpiryDate] = useState("");

  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<string>("");

  const [figures, setFigures] = useState<FigureData[]>([]);
  const [sections, setSections] = useState<SectionInfo[]>([]);

  const [workingHotspots, setWorkingHotspots] = useState<Record<string, HotspotData[]>>({});

  const [approvalStatus, setApprovalStatus] = useState<Record<string, boolean>>({});
  const [isWriting, setIsWriting] = useState(false);

  const [fullscreenFigId, setFullscreenFigId] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);

  const [detecting, setDetecting] = useState<Record<string, boolean>>({});
  const [detectingAll, setDetectingAll] = useState(false);

  const [aiDetecting, setAiDetecting] = useState<Record<string, boolean>>({});
  const [aiDetectingAll, setAiDetectingAll] = useState(false);

  const [writingFig, setWritingFig] = useState<Record<string, boolean>>({});

  const [removingAll, setRemovingAll] = useState(false);

  const [removingAllUnmatched, setRemovingAllUnmatched] = useState(false);
  const [removingUnmatched, setRemovingUnmatched] = useState<Record<string, boolean>>({});

  useEffect(() => {
    checkExpiry()
      .then((res) => { setExpired(res.expired); setExpiryDate(res.expiryDate); })
      .catch(() => {});
    checkDocsRoot()
      .then((res) => {
        setDocsRootConfigured(res.configured);
        if (res.configured) {
          fetchDocuments()
            .then(setDocuments)
            .catch((err) => toast.error(`Failed to load documents: ${err.message}`));
        }
      })
      .catch(() => setDocsRootConfigured(false));
  }, []);

  const handleSetFolder = async () => {
    if (!folderPath.trim()) return;
    setSettingFolder(true);
    setFolderError("");
    try {
      await setDocsRoot(folderPath.trim());
      setDocsRootConfigured(true);
      const docs = await fetchDocuments();
      setDocuments(docs);
    } catch (err: any) {
      setFolderError(err.message);
    } finally {
      setSettingFolder(false);
    }
  };

  const loadDocument = useCallback(async (docId: string) => {
    setSelectedDocId(docId);
    setFigures([]);
    setSections([]);
    setWorkingHotspots({});
    setApprovalStatus({});
    if (!docId) return;

    setLoading(true);
    try {
      const [figs, secs] = await Promise.all([fetchFigures(docId), fetchSections(docId)]);
      setFigures(figs);
      setSections(secs);

      const initial: Record<string, HotspotData[]> = {};
      for (const fig of figs) {
        initial[fig.id] = fig.hotspots.length > 0 ? [...fig.hotspots] : [];
      }
      setWorkingHotspots(initial);
    } catch (err: any) {
      toast.error(`Failed to load document: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateHotspot = (figId: string, index: number, updates: Partial<HotspotData>) => {
    setWorkingHotspots((prev) => {
      const copy = { ...prev };
      copy[figId] = [...(copy[figId] || [])];
      copy[figId][index] = { ...copy[figId][index], ...updates };
      return copy;
    });
    setApprovalStatus((prev) => ({ ...prev, [figId]: false }));
  };

  const addHotspot = (figId: string, hotspot?: HotspotData) => {
    setWorkingHotspots((prev) => {
      const copy = { ...prev };
      copy[figId] = [
        ...(copy[figId] || []),
        hotspot || { x: 0, y: 0, w: 0, h: 0, label: "", desc: "", target: "" },
      ];
      return copy;
    });
    setApprovalStatus((prev) => ({ ...prev, [figId]: false }));
  };

  const deleteHotspot = async (figId: string, index: number) => {
    const remaining = (workingHotspots[figId] || []).filter((_, i) => i !== index);
    setWorkingHotspots((prev) => ({ ...prev, [figId]: remaining }));
    setApprovalStatus((prev) => ({ ...prev, [figId]: false }));
    if (selectedDocId) {
      try {
        await writeFigureHotspots(selectedDocId, figId, remaining);
        toast.success("Hotspot deleted.");
      } catch (err: any) {
        toast.error(`Failed to sync deletion to XML: ${err.message}`);
      }
    }
  };

  const toggleApproval = (figId: string) => {
    setApprovalStatus((prev) => ({ ...prev, [figId]: !prev[figId] }));
  };

  const approveAll = () => {
    const updates: Record<string, boolean> = {};
    for (const fig of figures) {
      if ((workingHotspots[fig.id]?.length ?? 0) > 0) {
        updates[fig.id] = true;
      }
    }
    setApprovalStatus((prev) => ({ ...prev, ...updates }));
  };

  const handleVerifyTopics = (figId: string) => {
    const hotspots = workingHotspots[figId] || [];
    const matched = hotspots.filter((hs) => hs.target !== "").length;
    const unmatched = hotspots.length - matched;
    toast.info(`${matched} matched, ${unmatched} unmatched.`);
  };

  const handleVerifyAllTopics = () => {
    let totalMatched = 0;
    let totalUnmatched = 0;
    for (const fig of figures) {
      const hotspots = workingHotspots[fig.id] || [];
      totalMatched += hotspots.filter((hs) => hs.target !== "").length;
      totalUnmatched += hotspots.filter((hs) => hs.target === "").length;
    }
    toast.info(`All figures: ${totalMatched} matched, ${totalUnmatched} unmatched.`);
  };

  const handleWriteToXml = async () => {
    if (!selectedDocId) return;
    setIsWriting(true);
    try {
      
      const figPayload: Record<string, HotspotData[]> = {};
      for (const [figId, hotspots] of Object.entries(workingHotspots)) {
        if (hotspots.length > 0) {
          figPayload[figId] = hotspots;
        }
      }
      const result = await submitHotspots(selectedDocId, { figures: figPayload });
      toast.success(result.message);
      
      const figs = await fetchFigures(selectedDocId);
      setFigures(figs);
    } catch (err: any) {
      toast.error(`Write failed: ${err.message}`);
    } finally {
      setIsWriting(false);
    }
  };

  const handleAutoDetect = async (figId: string) => {
    if (!selectedDocId) return;
    setDetecting((prev) => ({ ...prev, [figId]: true }));
    try {
      const result = await autoDetectHotspots(selectedDocId, figId);
      if (result.hotspots.length === 0) {
        toast.info("No text regions detected on this image.");
        return;
      }
      setWorkingHotspots((prev) => ({ ...prev, [figId]: result.hotspots }));
      setApprovalStatus((prev) => ({ ...prev, [figId]: false }));
      toast.success(`Detected ${result.count} hotspot${result.count !== 1 ? "s" : ""} — review and adjust.`);
    } catch (err: any) {
      toast.error(`Auto-detect failed: ${err.message}`);
    } finally {
      setDetecting((prev) => ({ ...prev, [figId]: false }));
    }
  };

  const handleAutoDetectAll = async () => {
    if (!selectedDocId || figures.length === 0) return;
    setDetectingAll(true);
    let detected = 0;
    for (let i = 0; i < figures.length; i++) {
      const fig = figures[i];
      toast.info(`Detecting figure ${i + 1}/${figures.length}...`, { id: "detect-all-progress" });
      try {
        const result = await autoDetectHotspots(selectedDocId, fig.id);
        if (result.hotspots.length > 0) {
          setWorkingHotspots((prev) => ({ ...prev, [fig.id]: result.hotspots }));
          setApprovalStatus((prev) => ({ ...prev, [fig.id]: false }));
          detected++;
        }
      } catch {
        
      }
    }
    toast.dismiss("detect-all-progress");
    toast.success(`Done — detected hotspots on ${detected} of ${figures.length} figures.`);
    setDetectingAll(false);
  };

  const handleWriteFigure = async (figId: string) => {
    if (!selectedDocId) return;
    setWritingFig((prev) => ({ ...prev, [figId]: true }));
    try {
      await writeFigureHotspots(selectedDocId, figId, workingHotspots[figId] || []);
      toast.success("Hotspots saved to XML.");
    } catch (err: any) {
      toast.error(`Write failed: ${err.message}`);
    } finally {
      setWritingFig((prev) => ({ ...prev, [figId]: false }));
    }
  };

  const handleRemoveAll = async () => {
    if (!selectedDocId) return;
    setRemovingAll(true);
    try {
      await removeAllHotspots(selectedDocId);
      
      const cleared: Record<string, HotspotData[]> = {};
      for (const fig of figures) cleared[fig.id] = [];
      setWorkingHotspots(cleared);
      setApprovalStatus({});
      toast.success("All hotspots removed from document.");
    } catch (err: any) {
      toast.error(`Failed to remove hotspots: ${err.message}`);
    } finally {
      setRemovingAll(false);
    }
  };

  const handleAiDetect = async (figId: string) => {
    if (!selectedDocId) return;
    setAiDetecting((prev) => ({ ...prev, [figId]: true }));
    try {
      const result = await aiDetectHotspots(selectedDocId, figId);
      if (result.hotspots.length === 0) {
        toast.info("No text regions detected on this image.");
        return;
      }
      setWorkingHotspots((prev) => ({ ...prev, [figId]: result.hotspots }));
      setApprovalStatus((prev) => ({ ...prev, [figId]: false }));
      toast.success(`AI detected ${result.count} hotspot${result.count !== 1 ? "s" : ""} — review and adjust.`);
    } catch (err: any) {
      toast.error(`AI Detect failed: ${err.message}`);
    } finally {
      setAiDetecting((prev) => ({ ...prev, [figId]: false }));
    }
  };

  const handleAiDetectAll = async () => {
    if (!selectedDocId || figures.length === 0) return;
    setAiDetectingAll(true);
    let detected = 0;
    for (let i = 0; i < figures.length; i++) {
      const fig = figures[i];
      toast.info(`AI detecting figure ${i + 1}/${figures.length}...`, { id: "ai-detect-all-progress" });
      try {
        const result = await aiDetectHotspots(selectedDocId, fig.id);
        if (result.hotspots.length > 0) {
          setWorkingHotspots((prev) => ({ ...prev, [fig.id]: result.hotspots }));
          setApprovalStatus((prev) => ({ ...prev, [fig.id]: false }));
          detected++;
        }
      } catch {
        
      }
    }
    toast.dismiss("ai-detect-all-progress");
    toast.success(`Done — AI detected hotspots on ${detected} of ${figures.length} figures.`);
    setAiDetectingAll(false);
  };

  const handleRemoveAllUnmatched = async () => {
    if (!selectedDocId) return;
    setRemovingAllUnmatched(true);
    try {
      let totalRemoved = 0;
      const figPayload: Record<string, HotspotData[]> = {};
      const updatedHotspots: Record<string, HotspotData[]> = {};

      for (const fig of figures) {
        const all = workingHotspots[fig.id] || [];
        const matched = all.filter((hs) => hs.target !== "");
        totalRemoved += all.length - matched.length;
        figPayload[fig.id] = matched;
        updatedHotspots[fig.id] = matched;
      }

      await submitHotspots(selectedDocId, { figures: figPayload });
      setWorkingHotspots(updatedHotspots);
      setApprovalStatus({});
      toast.success(`Removed ${totalRemoved} unmatched hotspot${totalRemoved !== 1 ? "s" : ""} across all figures.`);
    } catch (err: any) {
      toast.error(`Failed to remove unmatched: ${err.message}`);
    } finally {
      setRemovingAllUnmatched(false);
    }
  };

  const handleRemoveUnmatched = async (figId: string) => {
    if (!selectedDocId) return;
    setRemovingUnmatched((prev) => ({ ...prev, [figId]: true }));
    try {
      const all = workingHotspots[figId] || [];
      const matched = all.filter((hs) => hs.target !== "");
      const removed = all.length - matched.length;
      setWorkingHotspots((prev) => ({ ...prev, [figId]: matched }));
      setApprovalStatus((prev) => ({ ...prev, [figId]: false }));
      await writeFigureHotspots(selectedDocId, figId, matched);
      toast.success(`Removed ${removed} unmatched hotspot${removed !== 1 ? "s" : ""}.`);
    } catch (err: any) {
      toast.error(`Failed to remove unmatched: ${err.message}`);
    } finally {
      setRemovingUnmatched((prev) => ({ ...prev, [figId]: false }));
    }
  };

  const fullscreenFig = figures.find((f) => f.id === fullscreenFigId);

  if (expired) {
    return (
      <div className="size-full bg-gray-50 flex items-center justify-center">
        <div className="bg-white rounded-lg shadow-lg p-10 max-w-md text-center">
          <h1 className="text-2xl font-bold text-red-600 mb-4">Trial Expired</h1>
          <p className="text-gray-600 mb-2">
            This trial version expired on {new Date(expiryDate).toLocaleDateString()}.
          </p>
          <p className="text-gray-500 text-sm">Contact the developer for a licensed version.</p>
        </div>
      </div>
    );
  }

  if (docsRootConfigured === null) {
    return (
      <div className="size-full bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (!docsRootConfigured) {
    return (
      <div className="size-full bg-gray-50 flex items-center justify-center">
        <Toaster position="top-right" />
        <div className="bg-white rounded-lg shadow-lg p-10 max-w-lg">
          <h1 className="text-2xl font-bold mb-2">IETM Hotspot Editor</h1>
          <p className="text-gray-600 mb-6">
            Enter the path to your <code className="bg-gray-100 px-1 rounded">docs</code> folder
            (generated by the IETM Pipeline).
          </p>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={folderPath}
              onChange={(e) => setFolderPath(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSetFolder()}
              placeholder="C:\path\to\docs"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
            <button
              onClick={handleSetFolder}
              disabled={settingFolder || !folderPath.trim()}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm font-medium disabled:opacity-50"
            >
              {settingFolder ? "Loading..." : "Open"}
            </button>
          </div>
          {folderError && (
            <p className="text-red-600 text-sm">{folderError}</p>
          )}
          <p className="text-xs text-gray-400 mt-4">
            The folder must contain a <code>master.xml</code> file and document subfolders.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="size-full bg-gray-50 overflow-auto">
      <Toaster position="top-right" />
      <div className="max-w-[1800px] mx-auto p-8">
        {}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold">IETM Hotspot Editor</h1>
            <div className="flex gap-2">
              <a
                href={getExportZipUrl()}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm font-medium inline-flex items-center gap-2"
              >
                Export as ZIP
              </a>
              <button
                onClick={() => { setDocsRootConfigured(false); setDocuments([]); setSelectedDocId(""); setFigures([]); }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition text-sm font-medium"
              >
                Change Folder
              </button>
            </div>
          </div>

          {}
          <div className="flex gap-4 items-center mb-4">
            <label className="text-sm font-medium text-gray-700">Document:</label>
            <select
              value={selectedDocId}
              onChange={(e) => loadDocument(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            >
              <option value="">— Select a document —</option>
              {documents.map((doc) => (
                <option key={doc.docId} value={doc.docId}>
                  {doc.docId} — {doc.title}
                </option>
              ))}
            </select>
            {loading && <span className="text-sm text-gray-400">Loading...</span>}
            {selectedDocId && figures.length > 0 && (
              <>
                <button
                  onClick={handleAutoDetectAll}
                  disabled={detectingAll || aiDetectingAll}
                  className={`px-4 py-2 rounded-lg transition text-sm font-medium ${
                    detectingAll
                      ? "bg-amber-300 text-amber-800 cursor-wait"
                      : "bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
                  }`}
                >
                  {detectingAll ? "Detecting All..." : "Auto-Detect All Figures"}
                </button>
                <button
                  onClick={handleAiDetectAll}
                  disabled={aiDetectingAll || detectingAll}
                  className={`px-4 py-2 rounded-lg transition text-sm font-medium ${
                    aiDetectingAll
                      ? "bg-purple-300 text-purple-800 cursor-wait"
                      : "bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
                  }`}
                >
                  {aiDetectingAll ? "AI Detecting All..." : "AI Detect All Figures"}
                </button>
                <button
                  onClick={handleVerifyAllTopics}
                  className="px-4 py-2 rounded-lg transition text-sm font-medium bg-indigo-500 text-white hover:bg-indigo-600"
                >
                  Verify All Topics
                </button>
                <button
                  onClick={handleRemoveAllUnmatched}
                  disabled={removingAllUnmatched}
                  className={`px-4 py-2 rounded-lg transition text-sm font-medium ${
                    removingAllUnmatched
                      ? "bg-orange-300 text-orange-800 cursor-wait"
                      : "bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50"
                  }`}
                >
                  {removingAllUnmatched ? "Removing..." : "Remove All Unmatched"}
                </button>
                <button
                  onClick={handleRemoveAll}
                  disabled={removingAll}
                  className={`px-4 py-2 rounded-lg transition text-sm font-medium ${
                    removingAll
                      ? "bg-red-300 text-red-800 cursor-wait"
                      : "bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                  }`}
                >
                  {removingAll ? "Removing..." : "Remove All Hotspots"}
                </button>
              </>
            )}
          </div>
        </div>

        {}
        {!selectedDocId && (
          <div className="text-center text-gray-500 py-12">
            <p>Select a document to start annotating hotspots.</p>
          </div>
        )}

        {}
        {selectedDocId && figures.length > 0 && (
          <div className="flex gap-6">
            {}
            <div className="flex-1 space-y-8">
              {figures.map((fig) => {
                const hotspots = workingHotspots[fig.id] || [];
                return (
                  <div key={fig.id} className="bg-white rounded-lg shadow-md p-6">
                    <div className="flex gap-6 items-start">
                      {}
                      <div className="flex-shrink-0">
                        <div className="mb-2 text-sm font-medium text-gray-600">
                          Figure {fig.number}: {fig.title}
                        </div>
                        <img
                          src={getImageUrl(selectedDocId, fig.graphicSrc)}
                          alt={fig.title}
                          className="w-[400px] h-[400px] object-contain border border-gray-200 rounded cursor-pointer hover:opacity-80 transition"
                          onClick={() => setFullscreenFigId(fig.id)}
                          onError={(e) => {
                            const t = e.currentTarget;
                            t.style.display = "none";
                            const placeholder = t.nextElementSibling as HTMLElement | null;
                            if (placeholder) placeholder.style.display = "flex";
                          }}
                        />
                        <div
                          style={{ display: "none" }}
                          className="w-[400px] h-[400px] border border-red-200 rounded bg-red-50 flex-col items-center justify-center text-red-400 text-sm text-center p-4"
                        >
                          <span className="text-2xl mb-2">⚠</span>
                          <span>Image not found</span>
                          <span className="text-xs mt-1 text-red-300 break-all">{fig.graphicSrc}</span>
                        </div>
                        <button
                          onClick={() => setFullscreenFigId(fig.id)}
                          className="mt-2 px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 transition text-sm w-full"
                        >
                          Open Fullscreen & Select Regions
                        </button>
                      </div>

                      {}
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-gray-700 font-medium">Hotspots</h3>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleAutoDetect(fig.id)}
                              disabled={detecting[fig.id] || aiDetecting[fig.id]}
                              className={`px-3 py-1 rounded transition text-sm ${
                                detecting[fig.id]
                                  ? "bg-amber-300 text-amber-800 cursor-wait"
                                  : "bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-50"
                              }`}
                            >
                              {detecting[fig.id] ? "Detecting..." : "Auto-Detect"}
                            </button>
                            <button
                              onClick={() => handleAiDetect(fig.id)}
                              disabled={aiDetecting[fig.id] || detecting[fig.id]}
                              className={`px-3 py-1 rounded transition text-sm ${
                                aiDetecting[fig.id]
                                  ? "bg-purple-300 text-purple-800 cursor-wait"
                                  : "bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50"
                              }`}
                            >
                              {aiDetecting[fig.id] ? "AI Detecting..." : "AI Detect"}
                            </button>
                            <button
                              onClick={() => handleWriteFigure(fig.id)}
                              disabled={writingFig[fig.id]}
                              className={`px-3 py-1 rounded transition text-sm ${
                                writingFig[fig.id]
                                  ? "bg-green-300 text-green-800 cursor-wait"
                                  : "bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                              }`}
                            >
                              {writingFig[fig.id] ? "Saving..." : "Write to XML"}
                            </button>
                            <button
                              onClick={() => handleVerifyTopics(fig.id)}
                              disabled={hotspots.length === 0}
                              className="px-3 py-1 bg-indigo-500 text-white rounded hover:bg-indigo-600 transition text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              Verify Topics
                            </button>
                            <button
                              onClick={() => handleRemoveUnmatched(fig.id)}
                              disabled={removingUnmatched[fig.id] || hotspots.filter((h) => !h.target).length === 0}
                              className={`px-3 py-1 rounded transition text-sm ${
                                removingUnmatched[fig.id]
                                  ? "bg-orange-300 text-orange-800 cursor-wait"
                                  : "bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
                              }`}
                            >
                              {removingUnmatched[fig.id] ? "Removing..." : "Remove Unmatched"}
                            </button>
                            <button
                              onClick={() => addHotspot(fig.id)}
                              className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 transition text-sm"
                            >
                              + Add Hotspot
                            </button>
                          </div>
                        </div>

                        {hotspots.length === 0 ? (
                          <p className="text-sm text-gray-400">No hotspots. Draw on the image or add manually.</p>
                        ) : (
                          <div className="space-y-3 max-h-[500px] overflow-y-auto">
                            {hotspots.map((hs, idx) => (
                              <div key={idx} className="border border-gray-200 rounded p-3 bg-gray-50">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-500">Hotspot #{idx + 1}</span>
                                    {hs.target !== ""
                                      ? <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">Matched</span>
                                      : <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">Unmatched</span>
                                    }
                                  </div>
                                  <button
                                    onClick={() => deleteHotspot(fig.id, idx)}
                                    className="text-red-600 hover:text-red-800 text-sm px-2 py-1"
                                  >
                                    Delete
                                  </button>
                                </div>

                                {}
                                <div className="flex items-center gap-2 flex-wrap mb-2">
                                  {(["x", "y", "w", "h"] as const).map((field) => (
                                    <div key={field} className="flex items-center gap-1">
                                      <label className="text-sm text-gray-700">{field} =</label>
                                      <input
                                        type="number"
                                        value={hs[field]}
                                        onChange={(e) =>
                                          updateHotspot(fig.id, idx, { [field]: parseFloat(e.target.value) || 0 })
                                        }
                                        className="w-16 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                                      />
                                    </div>
                                  ))}
                                </div>

                                {}
                                <div className="flex items-center gap-1 mb-2">
                                  <label className="text-sm text-gray-700 w-12">Label</label>
                                  <input
                                    type="text"
                                    value={hs.label}
                                    onChange={(e) => updateHotspot(fig.id, idx, { label: e.target.value })}
                                    className="flex-1 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                                    placeholder="Hotspot label"
                                  />
                                </div>

                                {}
                                <div className="flex items-center gap-1 mb-2">
                                  <label className="text-sm text-gray-700 w-12">Desc</label>
                                  <input
                                    type="text"
                                    value={hs.desc}
                                    onChange={(e) => updateHotspot(fig.id, idx, { desc: e.target.value })}
                                    className="flex-1 px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
                                    placeholder="Description"
                                  />
                                </div>

                                {}
                                <div className="flex items-center gap-1">
                                  <label className="text-sm text-gray-700 w-12">Target</label>
                                  <div className="flex-1">
                                    <TargetSectionPicker
                                      sections={sections}
                                      value={hs.target}
                                      onChange={(id) => updateHotspot(fig.id, idx, { target: id })}
                                    />
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {}
            <div className="w-80 flex-shrink-0 sticky top-8 self-start">
              <ApprovalPanel
                figures={figures}
                workingHotspots={workingHotspots}
                approvalStatus={approvalStatus}
                onToggleApproval={toggleApproval}
                onApproveAll={approveAll}
                onWriteToXml={handleWriteToXml}
                isWriting={isWriting}
              />
            </div>
          </div>
        )}

        {}
        {selectedDocId && !loading && figures.length === 0 && (
          <div className="text-center text-gray-500 py-12">
            <p>No figures found in this document.</p>
          </div>
        )}
      </div>

      {}
      {fullscreenFig && (
        <FullscreenImageViewer
          imageUrl={getImageUrl(selectedDocId, fullscreenFig.graphicSrc)}
          imageName={`Figure ${fullscreenFig.number}: ${fullscreenFig.title}`}
          hotspots={workingHotspots[fullscreenFig.id] || []}
          sections={sections}
          isVerified={true}
          onClose={() => setFullscreenFigId(null)}
          onUpdateHotspot={(index, updates) => updateHotspot(fullscreenFig.id, index, updates)}
          onAddHotspot={(hs) => addHotspot(fullscreenFig.id, hs)}
          onDeleteHotspot={(index) => deleteHotspot(fullscreenFig.id, index)}
          onRegionOcr={(x, y, w, h) =>
            selectedDocId
              ? ocrRegion(selectedDocId, fullscreenFig.id, x, y, w, h)
              : Promise.resolve({ label: "", target: "" })
          }
        />
      )}
    </div>
  );
}
