"use client";

import { FormEvent, useEffect, useState } from "react";
import { SectionShell } from "../../components/SectionShell";
import { apiFetch, getAccessToken } from "../../lib/api";

type Rate={id:string;labor_type:string;hourly_rate:string;currency:string};
type User={id:string;email:string;first_name:string;last_name:string;status:string;role_codes:string[]};
const rateTypes=["BODY","MECHANICAL","PAINT","ELECTRICAL","DIAGNOSTIC"];
const roles=["ADMIN","RECEPTION","BODYSHOP","PAINTER","MECHANIC","ACCOUNTING"];

export default function ConfigurazionePage(){
 const [rates,setRates]=useState<Record<string,string>>({});
 const [users,setUsers]=useState<User[]>([]);
 const [userForm,setUserForm]=useState({email:"",password:"",first_name:"",last_name:"",role_code:"RECEPTION"});
 async function load(){
  const [rr,ur]=await Promise.all([apiFetch("/settings/labor-rates"),apiFetch("/users")]);
  if(rr.ok){const data:Rate[]=await rr.json();setRates(Object.fromEntries(data.map(x=>[x.labor_type,x.hourly_rate])));}
  if(ur.ok)setUsers(await ur.json());
 }
 useEffect(()=>{if(getAccessToken())load();},[]);
 async function saveRate(type:string){
  const r=await apiFetch(`/settings/labor-rates/${type}`,{method:"PUT",body:JSON.stringify({labor_type:type,hourly_rate:Number(rates[type]||0),currency:"EUR"})});
  if(!r.ok)return alert("Impossibile salvare la tariffa"); load();
 }
 async function createUser(e:FormEvent){
  e.preventDefault();const r=await apiFetch("/users",{method:"POST",body:JSON.stringify(userForm)});
  if(!r.ok){const d=await r.json().catch(()=>({}));return alert(d.detail||"Impossibile creare utente");}
  setUserForm({email:"",password:"",first_name:"",last_name:"",role_code:"RECEPTION"});load();
 }
 return <SectionShell title="Configurazione" eyebrow="TENANT · NAKAMA CAR" actions={<a className="primary link-button" href="/personale">Gestisci personale</a>}>
  {!getAccessToken()?<div className="empty-state">Accedi come amministratore. <a href="/login">Accedi</a></div>:<>
   <div className="settings-grid">
    <div className="panel settings-card"><div className="panel-head"><div><h2>Tariffe orarie</h2><p>Valori configurabili, mai hardcoded nel preventivo.</p></div></div>
     <div className="settings-body">{rateTypes.map(type=><div className="setting-row" key={type}><strong>{type}</strong><label><input type="number" step="0.1" value={rates[type]||""} onChange={e=>setRates({...rates,[type]:e.target.value})}/><span>€/h</span></label><button onClick={()=>saveRate(type)}>Salva</button></div>)}</div>
    </div>
    <div className="panel settings-card"><div className="panel-head"><div><h2>Nuovo utente</h2><p>Assegna un ruolo operativo.</p></div></div>
     <form className="settings-body user-form" onSubmit={createUser}>
      <input placeholder="Nome" required value={userForm.first_name} onChange={e=>setUserForm({...userForm,first_name:e.target.value})}/>
      <input placeholder="Cognome" required value={userForm.last_name} onChange={e=>setUserForm({...userForm,last_name:e.target.value})}/>
      <input className="span-2" placeholder="Email" type="email" required value={userForm.email} onChange={e=>setUserForm({...userForm,email:e.target.value})}/>
      <input className="span-2" placeholder="Password (min. 10 caratteri)" type="password" minLength={10} required value={userForm.password} onChange={e=>setUserForm({...userForm,password:e.target.value})}/>
      <select value={userForm.role_code} onChange={e=>setUserForm({...userForm,role_code:e.target.value})}>{roles.map(r=><option key={r}>{r}</option>)}</select>
      <button className="primary">Crea utente</button>
     </form>
    </div>
   </div>
   <div className="panel list-panel settings-users"><div className="panel-head"><div><h2>Utenti</h2><p>Accessi al tenant.</p></div></div>
    <div className="data-table users head"><span>Nome</span><span>Email</span><span>Ruolo</span><span>Stato</span></div>
    {users.map(u=><div className="data-table users" key={u.id}><strong>{u.first_name} {u.last_name}</strong><span>{u.email}</span><span>{u.role_codes.join(", ")}</span><span className="status-chip">{u.status}</span></div>)}
   </div>
  </>}
 </SectionShell>;
}
