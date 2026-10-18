"use client";

import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "./LanguageProvider";
import { apiError, apiFetch, hasPermission } from "../lib/api";
import { TelemetryBadge, TelemetryReading } from "./Telemetry";
import { PortalAccess } from "./PortalAccess";

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
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([]);
  const [rows, setRows] = useState<Record<string, Row>>({});
  const [message, setMessage] = useState("");
  const [canEditVehicles, setCanEditVehicles] = useState(false);

  const load = useCallback(async () => {
    const vehiclesResponse = await apiFetch(`/customers/${customerId}/fleet-vehicles`);
    if (vehiclesResponse.ok) {
      const list: FleetVehicle[] = await vehiclesResponse.json();
      setVehicles(list);
      setRows(Object.fromEntries(list.map((vehicle) => [vehicle.id, rowFrom(vehicle)])));
    }
  }, [customerId]);

  useEffect(() => {
    setCanEditVehicles(hasPermission("vehicle.write"));
    setMessage("");
    load();
  }, [load]);

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

  return (
    <section className="panel fleet-portal" aria-label={t("Portale cliente")}>
      <div className="panel-head">
        <h2>{t("Portale cliente")} · {customerName}</h2>
        <button className="secondary" type="button" onClick={onClose}>{t("Chiudi")}</button>
      </div>
      {message && <p className="hint" role="status">{t(message)}</p>}

      <PortalAccess customerId={customerId} customerName={customerName} />

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
