"use client";

import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { useLanguage } from "./LanguageProvider";
import { apiError, apiFetch, hasPermission } from "../lib/api";
import { portalFetch } from "../lib/portal";
import { deleteVehiclesWithConfirm } from "../lib/vehicleDeletion";
import { VehicleProfile } from "./VehicleProfile";

export type Job = { kind: "TASK" | "REQUEST" | "MAINTENANCE"; description: string; status: string; case_number: string | null; case_id: string | null; date?: string | null; km?: number | null; note?: string | null };
type Maintenance = { state: "OK" | "SOON" | "DUE" | "UNKNOWN"; next_service_date?: string | null; next_service_km?: number | null };
type FleetVehicle = {
  id: string; license_plate: string; fleet_number?: string | null; make?: string | null; model?: string | null; version?: string | null;
  year?: number | null; vin?: string | null; mileage?: number | null; vehicle_category: string; fuel_type?: string | null;
  maintenance: Maintenance; todo: Job[]; done: Job[]; done_total: number; in_workshop?: boolean;
};
type Profile = { customer_name: string; totals: { vehicles: number; with_todo: number; todo: number; done: number }; vehicles: FleetVehicle[] };
type ImportRow = { row: number; license_plate: string; action: "created" | "updated" | "skipped"; message: string | null; warnings: string[] };
type ImportResult = { dry_run: boolean; created: number; updated: number; skipped: number; rows: ImportRow[] };

const stateLabel: Record<Maintenance["state"], string> = { OK: "In regola", SOON: "Manutenzione vicina", DUE: "Manutenzione scaduta", UNKNOWN: "Piano non impostato" };

// Row colour: red when the service is overdue or the vehicle is in the workshop, orange when it is close, green when in order.
function rowTone(vehicle: FleetVehicle): string {
  if (vehicle.in_workshop || vehicle.maintenance.state === "DUE") return " tone-due";
  if (vehicle.maintenance.state === "SOON") return " tone-soon";
  return vehicle.maintenance.state === "OK" ? " tone-ok" : "";
}
const actionLabel: Record<ImportRow["action"], string> = { created: "Nuovo", updated: "Aggiornato", skipped: "Scartato" };

function day(value?: string | null) {
  if (!value) return "";
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

function km(value?: number | null) {
  return value === null || value === undefined ? "" : `${new Intl.NumberFormat("it-IT").format(value)} km`;
}

/**
 * Fleet of a customer, plate by plate, with jobs to do and jobs done.
 * Staff mode adds the import from the customer's Excel file, selecting and deleting vehicles and
 * the profile of each vehicle with its history; portal mode is read-only: one row per plate that opens
 * the vehicle's profile, filtered by the portal's search box and maintenance tiles.
 */
export function FleetProfile({ mode, customerId, query: externalQuery, stateFilter, onOpenVehicle }: {
  mode: "staff" | "portal"; customerId?: string; query?: string; stateFilter?: "SOON" | "DUE" | null; onOpenVehicle?: (id: string) => void;
}) {
  const { language, t } = useLanguage();
  const words = (it: string, es: string) => language === "es" ? es : it;
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [ownQuery, setOwnQuery] = useState("");
  const [onlyTodo, setOnlyTodo] = useState(false);
  const [expand, setExpand] = useState<"todo" | "done" | null>(null);
  const [canImport, setCanImport] = useState(false);
  const [pending, setPending] = useState<{ file: File; result: ImportResult } | null>(null);
  const [importing, setImporting] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [openHistory, setOpenHistory] = useState<Set<string>>(new Set());
  const fileInput = useRef<HTMLInputElement>(null);
  const query = externalQuery ?? ownQuery;

  const load = useCallback(async () => {
    setError("");
    const response = await (mode === "portal" ? portalFetch("/portal/fleet") : apiFetch(`/customers/${customerId}/fleet`));
    if (!response.ok) { setError(await apiError(response, "Impossibile caricare la flotta.")); return; }
    setProfile(await response.json());
  }, [mode, customerId]);

  useEffect(() => {
    setCanImport(mode === "staff" && hasPermission("vehicle.write"));
    setCanDelete(mode === "staff" && hasPermission("vehicle.write"));
    setSelected(new Set());
    setProfileId(null);
    setPending(null);
    setNotice("");
    load().catch(() => setError("Errore di connessione."));
  }, [load, mode]);

  async function upload(file: File, dryRun: boolean): Promise<ImportResult | null> {
    const response = await apiFetch(`/customers/${customerId}/fleet/import?filename=${encodeURIComponent(file.name)}&dry_run=${dryRun}`, {
      method: "POST", body: file, headers: { "Content-Type": "application/octet-stream" },
    });
    if (!response.ok) { setError(await apiError(response, "Impossibile leggere il file.")); return null; }
    return response.json();
  }

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setImporting(true); setError(""); setNotice(""); setPending(null);
    try {
      const result = await upload(file, true);
      if (result) setPending({ file, result });
    } catch { setError("Errore di connessione."); } finally { setImporting(false); }
  }

  async function confirmImport() {
    if (!pending) return;
    setImporting(true); setError("");
    try {
      const result = await upload(pending.file, false);
      if (!result) return;
      setPending(null);
      setNotice(`${t("Importazione completata")}: ${result.created} ${t("nuovi")}, ${result.updated} ${t("aggiornati")}, ${result.skipped} ${t("scartati")}.`);
      await load();
    } catch { setError("Errore di connessione."); } finally { setImporting(false); }
  }

  async function downloadTemplate() {
    const response = await apiFetch("/fleet-import/template");
    if (!response.ok) { setError(await apiError(response, "Impossibile scaricare il modello.")); return; }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = "modello-flotta.xlsx";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function removeSelected() {
    setDeleting(true); setError(""); setNotice("");
    try {
      const result = await deleteVehiclesWithConfirm([...selected], words);
      if (!result.deleted.length) return;
      setSelected(new Set([...selected].filter((id) => !result.deleted.some((item) => item.id === id))));
      setNotice(`${t("Veicoli eliminati")}: ${result.deleted.length}.${result.kept.length ? ` ${t("Non eliminati")}: ${result.kept.join(", ")}.` : ""}`);
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Errore di connessione."); } finally { setDeleting(false); }
  }

  function toggle(id: string, on: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  }

  // Plate, fleet number, make, model, version or VIN; spaces and dashes are ignored ("ab 123-cd" finds AB123CD).
  const squash = (value: string) => value.toUpperCase().replace(/[\s\-.]+/g, "");
  const needle = squash(query.trim());
  const vehicles = (profile?.vehicles || []).filter((vehicle) => {
    if (onlyTodo && vehicle.todo.length === 0) return false;
    if (stateFilter && vehicle.maintenance.state !== stateFilter) return false;
    if (!needle) return true;
    return [vehicle.license_plate, vehicle.fleet_number, vehicle.make, vehicle.model, vehicle.version, vehicle.vin, [vehicle.make, vehicle.model].filter(Boolean).join("")]
      .some((value) => squash(value || "").includes(needle));
  });
  const allVisibleSelected = vehicles.length > 0 && vehicles.every((vehicle) => selected.has(vehicle.id));
  const openVehicle = mode === "staff" ? (id: string) => setProfileId(id) : onOpenVehicle;

  return (
    <div className="fleet-profile">
      {profile && mode === "staff" && (
        <div className="fleet-totals">
          <button type="button" className={!onlyTodo && !expand ? "active" : ""} onClick={() => { setOnlyTodo(false); setExpand(null); }}><strong>{profile.totals.vehicles}</strong><span>{t("Veicoli")}</span></button>
          <button type="button" className={`${profile.totals.with_todo ? "soon" : ""}${onlyTodo && !expand ? " active" : ""}`} onClick={() => { setOnlyTodo(true); setExpand(null); }}><strong>{profile.totals.with_todo}</strong><span>{t("Con lavori da fare")}</span></button>
          <button type="button" className={expand === "todo" ? "active" : ""} onClick={() => { setOnlyTodo(true); setExpand("todo"); }}><strong>{profile.totals.todo}</strong><span>{t("Lavori da fare")}</span></button>
          <button type="button" className={expand === "done" ? "active" : ""} onClick={() => { setOnlyTodo(false); setExpand("done"); }}><strong>{profile.totals.done}</strong><span>{t("Lavori fatti")}</span></button>
        </div>
      )}

      {mode === "staff" && (
        <div className="fleet-toolbar">
          {canImport && (
            <>
              <input ref={fileInput} type="file" hidden accept=".xlsx,.xlsm,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onChange={chooseFile} />
              <button type="button" className="primary" disabled={importing} onClick={() => fileInput.current?.click()}>{importing ? t("Lettura del file…") : t("Importa flotta da Excel")}</button>
              <button type="button" className="secondary" onClick={() => downloadTemplate().catch(() => setError("Errore di connessione."))}>{t("Scarica modello Excel")}</button>
            </>
          )}
          <label className="fleet-only-todo"><input type="checkbox" checked={onlyTodo} onChange={(e) => { setOnlyTodo(e.target.checked); setExpand(null); }} /> {t("Solo con lavori da fare")}</label>
        </div>
      )}
      {mode === "staff" && canImport && !pending && (
        <p className="hint">{t("Colonne lette dal file: Targa (obbligatoria), N. flotta, Marca, Modello, Versione, Anno, Telaio, Km, Tipo, Alimentazione, Colore, Tagliando ogni km, Tagliando ogni mesi, Ultimo tagliando, Km ultimo tagliando. Formati: .xlsx o .csv.")}</p>
      )}
      {externalQuery === undefined && (profile?.vehicles.length || 0) > 0 && (
        <div className="fleet-search">
          <label>
            <span aria-hidden="true">🔍</span>
            <input type="search" aria-label={t("Cerca veicolo")} placeholder={t("Cerca veicolo: targa, n. flotta, marca, modello o telaio")} value={ownQuery} onChange={(e) => setOwnQuery(e.target.value)} />
          </label>
          {(needle || onlyTodo) && <small>{vehicles.length} {t("di")} {profile?.vehicles.length} {t("veicoli")}</small>}
        </div>
      )}
      {canDelete && vehicles.length > 0 && (
        <div className="fleet-selection">
          <label><input type="checkbox" checked={allVisibleSelected} onChange={(e) => setSelected(e.target.checked ? new Set([...selected, ...vehicles.map((vehicle) => vehicle.id)]) : new Set([...selected].filter((id) => !vehicles.some((vehicle) => vehicle.id === id))))} /> {needle || onlyTodo ? t("Seleziona quelli trovati") : t("Seleziona tutti")}</label>
          {selected.size > 0 && (
            <>
              <strong>{selected.size} {t("selezionati")}</strong>
              <button type="button" className="secondary record-delete" disabled={deleting} onClick={removeSelected}>{deleting ? t("Eliminazione…") : t("Elimina selezionati")}</button>
              <button type="button" className="ghost" disabled={deleting} onClick={() => setSelected(new Set())}>{t("Annulla selezione")}</button>
            </>
          )}
        </div>
      )}
      {mode === "portal" && (profile?.totals.with_todo || 0) > 0 && (
        <label className="fleet-only-todo"><input type="checkbox" checked={onlyTodo} onChange={(e) => { setOnlyTodo(e.target.checked); setExpand(null); }} /> {t("Solo con lavori da fare")}</label>
      )}

      {error && <p className="record-error" role="alert">{t(error)}</p>}
      {notice && <p className="hint" role="status">{notice}</p>}

      {pending && (
        <div className="fleet-import-preview" role="region" aria-label={t("Anteprima importazione")}>
          <h3>{t("Anteprima importazione")} · {pending.file.name}</h3>
          <p>
            <span className="status-chip ok">{pending.result.created} {t("nuovi")}</span>{" "}
            <span className="status-chip">{pending.result.updated} {t("aggiornati")}</span>{" "}
            <span className={`status-chip${pending.result.skipped ? " status-cancelled" : ""}`}>{pending.result.skipped} {t("scartati")}</span>
          </p>
          <div className="fleet-import-rows">
            {pending.result.rows.map((row) => (
              <div key={row.row} className={`fleet-import-row ${row.action}`}>
                <small>{t("Riga")} {row.row}</small>
                <strong>{row.license_plate || "—"}</strong>
                <span>{t(actionLabel[row.action])}</span>
                <small>{[row.message && t(row.message), ...row.warnings].filter(Boolean).join(" · ")}</small>
              </div>
            ))}
          </div>
          <div className="record-form-actions">
            <button type="button" className="primary" disabled={importing || pending.result.created + pending.result.updated === 0} onClick={confirmImport}>
              {importing ? t("Importazione…") : `${t("Conferma importazione")} (${pending.result.created + pending.result.updated})`}
            </button>
            <button type="button" className="secondary" disabled={importing} onClick={() => setPending(null)}>{t("Annulla")}</button>
          </div>
        </div>
      )}

      {!profile && !error && <p className="hint">{t("Caricamento…")}</p>}
      {profile && profile.vehicles.length === 0 && <p className="hint">{mode === "staff" ? t("Nessun veicolo: importa la flotta dal file Excel del cliente o aggiungi i veicoli uno a uno.") : t("Nessun veicolo registrato: contatta l'officina.")}</p>}
      {profile && profile.vehicles.length > 0 && vehicles.length === 0 && <p className="hint">{t("Nessun veicolo trovato.")}</p>}

      <div className="fleet-vehicles">
        {mode === "portal" && vehicles.map((vehicle) => (
          <button type="button" key={vehicle.id} className={`fleet-vehicle fleet-vehicle-link${rowTone(vehicle)}`} onClick={() => onOpenVehicle?.(vehicle.id)}>
            <span className="plate-chip">{vehicle.license_plate}</span>
            <span className="fleet-vehicle-name">
              <strong>{[vehicle.make, vehicle.model].filter(Boolean).join(" ") || t("Veicolo")}</strong>
              <small>{[vehicle.fleet_number && `#${vehicle.fleet_number}`, vehicle.vehicle_category !== "CAR" ? t(vehicle.vehicle_category) : null, vehicle.year, km(vehicle.mileage)].filter(Boolean).join(" · ")}</small>
            </span>
            <span className={`fleet-count${vehicle.todo.length ? " todo" : ""}`}>{vehicle.todo.length} {t("da fare")}</span>
            <span className="fleet-count">{vehicle.done_total} {t("fatti")}</span>
            <span className={`maintenance-state ${vehicle.maintenance.state.toLowerCase()}`}>{t(stateLabel[vehicle.maintenance.state])}{vehicle.in_workshop && <em className="fleet-in-workshop">{t("In officina")}</em>}</span>
            <span className="fleet-vehicle-go" aria-hidden="true">›</span>
          </button>
        ))}
        {mode === "staff" && vehicles.map((vehicle) => (
          <details key={vehicle.id} className={`fleet-vehicle${rowTone(vehicle)}${canDelete ? " selectable" : ""}${selected.has(vehicle.id) ? " selected" : ""}`} open={vehicles.length === 1 || (!!needle && vehicles.length <= 3) || (expand === "todo" && vehicle.todo.length > 0) || (expand === "done" && vehicle.done.length > 0)}>
            <summary>
              {canDelete && <input type="checkbox" className="fleet-select" aria-label={`${t("Seleziona")} ${vehicle.license_plate}`} checked={selected.has(vehicle.id)} onClick={(e) => e.stopPropagation()} onChange={(e) => toggle(vehicle.id, e.target.checked)} />}
              <span className="plate-chip">{vehicle.license_plate}</span>
              <span className="fleet-vehicle-name">
                <strong>{[vehicle.make, vehicle.model].filter(Boolean).join(" ") || t("Veicolo")}</strong>
                <small>{[vehicle.fleet_number && `#${vehicle.fleet_number}`, vehicle.vehicle_category !== "CAR" ? t(vehicle.vehicle_category) : null, vehicle.year, km(vehicle.mileage)].filter(Boolean).join(" · ")}</small>
              </span>
              <span className={`fleet-count${vehicle.todo.length ? " todo" : ""}`}>{vehicle.todo.length} {t("da fare")}</span>
              <span className="fleet-count">{vehicle.done_total} {t("fatti")}</span>
              <span className={`maintenance-state ${vehicle.maintenance.state.toLowerCase()}`}>{t(stateLabel[vehicle.maintenance.state])}{vehicle.in_workshop && <em className="fleet-in-workshop">{t("In officina")}</em>}</span>
              {mode === "staff" && <button type="button" className="secondary fleet-profile-button" onClick={(e) => { e.preventDefault(); setProfileId(vehicle.id); }}>{t("Profilo")}</button>}
            </summary>
            <div className="fleet-jobs">
              <section>
                <h4>{t("Lavori da fare")}</h4>
                {vehicle.todo.length === 0 ? <p className="hint">{t("Nessun lavoro in sospeso.")}</p> : (
                  <ul>{vehicle.todo.map((job, index) => <JobItem key={index} job={job} mode={mode} />)}</ul>
                )}
              </section>
              <section>
                {(() => {
                  // The history of done jobs stays collapsed until opened (or the "done" total was clicked).
                  const historyOpen = expand === "done" || openHistory.has(vehicle.id);
                  return <>
                    <div className="fleet-history-head">
                      <h4>{t("Lavori fatti")}</h4>
                      {vehicle.done.length > 0 && expand !== "done" && (
                        <button type="button" className="secondary fleet-history-toggle" aria-expanded={historyOpen} onClick={() => setOpenHistory((current) => {
                          const next = new Set(current);
                          if (next.has(vehicle.id)) next.delete(vehicle.id); else next.add(vehicle.id);
                          return next;
                        })}>{historyOpen ? `▴ ${t("Nascondi storico")}` : `▾ ${t("Mostra storico")} (${vehicle.done_total})`}</button>
                      )}
                    </div>
                    {vehicle.done.length === 0 && <p className="hint">{t("Nessun lavoro registrato.")}</p>}
                    {vehicle.done.length > 0 && historyOpen && <ul>{vehicle.done.map((job, index) => <JobItem key={index} job={job} mode={mode} />)}</ul>}
                    {historyOpen && vehicle.done_total > vehicle.done.length && <p className="hint">{t("Mostrati gli ultimi")} {vehicle.done.length} {t("di")} {vehicle.done_total}.</p>}
                  </>;
                })()}
              </section>
            </div>
            {(vehicle.vin || vehicle.version || vehicle.fuel_type) && <p className="hint fleet-vehicle-specs">{[vehicle.version, vehicle.fuel_type, vehicle.vin && `${t("Telaio")} ${vehicle.vin}`].filter(Boolean).join(" · ")}</p>}
            {openVehicle && <div className="fleet-vehicle-open"><button type="button" className="secondary" onClick={() => openVehicle(vehicle.id)}>{mode === "staff" ? t("Profilo veicolo e storico") : t("Apri scheda veicolo")} →</button></div>}
          </details>
        ))}
      </div>
      {profileId && <VehicleProfile vehicleId={profileId} onClose={() => setProfileId(null)} onChanged={() => { load().catch(() => setError("Errore di connessione.")); }} />}
    </div>
  );
}

export function JobItem({ job, mode }: { job: Job; mode: "staff" | "portal" }) {
  const { language, t } = useLanguage();
  const words = (it: string, es: string) => language === "es" ? es : it;
  const status = job.kind === "MAINTENANCE" ? stateLabel[job.status as Maintenance["state"]] : job.kind === "REQUEST" ? "In attesa di lavorazione" : job.status;
  const when = [day(job.date), km(job.km)].filter(Boolean).join(" · ");
  return (
    <li className={`fleet-job ${job.kind.toLowerCase()} ${job.status.toLowerCase()}`}>
      <span>{job.kind === "MAINTENANCE" ? `🛠 ${t("Tagliando")}` : job.description}</span>
      <small>
        {t(status)}
        {job.case_number && <> · {mode === "staff" ? <a href={`/pratiche?q=${encodeURIComponent(job.case_number)}`}>{job.case_number}</a> : job.case_number}</>}
        {when && ` · ${when}`}
      </small>
      {job.note && <small className="fleet-job-note">{job.note}</small>}
    </li>
  );
}
