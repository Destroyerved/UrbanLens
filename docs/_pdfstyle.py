"""Shared ReportLab styling for the UrbanLens documents in this folder.

Kept separate so the conformance report and the technical reference look like
one set. Colours mirror the app's own meaning-carrying palette (PRD §67):
green good, amber partial, red missing, blue government/infrastructure.
"""

from __future__ import annotations

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (Paragraph, Preformatted, Spacer, Table,
                                TableStyle)

PAGE = A4
MARGIN = 16 * mm

INK = colors.HexColor("#0F172A")
MUTED = colors.HexColor("#5A6678")
ACCENT = colors.HexColor("#1D6FE0")
GOOD = colors.HexColor("#15803D")
WARN = colors.HexColor("#B45309")
BAD = colors.HexColor("#B91C1C")
GOV = colors.HexColor("#1D4ED8")
RULE = colors.HexColor("#D5DCE6")
BAND = colors.HexColor("#F1F5FA")
CODEBG = colors.HexColor("#F6F8FB")

STATUS_COLOUR = {
    "Built": GOOD, "Done": GOOD, "Yes": GOOD,
    "Partial": WARN, "Substituted": WARN, "Caveat": WARN,
    "Missing": BAD, "Not built": BAD, "No": BAD,
    "N/A": MUTED, "Optional": MUTED,
}


def styles() -> dict[str, ParagraphStyle]:
    base = getSampleStyleSheet()
    s: dict[str, ParagraphStyle] = {}
    s["title"] = ParagraphStyle(
        "title", parent=base["Title"], fontName="Helvetica-Bold",
        fontSize=23, leading=27, textColor=INK, spaceAfter=2, alignment=TA_LEFT,
    )
    s["subtitle"] = ParagraphStyle(
        "subtitle", parent=base["Normal"], fontName="Helvetica",
        fontSize=10.5, leading=14.5, textColor=MUTED, spaceAfter=10,
    )
    s["h1"] = ParagraphStyle(
        "h1", parent=base["Heading1"], fontName="Helvetica-Bold",
        fontSize=14.5, leading=18, textColor=INK, spaceBefore=15, spaceAfter=6,
    )
    s["h2"] = ParagraphStyle(
        "h2", parent=base["Heading2"], fontName="Helvetica-Bold",
        fontSize=11.5, leading=15, textColor=ACCENT, spaceBefore=11, spaceAfter=4,
    )
    s["h3"] = ParagraphStyle(
        "h3", parent=base["Heading3"], fontName="Helvetica-Bold",
        fontSize=10, leading=13.5, textColor=INK, spaceBefore=8, spaceAfter=3,
    )
    s["body"] = ParagraphStyle(
        "body", parent=base["Normal"], fontName="Helvetica",
        fontSize=9.4, leading=13.4, textColor=INK, spaceAfter=5,
    )
    s["small"] = ParagraphStyle(
        "small", parent=s["body"], fontSize=8.4, leading=11.6, textColor=MUTED,
    )
    s["cell"] = ParagraphStyle(
        "cell", parent=s["body"], fontSize=8.5, leading=11.4, spaceAfter=0,
    )
    s["cellb"] = ParagraphStyle(
        "cellb", parent=s["cell"], fontName="Helvetica-Bold",
    )
    s["code"] = ParagraphStyle(
        "code", parent=base["Code"], fontName="Courier", fontSize=8.2,
        leading=11.2, textColor=INK, backColor=CODEBG,
        borderPadding=6, spaceBefore=3, spaceAfter=7,
        leftIndent=3, rightIndent=3,
    )
    s["q"] = ParagraphStyle(
        "q", parent=s["body"], fontName="Helvetica-Bold",
        fontSize=9.6, leading=13, textColor=INK, spaceBefore=9, spaceAfter=2,
    )
    s["a"] = ParagraphStyle(
        "a", parent=s["body"], leftIndent=9, spaceAfter=3,
    )
    s["bullet"] = ParagraphStyle(
        "bullet", parent=s["body"], leftIndent=12, bulletIndent=3, spaceAfter=3,
    )
    return s


# ReportLab's standard-14 fonts (Helvetica, Courier) encode WinAnsi/cp1252 only.
# Anything outside it renders as a blank or a black box rather than raising, so
# it is easy to ship a document full of holes without noticing. Mapping to ASCII
# here keeps the build portable — registering a system TrueType font would tie
# regeneration to this machine.
_SAFE = {
    "→": "->", "↔": "<->", "←": "<-",
    "−": "-", "√": "sqrt", "Δ": "d",
    "⌘": "Cmd+", "⚠": "[!]", "✓": "[tick]", "✗": "[x]",
    # Box drawing -> ASCII, so the architecture diagram survives.
    "─": "-", "│": "|",
    "┌": "+", "┐": "+", "└": "+", "┘": "+",
    "├": "+", "┤": "+", "┬": "+", "┴": "+", "┼": "+",
    "►": ">", "◄": "<", "•": "-",
}


def safe(text: str) -> str:
    """Replace glyphs the standard-14 fonts cannot draw."""
    for bad, good in _SAFE.items():
        if bad in text:
            text = text.replace(bad, good)
    return text


def audit(text: str) -> list[str]:
    """Characters still outside cp1252 after substitution — used by the build
    scripts to fail loudly rather than emit a document full of blanks."""
    out = []
    for ch in text:
        if ord(ch) < 128:
            continue
        try:
            ch.encode("cp1252")
        except UnicodeEncodeError:
            out.append(ch)
    return out


_seen_unsafe: set[str] = set()


def para(text: str, st: ParagraphStyle) -> Paragraph:
    text = safe(text)
    _seen_unsafe.update(audit(text))
    return Paragraph(text, st)


def unsafe_report() -> set[str]:
    return set(_seen_unsafe)


def code_block(text: str, st: ParagraphStyle):
    """Fixed-layout block for diagrams and formulas.

    Paragraph reflows and collapses newlines, which turns an ASCII architecture
    diagram into one run-on line. Preformatted keeps the line breaks and the
    monospace grid, which is the entire point of these blocks.
    """
    text = safe(text)
    _seen_unsafe.update(audit(text))
    return Preformatted(text, st)


def table(rows, widths, st, header=True, zebra=True, align_left_cols=()):
    """Rows are lists of strings (rendered as Paragraphs) or flowables."""
    data = []
    for r_i, row in enumerate(rows):
        out = []
        for c_i, cell in enumerate(row):
            if isinstance(cell, str):
                style = st["cellb"] if (header and r_i == 0) else st["cell"]
                # Colour a status word when it stands alone in its cell.
                if r_i > 0 and cell in STATUS_COLOUR:
                    style = ParagraphStyle(
                        f"st{r_i}{c_i}", parent=st["cellb"],
                        textColor=STATUS_COLOUR[cell],
                    )
                out.append(para(cell, style))
            else:
                out.append(cell)
        data.append(out)

    t = Table(data, colWidths=widths, repeatRows=1 if header else 0, hAlign="LEFT")
    cmds = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, 0), 0.9, RULE if not header else ACCENT),
        ("GRID", (0, 0), (-1, -1), 0.35, RULE),
        ("LEFTPADDING", (0, 0), (-1, -1), 5),
        ("RIGHTPADDING", (0, 0), (-1, -1), 5),
        ("TOPPADDING", (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
    ]
    if header:
        cmds.append(("BACKGROUND", (0, 0), (-1, 0), BAND))
    if zebra:
        for i in range(1 + (1 if header else 0), len(data), 2):
            cmds.append(("BACKGROUND", (0, i), (-1, i), colors.HexColor("#FAFBFD")))
    t.setStyle(TableStyle(cmds))
    return t


def callout(title: str, body: str, st, tone=WARN):
    """A boxed note — used for the things that must not be missed."""
    inner = [
        [para(f'<font color="#{tone.hexval()[2:]}"><b>{title}</b></font>', st["cell"])],
        [para(body, st["cell"])],
    ]
    t = Table(inner, colWidths=[PAGE[0] - 2 * MARGIN], hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#FFFBF3") if tone is WARN else colors.HexColor("#FDF3F3")),
        ("BOX", (0, 0), (-1, -1), 0.7, tone),
        ("LINEBEFORE", (0, 0), (0, -1), 2.6, tone),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return [t, Spacer(1, 8)]


def make_footer(doc_title: str):
    def footer(canvas, doc):
        canvas.saveState()
        canvas.setFont("Helvetica", 7.4)
        canvas.setFillColor(MUTED)
        canvas.drawString(MARGIN, 10 * mm, doc_title)
        canvas.drawRightString(PAGE[0] - MARGIN, 10 * mm, f"Page {canvas.getPageNumber()}")
        canvas.setStrokeColor(RULE)
        canvas.setLineWidth(0.4)
        canvas.line(MARGIN, 13 * mm, PAGE[0] - MARGIN, 13 * mm)
        canvas.restoreState()
    return footer
