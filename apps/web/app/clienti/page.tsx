"use client";

import { useLanguage } from "../../components/LanguageProvider";

import { useEffect, useState } from "react";
import { SectionShell } from "../../components/SectionShell";
import { apiFetch, getAccessToken } from "../../lib/api";

type Customer = { id: string; customer_type: string; first_name?: string; last_name?: string; company_name?: string; vat_number?: string; phone?: string; email?: string };

export default function ClientiPage() {
  const { t } = useLanguage();
  const [items,setItems]=useState<Customer[]>([]);
  useEffect(()=>{ if(getAccessToken()) apiFetch("/customers").then(async r=>r.ok&&setItems(await r.json())); },[]);
  return <SectionShell title={t("Clienti")} eyebrow={t("CRM CARROZZERIA")}>
    {!getAccessToken()?<div className="empty-state">{t("Accedi per visualizzare i clienti.")} <a href="/login">{t("Accedi")}</a></div>:<div className="panel list-panel">
      <div className="data-table customers head"><span>{t("Cliente")}</span><span>{t("Tipo")}</span><span>{t("P. IVA")}</span><span>{t("Telefono")}</span><span>{t("Email")}</span></div>
      {items.length===0?<div className="empty-state">{t("Nessun cliente.")}</div>:items.map(x=><div className="data-table customers" key={x.id}><strong>{x.company_name||`${x.first_name||""} ${x.last_name||""}`.trim()}</strong><span>{t(x.customer_type)}</span><span>{x.vat_number||"—"}</span><span>{x.phone||"—"}</span><span>{x.email||"—"}</span></div>)}
    </div>}
  </SectionShell>;
}
