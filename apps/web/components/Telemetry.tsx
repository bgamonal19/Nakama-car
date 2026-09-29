"use client";

import { useLanguage } from "./LanguageProvider";

export type TelemetryReading = {
  recorded_at: string;
  source?: string | null;
  odometer_km?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  speed_kmh?: number | null;
  fuel_level_percent?: number | null;
  battery_voltage?: number | null;
  engine_on?: boolean | null;
  warning_lights: string[];
  dtc_codes: string[];
  driving: Record<string, number | string>;
};

// Common warning lights sent by GPS boxes, in plain words.
const lightNames: Record<string, string> = {
  ENGINE: "Motore", CHECK_ENGINE: "Motore", MIL: "Motore", ABS: "ABS", ESP: "ESP", OIL: "Pressione olio", BATTERY: "Batteria",
  BRAKES: "Freni", BRAKE: "Freni", TEMPERATURE: "Temperatura motore", COOLANT: "Temperatura motore", TPMS: "Pressione pneumatici",
  AIRBAG: "Airbag", DPF: "Filtro antiparticolato", GLOW: "Candelette", ADBLUE: "AdBlue", FUEL: "Riserva carburante", SERVICE: "Manutenzione",
};

const drivingNames: Record<string, string> = {
  harsh_braking: "Frenate brusche", harsh_acceleration: "Accelerazioni brusche", harsh_cornering: "Curve brusche",
  overspeed_minutes: "Minuti oltre il limite", idle_minutes: "Minuti al minimo", score: "Punteggio guida",
};

function when(value: string) {
  const date = new Date(value);
  return date.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** One line for lists: last update, km, warning lights. */
export function TelemetryBadge({ reading }: { reading?: TelemetryReading | null }) {
  const { t } = useLanguage();
  if (!reading) return null;
  const alerts = reading.warning_lights.length + reading.dtc_codes.length;
  return (
    <span className={`telemetry-badge${alerts ? " alert" : ""}`} title={t("Dati GPS")}>
      📡 {when(reading.recorded_at)}
      {reading.odometer_km != null && ` · ${new Intl.NumberFormat("it-IT").format(reading.odometer_km)} km`}
      {alerts > 0 && ` · ⚠ ${alerts} ${t("avvisi")}`}
    </span>
  );
}

/** Full block for a vehicle: warning lights, fault codes, driving style, position. */
export function TelemetryCard({ reading }: { reading?: TelemetryReading | null }) {
  const { t } = useLanguage();
  if (!reading) return null;
  const hasPosition = reading.latitude != null && reading.longitude != null;
  return (
    <div className={`telemetry-card${reading.warning_lights.length || reading.dtc_codes.length ? " alert" : ""}`}>
      <div className="telemetry-head">
        <strong>📡 {t("Dati in tempo reale")}</strong>
        <small>{reading.source || "GPS"} · {t("aggiornato")} {when(reading.recorded_at)}</small>
      </div>
      <div className="telemetry-grid">
        {reading.odometer_km != null && <div><small>{t("Km")}</small><strong>{new Intl.NumberFormat("it-IT").format(reading.odometer_km)}</strong></div>}
        {reading.speed_kmh != null && <div><small>{t("Velocità")}</small><strong>{Math.round(reading.speed_kmh)} km/h</strong></div>}
        {reading.fuel_level_percent != null && <div><small>{t("Carburante")}</small><strong>{Math.round(reading.fuel_level_percent)}%</strong></div>}
        {reading.battery_voltage != null && <div><small>{t("Batteria")}</small><strong>{reading.battery_voltage.toFixed(1)} V</strong></div>}
        {reading.engine_on != null && <div><small>{t("Motore")}</small><strong>{reading.engine_on ? t("Acceso") : t("Spento")}</strong></div>}
      </div>
      {reading.warning_lights.length > 0 && (
        <div className="telemetry-alerts">
          <small>{t("Spie accese")}</small>
          <div>{reading.warning_lights.map((light) => <span key={light} className="warning-light">⚠ {t(lightNames[light.toUpperCase()] || light)}</span>)}</div>
        </div>
      )}
      {reading.dtc_codes.length > 0 && (
        <div className="telemetry-alerts">
          <small>{t("Codici guasto")}</small>
          <div>{reading.dtc_codes.map((code) => <code key={code}>{code}</code>)}</div>
        </div>
      )}
      {Object.keys(reading.driving).length > 0 && (
        <div className="telemetry-driving">
          <small>{t("Stile di guida")}</small>
          <div>{Object.entries(reading.driving).map(([key, value]) => <span key={key}>{t(drivingNames[key] || key)}: <b>{String(value)}</b></span>)}</div>
        </div>
      )}
      {hasPosition && (
        <a className="telemetry-map" href={`https://www.google.com/maps?q=${reading.latitude},${reading.longitude}`} target="_blank" rel="noopener noreferrer">📍 {t("Vedi posizione sulla mappa")}</a>
      )}
    </div>
  );
}
