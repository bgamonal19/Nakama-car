"use client";

import { FormEvent, useEffect, useState } from "react";
import { useLanguage } from "./LanguageProvider";
import { apiError, apiFetch } from "../lib/api";

type OpenCase = { id: string; case_number: string; status: string; plate: string; vehicle_name: string; customer_name: string };

const CLOSED = ["DELIVERED", "INVOICED"];

/** "Nuovo preventivo": for a vehicle already in the workshop, or a brand new intake. */
export function NewEstimateChooser({ onClose, onNewVehicle }: { onClose: () => void; onNewVehicle: () => void }) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [cases, setCases] = useState<OpenCase[]>([]);
  const [busy, setBusy] = useState(true);
  const [creating, setCreating] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function load(search = "") {
    setBusy(true);
    const response = await apiFetch(`/cases?q=${encodeURIComponent(search)}&limit=50`).catch(() => null);
    if (response?.ok) setCases((await response.json() as OpenCase[]).filter((item) => !CLOSED.includes(item.status)));
    setBusy(false);
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function search(event: FormEvent) {
    event.preventDefault();
    load(query.trim());
  }

  async function createFor(item: OpenCase) {
    setCreating(item.id);
    setError("");
    const response = await apiFetch("/estimates", { method: "POST", body: JSON.stringify({ repair_case_id: item.id }) });
    if (!response.ok) {
      setError(await apiError(response, "Impossibile creare il preventivo."));
      setCreating(null);
      return;
    }
    const estimate = await response.json();
    window.location.assign(`/preventivi?id=${estimate.id}`);
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="estimate-chooser" role="dialog" aria-modal="true" aria-labelledby="chooser-title" onClick={(event) => event.stopPropagation()}>
        <div className="panel-head">
          <h2 id="chooser-title">{t("Nuovo preventivo")}</h2>
          <button type="button" className="secondary" onClick={onClose}>{t("Chiudi")}</button>
        </div>

        <button type="button" className="chooser-option new" onClick={onNewVehicle}>
          <b aria-hidden="true">＋</b>
          <span><strong>{t("Veicolo nuovo")}</strong><small>{t("Apre la pratica completa: targa, cliente, foto, danni e preventivo.")}</small></span>
        </button>

        <div className="chooser-section">
          <strong>{t("Veicolo già in officina")}</strong>
          <small>{t("Aggiungi un preventivo a una pratica aperta, senza ripetere cliente, veicolo e foto.")}</small>
          <form className="record-search" onSubmit={search}>
            <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Targa, pratica o cliente")} aria-label={t("Cerca pratica")} />
            <button className="secondary">{t("Cerca")}</button>
          </form>
          {error && <p className="record-error" role="alert">{t(error)}</p>}
          <ul className="chooser-list" aria-busy={busy}>
            {busy && <li className="hint">{t("Caricamento…")}</li>}
            {!busy && cases.length === 0 && <li className="hint">{t("Nessuna pratica aperta trovata.")}</li>}
            {!busy && cases.map((item) => (
              <li key={item.id}>
                <button type="button" disabled={creating !== null} onClick={() => createFor(item)}>
                  <span className="plate-chip">{item.plate}</span>
                  <span className="chooser-text"><strong>{item.vehicle_name}</strong><small>{item.customer_name} · {item.case_number} · {t(item.status)}</small></span>
                  <span className="chooser-go">{creating === item.id ? "…" : t("Crea preventivo")} →</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
