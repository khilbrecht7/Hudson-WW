import { useState, useCallback } from "react";
import type { ValidationResult, ShipDocument } from "./types";
import { validateDocuments } from "./api/client";
import { revalidate } from "./utils/validation";
import { exportOrdersToCSV } from "./utils/export";
import UploadArea from "./components/UploadArea";
import OrderCard from "./components/OrderCard";

type AppStatus = "idle" | "uploading" | "results" | "error";

export default function App() {
  const [status, setStatus] = useState<AppStatus>("idle");
  const [files, setFiles] = useState<File[]>([]);
  const [result, setResult] = useState<ValidationResult | null>(null);
  // Flat list of all extracted docs — source of truth for client-side re-validation
  const [allDocs, setAllDocs] = useState<ShipDocument[]>([]);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const handleFiles = useCallback((incoming: File[]) => {
    setFiles((prev) => {
      const existingNames = new Set(prev.map((f) => f.name));
      const deduped = incoming.filter((f) => !existingNames.has(f.name));
      return [...prev, ...deduped];
    });
  }, []);

  const handleRemoveFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleValidate = useCallback(async () => {
    if (files.length === 0) return;
    setStatus("uploading");
    setErrorMsg("");
    try {
      const res = await validateDocuments(files);
      const flat: ShipDocument[] = [
        ...res.orders.flatMap((o) => o.documents),
        ...res.unmatched_documents,
      ];
      setAllDocs(flat);
      setResult(res);
      setStatus("results");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Unknown error");
      setStatus("error");
    }
  }, [files]);

  const handleDeleteDoc = useCallback(
    (docId: string) => {
      setAllDocs((prev) => {
        const updated = prev.filter((d) => d.id !== docId);
        setResult(revalidate(updated));
        return updated;
      });
    },
    []
  );

  const handleReset = useCallback(() => {
    setStatus("idle");
    setFiles([]);
    setResult(null);
    setAllDocs([]);
    setErrorMsg("");
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShipIcon />
            <span className="font-bold text-gray-900 text-lg">Shipment Validator</span>
          </div>
          {status === "results" && result && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => exportOrdersToCSV(result.orders)}
                className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <DownloadIcon />
                Export CSV
              </button>
              <button
                onClick={handleReset}
                className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                New Upload
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 space-y-8">
        {/* Upload section — always visible when idle or error, collapsed header in results */}
        {(status === "idle" || status === "uploading" || status === "error") && (
          <section className="space-y-4">
            <h1 className="text-2xl font-bold text-gray-900">Upload Documents</h1>
            <p className="text-gray-500 text-sm">
              Upload PDFs of your shipping documents — BOLs, invoices, packing lists, etc.
              The app groups them by shipment and flags any field discrepancies.
            </p>

            <UploadArea
              onFiles={handleFiles}
              existingFiles={files}
              onRemoveFile={handleRemoveFile}
              disabled={status === "uploading"}
            />

            {status === "error" && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                <strong>Error:</strong> {errorMsg}
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={handleValidate}
                disabled={files.length === 0 || status === "uploading"}
                className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {status === "uploading" ? (
                  <span className="flex items-center gap-2">
                    <Spinner />
                    Processing...
                  </span>
                ) : (
                  "Validate Documents"
                )}
              </button>
            </div>
          </section>
        )}

        {/* Results section */}
        {status === "results" && result && (
          <section className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Validation Results</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {result.orders.length} order{result.orders.length !== 1 ? "s" : ""} detected
                  {result.unmatched_documents.length > 0 && ` · ${result.unmatched_documents.length} unmatched document${result.unmatched_documents.length !== 1 ? "s" : ""}`}
                </p>
              </div>
              <SummaryPills result={result} />
            </div>

            {/* Orders */}
            <div className="space-y-5">
              {result.orders.map((order, i) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  orderIndex={i}
                  onDeleteDoc={handleDeleteDoc}
                />
              ))}
            </div>

            {/* Unmatched documents */}
            {result.unmatched_documents.length > 0 && (
              <div className="rounded-2xl border border-yellow-200 bg-yellow-50 p-5">
                <h3 className="font-semibold text-yellow-800 mb-2">
                  Unmatched Documents ({result.unmatched_documents.length})
                </h3>
                <p className="text-sm text-yellow-700 mb-3">
                  These documents couldn't be matched to an order. They may have missing or non-extractable identifiers.
                </p>
                <ul className="space-y-1">
                  {result.unmatched_documents.map((doc) => (
                    <li key={doc.id} className="flex items-center justify-between text-sm text-yellow-800">
                      <span>{doc.filename}{doc.page_number != null ? ` (p${doc.page_number})` : ""} · {doc.doc_type}</span>
                      <button
                        onClick={() => handleDeleteDoc(doc.id)}
                        className="text-yellow-600 hover:text-yellow-800 transition-colors"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}

function SummaryPills({ result }: { result: ValidationResult }) {
  const totalErrors = result.orders.reduce((n, o) => n + o.errors.length, 0);
  const totalWarnings = result.orders.reduce((n, o) => n + o.warnings.length, 0);
  return (
    <div className="flex items-center gap-2">
      {totalErrors === 0 && totalWarnings === 0 ? (
        <span className="rounded-full bg-green-100 px-3 py-1 text-sm font-semibold text-green-700">All Clear</span>
      ) : (
        <>
          {totalErrors > 0 && (
            <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-semibold text-red-700">
              {totalErrors} Error{totalErrors !== 1 ? "s" : ""}
            </span>
          )}
          {totalWarnings > 0 && (
            <span className="rounded-full bg-yellow-100 px-3 py-1 text-sm font-semibold text-yellow-700">
              {totalWarnings} Warning{totalWarnings !== 1 ? "s" : ""}
            </span>
          )}
        </>
      )}
    </div>
  );
}

function ShipIcon() {
  return (
    <svg className="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
