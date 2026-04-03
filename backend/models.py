from enum import Enum
from typing import Optional, List, Dict, Literal
from pydantic import BaseModel


class DocumentType(str, Enum):
    BOL = "Bill of Lading"
    INVOICE = "Invoice"
    PACKING_LIST = "Packing List"
    PO = "Purchase Order"
    COO = "Certificate of Origin"
    QC = "Quality Certificate"
    UNKNOWN = "Unknown"


class ExtractedFields(BaseModel):
    po_number: Optional[str] = None
    bol_number: Optional[str] = None
    containers: List[str] = []
    net_weight_kg: Optional[float] = None   # normalized to kg
    gross_weight_kg: Optional[float] = None  # normalized to kg
    net_weight_raw: Optional[str] = None    # original string
    gross_weight_raw: Optional[str] = None  # original string
    shipper: Optional[str] = None
    consignee: Optional[str] = None
    invoice_date: Optional[str] = None
    shipment_date: Optional[str] = None
    hs_code: Optional[str] = None
    description: Optional[str] = None
    confidence: float = 0.0


class Document(BaseModel):
    id: str
    filename: str
    page_number: Optional[int] = None
    doc_type: DocumentType
    extracted_fields: ExtractedFields
    confidence_score: float
    parse_warnings: List[str] = []


FieldStatus = Literal["ok", "error", "warning", "missing"]


class FieldValidation(BaseModel):
    field: str
    field_label: str
    values: Dict[str, Optional[str]]   # doc_id -> display value
    consensus: Optional[str] = None
    status: FieldStatus
    message: Optional[str] = None


class ValidationIssue(BaseModel):
    severity: Literal["error", "warning"]
    field: str
    message: str
    affected_doc_ids: List[str]


class Order(BaseModel):
    id: str
    documents: List[Document]
    field_validations: List[FieldValidation]
    errors: List[ValidationIssue]
    warnings: List[ValidationIssue]


class ValidationResult(BaseModel):
    orders: List[Order]
    unmatched_documents: List[Document]
