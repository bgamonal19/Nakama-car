"use client";

import { useEffect, useState } from "react";
import { SectionShell } from "../../components/SectionShell";
import { apiFetch, getAccessToken } from "../../lib/api";

type Log={id:string;entity_type:string;entity_id?:string;action:string;field_name?:string;old_value?:unknown;new_value?:unknown;created_at:string};

export default function AuditPage(){
 const [items,setItems]=useState<Log[]>([]);
 useEffect(()=>{if(getAccessToken())apiFetch("/audit").then(async r=>r.ok&&setItems(await r.json()));},[]);
 return <SectionShell title="Audit log" eyebrow="TRACCIABILITÀ E SICUREZZA">
  {!getAccessToken()?<div className="empty-state">Accesso amministratore richiesto. <a href="/login">Accedi</a></div>:<div className="panel list-panel">
   <div className="data-table audit head"><span>Data</span><span>Entità</span><span>Azione</span><span>Campo</span><span>Modifica</span></div>
   {items.length===0?<div className="empty-state">Nessun evento registrato.</div>:items.map(x=><div className="data-table audit" key={x.id}><span>{new Date(x.created_at).toLocaleString("it-IT")}</span><strong>{x.entity_type}</strong><span>{x.action}</span><span>{x.field_name||"—"}</span><small>{x.old_value!==null&&x.old_value!==undefined?JSON.stringify(x.old_value):""}{x.new_value!==null&&x.new_value!==undefined?` → ${JSON.stringify(x.new_value)}`:""}</small></div>)}
  </div>}
 </SectionShell>;
}
