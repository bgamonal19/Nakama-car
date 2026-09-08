"use client";

import { useEffect, useState } from "react";
import { SectionShell } from "../../components/SectionShell";
import { apiFetch, getAccessToken } from "../../lib/api";

type Customer = { id: string; customer_type: string; first_name?: string; last_name?: string; company_name?: string; vat_number?: string; phone?: string; email?: string };

export default function ClientiPage() {
  const [items,setItems]=useState<Customer[]>([]);
  useEffect(()=>{ if(getAccessToken()) apiFetch("/customers").then(async r=>r.ok&&setItems(await r.json())); },[]);
  return <SectionShell title="Clienti" eyebrow="CRM CARROZZERIA">
    {!getAccessToken()?<div className="empty-state">Accedi per visualizzare i clienti. <a href="/login">Accedi</a></div>:<div className="panel list-panel">
      <div className="data-table customers head"><span>Cliente</span><span>Tipo</span><span>P. IVA</span><span>Telefono</span><span>Email</span></div>
      {items.length===0?<div className="empty-state">Nessun cliente.</div>:items.map(x=><div className="data-table customers" key={x.id}><strong>{x.company_name||`${x.first_name||""} ${x.last_name||""}`.trim()}</strong><span>{x.customer_type}</span><span>{x.vat_number||"—"}</span><span>{x.phone||"—"}</span><span>{x.email||"—"}</span></div>)}
    </div>}
  </SectionShell>;
}
