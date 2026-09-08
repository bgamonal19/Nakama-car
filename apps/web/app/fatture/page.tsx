"use client";

import { useEffect, useState } from "react";
import { SectionShell } from "../../components/SectionShell";
import { apiFetch, getAccessToken } from "../../lib/api";

type Invoice={id:string;invoice_number:string;status:string;subtotal:string;vat_total:string;total:string;estimate_id?:string};
function money(v:string){return new Intl.NumberFormat("it-IT",{style:"currency",currency:"EUR"}).format(Number(v||0));}

export default function FatturePage(){
 const [items,setItems]=useState<Invoice[]>([]);
 async function load(){const r=await apiFetch("/invoices");if(r.ok)setItems(await r.json());}
 useEffect(()=>{if(getAccessToken())load();},[]);
 async function setStatus(id:string,status:string){const r=await apiFetch(`/invoices/${id}/status`,{method:"PATCH",body:JSON.stringify({status})});if(r.ok)load();}
 return <SectionShell title="Fatture" eyebrow="AMMINISTRAZIONE">
  {!getAccessToken()?<div className="empty-state">Accedi per visualizzare la fatturazione. <a href="/login">Accedi</a></div>:<div className="panel list-panel">
   <div className="data-table invoices head"><span>Fattura</span><span>Stato</span><span>Imponibile</span><span>IVA</span><span>Totale</span></div>
   {items.length===0?<div className="empty-state">Nessuna fattura.</div>:items.map(x=><div className="data-table invoices" key={x.id}><strong>{x.invoice_number}</strong><select value={x.status} onChange={e=>setStatus(x.id,e.target.value)}><option>DRAFT</option><option>ISSUED</option><option>PAID</option><option>CANCELLED</option></select><span>{money(x.subtotal)}</span><span>{money(x.vat_total)}</span><strong>{money(x.total)}</strong></div>)}
  </div>}
 </SectionShell>;
}
