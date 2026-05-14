import { useState, useEffect, useCallback, useRef } from "react";
import { AnimatePresence } from "motion/react";
import { TopBar } from "./components/TopBar";
import { Header, type BreadcrumbEntry } from "./components/Header";
import { LeftPanel } from "./components/LeftPanel";
import { Sidebar } from "./components/Sidebar";
import { ContentArea } from "./components/ContentArea";
import { NotepadDialog } from "./components/NotepadDialog";
import { Dashboard } from "./components/Dashboard";
import { HomeScreen } from "./components/HomeScreen";
import { KnowledgeTreeView } from "./components/KnowledgeTreeView";
import { BookmarksDialog } from "./components/BookmarksDialog";
import { NotesListDialog } from "./components/NotesListDialog";
import { HelpDialog } from "./components/HelpDialog";
import { StatusBar } from "./components/StatusBar";
import { toast } from "sonner";
import { Toaster } from "./components/ui/sonner";
import { useAuth } from "@/context/AuthContext";
import { contentService, type DocumentInfo, type PrepagesInfo } from "@/services/contentService";
import { PrepagesViewer } from "./components/PrepagesViewer";
import { AbbreviationsDialog } from "./components/AbbreviationsDialog";
import { DocumentIndexPage } from "./components/DocumentIndexPage";
import { bookmarkService } from "@/services/bookmarkService";
import { notesService } from "@/services/notesService";
import type { TocItem, TopicContent, Bookmark, Note, SearchResult } from "@/lib/types";
import { activityService, searchHistoryService } from "@/services/activityService";
import { useNetwork } from "@/context/NetworkContext";

export default function App() {
  const { user, logout } = useAuth();
  const { isOnline } = useNetwork();
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [history, setHistory] = useState<string[]>(["Home"]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const [isNotepadOpen, setIsNotepadOpen] = useState(false);
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const [isBookmarksOpen, setIsBookmarksOpen] = useState(false);
  const [isNotesListOpen, setIsNotesListOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isAbbreviationsOpen, setIsAbbreviationsOpen] = useState(false);

  const [prepagesInfo, setPrepagesInfo] = useState<PrepagesInfo | null>(null);
  const [isPrepagesOpen, setIsPrepagesOpen] = useState(false);

  const username = user?.username ?? "";

  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const [currentTopic, setCurrentTopic] = useState<TopicContent | null>(null);
  const [docTitle, setDocTitle] = useState("IETM Viewer");
  const [isContentLoading, setIsContentLoading] = useState(false);
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [documentIndexView, setDocumentIndexView] = useState<{ docId: string; mode: "figures" | "tables" } | null>(null);
  const [knowledgeTreeDocId, setKnowledgeTreeDocId] = useState<string | null>(null);
  const pendingAnchorRef = useRef<string | null>(null);
  const pendingSearchQueryRef = useRef<string | null>(null);
  const pendingMediaXmlIdRef = useRef<string | null>(null);

  const [notes, setNotes] = useState<Note[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [currentNoteContent, setCurrentNoteContent] = useState("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);

  const breadcrumbs: BreadcrumbEntry[] = currentTopic
    ? [
        ...currentTopic.breadcrumbs,
        { id: currentTopic.node.id, title: currentTopic.node.title },
      ]
    : [{ id: 0, title: "Home" }];

  useEffect(() => {
    if (!user) return;

    const loadInitialData = async () => {
      
      const [pagesInfo, docs] = await Promise.all([
        contentService.getPrepages().catch(() => null),
        contentService.getDocuments().catch(() => [] as DocumentInfo[]),
      ]);

      setPrepagesInfo(pagesInfo);

      if (docs.length === 0) return;
      setDocuments(docs);
      setDocTitle("IETM Viewer");

      const allTrees = await Promise.all(
        docs.map(async (doc) => {
          try {
            const tree = await contentService.getToc(doc.doc_id);
            return { doc, tree };
          } catch {
            return { doc, tree: [] as TocItem[] };
          }
        })
      );

      const mergedToc: TocItem[] = allTrees.map(({ doc, tree }) => ({
        id: `doc-${doc.doc_id}`,
        parentId: null,
        title: doc.doc_id.replace(/_/g, " "),
        nodeType: "section" as const,
        level: 0,
        order: 0,
        path: doc.doc_id,
        isDocGroup: true,
        children: [
          {
            id: `index-figures-${doc.doc_id}`,
            parentId: `doc-${doc.doc_id}`,
            title: "List of Figures",
            nodeType: "leaf" as const,
            level: 1,
            order: -2,
            path: `${doc.doc_id}/figures`,
            hasContent: true,
          },
          {
            id: `index-tables-${doc.doc_id}`,
            parentId: `doc-${doc.doc_id}`,
            title: "List of Tables",
            nodeType: "leaf" as const,
            level: 1,
            order: -1,
            path: `${doc.doc_id}/tables`,
            hasContent: true,
          },
          ...tree
        ],
      }));

      if (pagesInfo) {
        mergedToc.unshift({
          id: "__prepages__",
          parentId: null,
          title: pagesInfo.title,
          nodeType: "leaf",
          level: 0,
          order: -1,
          path: "_global/prepages",
          isDocGroup: false,
          hasContent: true,
        } as TocItem);
      }

      setTocItems(mergedToc);
    };

    loadInitialData().catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user) return;

    bookmarkService.list().then(setBookmarks).catch(() => {});
    notesService.list().then(setNotes).catch(() => {});
  }, [user]);

  const [pendingAnchor, setPendingAnchor] = useState<string | null>(null);
  const [pendingSearchQuery, setPendingSearchQuery] = useState<string | null>(null);
  const [pendingMediaXmlId, setPendingMediaXmlId] = useState<string | null>(null);
  useEffect(() => {
    if (!currentTopic) return;
    
    setPendingAnchor(pendingAnchorRef.current);
    pendingAnchorRef.current = null;
    setPendingSearchQuery(pendingSearchQueryRef.current);
    pendingSearchQueryRef.current = null;
    setPendingMediaXmlId(pendingMediaXmlIdRef.current);
    pendingMediaXmlIdRef.current = null;
  }, [currentTopic]);

  const loadTopic = useCallback(async (pk: number, anchorId?: string, query?: string, mediaXmlId?: string) => {
    setIsContentLoading(true);
    if (anchorId) {
      pendingAnchorRef.current = anchorId;
    }
    if (query) {
      pendingSearchQueryRef.current = query;
    }
    if (mediaXmlId) {
      pendingMediaXmlIdRef.current = mediaXmlId;
    }
    setDocumentIndexView(null);
    try {
      const topic = await contentService.getTopic(pk);
      setCurrentTopic(topic);
      activityService.log("navigate_topic", topic.node.title);
      const idStr = String(pk);
      setHistory((prev) => {
        const newHist = [...prev.slice(0, historyIndex + 1), idStr];
        setHistoryIndex(newHist.length - 1);
        return newHist;
      });
    } catch {
      toast.error("Failed to load topic");
    } finally {
      setIsContentLoading(false);
    }
  }, [historyIndex]);

  const handleTocItemClick = useCallback((id: string) => {
    
    if (id.startsWith("doc-")) return;

    if (id === "__prepages__") {
      setIsPrepagesOpen(true);
      return;
    }

    if (id.startsWith("index-figures-")) {
      const docId = id.replace("index-figures-", "");
      setDocumentIndexView({ docId, mode: "figures" });
      setCurrentTopic(null);
      return;
    }
    if (id.startsWith("index-tables-")) {
      const docId = id.replace("index-tables-", "");
      setDocumentIndexView({ docId, mode: "tables" });
      setCurrentTopic(null);
      return;
    }

    loadTopic(Number(id));
  }, [loadTopic]);

  const handleBreadcrumbClick = useCallback((id: number) => {
    loadTopic(id);
  }, [loadTopic]);

  const handleHistoryPrev = () => {
    if (historyIndex > 0) {
      const prevId = history[historyIndex - 1];
      setHistoryIndex(historyIndex - 1);
      if (prevId !== "Home") {
        contentService.getTopic(Number(prevId)).then(setCurrentTopic).catch(() => {});
      } else {
        setCurrentTopic(null);
      }
    }
  };

  const handleHistoryNext = () => {
    if (historyIndex < history.length - 1) {
      const nextId = history[historyIndex + 1];
      setHistoryIndex(historyIndex + 1);
      if (nextId !== "Home") {
        contentService.getTopic(Number(nextId)).then(setCurrentTopic).catch(() => {});
      } else {
        setCurrentTopic(null);
      }
    }
  };

  const handleLogicalPrev = () => {
    if (currentTopic?.prevNode) {
      loadTopic(currentTopic.prevNode.id);
    }
  };

  const handleLogicalNext = () => {
    if (currentTopic?.nextNode) {
      loadTopic(currentTopic.nextNode.id);
    }
  };

  const handleClearSearch = useCallback(() => {
    pendingSearchQueryRef.current = null;
    setPendingSearchQuery(null);
  }, []);

  const handleSearch = async (query: string, mode: string = "text"): Promise<SearchResult[]> => {
    searchHistoryService.record(query);
    return contentService.search(query, mode);
  };

  const handleNotes = () => {
    const topicId = currentTopic ? String(currentTopic.node.id) : "";
    const existingNote = notes.find((n) => n.id === topicId);
    if (existingNote) {
      setCurrentNoteContent(existingNote.content);
      setEditingNoteId(existingNote.id);
    } else {
      setCurrentNoteContent("");
      setEditingNoteId(null);
    }
    setIsNotepadOpen(true);
  };

  const handleSaveNote = async (content: string) => {
    const topicId = currentTopic ? String(currentTopic.node.id) : "general";
    const topicTitle = currentTopic ? currentTopic.node.title : "General Document Note";
    try {
      const saved = await notesService.save(topicId, content, topicTitle);
      setNotes((prev) => {
        const filtered = prev.filter((n) => n.id !== saved.id);
        return [saved, ...filtered];
      });
    } catch {
      toast.error("Failed to save note");
    }
    setEditingNoteId(null);
  };

  const handleDeleteNote = async (id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    try {
      await notesService.remove(id);
      toast.success("Note deleted");
    } catch {
      toast.error("Failed to delete note");
      notesService.list().then(setNotes).catch(() => {});
    }
  };

  const handleEditNote = (id: string) => {
    const note = notes.find((n) => n.id === id);
    if (note) {
      setCurrentNoteContent(note.content);
      setEditingNoteId(id);
      setIsNotesListOpen(false);
      setIsDashboardOpen(false);
      setIsNotepadOpen(true);
    }
  };

  const handleBookmarks = async () => {
    if (!currentTopic) {
      setIsBookmarksOpen(true);
      return;
    }
    const { title, path } = currentTopic.node;
    const exists = bookmarks.find((b) => b.path === path);
    if (exists) {
      toast.info("This page is already bookmarked");
      return;
    }
    try {
      const newBookmark = await bookmarkService.add(title, path);
      setBookmarks((prev) => [newBookmark, ...prev]);
      activityService.log("bookmark_add", title);
      toast.success("Page bookmarked successfully");
    } catch {
      toast.error("Failed to add bookmark");
    }
  };

  const handleDeleteBookmark = async (id: string) => {
    setBookmarks((prev) => prev.filter((b) => b.id !== id));
    try {
      await bookmarkService.remove(id);
      toast.success("Bookmark deleted");
    } catch {
      toast.error("Failed to delete bookmark");
      bookmarkService.list().then(setBookmarks).catch(() => {});
    }
  };

  const handleDashboard = () => setIsDashboardOpen(true);
  const handleHelp = () => setIsHelpOpen(true);

  const handleHome = () => {
    setCurrentTopic(null);
    setDocumentIndexView(null);
    setKnowledgeTreeDocId(null);
    setHistory(["Home"]);
    setHistoryIndex(0);
  };

  const handleDocumentCardClick = (docId: string) => {
    setKnowledgeTreeDocId(docId);
  };

  const handleViewBookmarksFromDashboard = () => {
    setIsDashboardOpen(false);
    setIsBookmarksOpen(true);
  };

  const handleViewNotesFromDashboard = () => {
    setIsDashboardOpen(false);
    setIsNotesListOpen(true);
  };

  const handleLogout = async () => {
    await logout();
  };

  const currentPage = {
    title: currentTopic?.node.title ?? "Home",
    path: currentTopic ? String(currentTopic.node.id) : "home",
  };

  const CLASSIFICATION_ORDER = ["UNCLASSIFIED", "RESTRICTED", "CONFIDENTIAL", "SECRET", "TOP SECRET"];
  const classification = documents.reduce((max, doc) => {
    const c = (doc.classification ?? "UNCLASSIFIED").toUpperCase().trim();
    return CLASSIFICATION_ORDER.indexOf(c) > CLASSIFICATION_ORDER.indexOf(max) ? c : max;
  }, "UNCLASSIFIED");

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <Toaster />
      {!isOnline && (
        <div className="bg-amber-600 text-white text-xs text-center py-1 px-4 shrink-0">
          You are offline — showing cached content. Changes will sync when reconnected.
        </div>
      )}
      <TopBar docTitle={docTitle} username={user?.username} userRole={user?.role} classification={classification} />
      <Header
        breadcrumbs={breadcrumbs}
        onLogicalPrev={handleLogicalPrev}
        onLogicalNext={handleLogicalNext}
        onHistoryPrev={handleHistoryPrev}
        onHistoryNext={handleHistoryNext}
        canGoBack={historyIndex > 0}
        canGoForward={historyIndex < history.length - 1}
        canLogicalPrev={!!currentTopic?.prevNode}
        canLogicalNext={!!currentTopic?.nextNode}
        onBreadcrumbClick={handleBreadcrumbClick}
        onSearch={handleSearch}
        onClearSearch={handleClearSearch}
        onSearchResultClick={(nodeId: number, query?: string, anchorId?: string) => loadTopic(nodeId, anchorId, query)}
      />
      <div className="flex-1 flex overflow-hidden bg-slate-950">
        <LeftPanel
          isSidebarOpen={isSidebarOpen}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          onNotes={handleNotes}
          onBookmarks={handleBookmarks}
          onHelp={handleHelp}
          onDashboard={handleDashboard}
          onHome={handleHome}
          onLogout={handleLogout}
          onAbbreviations={() => setIsAbbreviationsOpen(true)}
          isAdmin={user?.role === "admin"}
        />
        <Sidebar
          isOpen={isSidebarOpen}
          tocItems={tocItems}
          onItemClick={handleTocItemClick}
          activeItemId={currentTopic ? String(currentTopic.node.id) : undefined}
        />
        <AnimatePresence mode="wait">
        {isContentLoading ? (
          <div key="loading" className="flex-1 flex items-center justify-center text-gray-400" style={{ background: "var(--ietm-content-bg)" }}>
            Loading…
          </div>
        ) : documentIndexView ? (
          <DocumentIndexPage
            docId={documentIndexView.docId}
            mode={documentIndexView.mode}
            onNavigate={(nodeId, anchorId) => loadTopic(nodeId, anchorId)}
          />
        ) : currentTopic ? (
          <ContentArea
            blocks={currentTopic.blocks ?? []}
            topicId={currentTopic.node.id}
            onSearchResultClick={(nodeId: number, query?: string) => loadTopic(nodeId, undefined, query)}
            onNavigateWithAnchor={(nodeId, anchorId) => loadTopic(nodeId, anchorId)}
            onHotspotClick={(nodeId, sourceMediaXmlId) => loadTopic(nodeId, undefined, undefined, sourceMediaXmlId)}
            pendingAnchor={pendingAnchor}
            pendingSearchQuery={pendingSearchQuery}
            pendingMediaXmlId={pendingMediaXmlId}
          />
        ) : knowledgeTreeDocId ? (
          <KnowledgeTreeView
            key="tree"
            docId={knowledgeTreeDocId}
            tocItems={tocItems}
            documents={documents}
            onLeafClick={(id) => {
              handleTocItemClick(id);
              setKnowledgeTreeDocId(null);
            }}
            onBack={() => setKnowledgeTreeDocId(null)}
          />
        ) : (
          <HomeScreen
            key="home"
            documents={documents}
            onDocumentClick={handleDocumentCardClick}
            onSearch={handleSearch}
            onSearchResultClick={(nodeId: number, anchorId?: string) => loadTopic(nodeId, anchorId)}
          />
        )}
        </AnimatePresence>
      </div>

      <NotepadDialog
        isOpen={isNotepadOpen}
        onClose={() => {
          setIsNotepadOpen(false);
          setEditingNoteId(null);
        }}
        onSave={handleSaveNote}
        initialContent={currentNoteContent}
        currentTopic={currentPage}
      />

      <Dashboard
        isOpen={isDashboardOpen}
        onClose={() => setIsDashboardOpen(false)}
        username={username}
        bookmarks={bookmarks}
        notes={notes}
        onDeleteBookmark={handleDeleteBookmark}
        onDeleteNote={handleDeleteNote}
        onEditNote={handleEditNote}
        onViewBookmarks={handleViewBookmarksFromDashboard}
        onViewNotes={handleViewNotesFromDashboard}
      />

      <BookmarksDialog
        isOpen={isBookmarksOpen}
        onClose={() => setIsBookmarksOpen(false)}
        bookmarks={bookmarks}
        onDeleteBookmark={handleDeleteBookmark}
      />

      <NotesListDialog
        isOpen={isNotesListOpen}
        onClose={() => setIsNotesListOpen(false)}
        notes={notes}
        onDeleteNote={handleDeleteNote}
        onEditNote={handleEditNote}
      />

      <HelpDialog
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
      />

      {prepagesInfo && (
        <PrepagesViewer
          open={isPrepagesOpen}
          onClose={() => setIsPrepagesOpen(false)}
          url={prepagesInfo.url}
          title={prepagesInfo.title}
        />
      )}

      <AbbreviationsDialog
        open={isAbbreviationsOpen}
        onClose={() => setIsAbbreviationsOpen(false)}
      />

      <StatusBar
        username={user?.username}
        userRole={user?.role}
        currentPage={currentTopic?.pageInfo?.current}
        totalPages={currentTopic?.pageInfo?.total}
      />


    </div>
  );
}
