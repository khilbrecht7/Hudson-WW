"""PDF text extraction with OCR fallback for scanned pages."""

from dataclasses import dataclass
from typing import List
import io
import logging

logger = logging.getLogger(__name__)

OCR_MIN_TEXT_LENGTH = 50  # chars threshold — below this, try OCR


@dataclass
class ParsedPage:
    text: str
    page_number: int  # 1-indexed
    filename: str
    used_ocr: bool = False


def parse_pdf(content: bytes, filename: str) -> List[ParsedPage]:
    """Extract text from all pages of a PDF. Falls back to OCR for scanned pages."""
    import fitz  # PyMuPDF

    pages: List[ParsedPage] = []
    try:
        doc = fitz.open(stream=content, filetype="pdf")
    except Exception as exc:
        logger.warning("Failed to open %s as PDF: %s", filename, exc)
        return pages

    for page_index in range(len(doc)):
        page = doc[page_index]
        page_num = page_index + 1
        text = page.get_text("text")

        used_ocr = False
        if len(text.strip()) < OCR_MIN_TEXT_LENGTH:
            ocr_text = _ocr_page(page, filename, page_num)
            if ocr_text:
                text = ocr_text
                used_ocr = True

        pages.append(ParsedPage(
            text=text,
            page_number=page_num,
            filename=filename,
            used_ocr=used_ocr,
        ))

    doc.close()
    return pages


def _ocr_page(page, filename: str, page_num: int) -> str:
    """Render a PDF page and run Tesseract OCR on it."""
    try:
        import pytesseract
        from PIL import Image

        # Render at 200 DPI (2× default 72 DPI matrix)
        mat = __import__("fitz").Matrix(2.5, 2.5)
        pix = page.get_pixmap(matrix=mat)
        img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)

        # Auto-rotate if needed
        img = _auto_rotate(img)
        text = pytesseract.image_to_string(img, config="--psm 6")
        return text
    except Exception as exc:
        logger.warning("OCR failed for %s page %d: %s", filename, page_num, exc)
        return ""


def _auto_rotate(img):
    """Use Tesseract OSD to detect and correct page rotation."""
    try:
        import pytesseract
        osd = pytesseract.image_to_osd(img, output_type=pytesseract.Output.DICT)
        angle = osd.get("rotate", 0)
        if angle:
            img = img.rotate(-angle, expand=True)
    except Exception:
        pass
    return img
