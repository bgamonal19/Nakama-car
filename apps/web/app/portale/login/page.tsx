"use client";

import { FormEvent, useEffect, useState } from "react";
import { useLanguage } from "../../../components/LanguageProvider";
import { NakamaLogo } from "../../../components/NakamaLogo";
import { PasswordInput } from "../../../components/PasswordInput";
import { API_URL } from "../../../lib/api";
import { savePortalToken } from "../../../lib/portal";

export default function PortalLoginPage() {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    setExpired(new URLSearchParams(window.location.search).get("expired") === "1");
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/portal/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Accesso non riuscito");
      savePortalToken(data.access_token);
      window.location.assign("/portale");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Accesso non riuscito");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-screen">
      <div className="auth-card">
        <div className="public-brand nakama-auth-brand"><NakamaLogo /></div>
        <div className="auth-copy">
          <p className="eyebrow">{t("AREA CLIENTI FLOTTE")}</p>
          <h1>{t("I tuoi veicoli in officina")}</h1>
          <p>{t("Stato delle riparazioni, prossime manutenzioni e storico interventi.")}</p>
        </div>
        <form onSubmit={submit} className="auth-form">
          <label>{t("Email")}<input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label>{t("Password")}<PasswordInput required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          {expired && !error && <div className="auth-error" role="status">{t("Sessione scaduta. Accedi di nuovo per continuare.")}</div>}
          {error && <div className="auth-error">{t(error)}</div>}
          <button className="primary auth-submit" disabled={loading}>{loading ? t("Accesso…") : t("Accedi")}</button>
        </form>
        <p className="auth-foot">{t("Non hai le credenziali? Chiedile all'officina.")}</p>
      </div>
    </main>
  );
}
