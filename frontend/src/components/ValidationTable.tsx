import type { Order, FieldStatus } from "../types";
import DocumentBadge from "./DocumentBadge";

interface Props {
  order: Order;
  onDeleteDoc: (docId: string) => void;
}

const STATUS_CELL: Record<FieldStatus, { icon: string; bg: string; text: string }> = {
  ok: { icon: "✓", bg: "bg-green-50", text: "text-green-700" },
  error: { icon: "✗", bg: "bg-red-50", text: "text-red-700" },
  warning: { icon: "⚠", bg: "bg-yellow-50", text: "text-yellow-700" },
  missing: { icon: "—", bg: "bg-gray-50", text: "text-gray-400" },
};

const STATUS_ROW_BG: Record<FieldStatus, string> = {
  ok: "",
  error: "bg-red-50/40",
  warning: "bg-yellow-50/40",
  missing: "",
};

export default function ValidationTable({ order, onDeleteDoc }: Props) {
  const { documents, field_validations } = order;

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="px-4 py-3 text-left font-semibold text-gray-600 w-36">Field</th>
            {documents.map((doc) => (
              <th key={doc.id} className="px-4 py-3 text-center font-semibold text-gray-600 min-w-[120px]">
                <div className="flex flex-col items-center gap-1">
                  <DocumentBadge type={doc.doc_type} />
                  <span className="text-xs text-gray-400 font-normal max-w-[110px] truncate" title={doc.filename}>
                    {doc.filename}
                    {doc.page_number != null ? ` p${doc.page_number}` : ""}
                  </span>
                  <button
                    onClick={() => onDeleteDoc(doc.id)}
                    className="mt-0.5 text-xs text-gray-300 hover:text-red-500 transition-colors"
                    title={`Remove ${doc.filename}`}
                  >
                    Remove
                  </button>
                </div>
              </th>
            ))}
            <th className="px-4 py-3 text-center font-semibold text-gray-600 w-32">Consensus</th>
            <th className="px-4 py-3 text-center font-semibold text-gray-600 w-20">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {field_validations.map((fv) => {
            const s = STATUS_CELL[fv.status];
            return (
              <tr key={fv.field} className={`${STATUS_ROW_BG[fv.status]} transition-colors`}>
                <td className="px-4 py-3 font-medium text-gray-700 whitespace-nowrap">
                  {fv.field_label}
                </td>
                {documents.map((doc) => {
                  const val = fv.values[doc.id];
                  const isDeviating =
                    fv.status === "error" &&
                    val != null &&
                    fv.consensus != null &&
                    normalize(val) !== normalize(fv.consensus);
                  return (
                    <td
                      key={doc.id}
                      className={`px-4 py-3 text-center ${isDeviating ? "text-red-700 font-semibold bg-red-50" : "text-gray-700"}`}
                    >
                      {val ?? <span className="text-gray-300">—</span>}
                    </td>
                  );
                })}
                <td className="px-4 py-3 text-center text-gray-600 font-mono text-xs">
                  {fv.consensus ?? <span className="text-gray-300">—</span>}
                </td>
                <td className={`px-4 py-3 text-center ${s.text}`}>
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${s.bg}`}>
                    {s.icon}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Error / warning callouts */}
      {(order.errors.length > 0 || order.warnings.length > 0) && (
        <div className="border-t border-gray-200 p-4 space-y-2">
          {order.errors.map((e, i) => (
            <div key={i} className="flex gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-800">
              <span className="font-bold shrink-0">ERROR</span>
              <span>{e.message}</span>
            </div>
          ))}
          {order.warnings.map((w, i) => (
            <div key={i} className="flex gap-2 rounded-lg bg-yellow-50 border border-yellow-200 px-4 py-2.5 text-sm text-yellow-800">
              <span className="font-bold shrink-0">WARNING</span>
              <span>{w.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function normalize(v: string): string {
  return v.replace(/[\s\-./]/g, "").toUpperCase();
}

export function StatusBadge({ status, errorCount, warningCount }: { status: "ok" | "issues"; errorCount: number; warningCount: number }) {
  if (status === "ok") {
    return <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">All OK</span>;
  }
  return (
    <span className="inline-flex items-center gap-1">
      {errorCount > 0 && (
        <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">
          {errorCount} error{errorCount !== 1 ? "s" : ""}
        </span>
      )}
      {warningCount > 0 && (
        <span className="inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-semibold text-yellow-700">
          {warningCount} warning{warningCount !== 1 ? "s" : ""}
        </span>
      )}
    </span>
  );
}
