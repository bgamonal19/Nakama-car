"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { useLanguage } from "../../../components/LanguageProvider";
import { NakamaLogo } from "../../../components/NakamaLogo";
import { ChatMessage, ChatPresence, ChatThread } from "../../../components/ChatThread";
import { ChatLauncher } from "../../../components/ChatLauncher";
import { DamageMarker, DamagePhotoMap, MapPhoto, MarkerView } from "../../../components/DamagePhotoMap";
import { loadCustomerPhotos, OtherPhotos } from "../../../components/CustomerPhotos";
import type { PlateSpots } from "../../../lib/plateSpots";

type Step = { code: string; label: string; done: boolean; current: boolean };
type Tracking = {
  case_number: string;
  status: string;
  status_text: string;
  steps: Step[];
  closed: boolean;
  opened_at: string;
  updated_at: string;
  customer_name: string;
  vehicle: { license_plate: string; make?: string | null; model?: string | null; year?: number | null; color?: string | null; plate_spots?: PlateSpots };
  tasks: { description: string; status: string }[];
  tasks_done: number;
  tasks_total: number;
  estimate: { estimate_number: string; status: string; total: string; approval_path?: string | null } | null;
  workshop: { name: string; phone?: string | null; email?: string | null; address?: string | null; chat_status?: ChatPresence };
  unread: number;
};

const api = process.env.NEXT_PUBLIC_API_URL || "";
const POLL_MS = 15000;

function money(value: string) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(value || 0));
}

function date(value: string) {
  const parsed = new Date(value.endsWith("Z") || value.includes("+") ? value : `${value}Z`);
  return parsed.toLocaleString("it-IT", { day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" });
}

const taskIcon: Record<string, string> = { DONE: "✓", IN_PROGRESS: "●", BLOCKED: "!", PENDING: "○" };

/** Public page the customer opens from the link: repair progress + chat with the workshop. */
export default function TrackingPage() {
  const { t } = useLanguage();
  const params = useParams<{ token: string }>();
  const [data, setData] = useState<Tracking | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [markers, setMarkers] = useState<DamageMarker[]>([]);
  const [photos, setPhotos] = useState<MapPhoto[]>([]);
  const [state, setState] = useState<"loading" | "ok" | "missing">("loading");
  const [chatOpen, setChatOpen] = useState(false);
  const chatOpenRef = useRef(false);
  const unreadCount = messages.filter((message) => message.sender === "WORKSHOP" && !message.read).length;
  chatOpenRef.current = chatOpen;
  const base = `${api}/public/tracking/${params.token}`;

  const refresh = useCallback(async () => {
    try {
      const [info, chat] = await Promise.all([fetch(base), fetch(`${base}/messages?read=${chatOpenRef.current}`)]);
      if (!info.ok) { setState("missing"); return; }
      setData(await info.json());
      if (chat.ok) setMessages(await chat.json());
      setState("ok");
    } catch {
      setState((current) => (current === "loading" ? "missing" : current));
    }
  }, [base]);

  useEffect(() => {
    if (!params.token || !api) return;
    fetch(`${base}/damage-markers`).then(async (response) => { if (response.ok) setMarkers(await response.json()); }).catch(() => undefined);
    loadCustomerPhotos(() => fetch(`${base}/photos`), (id) => fetch(`${base}/photos/${id}`)).then(setPhotos);
  }, [params.token, base]);

  const loadRender = useCallback((view: MarkerView, version: string) => fetch(`${base}/renders/${view}?v=${version}`), [base]);

  // Opening the chat marks the workshop messages as read (blue ticks on their side).
  useEffect(() => { if (chatOpen) refresh(); }, [chatOpen, refresh]);

  useEffect(() => {
    if (!params.token || !api) return;
    refresh();
    const timer = window.setInterval(() => { if (!document.hidden) refresh(); }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [params.token, refresh]);

  async function send(body: string): Promise<string | null> {
    const response = await fetch(`${base}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    }).catch(() => null);
    if (!response) return "Errore di connessione.";
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      return typeof detail.detail === "string" ? detail.detail : "Messaggio non inviato.";
    }
    const message: ChatMessage = await response.json();
    setMessages((current) => [...current, message]);
    return null;
  }

  if (state === "loading") return <main className="public-estimate"><div className="public-card">{t("Caricamento…")}</div></main>;
  if (state === "missing" || !data) {
    return (
      <main className="public-estimate">
        <div className="public-card">
          <div className="public-brand nakama-public-brand"><NakamaLogo /></div>
          <h1 className="tracking-missing">{t("Link non valido o scaduto")}</h1>
          <p className="hint">{t("Contatta l'officina per ricevere un nuovo link.")}</p>
        </div>
      </main>
    );
  }

  const vehicle = [data.vehicle.make, data.vehicle.model].filter(Boolean).join(" ");
  const percent = data.tasks_total ? Math.round((data.tasks_done / data.tasks_total) * 100) : null;
  const workshop = data.workshop;

  return (
    <main className="public-estimate tracking-page">
      <div className="public-card">
        <div className="public-brand nakama-public-brand tracking-brand">
          <NakamaLogo />
          <ChatLauncher open={chatOpen} unread={unreadCount} onToggle={() => setChatOpen(!chatOpen)} presence={data.workshop.chat_status} />
        </div>
        <div className="public-head">
          <div>
            <small>{t("STATO DELLA RIPARAZIONE")}</small>
            <h1>{data.customer_name ? `${t("Ciao")} ${data.customer_name}` : data.case_number}</h1>
            <p className="tracking-vehicle">
              <span className="plate-chip">{data.vehicle.license_plate}</span>
              {vehicle} {data.vehicle.year ? `· ${data.vehicle.year}` : ""}
            </p>
          </div>
          <span className={`public-status${data.status === "READY" ? " ready" : ""}`}>{t(data.status_text)}</span>
        </div>

        <ol className="tracking-steps">
          {data.steps.map((step) => (
            <li key={step.code} className={step.current ? "current" : step.done ? "done" : ""}>
              <i>{step.done ? "✓" : ""}</i>
              <span>{t(step.label)}</span>
            </li>
          ))}
        </ol>
        <p className="hint">{t("Pratica")} {data.case_number} · {t("aggiornato")} {date(data.updated_at)}</p>

        {(markers.length > 0 || photos.length > 0 || (data.vehicle.make && data.vehicle.model)) && (
          <section className="tracking-section">
            <h2>{t("Danni e interventi sul veicolo")}</h2>
            <p className="hint">{markers.length ? t("Gira l'auto trascinandola: i numeri indicano i punti su cui interveniamo.") : t("Nessun danno segnato sul veicolo.")}</p>
            <DamagePhotoMap
              vehicle={{ make: data.vehicle.make || "", model: data.vehicle.model || "", year: data.vehicle.year, color: data.vehicle.color || "" }}
              plate={data.vehicle.license_plate}
              markers={markers}
              loadRender={loadRender}
              photos={photos}
              plateSpots={data.vehicle.plate_spots}
            />
            <OtherPhotos photos={photos} />
          </section>
        )}

        {data.tasks_total > 0 && (
          <section className="tracking-section">
            <div className="tracking-section-head">
              <h2>{t("Lavori sul tuo veicolo")}</h2>
              <strong>{percent}%</strong>
            </div>
            <div className="tracking-bar"><span style={{ width: `${percent}%` }} /></div>
            <ul className="tracking-tasks">
              {data.tasks.map((task, index) => (
                <li key={index} className={task.status.toLowerCase()}>
                  <i>{taskIcon[task.status] || "○"}</i>{task.description}
                </li>
              ))}
            </ul>
          </section>
        )}

        {data.estimate && (
          <section className="tracking-section tracking-estimate">
            <div>
              <h2>{t("Preventivo")} {data.estimate.estimate_number}</h2>
              <p className="hint">{t(data.estimate.status)} · {money(data.estimate.total)}</p>
            </div>
            {data.estimate.approval_path && <a className="button-link" href={data.estimate.approval_path}>{t("Vedi preventivo")}</a>}
          </section>
        )}

        {chatOpen && (
          <div className="chat-dock" role="dialog" aria-label={t("Chat con l'officina")}>
            <ChatThread
              id="chat"
              title="Chat con l'officina"
              subtitle={data.workshop.name}
              messages={messages}
              mine="CUSTOMER"
              onSend={data.closed ? undefined : send}
              closedText="Pratica chiusa: per altre richieste chiama l'officina."
              onMinimize={() => setChatOpen(false)}
              presence={data.workshop.chat_status}
            />
          </div>
        )}

        <footer className="tracking-workshop">
          <strong>{workshop.name}</strong>
          {workshop.address && <span>{workshop.address}</span>}
          <div>
            {workshop.phone && <a href={`tel:${workshop.phone.replace(/\s+/g, "")}`}>📞 {workshop.phone}</a>}
            {workshop.email && <a href={`mailto:${workshop.email}`}>✉ {workshop.email}</a>}
          </div>
        </footer>
      </div>
    </main>
  );
}
