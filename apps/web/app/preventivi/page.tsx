"use client";

import { useLanguage } from "../../components/LanguageProvider";

import { useEffect, useState } from "react";
import { SectionShell } from "../../components/SectionShell";
import { API_URL, apiFetch, getAccessToken } from "../../lib/api";

type Estimate={id:string;estimate_number:string;status:string;version:number;subtotal:string;vat_total:string;total:string};

function money(v:string){return new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR"}).format(Number(v||0));}

export default function PreventiviPage(){
  const { t } = useLanguage();
 const [items,setItems]=useState<Estimate[]>([]);
 useEffect(()=>{if(getAccessToken())apiFetch("/estimates").then(async r=>r.ok&&setItems(await r.json()));},[]);
 async function pdf(id:string){
  const token=getAccessToken(); if(!token)return;
  const r=await fetch(`${API_URL}/estimates/${id}/pdf`,{headers:{Authorization:`Bearer ${token}`}});
  if(!r.ok)return alert(t("PDF non disponibile"));
  const blob=await r.blob(); window.open(URL.createObjectURL(blob),"_blank");
 }
 async function share(id:string){
  const r=await apiFetch(`/estimates/${id}/share`,{method:"POST"});
  if(!r.ok)return alert(t("Impossibile creare il link"));
  const data=await r.json();
  const url=`${window.location.origin}${data.public_path}`;
  await navigator.clipboard.writeText(url).catch(()=>undefined);
  prompt(t("Link cliente (copiato se consentito dal browser):"),url);
 }
 async function approve(id:string){
  const r=await apiFetch(`/estimates/${id}/status`,{method:"PATCH",body:JSON.stringify({status:"APPROVED"})});
  if(!r.ok){const d=await r.json().catch(()=>({}));return alert(t(d.detail||"Impossibile approvare"));}
  const next=await apiFetch("/estimates");if(next.ok)setItems(await next.json());
 }
 async function createWorkOrder(id:string){
  const r=await apiFetch(`/work-orders/from-estimate/${id}`,{method:"POST"});
  if(!r.ok){const d=await r.json().catch(()=>({}));return alert(t(d.detail||"Impossibile creare ordine di lavoro"));}
  const order=await r.json();alert(t(t("Ordine {number} creato.").replace("{number}", order.work_order_number)));
 }
 async function createInvoice(id:string){
  const r=await apiFetch("/invoices",{method:"POST",body:JSON.stringify({estimate_id:id})});
  if(!r.ok){const d=await r.json().catch(()=>({}));return alert(t(d.detail||"Impossibile creare fattura"));}
  const invoice=await r.json();alert(t(t("Fattura {number} creata.").replace("{number}", invoice.invoice_number)));
 }
 return <SectionShell title={t("Preventivi")} eyebrow={t("ESTIMATING ENGINE")} actions={<a className="primary link-button" href="/?new=practice">{t("+ Nuovo preventivo")}</a>}>
  {!getAccessToken()?<div className="empty-state">{t("Accedi per visualizzare i preventivi.")} <a href="/login">{t("Accedi")}</a></div>:<div className="panel list-panel">
   <div className="data-table estimates head"><span>{t("Preventivo")}</span><span>{t("Stato")}</span><span>{t("Versione")}</span><span>{t("Imponibile")}</span><span>IVA</span><span>{t("Totale")}</span><span>{t("Azioni")}</span></div>
   {items.length===0?<div className="empty-state">{t("Nessun preventivo.")}</div>:items.map(x=><div className="data-table estimates" key={x.id}><strong>{x.estimate_number}</strong><span className="status-chip">{t(x.status)}</span><span>v{x.version}</span><span>{money(x.subtotal)}</span><span>{money(x.vat_total)}</span><strong>{money(x.total)}</strong><span className="table-actions"><button onClick={()=>pdf(x.id)}>PDF</button><button onClick={()=>share(x.id)}>{t("Invia")}</button>{x.status!=="APPROVED"&&<button onClick={()=>approve(x.id)}>{t("Approva")}</button>}<button onClick={()=>createWorkOrder(x.id)}>ODL</button><button onClick={()=>createInvoice(x.id)}>{t("Fattura")}</button></span></div>)}
  </div>}
 </SectionShell>;
}
