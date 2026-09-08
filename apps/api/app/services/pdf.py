from io import BytesIO
from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def build_estimate_pdf(*, estimate, lines, customer, vehicle, company_name: str = "NAKAMA CAR") -> bytes:
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=16 * mm,
        leftMargin=16 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=f"Preventivo {estimate.estimate_number}",
        author="ONE SISTEM",
    )
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="Right", parent=styles["BodyText"], alignment=TA_RIGHT))
    story = []

    story.append(Paragraph(company_name, styles["Title"]))
    story.append(Paragraph("Preventivo carrozzeria", styles["Heading2"]))
    story.append(Spacer(1, 6 * mm))

    info = [
        ["Preventivo", estimate.estimate_number, "Versione", str(estimate.version)],
        ["Cliente", customer.company_name or f"{customer.first_name or ''} {customer.last_name or ''}".strip(), "Targa", vehicle.license_plate],
        ["Veicolo", " ".join(filter(None, [vehicle.make, vehicle.model, vehicle.version])), "VIN", vehicle.vin or "—"],
        ["Km", str(vehicle.mileage or "—"), "Colore", vehicle.color_name or "—"],
    ]
    t = Table(info, colWidths=[28*mm, 58*mm, 24*mm, 55*mm])
    t.setStyle(TableStyle([
        ("GRID", (0,0), (-1,-1), 0.35, colors.HexColor("#D9DDE2")),
        ("BACKGROUND", (0,0), (0,-1), colors.HexColor("#F4F5F6")),
        ("BACKGROUND", (2,0), (2,-1), colors.HexColor("#F4F5F6")),
        ("FONTNAME", (0,0), (-1,-1), "Helvetica"),
        ("FONTSIZE", (0,0), (-1,-1), 8),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("LEFTPADDING", (0,0), (-1,-1), 6),
        ("RIGHTPADDING", (0,0), (-1,-1), 6),
        ("TOPPADDING", (0,0), (-1,-1), 6),
        ("BOTTOMPADDING", (0,0), (-1,-1), 6),
    ]))
    story.append(t)
    story.append(Spacer(1, 7 * mm))

    rows = [["Descrizione", "Q.tà", "Ricambi", "Ore", "€/h", "Vernice", "Materiali", "Totale"]]
    for line in lines:
        rows.append([
            line.description,
            f"{line.quantity}",
            f"€ {line.unit_price:.2f}",
            f"{line.labor_hours}",
            f"€ {line.labor_rate:.2f}",
            f"{line.paint_hours} h",
            f"€ {line.materials:.2f}",
            f"€ {line.line_total:.2f}",
        ])
    table = Table(rows, repeatRows=1, colWidths=[50*mm, 12*mm, 19*mm, 13*mm, 16*mm, 18*mm, 19*mm, 21*mm])
    table.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,0), colors.HexColor("#111316")),
        ("TEXTCOLOR", (0,0), (-1,0), colors.white),
        ("GRID", (0,0), (-1,-1), 0.3, colors.HexColor("#D9DDE2")),
        ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"),
        ("FONTNAME", (0,1), (-1,-1), "Helvetica"),
        ("FONTSIZE", (0,0), (-1,-1), 7.5),
        ("VALIGN", (0,0), (-1,-1), "MIDDLE"),
        ("LEFTPADDING", (0,0), (-1,-1), 4),
        ("RIGHTPADDING", (0,0), (-1,-1), 4),
        ("TOPPADDING", (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
    ]))
    story.append(table)
    story.append(Spacer(1, 7 * mm))

    totals = Table([
        ["Imponibile", f"€ {estimate.subtotal:.2f}"],
        ["IVA", f"€ {estimate.vat_total:.2f}"],
        ["TOTALE", f"€ {estimate.total:.2f}"],
    ], colWidths=[40*mm, 35*mm], hAlign="RIGHT")
    totals.setStyle(TableStyle([
        ("FONTNAME", (0,0), (-1,-2), "Helvetica"),
        ("FONTNAME", (0,-1), (-1,-1), "Helvetica-Bold"),
        ("FONTSIZE", (0,0), (-1,-1), 10),
        ("LINEABOVE", (0,-1), (-1,-1), 0.8, colors.HexColor("#111316")),
        ("ALIGN", (1,0), (1,-1), "RIGHT"),
        ("TOPPADDING", (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
    ]))
    story.append(totals)
    story.append(Spacer(1, 9 * mm))

    story.append(Paragraph("Condizioni", styles["Heading3"]))
    story.append(Paragraph("Preventivo soggetto a verifica definitiva dopo smontaggio. Ricambi, tempi e prezzi OEM sono riportati solo se inseriti dall'operatore o forniti da provider licenziati. Validità secondo configurazione aziendale.", styles["BodyText"]))
    story.append(Spacer(1, 12 * mm))
    story.append(Paragraph("Firma cliente ________________________________", styles["BodyText"]))
    story.append(Spacer(1, 7 * mm))
    story.append(Paragraph("Firma carrozzeria _____________________________", styles["BodyText"]))

    doc.build(story)
    return buffer.getvalue()
