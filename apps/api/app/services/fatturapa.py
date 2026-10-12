"""FatturaPA (FPR12, B2B/B2C) XML generation for the Italian Sistema di Interscambio.

The XML is produced unsigned: it is meant to be uploaded to the Agenzia delle Entrate
"Fatture e Corrispettivi" portal or sent through an accredited intermediary.
"""
import re
from collections import defaultdict
from decimal import Decimal
from xml.etree import ElementTree as ET

from app.services.pricing import money

NAMESPACE = "http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2"
DS_NAMESPACE = "http://www.w3.org/2000/09/xmldsig#"
XSI_NAMESPACE = "http://www.w3.org/2001/XMLSchema-instance"
SCHEMA_LOCATION = (
    "http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2 "
    "http://www.fatturapa.gov.it/export/fatturazione/sdi/fatturapa/v1.2/Schema_del_file_xml_FatturaPA_versione_1.2.xsd"
)


class FatturaPAError(ValueError):
    """Raised when mandatory data for the electronic invoice is missing."""

    def __init__(self, missing: list[str]):
        super().__init__("Missing data for FatturaPA: " + ", ".join(missing))
        self.missing = missing


def _amount(value: Decimal) -> str:
    return f"{money(Decimal(value)):.2f}"


def _clean(value: str | None, limit: int) -> str:
    text = " ".join((value or "").split())
    return text[:limit]


def _vat_code(value: str | None) -> str:
    code = re.sub(r"[^0-9A-Za-z]", "", value or "").upper()
    return code[2:] if code.startswith("IT") and len(code) == 13 else code


def _sub(parent: ET.Element, tag: str, text: str | None = None) -> ET.Element:
    element = ET.SubElement(parent, tag)
    if text is not None:
        element.text = text
    return element


def transmission_code(invoice_number: str) -> str:
    """ProgressivoInvio: up to 10 alphanumeric characters, unique per invoice."""
    compact = re.sub(r"[^0-9A-Za-z]", "", invoice_number)
    return compact[-10:] or "1"


def validate(invoice, lines, customer, settings) -> list[str]:
    missing: list[str] = []
    if invoice.status.value == "DRAFT":
        missing.append("fattura emessa (stato ISSUED)")
    if invoice.issue_date is None:
        missing.append("data fattura")
    if settings is None:
        return missing + ["dati azienda"]
    if not settings.company_name:
        missing.append("ragione sociale azienda")
    if not _vat_code(settings.vat_number):
        missing.append("partita IVA azienda")
    for field, label in (("address", "indirizzo azienda"), ("postal_code", "CAP azienda"), ("city", "comune azienda")):
        if not getattr(settings, field):
            missing.append(label)
    if customer is None:
        return missing + ["cliente"]
    if not (_vat_code(customer.vat_number) or customer.tax_code):
        missing.append("partita IVA o codice fiscale cliente")
    if not (customer.company_name or customer.first_name or customer.last_name):
        missing.append("nome cliente")
    for field, label in (("address", "indirizzo cliente"), ("postal_code", "CAP cliente"), ("city", "comune cliente")):
        if not getattr(customer, field):
            missing.append(label)
    if not lines:
        missing.append("righe fattura")
    if any(Decimal(line.vat_rate) == 0 for line in lines):
        missing.append("natura IVA per righe con aliquota 0% (non supportata: usare un'aliquota o emettere dal gestionale fiscale)")
    return missing


def build_fatturapa_xml(*, invoice, lines, customer, settings, company_name: str) -> tuple[str, bytes]:
    """Return (filename, xml bytes). Raises FatturaPAError when data is incomplete."""
    missing = validate(invoice, lines, customer, settings)
    if missing:
        raise FatturaPAError(missing)

    ET.register_namespace("p", NAMESPACE)
    ET.register_namespace("ds", DS_NAMESPACE)
    ET.register_namespace("xsi", XSI_NAMESPACE)
    root = ET.Element(f"{{{NAMESPACE}}}FatturaElettronica", {
        "versione": "FPR12",
        f"{{{XSI_NAMESPACE}}}schemaLocation": SCHEMA_LOCATION,
    })
    seller_vat = _vat_code(settings.vat_number)
    seller_country = (settings.country or "IT").upper()
    customer_country = (customer.country or "IT").upper()

    header = _sub(root, "FatturaElettronicaHeader")
    transmission = _sub(header, "DatiTrasmissione")
    sender = _sub(transmission, "IdTrasmittente")
    _sub(sender, "IdPaese", seller_country)
    _sub(sender, "IdCodice", (settings.tax_code or seller_vat).upper())
    _sub(transmission, "ProgressivoInvio", transmission_code(invoice.invoice_number))
    _sub(transmission, "FormatoTrasmissione", "FPR12")
    recipient_code = (customer.sdi or "").strip().upper()
    if customer_country != "IT":
        recipient_code = "XXXXXXX"
    _sub(transmission, "CodiceDestinatario", recipient_code if len(recipient_code) in (6, 7) else "0000000")
    if customer_country == "IT" and len(recipient_code) not in (6, 7) and customer.pec:
        _sub(transmission, "PECDestinatario", customer.pec)

    seller = _sub(header, "CedentePrestatore")
    seller_data = _sub(seller, "DatiAnagrafici")
    seller_vat_element = _sub(seller_data, "IdFiscaleIVA")
    _sub(seller_vat_element, "IdPaese", seller_country)
    _sub(seller_vat_element, "IdCodice", seller_vat)
    if settings.tax_code:
        _sub(seller_data, "CodiceFiscale", settings.tax_code.upper())
    _sub(_sub(seller_data, "Anagrafica"), "Denominazione", _clean(settings.company_name or company_name, 80))
    _sub(seller_data, "RegimeFiscale", settings.regime_fiscale or "RF01")
    _address(seller, settings, seller_country)

    buyer = _sub(header, "CessionarioCommittente")
    buyer_data = _sub(buyer, "DatiAnagrafici")
    buyer_vat = _vat_code(customer.vat_number)
    if buyer_vat:
        buyer_vat_element = _sub(buyer_data, "IdFiscaleIVA")
        _sub(buyer_vat_element, "IdPaese", customer_country)
        _sub(buyer_vat_element, "IdCodice", buyer_vat)
    if customer.tax_code:
        _sub(buyer_data, "CodiceFiscale", customer.tax_code.strip().upper())
    registry = _sub(buyer_data, "Anagrafica")
    if customer.company_name:
        _sub(registry, "Denominazione", _clean(customer.company_name, 80))
    else:
        _sub(registry, "Nome", _clean(customer.first_name or "-", 60))
        _sub(registry, "Cognome", _clean(customer.last_name or "-", 60))
    _address(buyer, customer, customer_country)

    body = _sub(root, "FatturaElettronicaBody")
    general = _sub(_sub(body, "DatiGenerali"), "DatiGeneraliDocumento")
    _sub(general, "TipoDocumento", "TD01")
    _sub(general, "Divisa", "EUR")
    _sub(general, "Data", invoice.issue_date.isoformat())
    _sub(general, "Numero", invoice.invoice_number)

    goods = _sub(body, "DatiBeniServizi")
    summary: dict[Decimal, Decimal] = defaultdict(lambda: Decimal("0"))
    for index, line in enumerate(lines, start=1):
        detail = _sub(goods, "DettaglioLinee")
        _sub(detail, "NumeroLinea", str(index))
        _sub(detail, "Descrizione", _clean(line.description, 1000) or "Prestazione")
        _sub(detail, "Quantita", f"{Decimal(line.quantity):.2f}")
        _sub(detail, "PrezzoUnitario", _amount(line.unit_price))
        _sub(detail, "PrezzoTotale", _amount(line.line_subtotal))
        rate = Decimal(line.vat_rate)
        _sub(detail, "AliquotaIVA", f"{rate:.2f}")
        summary[rate] += Decimal(line.line_subtotal)

    document_total = Decimal("0")
    for rate, taxable in sorted(summary.items()):
        tax = money(taxable * rate / Decimal("100"))
        document_total += money(taxable) + tax
        recap = _sub(goods, "DatiRiepilogo")
        _sub(recap, "AliquotaIVA", f"{rate:.2f}")
        _sub(recap, "ImponibileImporto", _amount(taxable))
        _sub(recap, "Imposta", _amount(tax))
        _sub(recap, "EsigibilitaIVA", "I")
    # ImportoTotaleDocumento goes right after Numero in the XSD sequence.
    total_element = ET.Element("ImportoTotaleDocumento")
    total_element.text = _amount(document_total)
    general.append(total_element)

    if invoice.payment_method:
        payment = _sub(body, "DatiPagamento")
        _sub(payment, "CondizioniPagamento", "TP02")
        payment_detail = _sub(payment, "DettaglioPagamento")
        _sub(payment_detail, "ModalitaPagamento", invoice.payment_method)
        if invoice.due_date:
            _sub(payment_detail, "DataScadenzaPagamento", invoice.due_date.isoformat())
        _sub(payment_detail, "ImportoPagamento", _amount(document_total))
        if invoice.payment_method == "MP05" and settings.iban:
            _sub(payment_detail, "IBAN", re.sub(r"\s", "", settings.iban).upper())

    xml = ET.tostring(root, encoding="utf-8", xml_declaration=True)
    filename = f"{seller_country}{(settings.tax_code or seller_vat).upper()}_{transmission_code(invoice.invoice_number)[-5:]}.xml"
    return filename, xml


def _address(parent: ET.Element, source, country: str) -> None:
    seat = _sub(parent, "Sede")
    _sub(seat, "Indirizzo", _clean(source.address, 60))
    postal = re.sub(r"\s", "", source.postal_code or "")
    _sub(seat, "CAP", postal if country == "IT" else "00000")
    _sub(seat, "Comune", _clean(source.city, 60))
    if country == "IT" and source.province and len(source.province.strip()) == 2:
        _sub(seat, "Provincia", source.province.strip().upper())
    _sub(seat, "Nazione", country)
