"use client";

import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { useLanguage } from "./LanguageProvider";
import { apiError, apiFetch, hasPermission } from "../lib/api";
import { portalFetch } from "../lib/portal";

type Job = { kind: "TASK" | "REQUEST" | "MAINTENANCE"; description: string; status: string; case_number: string | null; case_id: string | null; date?: string | null; km?: number | null; note?: string | null };
type Maintenance = { state: "OK" | "SOON" | "DUE" | "UNKNOWN"; next_service_date?: string | null; next_service_km?: number | null };
type FleetVehicle = {
  id: string; license_plate: string; fleet_number?: string | null; make?: string | null; model?: string | null; version?: string | null;
  year?: number | null; vin?: string | null; mileage?: number | null; vehicle_category: string; fuel_type?: string | null;
  maintenance: Maintenance; todo: Job[]; done: Job[]; done_total: number;
};
type Profile = { customer_name: string; totals: { vehicles: number; with_todo: number; todo: number; done: number }; vehicles: FleetVehicle[] };
type ImportRow = { row: number; license_plate: string; action: "created" | "updated" | "skipped"; message: string | null; warnings: string[] };
type ImportResult = { dry_run: boolean; created: number; updated: number; skipped: number; rows: ImportRow[] };

const stateLabel: Record<Maintenance["state"], string> = { OK: "In regola", SOON: "Manutenzione vicina", DUE: "Manutenzione scaduta", UNKNOWN: "Piano non impostato" };
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
 * Staff mode adds the import from the customer's Excel file; portal mode is read-only.
 */
export function FleetProfile({ mode, customerId, query: externalQuery }: { mode: "staff" | "portal"; customerId?: string; query?: string }) {
  const { t } = useLanguage();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [ownQuery, setOwnQuery] = useState("");
  const [onlyTodo, setOnlyTodo] = useState(false);
  const [canImport, setCanImport] = useState(false);
  const [pending, setPending] = useState<{ file: File; result: ImportResult } | null>(null);
  const [importing, setImporting] = useState(false);
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

  const needle = query.trim().toUpperCase().replace(/\s+/g, "");
  const vehicles = (profile?.vehicles || []).filter((vehicle) => {
    if (onlyTodo && vehicle.todo.length === 0) return false;
    if (!needle) return true;
    return [vehicle.license_plate, vehicle.fleet_number, vehicle.make, vehicle.model, vehicle.vin].some((value) => (value || "").toUpperCase().replace(/\s+/g, "").includes(needle));
  });

  return (
    <div className="fleet-profile">
      {profile && (
        <div className="fleet-totals">
          <div><strong>{profile.totals.vehicles}</strong><span>{t("Veicoli")}</span></div>
          <div className={profile.totals.with_todo ? "soon" : ""}><strong>{profile.totals.with_todo}</strong><span>{t("Con lavori da fare")}</span></div>
          <div><strong>{profile.totals.todo}</strong><span>{t("Lavori da fare")}</span></div>
          <div><strong>{profile.totals.done}</strong><span>{t("Lavori fatti")}</span></div>
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
          {externalQuery === undefined && <input type="search" aria-label={t("Cerca targa")} placeholder={t("Cerca targa, numero flotta o modello")} value={ownQuery} onChange={(e) => setOwnQuery(e.target.value)} />}
          <label className="fleet-only-todo"><input type="checkbox" checked={onlyTodo} onChange={(e) => setOnlyTodo(e.target.checked)} /> {t("Solo con lavori da fare")}</label>
        </div>
      )}
      {mode === "staff" && canImport && !pending && (
        <p className="hint">{t("Colonne lette dal file: Targa (obbligatoria), N. flotta, Marca, Modello, Versione, Anno, Telaio, Km, Tipo, Alimentazione, Colore, Tagliando ogni km, Tagliando ogni mesi, Ultimo tagliando, Km ultimo tagliando. Formati: .xlsx o .csv.")}</p>
      )}
      {mode === "portal" && (profile?.totals.with_todo || 0) > 0 && (
        <label className="fleet-only-todo"><input type="checkbox" checked={onlyTodo} onChange={(e) => setOnlyTodo(e.target.checked)} /> {t("Solo con lavori da fare")}</label>
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
        {vehicles.map((vehicle) => (
          <details key={vehicle.id} className="fleet-vehicle" open={vehicles.length === 1 || (!!needle && vehicles.length <= 3)}>
            <summary>
              <span className="plate-chip">{vehicle.license_plate}</span>
              <span className="fleet-vehicle-name">
                <strong>{[vehicle.make, vehicle.model].filter(Boolean).join(" ") || t("Veicolo")}</strong>
                <small>{[vehicle.fleet_number && `#${vehicle.fleet_number}`, vehicle.vehicle_category !== "CAR" ? t(vehicle.vehicle_category) : null, vehicle.year, km(vehicle.mileage)].filter(Boolean).join(" · ")}</small>
              </span>
              <span className={`fleet-count${vehicle.todo.length ? " todo" : ""}`}>{vehicle.todo.length} {t("da fare")}</span>
              <span className="fleet-count">{vehicle.done_total} {t("fatti")}</span>
              <span className={`maintenance-state ${vehicle.maintenance.state.toLowerCase()}`}>{t(stateLabel[vehicle.maintenance.state])}</span>
            </summary>
            <div className="fleet-jobs">
              <section>
                <h4>{t("Lavori da fare")}</h4>
                {vehicle.todo.length === 0 ? <p className="hint">{t("Nessun lavoro in sospeso.")}</p> : (
                  <ul>{vehicle.todo.map((job, index) => <JobItem key={index} job={job} mode={mode} />)}</ul>
                )}
              </section>
              <section>
                <h4>{t("Lavori fatti")}</h4>
                {vehicle.done.length === 0 ? <p className="hint">{t("Nessun lavoro registrato.")}</p> : (
                  <ul>{vehicle.done.map((job, index) => <JobItem key={index} job={job} mode={mode} />)}</ul>
                )}
                {vehicle.done_total > vehicle.done.length && <p className="hint">{t("Mostrati gli ultimi")} {vehicle.done.length} {t("di")} {vehicle.done_total}.</p>}
              </section>
            </div>
            {(vehicle.vin || vehicle.version || vehicle.fuel_type) && <p className="hint fleet-vehicle-specs">{[vehicle.version, vehicle.fuel_type, vehicle.vin && `${t("Telaio")} ${vehicle.vin}`].filter(Boolean).join(" · ")}</p>}
          </details>
        ))}
      </div>
    </div>
  );
}

function JobItem({ job, mode }: { job: Job; mode: "staff" | "portal" }) {
  const { t } = useLanguage();
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
