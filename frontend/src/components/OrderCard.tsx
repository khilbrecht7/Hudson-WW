import { useState } from "react";
import type { Order } from "../types";
import DocumentBadge from "./DocumentBadge";
import ValidationTable, { StatusBadge } from "./ValidationTable";

interface Props {
  order: Order;
  orderIndex: number;
  onDeleteDoc: (docId: string) => void;
}

export default function OrderCard({ order, orderIndex, onDeleteDoc }: Props) {
  const [expanded, setExpanded] = useState(true);

  const hasIssues = order.errors.length > 0 || order.warnings.length > 0;
  const poConsensus = order.field_validations.find((f) => f.field === "po_number")?.consensus;
  const bolConsensus = order.field_validations.find((f) => f.field === "bol_number")?.consensus;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Card header */}
      <div
        className="flex items-center justify-between px-5 py-4 cursor-pointer select-none hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-bold">
            {orderIndex + 1}
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-gray-900 truncate">
              {poConsensus ? `PO: ${poConsensus}` : bolConsensus ? `BOL: ${bolConsensus}` : `Order ${orderIndex + 1}`}
            </p>
            <div className="flex items-center gap-1 mt-0.5 flex-wrap">
              {order.documents.map((doc) => (
                <DocumentBadge key={doc.id} type={doc.doc_type} />
              ))}
              <span className="text-xs text-gray-400">{order.documents.length} document{order.documents.length !== 1 ? "s" : ""}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <StatusBadge
            status={hasIssues ? "issues" : "ok"}
            errorCount={order.errors.length}
            warningCount={order.warnings.length}
          />
          <ChevronIcon expanded={expanded} />
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="px-5 pb-5 border-t border-gray-100">
          {/* Document chips */}
          <div className="py-3 flex flex-wrap gap-2">
            {order.documents.map((doc) => (
              <div key={doc.id} className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm">
                <DocumentBadge type={doc.doc_type} full />
                <span className="text-gray-500 text-xs">{doc.filename}{doc.page_number != null ? ` p${doc.page_number}` : ""}</span>
                {doc.parse_warnings.length > 0 && (
                  <span className="text-yellow-500" title={doc.parse_warnings.join("; ")}>⚠</span>
                )}
              </div>
            ))}
          </div>

          <ValidationTable order={order} onDeleteDoc={onDeleteDoc} />
        </div>
      )}
    </div>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`w-5 h-5 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}
