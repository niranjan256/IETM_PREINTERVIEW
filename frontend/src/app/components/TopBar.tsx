import { useTranslation } from "react-i18next";
import { Globe } from "lucide-react";

const CLASSIFICATION_COLORS: Record<string, string> = {
  UNCLASSIFIED: "#15803d",
  RESTRICTED:   "#1d4ed8",
  CONFIDENTIAL: "#b45309",
  SECRET:       "#b91c1c",
  "TOP SECRET": "#6d28d9",
};

interface TopBarProps {
  docTitle?: string;
  username?: string;
  userRole?: string;
  classification?: string;
}

export function TopBar({ docTitle, username, userRole, classification }: TopBarProps) {
  const { t, i18n } = useTranslation();
  const cls = classification ? classification.toUpperCase().trim() : "UNCLASSIFIED";
  const clsColor = CLASSIFICATION_COLORS[cls] ?? "#374151";

  const toggleLanguage = () => {
    const next = i18n.language === "en" ? "hi" : "en";
    i18n.changeLanguage(next);
    localStorage.setItem("language", next);
  };

  return (
    <div className="flex flex-col shrink-0">
    <div
      className="h-[70px] flex items-center px-6 text-white"
      style={{ background: "var(--ietm-header-bg)" }}
    >
      {}
      <div className="flex items-center gap-3 min-w-[200px]">
        <div
          className="size-9 rounded-lg flex items-center justify-center shadow-md"
          style={{ background: "var(--ietm-header-accent-bg)" }}
        >
          <svg
            className="size-5 text-white"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
            />
          </svg>
        </div>
        <span className="text-base font-semibold tracking-wide whitespace-nowrap">
          {t("topbar.system_name")}
        </span>
      </div>

      {}
      <div className="flex-1 text-center">
        <h1 className="text-lg font-semibold tracking-wide truncate">
          {docTitle || t("topbar.doc_title_fallback")}
        </h1>
      </div>

      {}
      <div className="flex items-center gap-3 min-w-[200px] justify-end">
        <button
          onClick={toggleLanguage}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-white/90 hover:text-white hover:bg-white/10 transition-colors"
          title={t("language." + (i18n.language === "en" ? "hi" : "en"))}
        >
          <Globe className="size-4" />
          <span>{t("language." + i18n.language)}</span>
        </button>
      {username && (
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-sm font-medium">{username}</p>
            <p className="text-xs capitalize" style={{ color: "var(--ietm-text-muted)" }}>
              {userRole}
            </p>
          </div>
          <div
            className="size-9 rounded-full flex items-center justify-center text-white font-semibold text-sm border"
            style={{ background: "var(--ietm-header-accent-bg)", borderColor: "var(--ietm-avatar-border)" }}
          >
            {username[0]?.toUpperCase() ?? "U"}
          </div>
        </div>
      )}
      </div>
    </div>
    {}
    <div
      style={{
        background: clsColor,
        color: "#fff",
        fontSize: "11px",
        fontWeight: 700,
        letterSpacing: "0.12em",
        textAlign: "center",
        padding: "3px 0",
        userSelect: "none",
      }}
    >
      ▲ {cls} ▲
    </div>
    </div>
  );
}
