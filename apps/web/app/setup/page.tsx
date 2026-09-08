"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { API_URL, saveSession } from "../../lib/api";
import { NakamaLogo } from "../../components/NakamaLogo";

export default function SetupPage() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [form, setForm] = useState({
    tenant_name: "NAKAMA CAR",
    tenant_slug: "nakama-car",
    admin_email: "",
    admin_password: "",
    first_name: "",
    last_name: "",
    company_name: "NAKAMA CAR",
    vat_number: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/setup/bootstrap`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Bootstrap-Token": token,
        },
        body: JSON.stringify({ ...form, vat_number: form.vat_number || null }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "Inizializzazione non riuscita");
      saveSession(data);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Inizializzazione non riuscita");
    } finally {
      setLoading(false);
    }
  }

  function field(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <main className="auth-screen">
      <div className="auth-card setup-card">
        <div className="public-brand nakama-auth-brand"><NakamaLogo /></div>
        <div className="auth-copy"><p className="eyebrow">PRIMO AVVIO</p><h1>Inizializza il tenant pilota</h1><p>Questa operazione è consentita una sola volta e richiede il BOOTSTRAP_TOKEN configurato sul backend.</p></div>
        <form onSubmit={submit} className="auth-form setup-form">
          <label className="span-2">Bootstrap token<input required type="password" value={token} onChange={(e) => setToken(e.target.value)} /></label>
          <label>Nome<input required value={form.first_name} onChange={(e) => field("first_name", e.target.value)} /></label>
          <label>Cognome<input required value={form.last_name} onChange={(e) => field("last_name", e.target.value)} /></label>
          <label className="span-2">Email amministratore<input required type="email" value={form.admin_email} onChange={(e) => field("admin_email", e.target.value)} /></label>
          <label className="span-2">Password amministratore<input required minLength={10} type="password" value={form.admin_password} onChange={(e) => field("admin_password", e.target.value)} /></label>
          <label>Ragione sociale<input required value={form.company_name} onChange={(e) => field("company_name", e.target.value)} /></label>
          <label>Partita IVA<input value={form.vat_number} onChange={(e) => field("vat_number", e.target.value)} /></label>
          {error && <div className="auth-error span-2">{error}</div>}
          <button className="primary auth-submit span-2" disabled={loading}>{loading ? "Configurazione…" : "Crea NAKAMA CAR"}</button>
        </form>
      </div>
    </main>
  );
}
