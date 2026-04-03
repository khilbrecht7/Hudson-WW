import type { Order, ShipDocument } from "../types";

export function exportOrdersToCSV(orders: Order[]): void {
  const rows: string[][] = [];

  for (const order of orders) {
    // Header row with document names as columns
    const docLabels = order.documents.map(docLabel);
    const headerRow = ["Field", ...docLabels, "Consensus", "Status", "Notes"];

    rows.push([`--- Order ${order.id.slice(0, 8)} ---`]);
    rows.push(headerRow);

    for (const fv of order.field_validations) {
      const row: string[] = [fv.field_label];
      for (const doc of order.documents) {
        row.push(fv.values[doc.id] ?? "—");
      }
      row.push(fv.consensus ?? "—");
      row.push(fv.status.toUpperCase());
      row.push(fv.message ?? "");
      rows.push(row);
    }

    rows.push([]); // blank separator
  }

  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  downloadCSV(csv, "shipment_validation.csv");
}

function docLabel(doc: ShipDocument): string {
  let label = doc.doc_type;
  if (doc.page_number != null) label += ` (p${doc.page_number})`;
  return label;
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function downloadCSV(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
