"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useLanguage } from "./LanguageProvider";

export type ChatMessage = { id: string; sender: "CUSTOMER" | "WORKSHOP"; author_name?: string | null; body: string; created_at: string; read: boolean; status?: "sent" | "delivered" | "read" };

export type ChatPresence = "ONLINE" | "PAUSED" | "OFFLINE";
export const presenceLabel: Record<ChatPresence, string> = { ONLINE: "In linea", PAUSED: "In pausa", OFFLINE: "Non in linea" };
const presenceNote: Record<ChatPresence, string> = {
  ONLINE: "",
  PAUSED: "L'officina è momentaneamente occupata: risponderemo appena possibile.",
  OFFLINE: "L'officina non è in linea: lascia un messaggio, ti risponderemo al più presto.",
};

/** WhatsApp-like ticks: ✓ sent, ✓✓ delivered, blue ✓✓ read. */
export function Ticks({ status }: { status: "sent" | "delivered" | "read" }) {
  const { t } = useLanguage();
  const label = status === "read" ? t("Letto") : status === "delivered" ? t("Consegnato") : t("Inviato");
  return (
    <span className={`chat-ticks ${status}`} title={label} aria-label={label}>
      <svg viewBox="0 0 18 12" width="18" height="12" aria-hidden="true">
        <path d="M1 6.5l3.2 3.2L11 2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        {status !== "sent" && <path d="M7.2 9.7L8 10.5 16.5 2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />}
      </svg>
    </span>
  );
}

function when(value: string) {
  const date = new Date(value.endsWith("Z") || value.includes("+") ? value : `${value}Z`);
  return date.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Chat bubbles between customer and workshop; `mine` is the side of whoever is reading. */
export function ChatThread({ messages, mine, onSend, closedText, placeholder, title, subtitle, id, onMinimize, presence }: {
  messages: ChatMessage[];
  mine: "CUSTOMER" | "WORKSHOP";
  onSend?: (body: string) => Promise<string | null>;
  closedText?: string;
  placeholder?: string;
  /** Header of the chat card, e.g. "Chat con il cliente". */
  title?: string;
  subtitle?: string;
  id?: string;
  /** Shows a minimise button in the header (floating chat). */
  onMinimize?: () => void;
  /** Workshop availability shown to the customer (online / paused / offline). */
  presence?: ChatPresence;
}) {
  const { t } = useLanguage();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [messages.length]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!onSend || !draft.trim() || sending) return;
    setSending(true);
    setError("");
    const problem = await onSend(draft.trim());
    setSending(false);
    if (problem) setError(problem);
    else setDraft("");
  }

  return (
    <div className="chat-thread chat-card" id={id}>
      {title && (
        <div className="chat-head">
          <span className="chat-icon" aria-hidden="true">💬</span>
          <div>
            <strong>{t(title)}</strong>
            {subtitle && <small>{subtitle}</small>}
          </div>
          {presence ? (
            <span className={`chat-live ${presence.toLowerCase()}`}><i />{t(presenceLabel[presence])}</span>
          ) : onSend && <span className="chat-live"><i />{t("Attiva")}</span>}
          {onMinimize && <button type="button" className="chat-minimize" aria-label={t("Riduci la chat")} onClick={onMinimize}>—</button>}
        </div>
      )}
      {presence && presence !== "ONLINE" && onSend && (
        <p className={`chat-presence-note ${presence.toLowerCase()}`}>{t(presenceNote[presence])}</p>
      )}
      <div className="chat-messages" ref={list} aria-live="polite">
        {messages.length === 0 && <p className="chat-empty">{t("Nessun messaggio. Scrivi qui per qualsiasi domanda.")}</p>}
        {messages.map((message) => (
          <div key={message.id} className={`chat-bubble ${message.sender === mine ? "mine" : "theirs"}`}>
            <small>{message.author_name || (message.sender === "WORKSHOP" ? t("Officina") : t("Cliente"))} · {when(message.created_at)}</small>
            <p>{message.body}</p>
            {message.sender === mine && <em><Ticks status={message.status || (message.read ? "read" : "sent")} /></em>}
          </div>
        ))}
      </div>
      {onSend ? (
        <form className="chat-compose" onSubmit={submit}>
          <textarea
            value={draft}
            maxLength={1000}
            rows={2}
            placeholder={t(placeholder || "Scrivi un messaggio…")}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(event); } }}
          />
          <button type="submit" className="primary" disabled={sending || !draft.trim()}>{sending ? "…" : t("Invia")}</button>
        </form>
      ) : closedText ? <p className="chat-empty">{t(closedText)}</p> : null}
      {error && <p className="hint" role="alert">{t(error)}</p>}
    </div>
  );
}
