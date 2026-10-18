"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useLanguage } from "./LanguageProvider";
import { apiError, apiFetch, hasPermission } from "../lib/api";

type Account = { id: string; email: string; full_name: string; active: boolean; must_change_password: boolean; last_login_at?: string | null; temporary_password?: string };

/** Customer portal logins: the workshop creates them and hands the temporary password to the customer. */
export function PortalAccess({ customerId, customerName }: { customerId: string; customerName: string }) {
  const { t } = useLanguage();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [draft, setDraft] = useState({ email: "", full_name: "" });
  const [issued, setIssued] = useState<Account | null>(null);
  const [message, setMessage] = useState("");
  const [canWrite, setCanWrite] = useState(false);

  const load = useCallback(async () => {
    const response = await apiFetch(`/customers/${customerId}/portal-accounts`);
    if (response.ok) setAccounts(await response.json());
  }, [customerId]);

  useEffect(() => {
    setCanWrite(hasPermission("customer.write"));
    setIssued(null);
    setMessage("");
    load();
  }, [load]);

  const portalUrl = typeof window !== "undefined" ? `${window.location.origin}/portale/login` : "/portale/login";

  async function createAccount(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    const response = await apiFetch(`/customers/${customerId}/portal-accounts`, { method: "POST", body: JSON.stringify(draft) });
    if (!response.ok) { setMessage(await apiError(response, "Impossibile creare l'accesso.")); return; }
    setIssued(await response.json());
    setDraft({ email: "", full_name: "" });
    load();
  }

  async function reset(account: Account) {
    if (!window.confirm(t("Generare una nuova password temporanea? Quella attuale smetterà di funzionare."))) return;
    const response = await apiFetch(`/portal-accounts/${account.id}/reset-password`, { method: "POST" });
    if (response.ok) { setIssued(await response.json()); load(); }
  }

  async function toggle(account: Account) {
    const response = await apiFetch(`/portal-accounts/${account.id}`, { method: "PATCH", body: JSON.stringify({ active: !account.active }) });
    if (response.ok) load();
  }

  const handoff = issued?.temporary_password
    ? `${t("Accesso area clienti")} ${customerName}\n${portalUrl}\n${t("Email")}: ${issued.email}\n${t("Password temporanea")}: ${issued.temporary_password}`
    : "";

  return (
    <div className="portal-access">
      <h3>{t("Accessi al portale")}</h3>
      <p className="hint">{t("Il cliente entra da")} <a href="/portale/login" target="_blank" rel="noopener noreferrer">{portalUrl}</a> {t("e vede i suoi veicoli, i lavori in corso, le prossime manutenzioni e lo storico; può scrivervi in chat.")}</p>
      {message && <p className="hint" role="status">{t(message)}</p>}
      {issued?.temporary_password && (
        <div className="issued-password" role="status">
          <p><strong>{t("Password temporanea per")} {issued.email}:</strong> <code>{issued.temporary_password}</code></p>
          <p className="hint">{t("Viene mostrata solo ora. Consegnala al cliente: al primo accesso sceglierà la sua password.")}</p>
          <button type="button" className="secondary" onClick={() => navigator.clipboard?.writeText(handoff).then(() => setMessage("Credenziali copiate.")).catch(() => undefined)}>{t("Copia credenziali")}</button>
        </div>
      )}
      <ul className="portal-accounts">
        {accounts.length === 0 && <li className="hint">{t("Nessun accesso creato.")}</li>}
        {accounts.map((account) => (
          <li key={account.id}>
            <span><strong>{account.full_name}</strong><small>{account.email}</small></span>
            <span className={`status-chip${account.active ? " ok" : ""}`}>{account.active ? t("Attivo") : t("Disattivato")}</span>
            <small>{account.last_login_at ? `${t("Ultimo accesso")} ${new Date(account.last_login_at).toLocaleString("it-IT")}` : t("Mai entrato")}</small>
            {canWrite && (
              <span className="table-actions">
                <button type="button" onClick={() => reset(account)}>{t("Nuova password")}</button>
                <button type="button" onClick={() => toggle(account)}>{account.active ? t("Disattiva") : t("Riattiva")}</button>
              </span>
            )}
          </li>
        ))}
      </ul>
      {canWrite && (
        <form className="record-form portal-account-form" onSubmit={createAccount}>
          <label>{t("Nome referente")}<input required minLength={2} maxLength={160} value={draft.full_name} onChange={(e) => setDraft({ ...draft, full_name: e.target.value })} placeholder={t("Es. Ufficio flotta")} /></label>
          <label>{t("Email")}<input required type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></label>
          <div className="record-form-actions"><button className="primary">{t("Crea accesso")}</button></div>
        </form>
      )}
    </div>
  );
}
