"""PDF recommendation reports (backlog VD-9 / FE-B3).

`build_report_pdf` renders one parcel — registry, suitability analysis,
district-wide comparison, reasoning and source provenance — into a fileable PDF
(application/pdf) the planner can attach to a proposal. Pure reportlab; no
canvas drawing beyond the page footer, so the layout stays declarative.
"""

from __future__ import annotations

from datetime import datetime, timezone
from io import BytesIO
from typing import Any, Callable

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)

from app.gis.parcels import get_parcels
from app.gis.scoring import DEFAULT_WEIGHTS, PROJECTS, WEIGHT_LABELS

# --- palette ---------------------------------------------------------------
ACCENT = colors.HexColor("#0F766E")   # teal-700
DARK   = colors.HexColor("#0F172A")   # slate-900
MUTED  = colors.HexColor("#64748B")   # slate-500
BORDER = colors.HexColor("#E2E8F0")   # slate-200
ROW    = colors.HexColor("#F1F5F9")   # slate-100
GOOD   = colors.HexColor("#15803D")
WARN   = colors.HexColor("#A16207")
BAD    = colors.HexColor("#B91C1C")

PAGE_W, PAGE_H = A4
LM = RM = 16 * mm
TM = 16 * mm
BM = 22 * mm
BODY_W = PAGE_W - LM - RM

# --- text ------------------------------------------------------------------

def _style(name: str, **kw) -> ParagraphStyle:
    base = {
        "fontName": "Helvetica",
        "fontSize": 9,
        "leading": 12,
        "textColor": DARK,
        "wordWrap": "CJK",
    }
    base.update(kw)
    return ParagraphStyle(name, **base)


S = {
    "title": _style("title", fontName="Helvetica-Bold", fontSize=18, leading=22, textColor=colors.white),
    "subtitle": _style("subtitle", fontSize=8.5, leading=11.5, textColor=colors.white),
    "h2": _style("h2", fontName="Helvetica-Bold", fontSize=10.5, leading=14, textColor=colors.white,
                 backColor=ACCENT, borderPadding=(4, 8, 4, 8), spaceBefore=14, spaceAfter=7),
    "body": _style("body", fontSize=9.5, leading=14),
    "narrative": _style("narrative", fontSize=9.5, leading=14.5, spaceAfter=6),
    "cell": _style("cell"),
    "cell_bold": _style("cell_bold", fontName="Helvetica-Bold"),
    "cell_muted": _style("cell_muted", fontSize=8, leading=10.5, textColor=MUTED),
    "score": _style("score", fontName="Helvetica-Bold", alignment=1),
    "muted": _style("muted", fontSize=7.8, leading=10.5, textColor=MUTED),
    "disclaimer": _style("disclaimer", fontName="Helvetica-Oblique", fontSize=7.5, leading=10, textColor=MUTED),
}

_FACTOR_LABELS = dict(WEIGHT_LABELS)
_LOCATION_LABELS = {
    "accessibility": "Accessibility",
    "transit": "Public transit",
    "infrastructure": "Infrastructure readiness",
    "environment": "Environmental suitability",
    "development_potential": "Development potential",
}
_LAYER_LABELS = {
    "wards": "Wards",
    "population": "Population",
    "parcels": "Parcels",
    "tenure": "Land tenure",
    "zoning": "Zoning",
    "facilities": "Facilities",
    "roads": "Roads",
    "satellite": "Satellite imagery",
    "osm": "Greenspace",
}
_YES_NO = {True: "Yes", False: "No"}
_FLOOD = {"low": "Low", "medium": "Moderate", "high": "High"}
_SOURCE = {
    "osm": "Mapped (OpenStreetMap)",
    "osm-subdivided": "Mapped (OpenStreetMap), subdivided at street blocks",
    "modelled-fill": "Modelled gap-fill",
}


def _score_style(v: float):
    if v >= 70:
        return GOOD
    if v >= 45:
        return WARN
    return BAD


def _kv(rows: list[tuple[str, str]]) -> Table:
    """Two-column label/value table with a tinted label gutter."""
    data = [[Paragraph(k, S["cell_bold"]), Paragraph(v, S["cell"])] for k, v in rows]
    t = Table(data, colWidths=[56 * mm, BODY_W - 56 * mm], hAlign="LEFT", repeatRows=0)
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 2.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, BORDER),
        ("BACKGROUND", (0, 0), (0, -1), ROW),
    ]))
    return t


def _score_table(rows: list[tuple[str, float]]) -> Table:
    data = [[Paragraph(k, S["cell"]), Paragraph(str(v), _style("score", textColor=_score_style(v)))]
            for k, v in rows]
    t = Table(data, colWidths=[BODY_W - 42 * mm, 42 * mm], hAlign="LEFT")
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 2.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, BORDER),
    ]))
    return t


def _column_header(*labels: str, widths: list[float]) -> Table:
    t = Table([[Paragraph(l, _style("ch", fontName="Helvetica-Bold", fontSize=8.5,
                                    leading=11, textColor=colors.white)) for l in labels]],
              colWidths=widths, hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), ACCENT),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
    ]))
    return t


# --- district statistics ---------------------------------------------------

def _top_pct(values: list[float], mine: float, n: int) -> int:
    """Share of the district (0-100) scoring below this parcel."""
    return round(100 * sum(1 for v in values if v < mine) / n) if n else 100


def _district_stats(ds, p) -> dict:
    parcels = get_parcels(ds.city.id)
    n = len(parcels) or 1

    def arr(key: str) -> list[float]:
        return [x.scores.get(key, 0.0) for x in parcels]

    score_pct = {
        k: _top_pct(arr(k), p.scores.get(k, 0.0), n) for k in _LOCATION_LABELS
    }
    pop_pct = _top_pct([x.pop_3km for x in parcels], p.pop_3km, n)
    area_pct = _top_pct([x.area_acres for x in parcels], p.area_acres, n)
    return {
        "n": len(parcels),
        "score_pct": score_pct,
        "pop_pct": pop_pct,
        "area_pct": area_pct,
        "pct_low_flood": round(100 * sum(1 for x in parcels if x.flood_risk == "low") / n),
        "pct_gov": round(100 * sum(1 for x in parcels if x.ownership == "government") / n),
        "median_ha": sorted(x.area_sqm / 10_000 for x in parcels)[n // 2],
    }


def _narrative(ds, p, project: str, suit: dict, stats: dict) -> list[Paragraph]:
    spec = PROJECTS[project]
    city = ds.city.name
    n = stats["n"]
    tops = sorted(stats["score_pct"].items(), key=lambda kv: -kv[1])
    f1, pct1 = tops[0]
    f2, pct2 = tops[1]
    lines = [
        f"Of the {n:,} parcels modelled across <b>{city}</b>, this site scores above "
        f"<b>{pct1}%</b> of them for {_LOCATION_LABELS[f1].lower()} and above "
        f"<b>{pct2}%</b> for {_LOCATION_LABELS[f2].lower()}.",
    ]
    if spec.need_facility and suit["unserved"] > 2_000:
        lines.append(
            f"A <b>{spec.label}</b> here would reach ~{suit['unserved']:,} residents who "
            f"currently have no {spec.label.lower()} within {spec.service_radius_km:g} km — "
            f"{suit['pop']:,} residents live inside that radius."
        )
    elif spec.need_facility:
        lines.append(
            f"The area within {spec.service_radius_km:g} km is already well served for "
            f"{spec.label.lower()}, so the case rests on the site itself rather than unmet demand."
        )
    if p.flood_risk == "low":
        lines.append(
            f"The land sits at <b>low flood risk</b> — true of only {stats['pct_low_flood']}% "
            f"of the district's parcels."
        )
    else:
        lines.append(
            f"The land carries a <b>{_FLOOD[p.flood_risk].lower()} flood risk</b>; "
            f"mitigation cost should be carried in the proposal."
        )
    if p.ownership == "government":
        lines.append(
            f"It is <b>government-owned</b> (as are only {stats['pct_gov']}% of the district's "
            f"parcels), so acquisition is not required."
        )
    else:
        lines.append(
            f"It is <b>privately owned</b>; acquisition is the main execution risk."
        )
    if p.pop_3km >= 10_000:
        lines.append(
            f"Its 3 km catchment (~{p.pop_3km:,} residents) exceeds {stats['pop_pct']}% "
            f"of parcels across the district."
        )
    return [Paragraph(line, S["narrative"]) for line in lines]


# --- document --------------------------------------------------------------

def _footer(canv, doc) -> None:
    canv.saveState()
    canv.setFont("Helvetica", 7.5)
    canv.setFillColor(MUTED)
    canv.drawString(LM, 10 * mm, "UrbanLens · recommendation report · generated automatically · not a legal or cadastral document")
    canv.drawRightString(PAGE_W - RM, 10 * mm, f"Page {canv.getPageNumber()}")
    canv.restoreState()


def build_report_pdf(
    ds,
    p,
    project: str,
    suit: dict,
    recommended: list[dict],
    sources: dict,
) -> bytes:
    """Render a parcel recommendation report to PDF bytes."""
    spec = PROJECTS[project]
    city = ds.city
    now = datetime.now(timezone.utc).strftime("%d %b %Y at %H:%M UTC")
    stats = _district_stats(ds, p)
    breakdown = suit["breakdown"]
    weights = DEFAULT_WEIGHTS

    story: list[Any] = []
    story.append(Paragraph(
        f"UrbanLens &nbsp;·&nbsp; Parcel Recommendation Report",
        _style("band_title", fontName="Helvetica-Bold", fontSize=17, leading=21,
               textColor=colors.white, backColor=ACCENT, borderPadding=(8, 10, 8, 10)),
    ))
    story.append(Spacer(1, 3 * mm))
    story.append(Paragraph(
        f"<b>{city.name}</b> · {p.ward} · parcel {p.parcel_id}<br/>"
        f"Recommended use: <b>{spec.label}</b> &nbsp;|&nbsp; suitability "
        f"<b>{suit['final']}/100</b> &nbsp;|&nbsp; generated {now}",
        S["subtitle"],
    ))
    story.append(Spacer(1, 2 * mm))

    # --- registry --------------------------------------------------------
    story.append(Paragraph("1 · Parcel Registry", S["h2"]))
    registry_rows = [
        ("Parcel ID", p.parcel_id),
        ("Survey number", p.survey_number),
        ("Name", p.name or "—"),
        ("Ward", p.ward),
        ("Land use", p.land_use.replace("_", " ").title()),
        ("Zoning", p.zoning.replace("_", " ").title()),
        ("Ownership", p.ownership.title()),
        ("Owner category", p.owner_category),
        ("Tenure confirmed", _YES_NO[p.tenure_known]),
        ("Record source", _SOURCE.get(p.source, p.source)),
        ("Area", f"{p.area_sqm / 10_000:.2f} ha ({p.area_acres:.1f} acres)"),
        ("Built-up trend", "2018 " + str(p.history.get(2018, 0)) + "% → 2022 "
                            + str(p.history.get(2022, 0)) + "% → 2026 " + str(p.history.get(2026, 0)) + "%"),
        ("Vegetation / water", f"{p.vegetation_percent}% / {p.water_percent}%"),
        ("Flood risk", _FLOOD[p.flood_risk]),
        ("Elevation", f"{p.elevation_m} m"),
    ]
    story.append(_kv(registry_rows))

    # --- location --------------------------------------------------------
    story.append(Paragraph("2 · Location &amp; Accessibility", S["h2"]))
    story.append(_kv([
        ("Nearest arterial road", f"{p.road_km:.2f} km"),
        ("Nearest hospital", f"{p.nearest['hospital']:.2f} km"),
        ("Nearest school", f"{p.nearest['school']:.2f} km"),
        ("Nearest park", f"{p.nearest['park']:.2f} km"),
        ("Nearest bus stop", f"{p.nearest['bus_stop']:.2f} km"),
        ("Nearest metro station", f"{p.nearest['metro_station']:.2f} km"),
        ("Population within 3 km", f"{p.pop_3km:,}"),
    ]))

    # --- suitability -----------------------------------------------------
    story.append(Paragraph("3 · Suitability Scores", S["h2"]))
    story.append(Paragraph(
        f"Recommended project <b>{spec.label}</b> — weighted final score "
        f"<b>{suit['final']}/100</b>. Factors are weighted "
        f"accessibility 25% / population need 20% / transit 15% / infrastructure 15% / "
        f"environment 15% / land compatibility 10%.",
        S["body"],
    ))
    story.append(Spacer(1, 2.5 * mm))
    story.append(_column_header("Factor", "Weight", "Score", widths=[BODY_W - 78 * mm, 38 * mm, 40 * mm]))
    factor_rows = [
        (_FACTOR_LABELS[k], f"{round(weights.get(k, 0) * 100)}%", breakdown[k])
        for k in ("accessibility", "population_need", "transit", "infrastructure",
                  "environment", "land_compatibility")
    ]
    fdata = [[Paragraph(k, S["cell"]), Paragraph(w, S["cell"]),
              Paragraph(str(v), _style("score", textColor=_score_style(v)))]
             for k, w, v in factor_rows]
    ft = Table(fdata, colWidths=[BODY_W - 78 * mm, 38 * mm, 40 * mm], hAlign="LEFT")
    ft.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 2.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, BORDER),
        ("LINEABOVE", (0, 1), (-1, -1), 0, colors.white),
    ]))
    story.append(ft)
    story.append(Spacer(1, 2.5 * mm))
    story.append(Paragraph("Location scores", _style("sub2", fontName="Helvetica-Bold",
                                                     fontSize=9, leading=12, spaceBefore=4, spaceAfter=3)))
    story.append(_score_table([
        (_LOCATION_LABELS[k], p.scores[k]) for k in _LOCATION_LABELS
    ]))

    # --- district comparison ---------------------------------------------
    story.append(Paragraph("4 · How This Parcel Compares — District-wide", S["h2"]))
    story.append(Paragraph(
        f"Ranks against all {stats['n']:,} modelled parcels in {city.name}. "
        f"Median parcel is {stats['median_ha']:.1f} ha; {stats['pct_gov']}% of parcels are "
        f"government-owned; {stats['pct_low_flood']}% are at low flood risk.",
        S["body"],
    ))
    story.append(Spacer(1, 2.5 * mm))
    story.append(_kv([
        ("Accessibility", f"above {stats['score_pct']['accessibility']}% of parcels"),
        ("Public transit", f"above {stats['score_pct']['transit']}% of parcels"),
        ("Infrastructure readiness", f"above {stats['score_pct']['infrastructure']}% of parcels"),
        ("Environmental suitability", f"above {stats['score_pct']['environment']}% of parcels"),
        ("Development potential", f"above {stats['score_pct']['development_potential']}% of parcels"),
        ("Population within 3 km", f"{p.pop_3km:,} — above {stats['pop_pct']}% of parcels"),
        ("Parcel size", f"{p.area_acres:.1f} acres — larger than {stats['area_pct']}% of parcels"),
        ("Flood safety", "low flood risk" if p.flood_risk == "low"
                          else f"{_FLOOD[p.flood_risk].lower()} flood risk"),
        ("Ownership", "government" if p.ownership == "government"
                        else f"private ({stats['pct_gov']}% of district is government-owned)"),
    ]))

    # --- why this site ---------------------------------------------------
    story.append(Paragraph("5 · Why This Site Is a Strong Candidate", S["h2"]))
    for para in _narrative(ds, p, project, suit, stats):
        story.append(para)
    pros = suit["explanation"].get("pros", [])
    cons = suit["explanation"].get("cons", [])
    story.append(Paragraph("Strengths", _style("sub2", fontName="Helvetica-Bold",
                                               fontSize=9, leading=12, spaceBefore=2, spaceAfter=2)))
    for pro in pros:
        story.append(Paragraph(f"<font color='#15803D'>✓</font> {pro}", S["narrative"]))
    story.append(Paragraph("Watch-outs", _style("sub2", fontName="Helvetica-Bold",
                                                fontSize=9, leading=12, spaceBefore=4, spaceAfter=2)))
    for con in cons:
        story.append(Paragraph(f"<font color='#B91C1C'>✗</font> {con}", S["narrative"]))

    # --- alternative uses --------------------------------------------------
    story.append(Paragraph("6 · How It Ranks for Other Uses", S["h2"]))
    story.append(_column_header("Rank", "Project", "Score",
                                widths=[24 * mm, BODY_W - 74 * mm, 50 * mm]))
    rdata = [[Paragraph(f"#{i + 1}", S["cell_bold"]),
              Paragraph(r["label"], S["cell"]),
              Paragraph(str(r["score"]), _style("score", textColor=_score_style(r["score"])))]
             for i, r in enumerate(recommended)]
    rt = Table(rdata, colWidths=[24 * mm, BODY_W - 74 * mm, 50 * mm], hAlign="LEFT")
    rt.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING", (0, 0), (-1, -1), 2.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, BORDER),
    ]))
    story.append(rt)

    # --- provenance --------------------------------------------------------
    story.append(Paragraph("7 · Source Provenance", S["h2"]))
    story.append(Paragraph(
        "Not every layer is equally real. Each states its own origin and limits "
        "so the numbers above can be weighed honestly.",
        S["body"],
    ))
    story.append(Spacer(1, 2.5 * mm))
    story.append(_column_header("Layer", "Source", "What it is", widths=[32 * mm, 34 * mm, BODY_W - 66 * mm]))
    pdata = [
        [Paragraph(_LAYER_LABELS.get(k, k), S["cell"]),
         Paragraph(v["source"], S["cell"]),
         Paragraph(f"<b>{v['label']}</b> — {v['detail']}", S["cell"])]
        for k, v in sources.items()
    ]
    pt = Table(pdata, colWidths=[32 * mm, 34 * mm, BODY_W - 66 * mm], hAlign="LEFT", repeatRows=0)
    pt.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("LINEBELOW", (0, 0), (-1, -2), 0.4, BORDER),
        ("BACKGROUND", (0, 0), (-1, -1), ROW),
    ]))
    story.append(pt)

    # --- disclaimer ---------------------------------------------------------
    story.append(Spacer(1, 4 * mm))
    story.append(Paragraph(
        "This report is produced automatically by UrbanLens from modelled and publicly "
        "available data (see Section 7). It is a planning aid, not a cadastral, legal or "
        "valuation document. Scores describe relative suitability only and do not "
        "guarantee planning approval, title, or feasibility. District statistics in "
        "Section 4 are computed across the parcel layer available to the platform.",
        S["disclaimer"],
    ))

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4, leftMargin=LM, rightMargin=RM, topMargin=TM, bottomMargin=BM,
        title=f"UrbanLens recommendation — {p.parcel_id}",
        author="UrbanLens",
    )
    doc.build(story, onFirstPage=_footer, onLaterPages=_footer)
    return buf.getvalue()
