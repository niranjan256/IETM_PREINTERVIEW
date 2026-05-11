import { Menu, X, FileText, Bookmark, HelpCircle, LayoutDashboard, Home, LogOut, ShieldCheck, BookA } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Button } from "./ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "./ui/tooltip";

interface LeftPanelProps {
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
  onNotes: () => void;
  onBookmarks: () => void;
  onHelp: () => void;
  onDashboard: () => void;
  onHome: () => void;
  onLogout: () => void;
  onAbbreviations?: () => void;
  isAdmin?: boolean;
}

const iconBtnClass =
  "text-[#ced2d7] hover:text-white w-8 h-8 p-0 rounded-lg transition-all";

export function LeftPanel({
  isSidebarOpen,
  onToggleSidebar,
  onNotes,
  onBookmarks,
  onHelp,
  onDashboard,
  onHome,
  onLogout,
  onAbbreviations,
  isAdmin = false,
}: LeftPanelProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div
      className="w-12 flex flex-col items-center py-4 border-r shadow-xl"
      style={{
        background: "var(--ietm-action-bar-bg)",
        borderColor: "var(--ietm-action-btn-border)",
      }}
    >
      <TooltipProvider>
        {}
        <Tooltip>
          <TooltipTrigger asChild>
            <div>
              <Button
                variant="ghost"
                size="sm"
                onClick={onToggleSidebar}
                className={iconBtnClass}
                style={{ background: "var(--ietm-action-btn-bg)", border: "1px solid var(--ietm-action-btn-border)" }}
              >
                {isSidebarOpen ? <X className="size-4" /> : <Menu className="size-4" />}
              </Button>
            </div>
          </TooltipTrigger>
          <TooltipContent side="right">
            <p>{isSidebarOpen ? t("nav.hide_toc") : t("nav.show_toc")}</p>
          </TooltipContent>
        </Tooltip>

        <div className="flex-1" />

        <div className="flex flex-col gap-2">
          {[
            { icon: Home, label: t("common.home"), onClick: onHome },
            { icon: LayoutDashboard, label: t("common.dashboard"), onClick: onDashboard },
            ...(onAbbreviations
              ? [{ icon: BookA, label: t("common.abbreviations", { defaultValue: "Abbreviations" }), onClick: onAbbreviations }]
              : []),
            { icon: FileText, label: t("common.notes"), onClick: onNotes },
            { icon: Bookmark, label: t("common.bookmarks"), onClick: onBookmarks },
            { icon: HelpCircle, label: t("common.help"), onClick: onHelp },
          ].map(({ icon: Icon, label, onClick }) => (
            <Tooltip key={label}>
              <TooltipTrigger asChild>
                <div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onClick}
                    className={iconBtnClass}
                    style={{ background: "var(--ietm-action-btn-bg)", border: "1px solid var(--ietm-action-btn-border)" }}
                  >
                    <Icon className="size-4" />
                  </Button>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>{label}</p>
              </TooltipContent>
            </Tooltip>
          ))}

          {isAdmin && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate("/admin")}
                    className={iconBtnClass}
                    style={{ background: "var(--ietm-action-btn-bg)", border: "1px solid var(--ietm-action-btn-border)" }}
                  >
                    <ShieldCheck className="size-4" />
                  </Button>
                </div>
              </TooltipTrigger>
              <TooltipContent side="right">
                <p>{t("nav.admin_panel")}</p>
              </TooltipContent>
            </Tooltip>
          )}

          {}
          <div className="w-6 h-px my-1" style={{ background: "var(--ietm-action-btn-border)" }} />

          {}
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onLogout}
                  className="text-[#ef4444] hover:text-white w-8 h-8 p-0 rounded-lg transition-all"
                  style={{ background: "#2d1b1b", border: "1px solid #4a2a2a" }}
                >
                  <LogOut className="size-4" />
                </Button>
              </div>
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>{t("auth.logout")}</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </div>
  );
}
