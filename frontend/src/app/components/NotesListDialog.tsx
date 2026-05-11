import { useTranslation } from "react-i18next";
import { FileText, Trash2, Edit } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";

interface NotesListDialogProps {
  isOpen: boolean;
  onClose: () => void;
  notes: Array<{ id: string; content: string; date: string; topic: string; topicPath: string }>;
  onDeleteNote: (id: string) => void;
  onEditNote: (id: string) => void;
}

export function NotesListDialog({
  isOpen,
  onClose,
  notes,
  onDeleteNote,
  onEditNote,
}: NotesListDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 border-2 border-green-200 shadow-2xl">
        <DialogHeader className="px-6 py-4 border-b border-green-100 bg-gradient-to-r from-green-50 to-emerald-50">
          <DialogTitle className="flex items-center gap-2 text-green-900">
            <FileText className="size-5" />
            {t("notes_dialog.title")}
          </DialogTitle>
          <DialogDescription className="text-green-700">{t("notes_dialog.description")}</DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 overflow-y-auto bg-gradient-to-b from-white to-green-50/30">
          <div className="py-4 space-y-3">
            {notes.length === 0 ? (
              <p className="text-gray-500 text-center py-12">
                {t("notes_dialog.empty")}
              </p>
            ) : (
              notes.map((note) => (
                <div
                  key={note.id}
                  className="flex items-start justify-between p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl hover:from-green-100 hover:to-emerald-100 transition-all border border-green-200 shadow-sm"
                >
                  <div className="flex-1">
                    <div className="text-xs font-semibold text-green-700 mb-1 flex items-center gap-1">
                      <span className="inline-block size-1.5 rounded-full bg-green-500"></span>
                      {note.topic}
                    </div>
                    <div className="text-sm text-gray-700 line-clamp-2">{note.content || t("notes_dialog.empty_note")}</div>
                    <div className="text-xs text-green-600 mt-2">{note.date}</div>
                  </div>
                  <div className="flex gap-1 ml-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEditNote(note.id)}
                      className="text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                    >
                      <Edit className="size-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDeleteNote(note.id)}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
