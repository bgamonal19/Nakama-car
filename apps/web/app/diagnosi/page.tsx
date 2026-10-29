"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { SectionShell } from "../../components/SectionShell";
import { useLanguage } from "../../components/LanguageProvider";
import { apiError, apiFetch, getAccessToken, sessionUser, SessionUser } from "../../lib/api";
import { mechanicalCatalog } from "../../lib/mechanicalCatalog";
import { QuickKind, QuickPick, QuickPicker } from "../../components/QuickPicker";
import { CheckInPhotos, DiagnosisPhoto, FuelGauge, PendingPhoto, SavedPhoto } from "../../components/CheckIn";

type Kind = "PART" | "MATERIAL" | "SERVICE";
type Line = { kind: Kind; description: string; oem_code: string; quantity: string; unit_price: string };
type Diagnosis = {
  id: string; diagnosis_number: string; status: "SENT" | "CONVERTED" | "REJECTED"; license_plate: string; work_type: string;
  mileage: number | null; complaint: string | null; findings: string | null; urgency: string; labor_hours: string; created_at: string;
  author_name: string; review_note: string | null; customer_name: string | null; case_number: string | null;
  estimate_number: string | null; estimate_id: string | null; estimate_status: string | null; fuel_level: number | null; photos: SavedPhoto[]; repair_case_id: string | null; vehicle: { make: string | null; model: string | null } | null;
  lines: { kind: Kind; description: string; oem_code: string | null; quantity: string; unit_price: string | null }[];
};
type Customer = { id: string; first_name?: string | null; last_name?: string | null; company_name?: string | null };

const emptyForm = { license_plate: "", work_type: "MECHANICAL", mileage: "", fuel_level: null as number | null, complaint: "", findings: "", urgency: "NORMAL", labor_hours: 0 };
const urgencies = [["LOW", "Bassa"], ["NORMAL", "Normale"], ["HIGH", "Urgente"]] as const;
const statusNames: Record<string, string> = { SENT: "Inviata all'ufficio", CONVERTED: "Preventivo creato", REJECTED: "Respinta" };
// Where the estimate made from my diagnosis stands with the customer.
const customerStage: Record<string, string> = {
  DRAFT: "🗂 L'ufficio sta preparando il preventivo",
  SENT: "⏳ Inviato al cliente, in attesa di risposta",
  APPROVED: "✅ Approvato: il lavoro è in «Il mio lavoro»",
  REJECTED: "✖ Il cliente ha rifiutato",
};
const kindNames: Record<Kind, string> = { PART: "Ricambio", MATERIAL: "Materiale", SERVICE: "Lavoro esterno" };
// Body shop quick picks: [part, hours].
const bodyQuick: [string, number][] = [
  ["Paraurti anteriore", 2], ["Paraurti posteriore", 2], ["Parafango anteriore", 2.5], ["Portiera", 3], ["Cofano", 2.5],
  ["Faro anteriore", 0.8], ["Specchietto retrovisore", 0.6], ["Parabrezza", 1.5], ["Verniciatura elemento", 2.5], ["Lucidatura", 1],
];
// Materials per area: a mechanic never sees body shop materials, and vice versa.
const materialQuick: Record<string, string[]> = {
  MECHANICAL: ["Olio motore", "Liquido freni", "Antigelo", "Grasso", "AdBlue", "Liquido lavavetri", "Sbloccante", "Detergente"],
  BODY: ["Stucco", "Primer", "Vernice", "Trasparente", "Carta abrasiva", "Nastro di mascheratura", "Diluente", "Detergente"],
};

/** When the diagnosis came in, e.g. "gio 29/10/2026 · 17:54". */
function entryDate(value: string) {
  const date = new Date(value);
  return `${date.toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })} · ${date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
}

function money(value: string | null) {
  return value ? Number(value).toLocaleString("it-IT", { style: "currency", currency: "EUR" }) : "—";
}

/** Quick diagnosis: the mechanic / body shop sends it, the office turns it into an estimate. */
export default function DiagnosiPage() {
  const { t } = useLanguage();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [lines, setLines] = useState<Line[]>([]);
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [savedPhotos, setSavedPhotos] = useState<SavedPhoto[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [list, setList] = useState<Diagnosis[]>([]);
  const [filter, setFilter] = useState<"SENT" | "CONVERTED" | "REJECTED" | "">("SENT");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [signedIn, setSignedIn] = useState(true);
  const [picking, setPicking] = useState<Diagnosis | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [custom, setCustom] = useState<{ id: string; name: string; kind: QuickKind; labor_hours: number; created_by: string | null }[]>([]);
  const manager = Boolean(user?.permissions.includes("estimate.create"));
  const area = user?.work_area ?? null;
  const workType = area || form.work_type;

  const load = useCallback(async () => {
    const response = await apiFetch(`/diagnoses${filter ? `?status=${filter}` : ""}`);
    if (response.ok) setList(await response.json());
  }, [filter]);

  useEffect(() => {
    if (!getAccessToken()) { setSignedIn(false); return; }
    setUser(sessionUser());
    const plate = new URLSearchParams(window.location.search).get("targa");
    if (plate) setForm((current) => ({ ...current, license_plate: plate.toUpperCase() }));
    const sync = () => setUser(sessionUser());
    window.addEventListener("nakama-session", sync);
    return () => window.removeEventListener("nakama-session", sync);
  }, []);
  useEffect(() => { if (getAccessToken()) void load(); }, [load]);

  useEffect(() => {
    if (!getAccessToken()) return;
    apiFetch("/quick-items").then(async (response) => { if (response.ok) setCustom(await response.json()); }).catch(() => undefined);
  }, []);

  // One searchable list: the workshop's own items first, then the built-in catalog and materials.
  const quickItems = useMemo<QuickPick[]>(() => {
    const catalog = workType === "BODY"
      ? [{ group: "Carrozzeria", icon: "🚗", items: bodyQuick.map(([name, hours]) => [name, "PART", hours] as [string, string, number]) }]
      : mechanicalCatalog;
    const own: QuickPick[] = custom.map((item) => ({
      key: `own-${item.id}`, id: item.id, name: item.name, kind: item.kind, hours: item.labor_hours, group: "Aggiunti dall'officina", icon: "⭐",
      deletable: manager || item.created_by === user?.id,
    }));
    const builtIn: QuickPick[] = catalog.flatMap((group) => group.items.map(([name, category, itemHours]) => ({
      key: `${group.group}-${name}`, name, kind: (category === "PART" ? "PART" : "SERVICE") as QuickKind, hours: itemHours, group: group.group, icon: group.icon,
    })));
    const materials: QuickPick[] = (materialQuick[workType] ?? materialQuick.MECHANICAL).map((name) => ({ key: `mat-${name}`, name, kind: "MATERIAL", hours: 0, group: "Materiali", icon: "🧴" }));
    return [...own, ...builtIn, ...materials];
  }, [workType, custom, manager, user]);

  async function createQuick(name: string, kind: QuickKind, itemHours: number): Promise<QuickPick | null> {
    const response = await apiFetch("/quick-items", { method: "POST", body: JSON.stringify({ name, kind, labor_hours: itemHours }) });
    if (!response.ok) { setMessage(await apiError(response, "Impossibile salvare l'elemento.")); return null; }
    const item = await response.json();
    setCustom((current) => [...current.filter((x) => x.id !== item.id), item].sort((a, b) => a.name.localeCompare(b.name)));
    return { key: `own-${item.id}`, id: item.id, name: item.name, kind: item.kind, hours: item.labor_hours, group: "Aggiunti dall'officina", icon: "⭐" };
  }

  async function deleteQuick(item: QuickPick) {
    if (!item.id || !window.confirm(t("Togliere «{name}» dalla lista?").replace("{name}", item.name))) return;
    const response = await apiFetch(`/quick-items/${item.id}`, { method: "DELETE" });
    if (response.ok || response.status === 404) setCustom((current) => current.filter((x) => x.id !== item.id));
    else setMessage(await apiError(response, "Impossibile eliminare."));
  }

  function addLine(kind: Kind, description = "", hours = 0) {
    setLines((current) => [...current, { kind, description, oem_code: "", quantity: "1", unit_price: "" }]);
    if (hours) setForm((current) => ({ ...current, labor_hours: Math.round((current.labor_hours + hours) * 10) / 10 }));
  }
  const setLine = (index: number, change: Partial<Line>) => setLines((current) => current.map((line, i) => (i === index ? { ...line, ...change } : line)));
  const hours = (delta: number) => setForm((current) => ({ ...current, labor_hours: Math.max(0, Math.round((current.labor_hours + delta) * 10) / 10) }));

  function clearPending() {
    setPendingPhotos((current) => { current.forEach((photo) => URL.revokeObjectURL(photo.url)); return []; });
  }

  function reset() {
    setForm(emptyForm); setLines([]); setEditing(null); setSavedPhotos([]); clearPending();
  }

  /** Upload the new photos once the diagnosis exists; returns how many failed. */
  async function uploadPhotos(diagnosisId: string) {
    let failed = 0;
    for (const photo of pendingPhotos) {
      const params = new URLSearchParams({ category: photo.category, filename: photo.file.name.slice(0, 200) });
      const response = await apiFetch(`/diagnoses/${diagnosisId}/photos?${params}`, {
        method: "POST", headers: { "Content-Type": photo.file.type || "application/octet-stream" }, body: photo.file,
      }).catch(() => null);
      if (!response?.ok) failed += 1;
    }
    return failed;
  }

  async function removeSavedPhoto(photo: SavedPhoto) {
    if (!editing || !window.confirm(t("Eliminare questa foto?"))) return;
    const response = await apiFetch(`/diagnoses/${editing}/photos/${photo.id}`, { method: "DELETE" });
    if (response.ok || response.status === 404) setSavedPhotos((current) => current.filter((x) => x.id !== photo.id));
    else setMessage(await apiError(response, "Impossibile eliminare la foto."));
  }

  function edit(item: Diagnosis) {
    setEditing(item.id);
    setForm({
      license_plate: item.license_plate, work_type: item.work_type, mileage: item.mileage ? String(item.mileage) : "", fuel_level: item.fuel_level,
      complaint: item.complaint || "", findings: item.findings || "", urgency: item.urgency, labor_hours: Number(item.labor_hours),
    });
    setLines(item.lines.map((line) => ({ kind: line.kind, description: line.description, oem_code: line.oem_code || "", quantity: String(Number(line.quantity)), unit_price: line.unit_price ? String(Number(line.unit_price)) : "" })));
    setSavedPhotos(item.photos || []);
    clearPending();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    if (sending) return;
    setSending(true); setMessage("");
    try {
      const body = {
        license_plate: form.license_plate, work_type: workType, mileage: form.mileage ? Number(form.mileage) : null, fuel_level: form.fuel_level,
        complaint: form.complaint, findings: form.findings, urgency: form.urgency, labor_hours: String(form.labor_hours),
        lines: lines.filter((line) => line.description.trim()).map((line) => ({
          kind: line.kind, description: line.description.trim(), oem_code: line.oem_code.trim() || null,
          quantity: line.quantity || "1", unit_price: line.unit_price ? line.unit_price.replace(",", ".") : null,
        })),
      };
      const response = await apiFetch(editing ? `/diagnoses/${editing}` : "/diagnoses", { method: editing ? "PUT" : "POST", body: JSON.stringify(body) });
      if (!response.ok) { setMessage(await apiError(response, "Impossibile inviare la diagnosi.")); return; }
      const saved: Diagnosis = await response.json();
      const failed = pendingPhotos.length ? await uploadPhotos(saved.id) : 0;
      setMessage(`${t(editing ? "Diagnosi aggiornata" : "Diagnosi inviata all'ufficio")}: ${saved.diagnosis_number}${failed ? ` · ${t("{n} foto non caricate").replace("{n}", String(failed))}` : ""}`);
      reset();
      setFilter("SENT");
      void load();
    } finally { setSending(false); }
  }

  async function remove(item: Diagnosis) {
    if (!window.confirm(t("Eliminare questa diagnosi?"))) return;
    const response = await apiFetch(`/diagnoses/${item.id}`, { method: "DELETE" });
    if (response.ok || response.status === 404) { if (editing === item.id) reset(); void load(); }
    else setMessage(await apiError(response, "Impossibile eliminare la diagnosi."));
  }

  async function toEstimate(item: Diagnosis, customerId?: string) {
    setMessage("");
    const response = await apiFetch(`/diagnoses/${item.id}/estimate`, { method: "POST", body: JSON.stringify(customerId ? { customer_id: customerId } : {}) });
    if (response.status === 409) {
      const data = await response.json().catch(() => ({}));
      if (data?.detail?.needs_customer) { setPicking(item); setCustomerQuery(""); setCustomers([]); return; }
    }
    if (!response.ok) { setMessage(await apiError(response, "Impossibile creare il preventivo.")); return; }
    const created = await response.json();
    setPicking(null);
    window.location.assign(`/preventivi?id=${created.estimate_id}`);
  }

  async function reject(item: Diagnosis) {
    const note = window.prompt(t("Motivo (facoltativo)")) ?? null;
    if (note === null) return;
    const response = await apiFetch(`/diagnoses/${item.id}/reject`, { method: "POST", body: JSON.stringify({ note }) });
    if (response.ok) { if (editing === item.id) reset(); void load(); }
    else setMessage(await apiError(response, "Impossibile segnare la diagnosi come rifiutata."));
  }

  useEffect(() => {
    if (!picking || customerQuery.trim().length < 2) { setCustomers([]); return; }
    const timer = window.setTimeout(() => {
      apiFetch(`/customers?q=${encodeURIComponent(customerQuery.trim())}&limit=8`).then(async (response) => {
        if (response.ok) setCustomers(await response.json());
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [customerQuery, picking]);

  const customerName = (c: Customer) => c.company_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || t("Cliente");

  if (!signedIn) return <SectionShell title="Diagnosi" eyebrow="OFFICINA"><div className="empty-state"><a href="/login">{t("Accedi")}</a></div></SectionShell>;

  return (
    <SectionShell title="Diagnosi" eyebrow="OFFICINA">
      <form className="panel diagnosis-form" onSubmit={send}>
        <div className="panel-head"><div>
          <h2>{editing ? t("Modifica diagnosi") : t("Nuova diagnosi rapida")}</h2>
          <p>{t("Targa, ore, ricambi e materiali: arriva all'ufficio per fare il preventivo.")}</p>
        </div></div>
        <div className="diagnosis-grid">
          <label className="plate-field">{t("Targa")}
            <input required value={form.license_plate} autoCapitalize="characters" autoComplete="off" placeholder="AB123CD"
              onChange={(e) => setForm({ ...form, license_plate: e.target.value.toUpperCase().replace(/[^A-Z0-9 ]/g, "") })} />
          </label>
          <label>{t("Km")}<input inputMode="numeric" value={form.mileage} onChange={(e) => setForm({ ...form, mileage: e.target.value.replace(/\D/g, "") })} /></label>
          {!area && (
            <div className="chip-field"><span>{t("Tipo di lavoro")}</span>
              <div className="choice-chips">
                {[["MECHANICAL", "Meccanica"], ["BODY", "Carrozzeria"]].map(([code, name]) => (
                  <button type="button" key={code} className={form.work_type === code ? "active" : ""} onClick={() => setForm({ ...form, work_type: code })}>{t(name)}</button>
                ))}
              </div>
            </div>
          )}
          <div className="chip-field"><span>{t("Urgenza")}</span>
            <div className="choice-chips">
              {urgencies.map(([code, name]) => (
                <button type="button" key={code} className={`${form.urgency === code ? "active" : ""} urgency-${code.toLowerCase()}`} onClick={() => setForm({ ...form, urgency: code })}>{t(name)}</button>
              ))}
            </div>
          </div>
          <label className="span-all">{t("Problema segnalato")}<textarea rows={2} value={form.complaint} onChange={(e) => setForm({ ...form, complaint: e.target.value })} placeholder={t("Es. rumore in frenata, spia motore accesa…")} /></label>
          <label className="span-all">{t("Diagnosi")}<textarea rows={3} value={form.findings} onChange={(e) => setForm({ ...form, findings: e.target.value })} placeholder={t("Cosa hai trovato e cosa va fatto")} /></label>
        </div>

        <FuelGauge value={form.fuel_level} onChange={(fuel_level) => setForm((current) => ({ ...current, fuel_level }))} />
        <CheckInPhotos
          pending={pendingPhotos}
          onAdd={(photos) => setPendingPhotos((current) => [...current, ...photos].slice(0, 20))}
          onRemovePending={(key) => setPendingPhotos((current) => current.filter((photo) => { if (photo.key === key) URL.revokeObjectURL(photo.url); return photo.key !== key; }))}
          saved={savedPhotos}
          diagnosisId={editing}
          onRemoveSaved={removeSavedPhoto}
        />

        <div className="hours-stepper" role="group" aria-label={t("Ore di lavoro")}>
          <span>{t("Ore di lavoro")}</span>
          <button type="button" onClick={() => hours(-0.5)} aria-label="-0,5">−</button>
          <strong>{form.labor_hours.toLocaleString("it-IT")} h</strong>
          <button type="button" onClick={() => hours(0.5)} aria-label="+0,5">＋</button>
          {[1, 2, 4].map((value) => <button type="button" key={value} className="ghost" onClick={() => hours(value)}>+{value} h</button>)}
          {form.labor_hours > 0 && <button type="button" className="ghost" onClick={() => setForm({ ...form, labor_hours: 0 })}>{t("Azzera")}</button>}
        </div>

        <div className="quick-parts">
          <p className="quick-parts-title"><strong>{t("Aggiunta rapida")}</strong> · {t("cerca e tocca per aggiungere (somma anche le ore)")}</p>
          <QuickPicker items={quickItems} onPick={(item) => addLine(item.kind, item.name, item.hours)} onCreate={createQuick} onDelete={deleteQuick} />
        </div>

        <div className="diagnosis-lines">
          {lines.map((line, index) => (
            <div className="diagnosis-line" key={index}>
              <select value={line.kind} onChange={(e) => setLine(index, { kind: e.target.value as Kind })} aria-label={t("Tipo")}>
                {(Object.keys(kindNames) as Kind[]).map((kind) => <option key={kind} value={kind}>{t(kindNames[kind])}</option>)}
              </select>
              <input value={line.description} onChange={(e) => setLine(index, { description: e.target.value })} placeholder={t("Descrizione")} aria-label={t("Descrizione")} />
              <input className="qty" inputMode="decimal" value={line.quantity} onChange={(e) => setLine(index, { quantity: e.target.value.replace(/[^\d.,]/g, "").replace(",", ".") })} aria-label={t("Q.tà")} />
              <input className="code" value={line.oem_code} onChange={(e) => setLine(index, { oem_code: e.target.value })} placeholder={t("Codice")} aria-label={t("Codice")} />
              <input className="price" inputMode="decimal" value={line.unit_price} onChange={(e) => setLine(index, { unit_price: e.target.value.replace(/[^\d.,]/g, "") })} placeholder="€" aria-label={t("Prezzo (se lo sai)")} />
              <button type="button" className="ghost" aria-label={t("Elimina")} onClick={() => setLines(lines.filter((_, i) => i !== index))}>✕</button>
            </div>
          ))}
          <div className="choice-chips">
            <button type="button" onClick={() => addLine("PART")}>＋ {t("Ricambio")}</button>
            <button type="button" onClick={() => addLine("MATERIAL")}>＋ {t("Materiale")}</button>
            <button type="button" onClick={() => addLine("SERVICE")}>＋ {t("Lavoro esterno")}</button>
          </div>
        </div>

        {message && <p className="hint" role="status">{message}</p>}
        <div className="record-form-actions">
          {editing && <button type="button" className="ghost" onClick={reset}>{t("Annulla")}</button>}
          <button className="primary big-action" disabled={sending || !form.license_plate.trim()}>{sending ? t("Invio…") : editing ? t("Salva modifiche") : t("Invia all'ufficio")}</button>
        </div>
      </form>

      <section className="panel list-panel">
        <div className="panel-head"><div><h2>{manager ? t("Diagnosi ricevute") : t("Le mie diagnosi")}</h2></div>
          <div className="choice-chips">
            {([["SENT", "In attesa"], ["CONVERTED", "Preventivo creato"], ["REJECTED", "Respinte"], ["", "Tutte"]] as const).map(([code, name]) => (
              <button type="button" key={code || "all"} className={filter === code ? "active" : ""} onClick={() => setFilter(code)}>{t(name)}</button>
            ))}
          </div>
        </div>
        {list.length === 0 ? <div className="empty-state">{t("Nessuna diagnosi.")}</div> : list.map((item) => (
          <article key={item.id} className={`diagnosis-card status-${item.status.toLowerCase()} urgency-${item.urgency.toLowerCase()}`}>
            <header>
              <strong className="reg-plate">{item.license_plate}</strong>
              <span>{[item.vehicle?.make, item.vehicle?.model].filter(Boolean).join(" ")}{item.customer_name ? ` · ${item.customer_name}` : ""}</span>
              <span className="status-chip">{t(statusNames[item.status])}</span>
            </header>
            <p className="diagnosis-entry">📅 {t("Ingresso")}: <b>{entryDate(item.created_at)}</b></p>
            <p className="diagnosis-meta">{item.diagnosis_number} · {item.author_name} · {t(item.work_type === "BODY" ? "Carrozzeria" : "Meccanica")}{item.urgency === "HIGH" ? ` · ⚠️ ${t("Urgente")}` : ""}</p>
            {item.complaint && <p><b>{t("Problema")}:</b> {item.complaint}</p>}
            {item.findings && <p><b>{t("Diagnosi")}:</b> {item.findings}</p>}
            {item.fuel_level != null && (
              <p className="diagnosis-fuel">⛽ {t("Carburante all'arrivo")}: <span className="fuel-bar mini" aria-hidden="true"><span style={{ width: `${item.fuel_level}%`, background: item.fuel_level <= 15 ? "#d93025" : item.fuel_level <= 35 ? "#e0a100" : "#1e9e5a" }} /></span> <b>{item.fuel_level}%</b></p>
            )}
            {item.photos?.length > 0 && (
              <div className="checkin-grid small">{item.photos.map((photo) => <DiagnosisPhoto key={photo.id} diagnosisId={item.id} photo={photo} />)}</div>
            )}
            <ul className="diagnosis-items">
              {Number(item.labor_hours) > 0 && <li>🛠 {t("Manodopera")}: {Number(item.labor_hours).toLocaleString("it-IT")} h</li>}
              {item.lines.map((line, index) => <li key={index}>{line.kind === "PART" ? "⚙️" : line.kind === "MATERIAL" ? "🧴" : "🔧"} {Number(line.quantity)} × {line.description}{line.oem_code ? ` (${line.oem_code})` : ""}{line.unit_price ? ` · ${money(line.unit_price)}` : ""}</li>)}
            </ul>
            {item.review_note && <p className="hint">{t("Nota dell'ufficio")}: {item.review_note}</p>}
            {item.estimate_status && customerStage[item.estimate_status] && <p className={`customer-stage stage-${item.estimate_status.toLowerCase()}`}>{t(customerStage[item.estimate_status])}</p>}
            {item.estimate_number && <p className="hint">{t("Preventivo")} {item.estimate_number}{item.case_number ? ` · ${t("Pratica")} ${item.case_number}` : ""}</p>}
            <div className="table-actions">
              {item.status === "SENT" && manager && <button className="primary" onClick={() => toEstimate(item)}>€ {t("Crea preventivo")}</button>}
              {item.status === "SENT" && <button className="secondary" onClick={() => edit(item)}>{t("Modifica")}</button>}
              {item.status === "SENT" && <button className="tone-button rejected" onClick={() => reject(item)}>✖ {t("Rifiutata")}</button>}
              {!item.estimate_id && item.status !== "CONVERTED" && <button className="ghost" onClick={() => remove(item)}>🗑 {t("Elimina")}</button>}
              {item.estimate_id && manager && <a className="secondary link-button" href={`/preventivi?id=${item.estimate_id}`}>{t("Apri preventivo")}</a>}
            </div>
            {picking?.id === item.id && (
              <div className="customer-pick">
                <p>{t("Veicolo nuovo: a quale cliente appartiene?")}</p>
                <input autoFocus value={customerQuery} onChange={(e) => setCustomerQuery(e.target.value)} placeholder={t("Cerca cliente per nome o azienda")} />
                <div className="choice-chips">
                  {customers.map((customer) => <button type="button" key={customer.id} onClick={() => toEstimate(item, customer.id)}>{customerName(customer)}</button>)}
                </div>
                <p className="hint">{t("Se il cliente non esiste, crealo in Clienti e poi torna qui.")}</p>
              </div>
            )}
          </article>
        ))}
      </section>
    </SectionShell>
  );
}
