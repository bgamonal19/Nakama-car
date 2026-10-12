"use client";

import { FormEvent, useEffect, useState } from "react";
import { useLanguage } from "./LanguageProvider";
import { apiError, apiFetch } from "../lib/api";

type Company = Record<string, string>;

const fields: { key: string; label: string; type?: string; max?: number; span?: boolean }[] = [
  { key: "company_name", label: "Ragione sociale", max: 160, span: true },
  { key: "vat_number", label: "Partita IVA", max: 32 },
  { key: "tax_code", label: "Codice fiscale", max: 32 },
  { key: "address", label: "Indirizzo sede", max: 255, span: true },
  { key: "postal_code", label: "CAP", max: 16 },
  { key: "city", label: "Comune", max: 120 },
  { key: "province", label: "Provincia (sigla)", max: 8 },
  { key: "country", label: "Paese (IT, ES…)", max: 2 },
  { key: "phone", label: "Telefono", type: "tel", max: 32 },
  { key: "email", label: "Email", type: "email", max: 255 },
  { key: "pec", label: "PEC", type: "email", max: 255 },
  { key: "sdi", label: "Codice SDI", max: 16 },
  { key: "iban", label: "IBAN per bonifici", max: 34, span: true },
];

const regimes = [["RF01", "RF01 · Ordinario"], ["RF19", "RF19 · Forfettario"], ["RF02", "RF02 · Contribuenti minimi"]];

/** Fiscal identity of the workshop, printed on PDFs and used for the FatturaPA XML. */
export function CompanySettingsForm() {
  const { t } = useLanguage();
  const [data, setData] = useState<Company>({ country: "IT", regime_fiscale: "RF01", estimate_validity_days: "15" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [plateUsage, setPlateUsage] = useState<{ configured: boolean; provider?: string | null; used_this_month: number; monthly_limit: number } | null>(null);

  useEffect(() => {
    apiFetch("/settings/company/plate-lookup").then(async (response) => {
      if (response.ok) setPlateUsage(await response.json());
    });
    apiFetch("/settings/company").then(async (response) => {
      if (!response.ok) return;
      const loaded = await response.json();
      setData(Object.fromEntries(Object.entries(loaded).map(([key, value]) => [key, value === null ? "" : String(value)])));
    });
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    setError("");
    const payload: Record<string, string | number | null> = {};
    for (const field of fields) payload[field.key] = data[field.key]?.trim() || null;
    payload.country = (data.country || "IT").trim().toUpperCase();
    payload.regime_fiscale = data.regime_fiscale || "RF01";
    payload.estimate_validity_days = Number(data.estimate_validity_days || 15);
    const response = await apiFetch("/settings/company", { method: "PUT", body: JSON.stringify(payload) });
    setSaving(false);
    if (!response.ok) {
      setError(t(response.status === 422 ? "Controlla i campi e i dati obbligatori." : await apiError(response, "Impossibile salvare.")));
      return;
    }
    setMessage(t("Dati aziendali salvati."));
  }

  return (
    <div className="panel settings-card company-card">
      <div className="panel-head"><div><h2>{t("Dati fiscali dell'officina")}</h2><p>{t("Usati su preventivi, fatture PDF e XML FatturaPA.")}</p></div></div>
      <form className="record-form settings-body" onSubmit={save}>
        {fields.map((field) => (
          <label key={field.key} className={field.span ? "span-2" : undefined}>{t(field.label)}
            <input type={field.type || "text"} maxLength={field.max} value={data[field.key] || ""} onChange={(e) => setData({ ...data, [field.key]: e.target.value })} />
          </label>
        ))}
        <label>{t("Regime fiscale")}
          <select value={data.regime_fiscale || "RF01"} onChange={(e) => setData({ ...data, regime_fiscale: e.target.value })}>
            {regimes.map(([code, label]) => <option key={code} value={code}>{label}</option>)}
          </select>
        </label>
        <label>{t("Validità preventivi (giorni)")}
          <input type="number" min={1} max={365} value={data.estimate_validity_days || "15"} onChange={(e) => setData({ ...data, estimate_validity_days: e.target.value })} />
        </label>
        {error && <p className="record-error span-2" role="alert">{error}</p>}
        {message && <p className="staff-success span-2" role="status">{message}</p>}
        {plateUsage && (
          <p className="hint span-2">
            {t("Ricerca targhe")}: {plateUsage.configured
              ? `${plateUsage.provider} · ${plateUsage.used_this_month}/${plateUsage.monthly_limit} ${t("ricerche questo mese")}`
              : t("non configurata (variabile TARGA_API_USERNAME su Railway)")}
          </p>
        )}
        <div className="record-form-actions"><button className="primary" disabled={saving}>{saving ? t("Salvataggio…") : t("Salva")}</button></div>
      </form>
    </div>
  );
}
