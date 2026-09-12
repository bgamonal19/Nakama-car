"use client";

import { FormEvent, useEffect, useState } from "react";
import { SectionShell } from "./SectionShell";
import { useLanguage } from "./LanguageProvider";
import { apiFetch, getAccessToken } from "../lib/api";

type RecordData = { id: string; [key: string]: string | number | null | undefined };
type Field = { key: string; it: string; es: string; type?: string; required?: boolean; max?: number; min?: number; options?: string[]; readOnly?: boolean };
type Kind = "customers" | "vehicles" | "cases";
const config: Record<Kind, {it: string; es: string; permission: string; fields: Field[]}> = {
  customers: {it: "Clienti", es: "Clientes", permission: "customer.write", fields: [
    {key:"customer_type",it:"Tipo",es:"Tipo",options:["PRIVATE","COMPANY"],required:true},
    {key:"first_name",it:"Nome",es:"Nombre",max:120}, {key:"last_name",it:"Cognome",es:"Apellido",max:120},
    {key:"company_name",it:"Ragione sociale",es:"Razón social",max:180}, {key:"phone",it:"Telefono",es:"Teléfono",type:"tel",max:32},
    {key:"email",it:"Email",es:"Correo",type:"email",max:255}, {key:"tax_code",it:"Codice fiscale",es:"Código fiscal",max:32},
    {key:"vat_number",it:"Partita IVA",es:"Número IVA",max:32}, {key:"address",it:"Indirizzo",es:"Dirección",max:255},
    {key:"city",it:"Città",es:"Ciudad",max:120}, {key:"province",it:"Provincia",es:"Provincia",max:8},
    {key:"postal_code",it:"CAP",es:"Código postal",max:16}, {key:"country",it:"Paese (IT, ES…)",es:"País (IT, ES…)",required:true,max:2},
    {key:"pec",it:"PEC",es:"PEC",type:"email",max:255}, {key:"sdi",it:"Codice SDI",es:"Código SDI",max:16}, {key:"notes",it:"Note",es:"Notas",type:"textarea"},
  ]},
  vehicles: {it:"Veicoli",es:"Vehículos",permission:"vehicle.write",fields:[
    {key:"license_plate",it:"Targa",es:"Matrícula",required:true,max:20,readOnly:true}, {key:"vin",it:"VIN",es:"VIN",max:32},
    {key:"make",it:"Marca",es:"Marca",max:120}, {key:"model",it:"Modello",es:"Modelo",max:120}, {key:"version",it:"Versione",es:"Versión",max:160},
    {key:"year",it:"Anno",es:"Año",type:"number",min:1886,max:2100}, {key:"mileage",it:"Chilometri",es:"Kilómetros",type:"number",min:0},
    {key:"color_name",it:"Colore",es:"Color",max:120}, {key:"paint_code",it:"Codice vernice",es:"Código de pintura",max:64},
  ]},
  cases: {it:"Pratiche",es:"Expedientes",permission:"case.update",fields:[
    {key:"mileage",it:"Chilometri",es:"Kilómetros",type:"number",min:0}, {key:"fuel_level_percent",it:"Carburante (%)",es:"Combustible (%)",type:"number",min:0,max:100},
    {key:"customer_notes",it:"Richiesta del cliente",es:"Solicitud del cliente",type:"textarea"}, {key:"internal_notes",it:"Note interne",es:"Notas internas",type:"textarea"},
  ]},
};
const pageSize = 30;

export function RecordDirectory({kind}: {kind: Kind}) {
  const {language,t} = useLanguage();
  const words = (it:string,es:string) => language === "es" ? es : it;
  const definition = config[kind];
  const [signedIn,setSignedIn] = useState(false);
  const [canCreate,setCanCreate] = useState(false);
  const [canWrite,setCanWrite] = useState(false);
  const [items,setItems] = useState<RecordData[]>([]);
  const [query,setQuery] = useState("");
  const [search,setSearch] = useState("");
  const [offset,setOffset] = useState(0);
  const [refresh,setRefresh] = useState(0);
  const [busy,setBusy] = useState(true);
  const [error,setError] = useState("");
  const [selected,setSelected] = useState<RecordData|null>(null);
  const [draft,setDraft] = useState<Record<string,string>>({});
  const [saving,setSaving] = useState(false);
  const [opening,setOpening] = useState(false);
  const [notice,setNotice] = useState("");
  const [history,setHistory] = useState<RecordData[]>([]);
  const [historyOffset,setHistoryOffset] = useState(0);
  const [historyBusy,setHistoryBusy] = useState(false);
  const [historyError,setHistoryError] = useState("");

  async function read<T>(path:string,init?:RequestInit):Promise<T> {
    const response = await apiFetch(path,init);
    if (!response.ok) {
      if (response.status===401) throw new Error(words("Sessione scaduta. Accedi di nuovo.","Sesión vencida. Inicia sesión de nuevo."));
      if (response.status===403) throw new Error(words("Il tuo profilo non consente questa operazione.","Tu perfil no permite esta operación."));
      if (response.status===409) throw new Error(words("Esiste già un veicolo con questa targa.","Ya existe un vehículo con esta matrícula."));
      if (response.status===422) throw new Error(words("Controlla i campi e i dati obbligatori.","Revisa los campos y los datos obligatorios."));
      throw new Error(words("Operazione non riuscita. Riprova.","La operación falló. Inténtalo de nuevo."));
    }
    return response.json();
  }
  const message = (e:unknown) => e instanceof Error ? e.message : words("Errore di connessione.","Error de conexión.");
  useEffect(() => {
    const initialQuery=new URLSearchParams(window.location.search).get("q")||"";
    setQuery(initialQuery);setSearch(initialQuery);
    setSignedIn(!!getAccessToken());
    try {const permissions=JSON.parse(localStorage.getItem("nakama_user")||"{}").permissions||[];setCanWrite(permissions.includes(definition.permission));setCanCreate(permissions.includes(kind==="cases"?"case.create":definition.permission));} catch {setCanWrite(false);}
  },[definition.permission]);
  useEffect(() => {
    const controller = new AbortController();
    if (!getAccessToken()) {setBusy(false);return;}
    setBusy(true);setError("");setItems([]);
    read<RecordData[]>(`/${kind}?q=${encodeURIComponent(search)}&offset=${offset}&limit=${pageSize}`,{signal:controller.signal})
      .then(data=>{if(!controller.signal.aborted)setItems(data);})
      .catch(e=>{if(!controller.signal.aborted)setError(message(e));})
      .finally(()=>{if(!controller.signal.aborted)setBusy(false);});
    return ()=>controller.abort();
  },[kind,search,offset,refresh]);
  useEffect(()=>{
    const controller=new AbortController();
    setHistory([]);setHistoryError("");
    if (!selected?.id || kind==="cases") return;
    setHistoryBusy(true);
    const key=kind==="customers"?"customer_id":"vehicle_id";
    read<RecordData[]>(`/cases?${key}=${selected.id}&offset=${historyOffset}&limit=${pageSize}`,{signal:controller.signal})
      .then(data=>{if(!controller.signal.aborted)setHistory(data);})
      .catch(e=>{if(!controller.signal.aborted)setHistoryError(message(e));})
      .finally(()=>{if(!controller.signal.aborted)setHistoryBusy(false);});
    return ()=>controller.abort();
  },[selected?.id,kind,historyOffset]);

  function label(item:RecordData) {
    if(kind==="customers")return String(item.company_name||[item.first_name,item.last_name].filter(Boolean).join(" "));
    return String(kind==="vehicles"?item.license_plate:item.case_number);
  }
  async function open(item:RecordData) {
    setOpening(true);setError("");setNotice("");
    try {
      const data=kind==="cases"?await read<RecordData>(`/cases/${item.id}`):item;
      setSelected({...item,...data});setHistoryOffset(0);
      setDraft(Object.fromEntries(definition.fields.map(f=>[f.key,String(data[f.key]??"")])));
    } catch(e){setError(message(e));}finally{setOpening(false);}
  }
  function create() {
    setSelected({id:""});setDraft({customer_type:"PRIVATE",country:"IT"});setNotice("");setError("");setHistory([]);
  }
  async function save(event:FormEvent) {
    event.preventDefault();if(!selected||!canWrite)return;
    setSaving(true);setError("");setNotice("");
    try {
      if(kind==="customers" && ((draft.customer_type==="COMPANY"&&!draft.company_name?.trim())||(draft.customer_type!=="COMPANY"&&!draft.first_name?.trim()&&!draft.last_name?.trim()))) {
        throw new Error(words("Inserisci il nome del cliente o la ragione sociale.","Introduce el nombre del cliente o la razón social."));
      }
      const payload=Object.fromEntries(definition.fields.filter(f=>!(selected.id&&(f.readOnly||f.key==="customer_type"))).map(f=>{
        const value=(draft[f.key]||"").trim();
        return [f.key,value===""?null:f.type==="number"?Number(value):f.key==="country"?value.toUpperCase():value];
      }));
      await read(`/${kind}${selected.id?`/${selected.id}`:""}`,{method:selected.id?"PATCH":"POST",body:JSON.stringify(payload)});
      setSelected(null);setRefresh(n=>n+1);setNotice(words("Salvato correttamente.","Guardado correctamente."));
    }catch(e){setError(message(e));}finally{setSaving(false);}
  }
  return <SectionShell title={words(definition.it,definition.es)} actions={signedIn&&canCreate&&(kind==="cases"?<a className="primary link-button" href="/?new=practice">{words("Nuova pratica","Nuevo expediente")}</a>:<button className="primary" onClick={create} disabled={saving||opening}>{words("Aggiungi","Añadir")}</button>)}>
    {!signedIn?<div className="empty-state">{words("Accedi per consultare i dati della tua officina.","Inicia sesión para consultar los datos de tu taller.")} <a href="/login">{words("Accedi","Iniciar sesión")}</a></div>:<>
      <form className="record-search" onSubmit={e=>{e.preventDefault();setSearch(query.trim());setOffset(0);setRefresh(n=>n+1);}}>
        <label>{words("Cerca","Buscar")}<input type="search" value={query} onChange={e=>setQuery(e.target.value)} /></label>
        <button className="secondary">{words("Cerca","Buscar")}</button>
      </form>
      {error&&<div className="record-error" role="alert">{error} <button className="ghost" onClick={()=>setRefresh(n=>n+1)}>{words("Riprova","Reintentar")}</button></div>}
      {notice&&<p role="status">{notice}</p>}
      {selected&&<section className="panel record-editor" aria-label={words("Scheda","Ficha")}>
        <div className="panel-head"><h2>{selected.id?label(selected):(kind==="customers"?words("Nuovo cliente","Nuevo cliente"):words("Nuovo veicolo","Nuevo vehículo"))}</h2><button className="secondary" disabled={saving} onClick={()=>setSelected(null)}>{words("Chiudi","Cerrar")}</button></div>
        {kind==="cases"&&<p>{selected.customer_name} · {selected.plate} · {t(String(selected.status))}</p>}
        <form className="record-form" onSubmit={save}>
          {definition.fields.map(f=><label key={f.key}>{words(f.it,f.es)}
            {f.type==="textarea"?<textarea disabled={!canWrite||saving} value={draft[f.key]||""} onChange={e=>setDraft({...draft,[f.key]:e.target.value})}/>:f.options?<select disabled={!canWrite||saving||!!selected.id} value={draft[f.key]||f.options[0]} onChange={e=>setDraft({...draft,[f.key]:e.target.value})}>{f.options.map(o=><option key={o} value={o}>{o==="PRIVATE"?words("Privato","Particular"):t(o)}</option>)}</select>:<input type={f.type||"text"} required={f.required} disabled={!canWrite||saving||!!(selected.id&&f.readOnly)} min={f.min} max={f.type==="number"?f.max:undefined} maxLength={f.type!=="number"?f.max:undefined} value={draft[f.key]||""} onChange={e=>setDraft({...draft,[f.key]:e.target.value})}/>}
          </label>)}
          {canWrite&&<div className="record-form-actions"><button className="primary" disabled={saving}>{saving?words("Salvataggio…","Guardando…"):words("Salva","Guardar")}</button><button type="button" className="secondary" disabled={saving} onClick={()=>setSelected(null)}>{words("Annulla","Cancelar")}</button></div>}
        </form>
        {selected.id&&kind!=="cases"&&<div className="record-history"><h3>{words("Storico pratiche","Historial de expedientes")}</h3>
          {historyBusy?<p>{words("Caricamento…","Cargando…")}</p>:historyError?<p role="alert">{historyError}</p>:history.length===0?<p>{words("Nessuna pratica.","No hay expedientes.")}</p>:history.map(h=><a key={h.id} href={`/pratiche?q=${encodeURIComponent(String(h.case_number))}`}>{h.case_number} · {h.plate} · {t(String(h.status))}</a>)}
          <div className="record-pagination"><button disabled={!historyOffset||historyBusy} onClick={()=>setHistoryOffset(n=>Math.max(0,n-pageSize))}>{words("Precedenti","Anteriores")}</button><button disabled={history.length<pageSize||historyBusy} onClick={()=>setHistoryOffset(n=>n+pageSize)}>{words("Successive","Siguientes")}</button></div>
        </div>}
      </section>}
      <section className="panel record-list" aria-busy={busy}>
        {busy?<div className="empty-state">{words("Caricamento…","Cargando…")}</div>:!error&&items.length===0?<div className="empty-state">{words("Nessun risultato.","No hay resultados.")}</div>:items.map(item=><div className="record-row" key={item.id}>
          <div><strong>{label(item)}</strong><small>{kind==="customers"?[item.phone,item.email].filter(Boolean).join(" · "):kind==="vehicles"?[item.make,item.model,item.vin].filter(Boolean).join(" · "):[item.customer_name,item.plate,t(String(item.status))].filter(Boolean).join(" · ")}</small></div>
          <button className="secondary" disabled={opening||saving} onClick={()=>open(item)}>{words("Apri scheda","Abrir ficha")}</button>
        </div>)}
      </section>
      <div className="record-pagination"><button disabled={!offset||busy} onClick={()=>setOffset(n=>Math.max(0,n-pageSize))}>{words("Precedenti","Anteriores")}</button><span>{words("Pagina","Página")} {offset/pageSize+1}</span><button disabled={items.length<pageSize||busy} onClick={()=>setOffset(n=>n+pageSize)}>{words("Successive","Siguientes")}</button></div>
    </>}
  </SectionShell>;
}
