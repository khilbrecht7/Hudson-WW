"""Field extraction from raw document text using regex patterns."""

import re
import logging
from typing import Optional, Tuple, List
from models import ExtractedFields

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Compiled regex patterns
# ---------------------------------------------------------------------------

_PO_PATTERNS = [
    re.compile(r"(?:P\.?\s*O\.?|Purchase\s+Order)\s*(?:No\.?|Number|#|:)?\s*[:\s]*([A-Z0-9][A-Z0-9\-\/\.]{2,25})", re.I),
    re.compile(r"\bPO[:\s#]+([A-Z0-9][A-Z0-9\-\/\.]{2,25})\b", re.I),
]

_BOL_PATTERNS = [
    re.compile(r"(?:Bill\s+of\s+Lading|Master\s+B/?L|House\s+B/?L|B/?L|BOL)\s*(?:No\.?|Number|#|:)?\s*[:\s]*([A-Z0-9][A-Z0-9\-\/\.]{4,25})", re.I),
]

# ISO container number: 3 owner letters + category letter (U/J/Z) + 6 digits + check digit
_CONTAINER_PATTERN = re.compile(r"\b([A-Z]{3}[UJZ]\s*\d{3}\s*\d{3}\s*\d)\b", re.I)

_WEIGHT_PATTERNS = {
    "net": [
        re.compile(r"Net\s+(?:Weight|Wt\.?)\s*[:\-]?\s*([\d,\.]+)\s*(MT|MTS?|KGS?|KG|LBS?|T\b)?", re.I),
        re.compile(r"N\.?\s*W\.?\s*[:\-]?\s*([\d,\.]+)\s*(MT|MTS?|KGS?|KG|LBS?|T\b)?", re.I),
    ],
    "gross": [
        re.compile(r"Gross\s+(?:Weight|Wt\.?)\s*[:\-]?\s*([\d,\.]+)\s*(MT|MTS?|KGS?|KG|LBS?|T\b)?", re.I),
        re.compile(r"G\.?\s*W\.?\s*[:\-]?\s*([\d,\.]+)\s*(MT|MTS?|KGS?|KG|LBS?|T\b)?", re.I),
    ],
}

_CONSIGNEE_PATTERN = re.compile(r"Consignee\s*[:\-]\s*(.+?)(?:\n|Notify|Shipper|Port|$)", re.I | re.S)
_SHIPPER_PATTERN = re.compile(r"(?:Shipper|Exporter)\s*[:\-]\s*(.+?)(?:\n|Consignee|Notify|$)", re.I | re.S)
_HS_PATTERN = re.compile(r"(?:HS|H\.S\.|Tariff)\s*(?:Code|No\.?)?\s*[:\-]?\s*(\d{4,10})", re.I)

_DATE_PATTERN = re.compile(r"\b(\d{1,2}[\-/\.]\d{1,2}[\-/\.]\d{2,4}|\d{4}[\-/\.]\d{2}[\-/\.]\d{2})\b")


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def extract_fields(text: str) -> ExtractedFields:
    po = _first_match(_PO_PATTERNS, text)
    bol = _first_match(_BOL_PATTERNS, text)
    containers = _extract_containers(text)
    net_kg, net_raw = _extract_weight(text, "net")
    gross_kg, gross_raw = _extract_weight(text, "gross")
    consignee = _extract_party(_CONSIGNEE_PATTERN, text)
    shipper = _extract_party(_SHIPPER_PATTERN, text)
    hs = _extract_hs(text)
    dates = _DATE_PATTERN.findall(text)

    confidence = _estimate_confidence(po, bol, net_kg, gross_kg, containers)

    return ExtractedFields(
        po_number=po,
        bol_number=bol,
        containers=containers,
        net_weight_kg=net_kg,
        gross_weight_kg=gross_kg,
        net_weight_raw=net_raw,
        gross_weight_raw=gross_raw,
        shipper=shipper,
        consignee=consignee,
        hs_code=hs,
        invoice_date=dates[0] if dates else None,
        shipment_date=dates[1] if len(dates) > 1 else None,
        confidence=confidence,
    )


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _first_match(patterns: list, text: str) -> Optional[str]:
    for pat in patterns:
        m = pat.search(text)
        if m:
            value = m.group(1).strip().rstrip(".,;")
            if len(value) >= 3:
                return value
    return None


def _extract_containers(text: str) -> List[str]:
    raw = _CONTAINER_PATTERN.findall(text)
    # Deduplicate and normalize
    seen = set()
    result = []
    for r in raw:
        normalized = re.sub(r"\s+", "", r).upper()
        if normalized not in seen:
            seen.add(normalized)
            result.append(normalized)
    return result


def _extract_weight(text: str, kind: str) -> Tuple[Optional[float], Optional[str]]:
    """Returns (weight_in_kg, raw_display_string)."""
    for pat in _WEIGHT_PATTERNS[kind]:
        m = pat.search(text)
        if m:
            raw_val = m.group(1).replace(",", "")
            unit = (m.group(2) or "KG").strip().upper()
            try:
                value = float(raw_val)
            except ValueError:
                continue
            kg = _to_kg(value, unit)
            raw_str = m.group(0).strip()
            return kg, raw_str
    return None, None


def _to_kg(value: float, unit: str) -> float:
    unit = unit.upper().rstrip("S")  # normalize KGS → KG, MTS → MT
    if unit in ("MT", "T"):
        return value * 1000.0
    if unit in ("LB",):
        return value * 0.453592
    return value  # already KG


def _extract_party(pattern: re.Pattern, text: str) -> Optional[str]:
    m = pattern.search(text)
    if not m:
        return None
    raw = m.group(1).strip()
    # Take first non-empty line only
    lines = [ln.strip() for ln in raw.splitlines() if ln.strip()]
    return lines[0][:100] if lines else None


def _extract_hs(text: str) -> Optional[str]:
    m = _HS_PATTERN.search(text)
    return m.group(1) if m else None


def _estimate_confidence(po, bol, net_kg, gross_kg, containers) -> float:
    """Rough confidence score based on how many key fields were found."""
    found = sum([
        po is not None,
        bol is not None,
        net_kg is not None,
        gross_kg is not None,
        len(containers) > 0,
    ])
    return round(found / 5.0, 2)
