"use client";

import { AppSidebar } from "../components/AppSidebar";
import { DamageMarker, DamagePhotoMap, operationStyle } from "../components/DamagePhotoMap";

import { useLanguage } from "../components/LanguageProvider";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, getAccessToken, clearSession, customerLabel, uploadCasePhoto } from "../lib/api";
import { loadPlateSpots, PlateSpots, savePlateSpot } from "../lib/plateSpots";
import { NewEstimateChooser } from "../components/NewEstimateChooser";
import { catalogItems, mechanicalCatalog } from "../lib/mechanicalCatalog";


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

type DashboardData = {
  open_cases: number;
  waiting_approval: number;
  in_progress: number;
  ready: number;
  waiting_parts: number;
  recent_practices: {code:string;plate:string;car:string;client:string;status:string}[];
};

type ActiveContract = {
  id: string;
  name: string;
  labor_included: boolean;
  labor_discount_percent: string;
  parts_markup_percent: string;
};

type CustomerOption = { id: string; company_name?: string | null; first_name?: string | null; last_name?: string | null; phone?: string | null; email?: string | null; vat_number?: string | null };

const vehicleCategories = ["CAR", "VAN", "TRUCK", "TRACTOR", "TRAILER", "BUS", "MOTORCYCLE", "OTHER"];

// Frequent mechanical jobs for cars and industrial vehicles (hours are editable afterwards).
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
  const { t, language } = useLanguage();
  const words = (it:string,es:string) => language === "es" ? es : it;
  const [loadError,setLoadError] = useState(false);
  const [ordersError,setOrdersError] = useState(false);
  const [userName,setUserName] = useState("");
  const [search,setSearch] = useState("");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [chooserOpen, setChooserOpen] = useState(false);
  const [step, setStep] = useState(0);
  // BODY = carrozzeria (foto + mappa danni), MECHANICAL = meccanica (senza foto e danni).
  const [workType, setWorkType] = useState<"BODY" | "MECHANICAL">("BODY");
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
  const [vehicle, setVehicle] = useState({ make: "", model: "", version: "", vin: "", year: "", mileage: "", color: "", paintCode: "", fuel: "50", category: "CAR", fleetNumber: "", fuelType: "", engineSize: "", powerKw: "" });
  const [plateSpots, setPlateSpots] = useState<PlateSpots>({});
  useEffect(() => {
    const timer = window.setTimeout(() => { loadPlateSpots(vehicle.make.trim(), vehicle.model.trim()).then(setPlateSpots); }, 600);
    return () => window.clearTimeout(timer);
  }, [vehicle.make, vehicle.model]);
  const [customerRequest, setCustomerRequest] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerOption[]>([]);
  const [contract, setContract] = useState<ActiveContract | null>(null);
  const [photos, setPhotos] = useState<Record<string, File>>({});
  const [damages, setDamages] = useState<Record<string, DamageStatus>>({});
  const [markers, setMarkers] = useState<DamageMarker[]>([]);
  const [rates, setRates] = useState({ body: 45, mechanical: 50, paint: 48, electrical: 55, diagnostic: 60 });
  const [lines, setLines] = useState<EstimateLine[]>([]);

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("new");
    if (requested === "practice") setWizardOpen(true);
    if (requested === "estimate") setChooserOpen(true);
    setAuthenticated(Boolean(getAccessToken()));
    try {const user=JSON.parse(localStorage.getItem("nakama_user")||"{}");setUserName([user.first_name,user.last_name].filter(Boolean).join(" "));}catch{}
    const api = process.env.NEXT_PUBLIC_API_URL;
    if (!api) { setApiOnline(false); setLoadError(true); setOrdersError(true); return; }
    fetch(`${api}/health`)
      .then((r) => setApiOnline(r.ok))
      .catch(() => setApiOnline(false));

    if (getAccessToken()) {
      apiFetch("/dashboard/summary")
        .then(async (r) => {
          if (r.ok) setDashboard(await r.json()); else setLoadError(true);
        })
        .catch(() => setLoadError(true));
      apiFetch("/work-orders")
        .then(async (r) => {
          if (r.ok) setWorkOrders(await r.json()); else setOrdersError(true);
        })
        .catch(() => setOrdersError(true));
    }
  }, []);

  useEffect(() => {
    if (!getAccessToken()) return;
    apiFetch("/settings/labor-rates").then(async (response) => {
      if (!response.ok) return;
      const data: { labor_type: string; hourly_rate: string }[] = await response.json();
      const byType = Object.fromEntries(data.map((rate) => [rate.labor_type, Number(rate.hourly_rate)]));
      setRates((current) => ({
        body: byType.BODY ?? current.body,
        mechanical: byType.MECHANICAL ?? current.mechanical,
        paint: byType.PAINT ?? current.paint,
        electrical: byType.ELECTRICAL ?? current.electrical,
        diagnostic: byType.DIAGNOSTIC ?? current.diagnostic,
      }));
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    setContract(null);
    if (!existingCustomerId || !getAccessToken()) return;
    apiFetch(`/contracts/active?customer_id=${existingCustomerId}`)
      .then(async (response) => { if (response.ok) setContract(await response.json()); })
      .catch(() => undefined);
  }, [existingCustomerId]);

  const totals = useMemo(() => {
    let subtotal = 0;
    let vat = 0;
    for (const line of lines) {
      const markup = contract ? 1 + Number(contract.parts_markup_percent) / 100 : 1;
      const labor = line.laborHours * line.laborRate + line.paintHours * line.paintRate;
      const laborCharged = contract?.labor_included ? 0 : labor * (1 - Number(contract?.labor_discount_percent || 0) / 100);
      const base = (line.quantity * line.unitPrice + line.materials) * markup + laborCharged;
      subtotal += base;
      vat += base * (line.vatRate / 100);
    }
    return { subtotal, vat, total: subtotal + vat };
  }, [lines, contract]);

  // Mechanical jobs skip the bodywork steps (Foto, Danni).
  const activeSteps = workType === "MECHANICAL" ? [0, 1, 2, 5, 6, 7] : steps.map((_, index) => index);
  const stepPosition = Math.max(0, activeSteps.indexOf(step));
  const goNext = () => setStep(activeSteps[Math.min(activeSteps.length - 1, stepPosition + 1)]);
  const goBack = () => setStep(activeSteps[Math.max(0, stepPosition - 1)]);

  const selectedDamageCount = Object.values(damages).filter((v) => v !== "NO_DAMAGE").length + markers.length;

  function resetWizard() {
    setStep(0);
    setWorkType("BODY");
    setPlate("");
    setExistingVehicleId(null);
    setExistingCustomerId(null);
    setPlateLookupMessage("");
    setCustomer({ firstName: "", lastName: "", company: "", phone: "", email: "", vat: "" });
    setVehicle({ make: "", model: "", version: "", vin: "", year: "", mileage: "", color: "", paintCode: "", fuel: "50", category: "CAR", fleetNumber: "", fuelType: "", engineSize: "", powerKw: "" });
    setCustomerRequest("");
    setCustomerQuery("");
    setCustomerResults([]);
    setContract(null);
    setPhotos({});
    setDamages({});
    setMarkers([]);
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
        laborRate: rates.mechanical,
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

  // Plate not in our registry: ask the external provider (targa.co.it) for make/model.
  async function lookupExternalPlate(normalized: string) {
    setPlateLookupMessage("Targa nuova: cerco marca e modello…");
    try {
      const r = await apiFetch(`/vehicles/plate-data/${encodeURIComponent(normalized)}`);
      if (r.status === 503) {
        setPlateLookupMessage("Targa non presente: verrà creato un nuovo veicolo.");
        return;
      }
      if (r.status === 404) {
        setPlateLookupMessage("Targa non trovata nella banca dati: inserisci i dati del veicolo a mano.");
        return;
      }
      if (r.status === 429) {
        setPlateLookupMessage("Limite mensile di ricerche targa raggiunto: inserisci i dati a mano.");
        return;
      }
      if (!r.ok) {
        setPlateLookupMessage("Servizio targhe non disponibile: inserisci i dati a mano.");
        return;
      }
      const data = await r.json();
      setVehicle((current) => ({
        ...current,
        make: data.make || current.make,
        model: data.model || current.model,
        version: data.version || current.version,
        vin: data.vin || current.vin,
        year: data.year ? String(data.year) : current.year,
        fuelType: data.fuel_type || current.fuelType,
        engineSize: data.engine_size || current.engineSize,
        powerKw: data.power_kw ? String(data.power_kw) : current.powerKw,
      }));
      setPlateLookupMessage("Veicolo identificato dalla targa: controlla i dati nel passo Veicolo.");
    } catch {
      setPlateLookupMessage("Servizio targhe non disponibile: inserisci i dati a mano.");
    }
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
        await lookupExternalPlate(normalized);
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
        category: found.vehicle_category || "CAR",
        fleetNumber: found.fleet_number || "",
        fuelType: found.fuel_type || "",
        engineSize: found.engine_size || "",
        powerKw: found.power_kw ? String(found.power_kw) : "",
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

  async function searchCustomers() {
    if (!getAccessToken()) return;
    const response = await apiFetch(`/customers?q=${encodeURIComponent(customerQuery.trim())}&limit=10`);
    if (response.ok) setCustomerResults(await response.json());
  }

  function pickCustomer(found: CustomerOption) {
    setExistingCustomerId(found.id);
    setCustomer({
      firstName: found.first_name || "",
      lastName: found.last_name || "",
      company: found.company_name || "",
      phone: found.phone || "",
      email: found.email || "",
      vat: found.vat_number || "",
    });
    setCustomerResults([]);
    setCustomerQuery("");
  }

  const [catalogGroup, setCatalogGroup] = useState(0);
  const [customItem, setCustomItem] = useState({ kind: "PART", description: "", code: "", quantity: 1, price: 0, hours: 0 });

  function addCustomItem() {
    const description = [customItem.code.trim(), customItem.description.trim()].filter(Boolean).join(" · ");
    if (!customItem.description.trim()) return;
    const rate = customItem.kind === "DIAGNOSTIC" ? rates.diagnostic : customItem.kind === "ELECTRICAL" ? rates.electrical : rates.mechanical;
    setLines((prev) => [...prev, {
      id: crypto.randomUUID(), description, category: customItem.kind, quantity: customItem.quantity || 1, unitPrice: customItem.price || 0,
      laborHours: customItem.hours || 0, laborRate: rate, paintHours: 0, paintRate: rates.paint, materials: 0, vatRate: 22,
    }]);
    setCustomItem({ kind: customItem.kind, description: "", code: "", quantity: 1, price: 0, hours: 0 });
  }

  function addOperation(description: string, category: string, hours: number) {
    const rate = category === "DIAGNOSTIC" ? rates.diagnostic : category === "ELECTRICAL" ? rates.electrical : rates.mechanical;
    setLines((prev) => [...prev, {
      id: crypto.randomUUID(), description, category, quantity: 1, unitPrice: 0, laborHours: hours,
      laborRate: rate, paintHours: 0, paintRate: rates.paint, materials: 0, vatRate: 22,
    }]);
  }

  async function savePractice() {
    if (!getAccessToken()) {
      alert(words("Accedi per salvare la pratica nel database.","Inicia sesión para guardar el expediente en la base de datos."));
      return;
    }

    setSaving(true);
    try {
      let savedCustomer: { id: string };
      let savedVehicle: { id: string };

      const vehicleFields = {
        vin: vehicle.vin || null,
        make: vehicle.make || null,
        model: vehicle.model || null,
        version: vehicle.version || null,
        year: vehicle.year ? Number(vehicle.year) : null,
        mileage: vehicle.mileage ? Number(vehicle.mileage) : null,
        color_name: vehicle.color || null,
        paint_code: vehicle.paintCode || null,
        vehicle_category: vehicle.category || "CAR",
        fleet_number: vehicle.fleetNumber.trim() || null,
        fuel_type: vehicle.fuelType.trim() || null,
        engine_size: vehicle.engineSize.trim() || null,
        power_kw: vehicle.powerKw ? Number(vehicle.powerKw) : null,
      };

      if (existingCustomerId && !existingVehicleId) {
        // Known customer (e.g. a fleet company) bringing a vehicle not yet registered.
        const vehicleResponse = await apiFetch("/vehicles", {
          method: "POST",
          body: JSON.stringify({ customer_id: existingCustomerId, license_plate: plate, ...vehicleFields }),
        });
        if (!vehicleResponse.ok) throw new Error(vehicleResponse.status === 409 ? "Esiste già un veicolo con questa targa." : (await vehicleResponse.json()).detail || "Errore veicolo");
        savedCustomer = { id: existingCustomerId };
        savedVehicle = await vehicleResponse.json();
      } else if (existingVehicleId && existingCustomerId) {
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
            body: JSON.stringify({ ...vehicleFields, customer_id: existingCustomerId }),
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

        // A plate already registered without an owner is linked to the new customer.
        const vehicleResponse = existingVehicleId
          ? await apiFetch(`/vehicles/${existingVehicleId}`, {
            method: "PATCH",
            body: JSON.stringify({ ...vehicleFields, customer_id: savedCustomer.id }),
          })
          : await apiFetch("/vehicles", {
            method: "POST",
            body: JSON.stringify({
              customer_id: savedCustomer.id,
              license_plate: plate,
              ...vehicleFields,
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
          work_type: workType,
          mileage: vehicle.mileage ? Number(vehicle.mileage) : null,
          fuel_level_percent: Number(vehicle.fuel),
          customer_notes: customerRequest.trim() || null,
          internal_notes: Object.keys(photos).length ? `Foto raccolte nel pilot UI: ${Object.keys(photos).join(", ")}` : null,
        }),
      });
      if (!caseResponse.ok) throw new Error((await caseResponse.json()).detail || "Errore pratica");
      const savedCase = await caseResponse.json();

      let mediaWarning = "";
      for (const [category, file] of workType === "BODY" ? Object.entries(photos) : []) {
        try {
          const saved = await uploadCasePhoto(savedCase.id, file, category);
          if (!saved.ok) mediaWarning = "Alcune foto non sono state caricate.";
        } catch {
          mediaWarning = "Alcune foto non sono state caricate.";
        }
      }

      for (const [code, operation] of workType === "BODY" ? Object.entries(damages) : []) {
        if (operation === "NO_DAMAGE") continue;
        const damageResponse = await apiFetch(`/cases/${savedCase.id}/damages/${code}`, {
          method: "PUT",
          body: JSON.stringify({ vehicle_area_code: code, operation }),
        });
        if (!damageResponse.ok) throw new Error("Errore salvataggio danni");
      }

      for (const marker of workType === "BODY" ? markers : []) {
        const markerResponse = await apiFetch(`/cases/${savedCase.id}/damage-markers`, {
          method: "POST",
          body: JSON.stringify({ view: marker.view, x: marker.x, y: marker.y, operation: marker.operation, area_label: marker.area_label }),
        });
        if (!markerResponse.ok) throw new Error("Errore salvataggio danni");
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
      <AppSidebar />

      <section className="workspace">
        <header className="topbar nakama-topbar">
          <form className="dashboard-search" action="/pratiche"><input aria-label={words("Cerca pratica, cliente o targa","Buscar expediente, cliente o matrícula")} name="q" value={search} onChange={e=>setSearch(e.target.value)} placeholder={t("Cerca cliente, veicolo, pratica...")} /><button className="ghost" type="submit">{words("Cerca","Buscar")}</button></form>
          <div className="top-actions">
            <div className={`api-pill ${apiOnline ? "online" : apiOnline === false ? "offline" : ""}`}><span />{apiOnline === null ? "API..." : apiOnline ? t("Online") : t("Offline")}</div>
            {authenticated ? <div className="user-chip"><span><strong>{userName||"NAKAMA CAR"}</strong></span><button className="ghost" onClick={()=>{clearSession();window.location.assign("/login");}}>{words("Esci","Cerrar sesión")}</button></div> : <a className="login-link" href="/login">{t("Accedi")}</a>}
          </div>
        </header>

        <section className="nakama-hero photo-hero">
          <img src="/brand/nakama-welcome.webp" alt={t("Carrozzeria NAKAMA CAR")} width={1672} height={941} fetchPriority="high" className="photo-hero-image" />
          <div className="photo-hero-content">
            <p className="eyebrow">{t("BENVENUTO IN")}</p>
            <h1>NAKAMA <span>CAR</span></h1>
            <p>{t("Officina meccanica e carrozzeria · Auto e veicoli industriali")}</p>
            <div className="hero-values"><span>{t("Esperienza")}</span><span>{t("Tecnologia")}</span><span>{t("Qualità")}</span><span>{t("Affidabilità")}</span></div>
          </div>
          <div className="hero-signature">{t("Più di una carrozzeria, un partner per la tua auto")}</div>
        </section>

        <div className="nakama-actions">
          <button className="nakama-action blue" onClick={() => { setWorkType("BODY"); setWizardOpen(true); }}><b>▤</b><span><strong>{t("Nuova Pratica")}</strong><small>{t("Apri una nuova pratica")}</small></span></button>
          <button className="nakama-action green" onClick={() => setChooserOpen(true)}><b>▦</b><span><strong>{t("Nuovo Preventivo")}</strong><small>{t("Crea un preventivo")}</small></span></button>
          <a className="nakama-action red" href="/lavori"><b>⌁</b><span><strong>{t("Ordine di Lavoro")}</strong><small>{t("Invia in officina")}</small></span></a>
          <a className="nakama-action white" href="/clienti"><b>◎</b><span><strong>{t("Nuovo Cliente")}</strong><small>{t("Gestisci anagrafica")}</small></span></a>
          <a className="nakama-action white" href="/veicoli"><b>◇</b><span><strong>{t("Nuovo Veicolo")}</strong><small>{t("Consulta veicoli")}</small></span></a>
        </div>

        {(!authenticated||loadError)&&<div className="record-error" role="status">{!authenticated?words("Accedi per visualizzare e salvare i dati della tua officina.","Inicia sesión para consultar y guardar los datos de tu taller."):words("Dati del pannello non disponibili. Ricarica la pagina o accedi di nuovo.","Los datos del panel no están disponibles. Recarga la página o inicia sesión de nuevo.")} <a href="/login">{t("Accedi")}</a></div>}
        <div className="kpi-grid nakama-kpis">
          <div className="kpi-card"><span>{t("Pratiche aperte")}</span><strong>{dashboard?.open_cases ?? "—"}</strong><small>{authenticated ? t("Dati live NAKAMA CAR") : words("Accesso richiesto","Acceso requerido")}</small></div>
          <div className="kpi-card"><span>{t("In attesa approvazione")}</span><strong>{dashboard?.waiting_approval ?? "—"}</strong><small>{t("Preventivi da seguire")}</small></div>
          <div className="kpi-card"><span>{t("Lavori in corso")}</span><strong>{dashboard?.in_progress ?? "—"}</strong><small>{t("Officina e carrozzeria")}</small></div>
          <div className="kpi-card"><span>{t("Pronte consegna")}</span><strong>{dashboard?.ready ?? "—"}</strong><small>{t("Da contattare")}</small></div>
        </div>

        <div className="dashboard-lower-grid">
          <div className="panel status-panel">
            <div className="panel-head"><div><h2>{t("Stato pratiche")}</h2><p>{t("Distribuzione operativa")}</p></div></div>
            <div className="status-overview">
              <div className="donut" style={{background:dashboard&&dashboard.open_cases>0?`conic-gradient(#008455 0 ${dashboard.waiting_approval/dashboard.open_cases*100}%,#17649d 0 ${(dashboard.waiting_approval+dashboard.in_progress)/dashboard.open_cases*100}%,#d94152 0 ${(dashboard.waiting_approval+dashboard.in_progress+dashboard.waiting_parts)/dashboard.open_cases*100}%,#d6a62b 0 ${(dashboard.waiting_approval+dashboard.in_progress+dashboard.waiting_parts+dashboard.ready)/dashboard.open_cases*100}%,#94a3b8 0 100%)`:"#94a3b8"}}><div><strong>{dashboard?.open_cases ?? "—"}</strong><span>{t("Totali")}</span></div></div>
              <div className="status-legend">
                <span><i className="legend green"/>{t("Preventivo")} <b>{dashboard?.waiting_approval ?? "—"}</b></span>
                <span><i className="legend blue"/>{t("In lavorazione")} <b>{dashboard?.in_progress ?? "—"}</b></span>
                <span><i className="legend red"/>{t("In attesa ricambi")} <b>{dashboard?.waiting_parts ?? "—"}</b></span>
                <span><i className="legend yellow"/>{t("Pronto")} <b>{dashboard?.ready ?? "—"}</b></span>
                <span><i className="legend" style={{background:"#94a3b8"}}/>{words("Altre pratiche aperte","Otros expedientes abiertos")} <b>{dashboard?Math.max(0,dashboard.open_cases-dashboard.waiting_approval-dashboard.in_progress-dashboard.waiting_parts-dashboard.ready):"—"}</b></span>
              </div>
            </div>
          </div>

          <div className="panel">
            <div className="panel-head"><div><h2>{t("Ultime pratiche")}</h2><p>{t("Attività recenti")}</p></div><a className="ghost link-button" href="/pratiche">{t("Vedi tutte →")}</a></div>
            <div className="practice-table compact">
              {dashboard?.recent_practices.length===0&&<p className="empty-state">{words("Nessuna pratica ancora.","Todavía no hay expedientes.")}</p>}
              {(dashboard?.recent_practices || []).slice(0,4).map((p) => (
                <div className="practice-row" key={p.code}>
                  <div className="vehicle-thumb">🚗</div>
                  <div><strong>{p.code}</strong><span>{p.car} · {p.client}</span></div>
                  <div><span className={`status status-${p.status.toLowerCase()}`}>{t(p.status)}</span></div>
                </div>
              ))}
            </div>
          </div>

          <div className="panel appointments-panel">
            <div className="panel-head"><h2>{words("Da seguire","Por atender")}</h2></div>
            <div className="record-editor"><p>{words("Preventivi in attesa di approvazione","Presupuestos pendientes de aprobación")}: <strong>{dashboard?.waiting_approval ?? "—"}</strong></p><a href="/preventivi">{words("Apri preventivi","Abrir presupuestos")}</a><p>{words("Veicoli pronti per la consegna","Vehículos listos para entregar")}: <strong>{dashboard?.ready ?? "—"}</strong></p><a href="/pratiche">{words("Apri pratiche","Abrir expedientes")}</a></div>
          </div>
        </div>

        <div className="panel workshop-panel">
          <div className="panel-head"><div><h2>{t("Stato officina")}</h2><p>{t("Lavorazioni attive")}</p></div><a className="ghost link-button" href="/lavori">{t("Apri officina →")}</a></div>
          <div className="kanban">
            {ordersError?<p className="kanban-empty">{words("Impossibile caricare gli ordini di lavoro.","No se pudieron cargar las órdenes de trabajo.")}</p>:!authenticated?<p className="kanban-empty">{words("Accedi per visualizzare i lavori.","Inicia sesión para ver los trabajos.")}</p>:workOrders.length===0?<p className="kanban-empty">{t("Nessun ordine di lavoro attivo.")}</p>:workOrders.slice(0,4).map(order=><a className="kanban-card kanban-link" href="/lavori" key={order.id}><small>{t(order.status)}</small><strong>{order.work_order_number}</strong><span>{t("Priorità")} {t(order.priority)}</span></a>)}
          </div>
        </div>
      </section>

      {chooserOpen && (
        <NewEstimateChooser onClose={() => setChooserOpen(false)} onNewVehicle={(type) => { setChooserOpen(false); setWorkType(type); setWizardOpen(true); }} />
      )}
      {wizardOpen && (
        <div className="modal-backdrop">
          <div className={`wizard work-${workType.toLowerCase()}`} role="dialog" aria-modal="true" aria-labelledby="intake-title">
            <div className="wizard-head">
              <div>
                <p className="eyebrow">{t("NUOVA PRATICA")}</p>
                <span className={`work-badge big ${workType === "MECHANICAL" ? "mechanical" : "body"}`}>{workType === "MECHANICAL" ? `🔧 ${t("Meccanica")}` : `🚗 ${t("Carrozzeria")}`}</span>
                <h2 id="intake-title">{t(steps[step])}</h2>
              </div>
              <button className="close" aria-label={t("Chiudi nuova pratica")} onClick={() => setWizardOpen(false)}>×</button>
            </div>

            <div className="stepper">
              {activeSteps.map((index, position) => (
                <button key={steps[index]} className={index === step ? "current" : position < stepPosition ? "done" : ""} onClick={() => setStep(index)}>
                  <span>{position < stepPosition ? "✓" : position + 1}</span><small>{t(steps[index])}</small>
                </button>
              ))}
            </div>

            <div className="wizard-body">
              {step === 0 && (
                <div className="hero-step">
                  <div className="work-type-switch" role="radiogroup" aria-label={t("Tipo di lavoro")}>
                    <button type="button" role="radio" aria-checked={workType === "BODY"} className={workType === "BODY" ? "active body" : "body"} onClick={() => setWorkType("BODY")}>
                      <b aria-hidden="true">🚗</b><span><strong>{t("Carrozzeria")}</strong><small>{t("Foto, mappa danni, verniciatura")}</small></span>
                    </button>
                    <button type="button" role="radio" aria-checked={workType === "MECHANICAL"} className={workType === "MECHANICAL" ? "active mechanical" : "mechanical"} onClick={() => setWorkType("MECHANICAL")}>
                      <b aria-hidden="true">🔧</b><span><strong>{t("Meccanica")}</strong><small>{t("Tagliando, freni, diagnosi… senza foto")}</small></span>
                    </button>
                  </div>
                  <label>{t("Targa del veicolo")}</label>
                  <input className="plate-input" placeholder="AB123CD" value={plate} onChange={(e) => { setPlate(e.target.value.toUpperCase()); setExistingVehicleId(null); setExistingCustomerId(null); setPlateLookupMessage(""); }} autoFocus />
                  {authenticated && <button className="secondary plate-search" type="button" onClick={lookupPlate}>{t("Cerca nella tua anagrafica")}</button>}
                  {plateLookupMessage && <div className={`plate-lookup-message ${existingVehicleId ? "found" : ""}`}>{t(plateLookupMessage)}</div>}
                  <p>{t("La ricerca usa prima l'anagrafica NAKAMA CAR. DAT / GT Motive potrà essere collegato successivamente per identificazione esterna e dati tecnici licenziati.")}</p>
                </div>
              )}

              {step === 1 && (
                <>
                {authenticated && (
                  <div className="customer-picker wizard-picker">
                    {existingCustomerId ? (
                      <p>{t("Cliente esistente selezionato")}: <strong>{customer.company || `${customer.firstName} ${customer.lastName}`.trim()}</strong>{" "}
                        {!existingVehicleId && <button type="button" className="ghost" onClick={() => { setExistingCustomerId(null); setCustomer({ firstName: "", lastName: "", company: "", phone: "", email: "", vat: "" }); }}>{t("Nuovo cliente")}</button>}
                      </p>
                    ) : (
                      <div className="inline-search">
                        <input aria-label={t("Cerca cliente esistente")} placeholder={t("Cerca cliente esistente (es. Univex, Gamonal)")} value={customerQuery} onChange={(e) => setCustomerQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); searchCustomers(); } }} />
                        <button type="button" className="secondary" onClick={searchCustomers}>{t("Cerca")}</button>
                      </div>
                    )}
                    {customerResults.length > 0 && (
                      <div className="picker-results">
                        {customerResults.map((option) => (
                          <button type="button" key={option.id} className="picker-option" onClick={() => pickCustomer(option)}>
                            <strong>{customerLabel(option)}</strong><small>{[option.vat_number, option.phone].filter(Boolean).join(" · ")}</small>
                          </button>
                        ))}
                      </div>
                    )}
                    {contract && <ContractBanner contract={contract} />}
                  </div>
                )}
                <div className="form-grid">
                  <Field label={t("Nome")} value={customer.firstName} onChange={(v) => setCustomer({ ...customer, firstName: v })} />
                  <Field label={t("Cognome")} value={customer.lastName} onChange={(v) => setCustomer({ ...customer, lastName: v })} />
                  <Field label={t("Azienda")} value={customer.company} onChange={(v) => setCustomer({ ...customer, company: v })} />
                  <Field label={t("Partita IVA")} value={customer.vat} onChange={(v) => setCustomer({ ...customer, vat: v })} />
                  <Field label={t("Telefono")} value={customer.phone} onChange={(v) => setCustomer({ ...customer, phone: v })} />
                  <Field label={t("Email")} value={customer.email} onChange={(v) => setCustomer({ ...customer, email: v })} />
                </div>
                </>
              )}

              {step === 2 && (
                <div className="form-grid">
                  <div className="field"><label>{t("Tipo veicolo")}</label>
                    <select value={vehicle.category} onChange={(e) => setVehicle({ ...vehicle, category: e.target.value })}>
                      {vehicleCategories.map((code) => <option key={code} value={code}>{t(code)}</option>)}
                    </select>
                  </div>
                  <Field label={t("N. flotta / interno")} value={vehicle.fleetNumber} onChange={(v) => setVehicle({ ...vehicle, fleetNumber: v })} />
                  <Field label={t("Marca")} value={vehicle.make} onChange={(v) => setVehicle({ ...vehicle, make: v })} />
                  <Field label={t("Modello")} value={vehicle.model} onChange={(v) => setVehicle({ ...vehicle, model: v })} />
                  <Field label={t("Versione")} value={vehicle.version} onChange={(v) => setVehicle({ ...vehicle, version: v })} />
                  <Field label="VIN" value={vehicle.vin} onChange={(v) => setVehicle({ ...vehicle, vin: v.toUpperCase() })} />
                  <Field label={t("Anno")} value={vehicle.year} onChange={(v) => setVehicle({ ...vehicle, year: v })} />
                  <Field label={t("Chilometri")} value={vehicle.mileage} onChange={(v) => setVehicle({ ...vehicle, mileage: v })} />
                  <Field label={t("Alimentazione")} value={vehicle.fuelType} onChange={(v) => setVehicle({ ...vehicle, fuelType: v })} />
                  <Field label={t("Cilindrata (cc)")} value={vehicle.engineSize} onChange={(v) => setVehicle({ ...vehicle, engineSize: v })} />
                  <Field label={t("Potenza (kW)")} value={vehicle.powerKw} onChange={(v) => setVehicle({ ...vehicle, powerKw: v.replace(/[^0-9]/g, "") })} />
                  <Field label={t("Colore")} value={vehicle.color} onChange={(v) => setVehicle({ ...vehicle, color: v })} />
                  <Field label={t("Codice vernice")} value={vehicle.paintCode} onChange={(v) => setVehicle({ ...vehicle, paintCode: v })} />
                  <div className="field full"><label>{t("Richiesta del cliente / sintomi")}</label><textarea rows={3} value={customerRequest} placeholder={t("Es. rumore ai freni, spia motore accesa, tagliando…")} onChange={(e) => setCustomerRequest(e.target.value)} /></div>
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
                  <p className="hint">{t("Per interventi solo meccanici puoi saltare questo passaggio.")}</p>
                  <DamagePhotoMap
                    vehicle={{ make: vehicle.make, model: vehicle.model, year: vehicle.year, color: vehicle.color }}
                    plate={plate.trim()}
                    markers={markers}
                    onAdd={(marker) => setMarkers((current) => [...current, { ...marker, id: crypto.randomUUID() }])}
                    onRemove={(marker) => setMarkers((current) => current.filter((item) => item.id !== marker.id))}
                    onColorChange={(color) => setVehicle((current) => ({ ...current, color }))}
                    plateSpots={plateSpots}
                    onPlateSpotSave={vehicle.make && vehicle.model ? async (view, spot) => {
                      try { setPlateSpots(await savePlateSpot(vehicle.make, vehicle.model, view, spot)); } catch { /* keep the default position */ }
                    } : undefined}
                  />
                  <details className="damage-grid-details"><summary>{t("Elenco zone (alternativa)")}</summary>
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
                  </details>
                </div>
              )}

              {step === 5 && (
                <div>
                  <div className="rates">
                    <h3>{t("Tariffe NAKAMA CAR")}</h3>
                    <div className="rate-grid">
                      {workType === "BODY" && <NumberField label={t("Carrozzeria €/h")} value={rates.body} onChange={(v) => setRates({ ...rates, body: v })} />}
                      <NumberField label={t("Meccanica €/h")} value={rates.mechanical} onChange={(v) => setRates({ ...rates, mechanical: v })} />
                      {workType === "BODY" && <NumberField label={t("Verniciatura €/h")} value={rates.paint} onChange={(v) => setRates({ ...rates, paint: v })} />}
                      <NumberField label={t("Elettrico €/h")} value={rates.electrical} onChange={(v) => setRates({ ...rates, electrical: v })} />
                      <NumberField label={t("Diagnosi €/h")} value={rates.diagnostic} onChange={(v) => setRates({ ...rates, diagnostic: v })} />
                    </div>
                  </div>
                  {workType === "MECHANICAL" && vehicle.make && vehicle.model && (
                    <div className="mechanical-map">
                      <DamagePhotoMap
                        vehicle={{ make: vehicle.make, model: vehicle.model, year: vehicle.year, color: vehicle.color }}
                        plate={plate.trim()}
                        markers={[]}
                        plateSpots={plateSpots}
                        parts={lines.filter((line) => line.description.trim() && !["BODY_LABOR", "PAINT", "MATERIAL"].includes(line.category)).map((line) => ({ id: line.id, label: line.description }))}
                        scene="lift"
                        onColorChange={(color) => setVehicle((current) => ({ ...current, color }))}
                      />
                    </div>
                  )}
                  <div className="custom-item">
                    <h3>{t("Aggiungi ricambio o servizio")}</h3>
                    <div className="custom-item-grid">
                      <label>{t("Tipo")}
                        <select value={customItem.kind} onChange={(e) => setCustomItem({ ...customItem, kind: e.target.value })}>
                          <option value="PART">{t("Ricambio")}</option>
                          <option value="MECHANICAL_LABOR">{t("Servizio / manodopera")}</option>
                          <option value="DIAGNOSTIC">{t("DIAGNOSTIC")}</option>
                          <option value="ELECTRICAL">{t("ELECTRICAL")}</option>
                          <option value="EXTERNAL_SERVICE">{t("EXTERNAL_SERVICE")}</option>
                          <option value="MATERIAL">{t("MATERIAL")}</option>
                        </select>
                      </label>
                      <label className="wide">{t("Descrizione")}
                        <input list="mechanical-catalog" value={customItem.description} placeholder={t("Es. Pastiglie freno anteriori")}
                          onChange={(e) => {
                            const match = catalogItems.find(([name]) => name.toLowerCase() === e.target.value.trim().toLowerCase());
                            setCustomItem(match ? { ...customItem, description: e.target.value, kind: match[1], hours: customItem.hours || match[2] } : { ...customItem, description: e.target.value });
                          }}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomItem(); } }} />
                        <datalist id="mechanical-catalog">{catalogItems.map(([name]) => <option key={name} value={t(name)} />)}</datalist>
                      </label>
                      <label>{t("Codice ricambio")}<input value={customItem.code} placeholder="OEM / fornitore" onChange={(e) => setCustomItem({ ...customItem, code: e.target.value })} /></label>
                      <label>{t("Q.tà")}<input type="number" min="0" step="1" value={customItem.quantity} onChange={(e) => setCustomItem({ ...customItem, quantity: Number(e.target.value) })} /></label>
                      <label>{t("Prezzo €")}<input type="number" min="0" step="0.01" value={customItem.price} onChange={(e) => setCustomItem({ ...customItem, price: Number(e.target.value) })} /></label>
                      <label>{t("Ore")}<input type="number" min="0" step="0.1" value={customItem.hours} onChange={(e) => setCustomItem({ ...customItem, hours: Number(e.target.value) })} /></label>
                    </div>
                    <button type="button" className="primary" disabled={!customItem.description.trim()} onClick={addCustomItem}>+ {t("Aggiungi al preventivo")}</button>
                  </div>
                  <h3 className="operations-title">{t("Catalogo interventi meccanici")}</h3>
                  <div className="catalog-tabs" role="tablist">
                    {mechanicalCatalog.map((group, index) => (
                      <button key={group.group} type="button" role="tab" aria-selected={catalogGroup === index} className={catalogGroup === index ? "active" : ""} onClick={() => setCatalogGroup(index)}>
                        <span aria-hidden="true">{group.icon}</span> {t(group.group)}
                      </button>
                    ))}
                  </div>
                  <div className="operation-suggestions">
                    {mechanicalCatalog[catalogGroup].items.map(([description, category, hours]) => (
                      <button key={description} onClick={() => addOperation(t(description), category, hours)}>+ {t(description)}</button>
                    ))}
                  </div>
                  {lines.length > 0 && <p className="hint">{lines.length} {t("righe nel preventivo: prezzi e quantità si completano al passo Preventivo.")}</p>}
                  {workType === "BODY" && selectedDamageCount > 0 && <h3 className="operations-title">{t("Da mappa danni carrozzeria")}</h3>}
                  <div className="operation-suggestions">
                    {markers.map((marker) => (
                      <button key={marker.id} onClick={() => setLines((prev) => [...prev, {
                        id: crypto.randomUUID(),
                        description: `${operationStyle[marker.operation].label} · ${marker.area_label}`,
                        category: marker.operation === "PAINT" ? "PAINT" : marker.operation === "REPLACE" ? "PART" : "BODY_LABOR",
                        quantity: 1, unitPrice: 0, laborHours: 1, laborRate: rates.body,
                        paintHours: marker.operation === "PAINT" ? 1 : 0, paintRate: rates.paint, materials: 0, vatRate: 22,
                      }])}>+ {marker.area_label} · {t(operationStyle[marker.operation].label)}</button>
                    ))}
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
                  {contract && <ContractBanner contract={contract} />}
                  <div className="estimate-lines">
                    {lines.map((line, index) => (
                      <div className="estimate-line" key={line.id}>
                        <div className="line-no">{index + 1}</div>
                        <input className="line-description" placeholder={t("Descrizione operazione / ricambio")} value={line.description} onChange={(e) => updateLine(line.id, { description: e.target.value })} />
                        <select value={line.category} onChange={(e) => updateLine(line.id, { category: e.target.value })}>
                          <option value="PART">{t("PART")}</option><option value="MECHANICAL_LABOR">{t("MECHANICAL_LABOR")}</option><option value="DIAGNOSTIC">{t("DIAGNOSTIC")}</option><option value="ELECTRICAL">{t("ELECTRICAL")}</option><option value="BODY_LABOR">{t("BODY_LABOR")}</option><option value="PAINT">{t("PAINT")}</option><option value="MATERIAL">{t("MATERIAL")}</option><option value="EXTERNAL_SERVICE">{t("EXTERNAL_SERVICE")}</option>
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
                    <div><small>{t("TIPO")}</small><strong>{workType === "MECHANICAL" ? t("Meccanica") : t("Carrozzeria")}</strong></div>
                    {workType === "BODY" ? (
                      <>
                        <div><small>{t("FOTO")}</small><strong>{Object.keys(photos).length}</strong></div>
                        <div><small>{t("DANNI")}</small><strong>{selectedDamageCount}</strong></div>
                      </>
                    ) : (
                      <div><small>{t("RICHIESTA")}</small><strong>{customerRequest.trim() || "—"}</strong></div>
                    )}
                    <div><small>{t("PREVENTIVO")}</small><strong>{money(totals.total)}</strong></div>
                  </div>
                  {contract && <ContractBanner contract={contract} />}
                  <div className="pilot-note">{authenticated ? t("Sessione autenticata: cliente, veicolo, pratica, danni e preventivo saranno salvati nel database multi-tenant.") : words("Accedi prima di salvare la pratica.","Inicia sesión antes de guardar el expediente.")}</div>
                </div>
              )}
            </div>

            <div className="wizard-footer">
              <button className="ghost" disabled={stepPosition === 0} onClick={goBack}>{t("← Indietro")}</button>
              <div>
                {stepPosition < activeSteps.length - 1 ? (
                  <button className="primary" onClick={goNext}>{t("Continua →")}</button>
                ) : (
                  <button className="primary" onClick={savePractice} disabled={saving}>{saving ? t("Salvataggio…") : t("Salva pratica")}</button>
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

function ContractBanner({ contract }: { contract: ActiveContract }) {
  const { t } = useLanguage();
  return (
    <div className="pricing-banner contract">
      <span>
        <strong>{t("Cliente con contratto flotta")}: {contract.name}</strong>{" · "}
        {contract.labor_included ? t("manodopera inclusa") : `${t("sconto manodopera")} ${Number(contract.labor_discount_percent)}%`}
        {" · "}{t("ricambi")} +{Number(contract.parts_markup_percent)}%
      </span>
    </div>
  );
}
