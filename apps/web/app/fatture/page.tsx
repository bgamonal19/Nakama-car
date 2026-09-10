"use client";

import { useLanguage } from "../../components/LanguageProvider";

import { useEffect, useState } from "react";
import { SectionShell } from "../../components/SectionShell";
import { apiFetch, getAccessToken } from "../../lib/api";

type Invoice={id:string;invoice_number:string;status:string;subtotal:string;vat_total:string;total:string;estimate_id?:string};
function money(v:string){return new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR"}).format(Number(v||0));}

export default function FatturePage(){
  const { t } = useLanguage();
 const [items,setItems]=useState<Invoice[]>([]);
 async function load(){const r=await apiFetch("/invoices");if(r.ok)setItems(await r.json());}
 useEffect(()=>{if(getAccessToken())load();},[]);
 async function setStatus(id:string,status:string){const r=await apiFetch(`/invoices/${id}/status`,{method:"PATCH",body:JSON.stringify({status})});if(r.ok)load();}
 return <SectionShell title={t("Fatture")} eyebrow={t("AMMINISTRAZIONE")}>
  {!getAccessToken()?<div className="empty-state">{t("Accedi per visualizzare la fatturazione.")} <a href="/login">{t("Accedi")}</a></div>:<div className="panel list-panel">
   <div className="data-table invoices head"><span>{t("Fattura")}</span><span>{t("Stato")}</span><span>{t("Imponibile")}</span><span>IVA</span><span>{t("Totale")}</span></div>
   {items.length===0?<div className="empty-state">{t("Nessuna fattura.")}</div>:items.map(x=><div className="data-table invoices" key={x.id}><strong>{x.invoice_number}</strong><select value={x.status} onChange={e=>setStatus(x.id,e.target.value)}><option value="DRAFT">{t("DRAFT")}</option><option value="ISSUED">{t("ISSUED")}</option><option value="PAID">{t("PAID")}</option><option value="CANCELLED">{t("CANCELLED")}</option></select><span>{money(x.subtotal)}</span><span>{money(x.vat_total)}</span><strong>{money(x.total)}</strong></div>)}
  </div>}
 </SectionShell>;
}
