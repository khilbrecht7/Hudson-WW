"""Group parsed documents into shipment orders by matching identifiers."""

import uuid
from typing import List
from models import Document, Order, FieldValidation, ValidationIssue


def group_documents(documents: List[Document]) -> tuple[List[List[Document]], List[Document]]:
    """
    Returns (grouped_orders, unmatched_docs).

    Strategy:
    1. Primary grouping: exact PO number match
    2. Secondary grouping: BOL number match within remaining docs
    3. Tertiary: container number overlap
    4. Anything still unassigned → unmatched
    """
    if not documents:
        return [], []

    groups: List[List[Document]] = []
    assigned: set[str] = set()

    # Pass 1: group by PO number
    po_groups: dict[str, List[Document]] = {}
    no_po: List[Document] = []

    for doc in documents:
        po = doc.extracted_fields.po_number
        if po:
            po_groups.setdefault(_normalize_id(po), []).append(doc)
            assigned.add(doc.id)
        else:
            no_po.append(doc)

    groups.extend(po_groups.values())

    # Pass 2: group remaining by BOL number
    bol_groups: dict[str, List[Document]] = {}
    still_unassigned: List[Document] = []

    for doc in no_po:
        bol = doc.extracted_fields.bol_number
        if bol:
            bol_groups.setdefault(_normalize_id(bol), []).append(doc)
        else:
            still_unassigned.append(doc)

    # Merge BOL groups into existing PO groups if BOL matches
    for bol_key, bol_docs in bol_groups.items():
        merged = False
        for group in groups:
            group_bols = {_normalize_id(d.extracted_fields.bol_number) for d in group if d.extracted_fields.bol_number}
            if bol_key in group_bols:
                group.extend(bol_docs)
                merged = True
                break
        if not merged:
            groups.append(bol_docs)

    # Pass 3: group remaining by container overlap
    container_groups: List[List[Document]] = []
    truly_unmatched: List[Document] = []

    for doc in still_unassigned:
        doc_containers = set(doc.extracted_fields.containers)
        if not doc_containers:
            truly_unmatched.append(doc)
            continue

        merged = False
        # Try to join an existing group
        for group in groups + container_groups:
            group_containers: set[str] = set()
            for d in group:
                group_containers.update(d.extracted_fields.containers)
            if doc_containers & group_containers:
                group.append(doc)
                merged = True
                break
        if not merged:
            container_groups.append([doc])

    groups.extend(container_groups)
    return groups, truly_unmatched


def _normalize_id(value: str) -> str:
    """Normalize identifiers for comparison (uppercase, strip punctuation)."""
    import re
    return re.sub(r"[\s\-\.\/]", "", value).upper()
