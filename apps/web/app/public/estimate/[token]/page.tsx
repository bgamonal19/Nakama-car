"use client";

import { useLanguage } from "../../../../components/LanguageProvider";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { NakamaLogo } from "../../../../components/NakamaLogo";

type PublicEstimate = {
  estimate_number: string;
  status: string;
  customer_name: string;
  vehicle: string;
  license_plate: string;
  subtotal: string;
  vat_total: string;
  total: string;
  lines: Array<{ description: string; quantity: string; line_total: string }>;
};

const api = process.env.NEXT_PUBLIC_API_URL || "";

function money(value: string) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(value || 0));
}

export default function PublicEstimatePage() {
  const { t } = useLanguage();
  const params = useParams<{ token: string }>();
  const [estimate, setEstimate] = useState<PublicEstimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [signature, setSignature] = useState("");
  const [notes, setNotes] = useState("");
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    if (!params.token || !api) return;
    fetch(`${api}/public/estimate/${params.token}`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Preventivo non disponibile");
        return r.json();
      })
      .then(setEstimate)
      .catch(() => setEstimate(null))
      .finally(() => setLoading(false));
  }, [params.token]);

  async function decide(accepted: boolean) {
    if (!signature.trim()) {
      alert(t("Inserisci nome e cognome per confermare."));
      return;
    }
    const r = await fetch(`${api}/public/estimate/${params.token}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accepted,
        signature_name: signature.trim(),
        customer_notes: notes || null,
      }),
    });
    if (!r.ok) {
      const detail = await r.json().catch(() => ({}));
      alert(t(detail.detail || "Impossibile registrare la risposta."));
      return;
    }
    setResult(accepted ? "Preventivo accettato" : "Preventivo rifiutato");
  }

  if (loading) return <main className="public-estimate"><div className="public-card">{t("Caricamento preventivo…")}</div></main>;
  if (!estimate) return <main className="public-estimate"><div className="public-card"><h1>{t("Preventivo non disponibile")}</h1></div></main>;

  return (
    <main className="public-estimate">
      <div className="public-card">
        <div className="public-brand nakama-public-brand"><NakamaLogo /></div>
        <div className="public-head">
          <div><small>{t("PREVENTIVO")}</small><h1>{estimate.estimate_number}</h1></div>
          <span className="public-status">{estimate.status}</span>
        </div>

        <div className="public-meta">
          <div><small>{t("CLIENTE")}</small><strong>{estimate.customer_name}</strong></div>
          <div><small>{t("VEICOLO")}</small><strong>{estimate.vehicle || "—"}</strong></div>
          <div><small>{t("TARGA")}</small><strong>{estimate.license_plate}</strong></div>
        </div>

        <div className="public-lines">
          <div className="public-line public-line-head"><span>{t("Descrizione")}</span><span>{t("Q.tà")}</span><span>{t("Totale")}</span></div>
          {estimate.lines.map((line, i) => (
            <div className="public-line" key={i}><span>{line.description}</span><span>{line.quantity}</span><strong>{money(line.line_total)}</strong></div>
          ))}
        </div>

        <div className="public-totals">
          <div><span>{t("Imponibile")}</span><strong>{money(estimate.subtotal)}</strong></div>
          <div><span>IVA</span><strong>{money(estimate.vat_total)}</strong></div>
          <div className="public-grand"><span>{t("TOTALE")}</span><strong>{money(estimate.total)}</strong></div>
        </div>

        {result ? (
          <div className="decision-result"><span>✓</span><div><strong>{t(result)}</strong><small>{t("La carrozzeria riceverà lo stato aggiornato.")}</small></div></div>
        ) : (
          <div className="decision-box">
            <h2>{t("Conferma del cliente")}</h2>
            <p>{t("Inserisci nome e cognome come conferma della decisione sul preventivo.")}</p>
            <label>{t("Nome e cognome")}<input value={signature} onChange={(e) => setSignature(e.target.value)} placeholder="Mario Rossi" /></label>
            <label>{t("Note opzionali")}<textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} /></label>
            <div className="decision-actions"><button className="reject" onClick={() => decide(false)}>{t("Rifiuta")}</button><button className="accept" onClick={() => decide(true)}>{t("Accetta preventivo")}</button></div>
          </div>
        )}
      </div>
    </main>
  );
}
