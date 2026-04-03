"""FastAPI application entry point."""

import uuid
import logging
from typing import List

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from models import Document, DocumentType, ValidationResult
from pdf_parser import parse_pdf
from classifier import classify
from extractor import extract_fields
from grouper import group_documents
from validator import validate_order

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Shipment Document Validator", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.post("/api/validate", response_model=ValidationResult)
async def validate_documents(files: List[UploadFile] = File(...)):
    """
    Accept one or more PDF files. Each file may be a single document
    or a combined PDF with multiple document types per page.

    Returns grouped, validated shipment orders.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files uploaded")

    all_documents: List[Document] = []

    for upload in files:
        content = await upload.read()
        filename = upload.filename or "unknown.pdf"

        if not filename.lower().endswith(".pdf"):
            logger.warning("Skipping non-PDF file: %s", filename)
            continue

        try:
            pages = parse_pdf(content, filename)
        except Exception as exc:
            logger.error("Failed to parse %s: %s", filename, exc)
            continue

        for page in pages:
            doc_type = classify(page.text)
            fields = extract_fields(page.text)

            warnings = []
            if page.used_ocr:
                warnings.append("OCR was used — extraction accuracy may be lower")
            if fields.confidence < 0.2:
                warnings.append("Low confidence extraction — verify manually")

            doc = Document(
                id=str(uuid.uuid4()),
                filename=filename,
                page_number=page.page_number if len(pages) > 1 else None,
                doc_type=doc_type,
                extracted_fields=fields,
                confidence_score=fields.confidence,
                parse_warnings=warnings,
            )
            all_documents.append(doc)

    if not all_documents:
        raise HTTPException(
            status_code=422,
            detail="No parseable PDF content found in uploaded files",
        )

    # Group documents into shipment orders
    groups, unmatched = group_documents(all_documents)

    # Validate each group
    orders = [validate_order(group) for group in groups]

    return ValidationResult(orders=orders, unmatched_documents=unmatched)
