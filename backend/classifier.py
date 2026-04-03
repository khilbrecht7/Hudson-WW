"""Keyword-based document type classifier."""

from models import DocumentType

# Ordered list of (DocumentType, required_keywords, bonus_keywords)
# A document matches the first type where any required keyword is found.
_RULES: list[tuple[DocumentType, list[str], list[str]]] = [
    (
        DocumentType.BOL,
        ["BILL OF LADING", "BILLS OF LADING"],
        ["B/L NO", "B/L NUMBER", "BOL NO", "MASTER B/L", "HOUSE B/L", "SHIPPER'S LOAD"],
    ),
    (
        DocumentType.INVOICE,
        ["COMMERCIAL INVOICE", "PROFORMA INVOICE"],
        ["INVOICE NO", "INVOICE NUMBER", "INVOICE DATE", "TAX INVOICE"],
    ),
    (
        DocumentType.PACKING_LIST,
        ["PACKING LIST", "PACKING DECLARATION"],
        ["PACKAGES", "CARTONS", "GROSS WEIGHT", "NET WEIGHT"],
    ),
    (
        DocumentType.PO,
        ["PURCHASE ORDER"],
        ["P.O. NUMBER", "PO NUMBER", "ORDER NUMBER", "BUYER'S ORDER"],
    ),
    (
        DocumentType.COO,
        ["CERTIFICATE OF ORIGIN", "CERT. OF ORIGIN", "COUNTRY OF ORIGIN"],
        ["FORM A", "GSP", "PREFERENTIAL"],
    ),
    (
        DocumentType.QC,
        [
            "QUALITY CERTIFICATE",
            "TEST CERTIFICATE",
            "INSPECTION CERTIFICATE",
            "MILL CERTIFICATE",
            "MILL TEST REPORT",
        ],
        ["CHEMICAL COMPOSITION", "MECHANICAL PROPERTIES", "HEAT NUMBER"],
    ),
]


def classify(text: str) -> DocumentType:
    upper = text.upper()

    for doc_type, required, _ in _RULES:
        if any(kw in upper for kw in required):
            return doc_type

    # Fallback: try bonus keywords with looser matching
    best_type = DocumentType.UNKNOWN
    best_score = 0
    for doc_type, _, bonus in _RULES:
        score = sum(1 for kw in bonus if kw in upper)
        if score > best_score:
            best_score = score
            best_type = doc_type

    return best_type if best_score >= 2 else DocumentType.UNKNOWN
