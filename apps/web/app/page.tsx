"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, getAccessToken } from "../lib/api";

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

function money(value: number) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(value || 0);
}

export default function HomePage() {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [apiOnline, setApiOnline] = useState<boolean | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [plate, setPlate] = useState("");
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

  async function savePilotPractice() {
    if (!getAccessToken()) {
      const payload = { plate, customer, vehicle, photos: Object.keys(photos), damages, lines, totals, createdAt: new Date().toISOString() };
      const previous = JSON.parse(localStorage.getItem("nakama-pilot-practices") || "[]");
      localStorage.setItem("nakama-pilot-practices", JSON.stringify([payload, ...previous]));
      alert("Pratica salvata in modalità pilot locale. Accedi per salvarla nel database.");
      setWizardOpen(false);
      resetWizard();
      return;
    }

    setSaving(true);
    try {
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
      const savedCustomer = await customerResponse.json();

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
      const savedVehicle = await vehicleResponse.json();

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

      alert(`Pratica ${savedCase.case_number} salvata nel database. Preventivo ${savedEstimate.estimate_number} creato.${mediaWarning ? "\n" + mediaWarning : ""}`);
      const summaryResponse = await apiFetch("/dashboard/summary");
      if (summaryResponse.ok) setDashboard(await summaryResponse.json());
      setWizardOpen(false);
      resetWizard();
    } catch (error) {
      alert(error instanceof Error ? error.message : "Errore durante il salvataggio");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">N</div>
          <div>
            <strong>NAKAMA CAR</strong>
            <span>ESTIMATE</span>
          </div>
        </div>

        <nav>
          <button className="nav-item active">▦ Dashboard</button>
          <button className="nav-item">▤ Pratiche</button>
          <button className="nav-item">€ Preventivi</button>
          <button className="nav-item">⌁ Ordini di lavoro</button>
          <button className="nav-item">◎ Clienti</button>
          <button className="nav-item">◇ Veicoli</button>
          <button className="nav-item">◫ Fatture</button>
        </nav>

        <div className="sidebar-bottom">
          <button className="nav-item">⚙ Configurazione</button>
          <div className="pilot-badge">Pilot • NAKAMA CAR</div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">ONE SISTEM · CARROZZERIA MANAGEMENT</p>
            <h1>Dashboard operativo</h1>
          </div>
          <div className="top-actions">
            <div className={`api-pill ${apiOnline ? "online" : apiOnline === false ? "offline" : ""}`}>
              <span />
              {apiOnline === null ? "API..." : apiOnline ? "API online" : "API offline"}
            </div>
            {authenticated ? <div className="session-pill">Sessione attiva</div> : <a className="login-link" href="/login">Accedi</a>}
            <button className="primary" onClick={() => setWizardOpen(true)}>+ Nuova pratica</button>
          </div>
        </header>

        <div className="kpi-grid">
          <div className="kpi-card"><span>Pratiche aperte</span><strong>{dashboard?.open_cases ?? 12}</strong><small>{authenticated ? "Dati live del tenant" : "Demo pilot"}</small></div>
          <div className="kpi-card"><span>In attesa approvazione</span><strong>{dashboard?.waiting_approval ?? 5}</strong><small>Preventivi da seguire</small></div>
          <div className="kpi-card"><span>In lavorazione</span><strong>{dashboard?.in_progress ?? 4}</strong><small>Carrozzeria / verniciatura</small></div>
          <div className="kpi-card"><span>Pronte consegna</span><strong>{dashboard?.ready ?? 3}</strong><small>Da contattare</small></div>
        </div>

        <div className="content-grid">
          <div className="panel">
            <div className="panel-head">
              <div><h2>Pratiche recenti</h2><p>Ultime lavorazioni della carrozzeria</p></div>
              <button className="ghost">Vedi tutte</button>
            </div>
            <div className="practice-table">
              {(dashboard?.recent_practices?.length ? dashboard.recent_practices : demoPractices).map((p) => (
                <div className="practice-row" key={p.code}>
                  <div><strong>{p.plate}</strong><span>{p.code}</span></div>
                  <div><strong>{p.car}</strong><span>{p.client}</span></div>
                  <div><span className={`status status-${p.status.toLowerCase()}`}>{p.status.replaceAll("_", " ")}</span></div>
                  <button className="row-arrow">→</button>
                </div>
              ))}
            </div>
          </div>

          <div className="panel quick-panel">
            <div className="panel-head"><div><h2>Azioni rapide</h2><p>Flusso reception</p></div></div>
            <button className="quick-action" onClick={() => setWizardOpen(true)}><b>01</b><span><strong>Nuova pratica</strong><small>Targa, cliente, foto e danni</small></span><em>→</em></button>
            <button className="quick-action"><b>02</b><span><strong>Nuovo preventivo</strong><small>Ricambi, ore e verniciatura</small></span><em>→</em></button>
            <button className="quick-action"><b>03</b><span><strong>Ordini di lavoro</strong><small>Gestisci lo stato officina</small></span><em>→</em></button>
          </div>
        </div>

        <div className="panel workshop-panel">
          <div className="panel-head">
            <div><h2>Stato officina</h2><p>Vista sintetica delle lavorazioni attive</p></div>
          </div>
          <div className="kanban">
            {[
              ["ATTESA RICAMBI", "FK318ST", "Fiat 500X"],
              ["IN RIPARAZIONE", "GP742LM", "BMW Serie 3"],
              ["VERNICIATURA", "LM904TR", "Mercedes Classe A"],
              ["CONTROLLO QUALITÀ", "GH625AA", "Audi A3"],
            ].map(([stage, tag, car]) => (
              <div className="kanban-card" key={tag}><small>{stage}</small><strong>{tag}</strong><span>{car}</span></div>
            ))}
          </div>
        </div>
      </section>

      {wizardOpen && (
        <div className="modal-backdrop">
          <div className="wizard">
            <div className="wizard-head">
              <div>
                <p className="eyebrow">NUOVA PRATICA</p>
                <h2>{steps[step]}</h2>
              </div>
              <button className="close" onClick={() => setWizardOpen(false)}>×</button>
            </div>

            <div className="stepper">
              {steps.map((label, index) => (
                <button key={label} className={index === step ? "current" : index < step ? "done" : ""} onClick={() => setStep(index)}>
                  <span>{index < step ? "✓" : index + 1}</span><small>{label}</small>
                </button>
              ))}
            </div>

            <div className="wizard-body">
              {step === 0 && (
                <div className="hero-step">
                  <label>Targa del veicolo</label>
                  <input className="plate-input" placeholder="AB123CD" value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} autoFocus />
                  <p>Inserisci la targa. Con DAT / GT Motive sarà possibile identificare automaticamente il veicolo; per ora è disponibile l'inserimento manuale.</p>
                </div>
              )}

              {step === 1 && (
                <div className="form-grid">
                  <Field label="Nome" value={customer.firstName} onChange={(v) => setCustomer({ ...customer, firstName: v })} />
                  <Field label="Cognome" value={customer.lastName} onChange={(v) => setCustomer({ ...customer, lastName: v })} />
                  <Field label="Azienda" value={customer.company} onChange={(v) => setCustomer({ ...customer, company: v })} />
                  <Field label="Partita IVA" value={customer.vat} onChange={(v) => setCustomer({ ...customer, vat: v })} />
                  <Field label="Telefono" value={customer.phone} onChange={(v) => setCustomer({ ...customer, phone: v })} />
                  <Field label="Email" value={customer.email} onChange={(v) => setCustomer({ ...customer, email: v })} />
                </div>
              )}

              {step === 2 && (
                <div className="form-grid">
                  <Field label="Marca" value={vehicle.make} onChange={(v) => setVehicle({ ...vehicle, make: v })} />
                  <Field label="Modello" value={vehicle.model} onChange={(v) => setVehicle({ ...vehicle, model: v })} />
                  <Field label="Versione" value={vehicle.version} onChange={(v) => setVehicle({ ...vehicle, version: v })} />
                  <Field label="VIN" value={vehicle.vin} onChange={(v) => setVehicle({ ...vehicle, vin: v.toUpperCase() })} />
                  <Field label="Anno" value={vehicle.year} onChange={(v) => setVehicle({ ...vehicle, year: v })} />
                  <Field label="Chilometri" value={vehicle.mileage} onChange={(v) => setVehicle({ ...vehicle, mileage: v })} />
                  <Field label="Colore" value={vehicle.color} onChange={(v) => setVehicle({ ...vehicle, color: v })} />
                  <Field label="Codice vernice" value={vehicle.paintCode} onChange={(v) => setVehicle({ ...vehicle, paintCode: v })} />
                  <div className="field full"><label>Carburante: {vehicle.fuel}%</label><input type="range" min="0" max="100" value={vehicle.fuel} onChange={(e) => setVehicle({ ...vehicle, fuel: e.target.value })} /></div>
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
                      <b>{photos[key] ? "✓" : "+"}</b><span>{label}</span><small>{photos[key]?.name || "Scatta o carica foto"}</small>
                    </label>
                  ))}
                </div>
              )}

              {step === 4 && (
                <div>
                  <div className="summary-strip"><span>Elementi con intervento</span><strong>{selectedDamageCount}</strong></div>
                  <div className="damage-grid">
                    {vehicleAreas.map(([code, label]) => (
                      <div className="damage-card" key={code}>
                        <span>{label}</span>
                        <select value={damages[code] || "NO_DAMAGE"} onChange={(e) => setDamages({ ...damages, [code]: e.target.value as DamageStatus })}>
                          {Object.entries(statusLabel).map(([value, text]) => <option value={value} key={value}>{text}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {step === 5 && (
                <div>
                  <div className="rates">
                    <h3>Tariffe NAKAMA CAR</h3>
                    <div className="rate-grid">
                      <NumberField label="Carrozzeria €/h" value={rates.body} onChange={(v) => setRates({ ...rates, body: v })} />
                      <NumberField label="Meccanica €/h" value={rates.mechanical} onChange={(v) => setRates({ ...rates, mechanical: v })} />
                      <NumberField label="Verniciatura €/h" value={rates.paint} onChange={(v) => setRates({ ...rates, paint: v })} />
                      <NumberField label="Elettrico €/h" value={rates.electrical} onChange={(v) => setRates({ ...rates, electrical: v })} />
                      <NumberField label="Diagnosi €/h" value={rates.diagnostic} onChange={(v) => setRates({ ...rates, diagnostic: v })} />
                    </div>
                  </div>
                  <div className="operation-suggestions">
                    {Object.entries(damages).filter(([, s]) => s !== "NO_DAMAGE").map(([code, status]) => (
                      <button key={code} onClick={() => setLines((prev) => [...prev, {
                        id: crypto.randomUUID(),
                        description: `${statusLabel[status]} · ${vehicleAreas.find((a) => a[0] === code)?.[1] || code}`,
                        category: status === "PAINT" ? "PAINT" : "BODY_LABOR",
                        quantity: 1, unitPrice: 0, laborHours: 1, laborRate: rates.body, paintHours: status === "PAINT" ? 1 : 0, paintRate: rates.paint, materials: 0, vatRate: 22,
                      }])}>+ {vehicleAreas.find((a) => a[0] === code)?.[1]} · {statusLabel[status]}</button>
                    ))}
                  </div>
                </div>
              )}

              {step === 6 && (
                <div>
                  <div className="estimate-head">
                    <div><h3>Righe preventivo</h3><p>Nessun dato OEM inventato: codici, prezzi e tempi vanno inseriti manualmente finché non è collegato un provider licenziato.</p></div>
                    <button className="secondary" onClick={addLine}>+ Riga</button>
                  </div>
                  <div className="estimate-lines">
                    {lines.map((line, index) => (
                      <div className="estimate-line" key={line.id}>
                        <div className="line-no">{index + 1}</div>
                        <input className="line-description" placeholder="Descrizione operazione / ricambio" value={line.description} onChange={(e) => updateLine(line.id, { description: e.target.value })} />
                        <select value={line.category} onChange={(e) => updateLine(line.id, { category: e.target.value })}>
                          <option>PART</option><option>BODY_LABOR</option><option>MECHANICAL_LABOR</option><option>PAINT</option><option>MATERIAL</option><option>EXTERNAL_SERVICE</option>
                        </select>
                        <NumberField compact label="Q.tà" value={line.quantity} onChange={(v) => updateLine(line.id, { quantity: v })} />
                        <NumberField compact label="Prezzo" value={line.unitPrice} onChange={(v) => updateLine(line.id, { unitPrice: v })} />
                        <NumberField compact label="Ore" value={line.laborHours} onChange={(v) => updateLine(line.id, { laborHours: v })} />
                        <NumberField compact label="€/h" value={line.laborRate} onChange={(v) => updateLine(line.id, { laborRate: v })} />
                        <button className="delete-line" onClick={() => setLines((prev) => prev.filter((x) => x.id !== line.id))}>×</button>
                      </div>
                    ))}
                  </div>
                  <div className="totals">
                    <div><span>Imponibile</span><strong>{money(totals.subtotal)}</strong></div>
                    <div><span>IVA</span><strong>{money(totals.vat)}</strong></div>
                    <div className="grand-total"><span>TOTALE</span><strong>{money(totals.total)}</strong></div>
                  </div>
                </div>
              )}

              {step === 7 && (
                <div className="confirmation">
                  <div className="confirmation-title"><span>✓</span><div><h3>Pratica pronta per essere creata</h3><p>Controlla i dati prima del salvataggio.</p></div></div>
                  <div className="confirmation-grid">
                    <div><small>TARGA</small><strong>{plate || "—"}</strong></div>
                    <div><small>CLIENTE</small><strong>{customer.company || `${customer.firstName} ${customer.lastName}`.trim() || "—"}</strong></div>
                    <div><small>VEICOLO</small><strong>{[vehicle.make, vehicle.model].filter(Boolean).join(" ") || "—"}</strong></div>
                    <div><small>FOTO</small><strong>{Object.keys(photos).length}</strong></div>
                    <div><small>DANNI</small><strong>{selectedDamageCount}</strong></div>
                    <div><small>PREVENTIVO</small><strong>{money(totals.total)}</strong></div>
                  </div>
                  <div className="pilot-note">{authenticated ? "Sessione autenticata: cliente, veicolo, pratica, danni e preventivo saranno salvati nel database multi-tenant." : "Modalità pilot: puoi testare tutto il flusso. Accedi per attivare il salvataggio nel database."}</div>
                </div>
              )}
            </div>

            <div className="wizard-footer">
              <button className="ghost" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))}>← Indietro</button>
              <div>
                {step < steps.length - 1 ? (
                  <button className="primary" onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}>Continua →</button>
                ) : (
                  <button className="primary" onClick={savePilotPractice} disabled={saving}>{saving ? "Salvataggio…" : "Salva pratica"}</button>
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
  return <div className="field"><label>{label}</label><input value={value} onChange={(e) => onChange(e.target.value)} /></div>;
}

function NumberField({ label, value, onChange, compact = false }: { label: string; value: number; onChange: (value: number) => void; compact?: boolean }) {
  return <div className={compact ? "number-field compact" : "number-field"}><label>{label}</label><input type="number" step="0.1" value={value} onChange={(e) => onChange(Number(e.target.value))} /></div>;
}
