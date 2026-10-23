"use client";

import { FormEvent, useEffect, useState } from "react";
import { SectionShell } from "../../components/SectionShell";
import { useLanguage } from "../../components/LanguageProvider";
import { apiError, apiFetch, clearSession, getAccessToken } from "../../lib/api";

type Profile = {
  phone: string | null; emergency_contact: string | null; emergency_phone: string | null; skills: string | null; notes: string | null;
};
type Me = { first_name: string; last_name: string; email: string; roles: string[]; work_area: string | null; profile: Profile };

const roleNames: Record<string, string> = {
  ADMIN: "Amministrazione", RECEPTION: "Accettazione", BODYSHOP: "Carrozzeria", PAINTER: "Verniciatura", MECHANIC: "Meccanica", ACCOUNTING: "Contabilità",
};
const areaNames: Record<string, string> = { MECHANICAL: "Meccanica", BODY: "Carrozzeria" };
const empty: Profile = { phone: "", emergency_contact: "", emergency_phone: "", skills: "", notes: "" };

/** Each user keeps their own personal details up to date. */
export default function ProfiloPage() {
  const { t } = useLanguage();
  const [me, setMe] = useState<Me | null>(null);
  const [form, setForm] = useState<Profile>(empty);
  const [state, setState] = useState<"loading" | "login" | "ready">("loading");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!getAccessToken()) { setState("login"); return; }
    apiFetch("/me").then(async (response) => {
      if (response.status === 401) { setState("login"); return; }
      const data: Me = await response.json();
      setMe(data);
      setForm(Object.fromEntries(Object.entries({ ...empty, ...data.profile }).map(([key, value]) => [key, value ?? ""])) as Profile);
      setState("ready");
    }).catch(() => setMessage("Errore di connessione."));
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true); setMessage("");
    try {
      const response = await apiFetch("/me/profile", { method: "PUT", body: JSON.stringify(form) });
      if (!response.ok) { setMessage(await apiError(response, "Impossibile salvare il profilo.")); return; }
      setMe(await response.json());
      setMessage("Profilo salvato.");
    } finally { setSaving(false); }
  }

  const field = (key: keyof Profile, label: string, props: Record<string, unknown> = {}) => (
    <label>{t(label)}<input value={form[key] ?? ""} onChange={(e) => setForm({ ...form, [key]: e.target.value })} {...props} /></label>
  );

  return (
    <SectionShell title="Il mio profilo" eyebrow="PERSONALE">
      {state === "login" && <div className="empty-state">{t("Accedi")} <a href="/login">{t("Accedi")}</a></div>}
      {state === "ready" && me && (
        <div className="profile-layout">
          <section className="panel profile-card">
            <div className="profile-avatar" aria-hidden="true">{(me.first_name[0] || "") + (me.last_name[0] || "")}</div>
            <h2>{me.first_name} {me.last_name}</h2>
            <p>{me.email}</p>
            <div className="profile-chips">
              {me.roles.map((role) => <span key={role} className="status-chip">{t(roleNames[role] || role)}</span>)}
              {me.work_area && <span className={`status-chip area-${me.work_area.toLowerCase()}`}>{t("Area")}: {t(areaNames[me.work_area])}</span>}
            </div>
            <button type="button" className="ghost" onClick={() => { clearSession(); window.location.assign("/login"); }}>{t("Esci")}</button>
          </section>
          <form className="panel record-form profile-form" onSubmit={save}>
            <h2 className="span-2">{t("Dati personali")}</h2>
            {field("phone", "Telefono", { type: "tel", autoComplete: "tel", inputMode: "tel" })}
            <h2 className="span-2">{t("Contatto di emergenza")}</h2>
            {field("emergency_contact", "Nome")}
            {field("emergency_phone", "Telefono", { type: "tel", inputMode: "tel" })}
            <label className="span-2">{t("Competenze e specializzazioni")}<textarea value={form.skills ?? ""} onChange={(e) => setForm({ ...form, skills: e.target.value })} placeholder={t("Es. diagnosi elettronica, climatizzazione, verniciatura a forno…")} /></label>
            <label className="span-2">{t("Note")}<textarea value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
            {message && <p className="hint span-2" role="status">{t(message)}</p>}
            <div className="record-form-actions span-2"><button className="primary" disabled={saving}>{saving ? t("Salvataggio…") : t("Salva")}</button></div>
          </form>
        </div>
      )}
      {state === "loading" && <div className="empty-state">{t("Caricamento…")}</div>}
    </SectionShell>
  );
}
