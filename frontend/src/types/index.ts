export type DocumentType =
  | "Bill of Lading"
  | "Invoice"
  | "Packing List"
  | "Purchase Order"
  | "Certificate of Origin"
  | "Quality Certificate"
  | "Unknown";

export interface ExtractedFields {
  po_number: string | null;
  bol_number: string | null;
  containers: string[];
  net_weight_kg: number | null;
  gross_weight_kg: number | null;
  net_weight_raw: string | null;
  gross_weight_raw: string | null;
  shipper: string | null;
  consignee: string | null;
  invoice_date: string | null;
  shipment_date: string | null;
  hs_code: string | null;
  description: string | null;
  confidence: number;
}

export interface ShipDocument {
  id: string;
  filename: string;
  page_number: number | null;
  doc_type: DocumentType;
  extracted_fields: ExtractedFields;
  confidence_score: number;
  parse_warnings: string[];
}

export type FieldStatus = "ok" | "error" | "warning" | "missing";

export interface FieldValidation {
  field: string;
  field_label: string;
  values: Record<string, string | null>; // doc_id -> display value
  consensus: string | null;
  status: FieldStatus;
  message: string | null;
}

export interface ValidationIssue {
  severity: "error" | "warning";
  field: string;
  message: string;
  affected_doc_ids: string[];
}

export interface Order {
  id: string;
  documents: ShipDocument[];
  field_validations: FieldValidation[];
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface ValidationResult {
  orders: Order[];
  unmatched_documents: ShipDocument[];
}
