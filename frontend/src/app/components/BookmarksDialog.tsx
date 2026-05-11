import { useTranslation } from "react-i18next";
import { X, Bookmark, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";

interface BookmarksDialogProps {
  isOpen: boolean;
  onClose: () => void;
  bookmarks: Array<{ id: string; title: string; path: string; date: string }>;
  onDeleteBookmark: (id: string) => void;
}

export function BookmarksDialog({
  isOpen,
  onClose,
  bookmarks,
  onDeleteBookmark,
}: BookmarksDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 border-2 border-amber-200 shadow-2xl">
        <DialogHeader className="px-6 py-4 border-b border-amber-100 bg-gradient-to-r from-amber-50 to-orange-50">
          <DialogTitle className="flex items-center gap-2 text-amber-900">
            <Bookmark className="size-5" />
            {t("bookmarks_dialog.title")}
          </DialogTitle>
          <DialogDescription className="text-amber-700">{t("bookmarks_dialog.description")}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 overflow-y-auto bg-gradient-to-b from-white to-amber-50/30">
          <div className="py-4 space-y-3">
            {bookmarks.length === 0 ? (
              <p className="text-gray-500 text-center py-12">
                {t("bookmarks_dialog.empty")}
              </p>
            ) : (
              bookmarks.map((bookmark) => (
                <div
                  key={bookmark.id}
                  className="flex items-center justify-between p-4 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl hover:from-amber-100 hover:to-orange-100 transition-all border border-amber-200 shadow-sm"
                >
                  <div className="flex-1">
                    <div className="font-semibold text-amber-900">{bookmark.title}</div>
                    <div className="text-sm text-amber-700 mt-1">{bookmark.path}</div>
                    <div className="text-xs text-amber-600 mt-1">{bookmark.date}</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDeleteBookmark(bookmark.id)}
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
