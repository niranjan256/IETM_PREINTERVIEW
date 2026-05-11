import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import {
  contentService,
  type AbbreviationEntry,
} from "@/services/contentService";

interface AbbreviationsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function AbbreviationsDialog({ open, onClose }: AbbreviationsDialogProps) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<AbbreviationEntry[] | null>(null);
  const [title, setTitle] = useState("Abbreviations");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || rows !== null) return;
    contentService
      .getAbbreviations()
      .then((payload) => {
        if (!payload) {
          setError("Abbreviations list has not been registered for this IETM.");
          setRows([]);
          return;
        }
        setTitle(payload.title || "Abbreviations");
        setRows(payload.rows);
      })
      .catch(() => {
        setError("Failed to load abbreviations.");
        setRows([]);
      });
  }, [open, rows]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => r.abbr.toLowerCase().includes(q) || r.full.toLowerCase().includes(q),
    );
  }, [rows, query]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl w-[92vw] h-[80vh] p-0 flex flex-col">
        <DialogHeader className="px-4 py-3 border-b">
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="px-4 py-3 border-b">
          <div className="relative">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("common.search", { defaultValue: "Search" }) + "..."}
              className="pl-9"
            />
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-auto">
          {rows === null ? (
            <div className="flex items-center justify-center h-full text-gray-500 text-sm">
              Loading...
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-full text-gray-500 text-sm p-6 text-center">
              {error}
            </div>
          ) : (
            <Table>
              <TableHeader className="sticky top-0 bg-white z-10">
                <TableRow>
                  <TableHead className="w-40">Abbreviation</TableHead>
                  <TableHead>Full Form</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-center text-gray-500 py-8">
                      No matches
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((r) => (
                    <TableRow key={`${r.abbr}-${r.full}`}>
                      <TableCell className="font-medium">{r.abbr}</TableCell>
                      <TableCell>{r.full}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="px-4 py-2 border-t text-xs text-gray-500">
          {rows ? `${filtered.length} / ${rows.length} entries` : ""}
        </div>
      </DialogContent>
    </Dialog>
  );
}
