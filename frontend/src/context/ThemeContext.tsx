import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export interface ThemePreset {
  id: string;
  name: string;
  preview: string; 
  colors: {
    
    headerBg: string;
    headerAccentBg: string;
    actionBarBg: string;
    actionBtnBg: string;
    actionBtnBorder: string;
    actionBtnHoverBg: string;
    sidebarBg: string;
    sidebarBorder: string;
    sidebarText: string;
    sidebarActiveAccent: string;
    sidebarDocGroupBg: string;
    
    contentBg: string;
    contentText: string;
    contentPanelBg: string;
    mediaBg: string;
    mediaTitleBg: string;
    
    breadcrumbBg: string;
    breadcrumbBorder: string;
    statusBarBg: string;
    statusBarBorder: string;
    statusBarText: string;
    
    searchDropdownBg: string;
    searchDropdownBorder: string;
    searchDropdownText: string;
    
    localSearchBg: string;
    localSearchBorder: string;
    
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    
    ring: string;
    accentColor: string;
    avatarBorder: string;
    
    tableHeaderBg: string;
    tableBorder: string;
    tableRowAltBg: string;
    tableRowHoverBg: string;
    listItemBg: string;
    listItemBorder: string;
  };
}

const THEMES: ThemePreset[] = [
  {
    id: "default-blue",
    name: "Default Blue",
    preview: "#1D3F55",
    colors: {
      headerBg: "#1D3F55",
      headerAccentBg: "#254b69",
      actionBarBg: "#152b3a",
      actionBtnBg: "#1e3a50",
      actionBtnBorder: "#2d4f68",
      actionBtnHoverBg: "#254b69",
      sidebarBg: "#1e293b",
      sidebarBorder: "#334155",
      sidebarText: "#e6eef8",
      sidebarActiveAccent: "rgba(59,130,246,0.2)",
      sidebarDocGroupBg: "#0f172a",
      contentBg: "#edf2f7",
      contentText: "#1a1a1a",
      contentPanelBg: "#ffffff",
      mediaBg: "#f7f9fc",
      mediaTitleBg: "#d8dde4",
      breadcrumbBg: "#e8e8ec",
      breadcrumbBorder: "#d9d9d9",
      statusBarBg: "#e8e8ec",
      statusBarBorder: "#d9d9d9",
      statusBarText: "#475569",
      searchDropdownBg: "#0f172a",
      searchDropdownBorder: "#334155",
      searchDropdownText: "#cbd5e1",
      localSearchBg: "#1f2a38",
      localSearchBorder: "#334155",
      textPrimary: "#ffffff",
      textSecondary: "#ced2d7",
      textMuted: "#94a3b8",
      ring: "#3b82f6",
      accentColor: "#60a5fa",
      avatarBorder: "#3b82f6",
      tableHeaderBg: "#e6edf5",
      tableBorder: "#cbd5e1",
      tableRowAltBg: "#f7f9fc",
      tableRowHoverBg: "#e3f2fd",
      listItemBg: "#ffffff",
      listItemBorder: "#cbd5e1",
    },
  },
  {
    id: "ocean-teal",
    name: "Ocean Teal",
    preview: "#115e59",
    colors: {
      headerBg: "#115e59",
      headerAccentBg: "#1a7a73",
      actionBarBg: "#0d3d3b",
      actionBtnBg: "#14524f",
      actionBtnBorder: "#1f7a76",
      actionBtnHoverBg: "#1a8a85",
      sidebarBg: "#134e4a",
      sidebarBorder: "#1f7a76",
      sidebarText: "#ccfbf1",
      sidebarActiveAccent: "rgba(20,184,166,0.2)",
      sidebarDocGroupBg: "#0d3331",
      contentBg: "#ecfdf5",
      contentText: "#1a1a1a",
      contentPanelBg: "#ffffff",
      mediaBg: "#f0fdfa",
      mediaTitleBg: "#cceee7",
      breadcrumbBg: "#d1fae5",
      breadcrumbBorder: "#a7f3d0",
      statusBarBg: "#d1fae5",
      statusBarBorder: "#a7f3d0",
      statusBarText: "#065f46",
      searchDropdownBg: "#0d3331",
      searchDropdownBorder: "#1f7a76",
      searchDropdownText: "#ccfbf1",
      localSearchBg: "#0d3d3b",
      localSearchBorder: "#1f7a76",
      textPrimary: "#ffffff",
      textSecondary: "#ccfbf1",
      textMuted: "#5eead4",
      ring: "#14b8a6",
      accentColor: "#2dd4bf",
      avatarBorder: "#14b8a6",
      tableHeaderBg: "#ccfbf1",
      tableBorder: "#99f6e4",
      tableRowAltBg: "#f0fdfa",
      tableRowHoverBg: "#ccfbf1",
      listItemBg: "#ffffff",
      listItemBorder: "#99f6e4",
    },
  },
  {
    id: "royal-purple",
    name: "Royal Purple",
    preview: "#4c1d95",
    colors: {
      headerBg: "#4c1d95",
      headerAccentBg: "#5b21b6",
      actionBarBg: "#3b0764",
      actionBtnBg: "#4c1d95",
      actionBtnBorder: "#6d28d9",
      actionBtnHoverBg: "#5b21b6",
      sidebarBg: "#3b0764",
      sidebarBorder: "#6d28d9",
      sidebarText: "#ede9fe",
      sidebarActiveAccent: "rgba(139,92,246,0.2)",
      sidebarDocGroupBg: "#2e0057",
      contentBg: "#f5f3ff",
      contentText: "#1a1a1a",
      contentPanelBg: "#ffffff",
      mediaBg: "#faf5ff",
      mediaTitleBg: "#e0d5f5",
      breadcrumbBg: "#ede9fe",
      breadcrumbBorder: "#ddd6fe",
      statusBarBg: "#ede9fe",
      statusBarBorder: "#ddd6fe",
      statusBarText: "#5b21b6",
      searchDropdownBg: "#2e0057",
      searchDropdownBorder: "#6d28d9",
      searchDropdownText: "#ede9fe",
      localSearchBg: "#3b0764",
      localSearchBorder: "#6d28d9",
      textPrimary: "#ffffff",
      textSecondary: "#e0d5f5",
      textMuted: "#a78bfa",
      ring: "#8b5cf6",
      accentColor: "#a78bfa",
      avatarBorder: "#8b5cf6",
      tableHeaderBg: "#ede9fe",
      tableBorder: "#ddd6fe",
      tableRowAltBg: "#f5f3ff",
      tableRowHoverBg: "#ede9fe",
      listItemBg: "#ffffff",
      listItemBorder: "#ddd6fe",
    },
  },
  {
    id: "forest-green",
    name: "Forest Green",
    preview: "#14532d",
    colors: {
      headerBg: "#14532d",
      headerAccentBg: "#166534",
      actionBarBg: "#0a3520",
      actionBtnBg: "#14532d",
      actionBtnBorder: "#16a34a",
      actionBtnHoverBg: "#166534",
      sidebarBg: "#14532d",
      sidebarBorder: "#16a34a",
      sidebarText: "#dcfce7",
      sidebarActiveAccent: "rgba(34,197,94,0.2)",
      sidebarDocGroupBg: "#0a3520",
      contentBg: "#f0fdf4",
      contentText: "#1a1a1a",
      contentPanelBg: "#ffffff",
      mediaBg: "#f0fdf4",
      mediaTitleBg: "#d1f5d9",
      breadcrumbBg: "#dcfce7",
      breadcrumbBorder: "#bbf7d0",
      statusBarBg: "#dcfce7",
      statusBarBorder: "#bbf7d0",
      statusBarText: "#166534",
      searchDropdownBg: "#0a3520",
      searchDropdownBorder: "#16a34a",
      searchDropdownText: "#dcfce7",
      localSearchBg: "#0a3520",
      localSearchBorder: "#16a34a",
      textPrimary: "#ffffff",
      textSecondary: "#dcfce7",
      textMuted: "#86efac",
      ring: "#22c55e",
      accentColor: "#4ade80",
      avatarBorder: "#22c55e",
      tableHeaderBg: "#dcfce7",
      tableBorder: "#bbf7d0",
      tableRowAltBg: "#f0fdf4",
      tableRowHoverBg: "#dcfce7",
      listItemBg: "#ffffff",
      listItemBorder: "#bbf7d0",
    },
  },
  {
    id: "warm-sunset",
    name: "Warm Sunset",
    preview: "#7c2d12",
    colors: {
      headerBg: "#7c2d12",
      headerAccentBg: "#9a3412",
      actionBarBg: "#5c1d0e",
      actionBtnBg: "#7c2d12",
      actionBtnBorder: "#c2410c",
      actionBtnHoverBg: "#9a3412",
      sidebarBg: "#5c1d0e",
      sidebarBorder: "#c2410c",
      sidebarText: "#ffedd5",
      sidebarActiveAccent: "rgba(249,115,22,0.2)",
      sidebarDocGroupBg: "#431407",
      contentBg: "#fff7ed",
      contentText: "#1a1a1a",
      contentPanelBg: "#ffffff",
      mediaBg: "#fffbf5",
      mediaTitleBg: "#f5dfc8",
      breadcrumbBg: "#ffedd5",
      breadcrumbBorder: "#fed7aa",
      statusBarBg: "#ffedd5",
      statusBarBorder: "#fed7aa",
      statusBarText: "#9a3412",
      searchDropdownBg: "#431407",
      searchDropdownBorder: "#c2410c",
      searchDropdownText: "#ffedd5",
      localSearchBg: "#5c1d0e",
      localSearchBorder: "#c2410c",
      textPrimary: "#ffffff",
      textSecondary: "#ffedd5",
      textMuted: "#fdba74",
      ring: "#f97316",
      accentColor: "#fb923c",
      avatarBorder: "#f97316",
      tableHeaderBg: "#ffedd5",
      tableBorder: "#fed7aa",
      tableRowAltBg: "#fff7ed",
      tableRowHoverBg: "#ffedd5",
      listItemBg: "#ffffff",
      listItemBorder: "#fed7aa",
    },
  },
  {
    id: "midnight",
    name: "Midnight",
    preview: "#0f172a",
    colors: {
      headerBg: "#0f172a",
      headerAccentBg: "#1e293b",
      actionBarBg: "#020617",
      actionBtnBg: "#1e293b",
      actionBtnBorder: "#334155",
      actionBtnHoverBg: "#334155",
      sidebarBg: "#0f172a",
      sidebarBorder: "#1e293b",
      sidebarText: "#cbd5e1",
      sidebarActiveAccent: "rgba(99,102,241,0.2)",
      sidebarDocGroupBg: "#020617",
      contentBg: "#1e293b",
      contentText: "#e2e8f0",
      contentPanelBg: "#1e293b",
      mediaBg: "#0f172a",
      mediaTitleBg: "#1e293b",
      breadcrumbBg: "#0f172a",
      breadcrumbBorder: "#1e293b",
      statusBarBg: "#0f172a",
      statusBarBorder: "#1e293b",
      statusBarText: "#94a3b8",
      searchDropdownBg: "#020617",
      searchDropdownBorder: "#334155",
      searchDropdownText: "#cbd5e1",
      localSearchBg: "#020617",
      localSearchBorder: "#334155",
      textPrimary: "#e2e8f0",
      textSecondary: "#94a3b8",
      textMuted: "#64748b",
      ring: "#6366f1",
      accentColor: "#818cf8",
      avatarBorder: "#6366f1",
      tableHeaderBg: "#334155",
      tableBorder: "#475569",
      tableRowAltBg: "#0f172a",
      tableRowHoverBg: "#334155",
      listItemBg: "#1e293b",
      listItemBorder: "#334155",
    },
  },
  {
    id: "charcoal",
    name: "Charcoal",
    preview: "#27272a",
    colors: {
      headerBg: "#27272a",
      headerAccentBg: "#3f3f46",
      actionBarBg: "#18181b",
      actionBtnBg: "#3f3f46",
      actionBtnBorder: "#52525b",
      actionBtnHoverBg: "#52525b",
      sidebarBg: "#27272a",
      sidebarBorder: "#3f3f46",
      sidebarText: "#d4d4d8",
      sidebarActiveAccent: "rgba(161,161,170,0.2)",
      sidebarDocGroupBg: "#18181b",
      contentBg: "#27272a",
      contentText: "#e4e4e7",
      contentPanelBg: "#3f3f46",
      mediaBg: "#27272a",
      mediaTitleBg: "#3f3f46",
      breadcrumbBg: "#18181b",
      breadcrumbBorder: "#27272a",
      statusBarBg: "#18181b",
      statusBarBorder: "#27272a",
      statusBarText: "#a1a1aa",
      searchDropdownBg: "#18181b",
      searchDropdownBorder: "#52525b",
      searchDropdownText: "#d4d4d8",
      localSearchBg: "#18181b",
      localSearchBorder: "#52525b",
      textPrimary: "#e4e4e7",
      textSecondary: "#a1a1aa",
      textMuted: "#71717a",
      ring: "#a1a1aa",
      accentColor: "#d4d4d8",
      avatarBorder: "#a1a1aa",
      tableHeaderBg: "#3f3f46",
      tableBorder: "#52525b",
      tableRowAltBg: "#18181b",
      tableRowHoverBg: "#3f3f46",
      listItemBg: "#27272a",
      listItemBorder: "#3f3f46",
    },
  },
  {
    id: "rose",
    name: "Rose",
    preview: "#881337",
    colors: {
      headerBg: "#881337",
      headerAccentBg: "#9f1239",
      actionBarBg: "#6b0f2b",
      actionBtnBg: "#881337",
      actionBtnBorder: "#be123c",
      actionBtnHoverBg: "#9f1239",
      sidebarBg: "#6b0f2b",
      sidebarBorder: "#be123c",
      sidebarText: "#ffe4e6",
      sidebarActiveAccent: "rgba(244,63,94,0.2)",
      sidebarDocGroupBg: "#4c0519",
      contentBg: "#fff1f2",
      contentText: "#1a1a1a",
      contentPanelBg: "#ffffff",
      mediaBg: "#fff5f5",
      mediaTitleBg: "#f5d5d8",
      breadcrumbBg: "#ffe4e6",
      breadcrumbBorder: "#fecdd3",
      statusBarBg: "#ffe4e6",
      statusBarBorder: "#fecdd3",
      statusBarText: "#9f1239",
      searchDropdownBg: "#4c0519",
      searchDropdownBorder: "#be123c",
      searchDropdownText: "#ffe4e6",
      localSearchBg: "#6b0f2b",
      localSearchBorder: "#be123c",
      textPrimary: "#ffffff",
      textSecondary: "#ffe4e6",
      textMuted: "#fda4af",
      ring: "#f43f5e",
      accentColor: "#fb7185",
      avatarBorder: "#f43f5e",
      tableHeaderBg: "#ffe4e6",
      tableBorder: "#fecdd3",
      tableRowAltBg: "#fff1f2",
      tableRowHoverBg: "#ffe4e6",
      listItemBg: "#ffffff",
      listItemBorder: "#fecdd3",
    },
  },
];

interface ThemeContextValue {
  currentTheme: ThemePreset;
  setTheme: (id: string) => void;
  themes: ThemePreset[];
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = "ietm-theme";

function applyTheme(theme: ThemePreset) {
  const root = document.documentElement;
  const c = theme.colors;
  root.style.setProperty("--ietm-header-bg", c.headerBg);
  root.style.setProperty("--ietm-header-accent-bg", c.headerAccentBg);
  root.style.setProperty("--ietm-action-bar-bg", c.actionBarBg);
  root.style.setProperty("--ietm-action-btn-bg", c.actionBtnBg);
  root.style.setProperty("--ietm-action-btn-border", c.actionBtnBorder);
  root.style.setProperty("--ietm-action-btn-hover-bg", c.actionBtnHoverBg);
  root.style.setProperty("--ietm-sidebar-bg", c.sidebarBg);
  root.style.setProperty("--ietm-sidebar-border", c.sidebarBorder);
  root.style.setProperty("--ietm-sidebar-text", c.sidebarText);
  root.style.setProperty("--ietm-sidebar-active-accent", c.sidebarActiveAccent);
  root.style.setProperty("--ietm-sidebar-doc-group-bg", c.sidebarDocGroupBg);
  root.style.setProperty("--ietm-content-bg", c.contentBg);
  root.style.setProperty("--ietm-content-text", c.contentText);
  root.style.setProperty("--ietm-content-panel-bg", c.contentPanelBg);
  root.style.setProperty("--ietm-media-bg", c.mediaBg);
  root.style.setProperty("--ietm-media-title-bg", c.mediaTitleBg);
  root.style.setProperty("--ietm-breadcrumb-bg", c.breadcrumbBg);
  root.style.setProperty("--ietm-breadcrumb-border", c.breadcrumbBorder);
  root.style.setProperty("--ietm-status-bar-bg", c.statusBarBg);
  root.style.setProperty("--ietm-status-bar-border", c.statusBarBorder);
  root.style.setProperty("--ietm-status-bar-text", c.statusBarText);
  root.style.setProperty("--ietm-search-dropdown-bg", c.searchDropdownBg);
  root.style.setProperty("--ietm-search-dropdown-border", c.searchDropdownBorder);
  root.style.setProperty("--ietm-search-dropdown-text", c.searchDropdownText);
  root.style.setProperty("--ietm-local-search-bg", c.localSearchBg);
  root.style.setProperty("--ietm-local-search-border", c.localSearchBorder);
  root.style.setProperty("--ietm-text-primary", c.textPrimary);
  root.style.setProperty("--ietm-text-secondary", c.textSecondary);
  root.style.setProperty("--ietm-text-muted", c.textMuted);
  root.style.setProperty("--ietm-ring", c.ring);
  root.style.setProperty("--ietm-accent-color", c.accentColor);
  root.style.setProperty("--ietm-avatar-border", c.avatarBorder);
  root.style.setProperty("--ietm-table-header-bg", c.tableHeaderBg);
  root.style.setProperty("--ietm-table-border", c.tableBorder);
  root.style.setProperty("--ietm-table-row-alt-bg", c.tableRowAltBg);
  root.style.setProperty("--ietm-table-row-hover-bg", c.tableRowHoverBg);
  root.style.setProperty("--ietm-list-item-bg", c.listItemBg);
  root.style.setProperty("--ietm-list-item-border", c.listItemBorder);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [currentTheme, setCurrentTheme] = useState<ThemePreset>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    const found = THEMES.find((t) => t.id === saved);
    return found ?? THEMES[0];
  });

  useEffect(() => {
    applyTheme(currentTheme);
  }, [currentTheme]);

  const setTheme = (id: string) => {
    const theme = THEMES.find((t) => t.id === id);
    if (theme) {
      setCurrentTheme(theme);
      localStorage.setItem(STORAGE_KEY, id);
    }
  };

  return (
    <ThemeContext.Provider value={{ currentTheme, setTheme, themes: THEMES }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
