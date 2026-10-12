"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

type DatevState = {
  status: string;
  remote_id: string | null;
  missing_fields: string[];
  can_prepare: boolean;
  can_generate: boolean;
};

function fieldLabel(field: string) {
  const labels: Record<string, string> = {
    "customer.address": "Indirizzo cliente", "customer.city": "Città cliente",
    "customer.postal_code": "CAP cliente", "customer.country": "Paese cliente",
    "customer.name": "Nome o ragione sociale", "customer.vat_number_or_tax_code": "Partita IVA o codice fiscale",
    "invoice.lines": "Righe della fattura", "invoice.totals": "Totali della fattura da verificare",
    "invoice.must_be_draft": "La fattura deve essere in bozza",
    "estimate.must_be_approved": "Il preventivo deve essere approvato",
    "estimate.case_mismatch": "Collegamento fra preventivo e pratica da verificare",
    "case.must_be_completed": "Il lavoro deve essere completato",
    "payment_method_id": "Modalità di pagamento DATEV da configurare",
    "payment_type_id": "Tipo di pagamento DATEV da configurare",
  };
  if (field.startsWith("vat_code.")) return `Codice DATEV per IVA ${field.slice(9)}% da configurare`;
  if (field.endsWith(".source_category")) return "Tipo di lavorazione mancante in una riga storica";
  if (field.startsWith("line.")) return "Dati o importi di una riga da verificare";
  return labels[field] || "Dati del documento da verificare";
}

export function DatevInvoice({ invoiceId, localStatus }: { invoiceId: string; localStatus: string }) {
  const [state, setState] = useState<DatevState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    const response = await apiFetch(`/datev/invoices/${invoiceId}`);
    if (!response.ok) throw new Error("Impossibile caricare lo stato DATEV.");
    setState(await response.json());
  }, [invoiceId]);
  useEffect(() => {
    let active = true;
    setState(null);
    setError("");
    apiFetch(`/datev/invoices/${invoiceId}`).then(async response => {
      if (!response.ok) throw new Error("Impossibile caricare lo stato DATEV.");
      const value = await response.json();
      if (active) setState(value);
    }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [invoiceId, localStatus]);

  async function prepare() {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await apiFetch(`/datev/invoices/${invoiceId}/prepare`, { method: "POST" });
      if (!response.ok) throw new Error(response.status === 409
        ? "I dati sono cambiati: è necessaria una riconciliazione prima di procedere."
        : "Preparazione non riuscita. Verifica i permessi e riprova.");
      const result = await response.json();
      setNotice(result.status === "incomplete" ? "Completa i dati richiesti." : "Preparazione locale salvata. Nessun documento inviato.");
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : "Errore DATEV."); }
    finally { setBusy(false); }
  }

  return <div style={{ gridColumn: "1 / -1", padding: "8px 0" }}>
    <strong>DATEV: {state ? (state.status === "prepared" ? "Preparata localmente" : "Da preparare") : "Stato non disponibile"}</strong>
    {state?.remote_id && <span> · Documento {state.remote_id}</span>}
    <p>Integrazione in preparazione: emissione e invio SdI disabilitati fino alla verifica del contratto API e alla prova controllata.</p>
    {state && state.missing_fields.length > 0 && <details><summary>Dati o configurazione da completare ({state.missing_fields.length})</summary>
      <ul>{state.missing_fields.map(field => <li key={field}>{fieldLabel(field)}</li>)}</ul>
    </details>}
    <button type="button" disabled={busy || !state?.can_prepare} onClick={prepare}>{busy ? "Preparazione…" : "Prepara documento DATEV"}</button>{" "}
    <button type="button" disabled title="Contratto API e prova controllata necessari">Genera fattura DATEV</button>
    {notice && <p role="status">{notice}</p>}
    {error && <p role="alert">{error}</p>}
  </div>;
}
