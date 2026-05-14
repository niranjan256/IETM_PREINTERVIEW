"""Pipeline execution context — accumulates warnings and stats."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List


@dataclass
class PipelineWarning:
    stage: str
    element_index: int
    message: str
    severity: str   # "INFO", "WARNING", "ERROR"


class PipelineContext:
    def __init__(self):
        self.warnings: List[PipelineWarning] = []
        self.stats: dict = {
            "sections": 0,
            "figures":  0,
            "tables":   0,
            "hotspots": 0,
            "xrefs":    0,
        }

    def warn(self, stage: str, index: int, message: str, severity: str = "WARNING") -> None:
        self.warnings.append(PipelineWarning(stage, index, message, severity))

    def print_report(self) -> None:
        line = "-" * 52
        print(f"\n{line}")
        print("  Pipeline Report")
        print(line)
        for key, val in self.stats.items():
            if val:
                print(f"  {key:12s}: {val}")

        by_sev: dict = {}
        for w in self.warnings:
            by_sev.setdefault(w.severity, []).append(w)

        for sev in ("ERROR", "WARNING", "INFO"):
            items = by_sev.get(sev, [])
            if items:
                print(f"\n  {sev}s ({len(items)}):")
                for w in items:
                    # Encode safely for Windows console
                    msg = w.message.encode("ascii", errors="replace").decode("ascii")
                    print(f"    [{w.stage}] {msg}")

        if not self.warnings:
            print("  No warnings.")
        print(f"{line}\n")
