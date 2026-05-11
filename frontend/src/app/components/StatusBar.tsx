import { useTranslation } from "react-i18next";

interface StatusBarProps {
  username?: string;
  userRole?: string;
  currentPage?: number;
  totalPages?: number;
}

export function StatusBar({ username, userRole, currentPage, totalPages }: StatusBarProps) {
  const { t } = useTranslation();

  return (
    <div
      className="h-8 text-xs flex items-center justify-between px-6 shrink-0 border-t"
      style={{ background: "var(--ietm-status-bar-bg)", borderColor: "var(--ietm-status-bar-border)", color: "var(--ietm-status-bar-text)" }}
    >
      <div className="flex items-center gap-1">
        {t("status.system_status")}{" "}
        <span className="font-semibold" style={{ color: "#16a34a" }}>
          {t("status.optimal")}
        </span>
      </div>
      {username && (
        <div>
          {username}
          {userRole && <span className="capitalize"> ({userRole})</span>}
        </div>
      )}
      {currentPage != null && totalPages != null ? (
        <div>
          {t("common.page")}: <span className="font-semibold">{currentPage}</span> {t("common.of")}{" "}
          <span className="font-semibold">{totalPages}</span>
        </div>
      ) : (
        <div>{t("common.home")}</div>
      )}
    </div>
  );
}
