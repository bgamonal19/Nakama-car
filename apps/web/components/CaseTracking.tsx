"use client";

import { useCallback, useEffect, useState } from "react";
import { useLanguage } from "./LanguageProvider";
import { apiError, apiFetch, hasPermission } from "../lib/api";
import { ChatMessage, ChatThread } from "./ChatThread";

type Link = {
  active: boolean;
  public_path?: string | null;
  last_viewed_at?: string | null;
  customer_name: string;
  customer_phone?: string | null;
  customer_email?: string | null;
};

const POLL_MS = 15000;

/** Phone number in the international form wa.me expects (Italian numbers by default). */
export function whatsappNumber(phone?: string | null) {
  if (!phone) return "";
  let digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  else if (/^3\d{8,9}$/.test(digits) || /^0\d{5,10}$/.test(digits)) digits = `39${digits}`;
  return digits.replace(/\D/g, "");
}

/** Customer link + chat inside a repair case. */
export function CaseTracking({ caseId, plate }: { caseId: string; plate?: string }) {
  const { t } = useLanguage();
  const [link, setLink] = useState<Link | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [notice, setNotice] = useState("");
  const [canEdit, setCanEdit] = useState(false);

  const loadMessages = useCallback(async () => {
    const response = await apiFetch(`/cases/${caseId}/messages`).catch(() => null);
    if (response?.ok) setMessages(await response.json());
  }, [caseId]);

  useEffect(() => {
    setCanEdit(hasPermission("case.update"));
    setNotice("");
    apiFetch(`/cases/${caseId}/tracking-link`).then(async (response) => { if (response.ok) setLink(await response.json()); });
    loadMessages();
    const timer = window.setInterval(() => { if (!document.hidden) loadMessages(); }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [caseId, loadMessages]);

  const url = link?.active && link.public_path && typeof window !== "undefined" ? `${window.location.origin}${link.public_path}` : "";
  const greeting = link?.customer_name ? `${t("Ciao")} ${link.customer_name}, ` : "";
  const text = `${greeting}${t("puoi seguire la riparazione del tuo veicolo")}${plate ? ` ${plate}` : ""} ${t("e scriverci qui")}: ${url}`;
  const phone = whatsappNumber(link?.customer_phone);

  async function create() {
    const response = await apiFetch(`/cases/${caseId}/tracking-link`, { method: "POST" });
    if (response.ok) setLink(await response.json());
    else setNotice(await apiError(response, "Impossibile creare il link."));
  }

  async function revoke() {
    if (!window.confirm(t("Disattivare il link? Il cliente non potrà più aprirlo."))) return;
    const response = await apiFetch(`/cases/${caseId}/tracking-link`, { method: "DELETE" });
    if (response.ok) setLink(await response.json());
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setNotice("Link copiato.");
    } catch {
      setNotice("Copia non riuscita: seleziona il link e copialo a mano.");
    }
  }

  async function send(body: string): Promise<string | null> {
    const response = await apiFetch(`/cases/${caseId}/messages`, { method: "POST", body: JSON.stringify({ body }) });
    if (!response.ok) return apiError(response, "Messaggio non inviato.");
    const message: ChatMessage = await response.json();
    setMessages((current) => [...current, message]);
    return null;
  }

  return (
    <div className="case-tracking">
      {link?.active ? (
        <div className="tracking-share">
          <input readOnly value={url} aria-label={t("Link per il cliente")} onFocus={(event) => event.target.select()} />
          <div className="tracking-share-actions">
            <button type="button" className="secondary" onClick={copy}>{t("Copia")}</button>
            <a className="button-link whatsapp" href={`https://wa.me/${phone}?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer">WhatsApp</a>
            {link.customer_email && (
              <a className="button-link secondary" href={`mailto:${link.customer_email}?subject=${encodeURIComponent(t("Stato della riparazione"))}&body=${encodeURIComponent(text)}`}>{t("Email")}</a>
            )}
            <a className="button-link secondary" href={url} target="_blank" rel="noopener noreferrer">{t("Apri")}</a>
            {canEdit && <button type="button" className="ghost" onClick={revoke}>{t("Disattiva")}</button>}
          </div>
          <p className="hint">{link.last_viewed_at ? `${t("Aperto dal cliente il")} ${new Date(link.last_viewed_at).toLocaleString("it-IT")}` : t("Il cliente non ha ancora aperto il link.")}</p>
        </div>
      ) : (
        <div className="tracking-share empty">
          <p className="hint">{t("Genera un link: il cliente vede l'avanzamento della riparazione e può scriverti in chat, senza registrarsi.")}</p>
          {canEdit && <button type="button" className="primary" onClick={create}>{t("Genera link per il cliente")}</button>}
        </div>
      )}
      {notice && <p className="hint" role="status">{t(notice)}</p>}
      <ChatThread messages={messages} mine="WORKSHOP" onSend={canEdit ? send : undefined} placeholder="Rispondi al cliente…" />
    </div>
  );
}
