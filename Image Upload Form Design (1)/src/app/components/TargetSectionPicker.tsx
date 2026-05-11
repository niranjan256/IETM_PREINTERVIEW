import { useState, useRef, useEffect } from "react";
import type { SectionInfo } from "../types";

interface TargetSectionPickerProps {
  sections: SectionInfo[];
  value: string;
  onChange: (sectionId: string) => void;
}

export default function TargetSectionPicker({ sections, value, onChange }: TargetSectionPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedSection = sections.find((s) => s.id === value);

  const filtered = sections.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.number.toLowerCase().includes(q) ||
      s.title.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q)
    );
  });

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        value={open ? search : selectedSection ? `${selectedSection.number} — ${selectedSection.title}` : value}
        onChange={(e) => {
          setSearch(e.target.value);
          if (!open) setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          setSearch("");
        }}
        placeholder="Select target section..."
        className="w-full px-2 py-1 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-sm"
      />
      {open && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-full max-h-48 overflow-auto bg-white border border-gray-300 rounded shadow-lg"
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-sm text-gray-400">No sections found</div>
          ) : (
            filtered.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`w-full text-left px-3 py-1.5 text-sm hover:bg-blue-50 ${
                  s.id === value ? "bg-blue-100 font-medium" : ""
                }`}
                onClick={() => {
                  onChange(s.id);
                  setOpen(false);
                  setSearch("");
                }}
              >
                <span className="text-gray-500 mr-2">{s.number}</span>
                {s.title}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
