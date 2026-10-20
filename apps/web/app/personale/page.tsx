"use client";

import { ItemIcon } from "../../components/ItemIcon";

import { useLanguage } from "../../components/LanguageProvider";

import { PasswordInput } from "../../components/PasswordInput";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { SectionShell } from "../../components/SectionShell";
import { apiError, apiFetch, getAccessToken, sessionUser } from "../../lib/api";

type Worker = { id: string; email: string; first_name: string; last_name: string; status: string; role_codes: string[]; work_area?: string | null };
type StaffProfile = { profile: Record<string, string | null> };
const profileLabels: [string, string][] = [
  ["phone", "Telefono"], ["birth_date", "Data di nascita"], ["tax_code", "Codice fiscale"], ["address", "Indirizzo"], ["city", "Città"],
  ["postal_code", "CAP"], ["emergency_contact", "Contatto di emergenza"], ["emergency_phone", "Telefono di emergenza"], ["skills", "Competenze"], ["notes", "Note"],
];
const profiles = [
  { code: "RECEPTION", name: "Accettazione", description: "Clienti, veicoli, pratiche e creazione preventivi." },
  { code: "BODYSHOP", name: "Carrozzeria", description: "Area carrozzeria: vede solo i veicoli e i lavori di carrozzeria, invia diagnosi e spunta i lavori fatti." },
  { code: "PAINTER", name: "Verniciatura", description: "Area carrozzeria: vede solo i lavori di carrozzeria e verniciatura, invia diagnosi e spunta i lavori fatti." },
  { code: "MECHANIC", name: "Meccanica", description: "Area meccanica: vede solo i veicoli e i lavori di meccanica, invia diagnosi e spunta i lavori fatti." },
  { code: "ACCOUNTING", name: "Contabilità", description: "Clienti, consultazione preventivi e creazione fatture." },
  { code: "ADMIN", name: "Amministrazione", description: "Accesso completo, gestione personale e impostazioni." },
];
const emptyForm = { first_name: "", last_name: "", email: "", password: "", role_code: "RECEPTION" };

export default function PersonalePage() {
  const { t } = useLanguage();
  const [users, setUsers] = useState<Worker[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [access, setAccess] = useState<"loading" | "login" | "denied" | "allowed" | "error">("loading");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [listError, setListError] = useState("");
  const [me, setMe] = useState<string | undefined>();
  useEffect(() => { setMe(sessionUser()?.id); }, []);
  const load = useCallback(async () => {
    if (!getAccessToken()) { setAccess("login"); return; }
    try {
      const response = await apiFetch("/users");
      if (response.status === 401) { setAccess("login"); return; }
      if (response.status === 403) { setAccess("denied"); return; }
      if (!response.ok) throw new Error("Impossibile caricare il personale. Riprova.");
      setUsers(await response.json());
      setAccess("allowed");
    } catch { setAccess("error"); setError("Impossibile caricare il personale. Controlla la connessione e riprova."); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function createWorker(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      const response = await apiFetch("/users", { method: "POST", body: JSON.stringify({ ...form, first_name: form.first_name.trim(), last_name: form.last_name.trim(), email: form.email.trim() }) });
      if (!response.ok) {
        if (response.status === 401) { setAccess("login"); return; }
        if (response.status === 403) { setAccess("denied"); return; }
        if (response.status === 409) throw new Error("Questa email è già associata a un account.");
        if (response.status === 422) throw new Error("Controlla i dati: nome, cognome, email valida e password di almeno 10 caratteri.");
        throw new Error("Impossibile creare l’account. Riprova.");
      }
      const worker: Worker = await response.json();
      setUsers(previous => [...previous, worker]);
      setForm(emptyForm);
      setSuccess(`${worker.first_name} ${worker.last_name}`);
    } catch (err) { setError(err instanceof Error ? err.message : "Impossibile creare l’account."); }
    finally { setSaving(false); }
  }
  const [opened, setOpened] = useState<string | null>(null);
  const [sheet, setSheet] = useState<StaffProfile | null>(null);
  async function changeArea(user: Worker, area: string) {
    const response = await apiFetch(`/users/${user.id}/area`, { method: "PUT", body: JSON.stringify({ work_area: area }) });
    if (response.ok) {
      const data = await response.json();
      setUsers(previous => previous.map(item => item.id === user.id ? { ...item, work_area: data.work_area } : item));
    }
  }
  async function openSheet(user: Worker) {
    if (opened === user.id) { setOpened(null); return; }
    setOpened(user.id); setSheet(null);
    const response = await apiFetch(`/users/${user.id}/profile`);
    if (response.ok) setSheet(await response.json());
  }
  async function removeWorker(user: Worker) {
    const name = `${user.first_name} ${user.last_name}`.trim();
    if (!window.confirm(`${t("Eliminare l’account di")} ${name} (${user.email})? ${t("Non potrà più accedere. Il lavoro già registrato resta. L’operazione non si può annullare.")}`)) return;
    setListError("");
    const response = await apiFetch(`/users/${user.id}`, { method: "DELETE" });
    if (!response.ok && response.status !== 404) { setListError(await apiError(response, "Impossibile eliminare l’account.")); return; }
    setUsers(previous => previous.filter(item => item.id !== user.id));
    if (opened === user.id) setOpened(null);
  }
  const isWorkshop = (user: Worker) => user.role_codes.some(code => ["MECHANIC", "BODYSHOP", "PAINTER"].includes(code));
  const filtered = users.filter(user => `${user.first_name} ${user.last_name} ${user.email}`.toLowerCase().includes(search.toLowerCase()));
  return <SectionShell title={t("Personale")} eyebrow={t("ACCOUNT E PROFILI DI ACCESSO")}>
    {access === "loading" && <div className="empty-state">{t("Caricamento personale…")}</div>}
    {access === "login" && <div className="empty-state">{t("Accedi come amministratore per gestire i lavoratori.")} <a href="/login">{t("Accedi")}</a></div>}
    {access === "denied" && <div className="empty-state">{t("Il tuo profilo non consente di gestire il personale. Rivolgiti all’amministratore.")}</div>}
    {access === "error" && <div className="empty-state" role="alert">{t(error)} <button onClick={() => { setError(""); setAccess("loading"); void load(); }}>{t("Riprova")}</button></div>}
    {access === "allowed" && <>
      <div className="settings-grid">
        <section className="panel settings-card"><div className="panel-head"><div><h2>{t("Nuovo lavoratore")}</h2><p>{t("Crea un account personale per accedere alla carrozzeria.")}</p></div></div>
          <form className="settings-body user-form staff-form" onSubmit={createWorker}>
            <label>{t("Nome")}<input required maxLength={120} autoComplete="given-name" value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} /></label>
            <label>{t("Cognome")}<input required maxLength={120} autoComplete="family-name" value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} /></label>
            <label className="span-2">{t("Email")}<input required type="email" autoComplete="off" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
            <label className="span-2">{t("Password")}<PasswordInput required  minLength={10} autoComplete="new-password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /><small>{t("Almeno 10 caratteri. Comunicala direttamente al lavoratore.")}</small></label>
            <label className="span-2">{t("Profilo di accesso")}<select value={form.role_code} onChange={e => setForm({ ...form, role_code: e.target.value })}>{profiles.map(p => <option key={p.code} value={p.code}>{t(p.name)}</option>)}</select><small className="staff-selected-profile"><ItemIcon name={form.role_code} /><span>{t(profiles.find(p => p.code === form.role_code)?.description)}</span></small></label>
            {error && <p className="auth-error span-2" role="alert">{t(error)}</p>}
            {success && <p className="staff-success span-2" role="status">{t("Account creato per {name}. Può accedere con la propria email e la password assegnata. Nessuna email è stata inviata.").replace("{name}", success)}</p>}
            <button className="primary span-2" disabled={saving}>{saving ? t("Creazione…") : t("Crea account lavoratore")}</button>
          </form>
        </section>
        <section className="panel settings-card"><div className="panel-head"><div><h2>{t("Profili disponibili")}</h2><p>{t("Ogni lavoratore accede con i permessi del profilo assegnato.")}</p></div></div><div className="settings-body staff-profiles">{profiles.map(p => <div key={p.code} className="staff-profile-item"><span className="staff-profile-icon"><ItemIcon name={p.code} /></span><div><strong>{t(p.name)}</strong><p>{t(p.description)}</p></div></div>)}</div></section>
      </div>
      <section className="panel settings-users"><div className="panel-head"><div><h2>{t("Lavoratori ·")} {users.length}</h2><p>{t("Account della tua carrozzeria.")}</p></div><label className="staff-search">{t("Cerca lavoratore")}<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder={t("Nome o email")} /></label></div>
        {listError && <p className="auth-error" role="alert">{t(listError)}</p>}
        <div className="staff-list">{filtered.length === 0 ? <p className="empty-state">{t("Nessun lavoratore trovato.")}</p> : filtered.map(user => <article className="staff-row" key={user.id}><div><strong>{user.first_name} {user.last_name}</strong><p>{user.email}</p></div><span className="staff-role-list">{user.role_codes.map(code => <span className="staff-role" key={code}><ItemIcon name={code} /><span>{t(profiles.find(p => p.code === code)?.name || code)}</span></span>)}</span><span className="status-chip">{user.status === "ACTIVE" ? t("Attivo") : user.status === "DISABLED" ? t("Disabilitato") : t("Invitato")}</span>
          {isWorkshop(user) && <label className="staff-area">{t("Area")}<select value={user.work_area || "ALL"} onChange={e => changeArea(user, e.target.value)}><option value="MECHANICAL">{t("Meccanica")}</option><option value="BODY">{t("Carrozzeria")}</option><option value="ALL">{t("Entrambe")}</option></select></label>}
          <button type="button" className="ghost" aria-expanded={opened === user.id} onClick={() => openSheet(user)}>{t("Scheda")}</button>
          {user.id !== me && <button type="button" className="ghost record-delete" onClick={() => removeWorker(user)}>{t("Elimina")}</button>}
          {opened === user.id && <div className="staff-sheet">{!sheet ? <p className="hint">{t("Caricamento…")}</p> : <dl>{profileLabels.map(([key, label]) => <div key={key}><dt>{t(label)}</dt><dd>{sheet.profile[key] || "—"}</dd></div>)}</dl>}</div>}
        </article>)}</div>
      </section>
    </>}
  </SectionShell>;
}
