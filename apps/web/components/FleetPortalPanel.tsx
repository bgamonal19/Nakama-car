"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useLanguage } from "./LanguageProvider";
import { apiError, apiFetch, hasPermission } from "../lib/api";
import { TelemetryBadge, TelemetryReading } from "./Telemetry";

type Account = { id: string; email: string; full_name: string; active: boolean; must_change_password: boolean; last_login_at?: string | null; temporary_password?: string };
type Maintenance = {
  service_interval_km?: number | null; service_interval_months?: number | null; last_service_date?: string | null; last_service_km?: number | null;
  next_service_date?: string | null; next_service_km?: number | null; days_left?: number | null; km_left?: number | null; state: string;
};
type FleetVehicle = { id: string; license_plate: string; make?: string | null; model?: string | null; fleet_number?: string | null; mileage?: number | null; maintenance: Maintenance; telemetry?: TelemetryReading | null; current_case: { case_number: string; status_text: string } | null };
type Row = { mileage: string; service_interval_km: string; service_interval_months: string; last_service_date: string; last_service_km: string };

const stateLabel: Record<string, string> = { OK: "In regola", SOON: "Manutenzione vicina", DUE: "Manutenzione scaduta", UNKNOWN: "Piano non impostato" };

function rowFrom(vehicle: FleetVehicle): Row {
  const m = vehicle.maintenance;
  const text = (value?: number | string | null) => (value === null || value === undefined ? "" : String(value));
  return {
    mileage: text(vehicle.mileage), service_interval_km: text(m.service_interval_km), service_interval_months: text(m.service_interval_months),
    last_service_date: text(m.last_service_date), last_service_km: text(m.last_service_km),
  };
}

const number = (value: string) => (value.trim() === "" ? null : Number(value));

/** Portal logins and maintenance plan of a fleet customer (from its contract). */
export function FleetPortalPanel({ customerId, customerName, onClose }: { customerId: string; customerName: string; onClose: () => void }) {
  const { t } = useLanguage();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [draft, setDraft] = useState({ email: "", full_name: "" });
  const [issued, setIssued] = useState<Account | null>(null);
  const [message, setMessage] = useState("");
  const [canWrite, setCanWrite] = useState(false);
  const [canEditVehicles, setCanEditVehicles] = useState(false);

  const load = useCallback(async () => {
    const [accountsResponse, vehiclesResponse] = await Promise.all([
      apiFetch(`/customers/${customerId}/portal-accounts`),
      apiFetch(`/customers/${customerId}/fleet-vehicles`),
    ]);
    if (accountsResponse.ok) setAccounts(await accountsResponse.json());
    if (vehiclesResponse.ok) {
      const list: FleetVehicle[] = await vehiclesResponse.json();
      setVehicles(list);
      setRows(Object.fromEntries(list.map((vehicle) => [vehicle.id, rowFrom(vehicle)])));
    }
  }, [customerId]);

  useEffect(() => {
    setCanWrite(hasPermission("customer.write"));
    setCanEditVehicles(hasPermission("vehicle.write"));
    setIssued(null);
    setMessage("");
    load();
  }, [load]);

  const portalUrl = typeof window !== "undefined" ? `${window.location.origin}/portale/login` : "/portale/login";

  async function createAccount(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    const response = await apiFetch(`/customers/${customerId}/portal-accounts`, { method: "POST", body: JSON.stringify(draft) });
    if (!response.ok) { setMessage(await apiError(response, "Impossibile creare l'accesso.")); return; }
    setIssued(await response.json());
    setDraft({ email: "", full_name: "" });
    load();
  }

  async function reset(account: Account) {
    if (!window.confirm(t("Generare una nuova password temporanea? Quella attuale smetterà di funzionare."))) return;
    const response = await apiFetch(`/portal-accounts/${account.id}/reset-password`, { method: "POST" });
    if (response.ok) { setIssued(await response.json()); load(); }
  }

  async function toggle(account: Account) {
    const response = await apiFetch(`/portal-accounts/${account.id}`, { method: "PATCH", body: JSON.stringify({ active: !account.active }) });
    if (response.ok) load();
  }

  async function saveRow(vehicle: FleetVehicle, serviceDoneToday = false) {
    const row = rows[vehicle.id];
    const payload: Record<string, unknown> = {
      mileage: number(row.mileage), service_interval_km: number(row.service_interval_km), service_interval_months: number(row.service_interval_months),
      last_service_date: row.last_service_date || null, last_service_km: number(row.last_service_km),
    };
    if (serviceDoneToday) {
      payload.last_service_date = new Date().toISOString().slice(0, 10);
      payload.last_service_km = number(row.mileage);
      payload.next_service_date = null;
      payload.next_service_km = null;
    }
    const response = await apiFetch(`/vehicles/${vehicle.id}/maintenance`, { method: "PATCH", body: JSON.stringify(payload) });
    if (!response.ok) { setMessage(await apiError(response, "Impossibile salvare la manutenzione.")); return; }
    setMessage(`${vehicle.license_plate}: ${t("manutenzione salvata.")}`);
    load();
  }

  const handoff = issued?.temporary_password
    ? `${t("Accesso area clienti")} ${customerName}\n${portalUrl}\n${t("Email")}: ${issued.email}\n${t("Password temporanea")}: ${issued.temporary_password}`
    : "";

  return (
    <section className="panel fleet-portal" aria-label={t("Portale cliente")}>
      <div className="panel-head">
        <h2>{t("Portale cliente")} · {customerName}</h2>
        <button className="secondary" type="button" onClick={onClose}>{t("Chiudi")}</button>
      </div>
      <p className="hint">{t("Il cliente entra da")} <a href="/portale/login" target="_blank" rel="noopener noreferrer">{portalUrl}</a> {t("e vede i suoi veicoli, i lavori in corso, le prossime manutenzioni e lo storico; può scrivervi in chat.")}</p>
      {message && <p className="hint" role="status">{t(message)}</p>}

      <h3>{t("Accessi")}</h3>
      {issued?.temporary_password && (
        <div className="issued-password" role="status">
          <p><strong>{t("Password temporanea per")} {issued.email}:</strong> <code>{issued.temporary_password}</code></p>
          <p className="hint">{t("Viene mostrata solo ora. Consegnala al cliente: al primo accesso sceglierà la sua password.")}</p>
          <button type="button" className="secondary" onClick={() => navigator.clipboard?.writeText(handoff).then(() => setMessage("Credenziali copiate.")).catch(() => undefined)}>{t("Copia credenziali")}</button>
        </div>
      )}
      <ul className="portal-accounts">
        {accounts.length === 0 && <li className="hint">{t("Nessun accesso creato.")}</li>}
        {accounts.map((account) => (
          <li key={account.id}>
            <span><strong>{account.full_name}</strong><small>{account.email}</small></span>
            <span className={`status-chip${account.active ? " ok" : ""}`}>{account.active ? t("Attivo") : t("Disattivato")}</span>
            <small>{account.last_login_at ? `${t("Ultimo accesso")} ${new Date(account.last_login_at).toLocaleString("it-IT")}` : t("Mai entrato")}</small>
            {canWrite && (
              <span className="table-actions">
                <button type="button" onClick={() => reset(account)}>{t("Nuova password")}</button>
                <button type="button" onClick={() => toggle(account)}>{account.active ? t("Disattiva") : t("Riattiva")}</button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {canWrite && (
        <form className="record-form portal-account-form" onSubmit={createAccount}>
          <label>{t("Nome referente")}<input required minLength={2} maxLength={160} value={draft.full_name} onChange={(e) => setDraft({ ...draft, full_name: e.target.value })} placeholder={t("Es. Ufficio flotta")} /></label>
          <label>{t("Email")}<input required type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></label>
          <div className="record-form-actions"><button className="primary">{t("Crea accesso")}</button></div>
        </form>
      )}

      <h3>{t("Piano di manutenzione")}</h3>
      {vehicles.length === 0 ? <p className="hint">{t("Nessun veicolo associato a questo cliente.")}</p> : (
        <div className="maintenance-table">
          <div className="maintenance-row head">
            <span>{t("Veicolo")}</span><span>{t("Km attuali")}</span><span>{t("Ogni km")}</span><span>{t("Ogni mesi")}</span><span>{t("Ultimo tagliando")}</span><span>{t("Km ultimo")}</span><span>{t("Prossima")}</span><span />
          </div>
          {vehicles.map((vehicle) => {
            const row = rows[vehicle.id] || rowFrom(vehicle);
            const set = (field: keyof Row, value: string) => setRows({ ...rows, [vehicle.id]: { ...row, [field]: value } });
            const m = vehicle.maintenance;
            return (
              <div className="maintenance-row" key={vehicle.id}>
                <span><strong>{vehicle.license_plate}</strong><small>{[vehicle.fleet_number && `#${vehicle.fleet_number}`, vehicle.make, vehicle.model].filter(Boolean).join(" ")}</small>{vehicle.current_case && <small>🔧 {t(vehicle.current_case.status_text)}</small>}<TelemetryBadge reading={vehicle.telemetry} /></span>
                <input aria-label={t("Km attuali")} type="number" min="0" disabled={!canEditVehicles} value={row.mileage} onChange={(e) => set("mileage", e.target.value)} />
                <input aria-label={t("Ogni km")} type="number" min="0" step="1000" disabled={!canEditVehicles} value={row.service_interval_km} onChange={(e) => set("service_interval_km", e.target.value)} placeholder="20000" />
                <input aria-label={t("Ogni mesi")} type="number" min="0" max="120" disabled={!canEditVehicles} value={row.service_interval_months} onChange={(e) => set("service_interval_months", e.target.value)} placeholder="12" />
                <input aria-label={t("Ultimo tagliando")} type="date" disabled={!canEditVehicles} value={row.last_service_date} onChange={(e) => set("last_service_date", e.target.value)} />
                <input aria-label={t("Km ultimo")} type="number" min="0" disabled={!canEditVehicles} value={row.last_service_km} onChange={(e) => set("last_service_km", e.target.value)} />
                <span className={`maintenance-state ${m.state.toLowerCase()}`}>
                  {t(stateLabel[m.state] || m.state)}
                  <small>{[m.next_service_date, m.next_service_km !== null && m.next_service_km !== undefined ? `${m.next_service_km} km` : null].filter(Boolean).join(" · ")}</small>
                </span>
                {canEditVehicles && (
                  <span className="table-actions">
                    <button type="button" onClick={() => saveRow(vehicle)}>{t("Salva")}</button>
                    <button type="button" title={t("Registra il tagliando fatto oggi ai km attuali")} onClick={() => saveRow(vehicle, true)}>{t("Tagliando fatto")}</button>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
