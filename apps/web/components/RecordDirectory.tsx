"use client";

import { FormEvent, useEffect, useState, useRef } from "react";
import { SectionShell } from "./SectionShell";
import { useLanguage } from "./LanguageProvider";
import { apiError, apiFetch, getAccessToken, hasPermission } from "../lib/api";
import { CaseExtras } from "./CaseExtras";
import { FleetProfile } from "./FleetProfile";
import { PortalAccess } from "./PortalAccess";
import { EstimateChip } from "./EstimateChip";
import { CustomerLogo } from "./CustomerLogo";
import { VehicleFront } from "./VehicleFront";
import { Contract, contractInForce, FleetContracts } from "./FleetContracts";
import { deleteCaseWithConfirm, typedConfirm } from "../lib/caseDeletion";

type RecordData = { id: string; [key: string]: string | number | null | undefined };
type Field = { key: string; it: string; es: string; type?: string; required?: boolean; max?: number; min?: number; options?: string[]; readOnly?: boolean; editable?: boolean };
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
    {key:"vehicle_category",it:"Tipo veicolo",es:"Tipo de vehículo",options:["CAR","VAN","TRUCK","TRACTOR","TRAILER","BUS","MOTORCYCLE","OTHER"],required:true,editable:true},
    {key:"fleet_number",it:"N. flotta / interno",es:"N.º de flota / interno",max:40},
    {key:"fuel_type",it:"Alimentazione",es:"Combustible",max:40}, {key:"engine_size",it:"Cilindrata (cc)",es:"Cilindrada (cc)",max:20},
    {key:"power_kw",it:"Potenza (kW)",es:"Potencia (kW)",type:"number",min:0,max:2000},
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
  const [isAdmin,setIsAdmin] = useState(false);
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
  // A customer opens as a profile (logo, name and vehicles); its data form unfolds on a click.
  const [showData,setShowData] = useState(false);
  const [logoBusy,setLogoBusy] = useState(false);
  const logoInput=useRef<HTMLInputElement|null>(null);
  const [historyOffset,setHistoryOffset] = useState(0);
  const [historyBusy,setHistoryBusy] = useState(false);
  const [historyError,setHistoryError] = useState("");
  // The record opens above the list: bring it into view, wherever the user clicked "Apri scheda".
  const editorRef=useRef<HTMLElement|null>(null);
  const [opened,setOpened]=useState(0);
  useEffect(()=>{if(opened)editorRef.current?.scrollIntoView({behavior:"smooth",block:"start"});},[opened]);

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
    setIsAdmin(hasPermission("users.manage"));
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
  // Coming from a chat alert (?chat=<case id>): open that case and jump to its chat.
  const chatTarget=useRef<string|null>(null);
  useEffect(()=>{chatTarget.current=kind==="cases"?new URLSearchParams(window.location.search).get("chat"):null;},[kind]);
  useEffect(()=>{
    const target=chatTarget.current;
    if(!target)return;
    const item=items.find(entry=>String(entry.id)===target);
    if(!item)return;
    chatTarget.current=null;
    open(item).then(()=>window.setTimeout(()=>document.getElementById("chat")?.scrollIntoView({behavior:"smooth",block:"center"}),600));
  },[items]);
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
  // Coming from Contratti flotta (?id=<customer id>): open that customer's profile.
  useEffect(()=>{
    const target=kind==="customers"?new URLSearchParams(window.location.search).get("id"):null;
    if(!target||!getAccessToken())return;
    read<RecordData>(`/customers/${target}`).then(open).catch(e=>setError(message(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[kind]);
  // The customer's fleet contract decides the type shown in the profile.
  const [contracts,setContracts]=useState<Contract[]|null>(null);
  useEffect(()=>{setContracts(null);},[selected?.id]);

  function label(item:RecordData) {
    if(kind==="customers")return String(item.company_name||[item.first_name,item.last_name].filter(Boolean).join(" "));
    return String(kind==="vehicles"?item.license_plate:item.case_number);
  }
  async function open(item:RecordData) {
    setOpening(true);setError("");setNotice("");
    try {
      const data=kind==="cases"?await read<RecordData>(`/cases/${item.id}`):item;
      setSelected({...item,...data});setHistoryOffset(0);setOpened(n=>n+1);setShowData(false);
      setDraft(Object.fromEntries(definition.fields.map(f=>[f.key,String(data[f.key]??"")])));
    } catch(e){setError(message(e));}finally{setOpening(false);}
  }
  function create() {
    setSelected({id:""});setDraft({customer_type:"PRIVATE",country:"IT",vehicle_category:"CAR"});setNotice("");setError("");setHistory([]);setOpened(n=>n+1);setShowData(true);
  }
  async function save(event:FormEvent) {
    event.preventDefault();if(!selected||!canWrite)return;
    setSaving(true);setError("");setNotice("");
    try {
      if(kind==="customers" && ((draft.customer_type==="COMPANY"&&!draft.company_name?.trim())||(draft.customer_type!=="COMPANY"&&!draft.first_name?.trim()&&!draft.last_name?.trim()))) {
        throw new Error(words("Inserisci il nome del cliente o la ragione sociale.","Introduce el nombre del cliente o la razón social."));
      }
      const payload=Object.fromEntries(definition.fields.filter(f=>!(selected.id&&(f.readOnly||f.key==="customer_type"))).map(f=>{
        const value=(draft[f.key]||(f.options?f.options[0]:"")).trim();
        return [f.key,value===""?null:f.type==="number"?Number(value):f.key==="country"?value.toUpperCase():value];
      }));
      const saved=await read<RecordData>(`/${kind}${selected.id?`/${selected.id}`:""}`,{method:selected.id?"PATCH":"POST",body:JSON.stringify(payload)});
      // A customer's profile stays open after saving its data, with the data folded again.
      if(kind==="customers"&&selected.id){setSelected({...selected,...saved});setShowData(false);}else setSelected(null);
      setRefresh(n=>n+1);setNotice(words("Salvato correttamente.","Guardado correctamente."));
    }catch(e){setError(message(e));}finally{setSaving(false);}
  }
  async function changeLogo(file:File|null) {
    if(!selected?.id||!canWrite||kind!=="customers")return;
    setLogoBusy(true);setError("");setNotice("");
    try {
      const response=await apiFetch(`/customers/${selected.id}/logo`,file?{method:"PUT",body:file,headers:{"Content-Type":"application/octet-stream"}}:{method:"DELETE"});
      if(response.status===413)throw new Error(words("Immagine troppo grande (max 15 MB).","Imagen demasiado grande (máx. 15 MB)."));
      if(response.status===422)throw new Error(words("Il file non è un'immagine valida.","El archivo no es una imagen válida."));
      if(!response.ok)throw new Error(words("Operazione non riuscita. Riprova.","La operación falló. Inténtalo de nuevo."));
      const saved:RecordData=await response.json();
      setSelected(current=>current&&current.id===saved.id?{...current,logo_updated_at:saved.logo_updated_at}:current);
      setItems(list=>list.map(item=>item.id===saved.id?{...item,logo_updated_at:saved.logo_updated_at}:item));
      setNotice(file?words("Logo aggiornato.","Logo actualizado."):words("Logo rimosso.","Logo eliminado."));
    }catch(e){setError(message(e));}finally{setLogoBusy(false);}
  }
  // Asks the API what goes with the record, so the confirmation says it plainly; admins can also remove records with history.
  async function deletionPlan(path:string):Promise<Record<string,string|number|boolean|null>> {
    const response=await apiFetch(`${path}/deletion`);
    if(response.status===401)throw new Error(words("Sessione scaduta. Accedi di nuovo.","Sesión vencida. Inicia sesión de nuevo."));
    if(response.status===403)throw new Error(words("Il tuo profilo non consente questa operazione.","Tu perfil no permite esta operación."));
    if(!response.ok)throw new Error(words("Operazione non riuscita. Riprova.","La operación falló. Inténtalo de nuevo."));
    return response.json();
  }
  async function sendDelete(path:string,force:boolean) {
    const response=await apiFetch(`${path}${force?"?force=true":""}`,{method:"DELETE"});
    if(response.status===409)throw new Error(await apiError(response,words("Non si può eliminare.","No se puede eliminar.")));
    if(response.status===401)throw new Error(words("Sessione scaduta. Accedi di nuovo.","Sesión vencida. Inicia sesión de nuevo."));
    if(response.status===403)throw new Error(words("Solo un amministratore può eliminarlo.","Solo un administrador puede eliminarlo."));
    if(!response.ok&&response.status!==404)throw new Error(words("Operazione non riuscita. Riprova.","La operación falló. Inténtalo de nuevo."));
  }
  const counted=(items:[unknown,string,string][])=>items.filter(([n])=>Number(n)>0).map(([n,it,es])=>`${n} ${words(it,es)}`).join(", ");
  async function removeCase() {
    if(!selected?.id||!canCreate||kind!=="cases")return;
    setSaving(true);setError("");setNotice("");
    try {
      if(!await deleteCaseWithConfirm(String(selected.id),label(selected),words))return;
      setSelected(null);setRefresh(n=>n+1);setNotice(words("Pratica eliminata.","Expediente eliminado."));
    }catch(e){setError(message(e));}finally{setSaving(false);}
  }
  async function remove() {
    if(!selected?.id||!canWrite||kind!=="customers")return;
    setSaving(true);setError("");setNotice("");
    try {
      const path=`/customers/${selected.id}`;
      const plan=await deletionPlan(path);
      if(plan.blocked)throw new Error(words(`Questo cliente ha ${plan.invoices} fatture: le fatture emesse restano in archivio, quindi il cliente non si può eliminare.`,`Este cliente tiene ${plan.invoices} facturas: las facturas emitidas se conservan, así que el cliente no se puede eliminar.`));
      const force=Boolean(plan.has_history);
      if(force&&!isAdmin)throw new Error(words("Questo cliente ha pratiche o contratti: solo un amministratore può eliminarlo.","Este cliente tiene expedientes o contratos: solo un administrador puede eliminarlo."));
      const parts=counted([[plan.cases,"pratiche (con preventivi, lavori, foto e chat)","expedientes (con presupuestos, trabajos, fotos y chat)"],[plan.contracts,"contratti","contratos"],[plan.portal_accounts,"accessi al portale","accesos al portal"]]);
      const text=words(
        `Eliminare il cliente "${label(selected)}"?\n\nSi elimina anche: ${parts||"nient'altro"}.${Number(plan.vehicles)?`\nI suoi ${plan.vehicles} veicoli restano in archivio senza cliente.`:""}\n\nL'operazione non si può annullare.`,
        `¿Eliminar el cliente "${label(selected)}"?\n\nTambién se elimina: ${parts||"nada más"}.${Number(plan.vehicles)?`\nSus ${plan.vehicles} vehículos se quedan guardados sin cliente.`:""}\n\nNo se puede deshacer.`);
      if(!window.confirm(text)||(force&&!(await typedConfirm(words))))return;
      await sendDelete(path,force);
      setSelected(null);setRefresh(n=>n+1);setNotice(words("Cliente eliminato.","Cliente eliminado."));
    }catch(e){setError(message(e));}finally{setSaving(false);}
  }
  const customerOpen=kind==="customers"&&!!selected?.id;
  return <SectionShell title={words(definition.it,definition.es)} actions={signedIn&&canCreate&&(kind==="cases"?<a className="primary link-button" href="/?new=practice">{words("Nuova pratica","Nuevo expediente")}</a>:<button className="primary" onClick={create} disabled={saving||opening}>{words("Aggiungi","Añadir")}</button>)}>
    {!signedIn?<div className="empty-state">{words("Accedi per consultare i dati della tua officina.","Inicia sesión para consultar los datos de tu taller.")} <a href="/login">{words("Accedi","Iniciar sesión")}</a></div>:<>
      {!customerOpen&&<form className="record-search" onSubmit={e=>{e.preventDefault();setSearch(query.trim());setOffset(0);setRefresh(n=>n+1);}}>
        <label>{words("Cerca","Buscar")}<input type="search" value={query} onChange={e=>setQuery(e.target.value)} /></label>
        <button className="secondary">{words("Cerca","Buscar")}</button>
      </form>}
      {error&&<div className="record-error" role="alert">{t(error)} <a href="/login">{words("Accedi","Iniciar sesión")}</a> <button className="ghost" onClick={()=>setRefresh(n=>n+1)}>{words("Riprova","Reintentar")}</button></div>}
      {notice&&<p role="status">{notice}</p>}
      {selected&&<section ref={editorRef} className="panel record-editor" aria-label={words("Scheda","Ficha")}>
        {customerOpen?<>
          <button type="button" className="ghost customer-profile-back" onClick={()=>setSelected(null)}>← {words("Tutti i clienti","Todos los clientes")}</button>
          <button type="button" className="customer-profile-head" aria-expanded={showData} onClick={()=>setShowData(v=>!v)}>
            <CustomerLogo name={label(selected)} version={selected.logo_updated_at?String(selected.logo_updated_at):null} load={()=>apiFetch(`/customers/${selected.id}/logo`)} size={84}/>
            <span><strong>{label(selected)}</strong><span className="customer-type-tags"><span className="status-chip">{selected.customer_type==="COMPANY"?words("Azienda","Empresa"):words("Privato","Particular")}</span>{contracts&&(contracts.some(contractInForce)?<span className="status-chip contract">{words("Contratto flotta","Contrato de flota")}</span>:<span className="status-chip">{words("Listino normale","Tarifa normal")}</span>)}</span><small>{[selected.phone,selected.email].filter(Boolean).join(" · ")}</small><em>{showData?`▴ ${words("Nascondi dati del cliente","Ocultar datos del cliente")}`:`▾ ${words("Dati del cliente","Datos del cliente")}`}</em></span>
          </button>
        </>:<div className="panel-head"><div className="record-title"><h2>{selected.id?label(selected):(kind==="customers"?words("Nuovo cliente","Nuevo cliente"):words("Nuovo veicolo","Nuevo vehículo"))}</h2>{selected.id&&kind!=="customers"&&<small>{vehicleName(selected)||words("Marca e modello non indicati","Marca y modelo no indicados")}</small>}</div><span className="record-head-side">{selected.id&&kind==="vehicles"&&<VehicleFront make={selected.make} model={selected.model} year={selected.year} color={selected.color_name}/>}{kind==="cases"&&<VehicleFront make={selected.vehicle_make} model={selected.vehicle_model} year={selected.vehicle_year} color={selected.vehicle_color}/>}<button className="secondary" disabled={saving} onClick={()=>setSelected(null)}>{words("Chiudi","Cerrar")}</button></span></div>}
        {kind==="cases"&&<p><WorkBadge type={selected.work_type}/>{[selected.customer_name,selected.plate,vehicleName(selected)].filter(Boolean).join(" · ")} · {t(String(selected.status))}{selected.estimate_status&&<> <EstimateChip status={String(selected.estimate_status)} prefix={t("Preventivo")}/></>}</p>}
        {kind==="cases"&&selected.id&&<CaseExtras caseId={String(selected.id)} plate={selected.plate?String(selected.plate):undefined} workType={selected.work_type?String(selected.work_type):undefined} />}
        {(!customerOpen||showData)&&<>
        {customerOpen&&canWrite&&<div className="customer-logo-edit">
          <input ref={logoInput} type="file" hidden accept="image/*" onChange={e=>{const file=e.target.files?.[0]||null;e.target.value="";if(file)changeLogo(file);}}/>
          <span>{words("Logo o immagine dell'azienda: si vede qui e nel portale del cliente.","Logo o imagen de la empresa: se ve aquí y en el portal del cliente.")}</span>
          <button type="button" className="secondary" disabled={logoBusy} onClick={()=>logoInput.current?.click()}>{logoBusy?words("Caricamento…","Subiendo…"):selected.logo_updated_at?words("Cambia logo","Cambiar logo"):words("Carica logo","Subir logo")}</button>
          {selected.logo_updated_at&&<button type="button" className="ghost" disabled={logoBusy} onClick={()=>changeLogo(null)}>{words("Rimuovi logo","Quitar logo")}</button>}
        </div>}
        <form className="record-form" onSubmit={save}>
          {definition.fields.map(f=><label key={f.key}>{words(f.it,f.es)}
            {f.type==="textarea"?<textarea disabled={!canWrite||saving} value={draft[f.key]||""} onChange={e=>setDraft({...draft,[f.key]:e.target.value})}/>:f.options?<select disabled={!canWrite||saving||(!!selected.id&&!f.editable)} value={draft[f.key]||f.options[0]} onChange={e=>setDraft({...draft,[f.key]:e.target.value})}>{f.options.map(o=><option key={o} value={o}>{o==="PRIVATE"?words("Privato","Particular"):t(o)}</option>)}</select>:<input type={f.type||"text"} required={f.required} disabled={!canWrite||saving||!!(selected.id&&f.readOnly)} min={f.min} max={f.type==="number"?f.max:undefined} maxLength={f.type!=="number"?f.max:undefined} value={draft[f.key]||""} onChange={e=>setDraft({...draft,[f.key]:e.target.value})}/>}
          </label>)}
          {canWrite&&<div className="record-form-actions"><button className="primary" disabled={saving}>{saving?words("Salvataggio…","Guardando…"):words("Salva","Guardar")}</button><button type="button" className="secondary" disabled={saving} onClick={()=>customerOpen?setShowData(false):setSelected(null)}>{words("Annulla","Cancelar")}</button>{kind==="customers"&&selected.id&&<button type="button" className="secondary record-delete" disabled={saving} onClick={remove}>{words("Elimina cliente","Eliminar cliente")}</button>}{kind==="cases"&&selected.id&&canCreate&&<button type="button" className="secondary record-delete" disabled={saving} onClick={removeCase}>{words("Elimina pratica","Eliminar expediente")}</button>}</div>}
        </form>
        {customerOpen&&<div className="record-fleet"><PortalAccess customerId={String(selected.id)} customerName={label(selected)} /></div>}
        </>}
        {customerOpen&&<div className="record-fleet"><h3>{words("Contratto flotta","Contrato de flota")}</h3><FleetContracts customer={{id:String(selected.id),name:label(selected)}} onLoaded={setContracts}/></div>}
        {customerOpen&&<div className="record-fleet"><h3>{words("Veicoli del cliente","Vehículos del cliente")}</h3><FleetProfile mode="staff" customerId={String(selected.id)} /></div>}
        {selected.id&&kind!=="cases"&&<div className="record-history"><h3>{words("Storico pratiche","Historial de expedientes")}</h3>
          {historyBusy?<p>{words("Caricamento…","Cargando…")}</p>:historyError?<p role="alert">{t(historyError)}</p>:history.length===0?<p>{words("Nessuna pratica.","No hay expedientes.")}</p>:history.map(h=><a key={h.id} href={`/pratiche?q=${encodeURIComponent(String(h.case_number))}`}>{h.case_number} · {h.plate} · {t(String(h.status))}</a>)}
          <div className="record-pagination"><button disabled={!historyOffset||historyBusy} onClick={()=>setHistoryOffset(n=>Math.max(0,n-pageSize))}>{words("Precedenti","Anteriores")}</button><button disabled={history.length<pageSize||historyBusy} onClick={()=>setHistoryOffset(n=>n+pageSize)}>{words("Successive","Siguientes")}</button></div>
        </div>}
      </section>}
      {!customerOpen&&<><section className="panel record-list" aria-busy={busy}>
        {busy?<div className="empty-state">{words("Caricamento…","Cargando…")}</div>:!error&&items.length===0?<div className="empty-state">{words("Nessun risultato.","No hay resultados.")}</div>:items.map(item=><div className="record-row" key={item.id}>
          {kind==="customers"&&<CustomerLogo name={label(item)} version={item.logo_updated_at?String(item.logo_updated_at):null} load={()=>apiFetch(`/customers/${item.id}/logo`)} size={44}/>}
          <div className="record-row-main"><strong>{kind==="cases"&&<WorkBadge type={item.work_type}/>}{label(item)}</strong><small>{kind==="customers"?[item.phone,item.email].filter(Boolean).join(" · "):kind==="vehicles"?[item.vehicle_category&&item.vehicle_category!=="CAR"?t(String(item.vehicle_category)):null,item.fleet_number?`#${item.fleet_number}`:null,item.make,item.model,item.vin].filter(Boolean).join(" · "):[item.customer_name,item.plate,vehicleName(item),t(String(item.status))].filter(Boolean).join(" · ")}{kind==="cases"&&item.estimate_status&&<> <EstimateChip status={String(item.estimate_status)} prefix={t("Preventivo")}/></>}</small></div>
          <button className="secondary" disabled={opening||saving} onClick={()=>open(item)}>{words("Apri scheda","Abrir ficha")}</button>
        </div>)}
      </section>
      <div className="record-pagination"><button disabled={!offset||busy} onClick={()=>setOffset(n=>Math.max(0,n-pageSize))}>{words("Precedenti","Anteriores")}</button><span>{words("Pagina","Página")} {offset/pageSize+1}</span><button disabled={items.length<pageSize||busy} onClick={()=>setOffset(n=>n+pageSize)}>{words("Successive","Siguientes")}</button></div></>}
    </>}
  </SectionShell>;
}

/** "Make Model" of a vehicle record, or of the vehicle of a case. */
function vehicleName(item: RecordData) {
  return [item.vehicle_make ?? item.make, item.vehicle_model ?? item.model].filter(Boolean).join(" ");
}

/** Bodywork or mechanical job, recognisable at a glance in lists and records. */
function WorkBadge({ type }: { type?: unknown }) {
  const { t } = useLanguage();
  const mechanical = type === "MECHANICAL";
  return <span className={`work-badge ${mechanical ? "mechanical" : "body"}`}>{mechanical ? `🔧 ${t("Meccanica")}` : `🚗 ${t("Carrozzeria")}`}</span>;
}
