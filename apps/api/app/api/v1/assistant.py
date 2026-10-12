"""Read-only API for an AI assistant (MY SECRETARY or any other) over all workshop data.

Authentication: a NAKAMA API key created in Configurazione → Integrazioni with the
"assistant:read" scope, sent as `X-API-Key: nk_live_…` or `Authorization: Bearer nk_live_…`.
GET /assistant/tools describes every endpoint as a tool (name, description, JSON schema)
so the assistant can call them directly.
"""
from datetime import date, datetime, timezone
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.deps import get_db
from app.models.billing import Invoice
from app.models.estimating import Estimate
from app.models.garage import Customer, RepairCase, Vehicle
from app.models.integrations import ApiKey
from app.services import assistant
from app.services import integrations as keys

router = APIRouter(prefix="/assistant", tags=["assistant"])
SCOPE = "assistant:read"

CaseStatus = Literal["NEW", "WAITING_APPROVAL", "APPROVED", "WAITING_PARTS", "IN_REPAIR", "PAINTING", "ASSEMBLY", "QUALITY_CONTROL", "READY", "DELIVERED", "INVOICED"]
EstimateStatusName = Literal["DRAFT", "READY", "SENT", "VIEWED", "APPROVED", "REJECTED", "EXPIRED", "SUPERSEDED"]
InvoiceStatusName = Literal["DRAFT", "ISSUED", "PAID", "CANCELLED"]


def assistant_key(
    db: Session = Depends(get_db),
    x_api_key: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> ApiKey:
    raw = x_api_key or ""
    if not raw and authorization and authorization.lower().startswith("bearer "):
        raw = authorization[7:]
    raw = raw.strip()
    if not raw.startswith(keys.KEY_PREFIX):
        raise HTTPException(status_code=401, detail="API key required")
    key = db.scalar(select(ApiKey).where(ApiKey.key_hash == keys.hash_key(raw), ApiKey.active.is_(True)))
    if key is None or SCOPE not in key.scopes.split():
        raise HTTPException(status_code=401, detail="Invalid API key")
    now = datetime.now(timezone.utc)
    last = key.last_used_at
    if last is not None and last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    if last is None or (now - last).total_seconds() > 60:
        key.last_used_at = now
        db.commit()
    return key


def owned(db: Session, model, item_id: UUID, key: ApiKey, label: str):
    item = db.scalar(select(model).where(model.id == item_id, model.tenant_id == key.tenant_id))
    if item is None:
        raise HTTPException(status_code=404, detail=f"{label} not found")
    return item


@router.get("")
def info(db: Session = Depends(get_db), key: ApiKey = Depends(assistant_key)):
    """Who you are talking to and where the tool catalogue is."""
    return {"service": "NAKAMA CAR", "key_name": key.name, "workshop": assistant.workshop(db, key.tenant_id), "tools": "/api/v1/assistant/tools", "read_only": True}


@router.get("/tools")
def tools(key: ApiKey = Depends(assistant_key)):
    """Tool definitions (Anthropic tool-use format) with the HTTP call behind each one."""
    return {"base_path": "/api/v1", "auth_header": "X-API-Key", "tools": TOOLS}


@router.get("/summary")
def summary(db: Session = Depends(get_db), key: ApiKey = Depends(assistant_key)):
    return assistant.summary(db, key.tenant_id)


@router.get("/search")
def search(q: str = Query(min_length=2, max_length=80), db: Session = Depends(get_db), key: ApiKey = Depends(assistant_key)):
    return assistant.search(db, key.tenant_id, q)


@router.get("/cases")
def cases(
    status: CaseStatus | None = None,
    open: bool = False,
    work_type: Literal["BODY", "MECHANICAL"] | None = None,
    customer_id: UUID | None = None,
    vehicle_id: UUID | None = None,
    limit: int = Query(default=50, ge=1, le=assistant.MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    key: ApiKey = Depends(assistant_key),
):
    return assistant.list_cases(db, key.tenant_id, status=status, open_only=open, work_type=work_type,
                                customer_id=customer_id, vehicle_id=vehicle_id, limit=limit, offset=offset)


@router.get("/cases/{case_id}")
def case(case_id: UUID, db: Session = Depends(get_db), key: ApiKey = Depends(assistant_key)):
    return assistant.case_detail(db, key.tenant_id, owned(db, RepairCase, case_id, key, "Case"))


@router.get("/customers")
def customers(
    q: str | None = Query(default=None, max_length=80),
    limit: int = Query(default=50, ge=1, le=assistant.MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    key: ApiKey = Depends(assistant_key),
):
    return assistant.list_customers(db, key.tenant_id, q=q, limit=limit, offset=offset)


@router.get("/customers/{customer_id}")
def customer(customer_id: UUID, db: Session = Depends(get_db), key: ApiKey = Depends(assistant_key)):
    return assistant.customer_full(db, key.tenant_id, owned(db, Customer, customer_id, key, "Customer"))


@router.get("/vehicles")
def vehicles(
    q: str | None = Query(default=None, max_length=80),
    maintenance: Literal["DUE", "SOON", "OK", "UNKNOWN"] | None = None,
    limit: int = Query(default=50, ge=1, le=assistant.MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    key: ApiKey = Depends(assistant_key),
):
    return assistant.list_vehicles(db, key.tenant_id, q=q, maintenance=maintenance, limit=limit, offset=offset)


@router.get("/vehicles/{vehicle_id}")
def vehicle(vehicle_id: UUID, db: Session = Depends(get_db), key: ApiKey = Depends(assistant_key)):
    return assistant.vehicle_full(db, key.tenant_id, owned(db, Vehicle, vehicle_id, key, "Vehicle"))


@router.get("/estimates")
def estimates(
    status: EstimateStatusName | None = None,
    waiting: bool = False,
    limit: int = Query(default=50, ge=1, le=assistant.MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    key: ApiKey = Depends(assistant_key),
):
    return assistant.list_estimates(db, key.tenant_id, status=status, waiting=waiting, limit=limit, offset=offset)


@router.get("/estimates/{estimate_id}")
def estimate(estimate_id: UUID, db: Session = Depends(get_db), key: ApiKey = Depends(assistant_key)):
    return assistant.estimate_full(db, key.tenant_id, owned(db, Estimate, estimate_id, key, "Estimate"))


@router.get("/invoices")
def invoices(
    status: InvoiceStatusName | None = None,
    overdue: bool = False,
    date_from: date | None = None,
    date_to: date | None = None,
    limit: int = Query(default=50, ge=1, le=assistant.MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    key: ApiKey = Depends(assistant_key),
):
    return assistant.list_invoices(db, key.tenant_id, status=status, overdue=overdue, date_from=date_from, date_to=date_to, limit=limit, offset=offset)


@router.get("/invoices/{invoice_id}")
def invoice(invoice_id: UUID, db: Session = Depends(get_db), key: ApiKey = Depends(assistant_key)):
    return assistant.invoice_full(db, key.tenant_id, owned(db, Invoice, invoice_id, key, "Invoice"))


@router.get("/contracts")
def contracts(active: bool = True, db: Session = Depends(get_db), key: ApiKey = Depends(assistant_key)):
    return assistant.list_contracts(db, key.tenant_id, active_only=active)


@router.get("/messages")
def messages(
    unread: bool = False,
    limit: int = Query(default=50, ge=1, le=assistant.MAX_LIMIT),
    db: Session = Depends(get_db),
    key: ApiKey = Depends(assistant_key),
):
    """Customer chat messages. Reading them here does NOT mark them as read in the workshop."""
    return assistant.list_messages(db, key.tenant_id, unread_only=unread, limit=limit)


@router.get("/staff")
def staff(db: Session = Depends(get_db), key: ApiKey = Depends(assistant_key)):
    return assistant.list_staff(db, key.tenant_id)


def _tool(name: str, description: str, path: str, properties: dict | None = None, required: list[str] | None = None) -> dict:
    return {
        "name": name,
        "description": description,
        "input_schema": {"type": "object", "properties": properties or {}, "required": required or []},
        "http": {"method": "GET", "path": path},
    }


_ID = {"type": "string", "format": "uuid"}
_LIMIT = {"type": "integer", "minimum": 1, "maximum": assistant.MAX_LIMIT, "description": "Max rows (default 50)"}
_OFFSET = {"type": "integer", "minimum": 0}

TOOLS = [
    _tool("nakama_summary", "Panoramica dell'officina oggi: pratiche aperte per stato, veicoli pronti, preventivi in attesa, fatture da incassare e scadute, incassi del mese, messaggi non letti, tagliandi in scadenza.", "/assistant/summary"),
    _tool("nakama_search", "Cerca per targa, telaio, nome/ragione sociale, telefono, email, P.IVA o numero di pratica/preventivo/fattura.", "/assistant/search",
          {"q": {"type": "string", "minLength": 2}}, ["q"]),
    _tool("nakama_list_cases", "Elenco pratiche di riparazione (carrozzeria o meccanica) con cliente e veicolo. Filtri: stato, solo aperte, tipo di lavoro, cliente, veicolo.", "/assistant/cases",
          {"status": {"type": "string", "enum": list(CaseStatus.__args__)}, "open": {"type": "boolean"}, "work_type": {"type": "string", "enum": ["BODY", "MECHANICAL"]},
           "customer_id": _ID, "vehicle_id": _ID, "limit": _LIMIT, "offset": _OFFSET}),
    _tool("nakama_get_case", "Tutto su una pratica: danni, ricambi e lavorazioni, preventivi con righe e risposta del cliente, ordini di lavoro e compiti con il tecnico assegnato, foto, chat col cliente, fatture.", "/assistant/cases/{case_id}",
          {"case_id": _ID}, ["case_id"]),
    _tool("nakama_list_customers", "Elenco clienti (privati e aziende), con ricerca per nome, email o telefono.", "/assistant/customers",
          {"q": {"type": "string"}, "limit": _LIMIT, "offset": _OFFSET}),
    _tool("nakama_get_customer", "Scheda cliente completa: anagrafica e dati fiscali, veicoli con stato tagliando, pratiche, fatture, contratti.", "/assistant/customers/{customer_id}",
          {"customer_id": _ID}, ["customer_id"]),
    _tool("nakama_list_vehicles", "Elenco veicoli con piano di manutenzione. Filtri: testo (targa, marca, modello, telaio, n° flotta) e stato tagliando (DUE scaduto, SOON in scadenza).", "/assistant/vehicles",
          {"q": {"type": "string"}, "maintenance": {"type": "string", "enum": ["DUE", "SOON", "OK", "UNKNOWN"]}, "limit": _LIMIT, "offset": _OFFSET}),
    _tool("nakama_get_vehicle", "Scheda veicolo: dati tecnici, manutenzione (km e date), ultima telemetria GPS (km, spie accese, codici guasto, stile di guida), cliente e storico pratiche.", "/assistant/vehicles/{vehicle_id}",
          {"vehicle_id": _ID}, ["vehicle_id"]),
    _tool("nakama_list_estimates", "Elenco preventivi con totali e pratica. waiting=true: solo quelli in attesa di risposta del cliente.", "/assistant/estimates",
          {"status": {"type": "string", "enum": list(EstimateStatusName.__args__)}, "waiting": {"type": "boolean"}, "limit": _LIMIT, "offset": _OFFSET}),
    _tool("nakama_get_estimate", "Preventivo con tutte le righe (ricambi, manodopera, verniciatura, materiali, IVA).", "/assistant/estimates/{estimate_id}",
          {"estimate_id": _ID}, ["estimate_id"]),
    _tool("nakama_list_invoices", "Elenco fatture. Filtri: stato, solo scadute non pagate, intervallo di date di emissione (YYYY-MM-DD).", "/assistant/invoices",
          {"status": {"type": "string", "enum": list(InvoiceStatusName.__args__)}, "overdue": {"type": "boolean"},
           "date_from": {"type": "string", "format": "date"}, "date_to": {"type": "string", "format": "date"}, "limit": _LIMIT, "offset": _OFFSET}),
    _tool("nakama_get_invoice", "Fattura con righe, scadenza e pagamento.", "/assistant/invoices/{invoice_id}",
          {"invoice_id": _ID}, ["invoice_id"]),
    _tool("nakama_list_contracts", "Contratti di manutenzione flotte (canone, manodopera inclusa, ricarico ricambi) con cliente e numero di veicoli.", "/assistant/contracts",
          {"active": {"type": "boolean"}}),
    _tool("nakama_list_messages", "Messaggi della chat clienti con la pratica collegata. unread=true: solo quelli dei clienti non ancora letti in officina.", "/assistant/messages",
          {"unread": {"type": "boolean"}, "limit": _LIMIT}),
    _tool("nakama_list_staff", "Personale dell'officina con ruoli e compiti aperti assegnati a ciascuno.", "/assistant/staff"),
]
