"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useLanguage } from "../../components/LanguageProvider";
import { NakamaLogo } from "../../components/NakamaLogo";
import { PasswordInput } from "../../components/PasswordInput";
import { ChatMessage, ChatPresence, ChatThread } from "../../components/ChatThread";
import { ChatLauncher } from "../../components/ChatLauncher";
import { TelemetryBadge, TelemetryCard, TelemetryReading } from "../../components/Telemetry";
import { DamageMarker, DamagePhotoMap, MapPhoto, MarkerView } from "../../components/DamagePhotoMap";
import { loadCustomerPhotos, OtherPhotos } from "../../components/CustomerPhotos";
import type { PlateSpots } from "../../lib/plateSpots";
import { clearPortalToken, getPortalToken, portalError, portalFetch, savePortalToken } from "../../lib/portal";

type Maintenance = {
  service_interval_km?: number | null;
  service_interval_months?: number | null;
  last_service_date?: string | null;
  last_service_km?: number | null;
  next_service_date?: string | null;
  next_service_km?: number | null;
  days_left?: number | null;
  km_left?: number | null;
  state: "OK" | "SOON" | "DUE" | "UNKNOWN";
};
type CurrentCase = { id: string; case_number: string; status: string; status_text: string; tasks_done: number; tasks_total: number; opened_at?: string | null };
type FleetVehicle = {
  id: string; license_plate: string; make?: string | null; model?: string | null; year?: number | null;
  fleet_number?: string | null; mileage?: number | null; color?: string | null; maintenance: Maintenance; telemetry?: TelemetryReading | null; current_case: CurrentCase | null;
};
type HistoryItem = {
  id: string; case_number: string; status: string; status_text: string; closed: boolean; opened_at?: string | null; updated_at: string;
  mileage?: number | null; customer_notes?: string | null; tasks: { description: string; status: string }[];
  estimate: { estimate_number: string; status: string; total: string } | null;
};
type VehicleDetail = FleetVehicle & { vin?: string | null; fuel_type?: string | null; history: HistoryItem[] };
type Me = {
  full_name: string; email: string; must_change_password: boolean; customer_name: string; unread: number;
  contract: { name: string; start_date: string; end_date?: string | null; labor_included: boolean } | null;
  workshop: { name: string; phone?: string | null; email?: string | null; address?: string | null; chat_status?: ChatPresence };
};
type Step = { code: string; label: string; done: boolean; current: boolean };
type CaseProgress = { case_number: string; status_text: string; steps: Step[]; closed: boolean; tasks: { description: string; status: string }[]; tasks_done: number; tasks_total: number; vehicle?: { plate_spots?: PlateSpots }; parts?: { id: string; label: string }[]; work_type?: string };

const POLL_MS = 20000;
const stateLabel: Record<Maintenance["state"], string> = { OK: "In regola", SOON: "Manutenzione vicina", DUE: "Manutenzione scaduta", UNKNOWN: "Piano non impostato" };

function day(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return parsed.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

function km(value?: number | null) {
  return value === null || value === undefined ? "—" : `${new Intl.NumberFormat("it-IT").format(value)} km`;
}

function money(value: string) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(value || 0));
}

function countdown(m: Maintenance, t: (text: string) => string) {
  const parts: string[] = [];
  if (m.days_left !== null && m.days_left !== undefined) parts.push(m.days_left >= 0 ? `${m.days_left} ${t("giorni")}` : `${t("scaduta da")} ${-m.days_left} ${t("giorni")}`);
  if (m.km_left !== null && m.km_left !== undefined) parts.push(m.km_left >= 0 ? km(m.km_left) : `${t("superata di")} ${km(-m.km_left)}`);
  return parts.join(" · ");
}

export default function PortalPage() {
  const { t } = useLanguage();
  const [me, setMe] = useState<Me | null>(null);
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<VehicleDetail | null>(null);
  const [openCase, setOpenCase] = useState<CaseProgress | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const chatOpenRef = useRef(false);
  chatOpenRef.current = chatOpen;
  const unreadCount = messages.filter((message) => message.sender === "WORKSHOP" && !message.read).length;
  const [markers, setMarkers] = useState<DamageMarker[]>([]);
  const [photos, setPhotos] = useState<MapPhoto[]>([]);
  const [error, setError] = useState("");
  const [passwords, setPasswords] = useState({ current: "", next: "" });
  const [passwordNotice, setPasswordNotice] = useState("");

  const loadAll = useCallback(async () => {
    const [meResponse, vehiclesResponse] = await Promise.all([portalFetch("/portal/me"), portalFetch("/portal/vehicles")]);
    if (meResponse.ok) setMe(await meResponse.json());
    if (vehiclesResponse.ok) setVehicles(await vehiclesResponse.json());
    else if (vehiclesResponse.status !== 401) setError(await portalError(vehiclesResponse, "Impossibile caricare i veicoli."));
  }, []);

  useEffect(() => {
    if (!getPortalToken()) { window.location.assign("/portale/login"); return; }
    loadAll();
  }, [loadAll]);

  const currentCaseId = selected?.current_case?.id;
  const loadCase = useCallback(async () => {
    if (!currentCaseId) return;
    const [progress, chat] = await Promise.all([portalFetch(`/portal/cases/${currentCaseId}`), portalFetch(`/portal/cases/${currentCaseId}/messages?read=${chatOpenRef.current}`)]);
    if (progress.ok) setOpenCase(await progress.json());
    if (chat.ok) setMessages(await chat.json());
  }, [currentCaseId]);

  const loadRender = useCallback((view: MarkerView, version: string) => portalFetch(`/portal/cases/${currentCaseId}/renders/${view}?v=${version}`), [currentCaseId]);

  useEffect(() => { if (chatOpen) loadCase(); }, [chatOpen, loadCase]);

  useEffect(() => {
    setChatOpen(false);
    setOpenCase(null);
    setMessages([]);
    setMarkers([]);
    setPhotos([]);
    if (!currentCaseId) return;
    loadCustomerPhotos(() => portalFetch(`/portal/cases/${currentCaseId}/photos`), (id) => portalFetch(`/portal/cases/${currentCaseId}/photos/${id}`)).then(setPhotos);
    portalFetch(`/portal/cases/${currentCaseId}/damage-markers`).then(async (response) => { if (response.ok) setMarkers(await response.json()); }).catch(() => undefined);
    loadCase();
    const timer = window.setInterval(() => { if (!document.hidden) loadCase(); }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [currentCaseId, loadCase]);

  async function openVehicle(id: string) {
    const response = await portalFetch(`/portal/vehicles/${id}`);
    if (response.ok) {
      setSelected(await response.json());
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function send(body: string): Promise<string | null> {
    if (!currentCaseId) return "Nessuna pratica aperta.";
    const response = await portalFetch(`/portal/cases/${currentCaseId}/messages`, { method: "POST", body: JSON.stringify({ body }) });
    if (!response.ok) return portalError(response, "Messaggio non inviato.");
    const message: ChatMessage = await response.json();
    setMessages((current) => [...current, message]);
    return null;
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setPasswordNotice("");
    const response = await portalFetch("/portal/password", { method: "POST", body: JSON.stringify({ current_password: passwords.current, new_password: passwords.next }) });
    if (!response.ok) { setPasswordNotice(await portalError(response, "Password non aggiornata.")); return; }
    const data = await response.json();
    savePortalToken(data.access_token);
    setPasswords({ current: "", next: "" });
    setPasswordNotice("Password aggiornata.");
    loadAll();
  }

  function logout() {
    clearPortalToken();
    window.location.assign("/portale/login");
  }

  const filtered = vehicles.filter((vehicle) => {
    const text = `${vehicle.license_plate} ${vehicle.fleet_number || ""} ${vehicle.make || ""} ${vehicle.model || ""}`.toLowerCase();
    return text.includes(query.trim().toLowerCase());
  });
  const inShop = vehicles.filter((vehicle) => vehicle.current_case).length;
  const due = vehicles.filter((vehicle) => vehicle.maintenance.state === "DUE").length;
  const soon = vehicles.filter((vehicle) => vehicle.maintenance.state === "SOON").length;

  return (
    <main className="portal-page">
      <header className="portal-top">
        <NakamaLogo />
        {openCase && <ChatLauncher open={chatOpen} unread={unreadCount} onToggle={() => setChatOpen(!chatOpen)} presence={me?.workshop.chat_status} />}
        <div>
          <strong>{me?.customer_name}</strong>
          <small>{me?.full_name}</small>
        </div>
        <button type="button" className="ghost" onClick={logout}>{t("Esci")}</button>
      </header>

      <div className="portal-body">
        {error && <div className="record-error" role="alert">{t(error)}</div>}

        {me?.must_change_password && (
          <section className="panel portal-password">
            <h2>{t("Imposta la tua password")}</h2>
            <p className="hint">{t("Stai usando la password temporanea ricevuta dall'officina: sceglila tu (almeno 10 caratteri).")}</p>
            <form className="record-form" onSubmit={changePassword}>
              <label>{t("Password temporanea")}<PasswordInput required autoComplete="current-password" value={passwords.current} onChange={(e) => setPasswords({ ...passwords, current: e.target.value })} /></label>
              <label>{t("Nuova password")}<PasswordInput required minLength={10} autoComplete="new-password" value={passwords.next} onChange={(e) => setPasswords({ ...passwords, next: e.target.value })} /></label>
              <div className="record-form-actions"><button className="primary">{t("Salva password")}</button></div>
            </form>
            {passwordNotice && <p className="hint" role="status">{t(passwordNotice)}</p>}
          </section>
        )}

        {selected ? (
          <section className="panel portal-vehicle">
            <button type="button" className="ghost" onClick={() => setSelected(null)}>← {t("Tutti i veicoli")}</button>
            <div className="portal-vehicle-head">
              <span className="plate-chip big">{selected.license_plate}</span>
              <div>
                <h2>{[selected.make, selected.model].filter(Boolean).join(" ") || t("Veicolo")}</h2>
                <small>{[selected.fleet_number && `${t("Flotta")} ${selected.fleet_number}`, selected.year, selected.fuel_type, km(selected.mileage)].filter(Boolean).join(" · ")}</small>
              </div>
            </div>

            <TelemetryCard reading={selected.telemetry} />

            <div className={`maintenance-card ${selected.maintenance.state.toLowerCase()}`}>
              <div>
                <small>{t("PROSSIMA MANUTENZIONE")}</small>
                <strong>{t(stateLabel[selected.maintenance.state])}</strong>
                <span>{countdown(selected.maintenance, t)}</span>
              </div>
              <dl>
                <dt>{t("Entro il")}</dt><dd>{day(selected.maintenance.next_service_date)}</dd>
                <dt>{t("Entro i")}</dt><dd>{km(selected.maintenance.next_service_km)}</dd>
                <dt>{t("Ultima")}</dt><dd>{day(selected.maintenance.last_service_date)} · {km(selected.maintenance.last_service_km)}</dd>
                <dt>{t("Intervallo")}</dt><dd>{[selected.maintenance.service_interval_km && km(selected.maintenance.service_interval_km), selected.maintenance.service_interval_months && `${selected.maintenance.service_interval_months} ${t("mesi")}`].filter(Boolean).join(" / ") || "—"}</dd>
              </dl>
            </div>

            {selected.current_case && openCase && (
              <div className="portal-current">
                <h3>{t("In officina ora")} · {openCase.case_number}</h3>
                <p className="portal-status-text">{t(openCase.status_text)}</p>
                <ol className="tracking-steps">
                  {openCase.steps.map((step) => (
                    <li key={step.code} className={step.current ? "current" : step.done ? "done" : ""}><i>{step.done ? "✓" : ""}</i><span>{t(step.label)}</span></li>
                  ))}
                </ol>
                {openCase.tasks_total > 0 && (
                  <>
                    <div className="tracking-bar"><span style={{ width: `${Math.round((openCase.tasks_done / openCase.tasks_total) * 100)}%` }} /></div>
                    <ul className="tracking-tasks">
                      {openCase.tasks.map((task, index) => <li key={index} className={task.status.toLowerCase()}><i>{task.status === "DONE" ? "✓" : task.status === "IN_PROGRESS" ? "●" : "○"}</i>{task.description}</li>)}
                    </ul>
                  </>
                )}
                {(markers.length > 0 || (selected.make && selected.model)) && (
                  <>
                    <h3>{t("Danni e interventi sul veicolo")}</h3>
                    <DamagePhotoMap
                      vehicle={{ make: selected.make || "", model: selected.model || "", year: selected.year, color: selected.color || "" }}
                      plate={selected.license_plate}
                      markers={markers}
                      loadRender={loadRender}
                      photos={photos}
                      plateSpots={openCase.vehicle?.plate_spots}
                      parts={openCase.parts}
                      scene={openCase.work_type === "MECHANICAL" ? "lift" : "turntable"}
                    />
                    <OtherPhotos photos={photos} />
                  </>
                )}
                {chatOpen && (
                  <div className="chat-dock" role="dialog" aria-label={t("Chat con l'officina")}>
                    <ChatThread
                      id="chat"
                      title="Chat con l'officina"
                      subtitle={`${openCase.case_number} · ${selected.license_plate}`}
                      messages={messages}
                      mine="CUSTOMER"
                      onSend={openCase.closed ? undefined : send}
                      closedText="Pratica chiusa: per altre richieste chiama l'officina."
                      onMinimize={() => setChatOpen(false)}
                      presence={me?.workshop.chat_status}
                    />
                  </div>
                )}
              </div>
            )}

            <h3>{t("Storico interventi")}</h3>
            {selected.history.length === 0 ? <p className="hint">{t("Nessun intervento registrato.")}</p> : (
              <ul className="portal-history">
                {selected.history.map((item) => (
                  <li key={item.id}>
                    <div className="portal-history-head">
                      <strong>{item.case_number}</strong>
                      <span className={`status-chip${item.closed ? " ok" : ""}`}>{t(item.status_text)}</span>
                      <small>{day(item.opened_at || item.updated_at)}{item.mileage ? ` · ${km(item.mileage)}` : ""}</small>
                    </div>
                    {item.customer_notes && <p className="hint">{item.customer_notes}</p>}
                    {item.tasks.length > 0 && <p>{item.tasks.map((task) => task.description).join(" · ")}</p>}
                    {item.estimate && <small>{t("Preventivo")} {item.estimate.estimate_number} · {money(item.estimate.total)}</small>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          <>
            <div className="portal-summary">
              <div><strong>{vehicles.length}</strong><span>{t("Veicoli")}</span></div>
              <div><strong>{inShop}</strong><span>{t("In officina")}</span></div>
              <div className={soon ? "soon" : ""}><strong>{soon}</strong><span>{t("Manutenzione vicina")}</span></div>
              <div className={due ? "due" : ""}><strong>{due}</strong><span>{t("Manutenzione scaduta")}</span></div>
            </div>
            {me && me.unread > 0 && <p className="portal-unread">{t("Hai nuovi messaggi dall'officina.")}</p>}
            <input className="portal-search" type="search" placeholder={t("Cerca targa, numero flotta o modello")} value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="portal-grid">
              {filtered.map((vehicle) => (
                <button type="button" key={vehicle.id} className={`portal-card ${vehicle.maintenance.state.toLowerCase()}`} onClick={() => openVehicle(vehicle.id)}>
                  <div className="portal-card-head">
                    <span className="plate-chip">{vehicle.license_plate}</span>
                    {vehicle.fleet_number && <small>#{vehicle.fleet_number}</small>}
                  </div>
                  <strong>{[vehicle.make, vehicle.model].filter(Boolean).join(" ") || t("Veicolo")}</strong>
                  {vehicle.current_case ? (
                    <span className="portal-in-shop">🔧 {t(vehicle.current_case.status_text)}{vehicle.current_case.tasks_total ? ` · ${vehicle.current_case.tasks_done}/${vehicle.current_case.tasks_total}` : ""}</span>
                  ) : <span className="portal-free">{t("Non in officina")}</span>}
                  <TelemetryBadge reading={vehicle.telemetry} />
                  <span className="portal-maintenance">{t(stateLabel[vehicle.maintenance.state])}{countdown(vehicle.maintenance, t) ? ` · ${countdown(vehicle.maintenance, t)}` : ""}</span>
                </button>
              ))}
              {vehicles.length > 0 && filtered.length === 0 && <p className="hint">{t("Nessun veicolo trovato.")}</p>}
              {me && vehicles.length === 0 && <p className="hint">{t("Nessun veicolo registrato: contatta l'officina.")}</p>}
            </div>
          </>
        )}

        {me && (
          <footer className="tracking-workshop">
            {me.contract && <span>{t("Contratto")}: <strong>{me.contract.name}</strong> · {t("dal")} {day(me.contract.start_date)}{me.contract.end_date ? ` ${t("al")} ${day(me.contract.end_date)}` : ""}</span>}
            <strong>{me.workshop.name}</strong>
            {me.workshop.address && <span>{me.workshop.address}</span>}
            <div>
              {me.workshop.phone && <a href={`tel:${me.workshop.phone.replace(/\s+/g, "")}`}>📞 {me.workshop.phone}</a>}
              {me.workshop.email && <a href={`mailto:${me.workshop.email}`}>✉ {me.workshop.email}</a>}
            </div>
          </footer>
        )}
      </div>
    </main>
  );
}
