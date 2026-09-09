"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { SectionShell } from "../../components/SectionShell";
import { apiFetch, getAccessToken } from "../../lib/api";

type Worker = { id: string; email: string; first_name: string; last_name: string; status: string; role_codes: string[] };
const profiles = [
  { code: "RECEPTION", name: "Accettazione", description: "Clienti, veicoli, pratiche e creazione preventivi." },
  { code: "BODYSHOP", name: "Carrozzeria", description: "Consultazione pratiche e preventivi, aggiornamento lavorazioni." },
  { code: "PAINTER", name: "Verniciatura", description: "Consultazione pratiche e aggiornamento lavorazioni in officina." },
  { code: "MECHANIC", name: "Meccanica", description: "Consultazione pratiche e aggiornamento lavorazioni in officina." },
  { code: "ACCOUNTING", name: "Contabilità", description: "Clienti, consultazione preventivi e creazione fatture." },
  { code: "ADMIN", name: "Amministrazione", description: "Accesso completo, gestione personale e impostazioni." },
];
const emptyForm = { first_name: "", last_name: "", email: "", password: "", role_code: "RECEPTION" };

export default function PersonalePage() {
  const [users, setUsers] = useState<Worker[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [access, setAccess] = useState<"loading" | "login" | "denied" | "allowed" | "error">("loading");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
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
      setSuccess(`Account creato per ${worker.first_name} ${worker.last_name}. Può accedere con la propria email e la password assegnata. Nessuna email è stata inviata.`);
    } catch (err) { setError(err instanceof Error ? err.message : "Impossibile creare l’account."); }
    finally { setSaving(false); }
  }
  const filtered = users.filter(user => `${user.first_name} ${user.last_name} ${user.email}`.toLowerCase().includes(search.toLowerCase()));
  return <SectionShell title="Personale" eyebrow="ACCOUNT E PROFILI DI ACCESSO">
    {access === "loading" && <div className="empty-state">Caricamento personale…</div>}
    {access === "login" && <div className="empty-state">Accedi come amministratore per gestire i lavoratori. <a href="/login">Accedi</a></div>}
    {access === "denied" && <div className="empty-state">Il tuo profilo non consente di gestire il personale. Rivolgiti all’amministratore.</div>}
    {access === "error" && <div className="empty-state" role="alert">{error} <button onClick={() => { setError(""); setAccess("loading"); void load(); }}>Riprova</button></div>}
    {access === "allowed" && <>
      <div className="settings-grid">
        <section className="panel settings-card"><div className="panel-head"><div><h2>Nuovo lavoratore</h2><p>Crea un account personale per accedere alla carrozzeria.</p></div></div>
          <form className="settings-body user-form staff-form" onSubmit={createWorker}>
            <label>Nome<input required maxLength={120} autoComplete="given-name" value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} /></label>
            <label>Cognome<input required maxLength={120} autoComplete="family-name" value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} /></label>
            <label className="span-2">Email<input required type="email" autoComplete="off" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
            <label className="span-2">Password<input required type="password" minLength={10} autoComplete="new-password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /><small>Almeno 10 caratteri. Comunicala direttamente al lavoratore.</small></label>
            <label className="span-2">Profilo di accesso<select value={form.role_code} onChange={e => setForm({ ...form, role_code: e.target.value })}>{profiles.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}</select><small>{profiles.find(p => p.code === form.role_code)?.description}</small></label>
            {error && <p className="auth-error span-2" role="alert">{error}</p>}
            {success && <p className="staff-success span-2" role="status">{success}</p>}
            <button className="primary span-2" disabled={saving}>{saving ? "Creazione…" : "Crea account lavoratore"}</button>
          </form>
        </section>
        <section className="panel settings-card"><div className="panel-head"><div><h2>Profili disponibili</h2><p>Ogni lavoratore accede con i permessi del profilo assegnato.</p></div></div><div className="settings-body staff-profiles">{profiles.map(p => <div key={p.code}><strong>{p.name}</strong><p>{p.description}</p></div>)}</div></section>
      </div>
      <section className="panel settings-users"><div className="panel-head"><div><h2>Lavoratori · {users.length}</h2><p>Account della tua carrozzeria.</p></div><label className="staff-search">Cerca lavoratore<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Nome o email" /></label></div>
        <div className="staff-list">{filtered.length === 0 ? <p className="empty-state">Nessun lavoratore trovato.</p> : filtered.map(user => <article className="staff-row" key={user.id}><div><strong>{user.first_name} {user.last_name}</strong><p>{user.email}</p></div><span>{user.role_codes.map(code => profiles.find(p => p.code === code)?.name || code).join(", ")}</span><span className="status-chip">{user.status === "ACTIVE" ? "Attivo" : user.status === "DISABLED" ? "Disabilitato" : "Invitato"}</span></article>)}</div>
      </section>
    </>}
  </SectionShell>;
}
