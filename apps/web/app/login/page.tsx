"use client";

import { useLanguage } from "../../components/LanguageProvider";

import { PasswordInput } from "../../components/PasswordInput";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL, saveSession } from "../../lib/api";
import { NakamaLogo } from "../../components/NakamaLogo";

export default function LoginPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Accesso non riuscito");
      saveSession(data);
      router.push("/");
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
        <div className="auth-copy"><p className="eyebrow">{t("ACCESSO OPERATORE")}</p><h1>{t("Accedi alla carrozzeria")}</h1><p>{t("Gestisci pratiche, preventivi, lavorazioni e fatturazione.")}</p></div>
        <form onSubmit={submit} className="auth-form">
          <label>{t("Email")}<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nome@azienda.it" /></label>
          <label>{t("Password")}<PasswordInput  required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          {error && <div className="auth-error">{t(error)}</div>}
          <button className="primary auth-submit" disabled={loading}>{loading ? t("Accesso…") : t("Accedi")}</button>
        </form>
        <p className="auth-foot">{t("Primo avvio? Utilizza la pagina di inizializzazione riservata all'amministratore.")}</p>
      </div>
    </main>
  );
}
