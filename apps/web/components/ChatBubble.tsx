"use client";

import { PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef, useState } from "react";
import { useLanguage } from "./LanguageProvider";
import { apiError, apiFetch, getAccessToken, hasPermission } from "../lib/api";
import { ChatMessage, ChatPresence, ChatThread, presenceLabel } from "./ChatThread";

type Conversation = {
  repair_case_id: string;
  case_number: string;
  plate: string;
  customer_name: string;
  unread: number;
  closed: boolean;
  last_message: ChatMessage | null;
};

const LIST_POLL_MS = 20000;
const THREAD_POLL_MS = 8000;
const POSITION_KEY = "nakama_chat_bubble";
const STATUSES: ChatPresence[] = ["ONLINE", "PAUSED", "OFFLINE"];

function readPosition(): { x: number; y: number } | null {
  try {
    const saved = JSON.parse(localStorage.getItem(POSITION_KEY) || "null");
    return saved && typeof saved.x === "number" && typeof saved.y === "number" ? saved : null;
  } catch {
    return null;
  }
}

function when(value?: string) {
  if (!value) return "";
  const date = new Date(value.endsWith("Z") || value.includes("+") ? value : `${value}Z`);
  const today = new Date().toDateString() === date.toDateString();
  return today ? date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : date.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
}

/** Movable chat bubble for the workshop: pending chats, availability and quick replies. */
export function ChatBubble() {
  const { t } = useLanguage();
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ChatPresence>("ONLINE");
  const [chats, setChats] = useState<Conversation[]>([]);
  const [active, setActive] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [canReply, setCanReply] = useState(false);
  const drag = useRef<{ dx: number; dy: number; startX: number; startY: number; moved: boolean } | null>(null);

  const loadChats = useCallback(async () => {
    const response = await apiFetch("/messages/conversations").catch(() => null);
    if (response?.ok) setChats(await response.json());
  }, []);

  useEffect(() => {
    if (!getAccessToken() || !hasPermission("case.read")) return;
    setEnabled(true);
    setCanReply(hasPermission("case.update"));
    setPosition(readPosition());
    apiFetch("/chat/status").then(async (response) => { if (response.ok) setStatus((await response.json()).status); }).catch(() => undefined);
    loadChats();
    const timer = window.setInterval(() => { if (!document.hidden) loadChats(); }, LIST_POLL_MS);
    return () => window.clearInterval(timer);
  }, [loadChats]);

  const activeId = active?.repair_case_id;
  const loadThread = useCallback(async () => {
    if (!activeId) return;
    const response = await apiFetch(`/cases/${activeId}/messages`).catch(() => null);
    if (response?.ok) setMessages(await response.json());
  }, [activeId]);

  useEffect(() => {
    setMessages([]);
    if (!activeId || !open) return;
    loadThread().then(loadChats);
    const timer = window.setInterval(() => { if (!document.hidden) loadThread(); }, THREAD_POLL_MS);
    return () => window.clearInterval(timer);
  }, [activeId, open, loadThread, loadChats]);

  async function changeStatus(next: ChatPresence) {
    const response = await apiFetch("/chat/status", { method: "PUT", body: JSON.stringify({ status: next }) });
    if (response.ok) setStatus((await response.json()).status);
  }

  async function send(body: string): Promise<string | null> {
    if (!activeId) return null;
    const response = await apiFetch(`/cases/${activeId}/messages`, { method: "POST", body: JSON.stringify({ body }) });
    if (!response.ok) return apiError(response, "Messaggio non inviato.");
    const message: ChatMessage = await response.json();
    setMessages((current) => [...current, message]);
    loadChats();
    return null;
  }

  // Drag the bubble anywhere; a short tap opens it.
  function onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { dx: event.clientX - box.left, dy: event.clientY - box.top, startX: event.clientX, startY: event.clientY, moved: false };
  }
  function onPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const state = drag.current;
    if (!state) return;
    if (Math.hypot(event.clientX - state.startX, event.clientY - state.startY) > 6) state.moved = true;
    if (!state.moved) return;
    const size = 64;
    setPosition({
      x: Math.min(window.innerWidth - size - 4, Math.max(4, event.clientX - state.dx)),
      y: Math.min(window.innerHeight - size - 4, Math.max(4, event.clientY - state.dy)),
    });
  }
  function onPointerUp() {
    const state = drag.current;
    drag.current = null;
    if (!state) return;
    if (state.moved) {
      try { localStorage.setItem(POSITION_KEY, JSON.stringify(position)); } catch { /* private mode */ }
      return;
    }
    setOpen((value) => !value);
  }

  if (!enabled) return null;
  const pending = chats.reduce((sum, chat) => sum + chat.unread, 0);
  const bubbleStyle = position ? { left: position.x, top: position.y, right: "auto", bottom: "auto" } : undefined;
  // The panel opens on the side of the screen with more room.
  const panelLeft = position ? position.x > window.innerWidth / 2 : true;
  const panelUp = position ? position.y > window.innerHeight / 2 : true;
  const panelStyle = position ? {
    ...(panelLeft ? { right: Math.max(8, window.innerWidth - position.x + 8) } : { left: position.x + 72 }),
    ...(panelUp ? { bottom: Math.max(8, window.innerHeight - position.y - 64) } : { top: position.y }),
  } : undefined;

  return (
    <>
      <button
        type="button"
        className={`chat-bubble-fab ${status.toLowerCase()}${pending ? " has-unread" : ""}`}
        style={bubbleStyle}
        aria-label={`${t("Chat clienti")}${pending ? ` · ${pending} ${t("da leggere")}` : ""}`}
        aria-expanded={open}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { drag.current = null; }}
      >
        <span aria-hidden="true">💬</span>
        <i className={`presence-dot ${status.toLowerCase()}`} aria-hidden="true" />
        {pending > 0 && <b>{pending > 99 ? "99+" : pending}</b>}
      </button>
      {open && (
        <div className="chat-bubble-panel" style={panelStyle} role="dialog" aria-label={t("Chat clienti")}>
          <div className="chat-bubble-head">
            {active ? (
              <button type="button" className="chat-back" onClick={() => setActive(null)} aria-label={t("Tutte le chat")}>←</button>
            ) : <span aria-hidden="true">💬</span>}
            <div>
              <strong>{active ? `${active.plate} · ${active.customer_name || active.case_number}` : t("Chat clienti")}</strong>
              <small>{active ? active.case_number : `${pending} ${t("da leggere")}`}</small>
            </div>
            <button type="button" className="chat-minimize" aria-label={t("Riduci la chat")} onClick={() => setOpen(false)}>—</button>
          </div>
          <div className="chat-status-switch" role="radiogroup" aria-label={t("Stato della chat")}>
            {STATUSES.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={status === option}
                className={`${option.toLowerCase()}${status === option ? " active" : ""}`}
                disabled={!canReply}
                onClick={() => changeStatus(option)}
              >
                <i className={`presence-dot ${option.toLowerCase()}`} aria-hidden="true" />{t(presenceLabel[option])}
              </button>
            ))}
          </div>
          {active ? (
            <>
              <ChatThread messages={messages} mine="WORKSHOP" onSend={canReply && !active.closed ? send : undefined} placeholder="Rispondi al cliente…" closedText={active.closed ? "Pratica chiusa: per altre richieste chiama l'officina." : undefined} />
              <a className="chat-open-case" href={`/pratiche?q=${encodeURIComponent(active.case_number)}&chat=${active.repair_case_id}`}>{t("Apri la pratica")} →</a>
            </>
          ) : (
            <ul className="chat-list">
              {chats.length === 0 && <li className="chat-empty">{t("Nessuna chat con i clienti.")}</li>}
              {chats.map((chat) => (
                <li key={chat.repair_case_id}>
                  <button type="button" className={chat.unread ? "unread" : ""} onClick={() => setActive(chat)}>
                    <span className="plate-chip">{chat.plate || "—"}</span>
                    <span className="chat-list-text">
                      <strong>{chat.customer_name || chat.case_number}</strong>
                      <small>{chat.last_message ? `${chat.last_message.sender === "WORKSHOP" ? `${t("Tu")}: ` : ""}${chat.last_message.body}` : ""}</small>
                    </span>
                    <span className="chat-list-meta">
                      <small>{when(chat.last_message?.created_at)}</small>
                      {chat.unread > 0 && <b>{chat.unread}</b>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
