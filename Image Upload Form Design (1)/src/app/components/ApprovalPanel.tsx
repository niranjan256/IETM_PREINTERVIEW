import type { FigureData, HotspotData } from "../types";

interface ApprovalPanelProps {
  figures: FigureData[];
  workingHotspots: Record<string, HotspotData[]>;
  approvalStatus: Record<string, boolean>;
  onToggleApproval: (figId: string) => void;
  onApproveAll: () => void;
  onWriteToXml: () => void;
  isWriting: boolean;
}

export default function ApprovalPanel({
  figures,
  workingHotspots,
  approvalStatus,
  onToggleApproval,
  onApproveAll,
  onWriteToXml,
  isWriting,
}: ApprovalPanelProps) {
  const figuresWithHotspots = figures.filter(
    (fig) => (workingHotspots[fig.id]?.length ?? 0) > 0
  );

  const allApproved =
    figuresWithHotspots.length > 0 &&
    figuresWithHotspots.every((fig) => approvalStatus[fig.id]);

  return (
    <div className="bg-white rounded-lg shadow-md p-4">
      <h2 className="mb-3 text-gray-800 font-semibold">Approval & Write-back</h2>

      {figuresWithHotspots.length === 0 ? (
        <p className="text-sm text-gray-400">No figures have hotspots yet.</p>
      ) : (
        <>
        <button
          onClick={onApproveAll}
          disabled={allApproved}
          className={`w-full mb-3 py-2 rounded font-medium text-sm transition ${
            allApproved
              ? "bg-green-100 text-green-400 cursor-default"
              : "bg-green-600 text-white hover:bg-green-700"
          }`}
        >
          {allApproved ? "All Approved" : "Approve All Figures"}
        </button>
        <div className="space-y-2 mb-4">
          {figuresWithHotspots.map((fig) => {
            const count = workingHotspots[fig.id]?.length ?? 0;
            const approved = approvalStatus[fig.id] ?? false;
            return (
              <div
                key={fig.id}
                className={`flex items-center justify-between px-3 py-2 rounded border ${
                  approved ? "border-green-300 bg-green-50" : "border-gray-200 bg-gray-50"
                }`}
              >
                <div className="text-sm">
                  <span className="font-medium">Fig {fig.number}</span>
                  <span className="text-gray-500 ml-2">{fig.title}</span>
                  <span className="text-gray-400 ml-2">({count} hotspot{count !== 1 ? "s" : ""})</span>
                </div>
                <button
                  onClick={() => onToggleApproval(fig.id)}
                  className={`px-3 py-1 text-sm rounded transition ${
                    approved
                      ? "bg-green-600 text-white hover:bg-green-700"
                      : "bg-gray-300 text-gray-700 hover:bg-gray-400"
                  }`}
                >
                  {approved ? "Approved" : "Approve"}
                </button>
              </div>
            );
          })}
        </div>
        </>
      )}

      <button
        onClick={onWriteToXml}
        disabled={!allApproved || isWriting}
        className={`w-full py-2 rounded font-medium transition ${
          allApproved && !isWriting
            ? "bg-blue-600 text-white hover:bg-blue-700"
            : "bg-gray-200 text-gray-400 cursor-not-allowed"
        }`}
      >
        {isWriting ? "Writing..." : "Write to XML"}
      </button>

      {!allApproved && figuresWithHotspots.length > 0 && (
        <p className="text-xs text-gray-400 mt-2 text-center">
          Approve all figures with hotspots before writing.
        </p>
      )}
    </div>
  );
}
