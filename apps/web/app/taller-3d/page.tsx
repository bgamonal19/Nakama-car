"use client";
import { useEffect, useRef, useState } from "react";
import { SectionShell } from "../../components/SectionShell";
import { apiFetch, apiError, getAccessToken } from "../../lib/api";
import { useLanguage } from "../../components/LanguageProvider";

type Vehicle = { case_id: string; vehicle_id: string; plate: string; make: string | null; model: string | null; color: string | null; category: string; status: string; initial_status: string; created_at: string; absent?: boolean };
type SceneEvent = { id: string; case_id: string; at: string; kind: "opened" | "status" | "task"; before: string | null; after: string | null };
type Snapshot = { day: string; timezone: string; vehicles: Vehicle[]; events: SceneEvent[]; truncated: boolean; generated_at: string };
const romeDay = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
export default function WorkshopScenePage() {
 const { language } = useLanguage();const es=language==='es';
 const autoPlayed=useRef(false);
 const lastSnapshot=useRef('');
 const frame=useRef<HTMLIFrameElement>(null),ready=useRef(false),busy=useRef(false),dataRef=useRef<Snapshot|null>(null),cursor=useRef(0),model=useRef<Vehicle[]>([]),replaying=useRef(false);
 const [revision,setRevision]=useState(0);
 const [data,setData]=useState<Snapshot|null>(null),[error,setError]=useState(''),[day,setDay]=useState(romeDay),[playing,setPlaying]=useState(false),[speed,setSpeed]=useState('1'),[index,setIndex]=useState(0),[mode,setMode]=useState<'now'|'replay'>('now'),[blocked,setBlocked]=useState(false),[signedIn,setSignedIn]=useState(true);
 const send=(vehicles:Vehicle[],animate=false)=>{if(ready.current)frame.current?.contentWindow?.postMessage({type:'nakama-scene-snapshot',vehicles,animate},window.location.origin)};
 useEffect(()=>{
 const message=(e:MessageEvent)=>{if(e.origin!==window.location.origin||e.source!==frame.current?.contentWindow)return;if(e.data?.type==='nakama-scene-ready'){ready.current=true;if(dataRef.current)send(model.current.length?model.current:dataRef.current.vehicles)}if(e.data?.type==='nakama-scene-state'){busy.current=Boolean(e.data.busy);setBlocked(Boolean(e.data.blocked));}};
 window.addEventListener('message',message);return()=>window.removeEventListener('message',message);
 },[]);
 useEffect(()=>{
 if(!getAccessToken()){setSignedIn(false);return}const controller=new AbortController();let loading=false;
 const load=async()=>{if(loading||document.visibilityState!=='visible')return;loading=true;try{const response=await apiFetch(`/workshop-scene?day=${encodeURIComponent(day)}`,{signal:controller.signal});if(!response.ok)throw new Error(await apiError(response,'Impossibile caricare la vista 3D'));const snapshot:Snapshot=await response.json();if(controller.signal.aborted||replaying.current)return;dataRef.current=snapshot;setData(snapshot);setError('');if(!autoPlayed.current&&snapshot.events.length&&!snapshot.truncated&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches){autoPlayed.current=true;lastSnapshot.current=JSON.stringify(snapshot.vehicles);startReplay(snapshot);return}autoPlayed.current=true;if(!replaying.current){const signature=JSON.stringify(snapshot.vehicles);if(signature!==lastSnapshot.current){model.current=snapshot.vehicles;send(snapshot.vehicles,Boolean(lastSnapshot.current));lastSnapshot.current=signature}}}catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Connessione non disponibile')}finally{loading=false}};
 void load();const timer=setInterval(load,15000);const onFocus=()=>void load();window.addEventListener('focus',onFocus);return()=>{controller.abort();clearInterval(timer);window.removeEventListener('focus',onFocus)};
 },[day,revision]);
 function current(){setRevision(x=>x+1);if(day!==romeDay())setDay(romeDay());replaying.current=false;setPlaying(false);setMode('now');cursor.current=0;setIndex(0);if(dataRef.current){model.current=dataRef.current.vehicles;send(model.current)}frame.current?.contentWindow?.postMessage({type:'nakama-scene-pause',paused:false},location.origin)}
 function startReplay(snapshot:Snapshot|null=data){const data=snapshot;if(!data||data.truncated||!data.events.length)return;replaying.current=true;setMode('replay');cursor.current=0;setIndex(0);model.current=data.vehicles.map(v=>{const events=data.events.filter(e=>e.case_id===v.case_id);const first=events.find(e=>e.kind==='status');return {...v,absent:events.some(e=>e.kind==='opened'),status:first?.before||v.initial_status||v.status}});send(model.current);setPlaying(true);}
 useEffect(()=>{frame.current?.contentWindow?.postMessage({type:'nakama-scene-pause',paused:mode==='replay'&&!playing},location.origin);if(!playing)return;const timer=setInterval(()=>{const snapshot=dataRef.current;if(!snapshot||busy.current||blocked)return;const event=snapshot.events[cursor.current];if(!event){if(snapshot.day===romeDay()){model.current=snapshot.vehicles;send(model.current)}setPlaying(false);return}model.current=model.current.map(v=>v.case_id!==event.case_id?v:{...v,absent:false,status:event.kind==='task'?v.status:event.after||v.status});send(model.current,true);cursor.current++;setIndex(cursor.current)},3000/Number(speed));return()=>clearInterval(timer)},[playing,speed,mode,blocked]);
 const labels:Record<string,string>=es?{NEW:'Por ingresar',WAITING_APPROVAL:'Espera aprobación',APPROVED:'Aprobado',IN_REPAIR:'En reparación',WAITING_PARTS:'Espera repuesto',READY:'Listo',DELIVERED:'Entregado',INVOICED:'Facturado'}:{NEW:'Da accettare',WAITING_APPROVAL:'Attesa approvazione',APPROVED:'Approvato',IN_REPAIR:'In riparazione',WAITING_PARTS:'Attesa ricambi',READY:'Pronto',DELIVERED:'Consegnato',INVOICED:'Fatturato'};
 return <SectionShell title={es?'Taller 3D':'Officina 3D'} eyebrow="NAKAMA CAR">
 <style>{`.scene-controls button{padding:9px 14px;border:1px solid #cbd6df;border-radius:9px;background:#fff;color:#17394d;font-weight:600}.scene-controls button:disabled{opacity:.45;cursor:not-allowed}.scene-controls button:focus-visible,.scene-controls input:focus-visible,.scene-controls select:focus-visible{outline:3px solid #50a5d2;outline-offset:2px}.scene-controls input,.scene-controls select{padding:7px;border:1px solid #cbd6df;border-radius:8px;background:#fff;color:#17394d}`}</style>
 {!signedIn?<p><a href="/login?next=/taller-3d">{es?'Inicia sesión para ver el taller':'Accedi per vedere l’officina'}</a></p>:<>
 <div className="scene-controls" style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center',marginBottom:12}}>
 <button onClick={current}>{es?'Ahora':'Adesso'}</button><label>{es?'Día':'Giorno'} <input type="date" value={day} max={romeDay()} onChange={e=>{current();setData(null);dataRef.current=null;lastSnapshot.current='';setDay(e.target.value||romeDay())}} /></label>
 <button disabled={!data?.events.length||data.truncated} onClick={()=>startReplay()}>{es?'Resumen del día':'Riepilogo del giorno'}</button>
 {mode==='replay'&&<><button onClick={()=>setPlaying(x=>!x)}>{playing?(es?'Pausar':'Pausa'):(es?'Continuar':'Continua')}</button><label>{es?'Velocidad':'Velocità'} <select value={speed} onChange={e=>setSpeed(e.target.value)}><option value="1">1×</option><option value="2">2×</option><option value="4">4×</option></select></label><span>{index}/{data?.events.length} {es?'eventos':'eventi'}</span></>}
 </div>
 {error&&<p role="alert">{error}</p>}
 <p style={{fontSize:13,opacity:.75}}>{es?'Distribución ilustrativa: los puestos no representan la ubicación física real. Solo se reproducen eventos registrados; abrir una práctica no confirma la entrada física del vehículo.':'Distribuzione illustrativa: le postazioni non indicano la posizione fisica reale. Si riproducono solo eventi registrati; aprire una pratica non conferma l’ingresso fisico del veicolo.'}</p>
 {blocked&&<p role="status">{es?'Movimiento detenido para evitar un muro. Usa Ahora para ver el estado actual.':'Movimento fermato per evitare un muro. Usa Adesso per vedere lo stato attuale.'}</p>}
 {data?.truncated&&<p role="status">{es?'Demasiados registros para un resumen completo. La reproducción está desactivada.':'Troppi dati per un riepilogo completo. Riproduzione disattivata.'}</p>}
 <iframe ref={frame} src="/workshop-3d/index.html" title={es?'Vista 3D del taller':'Vista 3D dell’officina'} style={{width:'100%',height:'68vh',minHeight:420,border:0,borderRadius:16}} />
 <details><summary>{es?'Vehículos y eventos registrados':'Veicoli ed eventi registrati'} ({data?.vehicles.length||0})</summary>
 <p>{es?'La escena muestra hasta 13 vehículos; la lista conserva todos los registros recibidos.':'La scena mostra fino a 13 veicoli; l’elenco conserva tutti i dati ricevuti.'}</p>
 {data?.vehicles.map(v=><p key={v.case_id}><strong>{v.plate}</strong> · {[v.make,v.model].filter(Boolean).join(' ')} · {labels[v.status]||v.status}</p>)}
 <ol>{data?.events.map(e=><li key={e.id}>{new Date(e.at).toLocaleTimeString('it-IT',{timeZone:'Europe/Rome'})} · {data.vehicles.find(v=>v.case_id===e.case_id)?.plate} · {e.kind==='opened'?(es?'Práctica abierta':'Pratica aperta'):e.kind==='task'?(es?'Tarea actualizada':'Attività aggiornata'):(labels[e.after||'']||e.after)}</li>)}</ol></details>
 </>}
 </SectionShell>;
}
