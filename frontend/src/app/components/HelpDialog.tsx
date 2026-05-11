import { X, HelpCircle, Keyboard } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";

interface HelpDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HelpDialog({ isOpen, onClose }: HelpDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0 border-2 border-indigo-200 shadow-2xl">
        <DialogHeader className="px-6 py-4 border-b border-indigo-100 bg-gradient-to-r from-indigo-50 to-blue-50">
          <DialogTitle className="flex items-center gap-2 text-indigo-900">
            <HelpCircle className="size-5" />
            💡 Help & Documentation
          </DialogTitle>
          <DialogDescription className="text-indigo-700">Learn how to use the application</DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-y-auto bg-gradient-to-b from-white to-indigo-50/30">
          <div className="p-6 space-y-6">
            <section className="bg-gradient-to-r from-indigo-50 to-blue-50 p-6 rounded-2xl border border-indigo-200">
              <h3 className="text-lg font-semibold text-indigo-900 mb-3">Welcome to Offline Documentation Viewer</h3>
              <p className="text-gray-700 leading-relaxed">
                This application allows you to browse documentation completely offline. All features work without an internet connection.
              </p>
            </section>

            <section className="bg-white p-6 rounded-2xl border-2 border-gray-200 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <span className="text-2xl">🧭</span>
                Navigation
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-3 border-b border-gray-100 hover:bg-gray-50 px-3 rounded-lg transition-colors">
                  <span className="text-gray-600 font-medium">History Previous/Next</span>
                  <span className="text-gray-800">Navigate through browsing history</span>
                </div>
                <div className="flex justify-between py-3 border-b border-gray-100 hover:bg-gray-50 px-3 rounded-lg transition-colors">
                  <span className="text-gray-600 font-medium">Logical Previous/Next</span>
                  <span className="text-gray-800">Navigate through document structure</span>
                </div>
                <div className="flex justify-between py-3 border-b border-gray-100 hover:bg-gray-50 px-3 rounded-lg transition-colors">
                  <span className="text-gray-600 font-medium">Home</span>
                  <span className="text-gray-800">Return to the home page</span>
                </div>
                <div className="flex justify-between py-3 hover:bg-gray-50 px-3 rounded-lg transition-colors">
                  <span className="text-gray-600 font-medium">Breadcrumbs</span>
                  <span className="text-gray-800">Shows current location in hierarchy</span>
                </div>
              </div>
            </section>

            <section className="bg-white p-6 rounded-2xl border-2 border-gray-200 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <span className="text-2xl">✨</span>
                Features
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-3 border-b border-gray-100 hover:bg-blue-50 px-3 rounded-lg transition-colors">
                  <span className="text-gray-600 font-medium">📊 Dashboard</span>
                  <span className="text-gray-800">View your bookmarks and notes</span>
                </div>
                <div className="flex justify-between py-3 border-b border-gray-100 hover:bg-green-50 px-3 rounded-lg transition-colors">
                  <span className="text-gray-600 font-medium">📝 Notes</span>
                  <span className="text-gray-800">Take and save personal notes</span>
                </div>
                <div className="flex justify-between py-3 border-b border-gray-100 hover:bg-amber-50 px-3 rounded-lg transition-colors">
                  <span className="text-gray-600 font-medium">🔖 Bookmarks</span>
                  <span className="text-gray-800">Save important pages for quick access</span>
                </div>
                <div className="flex justify-between py-3 border-b border-gray-100 hover:bg-purple-50 px-3 rounded-lg transition-colors">
                  <span className="text-gray-600 font-medium">📑 Table of Contents</span>
                  <span className="text-gray-800">Browse document structure</span>
                </div>
                <div className="flex justify-between py-3 hover:bg-indigo-50 px-3 rounded-lg transition-colors">
                  <span className="text-gray-600 font-medium">🔍 Search</span>
                  <span className="text-gray-800">Find content within documents</span>
                </div>
              </div>
            </section>

            <section className="bg-gradient-to-r from-gray-50 to-slate-50 p-6 rounded-2xl border border-gray-300 shadow-sm">
              <h3 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <Keyboard className="size-5" />
                ⌨️ Keyboard Shortcuts (Coming Soon)
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-3 border-b border-gray-200 px-3">
                  <span className="text-gray-600 font-mono bg-white px-2 py-1 rounded border">Ctrl/Cmd + F</span>
                  <span className="text-gray-800">Search in current page</span>
                </div>
                <div className="flex justify-between py-3 border-b border-gray-200 px-3">
                  <span className="text-gray-600 font-mono bg-white px-2 py-1 rounded border">Ctrl/Cmd + N</span>
                  <span className="text-gray-800">Open notes</span>
                </div>
                <div className="flex justify-between py-3 px-3">
                  <span className="text-gray-600 font-mono bg-white px-2 py-1 rounded border">Ctrl/Cmd + B</span>
                  <span className="text-gray-800">Open bookmarks</span>
                </div>
              </div>
            </section>

            <section className="bg-gradient-to-r from-indigo-50 to-blue-50 p-6 rounded-2xl border border-indigo-200">
              <h3 className="text-lg font-semibold text-indigo-900 mb-3">About</h3>
              <p className="text-gray-700 text-sm leading-relaxed">
                Version 1.0.0 - Offline Documentation Viewer
                <br />
                All data is stored locally in your browser.
              </p>
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}