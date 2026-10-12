from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.services.pricing import PUBLIC_TERMS, price_line

NAVY = colors.HexColor("#0B2A4A")
GRID = colors.HexColor("#D9DDE2")
SOFT = colors.HexColor("#F4F5F6")

PAYMENT_METHODS = {
    "MP01": "Contanti",
    "MP02": "Assegno",
    "MP05": "Bonifico bancario",
    "MP08": "Carta di pagamento",
    "MP12": "RIBA",
    "MP19": "SEPA Direct Debit",
}


def euro(value) -> str:
    formatted = f"{value:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"€ {formatted}"


def _styles():
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(name="Right", parent=styles["BodyText"], alignment=TA_RIGHT))
    styles.add(ParagraphStyle(name="Small", parent=styles["BodyText"], fontSize=7.5, leading=9.5))
    styles.add(ParagraphStyle(name="Cell", parent=styles["BodyText"], fontSize=7.5, leading=9))
    return styles


def _doc(buffer: BytesIO, title: str) -> SimpleDocTemplate:
    return SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=16 * mm,
        leftMargin=16 * mm,
        topMargin=16 * mm,
        bottomMargin=16 * mm,
        title=title,
        author="ONE SISTEM",
    )


def _company_block(company_name: str, settings, styles) -> list:
    details = []
    if settings is not None:
        address = ", ".join(filter(None, [
            settings.address,
            " ".join(filter(None, [settings.postal_code, settings.city, f"({settings.province})" if settings.province else None])),
        ]))
        if address:
            details.append(address)
        fiscal = " · ".join(filter(None, [
            f"P.IVA {settings.vat_number}" if settings.vat_number else None,
            f"C.F. {settings.tax_code}" if settings.tax_code else None,
        ]))
        if fiscal:
            details.append(fiscal)
        contacts = " · ".join(filter(None, [settings.phone, settings.email, settings.pec]))
        if contacts:
            details.append(contacts)
    block = [Paragraph(escape(company_name), styles["Title"])]
    for line in details:
        block.append(Paragraph(escape(line), styles["Small"]))
    return block


def _grid_style(header: bool = True) -> TableStyle:
    commands = [
        ("GRID", (0, 0), (-1, -1), 0.3, GRID),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, -1), 7.5),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 4),
        ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]
    if header:
        commands += [
            ("BACKGROUND", (0, 0), (-1, 0), NAVY),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ]
    return TableStyle(commands)


def _info_table(rows) -> Table:
    table = Table(rows, colWidths=[28 * mm, 58 * mm, 24 * mm, 55 * mm])
    style = _grid_style(header=False)
    style.add("BACKGROUND", (0, 0), (0, -1), SOFT)
    style.add("BACKGROUND", (2, 0), (2, -1), SOFT)
    style.add("LEFTPADDING", (0, 0), (-1, -1), 6)
    table.setStyle(style)
    return table


def _totals_table(subtotal, vat_total, total) -> Table:
    totals = Table([
        ["Imponibile", euro(subtotal)],
        ["IVA", euro(vat_total)],
        ["TOTALE", euro(total)],
    ], colWidths=[40 * mm, 35 * mm], hAlign="RIGHT")
    totals.setStyle(TableStyle([
        ("FONTNAME", (0, 0), (-1, -2), "Helvetica"),
        ("FONTNAME", (0, -1), (-1, -1), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("LINEABOVE", (0, -1), (-1, -1), 0.8, NAVY),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return totals


def customer_name(customer) -> str:
    if customer is None:
        return "—"
    return customer.company_name or f"{customer.first_name or ''} {customer.last_name or ''}".strip() or "—"


def build_estimate_pdf(
    *,
    estimate,
    lines,
    customer,
    vehicle,
    company_name: str = "NAKAMA CAR",
    settings=None,
    terms=PUBLIC_TERMS,
    contract_name: str | None = None,
) -> bytes:
    buffer = BytesIO()
    doc = _doc(buffer, f"Preventivo {estimate.estimate_number}")
    styles = _styles()
    story = _company_block(company_name, settings, styles)
    story.append(Paragraph("Preventivo di riparazione", styles["Heading2"]))
    story.append(Spacer(1, 4 * mm))

    story.append(_info_table([
        ["Preventivo", estimate.estimate_number, "Versione", str(estimate.version)],
        ["Cliente", customer_name(customer), "Targa", vehicle.license_plate],
        ["Veicolo", " ".join(filter(None, [vehicle.make, vehicle.model, vehicle.version])) or "—", "VIN / Telaio", vehicle.vin or "—"],
        ["Km", str(vehicle.mileage or "—"), "N. flotta", getattr(vehicle, "fleet_number", None) or "—"],
    ]))
    story.append(Spacer(1, 5 * mm))

    if contract_name:
        conditions = [f"Contratto di manutenzione flotta: {contract_name}."]
        if terms.labor_included:
            conditions.append("Manodopera inclusa nel canone mensile.")
        elif terms.labor_discount_percent:
            conditions.append(f"Sconto manodopera {terms.labor_discount_percent}%.")
        if terms.parts_markup_percent:
            conditions.append(f"Ricambi e materiali a costo + {terms.parts_markup_percent}%.")
        story.append(Paragraph(escape(" ".join(conditions)), styles["BodyText"]))
        story.append(Spacer(1, 4 * mm))

    rows = [["Descrizione", "Q.tà", "Ricambi / materiali", "Ore", "Manodopera", "IVA", "Totale"]]
    for line in lines:
        amounts = price_line(line, terms)
        hours = line.labor_hours + line.paint_hours
        rows.append([
            Paragraph(escape(line.description), styles["Cell"]),
            f"{line.quantity:g}",
            euro(amounts.parts),
            f"{hours:g}",
            "Inclusa" if terms.labor_included and hours else euro(amounts.labor),
            f"{line.vat_rate:g}%",
            euro(amounts.total),
        ])
    table = Table(rows, repeatRows=1, colWidths=[62 * mm, 12 * mm, 26 * mm, 12 * mm, 22 * mm, 12 * mm, 22 * mm])
    style = _grid_style()
    style.add("ALIGN", (1, 1), (-1, -1), "RIGHT")
    table.setStyle(style)
    story.append(table)
    story.append(Spacer(1, 6 * mm))
    story.append(_totals_table(estimate.subtotal, estimate.vat_total, estimate.total))
    story.append(Spacer(1, 8 * mm))

    story.append(Paragraph("Condizioni", styles["Heading3"]))
    validity = getattr(settings, "estimate_validity_days", None) or 15
    story.append(Paragraph(
        "Preventivo soggetto a verifica definitiva dopo lo smontaggio o la diagnosi. "
        "Ricambi, tempi e prezzi sono riportati solo se inseriti dall'operatore o forniti da provider licenziati. "
        f"Validità {validity} giorni dalla data di emissione.",
        styles["BodyText"],
    ))
    story.append(Spacer(1, 12 * mm))
    story.append(Paragraph("Firma cliente ________________________________", styles["BodyText"]))
    story.append(Spacer(1, 7 * mm))
    story.append(Paragraph("Firma officina _____________________________", styles["BodyText"]))

    doc.build(story)
    return buffer.getvalue()


def build_invoice_pdf(*, invoice, lines, customer, vehicle=None, company_name: str = "NAKAMA CAR", settings=None) -> bytes:
    buffer = BytesIO()
    doc = _doc(buffer, f"Fattura {invoice.invoice_number}")
    styles = _styles()
    story = _company_block(company_name, settings, styles)
    title = "Fattura" if invoice.status.value != "DRAFT" else "Fattura — BOZZA (non valida ai fini fiscali)"
    story.append(Paragraph(title, styles["Heading2"]))
    story.append(Spacer(1, 4 * mm))

    address = ", ".join(filter(None, [
        getattr(customer, "address", None),
        " ".join(filter(None, [getattr(customer, "postal_code", None), getattr(customer, "city", None)])),
    ])) or "—"
    fiscal = " · ".join(filter(None, [
        f"P.IVA {customer.vat_number}" if customer is not None and customer.vat_number else None,
        f"C.F. {customer.tax_code}" if customer is not None and customer.tax_code else None,
    ])) or "—"
    issue = invoice.issue_date.strftime("%d/%m/%Y") if invoice.issue_date else "—"
    due = invoice.due_date.strftime("%d/%m/%Y") if invoice.due_date else "—"
    info = [
        ["Numero", invoice.invoice_number, "Data", issue],
        ["Cliente", customer_name(customer), "Scadenza", due],
        ["Indirizzo", address, "Pagamento", PAYMENT_METHODS.get(invoice.payment_method or "", "—")],
        ["Dati fiscali", fiscal, "Rif.", invoice.period_month or (vehicle.license_plate if vehicle is not None else "—")],
    ]
    story.append(_info_table(info))
    story.append(Spacer(1, 6 * mm))

    rows = [["Descrizione", "Q.tà", "Prezzo unit.", "IVA", "Imponibile"]]
    for line in lines:
        rows.append([
            Paragraph(escape(line.description), styles["Cell"]),
            f"{line.quantity:g}",
            euro(line.unit_price),
            f"{line.vat_rate:g}%",
            euro(line.line_subtotal),
        ])
    table = Table(rows, repeatRows=1, colWidths=[86 * mm, 14 * mm, 26 * mm, 14 * mm, 28 * mm])
    style = _grid_style()
    style.add("ALIGN", (1, 1), (-1, -1), "RIGHT")
    table.setStyle(style)
    story.append(table)
    story.append(Spacer(1, 6 * mm))
    story.append(_totals_table(invoice.subtotal, invoice.vat_total, invoice.total))
    story.append(Spacer(1, 8 * mm))

    if settings is not None and settings.iban and invoice.payment_method == "MP05":
        story.append(Paragraph(escape(f"Pagamento con bonifico su IBAN {settings.iban}"), styles["BodyText"]))
    if invoice.notes:
        story.append(Spacer(1, 3 * mm))
        story.append(Paragraph(escape(invoice.notes), styles["BodyText"]))
    story.append(Spacer(1, 6 * mm))
    story.append(Paragraph(
        "Copia di cortesia. L'originale della fattura elettronica è trasmesso tramite il Sistema di Interscambio (SdI).",
        styles["Small"],
    ))
    doc.build(story)
    return buffer.getvalue()
