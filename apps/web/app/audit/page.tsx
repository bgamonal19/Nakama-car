"use client";

import { useLanguage } from "../../components/LanguageProvider";

import { useEffect, useState } from "react";
import { SectionShell } from "../../components/SectionShell";
import { apiFetch, getAccessToken } from "../../lib/api";

type Log={id:string;entity_type:string;entity_id?:string;action:string;field_name?:string;old_value?:unknown;new_value?:unknown;created_at:string};

export default function AuditPage(){
  const { t, language } = useLanguage();
 const [items,setItems]=useState<Log[]>([]);
 useEffect(()=>{if(getAccessToken())apiFetch("/audit").then(async r=>r.ok&&setItems(await r.json()));},[]);
 return <SectionShell title={t("Audit log")} eyebrow={t("TRACCIABILITÀ E SICUREZZA")}>
  {!getAccessToken()?<div className="empty-state">{t("Accesso amministratore richiesto.")} <a href="/login">{t("Accedi")}</a></div>:<div className="panel list-panel">
   <div className="data-table audit head"><span>{t("Data")}</span><span>{t("Entità")}</span><span>{t("Azione")}</span><span>{t("Campo")}</span><span>{t("Modifica")}</span></div>
   {items.length===0?<div className="empty-state">{t("Nessun evento registrato.")}</div>:items.map(x=><div className="data-table audit" key={x.id}><span>{new Date(x.created_at).toLocaleString(language === "es" ? "es-ES" : "it-IT")}</span><strong>{x.entity_type}</strong><span>{x.action}</span><span>{x.field_name||"—"}</span><small>{x.old_value!==null&&x.old_value!==undefined?JSON.stringify(x.old_value):""}{x.new_value!==null&&x.new_value!==undefined?` → ${JSON.stringify(x.new_value)}`:""}</small></div>)}
  </div>}
 </SectionShell>;
}
