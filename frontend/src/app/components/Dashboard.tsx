import { X, Bookmark, FileText, Trash2, Check, Palette } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { ScrollArea } from "./ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { useTheme } from "@/context/ThemeContext";

interface DashboardProps {
  isOpen: boolean;
  onClose: () => void;
  username: string;
  bookmarks: Array<{ id: string; title: string; path: string; date: string }>;
  notes: Array<{ id: string; content: string; date: string; topic: string; topicPath: string }>;
  onDeleteBookmark: (id: string) => void;
  onDeleteNote: (id: string) => void;
  onEditNote: (id: string) => void;
  onViewBookmarks: () => void;
  onViewNotes: () => void;
}

export function Dashboard({
  isOpen,
  onClose,
  username,
  bookmarks,
  notes,
  onDeleteBookmark,
  onDeleteNote,
  onEditNote,
  onViewBookmarks,
  onViewNotes,
}: DashboardProps) {
  const { currentTheme, setTheme, themes } = useTheme();

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[85vh] flex flex-col p-0 border-2 border-purple-200 shadow-2xl">
        <DialogHeader className="px-6 py-4 border-b border-purple-100 bg-gradient-to-r from-blue-50 via-purple-50 to-pink-50">
          <DialogTitle className="text-purple-900 text-xl">Dashboard</DialogTitle>
          <DialogDescription className="text-purple-700">View your bookmarks, notes and preferences</DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">
            {}
            <div className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 rounded-2xl p-8 text-white shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -mr-32 -mt-32"></div>
              <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/10 rounded-full -ml-24 -mb-24"></div>
              <div className="relative">
                <h2 className="text-3xl font-bold mb-2">Welcome back, {username}!</h2>
                <p className="text-blue-100">Here's your activity overview</p>
              </div>
            </div>

            {/* Theme Picker */}
            <Card className="border-2 border-indigo-200">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2 text-indigo-900">
                  <div className="p-2 bg-indigo-100 rounded-lg">
                    <Palette className="size-4 text-indigo-600" />
                  </div>
                  Theme
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-4">
                  {themes.map((theme) => {
                    const isActive = currentTheme.id === theme.id;
                    return (
                      <button
                        key={theme.id}
                        onClick={() => setTheme(theme.id)}
                        className="flex flex-col items-center gap-1.5 group"
                      >
                        <div
                          className="relative size-10 rounded-full border-2 transition-all shadow-sm group-hover:scale-110"
                          style={{
                            background: theme.preview,
                            borderColor: isActive ? theme.colors.ring : "transparent",
                            boxShadow: isActive ? `0 0 0 2px ${theme.colors.ring}40` : undefined,
                          }}
                        >
                          {isActive && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <Check className="size-4 text-white drop-shadow" />
                            </div>
                          )}
                        </div>
                        <span
                          className="text-[10px] font-medium max-w-[60px] text-center leading-tight"
                          style={{ color: isActive ? theme.colors.ring : "#64748b" }}
                        >
                          {theme.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-6">
              <Card
                className="cursor-pointer hover:shadow-xl transition-all transform hover:-translate-y-1 border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50"
                onClick={onViewBookmarks}
              >
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2 text-amber-900">
                    <div className="p-2 bg-amber-200 rounded-lg">
                      <Bookmark className="size-4 text-amber-700" />
                    </div>
                    Bookmarks
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-4xl font-bold text-amber-700">{bookmarks.length}</div>
                  <p className="text-sm text-amber-600 mt-2 flex items-center gap-1">
                    Click to view all →
                  </p>
                </CardContent>
              </Card>
              <Card
                className="cursor-pointer hover:shadow-xl transition-all transform hover:-translate-y-1 border-2 border-green-200 bg-gradient-to-br from-green-50 to-emerald-50"
                onClick={onViewNotes}
              >
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2 text-green-900">
                    <div className="p-2 bg-green-200 rounded-lg">
                      <FileText className="size-4 text-green-700" />
                    </div>
                    Notes
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-4xl font-bold text-green-700">{notes.length}</div>
                  <p className="text-sm text-green-600 mt-2 flex items-center gap-1">
                    Click to view all →
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
