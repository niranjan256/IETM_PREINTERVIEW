import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";

interface PrepagesViewerProps {
  open: boolean;
  onClose: () => void;
  url: string;
  title: string;
}

export function PrepagesViewer({ open, onClose, url, title }: PrepagesViewerProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-6xl w-[95vw] h-[90vh] p-0 flex flex-col">
        <DialogHeader className="px-4 py-3 border-b shrink-0">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0">
          <iframe
            src={url}
            title={title}
            className="w-full h-full border-0"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
