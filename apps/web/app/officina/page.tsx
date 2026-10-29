"use client";

import { ReactNode, useCallback, useEffect, useState } from "react";
import { SectionShell } from "../../components/SectionShell";
import { useLanguage } from "../../components/LanguageProvider";
import { DamageMarker, DamagePhotoMap, MarkerView } from "../../components/DamagePhotoMap";
import { apiError, apiFetch, getAccessToken, hasPermission, sessionUser } from "../../lib/api";
import { deleteCaseWithConfirm } from "../../lib/caseDeletion";
import { PlateSpots } from "../../lib/plateSpots";
import { WorkViews } from "../../components/WorkViews";

type Task = {
  id: string; task_type: string; description: string; status: string; completed_by: string | null; completed_at: string | null;
  note: string | null; estimate_line_id: string | null;
};
type Details = {
  make: string | null; model: string | null; version: string | null; year: number | null; color: string | null; paint_code: string | null;
  vin: string | null; fuel_type: string | null; engine_size: string | null; power_kw: number | null; category: string | null;
  mileage: number | null; fuel_level: number | null; fleet_number: string | null; plate_spots: PlateSpots;
};
type Job = {
  work_order_id: string; work_order_number: string; status: string; priority: string; case_number: string; repair_case_id: string; work_type: string;
  plate: string; vehicle: string | null; color: string | null; customer_name: string; request: string | null; internal_notes: string | null;
  details: Details; tasks: Task[]; done: number; total: number; is_new: boolean; approved_at: string;
};
type Waiting = { repair_case_id: string; case_number: string; plate: string; vehicle: string | null; request: string | null; work_type: string; mileage: number | null };
type Pending = Waiting & { stage: "OFFICE" | "CUSTOMER" | "REJECTED"; estimate_number: string };
type MyWork = { work_area: string | null; jobs: Job[]; waiting: Waiting[]; pending: Pending[]; new_jobs: number };

const stageNames: Record<Pending["stage"], [string, string]> = {
  OFFICE: ["🗂", "L'ufficio sta preparando il preventivo"],
  CUSTOMER: ["⏳", "Preventivo inviato, in attesa del cliente"],
  REJECTED: ["✖", "Il cliente ha rifiutato il preventivo"],
};
const taskIcons: Record<string, string> = {
  ACCEPTANCE: "📋", DIAGNOSTIC: "🔎", PARTS: "📦", MECHANICAL_REPAIR: "🔧", ROAD_TEST: "🛣️",
  DISASSEMBLY: "🪛", BODY_REPAIR: "🔨", PAINT_PREP: "🧽", PAINT: "🎨", ASSEMBLY: "🔩",
  QUALITY_CONTROL: "✅", CLEANING: "🧼", ITEM_MECHANICAL: "⚙️", ITEM_BODY: "🚗",
};
const areaNames: Record<string, string> = { MECHANICAL: "Meccanica", BODY: "Carrozzeria" };
const areaOrder = ["MECHANICAL", "BODY"];

function time(value: string | null) {
  return value ? new Date(value).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
}

/**
 * Workshop jobs. A worker sees the vehicles of their area; the main account sees every
 * pending job of the workshop, split into mechanics and body shop.
 */
export default function OfficinaPage() {
  const { t, language } = useLanguage();
  const words = (it: string, es: string) => language === "es" ? es : it;
  const [data, setData] = useState<MyWork | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [signedIn, setSignedIn] = useState(true);
  const [isManager, setIsManager] = useState(false);
  const [canDeliver, setCanDeliver] = useState(false);
  const [canDelete, setCanDelete] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const response = await apiFetch("/my-work");
    if (response.status === 401) { setSignedIn(false); return; }
    if (!response.ok) { setError(await apiError(response, "Impossibile caricare i lavori.")); return; }
    setData(await response.json());
    setError("");
  }, []);

  useEffect(() => {
    if (!getAccessToken()) { setSignedIn(false); return; }
    setIsManager(Boolean(sessionUser()?.permissions.includes("estimate.create")));
    // The office closes and removes jobs; workers only tick their tasks.
    setCanDeliver(hasPermission("estimate.create") && hasPermission("work_order.update_status"));
    setCanDelete(hasPermission("case.create"));
    const opened = new URLSearchParams(window.location.search).get("odl");
    if (opened) setOpenId(opened);
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  function open(id: string | null) {
    setOpenId(id);
    window.history.replaceState(null, "", id ? `/officina?odl=${id}` : "/officina");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function patchTask(jobId: string, taskId: string, change: Partial<Task>) {
    setData((current) => current && { ...current, jobs: current.jobs.map((item) => item.work_order_id !== jobId ? item : {
      ...item,
      tasks: item.tasks.map((x) => (x.id === taskId ? { ...x, ...change } : x)),
    }) });
  }

  async function toggle(job: Job, task: Task) {
    if (busy) return;
    const done = task.status !== "DONE";
    setBusy(task.id);
    patchTask(job.work_order_id, task.id, { status: done ? "DONE" : "PENDING" });  // instant feedback
    try {
      const response = await apiFetch(`/my-work/tasks/${task.id}`, { method: "POST", body: JSON.stringify({ done }) });
      if (!response.ok) setError(await apiError(response, "Impossibile aggiornare il lavoro."));
      await load();
    } finally { setBusy(null); }
  }

  async function saveNote(job: Job, task: Task, note: string) {
    const response = await apiFetch(`/my-work/tasks/${task.id}/note`, { method: "PUT", body: JSON.stringify({ note }) });
    if (!response.ok) { setError(await apiError(response, "Impossibile salvare la nota.")); return false; }
    const saved: Task = await response.json();
    patchTask(job.work_order_id, task.id, { note: saved.note });
    return true;
  }

  async function deliver(item: Job) {
    if (busy) return;
    const missing = item.total - item.done;
    const question = missing > 0
      ? words(`${item.plate}: mancano ancora ${missing} lavori su ${item.total}. Segnare comunque il veicolo come consegnato al cliente? Esce da «Lavori in corso».`, `${item.plate}: aún faltan ${missing} de ${item.total} trabajos. ¿Marcar igualmente el vehículo como entregado al cliente? Sale de «Trabajos en curso».`)
      : words(`Segnare ${item.plate} come consegnato al cliente? Esce da «Lavori in corso» e resta nello storico della pratica.`, `¿Marcar ${item.plate} como entregado al cliente? Sale de «Trabajos en curso» y queda en el historial del expediente.`);
    if (!window.confirm(question)) return;
    setBusy(item.work_order_id); setError(""); setNotice("");
    try {
      const response = await apiFetch(`/work-orders/${item.work_order_id}/status`, { method: "PATCH", body: JSON.stringify({ status: "DELIVERED" }) });
      if (!response.ok) { setError(await apiError(response, words("Impossibile segnare come consegnato.", "No se pudo marcar como entregado."))); return; }
      if (openId === item.work_order_id) open(null);
      setNotice(words(`${item.plate} consegnato.`, `${item.plate} entregado.`));
      await load();
    } finally { setBusy(null); }
  }

  async function removeCase(caseId: string, label: string, workOrderId?: string) {
    if (busy) return;
    setBusy(caseId); setError(""); setNotice("");
    try {
      if (!await deleteCaseWithConfirm(caseId, label, words)) return;
      if (workOrderId && openId === workOrderId) open(null);
      setNotice(words(`Pratica ${label} eliminata.`, `Expediente ${label} eliminado.`));
      await load();
    } catch (e) { setError(e instanceof Error ? e.message : words("Errore di connessione.", "Error de conexión.")); }
    finally { setBusy(null); }
  }

  const officeActions = (item: Job) => (canDeliver || canDelete) && (
    <div className="job-actions">
      {canDeliver && <button type="button" className={item.total > 0 && item.done === item.total ? "primary" : "secondary"} disabled={!!busy} onClick={() => deliver(item)}>✔ {words("Consegnato", "Entregado")}</button>}
      {canDelete && <button type="button" className="secondary record-delete" disabled={!!busy} onClick={() => removeCase(item.repair_case_id, `${item.case_number} · ${item.plate}`, item.work_order_id)}>{words("Elimina", "Eliminar")}</button>}
    </div>
  );

  const allAreas = !data?.work_area;
  const title = allAreas ? "Lavori in corso" : "Il mio lavoro";
  const job = data?.jobs.find((item) => item.work_order_id === openId) || null;

  if (!signedIn) return <SectionShell title={title} eyebrow="OFFICINA"><div className="empty-state"><a href="/login">{t("Accedi")}</a></div></SectionShell>;

  const card = (item: Job) => {
    const finished = item.total > 0 && item.done === item.total;
    return (
      <div key={item.work_order_id} className="job-card-wrap">
      <button type="button" className={`job-card${item.priority === "HIGH" ? " urgent" : ""}${item.is_new ? " fresh" : ""}${finished ? " finished" : ""}`} onClick={() => open(item.work_order_id)}>
        {item.is_new && <span className="new-tag">{t("NUOVO · da iniziare")}</span>}
        {finished && <span className="new-tag done-tag">✔ {t("Tutto fatto · da consegnare")}</span>}
        <strong className="reg-plate">{item.plate}</strong>
        <span className="job-vehicle">{item.vehicle || t("Veicolo")}</span>
        <small>{item.customer_name} · {t(areaNames[item.work_type] || item.work_type)}</small>
        {item.request && <small className="job-req">{item.request}</small>}
        <span className="job-progress"><span style={{ width: `${item.total ? (item.done / item.total) * 100 : 0}%` }} /></span>
        <small>{item.done}/{item.total} {t("completati")}</small>
      </button>
      {officeActions(item)}
      </div>
    );
  };

  return (
    <SectionShell
      title={title}
      eyebrow={data?.work_area ? `OFFICINA · ${t(areaNames[data.work_area]).toUpperCase()}` : "OFFICINA · MECCANICA E CARROZZERIA"}
      actions={!isManager && <a className="primary link-button" href="/diagnosi">✚ {t("Nuova diagnosi")}</a>}
    >
      {!job && <WorkViews current="/officina" />}
      {error && <div className="record-error" role="alert">{t(error)}</div>}
      {notice && <p role="status">{notice}</p>}
      {!data ? <div className="empty-state">{t("Caricamento…")}</div> : job ? (
        <JobDetail job={job} busy={busy} onBack={() => open(null)} onToggle={toggle} onSaveNote={saveNote} actions={officeActions(job)} />
      ) : (
        <>
          {data.new_jobs > 0 && (
            <div className="new-jobs-banner" role="status">
              <strong>🔔 {data.new_jobs === 1 ? t("1 lavoro nuovo approvato dal cliente") : t("{n} lavori nuovi approvati dal cliente").replace("{n}", String(data.new_jobs))}</strong>
              <span>{allAreas ? t("In attesa che il meccanico o il carrozziere inizi.") : t("Puoi iniziare: aprilo e tocca ogni lavoro quando lo finisci.")}</span>
            </div>
          )}
          {allAreas ? areaOrder.map((area) => {
            const jobs = data.jobs.filter((item) => item.work_type === area);
            return (
              <section key={area} className="panel">
                <div className="panel-head"><div>
                  <h2>{area === "BODY" ? "🚗" : "🔧"} {t(area === "BODY" ? "Lavori in carrozzeria" : "Lavori in meccanica")} · {jobs.length}</h2>
                  <p>{t("Veicoli approvati dal cliente e lo stato di ogni lavoro.")}</p>
                </div></div>
                {jobs.length === 0 ? <div className="empty-state">{t("Nessun lavoro in corso.")}</div> : <div className="job-grid">{jobs.map(card)}</div>}
              </section>
            );
          }) : (
            <section className="panel">
              <div className="panel-head"><div><h2>{t("Lavori da fare")} · {data.jobs.length}</h2><p>{t("Veicoli approvati dal cliente. Apri un veicolo per vedere i lavori da fare.")}</p></div></div>
              {data.jobs.length === 0 ? <div className="empty-state">{t("Nessun veicolo in lavorazione nella tua area.")}</div> : <div className="job-grid">{data.jobs.map(card)}</div>}
            </section>
          )}
          <section className="panel">
            <div className="panel-head"><div><h2>{t("In attesa di diagnosi")} · {data.waiting.length}</h2><p>{t("Veicoli arrivati che aspettano la diagnosi per il preventivo.")}</p></div></div>
            {data.waiting.length === 0 ? <div className="empty-state">{t("Nessun veicolo in attesa.")}</div> : (
              <div className="job-grid">
                {data.waiting.map((item) => (
                  <a key={item.repair_case_id} className="job-card waiting" href={`/diagnosi?targa=${encodeURIComponent(item.plate)}`}>
                    <strong className="reg-plate">{item.plate}</strong>
                    <span className="job-vehicle">{item.vehicle || t("Veicolo")}</span>
                    <small>{item.case_number}{item.mileage ? ` · ${item.mileage.toLocaleString("it-IT")} km` : ""}{allAreas ? ` · ${t(areaNames[item.work_type] || item.work_type)}` : ""}</small>
                    {item.request && <small className="job-req">{item.request}</small>}
                    {!isManager && <span className="link-like">✚ {t("Fai la diagnosi")}</span>}
                  </a>
                ))}
              </div>
            )}
          </section>
          {data.pending.length > 0 && (
            <section className="panel">
              <div className="panel-head"><div><h2>{t("In ufficio o dal cliente")} · {data.pending.length}</h2><p>{t("Diagnosi già inviate: appena il cliente approva, il veicolo passa in «Lavori da fare».")}</p></div></div>
              <div className="job-grid">
                {data.pending.map((item) => (
                  <div key={item.repair_case_id} className={`job-card pending stage-${item.stage.toLowerCase()}`}>
                    <strong className="reg-plate">{item.plate}</strong>
                    <span className="job-vehicle">{item.vehicle || t("Veicolo")}</span>
                    <small>{item.case_number} · {item.estimate_number}</small>
                    <span className="stage-line">{stageNames[item.stage][0]} {t(stageNames[item.stage][1])}</span>
                    {canDelete && <div className="job-actions">
                      <a className="secondary link-button" href={`/pratiche?q=${encodeURIComponent(item.case_number)}`}>{words("Apri pratica", "Abrir expediente")}</a>
                      <button type="button" className="secondary record-delete" disabled={!!busy} onClick={() => removeCase(item.repair_case_id, `${item.case_number} · ${item.plate}`)}>{words("Elimina", "Eliminar")}</button>
                    </div>}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </SectionShell>
  );
}

/** One vehicle: the whole car with its damages/parts, its data, and every job as a button with a note. */
function JobDetail({ job, busy, onBack, onToggle, onSaveNote, actions }: {
  job: Job; busy: string | null; onBack: () => void; actions?: ReactNode;
  onToggle: (job: Job, task: Task) => void;
  onSaveNote: (job: Job, task: Task, note: string) => Promise<boolean>;
}) {
  const { t } = useLanguage();
  const [markers, setMarkers] = useState<DamageMarker[]>([]);
  const [parts, setParts] = useState<{ id: string; label: string }[]>([]);
  const caseId = job.repair_case_id;
  const d = job.details;

  useEffect(() => {
    apiFetch(`/cases/${caseId}/damage-markers`).then(async (response) => {
      if (!response.ok) return;
      const data: (DamageMarker & { x: string | number; y: string | number })[] = await response.json();
      setMarkers(data.map((marker) => ({ ...marker, x: Number(marker.x), y: Number(marker.y) })));
    }).catch(() => undefined);
    apiFetch(`/cases/${caseId}/parts`).then(async (response) => { if (response.ok) setParts(await response.json()); }).catch(() => undefined);
  }, [caseId]);

  const loadRender = useCallback((view: MarkerView, version: string) => apiFetch(`/my-work/cases/${caseId}/renders/${view}?v=${version}`), [caseId]);
  const items = job.tasks.filter((task) => task.estimate_line_id);
  const steps = job.tasks.filter((task) => !task.estimate_line_id);
  const specs: [string, string | null][] = [
    ["Marca e modello", [d.make, d.model, d.version].filter(Boolean).join(" ") || null],
    ["Anno", d.year ? String(d.year) : null],
    ["Colore", [d.color, d.paint_code].filter(Boolean).join(" · ") || null],
    ["Telaio (VIN)", d.vin],
    ["Chilometri", d.mileage ? `${d.mileage.toLocaleString("it-IT")} km` : null],
    ["Alimentazione", d.fuel_type],
    ["Motore", [d.engine_size, d.power_kw ? `${d.power_kw} kW` : null].filter(Boolean).join(" · ") || null],
    ["Carburante all'arrivo", d.fuel_level != null ? `${d.fuel_level}%` : null],
    ["N. flotta", d.fleet_number],
  ];

  return (
    <section className="panel job-detail">
      <button type="button" className="ghost back-button" onClick={onBack}>← {t("Tutti i veicoli")}</button>
      <header className="job-head">
        <strong className="reg-plate big">{job.plate}</strong>
        <div>
          <h2>{job.vehicle || t("Veicolo")}{job.color ? ` · ${job.color}` : ""}</h2>
          <p>{job.customer_name} · {job.case_number} · {job.work_order_number}</p>
        </div>
      </header>

      <div className="job-vehicle-view">
        <DamagePhotoMap
          vehicle={{ make: d.make || "", model: d.model || "", year: d.year, color: d.color || "" }}
          plate={job.plate}
          markers={markers}
          loadRender={loadRender}
          plateSpots={d.plate_spots}
          parts={parts}
          scene={job.work_type === "MECHANICAL" ? "lift" : "turntable"}
        />
        <dl className="job-specs">
          {specs.filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{t(label)}</dt><dd>{value}</dd></div>)}
        </dl>
      </div>

      {job.request && <p className="job-request"><b>{t("Richiesta del cliente")}:</b> {job.request}</p>}
      {job.internal_notes && <p className="job-request"><b>{t("Note dell'ufficio")}:</b> {job.internal_notes}</p>}

      <div className="job-progress" aria-label={`${job.done}/${job.total}`}>
        <span style={{ width: `${job.total ? (job.done / job.total) * 100 : 0}%` }} />
      </div>
      <p className="hint">{job.done}/{job.total} {t("completati")} · {t("Tocca un lavoro quando lo finisci; toccalo di nuovo se ti sei sbagliato. Con 💬 aggiungi una nota.")}</p>

      {items.length > 0 && (
        <>
          <h3 className="task-group-title">⚙️ {t("Ricambi e interventi approvati")}</h3>
          <div className="task-buttons">{items.map((task) => <TaskButton key={task.id} task={task} busy={busy === task.id} onToggle={() => onToggle(job, task)} onSaveNote={(note) => onSaveNote(job, task, note)} />)}</div>
        </>
      )}
      <h3 className="task-group-title">🧰 {t("Fasi di lavoro")}</h3>
      <div className="task-buttons">
        {steps.map((task) => <TaskButton key={task.id} task={task} busy={busy === task.id} onToggle={() => onToggle(job, task)} onSaveNote={(note) => onSaveNote(job, task, note)} />)}
        {job.tasks.length === 0 && <div className="empty-state">{t("Nessun lavoro della tua area su questo veicolo.")}</div>}
      </div>
      <a className="secondary link-button" href={`/diagnosi?targa=${encodeURIComponent(job.plate)}`}>✚ {t("Segnala un lavoro in più (diagnosi)")}</a>
      {actions}
    </section>
  );
}

/** Big button to tick a job, with a small note underneath. */
function TaskButton({ task, busy, onToggle, onSaveNote }: { task: Task; busy: boolean; onToggle: () => void; onSaveNote: (note: string) => Promise<boolean> }) {
  const { t } = useLanguage();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(task.note || "");
  const [saving, setSaving] = useState(false);
  const done = task.status === "DONE";

  async function save() {
    setSaving(true);
    try { if (await onSaveNote(text)) setEditing(false); } finally { setSaving(false); }
  }

  return (
    <div className={`task-card${done ? " done" : ""}`}>
      <button type="button" className={`task-button${done ? " done" : ""}`} aria-pressed={done} disabled={busy} onClick={onToggle}>
        <span className="task-icon" aria-hidden="true">{done ? "✔" : taskIcons[task.task_type] || "🔧"}</span>
        <span className="task-text">
          <strong>{t(task.description)}</strong>
          <small>{done ? `${t("Fatto")}${task.completed_by ? ` · ${task.completed_by}` : ""}${task.completed_at ? ` · ${time(task.completed_at)}` : ""}` : t("Da fare")}</small>
        </span>
      </button>
      {editing ? (
        <div className="task-note-edit">
          <textarea autoFocus rows={2} maxLength={1000} value={text} onChange={(event) => setText(event.target.value)} placeholder={t("Es. dischi al limite, manca un ricambio…")} aria-label={t("Nota")} />
          <div>
            <button type="button" className="ghost" onClick={() => { setText(task.note || ""); setEditing(false); }}>{t("Annulla")}</button>
            <button type="button" className="primary" disabled={saving} onClick={save}>{saving ? t("Salvataggio…") : t("Salva nota")}</button>
          </div>
        </div>
      ) : task.note ? (
        <button type="button" className="task-note" onClick={() => { setText(task.note || ""); setEditing(true); }}>💬 {task.note}</button>
      ) : (
        <button type="button" className="task-note empty" onClick={() => setEditing(true)}>💬 {t("Aggiungi nota")}</button>
      )}
    </div>
  );
}
