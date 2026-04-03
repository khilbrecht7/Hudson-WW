"""Validation engine: consensus-based cross-document field validation."""

import uuid
from collections import Counter
from typing import Dict, List, Optional
from models import (
    Document, Order, FieldValidation, ValidationIssue, ExtractedFields
)

# Tolerance thresholds for weight comparison (as fraction of consensus)
WEIGHT_WARNING_PCT = 0.01   # 1%
WEIGHT_ERROR_PCT = 0.05     # 5%


def validate_order(documents: List[Document]) -> Order:
    field_validations: List[FieldValidation] = []
    errors: List[ValidationIssue] = []
    warnings: List[ValidationIssue] = []

    # --- String fields ---
    for field, label in [
        ("po_number", "PO Number"),
        ("bol_number", "BOL Number"),
        ("consignee", "Consignee"),
        ("hs_code", "HS Code"),
    ]:
        values = {d.id: getattr(d.extracted_fields, field) for d in documents}
        fv = _validate_string_field(field, label, values, documents)
        field_validations.append(fv)
        if fv.status == "error":
            errors.append(ValidationIssue(
                severity="error",
                field=field,
                message=fv.message or f"{label} mismatch",
                affected_doc_ids=_deviating_doc_ids(fv),
            ))
        elif fv.status == "warning":
            warnings.append(ValidationIssue(
                severity="warning",
                field=field,
                message=fv.message or f"{label} inconsistency",
                affected_doc_ids=_deviating_doc_ids(fv),
            ))

    # --- Weight fields ---
    for field, raw_field, label in [
        ("net_weight_kg", "net_weight_raw", "Net Weight"),
        ("gross_weight_kg", "gross_weight_raw", "Gross Weight"),
    ]:
        kg_values = {d.id: getattr(d.extracted_fields, field) for d in documents}
        raw_values = {d.id: getattr(d.extracted_fields, raw_field) for d in documents}
        fv, issue = _validate_weight_field(field, label, kg_values, raw_values, documents)
        field_validations.append(fv)
        if issue:
            if issue.severity == "error":
                errors.append(issue)
            else:
                warnings.append(issue)

    # --- Container fields ---
    fv = _validate_containers(documents)
    field_validations.append(fv)
    if fv.status == "error":
        errors.append(ValidationIssue(
            severity="error",
            field="containers",
            message=fv.message or "Container number mismatch",
            affected_doc_ids=[d.id for d in documents],
        ))
    elif fv.status == "warning":
        warnings.append(ValidationIssue(
            severity="warning",
            field="containers",
            message=fv.message or "Container inconsistency",
            affected_doc_ids=[d.id for d in documents],
        ))

    return Order(
        id=str(uuid.uuid4()),
        documents=documents,
        field_validations=field_validations,
        errors=errors,
        warnings=warnings,
    )


# ---------------------------------------------------------------------------
# Field validators
# ---------------------------------------------------------------------------

def _validate_string_field(
    field: str,
    label: str,
    values: Dict[str, Optional[str]],
    documents: List[Document],
) -> FieldValidation:
    display = {doc_id: v for doc_id, v in values.items()}
    non_null = {k: _normalize_str(v) for k, v in values.items() if v}

    if not non_null:
        return FieldValidation(
            field=field,
            field_label=label,
            values=display,
            consensus=None,
            status="missing",
            message=f"{label} not found in any document",
        )

    consensus_norm, count = Counter(non_null.values()).most_common(1)[0]
    consensus_raw = next(v for k, v in values.items() if _normalize_str(v) == consensus_norm)

    deviating = [k for k, v in non_null.items() if v != consensus_norm]

    if deviating:
        unique_vals = sorted(set(values[k] for k in non_null))
        return FieldValidation(
            field=field,
            field_label=label,
            values=display,
            consensus=consensus_raw,
            status="error",
            message=f"{label} differs across documents: {', '.join(str(v) for v in unique_vals)}",
        )

    # Some docs may be missing the field — that's a warning
    missing_docs = [k for k, v in values.items() if not v]
    if missing_docs:
        doc_names = [_doc_name(d) for d in documents if d.id in missing_docs]
        return FieldValidation(
            field=field,
            field_label=label,
            values=display,
            consensus=consensus_raw,
            status="warning",
            message=f"{label} missing in: {', '.join(doc_names)}",
        )

    return FieldValidation(
        field=field,
        field_label=label,
        values=display,
        consensus=consensus_raw,
        status="ok",
        message=None,
    )


def _validate_weight_field(
    field: str,
    label: str,
    kg_values: Dict[str, Optional[float]],
    raw_values: Dict[str, Optional[str]],
    documents: List[Document],
) -> tuple[FieldValidation, Optional[ValidationIssue]]:
    display = {doc_id: raw_values.get(doc_id) for doc_id in kg_values}
    non_null = {k: v for k, v in kg_values.items() if v is not None}

    if not non_null:
        return FieldValidation(
            field=field,
            field_label=label,
            values=display,
            consensus=None,
            status="missing",
            message=f"{label} not found in any document",
        ), None

    # Consensus = median-ish: average of the mode cluster
    vals = sorted(non_null.values())
    consensus_kg = sum(vals) / len(vals)

    # Identify deviations
    error_docs = []
    warning_docs = []
    for doc_id, kg in non_null.items():
        pct = abs(kg - consensus_kg) / consensus_kg if consensus_kg else 0
        if pct > WEIGHT_ERROR_PCT:
            error_docs.append(doc_id)
        elif pct > WEIGHT_WARNING_PCT:
            warning_docs.append(doc_id)

    if error_docs:
        # Build human-readable message
        doc_lines = []
        for d in documents:
            if d.id in non_null:
                raw = raw_values.get(d.id, "")
                doc_lines.append(f"{_doc_name(d)}: {raw}")
        fv = FieldValidation(
            field=field,
            field_label=label,
            values=display,
            consensus=_format_weight(consensus_kg),
            status="error",
            message=f"{label} major discrepancy (>5%): " + " | ".join(doc_lines),
        )
        issue = ValidationIssue(
            severity="error",
            field=field,
            message=fv.message or "",
            affected_doc_ids=error_docs,
        )
        return fv, issue

    if warning_docs:
        doc_lines = []
        for d in documents:
            if d.id in non_null:
                raw = raw_values.get(d.id, "")
                doc_lines.append(f"{_doc_name(d)}: {raw}")
        fv = FieldValidation(
            field=field,
            field_label=label,
            values=display,
            consensus=_format_weight(consensus_kg),
            status="warning",
            message=f"{label} minor difference (rounding): " + " | ".join(doc_lines),
        )
        issue = ValidationIssue(
            severity="warning",
            field=field,
            message=fv.message or "",
            affected_doc_ids=warning_docs,
        )
        return fv, issue

    missing_docs = [k for k in kg_values if k not in non_null]
    status = "warning" if missing_docs else "ok"
    doc_names = [_doc_name(d) for d in documents if d.id in missing_docs]
    message = f"{label} missing in: {', '.join(doc_names)}" if missing_docs else None

    return FieldValidation(
        field=field,
        field_label=label,
        values=display,
        consensus=_format_weight(consensus_kg),
        status=status,
        message=message,
    ), None


def _validate_containers(documents: List[Document]) -> FieldValidation:
    """Check that all docs that have containers agree on the set."""
    docs_with_containers = [d for d in documents if d.extracted_fields.containers]
    display = {
        d.id: ", ".join(d.extracted_fields.containers) if d.extracted_fields.containers else None
        for d in documents
    }

    if not docs_with_containers:
        return FieldValidation(
            field="containers",
            field_label="Container Numbers",
            values=display,
            consensus=None,
            status="missing",
            message="No container numbers found",
        )

    # Build union of all container sets
    all_sets = [frozenset(d.extracted_fields.containers) for d in docs_with_containers]
    union = set().union(*all_sets)
    intersection = all_sets[0].intersection(*all_sets[1:])

    if intersection == union:
        consensus = ", ".join(sorted(union))
        return FieldValidation(
            field="containers",
            field_label="Container Numbers",
            values=display,
            consensus=consensus,
            status="ok",
            message=None,
        )

    # Some containers only appear in some docs
    consensus = ", ".join(sorted(union))
    missing_in = [
        _doc_name(d) for d in docs_with_containers
        if frozenset(d.extracted_fields.containers) != union
    ]
    return FieldValidation(
        field="containers",
        field_label="Container Numbers",
        values=display,
        consensus=consensus,
        status="warning",
        message=f"Container set inconsistent in: {', '.join(missing_in)}",
    )


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

def _normalize_str(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    import re
    return re.sub(r"[\s\-\.\/]", "", value).upper()


def _doc_name(doc: Document) -> str:
    name = doc.filename
    if doc.page_number is not None:
        name += f" (p{doc.page_number})"
    return name


def _format_weight(kg: float) -> str:
    if kg >= 1000:
        return f"{kg / 1000:.3f} MT ({kg:,.0f} kg)"
    return f"{kg:,.3f} kg"


def _deviating_doc_ids(fv: FieldValidation) -> List[str]:
    if not fv.consensus:
        return list(fv.values.keys())
    norm_consensus = _normalize_str(fv.consensus)
    return [doc_id for doc_id, val in fv.values.items() if _normalize_str(val) != norm_consensus and val is not None]
