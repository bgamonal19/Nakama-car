"use client";

import { useLanguage } from "../../components/LanguageProvider";

import { UserEditor } from "../../components/UserEditor";
import { PasswordInput } from "../../components/PasswordInput";

import { FormEvent, useEffect, useState } from "react";
import { SectionShell } from "../../components/SectionShell";
import { apiFetch, getAccessToken } from "../../lib/api";

type Rate={id:string;labor_type:string;hourly_rate:string;currency:string};
type User={id:string;email:string;first_name:string;last_name:string;status:string;role_codes:string[]};
const rateTypes=["BODY","MECHANICAL","PAINT","ELECTRICAL","DIAGNOSTIC"];
const roles=["ADMIN","RECEPTION","BODYSHOP","PAINTER","MECHANIC","ACCOUNTING"];

export default function ConfigurazionePage(){
  const { t } = useLanguage();
 const [rates,setRates]=useState<Record<string,string>>({});
 const [users,setUsers]=useState<User[]>([]);
 const [editing,setEditing]=useState<User|null>(null);
 const [userMessage,setUserMessage]=useState("");
 const [loadError,setLoadError]=useState("");
 const [userForm,setUserForm]=useState({email:"",password:"",first_name:"",last_name:"",role_code:"RECEPTION"});
 async function load(){
  try {
  const [rr,ur]=await Promise.all([apiFetch("/settings/labor-rates"),apiFetch("/users")]);
  if(rr.ok){const data:Rate[]=await rr.json();setRates(Object.fromEntries(data.map(x=>[x.labor_type,x.hourly_rate])));}
  if(ur.ok){setUsers(await ur.json());setLoadError("");}
  else {setUsers([]);setLoadError(ur.status===403?"Solo gli amministratori possono gestire gli utenti.":"Impossibile caricare gli utenti. Accedi nuovamente o riprova.");}
  } catch {setLoadError("Errore di connessione. Riprova.");}
 }
 useEffect(()=>{if(getAccessToken())load();},[]);
 async function saveRate(type:string){
  const r=await apiFetch(`/settings/labor-rates/${type}`,{method:"PUT",body:JSON.stringify({labor_type:type,hourly_rate:Number(rates[type]||0),currency:"EUR"})});
  if(!r.ok)return alert(t("Impossibile salvare la tariffa")); load();
 }
 async function createUser(e:FormEvent){
  e.preventDefault();const r=await apiFetch("/users",{method:"POST",body:JSON.stringify(userForm)});
  if(!r.ok){const d=await r.json().catch(()=>({}));return alert(t(d.detail||"Impossibile creare utente"));}
  setUserForm({email:"",password:"",first_name:"",last_name:"",role_code:"RECEPTION"});load();
 }
 return <SectionShell title={t("Configurazione")} eyebrow="TENANT · NAKAMA CAR" actions={<a className="primary link-button" href="/personale">{t("Gestisci personale")}</a>}>
  {!getAccessToken()?<div className="empty-state">{t("Accedi come amministratore.")} <a href="/login">{t("Accedi")}</a></div>:<>
   <div className="settings-grid">
    <div className="panel settings-card"><div className="panel-head"><div><h2>{t("Tariffe orarie")}</h2><p>{t("Valori configurabili, mai hardcoded nel preventivo.")}</p></div></div>
     <div className="settings-body">{rateTypes.map(type=><div className="setting-row" key={type}><strong>{t(type)}</strong><label><input type="number" step="0.1" value={rates[type]||""} onChange={e=>setRates({...rates,[type]:e.target.value})}/><span>€/h</span></label><button onClick={()=>saveRate(type)}>{t("Salva")}</button></div>)}</div>
    </div>
    <div className="panel settings-card"><div className="panel-head"><div><h2>{t("Nuovo utente")}</h2><p>{t("Assegna un ruolo operativo.")}</p></div></div>
     <form className="settings-body user-form" onSubmit={createUser}>
      <input placeholder={t("Nome")} required value={userForm.first_name} onChange={e=>setUserForm({...userForm,first_name:e.target.value})}/>
      <input placeholder={t("Cognome")} required value={userForm.last_name} onChange={e=>setUserForm({...userForm,last_name:e.target.value})}/>
      <input className="span-2" placeholder={t("Email")} type="email" required value={userForm.email} onChange={e=>setUserForm({...userForm,email:e.target.value})}/>
      <PasswordInput className="span-2" placeholder={t("Password (min. 10 caratteri)")}  minLength={10} required value={userForm.password} onChange={e=>setUserForm({...userForm,password:e.target.value})}/>
      <select value={userForm.role_code} onChange={e=>setUserForm({...userForm,role_code:e.target.value})}>{roles.map(r=><option key={r} value={r}>{t(r)}</option>)}</select>
      <button className="primary">{t("Crea utente")}</button>
     </form>
    </div>
   </div>
   <div className="panel list-panel settings-users"><div className="panel-head"><div><h2>{t("Utenti")}</h2><p>{t("Accessi al tenant.")}</p></div></div>
    {loadError && <div role="alert" className="empty-state">{t(loadError)} <button onClick={load}>{t("Riprova")}</button></div>}
    {userMessage && <p role="status" className="staff-success">{t(userMessage)}</p>}
    <div className="data-table users editable-users head"><span>{t("Nome")}</span><span>{t("Email")}</span><span>{t("Ruolo")}</span><span>{t("Stato")}</span><span>{t("Azioni")}</span></div>
    {users.map(u=><div className="data-table users editable-users" key={u.id}><strong>{u.first_name} {u.last_name}</strong><span>{u.email}</span><span>{u.role_codes.map(code => t(code)).join(", ")}</span><span className="status-chip">{t(u.status)}</span><button type="button" className="secondary" aria-label={`${t("Modifica")} ${u.first_name} ${u.last_name}`} onClick={()=>{setEditing(u);setUserMessage("");}}>{t("Modifica")}</button></div>)}
   </div>
   {editing && <UserEditor key={editing.id} user={editing} onCancel={()=>setEditing(null)} onSaved={updated=>{setUsers(previous=>previous.map(u=>u.id===updated.id?updated:u));setEditing(null);setUserMessage("Utente aggiornato correttamente.");}} />}
  </>}
 </SectionShell>;
}
