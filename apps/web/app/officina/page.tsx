"use client";

import { useCallback, useEffect, useState } from "react";
import { SectionShell } from "../../components/SectionShell";
import { useLanguage } from "../../components/LanguageProvider";
import { apiError, apiFetch, getAccessToken } from "../../lib/api";

type Task = { id: string; task_type: string; description: string; status: string; completed_by: string | null; completed_at: string | null };
type Job = {
  work_order_id: string; work_order_number: string; status: string; priority: string; case_number: string; work_type: string;
  plate: string; vehicle: string | null; color: string | null; customer_name: string; request: string | null;
  tasks: Task[]; done: number; total: number; is_new: boolean; approved_at: string;
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
  QUALITY_CONTROL: "✅", CLEANING: "🧼",
};
const areaNames: Record<string, string> = { MECHANICAL: "Meccanica", BODY: "Carrozzeria" };

function time(value: string | null) {
  return value ? new Date(value).toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";
}

/** Workshop view: vehicles of my area, each with its tasks as big buttons to tick. */
export default function OfficinaPage() {
  const { t } = useLanguage();
  const [data, setData] = useState<MyWork | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [signedIn, setSignedIn] = useState(true);

  const load = useCallback(async () => {
    const response = await apiFetch("/my-work");
    if (response.status === 401) { setSignedIn(false); return; }
    if (!response.ok) { setError(await apiError(response, "Impossibile caricare i lavori.")); return; }
    setData(await response.json());
    setError("");
  }, []);

  useEffect(() => {
    if (!getAccessToken()) { setSignedIn(false); return; }
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function toggle(job: Job, task: Task) {
    if (busy) return;
    const done = task.status !== "DONE";
    setBusy(task.id);
    // Instant feedback; the server answer replaces it.
    setData((current) => current && { ...current, jobs: current.jobs.map((item) => item.work_order_id !== job.work_order_id ? item : {
      ...item,
      tasks: item.tasks.map((x) => (x.id === task.id ? { ...x, status: done ? "DONE" : "PENDING" } : x)),
      done: item.done + (done ? 1 : -1),
    }) });
    try {
      const response = await apiFetch(`/my-work/tasks/${task.id}`, { method: "POST", body: JSON.stringify({ done }) });
      if (!response.ok) setError(await apiError(response, "Impossibile aggiornare il lavoro."));
      await load();
    } finally { setBusy(null); }
  }

  const job = data?.jobs.find((item) => item.work_order_id === openId) || null;

  if (!signedIn) return <SectionShell title="Il mio lavoro" eyebrow="OFFICINA"><div className="empty-state"><a href="/login">{t("Accedi")}</a></div></SectionShell>;

  return (
    <SectionShell
      title="Il mio lavoro"
      eyebrow={data?.work_area ? `OFFICINA · ${t(areaNames[data.work_area]).toUpperCase()}` : "OFFICINA"}
      actions={<a className="primary link-button" href="/diagnosi">✚ {t("Nuova diagnosi")}</a>}
    >
      {error && <div className="record-error" role="alert">{t(error)}</div>}
      {!data ? <div className="empty-state">{t("Caricamento…")}</div> : job ? (
        <section className="panel job-detail">
          <button type="button" className="ghost back-button" onClick={() => setOpenId(null)}>← {t("Tutti i veicoli")}</button>
          <header className="job-head">
            <strong className="plate-badge big">{job.plate}</strong>
            <div>
              <h2>{job.vehicle || t("Veicolo")}{job.color ? ` · ${job.color}` : ""}</h2>
              <p>{job.customer_name} · {job.case_number} · {job.work_order_number}</p>
            </div>
          </header>
          {job.request && <p className="job-request"><b>{t("Richiesta del cliente")}:</b> {job.request}</p>}
          <div className="job-progress" aria-label={`${job.done}/${job.total}`}>
            <span style={{ width: `${job.total ? (job.done / job.total) * 100 : 0}%` }} />
          </div>
          <p className="hint">{job.done}/{job.total} {t("completati")} · {t("Tocca un lavoro quando lo finisci; toccalo di nuovo se ti sei sbagliato.")}</p>
          <div className="task-buttons">
            {job.tasks.map((task) => {
              const done = task.status === "DONE";
              return (
                <button
                  key={task.id}
                  type="button"
                  className={`task-button${done ? " done" : ""}`}
                  aria-pressed={done}
                  disabled={busy === task.id}
                  onClick={() => toggle(job, task)}
                >
                  <span className="task-icon" aria-hidden="true">{done ? "✔" : taskIcons[task.task_type] || "🔧"}</span>
                  <span className="task-text">
                    <strong>{t(task.description)}</strong>
                    <small>{done ? `${t("Fatto")}${task.completed_by ? ` · ${task.completed_by}` : ""}${task.completed_at ? ` · ${time(task.completed_at)}` : ""}` : t("Da fare")}</small>
                  </span>
                </button>
              );
            })}
            {job.tasks.length === 0 && <div className="empty-state">{t("Nessun lavoro della tua area su questo veicolo.")}</div>}
          </div>
          <a className="secondary link-button" href={`/diagnosi?targa=${encodeURIComponent(job.plate)}`}>✚ {t("Segnala un lavoro in più (diagnosi)")}</a>
        </section>
      ) : (
        <>
          {data.new_jobs > 0 && (
            <div className="new-jobs-banner" role="status">
              <strong>🔔 {data.new_jobs === 1 ? t("1 lavoro nuovo approvato dal cliente") : t("{n} lavori nuovi approvati dal cliente").replace("{n}", String(data.new_jobs))}</strong>
              <span>{t("Puoi iniziare: aprilo e tocca ogni lavoro quando lo finisci.")}</span>
            </div>
          )}
          <section className="panel">
            <div className="panel-head"><div><h2>{t("Lavori da fare")} · {data.jobs.length}</h2><p>{t("Veicoli approvati dal cliente. Apri un veicolo per vedere i lavori da fare.")}</p></div></div>
            {data.jobs.length === 0 ? <div className="empty-state">{t("Nessun veicolo in lavorazione nella tua area.")}</div> : (
              <div className="job-grid">
                {data.jobs.map((item) => (
                  <button key={item.work_order_id} type="button" className={`job-card${item.priority === "HIGH" ? " urgent" : ""}${item.is_new ? " fresh" : ""}`} onClick={() => setOpenId(item.work_order_id)}>
                    {item.is_new && <span className="new-tag">{t("NUOVO · da iniziare")}</span>}
                    <strong className="plate-badge">{item.plate}</strong>
                    <span className="job-vehicle">{item.vehicle || t("Veicolo")}</span>
                    <small>{item.customer_name} · {t(areaNames[item.work_type] || item.work_type)}</small>
                    {item.request && <small className="job-req">{item.request}</small>}
                    <span className="job-progress"><span style={{ width: `${item.total ? (item.done / item.total) * 100 : 0}%` }} /></span>
                    <small>{item.done}/{item.total} {t("completati")}</small>
                  </button>
                ))}
              </div>
            )}
          </section>
          <section className="panel">
            <div className="panel-head"><div><h2>{t("In attesa di diagnosi")} · {data.waiting.length}</h2><p>{t("Veicoli arrivati che aspettano la tua diagnosi per il preventivo.")}</p></div></div>
            {data.waiting.length === 0 ? <div className="empty-state">{t("Nessun veicolo in attesa.")}</div> : (
              <div className="job-grid">
                {data.waiting.map((item) => (
                  <a key={item.repair_case_id} className="job-card waiting" href={`/diagnosi?targa=${encodeURIComponent(item.plate)}`}>
                    <strong className="plate-badge">{item.plate}</strong>
                    <span className="job-vehicle">{item.vehicle || t("Veicolo")}</span>
                    <small>{item.case_number}{item.mileage ? ` · ${item.mileage.toLocaleString("it-IT")} km` : ""}</small>
                    {item.request && <small className="job-req">{item.request}</small>}
                    <span className="link-like">✚ {t("Fai la diagnosi")}</span>
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
                    <strong className="plate-badge">{item.plate}</strong>
                    <span className="job-vehicle">{item.vehicle || t("Veicolo")}</span>
                    <small>{item.case_number} · {item.estimate_number}</small>
                    <span className="stage-line">{stageNames[item.stage][0]} {t(stageNames[item.stage][1])}</span>
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
