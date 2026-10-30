"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useLanguage } from "./LanguageProvider";
import { apiError, apiFetch, hasPermission } from "../lib/api";
import { VehicleFront } from "./VehicleFront";
import { deleteVehiclesWithConfirm } from "../lib/vehicleDeletion";

type Task = { description: string; status: string; note?: string | null; completed_at?: string | null };
type HistoryCase = {
  id: string; case_number: string; status: string; work_type: string; kind: "REPAIR" | "MAINTENANCE"; closed: boolean;
  opened_at?: string | null; mileage?: number | null; customer_notes?: string | null; estimate_total?: string | null; tasks: Task[];
};
type Maintenance = {
  state: "OK" | "SOON" | "DUE" | "UNKNOWN"; service_interval_km?: number | null; service_interval_months?: number | null;
  last_service_date?: string | null; last_service_km?: number | null; next_service_date?: string | null; next_service_km?: number | null;
  days_left?: number | null; km_left?: number | null;
};
type Profile = {
  id: string; license_plate: string; fleet_number?: string | null; make?: string | null; model?: string | null; version?: string | null;
  year?: number | null; vin?: string | null; mileage?: number | null; vehicle_category: string; fuel_type?: string | null;
  engine_size?: string | null; power_kw?: number | null; color_name?: string | null; customer_name?: string | null;
  maintenance: Maintenance; totals: { cases: number; repairs: number; maintenance: number; open: number }; history: HistoryCase[];
};

const stateLabel: Record<Maintenance["state"], string> = { OK: "In regola", SOON: "Manutenzione vicina", DUE: "Manutenzione scaduta", UNKNOWN: "Piano non impostato" };
const planFields = ["mileage", "service_interval_km", "service_interval_months", "last_service_date", "last_service_km", "next_service_date", "next_service_km"] as const;

function day(value?: string | null) {
  if (!value) return "";
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

function km(value?: number | null) {
  return value === null || value === undefined ? "" : `${new Intl.NumberFormat("it-IT").format(value)} km`;
}

/**
 * Profile of one vehicle for the workshop: its data, maintenance plan and the history of repairs and
 * services taken from its cases and work orders. Opens over the page; `onChanged` refreshes the list behind.
 */
export function VehicleProfile({ vehicleId, onClose, onChanged }: { vehicleId: string; onClose: () => void; onChanged?: () => void }) {
  const { language, t } = useLanguage();
  const words = (it: string, es: string) => language === "es" ? es : it;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState<"ALL" | HistoryCase["kind"]>("ALL");
  const [canWrite, setCanWrite] = useState(false);
  const [plan, setPlan] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await apiFetch(`/vehicles/${vehicleId}/profile`);
    if (!response.ok) { setError(await apiError(response, "Impossibile caricare il veicolo.")); return; }
    setProfile(await response.json());
  }, [vehicleId]);

  useEffect(() => {
    setCanWrite(hasPermission("vehicle.write"));
    setProfile(null); setError(""); setNotice(""); setPlan(null); setFilter("ALL");
    load().catch(() => setError("Errore di connessione."));
  }, [load]);

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);

  function editPlan() {
    if (!profile) return;
    const source: Record<string, unknown> = { ...profile.maintenance, mileage: profile.mileage };
    setPlan(Object.fromEntries(planFields.map((field) => [field, source[field] === null || source[field] === undefined ? "" : String(source[field])])));
  }

  async function savePlan(event: FormEvent) {
    event.preventDefault();
    if (!plan) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const body = Object.fromEntries(planFields.map((field) => [field, plan[field] === "" ? null : field.endsWith("_date") ? plan[field] : Number(plan[field])]));
      const response = await apiFetch(`/vehicles/${vehicleId}/maintenance`, { method: "PATCH", body: JSON.stringify(body) });
      if (!response.ok) { setError(await apiError(response, "Controlla i campi e i dati obbligatori.")); return; }
      setPlan(null); setNotice("Piano di manutenzione salvato."); onChanged?.();
      await load();
    } catch { setError("Errore di connessione."); } finally { setBusy(false); }
  }

  // Make, model and version from the plate provider (one credit per plate; cached by the API).
  async function fillFromPlate() {
    if (!profile) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const lookup = await apiFetch(`/vehicles/plate-data/${encodeURIComponent(profile.license_plate)}`);
      if (lookup.status === 404) { setError("Targa non trovata nella banca dati."); return; }
      if (lookup.status === 503) { setError("Ricerca per targa non configurata."); return; }
      if (lookup.status === 429) { setError("Limite mensile di ricerche per targa raggiunto."); return; }
      if (!lookup.ok) { setError(await apiError(lookup, "Ricerca per targa non riuscita.")); return; }
      const data = await lookup.json();
      const changes = Object.fromEntries((["make", "model", "version", "year", "vin", "fuel_type", "engine_size", "power_kw"] as const)
        .filter((field) => data[field] !== null && data[field] !== undefined && !profile[field]).map((field) => [field, data[field]]));
      if (Object.keys(changes).length) {
        const saved = await apiFetch(`/vehicles/${vehicleId}`, { method: "PATCH", body: JSON.stringify(changes) });
        if (!saved.ok) { setError(await apiError(saved, "Operazione non riuscita. Riprova.")); return; }
      }
      setNotice("Dati del veicolo aggiornati dalla targa."); onChanged?.();
      await load();
    } catch { setError("Errore di connessione."); } finally { setBusy(false); }
  }

  async function remove() {
    if (!profile) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await deleteVehiclesWithConfirm([profile.id], words);
      if (result.deleted.length) { onChanged?.(); onClose(); }
    } catch (e) { setError(e instanceof Error ? e.message : "Errore di connessione."); } finally { setBusy(false); }
  }

  const history = (profile?.history || []).filter((item) => filter === "ALL" || item.kind === filter);
  const maintenance = profile?.maintenance;
  const specs: [string, string | number | null | undefined][] = profile ? [
    ["N. flotta", profile.fleet_number], ["Tipo veicolo", t(profile.vehicle_category)], ["Anno", profile.year], ["Chilometri", km(profile.mileage)],
    ["Versione", profile.version], ["Alimentazione", profile.fuel_type], ["Cilindrata (cc)", profile.engine_size], ["Potenza (kW)", profile.power_kw],
    ["Colore", profile.color_name], ["Telaio", profile.vin],
  ] : [];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="panel vehicle-profile" role="dialog" aria-modal="true" aria-label={t("Profilo veicolo")} onClick={(event) => event.stopPropagation()}>
        <header className="vehicle-profile-head">
          <span className="plate-chip big">{profile?.license_plate || "…"}</span>
          <div>
            <h2>{profile ? [profile.make, profile.model].filter(Boolean).join(" ") || t("Marca e modello non indicati") : t("Caricamento…")}</h2>
            {profile?.customer_name && <small>{profile.customer_name}</small>}
          </div>
          {profile && <VehicleFront make={profile.make} model={profile.model} year={profile.year} color={profile.color_name} size={120} />}
          <button type="button" className="secondary" onClick={onClose}>{t("Chiudi")}</button>
        </header>

        {error && <p className="record-error" role="alert">{t(error)}</p>}
        {notice && <p className="hint" role="status">{t(notice)}</p>}

        {profile && (
          <>
            <div className="vehicle-profile-actions">
              {canWrite && !profile.make && <button type="button" className="primary" disabled={busy} onClick={fillFromPlate}>{t("Recupera marca e modello dalla targa")}</button>}
              <a className="secondary link-button" href={`/veicoli?q=${encodeURIComponent(profile.license_plate)}`}>{t("Modifica dati")}</a>
              <a className="secondary link-button" href={`/pratiche?q=${encodeURIComponent(profile.license_plate)}`}>{t("Pratiche")}</a>
              {canWrite && <button type="button" className="secondary record-delete" disabled={busy} onClick={remove}>{t("Elimina veicolo")}</button>}
            </div>

            <div className="vehicle-profile-grid">
              <section>
                <h3>{t("Dati del veicolo")}</h3>
                <dl className="vehicle-specs">
                  {specs.filter(([, value]) => value !== null && value !== undefined && value !== "").map(([label, value]) => (
                    <div key={label}><dt>{t(label)}</dt><dd>{value}</dd></div>
                  ))}
                </dl>
              </section>
              <section>
                <h3>{t("Piano di manutenzione")} <span className={`maintenance-state ${maintenance!.state.toLowerCase()}`}>{t(stateLabel[maintenance!.state])}</span></h3>
                {!plan ? (
                  <>
                    <dl className="vehicle-specs">
                      {maintenance!.next_service_date && <div><dt>{t("Prossimo tagliando")}</dt><dd>{day(maintenance!.next_service_date)}{maintenance!.days_left !== null && maintenance!.days_left !== undefined && (maintenance!.days_left >= 0 ? ` (${maintenance!.days_left} ${t("giorni")})` : ` (${t("scaduto da")} ${-maintenance!.days_left} ${t("giorni")})`)}</dd></div>}
                      {maintenance!.next_service_km !== null && maintenance!.next_service_km !== undefined && <div><dt>{t("Prossimo tagliando a")}</dt><dd>{km(maintenance!.next_service_km)}{maintenance!.km_left !== null && maintenance!.km_left !== undefined && (maintenance!.km_left >= 0 ? ` (${t("mancano")} ${km(maintenance!.km_left)})` : ` (${t("superato di")} ${km(-maintenance!.km_left)})`)}</dd></div>}
                      {(maintenance!.service_interval_km || maintenance!.service_interval_months) && <div><dt>{t("Intervallo")}</dt><dd>{[km(maintenance!.service_interval_km), maintenance!.service_interval_months && `${maintenance!.service_interval_months} ${t("mesi")}`].filter(Boolean).join(" / ")}</dd></div>}
                      {(maintenance!.last_service_date || maintenance!.last_service_km) && <div><dt>{t("Ultimo tagliando")}</dt><dd>{[day(maintenance!.last_service_date), km(maintenance!.last_service_km)].filter(Boolean).join(" · ")}</dd></div>}
                    </dl>
                    {maintenance!.state === "UNKNOWN" && <p className="hint">{t("Imposta l'intervallo e l'ultimo tagliando per avere gli avvisi di manutenzione.")}</p>}
                    {canWrite && <button type="button" className="secondary" onClick={editPlan}>{t("Modifica piano")}</button>}
                  </>
                ) : (
                  <form className="vehicle-plan-form" onSubmit={savePlan}>
                    {([
                      ["mileage", "Km attuali", "number"], ["service_interval_km", "Tagliando ogni km", "number"], ["service_interval_months", "Tagliando ogni mesi", "number"],
                      ["last_service_date", "Ultimo tagliando", "date"], ["last_service_km", "Km ultimo tagliando", "number"],
                      ["next_service_date", "Prossimo tagliando (data fissa)", "date"], ["next_service_km", "Prossimo tagliando (km fissi)", "number"],
                    ] as const).map(([field, label, type]) => (
                      <label key={field}>{t(label)}<input type={type} min={type === "number" ? 0 : undefined} value={plan[field]} onChange={(e) => setPlan({ ...plan, [field]: e.target.value })} /></label>
                    ))}
                    <div className="record-form-actions">
                      <button className="primary" disabled={busy}>{busy ? t("Salvataggio…") : t("Salva")}</button>
                      <button type="button" className="secondary" disabled={busy} onClick={() => setPlan(null)}>{t("Annulla")}</button>
                    </div>
                  </form>
                )}
              </section>
            </div>

            <section className="vehicle-history">
              <div className="vehicle-history-head">
                <h3>{t("Storico riparazioni e manutenzioni")}</h3>
                <div className="vehicle-history-filter" role="group" aria-label={t("Filtra storico")}>
                  {([["ALL", "Tutto", profile.totals.cases], ["REPAIR", "Riparazioni", profile.totals.repairs], ["MAINTENANCE", "Manutenzioni", profile.totals.maintenance]] as const).map(([value, label, count]) => (
                    <button key={value} type="button" className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{t(label)} ({count})</button>
                  ))}
                </div>
              </div>
              {history.length === 0 ? <p className="hint">{t("Nessun intervento registrato per questo veicolo.")}</p> : (
                <ol className="vehicle-timeline">
                  {history.map((item) => (
                    <li key={item.id} className={`${item.kind.toLowerCase()}${item.closed ? "" : " open"}`}>
                      <div className="vehicle-timeline-head">
                        <span className={`vehicle-kind ${item.kind.toLowerCase()}`}>{item.kind === "MAINTENANCE" ? `🛠 ${t("Manutenzione")}` : `🔧 ${t("Riparazione")}`}</span>
                        <strong>{day(item.opened_at)}</strong>
                        {item.mileage !== null && item.mileage !== undefined && <span>{km(item.mileage)}</span>}
                        <a href={`/pratiche?q=${encodeURIComponent(item.case_number)}`}>{item.case_number}</a>
                        <span className="status-chip">{t(item.status)}</span>
                        <small>{item.work_type === "MECHANICAL" ? t("Meccanica") : t("Carrozzeria")}{item.estimate_total && ` · € ${item.estimate_total}`}</small>
                      </div>
                      {item.customer_notes && <p>{item.customer_notes}</p>}
                      {item.tasks.length > 0 && (
                        <ul>
                          {item.tasks.map((task, index) => (
                            <li key={index} className={`fleet-job task ${task.status.toLowerCase()}`}>
                              <span>{task.description}</span>
                              <small>{t(task.status)}{task.completed_at && ` · ${day(task.completed_at)}`}</small>
                              {task.note && <small className="fleet-job-note">{task.note}</small>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </section>
          </>
        )}
      </section>
    </div>
  );
}
