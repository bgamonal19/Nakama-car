"use client";

import { useLanguage, LanguageSwitcher } from "../components/LanguageProvider";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, getAccessToken } from "../lib/api";
import { NakamaLogo } from "../components/NakamaLogo";

type DamageStatus = "NO_DAMAGE" | "CHECK" | "REPAIR" | "REPLACE" | "PAINT";

type EstimateLine = {
  id: string;
  description: string;
  category: string;
  quantity: number;
  unitPrice: number;
  laborHours: number;
  laborRate: number;
  paintHours: number;
  paintRate: number;
  materials: number;
  vatRate: number;
};

const steps = [
  "Targa",
  "Cliente",
  "Veicolo",
  "Foto",
  "Danni",
  "Operazioni",
  "Preventivo",
  "Conferma",
];

const vehicleAreas = [
  ["FRONT_BUMPER", "Paraurti anteriore"],
  ["REAR_BUMPER", "Paraurti posteriore"],
  ["HOOD", "Cofano"],
  ["ROOF", "Tetto"],
  ["FRONT_LEFT_FENDER", "Parafango ant. sinistro"],
  ["FRONT_RIGHT_FENDER", "Parafango ant. destro"],
  ["FRONT_LEFT_DOOR", "Porta ant. sinistra"],
  ["FRONT_RIGHT_DOOR", "Porta ant. destra"],
  ["REAR_LEFT_DOOR", "Porta post. sinistra"],
  ["REAR_RIGHT_DOOR", "Porta post. destra"],
  ["LEFT_HEADLIGHT", "Faro sinistro"],
  ["RIGHT_HEADLIGHT", "Faro destro"],
  ["WINDSHIELD", "Parabrezza"],
  ["LEFT_MIRROR", "Specchio sinistro"],
  ["RIGHT_MIRROR", "Specchio destro"],
];

const statusLabel: Record<DamageStatus, string> = {
  NO_DAMAGE: "Nessun danno",
  CHECK: "Verificare",
  REPAIR: "Riparare",
  REPLACE: "Sostituire",
  PAINT: "Verniciare",
};

const demoPractices = [
  { code: "NC-2026-000018", plate: "GP742LM", car: "BMW Serie 3", client: "Marco Bianchi", status: "IN_REPAIR" },
  { code: "NC-2026-000017", plate: "FK318ST", car: "Fiat 500X", client: "Laura Rossi", status: "WAITING_PARTS" },
  { code: "NC-2026-000016", plate: "GH625AA", car: "Audi A3", client: "Auto Service SRL", status: "READY" },
];

type DashboardData = {
  open_cases: number;
  waiting_approval: number;
  in_progress: number;
  ready: number;
  recent_practices: typeof demoPractices;
};

type WorkOrderSummary = {
  id: string;
  work_order_number: string;
  status: string;
  priority: string;
  repair_case_id: string;
};

function money(value: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(value || 0);
}

export default function HomePage() {
  const { t } = useLanguage();
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [workOrders, setWorkOrders] = useState<WorkOrderSummary[]>([]);
  const [plate, setPlate] = useState("");
  const [existingVehicleId, setExistingVehicleId] = useState<string | null>(null);
  const [existingCustomerId, setExistingCustomerId] = useState<string | null>(null);
  const [plateLookupMessage, setPlateLookupMessage] = useState("");
  const [customer, setCustomer] = useState({ firstName: "", lastName: "", company: "", phone: "", email: "", vat: "" });
  const [vehicle, setVehicle] = useState({ make: "", model: "", version: "", vin: "", year: "", mileage: "", color: "", paintCode: "", fuel: "50" });
  const [photos, setPhotos] = useState<Record<string, File>>({});
  const [damages, setDamages] = useState<Record<string, DamageStatus>>({});
  const [rates, setRates] = useState({ body: 45, mechanical: 50, paint: 48, electrical: 55, diagnostic: 60 });
  const [lines, setLines] = useState<EstimateLine[]>([
    {
      id: "1",
      description: "Riparazione paraurti anteriore",
      category: "BODY_LABOR",
      quantity: 1,
      unitPrice: 0,
      laborHours: 2.5,
      laborRate: 45,
      paintHours: 0,
      paintRate: 48,
      materials: 0,
      vatRate: 22,
    },
  ]);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("new") === "practice") {
      setWizardOpen(true);
    }
    setAuthenticated(Boolean(getAccessToken()));
    const api = process.env.NEXT_PUBLIC_API_URL;
    if (!api) return setApiOnline(false);
    fetch(`${api}/health`)
      .then((r) => setApiOnline(r.ok))
      .catch(() => setApiOnline(false));

    if (getAccessToken()) {
      apiFetch("/dashboard/summary")
        .then(async (r) => {
          if (r.ok) setDashboard(await r.json());
        })
        .catch(() => undefined);
      apiFetch("/work-orders")
        .then(async (r) => {
          if (r.ok) setWorkOrders(await r.json());
        })
        .catch(() => undefined);
    }
  }, []);

  const totals = useMemo(() => {
    let subtotal = 0;
    let vat = 0;
    for (const line of lines) {
      const base =
        line.quantity * line.unitPrice +
        line.laborHours * line.laborRate +
        line.paintHours * line.paintRate +
        line.materials;
      subtotal += base;
      vat += base * (line.vatRate / 100);
    }
    return { subtotal, vat, total: subtotal + vat };
  }, [lines]);

  const selectedDamageCount = Object.values(damages).filter((v) => v !== "NO_DAMAGE").length;

  function resetWizard() {
    setStep(0);
    setPlate("");
    setExistingVehicleId(null);
    setExistingCustomerId(null);
    setPlateLookupMessage("");
    setCustomer({ firstName: "", lastName: "", company: "", phone: "", email: "", vat: "" });
    setVehicle({ make: "", model: "", version: "", vin: "", year: "", mileage: "", color: "", paintCode: "", fuel: "50" });
    setPhotos({});
    setDamages({});
    setLines([]);
  }

  function addLine() {
    setLines((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        description: "",
        category: "PART",
        quantity: 1,
        unitPrice: 0,
        laborHours: 0,
        laborRate: rates.body,
        paintHours: 0,
        paintRate: rates.paint,
        materials: 0,
        vatRate: 22,
      },
    ]);
  }

  function updateLine(id: string, patch: Partial<EstimateLine>) {
    setLines((prev) => prev.map((line) => (line.id === id ? { ...line, ...patch } : line)));
  }

  async function lookupPlate() {
    const normalized = plate.trim().toUpperCase();
    if (!normalized || !getAccessToken()) {
      setPlateLookupMessage(getAccessToken() ? "Inserisci una targa." : "Accedi per cercare veicoli esistenti.");
      return;
    }
    setPlateLookupMessage("Ricerca in corso…");
    setExistingVehicleId(null);
    setExistingCustomerId(null);
    try {
      const r = await apiFetch(`/vehicles/by-plate/${encodeURIComponent(normalized)}`);
      if (r.status === 404) {
        setPlateLookupMessage("Targa non presente: verrà creato un nuovo veicolo.");
        return;
      }
      if (!r.ok) {
        setPlateLookupMessage("Impossibile verificare la targa.");
        return;
      }
      const found = await r.json();
      setExistingVehicleId(found.id);
      setVehicle({
        make: found.make || "",
        model: found.model || "",
        version: found.version || "",
        vin: found.vin || "",
        year: found.year ? String(found.year) : "",
        mileage: found.mileage ? String(found.mileage) : "",
        color: found.color_name || "",
        paintCode: found.paint_code || "",
        fuel: "50",
      });

      if (found.customer_id) {
        const customerResponse = await apiFetch(`/customers/${found.customer_id}`);
        if (customerResponse.ok) {
          const foundCustomer = await customerResponse.json();
          setExistingCustomerId(foundCustomer.id);
          setCustomer({
            firstName: foundCustomer.first_name || "",
            lastName: foundCustomer.last_name || "",
            company: foundCustomer.company_name || "",
            phone: foundCustomer.phone || "",
            email: foundCustomer.email || "",
            vat: foundCustomer.vat_number || "",
          });
        }
      }
      setPlateLookupMessage("Veicolo trovato: dati caricati dalla tua anagrafica.");
    } catch {
      setPlateLookupMessage("Errore durante la ricerca targa.");
    }
  }

  async function savePilotPractice() {
    if (!getAccessToken()) {
      const payload = { plate, customer, vehicle, photos: Object.keys(photos), damages, lines, totals, createdAt: new Date().toISOString() };
      const previous = JSON.parse(localStorage.getItem("nakama-pilot-practices") || "[]");
      localStorage.setItem("nakama-pilot-practices", JSON.stringify([payload, ...previous]));
      alert(t("Pratica salvata in modalità pilot locale. Accedi per salvarla nel database."));
      setWizardOpen(false);
      resetWizard();
      return;
    }

    setSaving(true);
    try {
      let savedCustomer: { id: string };
      let savedVehicle: { id: string };

      if (existingVehicleId && existingCustomerId) {
        const [customerUpdateResponse, vehicleUpdateResponse] = await Promise.all([
          apiFetch(`/customers/${existingCustomerId}`, {
            method: "PATCH",
            body: JSON.stringify({
              first_name: customer.firstName || null,
              last_name: customer.lastName || null,
              company_name: customer.company || null,
              vat_number: customer.vat || null,
              phone: customer.phone || null,
              email: customer.email || null,
            }),
          }),
          apiFetch(`/vehicles/${existingVehicleId}`, {
            method: "PATCH",
            body: JSON.stringify({
              vin: vehicle.vin || null,
              make: vehicle.make || null,
              model: vehicle.model || null,
              version: vehicle.version || null,
              year: vehicle.year ? Number(vehicle.year) : null,
              mileage: vehicle.mileage ? Number(vehicle.mileage) : null,
              color_name: vehicle.color || null,
              paint_code: vehicle.paintCode || null,
            }),
          }),
        ]);
        if (!customerUpdateResponse.ok) throw new Error("Errore aggiornamento cliente");
        if (!vehicleUpdateResponse.ok) throw new Error("Errore aggiornamento veicolo");
        savedCustomer = { id: existingCustomerId };
        savedVehicle = { id: existingVehicleId };
      } else {
        const customerResponse = await apiFetch("/customers", {
          method: "POST",
          body: JSON.stringify({
            customer_type: customer.company ? "COMPANY" : "PRIVATE",
            first_name: customer.firstName || null,
            last_name: customer.lastName || null,
            company_name: customer.company || null,
            vat_number: customer.vat || null,
            phone: customer.phone || null,
            email: customer.email || null,
            country: "IT",
          }),
        });
        if (!customerResponse.ok) throw new Error((await customerResponse.json()).detail || "Errore cliente");
        savedCustomer = await customerResponse.json();

        const vehicleResponse = await apiFetch("/vehicles", {
          method: "POST",
          body: JSON.stringify({
            customer_id: savedCustomer.id,
            license_plate: plate,
            vin: vehicle.vin || null,
            make: vehicle.make || null,
            model: vehicle.model || null,
            version: vehicle.version || null,
            year: vehicle.year ? Number(vehicle.year) : null,
            mileage: vehicle.mileage ? Number(vehicle.mileage) : null,
            color_name: vehicle.color || null,
            paint_code: vehicle.paintCode || null,
          }),
        });
        if (!vehicleResponse.ok) throw new Error((await vehicleResponse.json()).detail || "Errore veicolo");
        savedVehicle = await vehicleResponse.json();
      }

      const caseResponse = await apiFetch("/cases", {
        method: "POST",
        body: JSON.stringify({
          customer_id: savedCustomer.id,
          vehicle_id: savedVehicle.id,
          mileage: vehicle.mileage ? Number(vehicle.mileage) : null,
          fuel_level_percent: Number(vehicle.fuel),
          customer_notes: null,
          internal_notes: Object.keys(photos).length ? `Foto raccolte nel pilot UI: ${Object.keys(photos).join(", ")}` : null,
        }),
      });
      if (!caseResponse.ok) throw new Error((await caseResponse.json()).detail || "Errore pratica");
      const savedCase = await caseResponse.json();

      let mediaWarning = "";
      for (const [category, file] of Object.entries(photos)) {
        try {
          const targetResponse = await apiFetch(`/cases/${savedCase.id}/media/upload-target`, {
            method: "POST",
            body: JSON.stringify({
              filename: file.name,
              mime_type: file.type || "image/jpeg",
              category,
              media_type: "PHOTO",
            }),
          });
          if (!targetResponse.ok) {
            mediaWarning = "Foto non caricate: storage S3 non ancora configurato.";
            break;
          }
          const target = await targetResponse.json();
          const uploadResponse = await fetch(target.upload_url, {
            method: "PUT",
            headers: { "Content-Type": file.type || "image/jpeg" },
            body: file,
          });
          if (!uploadResponse.ok) {
            mediaWarning = "Alcune foto non sono state caricate.";
            continue;
          }
          const registerResponse = await apiFetch(`/cases/${savedCase.id}/media`, {
            method: "POST",
            body: JSON.stringify({
              storage_key: target.storage_key,
              original_filename: file.name,
              mime_type: file.type || "image/jpeg",
              size_bytes: file.size,
              category,
              media_type: "PHOTO",
            }),
          });
          if (!registerResponse.ok) mediaWarning = "Alcune foto non sono state registrate.";
        } catch {
          mediaWarning = "Foto non caricate: verifica lo storage.";
        }
      }

      for (const [code, operation] of Object.entries(damages)) {
        if (operation === "NO_DAMAGE") continue;
        const damageResponse = await apiFetch(`/cases/${savedCase.id}/damages/${code}`, {
          method: "PUT",
          body: JSON.stringify({ vehicle_area_code: code, operation }),
        });
        if (!damageResponse.ok) throw new Error("Errore salvataggio danni");
      }

      const estimateResponse = await apiFetch("/estimates", {
        method: "POST",
        body: JSON.stringify({ repair_case_id: savedCase.id }),
      });
      if (!estimateResponse.ok) throw new Error((await estimateResponse.json()).detail || "Errore preventivo");
      const savedEstimate = await estimateResponse.json();

      for (const line of lines.filter((x) => x.description.trim())) {
        const lineResponse = await apiFetch(`/estimates/${savedEstimate.id}/lines`, {
          method: "POST",
          body: JSON.stringify({
            category: line.category,
            description: line.description,
            quantity: line.quantity,
            unit_price: line.unitPrice,
            discount_percent: 0,
            labor_hours: line.laborHours,
            labor_rate: line.laborRate,
            paint_hours: line.paintHours,
            paint_rate: line.paintRate,
            materials: line.materials,
            vat_rate: line.vatRate,
          }),
        });
        if (!lineResponse.ok) throw new Error("Errore riga preventivo");
      }

      alert(t(t("Pratica {case} salvata nel database. Preventivo {estimate} creato.").replace("{case}", savedCase.case_number).replace("{estimate}", savedEstimate.estimate_number) + (mediaWarning ? "\n" + t(mediaWarning) : "")));
      const [summaryResponse, workOrdersResponse] = await Promise.all([
        apiFetch("/dashboard/summary"),
        apiFetch("/work-orders"),
      ]);
      if (summaryResponse.ok) setDashboard(await summaryResponse.json());
      if (workOrdersResponse.ok) setWorkOrders(await workOrdersResponse.json());
      setWizardOpen(false);
      resetWizard();
    } catch (error) {
      alert(t(error instanceof Error ? error.message : "Errore durante il salvataggio"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="app-shell nakama-theme">
      <aside className="sidebar">
        <a className="brand brand-link nakama-sidebar-brand" href="/">
          <NakamaLogo />
        </a>

        <nav>
          <a className="nav-item active" href="/">{t("▦ Dashboard")}</a>
          <a className="nav-item" href="/clienti">{t("◎ Clienti")}</a>
          <a className="nav-item" href="/veicoli">{t("◇ Veicoli")}</a>
          <a className="nav-item" href="/pratiche">{t("▤ Pratiche")}</a>
          <a className="nav-item" href="/preventivi">{t("€ Preventivi")}</a>
          <a className="nav-item" href="/lavori">{t("⌁ Lavori in officina")}</a>
          <a className="nav-item" href="/fatture">{t("◫ Fatture")}</a>
          <a className="nav-item" href="/personale">{t("♙ Personale")}</a>
        </nav>

        <div className="sidebar-bottom">
          <a className="nav-item" href="/configurazione">{t("⚙ Impostazioni")}</a>
          <a className="nav-item" href="/audit">{t("◷ Audit log")}</a>
          <LanguageSwitcher />
          <div className="nakama-location"><strong>NAKAMA CAR</strong><span>Bussnago · Lombardia</span><i><b></b><b></b><b></b></i></div>
        </div>
      </aside>
      <div className="mobile-language"><LanguageSwitcher /></div>

      <section className="workspace">
        <header className="topbar nakama-topbar">
          <div className="dashboard-search">⌕ <span>{t("Cerca cliente, veicolo, pratica...")}</span></div>
          <div className="top-actions">
            <button className="icon-button" aria-label={t("Notifiche")}>♢<span className="notification-dot">3</span></button>
            <div className={`api-pill ${apiOnline ? "online" : apiOnline === false ? "offline" : ""}`}><span />{apiOnline === null ? "API..." : apiOnline ? t("Online") : t("Offline")}</div>
            {authenticated ? <div className="user-chip"><b>NC</b><span><strong>NAKAMA CAR</strong><small>{t("Amministratore")}</small></span></div> : <a className="login-link" href="/login">{t("Accedi")}</a>}
          </div>
        </header>

        <section className="nakama-hero photo-hero">
          <img src="/brand/nakama-welcome.webp" alt={t("Carrozzeria NAKAMA CAR")} width={1672} height={941} fetchPriority="high" className="photo-hero-image" />
          <div className="photo-hero-content">
            <p className="eyebrow">{t("BENVENUTO IN")}</p>
            <h1>NAKAMA <span>CAR</span></h1>
            <p>{t("Carrozzeria e servizi auto · Qualità in ogni dettaglio")}</p>
            <div className="hero-values"><span>{t("Esperienza")}</span><span>{t("Tecnologia")}</span><span>{t("Qualità")}</span><span>{t("Affidabilità")}</span></div>
          </div>
          <div className="hero-signature">{t("Più di una carrozzeria, un partner per la tua auto")}</div>
        </section>

        <div className="nakama-actions">
          <button className="nakama-action blue" onClick={() => setWizardOpen(true)}><b>▤</b><span><strong>{t("Nuova Pratica")}</strong><small>{t("Apri una nuova pratica")}</small></span></button>
          <button className="nakama-action green" onClick={() => setWizardOpen(true)}><b>▦</b><span><strong>{t("Nuovo Preventivo")}</strong><small>{t("Crea un preventivo")}</small></span></button>
          <a className="nakama-action red" href="/lavori"><b>⌁</b><span><strong>{t("Ordine di Lavoro")}</strong><small>{t("Invia in officina")}</small></span></a>
          <a className="nakama-action white" href="/clienti"><b>◎</b><span><strong>{t("Nuovo Cliente")}</strong><small>{t("Gestisci anagrafica")}</small></span></a>
          <a className="nakama-action white" href="/veicoli"><b>◇</b><span><strong>{t("Nuovo Veicolo")}</strong><small>{t("Consulta veicoli")}</small></span></a>
        </div>

        <div className="kpi-grid nakama-kpis">
          <div className="kpi-card"><span>{t("Pratiche aperte")}</span><strong>{dashboard?.open_cases ?? 12}</strong><small>{authenticated ? t("Dati live NAKAMA CAR") : t("Demo pilot")}</small></div>
          <div className="kpi-card"><span>{t("In attesa approvazione")}</span><strong>{dashboard?.waiting_approval ?? 5}</strong><small>{t("Preventivi da seguire")}</small></div>
          <div className="kpi-card"><span>{t("Lavori in corso")}</span><strong>{dashboard?.in_progress ?? 4}</strong><small>{t("Carrozzeria / verniciatura")}</small></div>
          <div className="kpi-card"><span>{t("Pronte consegna")}</span><strong>{dashboard?.ready ?? 3}</strong><small>{t("Da contattare")}</small></div>
        </div>

        <div className="dashboard-lower-grid">
          <div className="panel status-panel">
            <div className="panel-head"><div><h2>{t("Stato pratiche")}</h2><p>{t("Distribuzione operativa")}</p></div></div>
            <div className="status-overview">
              <div className="donut"><div><strong>{dashboard?.open_cases ?? 12}</strong><span>{t("Totali")}</span></div></div>
              <div className="status-legend">
                <span><i className="legend green"/>{t("Preventivo")} <b>{dashboard?.waiting_approval ?? 5}</b></span>
                <span><i className="legend blue"/>{t("In lavorazione")} <b>{dashboard?.in_progress ?? 4}</b></span>
                <span><i className="legend red"/>{t("In attesa ricambi")} <b>{workOrders.filter(x => x.status === "WAITING_PARTS").length || 2}</b></span>
                <span><i className="legend yellow"/>{t("Pronto")} <b>{dashboard?.ready ?? 3}</b></span>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><div><h2>{t("Ultime pratiche")}</h2><p>{t("Attività recenti")}</p></div><a className="ghost link-button" href="/pratiche">{t("Vedi tutte →")}</a></div>
            <div className="practice-table compact">
              {(dashboard?.recent_practices?.length ? dashboard.recent_practices : demoPractices).slice(0,4).map((p) => (
                <div className="practice-row" key={p.code}>
                  <div className="vehicle-thumb">🚗</div>
                  <div><strong>{p.code}</strong><span>{p.car} · {p.client}</span></div>
                  <div><span className={`status status-${p.status.toLowerCase()}`}>{t(p.status)}</span></div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel appointments-panel">
            <div className="panel-head"><div><h2>{t("Prossimi appuntamenti")}</h2><p>{t("Agenda carrozzeria")}</p></div><span className="ghost">Demo</span></div>
            <div className="appointments">
              <div className="appointment"><b>08<span>{t("SET")}</span></b><div><strong>{t("10:00 · Consegna veicolo")}</strong><small>{t("Controllo finale e documenti")}</small></div></div>
              <div className="appointment"><b>08<span>{t("SET")}</span></b><div><strong>{t("14:30 · Ritiro ricambi")}</strong><small>{t("Ordine ricambi carrozzeria")}</small></div></div>
              <div className="appointment"><b>09<span>{t("SET")}</span></b><div><strong>{t("09:00 · Inizio lavorazione")}</strong><small>{t("Ingresso in officina")}</small></div></div>
              <div className="appointment"><b>09<span>{t("SET")}</span></b><div><strong>{t("16:00 · Consegna preventivo")}</strong><small>{t("Approvazione cliente")}</small></div></div>
            </div>
          </div>
        </div>

        <div className="panel workshop-panel">
          <div className="panel-head"><div><h2>{t("Stato officina")}</h2><p>{t("Lavorazioni attive")}</p></div><a className="ghost link-button" href="/lavori">{t("Apri officina →")}</a></div>
          <div className="kanban">
            {authenticated && workOrders.length === 0 ? (
              <div className="kanban-empty">{t("Nessun ordine di lavoro attivo.")}</div>
            ) : (workOrders.length ? workOrders.slice(0, 4).map((order) => (
              <a className="kanban-card kanban-link" href="/lavori" key={order.id}><small>{t(order.status)}</small><strong>{order.work_order_number}</strong><span>{t("Priorità")} {t(order.priority)}</span></a>
            )) : [
              ["ATTESA RICAMBI", "FK318ST", "Fiat 500X"],
              ["IN RIPARAZIONE", "GP742LM", "BMW Serie 3"],
              ["VERNICIATURA", "LM904TR", "Mercedes Classe A"],
              ["CONTROLLO QUALITÀ", "GH625AA", "Audi A3"],
            ].map(([stage, tag, car]) => (
              <div className="kanban-card" key={tag}><small>{t(stage)}</small><strong>{tag}</strong><span>{car}</span></div>
            )))}
          </div>
        </div>
      </section>

      {wizardOpen && (
        <div className="modal-backdrop">
          <div className="wizard" role="dialog" aria-modal="true" aria-labelledby="intake-title">
            <div className="wizard-head">
              <div>
                <p className="eyebrow">{t("NUOVA PRATICA")}</p>
                <h2 id="intake-title">{t(steps[step])}</h2>
              </div>
              <button className="close" aria-label={t("Chiudi nuova pratica")} onClick={() => setWizardOpen(false)}>×</button>
            </div>

            <div className="stepper">
              {steps.map((label, index) => (
                <button key={label} className={index === step ? "current" : index < step ? "done" : ""} onClick={() => setStep(index)}>
                  <span>{index < step ? "✓" : index + 1}</span><small>{t(label)}</small>
                </button>
              ))}
            </div>

            <div className="wizard-body">
              {step === 0 && (
                <div className="hero-step">
                  <label>{t("Targa del veicolo")}</label>
                  <input className="plate-input" placeholder="AB123CD" value={plate} onChange={(e) => { setPlate(e.target.value.toUpperCase()); setExistingVehicleId(null); setExistingCustomerId(null); setPlateLookupMessage(""); }} autoFocus />
                  {authenticated && <button className="secondary plate-search" type="button" onClick={lookupPlate}>{t("Cerca nella tua anagrafica")}</button>}
                  {plateLookupMessage && <div className={`plate-lookup-message ${existingVehicleId ? "found" : ""}`}>{t(plateLookupMessage)}</div>}
                  <p>{t("La ricerca usa prima l'anagrafica NAKAMA CAR. DAT / GT Motive potrà essere collegato successivamente per identificazione esterna e dati tecnici licenziati.")}</p>
                </div>
              )}

              {step === 1 && (
                <div className="form-grid">
                  <Field label={t("Nome")} value={customer.firstName} onChange={(v) => setCustomer({ ...customer, firstName: v })} />
                  <Field label={t("Cognome")} value={customer.lastName} onChange={(v) => setCustomer({ ...customer, lastName: v })} />
                  <Field label={t("Azienda")} value={customer.company} onChange={(v) => setCustomer({ ...customer, company: v })} />
                  <Field label={t("Partita IVA")} value={customer.vat} onChange={(v) => setCustomer({ ...customer, vat: v })} />
                  <Field label={t("Telefono")} value={customer.phone} onChange={(v) => setCustomer({ ...customer, phone: v })} />
                  <Field label={t("Email")} value={customer.email} onChange={(v) => setCustomer({ ...customer, email: v })} />
                </div>
              )}

              {step === 2 && (
                <div className="form-grid">
                  <Field label={t("Marca")} value={vehicle.make} onChange={(v) => setVehicle({ ...vehicle, make: v })} />
                  <Field label={t("Modello")} value={vehicle.model} onChange={(v) => setVehicle({ ...vehicle, model: v })} />
                  <Field label={t("Versione")} value={vehicle.version} onChange={(v) => setVehicle({ ...vehicle, version: v })} />
                  <Field label="VIN" value={vehicle.vin} onChange={(v) => setVehicle({ ...vehicle, vin: v.toUpperCase() })} />
                  <Field label={t("Anno")} value={vehicle.year} onChange={(v) => setVehicle({ ...vehicle, year: v })} />
                  <Field label={t("Chilometri")} value={vehicle.mileage} onChange={(v) => setVehicle({ ...vehicle, mileage: v })} />
                  <Field label={t("Colore")} value={vehicle.color} onChange={(v) => setVehicle({ ...vehicle, color: v })} />
                  <Field label={t("Codice vernice")} value={vehicle.paintCode} onChange={(v) => setVehicle({ ...vehicle, paintCode: v })} />
                  <div className="field full"><label>{t("Carburante:")} {vehicle.fuel}%</label><input type="range" min="0" max="100" value={vehicle.fuel} onChange={(e) => setVehicle({ ...vehicle, fuel: e.target.value })} /></div>
                </div>
              )}

              {step === 3 && (
                <div className="photo-grid">
                  {[
                    ["FRONT", "Frontale"], ["REAR", "Posteriore"], ["LEFT", "Lato sinistro"], ["RIGHT", "Lato destro"],
                    ["INTERIOR", "Interni"], ["DAMAGE", "Danni specifici"], ["VIN", "VIN"], ["ODOMETER", "Contachilometri"],
                  ].map(([key, label]) => (
                    <label className={`photo-slot ${photos[key] ? "captured" : ""}`} key={key}>
                      <input type="file" accept="image/*" capture="environment" onChange={(e) => e.target.files?.[0] && setPhotos({ ...photos, [key]: e.target.files[0] })} />
                      <b>{photos[key] ? "✓" : "+"}</b><span>{t(label)}</span><small>{photos[key]?.name || t("Scatta o carica foto")}</small>
                    </label>
                  ))}
                </div>
              )}

              {step === 4 && (
                <div>
                  <div className="summary-strip"><span>{t("Elementi con intervento")}</span><strong>{selectedDamageCount}</strong></div>
                  <div className="damage-grid">
                    {vehicleAreas.map(([code, label]) => (
                      <div className="damage-card" key={code}>
                        <span>{t(label)}</span>
                        <select value={damages[code] || "NO_DAMAGE"} onChange={(e) => setDamages({ ...damages, [code]: e.target.value as DamageStatus })}>
                          {Object.entries(statusLabel).map(([value, text]) => <option value={value} key={value}>{t(text)}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {step === 5 && (
                <div>
                  <div className="rates">
                    <h3>{t("Tariffe NAKAMA CAR")}</h3>
                    <div className="rate-grid">
                      <NumberField label={t("Carrozzeria €/h")} value={rates.body} onChange={(v) => setRates({ ...rates, body: v })} />
                      <NumberField label={t("Meccanica €/h")} value={rates.mechanical} onChange={(v) => setRates({ ...rates, mechanical: v })} />
                      <NumberField label={t("Verniciatura €/h")} value={rates.paint} onChange={(v) => setRates({ ...rates, paint: v })} />
                      <NumberField label={t("Elettrico €/h")} value={rates.electrical} onChange={(v) => setRates({ ...rates, electrical: v })} />
                      <NumberField label={t("Diagnosi €/h")} value={rates.diagnostic} onChange={(v) => setRates({ ...rates, diagnostic: v })} />
                    </div>
                  </div>
                  <div className="operation-suggestions">
                    {Object.entries(damages).filter(([, s]) => s !== "NO_DAMAGE").map(([code, status]) => (
                      <button key={code} onClick={() => setLines((prev) => [...prev, {
                        id: crypto.randomUUID(),
                        description: `${statusLabel[status]} · ${vehicleAreas.find((a) => a[0] === code)?.[1] || code}`,
                        category: status === "PAINT" ? "PAINT" : "BODY_LABOR",
                        quantity: 1, unitPrice: 0, laborHours: 1, laborRate: rates.body, paintHours: status === "PAINT" ? 1 : 0, paintRate: rates.paint, materials: 0, vatRate: 22,
                      }])}>+ {t(vehicleAreas.find((a) => a[0] === code)?.[1])} · {t(statusLabel[status])}</button>
                    ))}
                  </div>
                </div>
              )}

              {step === 6 && (
                <div>
                  <div className="estimate-head">
                    <div><h3>{t("Righe preventivo")}</h3><p>{t("Nessun dato OEM inventato: codici, prezzi e tempi vanno inseriti manualmente finché non è collegato un provider licenziato.")}</p></div>
                    <button className="secondary" onClick={addLine}>{t("+ Riga")}</button>
                  </div>
                  <div className="estimate-lines">
                    {lines.map((line, index) => (
                      <div className="estimate-line" key={line.id}>
                        <div className="line-no">{index + 1}</div>
                        <input className="line-description" placeholder="Descrizione operazione / ricambio" value={line.description} onChange={(e) => updateLine(line.id, { description: e.target.value })} />
                        <select value={line.category} onChange={(e) => updateLine(line.id, { category: e.target.value })}>
                          <option value="PART">{t("PART")}</option><option value="BODY_LABOR">{t("BODY_LABOR")}</option><option value="MECHANICAL_LABOR">{t("MECHANICAL_LABOR")}</option><option value="PAINT">{t("PAINT")}</option><option value="MATERIAL">{t("MATERIAL")}</option><option value="EXTERNAL_SERVICE">{t("EXTERNAL_SERVICE")}</option>
                        </select>
                        <NumberField compact label={t("Q.tà")} value={line.quantity} onChange={(v) => updateLine(line.id, { quantity: v })} />
                        <NumberField compact label={t("Prezzo")} value={line.unitPrice} onChange={(v) => updateLine(line.id, { unitPrice: v })} />
                        <NumberField compact label={t("Ore")} value={line.laborHours} onChange={(v) => updateLine(line.id, { laborHours: v })} />
                        <NumberField compact label="€/h" value={line.laborRate} onChange={(v) => updateLine(line.id, { laborRate: v })} />
                        <button className="delete-line" onClick={() => setLines((prev) => prev.filter((x) => x.id !== line.id))}>×</button>
                      </div>
                    ))}
                  </div>
                  <div className="totals">
                    <div><span>{t("Imponibile")}</span><strong>{money(totals.subtotal)}</strong></div>
                    <div><span>IVA</span><strong>{money(totals.vat)}</strong></div>
                    <div className="grand-total"><span>{t("TOTALE")}</span><strong>{money(totals.total)}</strong></div>
                  </div>
                </div>
              )}

              {step === 7 && (
                <div className="confirmation">
                  <div className="confirmation-title"><span>✓</span><div><h3>{t("Pratica pronta per essere creata")}</h3><p>{t("Controlla i dati prima del salvataggio.")}</p></div></div>
                  <div className="confirmation-grid">
                    <div><small>{t("TARGA")}</small><strong>{plate || "—"}</strong></div>
                    <div><small>{t("CLIENTE")}</small><strong>{customer.company || `${customer.firstName} ${customer.lastName}`.trim() || "—"}</strong></div>
                    <div><small>{t("VEICOLO")}</small><strong>{[vehicle.make, vehicle.model].filter(Boolean).join(" ") || "—"}</strong></div>
                    <div><small>{t("FOTO")}</small><strong>{Object.keys(photos).length}</strong></div>
                    <div><small>{t("DANNI")}</small><strong>{selectedDamageCount}</strong></div>
                    <div><small>{t("PREVENTIVO")}</small><strong>{money(totals.total)}</strong></div>
                  </div>
                  <div className="pilot-note">{authenticated ? t("Sessione autenticata: cliente, veicolo, pratica, danni e preventivo saranno salvati nel database multi-tenant.") : t("Modalità pilot: puoi testare tutto il flusso. Accedi per attivare il salvataggio nel database.")}</div>
                </div>
              )}
            </div>

            <div className="wizard-footer">
              <button className="ghost" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>{t("← Indietro")}</button>
              <div>
                {step < steps.length - 1 ? (
                  <button className="primary" onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}>{t("Continua →")}</button>
                ) : (
                  <button className="primary" onClick={savePilotPractice} disabled={saving}>{saving ? t("Salvataggio…") : t("Salva pratica")}</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const { t } = useLanguage();
  return <div className="field"><label>{t(label)}</label><input value={value} onChange={(e) => onChange(e.target.value)} /></div>;
}

function NumberField({ label, value, onChange, compact = false }: { label: string; value: number; onChange: (value: number) => void; compact?: boolean }) {
  const { t } = useLanguage();
  return <div className={compact ? "number-field compact" : "number-field"}><label>{t(label)}</label><input type="number" step="0.1" value={value} onChange={(e) => onChange(Number(e.target.value))} /></div>;
}
