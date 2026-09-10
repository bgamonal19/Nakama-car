"use client";

import { FormEvent, useState } from "react";
import { apiFetch, clearSession, getAccessToken } from "../lib/api";
import { PasswordInput } from "./PasswordInput";

export type EditableUser = { id: string; email: string; first_name: string; last_name: string; status: string; role_codes: string[] };
const roles = [
  ["ADMIN", "Amministrazione"], ["RECEPTION", "Accettazione"], ["BODYSHOP", "Carrozzeria"],
  ["PAINTER", "Verniciatura"], ["MECHANIC", "Meccanica"], ["ACCOUNTING", "Contabilità"],
];

export function UserEditor({ user, onSaved, onCancel }: { user: EditableUser; onSaved: (user: EditableUser) => void; onCancel: () => void }) {
  const [form, setForm] = useState({ first_name: user.first_name, last_name: user.last_name, email: user.email, role_code: user.role_codes[0] || "RECEPTION", password: "" });
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reauthenticate, setReauthenticate] = useState(false);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setError("");
    if (form.password !== confirmation) { setError("Le password non coincidono."); return; }
    setSaving(true);
    try {
      const response = await apiFetch(`/users/${user.id}`, { method: "PATCH", body: JSON.stringify({ ...form, password: form.password || undefined }) });
      if (!response.ok) {
        if (response.status === 401) throw new Error("Sessione scaduta. Accedi nuovamente.");
        if (response.status === 403) throw new Error("Non hai i permessi per modificare gli utenti.");
        if (response.status === 422) throw new Error("Controlla nome, cognome, email e password (almeno 10 caratteri).");
        const body = await response.json().catch(() => ({}));
        throw new Error(typeof body.detail === "string" ? body.detail : "Impossibile salvare le modifiche.");
      }
      const updated: EditableUser = await response.json();
      // A successful edit may invalidate this administrator's own session.
      const token = getAccessToken();
      let ownAccount = false;
      try { ownAccount = JSON.parse(atob((token || "").split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).sub === user.id; } catch { /* The API remains authoritative. */ }
      const changedAccess = !!form.password || updated.email !== user.email || updated.role_codes.join() !== user.role_codes.join();
      if (ownAccount && changedAccess) {
        clearSession(); setReauthenticate(true); setForm(previous => ({ ...previous, password: "" })); setConfirmation("");
      } else { onSaved(updated); }
    } catch (err) { setError(err instanceof Error ? err.message : "Errore di connessione. Riprova."); }
    finally { setSaving(false); }
  }
  return <section className="panel user-editor" aria-label="Modifica utente">
    <div className="panel-head"><div><h2>Modifica utente</h2><p>{user.first_name} {user.last_name} · {user.email}</p></div></div>
    {reauthenticate ? <div className="settings-body" role="status"><p>Modifiche salvate. Accedi nuovamente con le credenziali aggiornate.</p><a className="primary link-button" href="/login">Accedi</a></div> : <form className="settings-body user-form staff-form" onSubmit={save}>
      <label>Nome<input required maxLength={120} value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} /></label>
      <label>Cognome<input required maxLength={120} value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} /></label>
      <label className="span-2">Email<input required type="email" autoComplete="off" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></label>
      <label className="span-2">Profilo<select value={form.role_code} onChange={e => setForm({ ...form, role_code: e.target.value })}>{roles.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
      <label>Nuova password<PasswordInput minLength={10} autoComplete="new-password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} /></label>
      <label>Conferma nuova password<PasswordInput minLength={10} autoComplete="new-password" value={confirmation} onChange={e => setConfirmation(e.target.value)} /></label>
      <p className="span-2">Lascia vuoti i campi password per mantenere quella attuale. Cambiando email, password o profilo, l’utente dovrà accedere nuovamente.</p>
      {error && <div role="alert" className="auth-error span-2">{error}</div>}
      <button className="primary" disabled={saving}>{saving ? "Salvataggio…" : "Salva modifiche"}</button>
      <button type="button" className="ghost" disabled={saving} onClick={onCancel}>Annulla</button>
    </form>}
  </section>;
}
