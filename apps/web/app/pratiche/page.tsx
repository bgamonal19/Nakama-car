"use client";

import { useEffect, useState } from "react";
import { SectionShell } from "../../components/SectionShell";
import { apiFetch, getAccessToken } from "../../lib/api";

type Item = { id: string; case_number: string; status: string; plate: string; vehicle_name: string; customer_name: string; mileage?: number };

export default function PratichePage() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!getAccessToken()) return setLoading(false);
    apiFetch("/cases").then(async r => { if (r.ok) setItems(await r.json()); }).finally(() => setLoading(false));
  }, []);
  return (
    <SectionShell title="Pratiche" eyebrow="ACCETTAZIONE E RIPARAZIONI" actions={<a className="primary link-button" href="/?new=practice">+ Nuova pratica</a>}>
      {!getAccessToken() && <div className="empty-state">Accedi per visualizzare le pratiche salvate. <a href="/login">Accedi</a></div>}
      {getAccessToken() && <div className="panel list-panel">
        <div className="data-table head"><span>Pratica</span><span>Targa / Veicolo</span><span>Cliente</span><span>Km</span><span>Stato</span></div>
        {loading ? <div className="empty-state">Caricamento…</div> : items.length === 0 ? <div className="empty-state">Nessuna pratica ancora.</div> : items.map(x => (
          <div className="data-table" key={x.id}><strong>{x.case_number}</strong><span><b>{x.plate}</b><small>{x.vehicle_name}</small></span><span>{x.customer_name}</span><span>{x.mileage ?? "—"}</span><span className="status-chip">{x.status.replaceAll("_"," ")}</span></div>
        ))}
      </div>}
    </SectionShell>
  );
}
