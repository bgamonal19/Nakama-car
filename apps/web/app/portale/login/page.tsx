"use client";

import { FormEvent, useEffect, useState } from "react";
import { useLanguage } from "../../../components/LanguageProvider";
import { NakamaLogo } from "../../../components/NakamaLogo";
import { PasswordInput } from "../../../components/PasswordInput";
import { API_URL, saveSession } from "../../../lib/api";
import { acceptLegal, needsLegal, signIn, SignInResult } from "../../../lib/signin";
import { LegalLinks, LegalStep } from "../../../components/Legal";
import { savePortalToken } from "../../../lib/portal";

export default function PortalLoginPage() {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [expired, setExpired] = useState(false);
  // Signed in, waiting for the two boxes (terms, privacy) before the session is saved.
  const [pending, setPending] = useState<SignInResult | null>(null);

  useEffect(() => {
    setExpired(new URLSearchParams(window.location.search).get("expired") === "1");
  }, []);

  function enter(result: SignInResult) {
    if (result.kind === "staff") {
      // Workshop staff (admin, mechanics…) who typed their access here go to the workshop app.
      saveSession(result.session);
      window.location.assign("/");
    } else if (result.kind === "portal") {
      savePortalToken(result.token);
      window.location.assign("/portale");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await signIn(API_URL, email, password, "portal");
      if (result.kind === "error") throw new Error(result.message);
      if (needsLegal(result)) setPending(result);
      else enter(result);
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
        {pending ? <LegalStep onAccept={async () => { const ok = await acceptLegal(API_URL, pending); if (ok) enter(pending); return ok; }} onCancel={() => { setPending(null); setPassword(""); }} /> :
        <form onSubmit={submit} className="auth-form">
          <label>{t("Email")}<input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <label>{t("Password")}<PasswordInput required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          {expired && !error && <div className="auth-error" role="status">{t("Sessione scaduta. Accedi di nuovo per continuare.")}</div>}
          {error && <div className="auth-error">{t(error)}</div>}
          <button className="primary auth-submit" disabled={loading}>{loading ? t("Accesso…") : t("Accedi")}</button>
        </form>}
        <p className="auth-foot">{t("Non hai le credenziali? Chiedile all'officina.")}</p>
        <LegalLinks />
      </div>
    </main>
  );
}
