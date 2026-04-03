/**
 * Client-side re-validation after a document is deleted.
 * Mirrors the backend logic so the UI can update instantly without a round-trip.
 */

import type {
  ShipDocument,
  Order,
  FieldValidation,
  FieldStatus,
  ValidationIssue,
  ValidationResult,
} from "../types";

const WEIGHT_ERROR_PCT = 0.05;
const WEIGHT_WARNING_PCT = 0.01;

export function revalidate(allDocs: ShipDocument[]): ValidationResult {
  if (allDocs.length === 0) {
    return { orders: [], unmatched_documents: [] };
  }

  const { groups, unmatched } = groupDocs(allDocs);
  const orders: Order[] = groups.map(buildOrder);
  return { orders, unmatched_documents: unmatched };
}

// ---------------------------------------------------------------------------
// Grouping (mirrors backend grouper.py)
// ---------------------------------------------------------------------------

function normalizeId(v: string): string {
  return v.replace(/[\s\-./]/g, "").toUpperCase();
}

function groupDocs(docs: ShipDocument[]): {
  groups: ShipDocument[][];
  unmatched: ShipDocument[];
} {
  const groups: ShipDocument[][] = [];
  const noPoNoBol: ShipDocument[] = [];

  // Group by PO
  const poMap = new Map<string, ShipDocument[]>();
  const noPo: ShipDocument[] = [];
  for (const doc of docs) {
    const po = doc.extracted_fields.po_number;
    if (po) {
      const key = normalizeId(po);
      if (!poMap.has(key)) poMap.set(key, []);
      poMap.get(key)!.push(doc);
    } else {
      noPo.push(doc);
    }
  }
  poMap.forEach((g) => groups.push(g));

  // Group remaining by BOL
  const bolMap = new Map<string, ShipDocument[]>();
  for (const doc of noPo) {
    const bol = doc.extracted_fields.bol_number;
    if (bol) {
      const key = normalizeId(bol);
      if (!bolMap.has(key)) bolMap.set(key, []);
      bolMap.get(key)!.push(doc);
    } else {
      noPoNoBol.push(doc);
    }
  }

  // Merge BOL groups into PO groups where BOL matches
  bolMap.forEach((bolDocs, bolKey) => {
    let merged = false;
    for (const group of groups) {
      const groupBols = new Set(
        group
          .map((d) => d.extracted_fields.bol_number)
          .filter(Boolean)
          .map((b) => normalizeId(b!))
      );
      if (groupBols.has(bolKey)) {
        group.push(...bolDocs);
        merged = true;
        break;
      }
    }
    if (!merged) groups.push(bolDocs);
  });

  // Group remaining by container overlap
  const unmatched: ShipDocument[] = [];
  for (const doc of noPoNoBol) {
    const docContainers = new Set(doc.extracted_fields.containers);
    if (docContainers.size === 0) {
      unmatched.push(doc);
      continue;
    }
    let merged = false;
    for (const group of groups) {
      const groupContainers = new Set(group.flatMap((d) => d.extracted_fields.containers));
      if ([...docContainers].some((c) => groupContainers.has(c))) {
        group.push(doc);
        merged = true;
        break;
      }
    }
    if (!merged) groups.push([doc]);
  }

  return { groups, unmatched };
}

// ---------------------------------------------------------------------------
// Order building & validation
// ---------------------------------------------------------------------------

function buildOrder(documents: ShipDocument[]): Order {
  const fieldValidations: FieldValidation[] = [];
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  const stringFields: [keyof ShipDocument["extracted_fields"], string][] = [
    ["po_number", "PO Number"],
    ["bol_number", "BOL Number"],
    ["consignee", "Consignee"],
    ["hs_code", "HS Code"],
  ];

  for (const [field, label] of stringFields) {
    const values: Record<string, string | null> = {};
    for (const d of documents) {
      values[d.id] = d.extracted_fields[field] as string | null;
    }
    const fv = validateStringField(field as string, label, values);
    fieldValidations.push(fv);
    if (fv.status === "error") {
      errors.push({ severity: "error", field: field as string, message: fv.message ?? "", affected_doc_ids: deviatingIds(fv) });
    } else if (fv.status === "warning") {
      warnings.push({ severity: "warning", field: field as string, message: fv.message ?? "", affected_doc_ids: deviatingIds(fv) });
    }
  }

  const weightFields: [keyof ShipDocument["extracted_fields"], keyof ShipDocument["extracted_fields"], string][] = [
    ["net_weight_kg", "net_weight_raw", "Net Weight"],
    ["gross_weight_kg", "gross_weight_raw", "Gross Weight"],
  ];

  for (const [kgField, rawField, label] of weightFields) {
    const kgValues: Record<string, number | null> = {};
    const rawValues: Record<string, string | null> = {};
    for (const d of documents) {
      kgValues[d.id] = d.extracted_fields[kgField] as number | null;
      rawValues[d.id] = d.extracted_fields[rawField] as string | null;
    }
    const { fv, issue } = validateWeightField(kgField as string, label, kgValues, rawValues, documents);
    fieldValidations.push(fv);
    if (issue) {
      if (issue.severity === "error") errors.push(issue);
      else warnings.push(issue);
    }
  }

  // Containers
  const containerFv = validateContainers(documents);
  fieldValidations.push(containerFv);
  if (containerFv.status === "error") {
    errors.push({ severity: "error", field: "containers", message: containerFv.message ?? "", affected_doc_ids: documents.map((d) => d.id) });
  } else if (containerFv.status === "warning") {
    warnings.push({ severity: "warning", field: "containers", message: containerFv.message ?? "", affected_doc_ids: documents.map((d) => d.id) });
  }

  return {
    id: crypto.randomUUID(),
    documents,
    field_validations: fieldValidations,
    errors,
    warnings,
  };
}

function validateStringField(field: string, label: string, values: Record<string, string | null>): FieldValidation {
  const nonNull = Object.entries(values).filter(([, v]) => v != null) as [string, string][];

  if (nonNull.length === 0) {
    return { field, field_label: label, values, consensus: null, status: "missing", message: `${label} not found in any document` };
  }

  const normMap = new Map<string, number>();
  for (const [, v] of nonNull) {
    const n = normalizeId(v);
    normMap.set(n, (normMap.get(n) ?? 0) + 1);
  }
  const [[consensusNorm]] = [...normMap.entries()].sort((a, b) => b[1] - a[1]);
  const consensusRaw = nonNull.find(([, v]) => normalizeId(v) === consensusNorm)?.[1] ?? null;

  const deviating = nonNull.filter(([, v]) => normalizeId(v) !== consensusNorm).map(([id]) => id);
  if (deviating.length > 0) {
    const uniqueVals = [...new Set(nonNull.map(([, v]) => v))].join(", ");
    return { field, field_label: label, values, consensus: consensusRaw, status: "error", message: `${label} differs: ${uniqueVals}` };
  }

  const missing = Object.entries(values).filter(([, v]) => !v).map(([id]) => id);
  if (missing.length > 0) {
    return { field, field_label: label, values, consensus: consensusRaw, status: "warning", message: `${label} missing in some documents` };
  }

  return { field, field_label: label, values, consensus: consensusRaw, status: "ok", message: null };
}

function validateWeightField(
  field: string,
  label: string,
  kgValues: Record<string, number | null>,
  rawValues: Record<string, string | null>,
  docs: ShipDocument[]
): { fv: FieldValidation; issue: ValidationIssue | null } {
  const display: Record<string, string | null> = {};
  for (const id of Object.keys(kgValues)) display[id] = rawValues[id] ?? null;

  const nonNull = Object.entries(kgValues).filter(([, v]) => v != null) as [string, number][];
  if (nonNull.length === 0) {
    return {
      fv: { field, field_label: label, values: display, consensus: null, status: "missing", message: `${label} not found` },
      issue: null,
    };
  }

  const avg = nonNull.reduce((s, [, v]) => s + v, 0) / nonNull.length;
  const errorIds = nonNull.filter(([, v]) => Math.abs(v - avg) / avg > WEIGHT_ERROR_PCT).map(([id]) => id);
  const warnIds = nonNull.filter(([, v]) => Math.abs(v - avg) / avg > WEIGHT_WARNING_PCT && !errorIds.includes(id)).map(([id]) => id);

  const formatKg = (kg: number) => kg >= 1000 ? `${(kg / 1000).toFixed(3)} MT` : `${kg.toFixed(3)} kg`;

  if (errorIds.length > 0) {
    const msg = `${label} major discrepancy (>5%): ` + nonNull.map(([id, v]) => {
      const doc = docs.find((d) => d.id === id);
      return `${doc?.doc_type ?? id}: ${rawValues[id] ?? formatKg(v)}`;
    }).join(" | ");
    return {
      fv: { field, field_label: label, values: display, consensus: formatKg(avg), status: "error", message: msg },
      issue: { severity: "error", field, message: msg, affected_doc_ids: errorIds },
    };
  }

  if (warnIds.length > 0) {
    const msg = `${label} minor difference (rounding)`;
    return {
      fv: { field, field_label: label, values: display, consensus: formatKg(avg), status: "warning", message: msg },
      issue: { severity: "warning", field, message: msg, affected_doc_ids: warnIds },
    };
  }

  const missing = Object.keys(kgValues).filter((id) => kgValues[id] == null);
  const status: FieldStatus = missing.length > 0 ? "warning" : "ok";
  return {
    fv: { field, field_label: label, values: display, consensus: formatKg(avg), status, message: missing.length > 0 ? `${label} missing in some documents` : null },
    issue: null,
  };
}

function validateContainers(docs: ShipDocument[]): FieldValidation {
  const display: Record<string, string | null> = {};
  for (const d of docs) {
    display[d.id] = d.extracted_fields.containers.length > 0 ? d.extracted_fields.containers.join(", ") : null;
  }

  const docsWithContainers = docs.filter((d) => d.extracted_fields.containers.length > 0);
  if (docsWithContainers.length === 0) {
    return { field: "containers", field_label: "Container Numbers", values: display, consensus: null, status: "missing", message: "No container numbers found" };
  }

  const sets = docsWithContainers.map((d) => new Set(d.extracted_fields.containers));
  const union = new Set(sets.flatMap((s) => [...s]));
  const allMatch = sets.every((s) => s.size === union.size && [...s].every((c) => union.has(c)));
  const consensus = [...union].sort().join(", ");

  if (allMatch) {
    return { field: "containers", field_label: "Container Numbers", values: display, consensus, status: "ok", message: null };
  }
  return { field: "containers", field_label: "Container Numbers", values: display, consensus, status: "warning", message: "Container set inconsistent across documents" };
}

function deviatingIds(fv: FieldValidation): string[] {
  if (!fv.consensus) return Object.keys(fv.values);
  const norm = normalizeId(fv.consensus);
  return Object.entries(fv.values)
    .filter(([, v]) => v != null && normalizeId(v!) !== norm)
    .map(([id]) => id);
}
