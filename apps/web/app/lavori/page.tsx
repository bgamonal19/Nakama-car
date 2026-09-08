"use client";

import { useEffect, useState } from "react";
import { SectionShell } from "../../components/SectionShell";
import { apiFetch, getAccessToken } from "../../lib/api";

type Order={id:string;work_order_number:string;status:string;priority:string;repair_case_id:string;notes?:string};
const states=["NEW","WAITING_APPROVAL","APPROVED","WAITING_PARTS","IN_REPAIR","PAINTING","ASSEMBLY","QUALITY_CONTROL","READY","DELIVERED","INVOICED"];

export default function LavoriPage(){
 const [items,setItems]=useState<Order[]>([]);
 async function load(){const r=await apiFetch("/work-orders");if(r.ok)setItems(await r.json());}
 useEffect(()=>{if(getAccessToken())load();},[]);
 async function setStatus(id:string,status:string){const r=await apiFetch(`/work-orders/${id}/status`,{method:"PATCH",body:JSON.stringify({status})});if(r.ok)load();}
 return <SectionShell title="Ordini di lavoro" eyebrow="WORKSHOP FLOW">
  {!getAccessToken()?<div className="empty-state">Accedi per gestire l'officina. <a href="/login">Accedi</a></div>:<div className="panel list-panel">
   <div className="data-table work head"><span>Ordine</span><span>Priorità</span><span>Pratica</span><span>Stato operativo</span></div>
   {items.length===0?<div className="empty-state">Nessun ordine di lavoro.</div>:items.map(x=><div className="data-table work" key={x.id}><strong>{x.work_order_number}</strong><span>{x.priority}</span><span>{x.repair_case_id.slice(0,8)}…</span><select value={x.status} onChange={e=>setStatus(x.id,e.target.value)}>{states.map(s=><option key={s}>{s}</option>)}</select></div>)}
  </div>}
 </SectionShell>;
}
