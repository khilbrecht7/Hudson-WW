import type { DocumentType } from "../types";

const TYPE_COLORS: Record<DocumentType, string> = {
  "Bill of Lading": "bg-blue-100 text-blue-700",
  Invoice: "bg-green-100 text-green-700",
  "Packing List": "bg-purple-100 text-purple-700",
  "Purchase Order": "bg-orange-100 text-orange-700",
  "Certificate of Origin": "bg-teal-100 text-teal-700",
  "Quality Certificate": "bg-pink-100 text-pink-700",
  Unknown: "bg-gray-100 text-gray-500",
};

const TYPE_SHORT: Record<DocumentType, string> = {
  "Bill of Lading": "BOL",
  Invoice: "INV",
  "Packing List": "PKL",
  "Purchase Order": "PO",
  "Certificate of Origin": "COO",
  "Quality Certificate": "QC",
  Unknown: "???",
};

interface Props {
  type: DocumentType;
  full?: boolean;
}

export default function DocumentBadge({ type, full = false }: Props) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TYPE_COLORS[type]}`}>
      {full ? type : TYPE_SHORT[type]}
    </span>
  );
}
