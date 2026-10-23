"use client";

import { useLanguage } from "../../components/LanguageProvider";

import { useEffect, useState } from "react";
import { SectionShell } from "../../components/SectionShell";
import { apiFetch, getAccessToken } from "../../lib/api";

type Log={id:string;entity_type:string;entity_id?:string;action:string;field_name?:string;old_value?:unknown;new_value?:unknown;created_at:string};
type Access={id:string;created_at:string;account_type:"STAFF"|"PORTAL";email:string;event:string;method:string;client:string;ip_address?:string|null;user_agent?:string|null};

const events:Record<string,string>={LOGIN_OK:"Accesso riuscito",LOGIN_FAILED:"Password errata",LEGAL_ACCEPTED:"Termini e privacy accettati",PASSWORD_CHANGED:"Password cambiata"};
const clients:Record<string,string>={WEB:"Web",ANDROID:"App Android",MAC:"App Mac"};

export default function AuditPage(){
  const { t, language } = useLanguage();
 const [items,setItems]=useState<Log[]>([]);
 const [accesses,setAccesses]=useState<Access[]>([]);
 const [tab,setTab]=useState<"access"|"changes">("access");
 const [email,setEmail]=useState("");
 const when=(value:string)=>new Date(value).toLocaleString(language === "es" ? "es-ES" : "it-IT");
 useEffect(()=>{if(getAccessToken())apiFetch("/audit").then(async r=>r.ok&&setItems(await r.json()));},[]);
 // Access log (who, when, how): reloads while typing an email to filter it.
 useEffect(()=>{if(!getAccessToken())return;const timer=setTimeout(()=>apiFetch(`/audit/access${email.trim()?`?email=${encodeURIComponent(email.trim())}`:""}`).then(async r=>r.ok&&setAccesses(await r.json())),250);return()=>clearTimeout(timer);},[email]);
 return <SectionShell title={t("Audit log")} eyebrow={t("TRACCIABILITÀ E SICUREZZA")}>
  {!getAccessToken()?<div className="empty-state">{t("Accesso amministratore richiesto.")} <a href="/login">{t("Accedi")}</a></div>:<>
  <div className="audit-tabs" role="tablist">
   <button type="button" role="tab" aria-selected={tab==="access"} className={tab==="access"?"primary":"secondary"} onClick={()=>setTab("access")}>{t("Registro accessi")}</button>
   <button type="button" role="tab" aria-selected={tab==="changes"} className={tab==="changes"?"primary":"secondary"} onClick={()=>setTab("changes")}>{t("Modifiche")}</button>
  </div>
  {tab==="access"?<div className="panel list-panel">
   <div className="panel-head"><div><h2>{t("Registro accessi")}</h2><p>{t("Chi è entrato nell'app, quando e come. Conservato 12 mesi per eventuali controlli.")}</p></div>
    <input className="audit-search" type="search" value={email} onChange={e=>setEmail(e.target.value)} placeholder={t("Cerca per email")} aria-label={t("Cerca per email")} /></div>
   <div className="data-table access head"><span>{t("Data")}</span><span>{t("Account")}</span><span>{t("Evento")}</span><span>{t("App")}</span><span>{t("Indirizzo IP")}</span></div>
   {accesses.length===0?<div className="empty-state">{t("Nessun accesso registrato.")}</div>:accesses.map(x=><div className={`data-table access${x.event==="LOGIN_FAILED"?" access-failed":""}`} key={x.id} title={x.user_agent||undefined}>
    <span>{when(x.created_at)}</span>
    <span><strong>{x.email}</strong><small>{t(x.account_type==="PORTAL"?"Portale clienti":"Officina")}</small></span>
    <span>{t(events[x.event]||x.event)}</span>
    <span>{t(clients[x.client]||x.client)}</span>
    <small>{x.ip_address||"—"}</small>
   </div>)}
  </div>:<div className="panel list-panel">
   <div className="data-table audit head"><span>{t("Data")}</span><span>{t("Entità")}</span><span>{t("Azione")}</span><span>{t("Campo")}</span><span>{t("Modifica")}</span></div>
   {items.length===0?<div className="empty-state">{t("Nessun evento registrato.")}</div>:items.map(x=><div className="data-table audit" key={x.id}><span>{when(x.created_at)}</span><strong>{x.entity_type}</strong><span>{x.action}</span><span>{x.field_name||"—"}</span><small>{x.old_value!==null&&x.old_value!==undefined?JSON.stringify(x.old_value):""}{x.new_value!==null&&x.new_value!==undefined?` → ${JSON.stringify(x.new_value)}`:""}</small></div>)}
  </div>}
  </>}
 </SectionShell>;
}
