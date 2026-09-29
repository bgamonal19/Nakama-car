"use client";

import { FormEvent, useEffect, useState } from "react";
import { useLanguage } from "./LanguageProvider";
import { API_URL, apiError, apiFetch } from "../lib/api";
import { PasswordInput } from "./PasswordInput";

type ApiKey = { id: string; name: string; prefix: string; active: boolean; last_used_at?: string | null; created_at: string; api_key?: string };
type Credential = { id: string; provider: string; label: string; base_url?: string | null; secret_hint: string; created_at: string };

const example = `{
  "source": "OneSystec",
  "events": [{
    "plate": "GM267TJ",
    "recorded_at": "2026-09-29T08:30:00Z",
    "odometer_km": 152300,
    "lat": 45.40, "lon": 9.28, "speed_kmh": 54,
    "fuel_level_percent": 62, "battery_voltage": 12.6, "engine_on": true,
    "warning_lights": ["ENGINE", "ABS"],
    "dtc_codes": ["P0301"],
    "driving": { "harsh_braking": 3, "harsh_acceleration": 1, "overspeed_minutes": 4, "score": 72 }
  }]
}`;

function date(value?: string | null) {
  return value ? new Date(value).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
}

/** Settings: NAKAMA API keys for external systems (GPS) and keys of external services. */
export function IntegrationsPanel() {
  const { t } = useLanguage();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [keyName, setKeyName] = useState("OneSystec GPS");
  const [issued, setIssued] = useState<ApiKey | null>(null);
  const [credential, setCredential] = useState({ provider: "ONESYSTEC", label: "OneSystec", base_url: "", secret: "" });
  const [message, setMessage] = useState("");
  const [showExample, setShowExample] = useState(false);

  async function load() {
    const [keysResponse, credentialsResponse] = await Promise.all([apiFetch("/integrations/api-keys"), apiFetch("/integrations/credentials")]);
    if (keysResponse.ok) setKeys(await keysResponse.json());
    if (credentialsResponse.ok) setCredentials(await credentialsResponse.json());
    if (keysResponse.status === 403) setMessage("Solo gli amministratori possono gestire le integrazioni.");
  }

  useEffect(() => { load(); }, []);

  async function createKey(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    const response = await apiFetch("/integrations/api-keys", { method: "POST", body: JSON.stringify({ name: keyName.trim() }) });
    if (!response.ok) { setMessage(await apiError(response, "Impossibile creare la chiave.")); return; }
    setIssued(await response.json());
    load();
  }

  async function revoke(key: ApiKey) {
    if (!window.confirm(t("Revocare la chiave? Il sistema che la usa smetterà subito di inviare dati."))) return;
    const response = await apiFetch(`/integrations/api-keys/${key.id}`, { method: "DELETE" });
    if (response.ok) load();
  }

  async function addCredential(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    const response = await apiFetch("/integrations/credentials", { method: "POST", body: JSON.stringify({ ...credential, base_url: credential.base_url || null }) });
    if (!response.ok) { setMessage(await apiError(response, "Impossibile salvare la chiave.")); return; }
    setCredential({ ...credential, secret: "" });
    setMessage("Chiave salvata in modo cifrato.");
    load();
  }

  async function removeCredential(item: Credential) {
    if (!window.confirm(t("Eliminare questa chiave?"))) return;
    const response = await apiFetch(`/integrations/credentials/${item.id}`, { method: "DELETE" });
    if (response.ok) load();
  }

  const endpoint = `${API_URL || ""}/telemetry`;

  return (
    <section className="panel integrations">
      <div className="panel-head"><div><h2>🔌 {t("Integrazioni e API")}</h2><p>{t("GPS e telemetria dei veicoli (es. OneSystec): km, spie accese, codici guasto, stile di guida.")}</p></div></div>
      {message && <p className="hint" role="status">{t(message)}</p>}

      <div className="integrations-grid">
        <div className="integration-card">
          <h3>🔑 {t("Crea API key")}</h3>
          <p className="hint">{t("Genera una chiave da dare al sistema esterno: con questa invia i dati dei veicoli a NAKAMA in tempo reale.")}</p>
          <form className="integration-form" onSubmit={createKey}>
            <input required minLength={2} maxLength={120} value={keyName} onChange={(e) => setKeyName(e.target.value)} aria-label={t("Nome della chiave")} />
            <button className="primary">{t("Genera chiave")}</button>
          </form>
          {issued?.api_key && (
            <div className="issued-password" role="status">
              <p><strong>{t("Nuova chiave")} «{issued.name}»:</strong></p>
              <code className="api-key-value">{issued.api_key}</code>
              <p className="hint">{t("Viene mostrata solo ora: copiala e consegnala al fornitore. Se si perde, revocala e creane un'altra.")}</p>
              <button type="button" className="secondary" onClick={() => navigator.clipboard?.writeText(issued.api_key || "").then(() => setMessage("Chiave copiata.")).catch(() => undefined)}>{t("Copia chiave")}</button>
            </div>
          )}
          <ul className="integration-list">
            {keys.map((key) => (
              <li key={key.id} className={key.active ? "" : "revoked"}>
                <span><strong>{key.name}</strong><small>{key.prefix}… · {t("creata")} {date(key.created_at)} · {t("ultimo invio")} {date(key.last_used_at)}</small></span>
                {key.active ? <button type="button" className="ghost" onClick={() => revoke(key)}>{t("Revoca")}</button> : <span className="status-chip">{t("Revocata")}</span>}
              </li>
            ))}
          </ul>
          <details open={showExample} onToggle={(e) => setShowExample((e.target as HTMLDetailsElement).open)}>
            <summary>{t("Istruzioni per il fornitore GPS")}</summary>
            <p className="hint">POST <code>{endpoint}</code> · {t("intestazione")} <code>X-API-Key: nk_live_…</code> · {t("fino a 500 letture per invio")}</p>
            <pre className="code-example">{example}</pre>
            <p className="hint">{t("Il veicolo si riconosce da targa o telaio (VIN). I km aggiornano da soli il piano di manutenzione.")}</p>
          </details>
        </div>

        <div className="integration-card">
          <h3>🧩 {t("Incorpora API key")}</h3>
          <p className="hint">{t("Salva la chiave che ti fornisce un servizio esterno (es. OneSystec) per collegarlo quando saranno disponibili le sue API. Viene conservata cifrata.")}</p>
          <form className="integration-form stacked" onSubmit={addCredential}>
            <select value={credential.provider} onChange={(e) => setCredential({ ...credential, provider: e.target.value })} aria-label={t("Servizio")}>
              <option value="ONESYSTEC">OneSystec</option>
              <option value="GPS">{t("Altro GPS / telematica")}</option>
              <option value="OTHER">{t("Altro servizio")}</option>
            </select>
            <input required minLength={2} maxLength={120} value={credential.label} onChange={(e) => setCredential({ ...credential, label: e.target.value })} placeholder={t("Nome")} aria-label={t("Nome")} />
            <input type="url" value={credential.base_url} onChange={(e) => setCredential({ ...credential, base_url: e.target.value })} placeholder="https://api.fornitore.it" aria-label={t("Indirizzo API (opzionale)")} />
            <PasswordInput required minLength={4} autoComplete="off" value={credential.secret} onChange={(e) => setCredential({ ...credential, secret: e.target.value })} placeholder={t("API key del servizio")} aria-label={t("API key del servizio")} />
            <button className="primary">{t("Salva chiave")}</button>
          </form>
          <ul className="integration-list">
            {credentials.length === 0 && <li className="hint">{t("Nessuna chiave esterna salvata.")}</li>}
            {credentials.map((item) => (
              <li key={item.id}>
                <span><strong>{item.label}</strong><small>{item.provider} · {item.secret_hint}{item.base_url ? ` · ${item.base_url}` : ""}</small></span>
                <button type="button" className="ghost" onClick={() => removeCredential(item)}>{t("Elimina")}</button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
