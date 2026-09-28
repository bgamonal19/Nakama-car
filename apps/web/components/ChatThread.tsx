"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useLanguage } from "./LanguageProvider";

export type ChatMessage = { id: string; sender: "CUSTOMER" | "WORKSHOP"; author_name?: string | null; body: string; created_at: string; read: boolean };

function when(value: string) {
  const date = new Date(value.endsWith("Z") || value.includes("+") ? value : `${value}Z`);
  return date.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Chat bubbles between customer and workshop; `mine` is the side of whoever is reading. */
export function ChatThread({ messages, mine, onSend, closedText, placeholder, title, subtitle, id }: {
  messages: ChatMessage[];
  mine: "CUSTOMER" | "WORKSHOP";
  onSend?: (body: string) => Promise<string | null>;
  closedText?: string;
  placeholder?: string;
  /** Header of the chat card, e.g. "Chat con il cliente". */
  title?: string;
  subtitle?: string;
  id?: string;
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
          {onSend && <span className="chat-live"><i />{t("Attiva")}</span>}
        </div>
      )}
      <div className="chat-messages" ref={list} aria-live="polite">
        {messages.length === 0 && <p className="chat-empty">{t("Nessun messaggio. Scrivi qui per qualsiasi domanda.")}</p>}
        {messages.map((message) => (
          <div key={message.id} className={`chat-bubble ${message.sender === mine ? "mine" : "theirs"}`}>
            <small>{message.author_name || (message.sender === "WORKSHOP" ? t("Officina") : t("Cliente"))} · {when(message.created_at)}</small>
            <p>{message.body}</p>
            {message.sender === mine && <em>{message.read ? t("Letto") : t("Inviato")}</em>}
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
