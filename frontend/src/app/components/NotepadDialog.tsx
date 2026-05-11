import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { X, Save } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { toast } from "sonner";

interface NotepadDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (content: string) => void;
  initialContent?: string;
  currentTopic: { title: string; path: string };
}

export function NotepadDialog({ isOpen, onClose, onSave, initialContent = "", currentTopic }: NotepadDialogProps) {
  const { t } = useTranslation();
  const [content, setContent] = useState(initialContent);

  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  const handleSave = () => {
    onSave(content);
    toast.success(t("notepad.note_saved"));
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl h-[600px] flex flex-col p-0 border-2 border-green-200 shadow-2xl">
        <DialogHeader className="px-6 py-4 border-b border-green-100 bg-gradient-to-r from-green-50 to-emerald-50">
          <DialogTitle className="text-green-900">{t("notepad.title")}</DialogTitle>
          <DialogDescription className="text-green-700">
            {t("notepad.taking_notes")} <span className="font-semibold">{currentTopic.title}</span>
          </DialogDescription>
        </DialogHeader>
        <div className="flex-1 p-6 overflow-hidden bg-gradient-to-br from-white to-green-50/30">
          <Textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={`${currentTopic.title}...`}
            className="w-full h-full resize-none border-0 focus-visible:ring-0 text-base bg-white/80 backdrop-blur-sm rounded-lg p-4 shadow-inner"
          />
        </div>
        <div className="px-6 py-4 border-t border-green-100 bg-gradient-to-r from-green-50 to-emerald-50 flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleClose}
            className="border-green-300 hover:bg-green-100"
          >
            {t("common.close")}
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            className="gap-2 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 shadow-md"
          >
            <Save className="size-4" />
            {t("notepad.save_note")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
