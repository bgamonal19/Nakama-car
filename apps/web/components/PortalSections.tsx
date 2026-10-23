"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { useLanguage } from "./LanguageProvider";
import { ThemeToggle } from "./ThemeProvider";
import { UpdateAppButton } from "./UpdateWatcher";
import { LanguageSwitcher } from "./LanguageProvider";
import { NavIcon } from "./NavIcon";
import { ChatMessage, ChatPresence, ChatThread } from "./ChatThread";
import { PasswordInput } from "./PasswordInput";
import { portalError, portalFetch, savePortalToken } from "../lib/portal";

export type PortalSection = "fleet" | "shop" | "pickup" | "estimates" | "invoices" | "chat" | "add" | "profile";

// [section, label, icon]
const sections: [PortalSection, string, string][] = [
  ["fleet", "Tutta la flotta", "truck"],
  ["shop", "In manutenzione o riparazione", "work"],
  ["pickup", "Da ritirare", "car"],
  ["estimates", "Preventivi", "estimate"],
  ["invoices", "Fatture", "invoice"],
  ["chat", "Chat", "chat"],
  ["add", "Aggiungi veicolo", "plus"],
  ["profile", "Il mio profilo", "profile"],
];

function day(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  return parsed.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

function money(value: string) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(value || 0));
}

/** Customer portal menu: fixed on desktop, a drawer opened from the header on phones. */
export function PortalSidebar({ active, onSelect, open, onClose, counts }: {
  active: PortalSection;
  onSelect: (section: PortalSection) => void;
  open: boolean;
  onClose: () => void;
  counts: Partial<Record<PortalSection, number>>;
}) {
  const { t, language } = useLanguage();
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  return <>
    <div className={`portal-nav-backdrop${open ? " is-open" : ""}`} aria-hidden="true" onClick={onClose} />
    <aside id="portal-navigation" className={`portal-sidebar${open ? " is-open" : ""}`}>
      <nav aria-label={language === "es" ? "Menú del portal" : "Menu del portale"}>
        {sections.map(([section, label, icon]) => {
          const count = counts[section] || 0;
          return <button key={section} type="button" className={`portal-nav-item${active === section ? " active" : ""}`}
            aria-current={active === section ? "page" : undefined} onClick={() => { onSelect(section); onClose(); }}>
            <NavIcon name={icon} /><span>{t(label)}</span>
            {count > 0 && <b className={`portal-nav-count${section === "chat" ? " alert" : ""}`}>{count}</b>}
          </button>;
        })}
      </nav>
      <div className="portal-sidebar-bottom">
        <LanguageSwitcher />
        <ThemeToggle />
        <UpdateAppButton />
      </div>
    </aside>
  </>;
}

type PortalEstimate = {
  id: string; estimate_number: string; status: string; total: string; created_at: string; case_number: string;
  vehicle_id: string; license_plate: string; vehicle?: string | null; approval_path?: string | null;
};
const estimateStatus: Record<string, string> = {
  SENT: "Da approvare", VIEWED: "Da approvare", APPROVED: "Approvato", REJECTED: "Rifiutato", EXPIRED: "Scaduto",
};

export function PortalEstimates({ onOpenVehicle }: { onOpenVehicle: (id: string) => void }) {
  const { t } = useLanguage();
  const [items, setItems] = useState<PortalEstimate[] | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    portalFetch("/portal/estimates").then(async (response) => {
      if (response.ok) setItems(await response.json());
      else setError(await portalError(response, "Impossibile caricare i preventivi."));
    }).catch(() => setError("Impossibile caricare i preventivi."));
  }, []);
  return <section className="panel portal-section">
    <h2>{t("Preventivi")}</h2>
    {error && <p className="record-error" role="alert">{t(error)}</p>}
    {items && items.length === 0 && <p className="hint">{t("Nessun preventivo ricevuto.")}</p>}
    {items && items.length > 0 && <ul className="portal-docs">
      {items.map((item) => {
        const pending = item.status === "SENT" || item.status === "VIEWED";
        return <li key={item.id}>
          <button type="button" className="plate-chip" onClick={() => onOpenVehicle(item.vehicle_id)}>{item.license_plate}</button>
          <div>
            <strong>{t("Preventivo")} {item.estimate_number}</strong>
            <small>{[item.vehicle, item.case_number, day(item.created_at)].filter(Boolean).join(" · ")}</small>
          </div>
          <span className={`status-chip${item.status === "APPROVED" ? " ok tone-accepted" : item.status === "REJECTED" ? " tone-rejected" : pending ? " warn tone-pending" : ""}`}>{t(estimateStatus[item.status] || item.status)}</span>
          <strong className="portal-doc-total">{money(item.total)}</strong>
          {item.approval_path ? <a className="primary portal-doc-action" href={item.approval_path} target="_blank" rel="noreferrer">{t("Apri e approva")}</a> : <span />}
        </li>;
      })}
    </ul>}
  </section>;
}

type PortalInvoice = {
  id: string; invoice_number: string; status: string; kind: string; period_month?: string | null;
  issue_date?: string | null; due_date?: string | null; paid_at?: string | null; total: string; license_plate?: string | null;
};

/** Opens an issued invoice's PDF in a new tab; returns the error to show, if any. */
export async function openInvoicePdf(id: string): Promise<string | null> {
  // Open the tab now: browsers block pop-ups opened after an await.
  const tab = window.open("", "_blank");
  const response = await portalFetch(`/portal/invoices/${id}/pdf`);
  if (!response.ok) { tab?.close(); return portalError(response, "PDF non disponibile."); }
  const url = URL.createObjectURL(await response.blob());
  if (tab) tab.location.href = url;
  else window.location.assign(url);
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return null;
}

export function PortalInvoices() {
  const { t } = useLanguage();
  const [items, setItems] = useState<PortalInvoice[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  useEffect(() => {
    portalFetch("/portal/invoices").then(async (response) => {
      if (response.ok) setItems(await response.json());
      else setError(await portalError(response, "Impossibile caricare le fatture."));
    }).catch(() => setError("Impossibile caricare le fatture."));
  }, []);

  async function openPdf(invoice: PortalInvoice) {
    setBusy(invoice.id);
    setError("");
    try {
      setError(await openInvoicePdf(invoice.id) || "");
    } finally {
      setBusy("");
    }
  }

  const unpaid = (items || []).filter((item) => item.status === "ISSUED");
  return <section className="panel portal-section">
    <h2>{t("Fatture")}</h2>
    {error && <p className="record-error" role="alert">{t(error)}</p>}
    {unpaid.length > 0 && <p className="hint">{unpaid.length} {t("da pagare")} · {money(String(unpaid.reduce((sum, item) => sum + Number(item.total || 0), 0)))}</p>}
    {items && items.length === 0 && <p className="hint">{t("Nessuna fattura emessa.")}</p>}
    {items && items.length > 0 && <ul className="portal-docs">
      {items.map((item) => (
        <li key={item.id}>
          {item.license_plate ? <span className="plate-chip">{item.license_plate}</span> : <span className="portal-doc-kind">{t("Canone")}</span>}
          <div>
            <strong>{t("Fattura")} {item.invoice_number}</strong>
            <small>{[item.kind === "CONTRACT_FEE" && item.period_month ? `${t("Canone")} ${item.period_month}` : null, `${t("Emessa il")} ${day(item.issue_date)}`, item.status === "ISSUED" && item.due_date ? `${t("Scadenza")} ${day(item.due_date)}` : null].filter(Boolean).join(" · ")}</small>
          </div>
          <span className={`status-chip${item.status === "PAID" ? " ok" : " warn"}`}>{t(item.status === "PAID" ? "Pagata" : "Da pagare")}</span>
          <strong className="portal-doc-total">{money(item.total)}</strong>
          <button type="button" className="secondary portal-doc-action" disabled={busy === item.id} onClick={() => openPdf(item)}>{busy === item.id ? t("Apertura…") : "PDF"}</button>
        </li>
      ))}
    </ul>}
  </section>;
}

type Conversation = {
  case_id: string; case_number: string; closed: boolean; status_text: string; license_plate: string; vehicle?: string | null;
  unread: number; last_message: ChatMessage | null;
};
const POLL_MS = 20000;

export function PortalChat({ presence, onUnread }: { presence?: ChatPresence; onUnread: () => void }) {
  const { t } = useLanguage();
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [activeId, setActiveId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const onUnreadRef = useRef(onUnread);
  onUnreadRef.current = onUnread;

  const loadList = useCallback(async () => {
    const response = await portalFetch("/portal/conversations");
    if (!response.ok) return;
    const data: Conversation[] = await response.json();
    setConversations(data);
    setActiveId((current) => current || data[0]?.case_id || "");
  }, []);

  const loadMessages = useCallback(async () => {
    if (!activeId) return;
    const response = await portalFetch(`/portal/cases/${activeId}/messages?read=true`);
    if (response.ok) {
      setMessages(await response.json());
      setConversations((current) => current?.map((item) => item.case_id === activeId ? { ...item, unread: 0 } : item) || current);
      onUnreadRef.current();
    }
  }, [activeId]);

  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => {
    setMessages([]);
    if (!activeId) return;
    loadMessages();
    const timer = window.setInterval(() => { if (!document.hidden) { loadMessages(); loadList(); } }, POLL_MS);
    return () => window.clearInterval(timer);
  }, [activeId, loadMessages, loadList]);

  const active = conversations?.find((item) => item.case_id === activeId);

  async function send(body: string): Promise<string | null> {
    if (!activeId) return "Nessuna pratica aperta.";
    const response = await portalFetch(`/portal/cases/${activeId}/messages`, { method: "POST", body: JSON.stringify({ body }) });
    if (!response.ok) return portalError(response, "Messaggio non inviato.");
    const message: ChatMessage = await response.json();
    setMessages((current) => [...current, message]);
    return null;
  }

  return <section className="panel portal-section">
    <h2>{t("Chat con l'officina")}</h2>
    {conversations && conversations.length === 0 && <p className="hint">{t("Nessun veicolo in officina: la chat si apre con ogni pratica. Per altro chiama l'officina.")}</p>}
    {conversations && conversations.length > 0 && <div className="portal-chat">
      <ul className="portal-chat-list">
        {conversations.map((item) => (
          <li key={item.case_id}>
            <button type="button" className={item.case_id === activeId ? "active" : ""} onClick={() => setActiveId(item.case_id)}>
              <span className="plate-chip">{item.license_plate}</span>
              <span className="portal-chat-meta">
                <strong>{item.vehicle || item.case_number}</strong>
                <small>{item.last_message ? item.last_message.body : t(item.status_text)}</small>
              </span>
              {item.unread > 0 && <b className="portal-nav-count alert">{item.unread}</b>}
            </button>
          </li>
        ))}
      </ul>
      {active && <ChatThread
        id="portal-chat"
        title="Chat con l'officina"
        subtitle={`${active.case_number} · ${active.license_plate}`}
        messages={messages}
        mine="CUSTOMER"
        onSend={active.closed ? undefined : send}
        closedText="Pratica chiusa: per altre richieste chiama l'officina."
        presence={presence}
      />}
    </div>}
  </section>;
}

const emptyVehicle = { license_plate: "", make: "", model: "", year: "", fleet_number: "", vin: "", mileage: "", fuel_type: "" };
const fuels = ["Benzina", "Diesel", "GPL", "Metano", "Ibrida", "Elettrica"];

/** The customer can only add vehicles: changes and removals go through the workshop. */
export function PortalAddVehicle({ onAdded }: { onAdded: (id: string) => void }) {
  const { t } = useLanguage();
  const [form, setForm] = useState(emptyVehicle);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const dirty = Object.values(form).some((value) => value.trim());
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Leaving the page with unsaved data asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  useEffect(() => {
    if (!confirming) return;
    confirmRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setConfirming(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirming]);

  const set = (field: keyof typeof emptyVehicle) => (event: { target: { value: string } }) => setForm({ ...form, [field]: event.target.value });

  function review(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSaved("");
    setConfirming(true);
  }

  async function save() {
    setSaving(true);
    setError("");
    const payload = {
      license_plate: form.license_plate,
      make: form.make || null, model: form.model || null, fleet_number: form.fleet_number || null,
      vin: form.vin || null, fuel_type: form.fuel_type || null,
      year: form.year ? Number(form.year) : null, mileage: form.mileage ? Number(form.mileage) : null,
    };
    const response = await portalFetch("/portal/vehicles", { method: "POST", body: JSON.stringify(payload) });
    setSaving(false);
    setConfirming(false);
    if (!response.ok) { setError(await portalError(response, "Veicolo non salvato.")); return; }
    const vehicle = await response.json();
    setForm(emptyVehicle);
    setSaved(vehicle.license_plate);
    onAdded(vehicle.id);
  }

  const summary: [string, string][] = [
    ["Targa", form.license_plate.toUpperCase()], ["Marca", form.make], ["Modello", form.model], ["Anno", form.year],
    ["N. flotta", form.fleet_number], ["Telaio", form.vin.toUpperCase()], ["Km", form.mileage], ["Alimentazione", form.fuel_type ? t(form.fuel_type) : ""],
  ];

  return <section className="panel portal-section">
    <h2>{t("Aggiungi veicolo")}</h2>
    <p className="hint">{t("Puoi aggiungere veicoli alla tua flotta. Per modificarli o eliminarli contatta l'officina.")}</p>
    {saved && <p className="portal-success" role="status">✓ {t("Veicolo salvato")}: <strong>{saved}</strong></p>}
    {error && <p className="record-error" role="alert">{t(error)}</p>}
    <form className="record-form portal-add-form" onSubmit={review}>
      <label>{t("Targa")} *<input required minLength={4} maxLength={20} autoCapitalize="characters" value={form.license_plate} onChange={set("license_plate")} placeholder="AB123CD" /></label>
      <label>{t("N. flotta")}<input maxLength={40} value={form.fleet_number} onChange={set("fleet_number")} /></label>
      <label>{t("Marca")}<input maxLength={120} value={form.make} onChange={set("make")} /></label>
      <label>{t("Modello")}<input maxLength={120} value={form.model} onChange={set("model")} /></label>
      <label>{t("Anno")}<input type="number" min={1950} max={2100} value={form.year} onChange={set("year")} /></label>
      <label>{t("Km")}<input type="number" min={0} value={form.mileage} onChange={set("mileage")} /></label>
      <label>{t("Telaio")}<input maxLength={32} autoCapitalize="characters" value={form.vin} onChange={set("vin")} /></label>
      <label>{t("Alimentazione")}<select value={form.fuel_type} onChange={set("fuel_type")}>
        <option value="">—</option>
        {fuels.map((fuel) => <option key={fuel} value={fuel}>{t(fuel)}</option>)}
      </select></label>
      <div className="record-form-actions">
        <button type="button" className="ghost" disabled={!dirty} onClick={() => { setForm(emptyVehicle); setError(""); }}>{t("Svuota")}</button>
        <button className="primary">{t("Salva veicolo")}</button>
      </div>
    </form>

    {confirming && <div className="portal-modal-backdrop" onClick={() => setConfirming(false)}>
      <div className="portal-modal panel" role="alertdialog" aria-modal="true" aria-labelledby="portal-confirm-title" aria-describedby="portal-confirm-text" onClick={(event) => event.stopPropagation()}>
        <h3 id="portal-confirm-title">⚠ {t("Confermi di salvare questo veicolo?")}</h3>
        <p id="portal-confirm-text">{t("Controlla bene i dati: dopo il salvataggio non potrai modificarli né eliminarli dal portale, solo l'officina potrà farlo.")}</p>
        <dl>{summary.filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{t(label)}</dt><dd>{value}</dd></div>)}</dl>
        <div className="record-form-actions">
          <button type="button" className="ghost" onClick={() => setConfirming(false)}>{t("Correggi")}</button>
          <button ref={confirmRef} type="button" className="primary" disabled={saving} onClick={save}>{saving ? t("Salvataggio…") : t("Sì, salva")}</button>
        </div>
      </div>
    </div>}
  </section>;
}

type Profile = {
  account: { full_name: string; email: string; last_login_at?: string | null };
  customer: {
    display_name: string; customer_type: string; company_name?: string | null; first_name?: string | null; last_name?: string | null;
    vat_number?: string | null; tax_code?: string | null; sdi?: string | null;
    phone?: string | null; email?: string | null; pec?: string | null; address?: string | null; city?: string | null; province?: string | null; postal_code?: string | null;
  };
};
const contactFields = ["phone", "email", "pec", "address", "city", "province", "postal_code"] as const;
type ContactForm = Record<"full_name" | (typeof contactFields)[number], string>;

function toForm(profile: Profile): ContactForm {
  const form = { full_name: profile.account.full_name } as ContactForm;
  contactFields.forEach((field) => { form[field] = profile.customer[field] || ""; });
  return form;
}

/** The customer sees its data and keeps contacts and password up to date; tax data is changed by the workshop. */
export function PortalProfile({ onSaved }: { onSaved: () => void }) {
  const { t } = useLanguage();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [form, setForm] = useState<ContactForm | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [passwords, setPasswords] = useState({ current: "", next: "" });
  const [passwordNotice, setPasswordNotice] = useState("");

  useEffect(() => {
    portalFetch("/portal/profile").then(async (response) => {
      if (!response.ok) { setError(await portalError(response, "Impossibile caricare il profilo.")); return; }
      const data: Profile = await response.json();
      setProfile(data);
      setForm(toForm(data));
    }).catch(() => setError("Impossibile caricare il profilo."));
  }, []);

  const dirty = Boolean(profile && form && JSON.stringify(form) !== JSON.stringify(toForm(profile)));
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = (field: keyof ContactForm) => (event: { target: { value: string } }) => form && setForm({ ...form, [field]: event.target.value });

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    setSaving(true);
    setError("");
    setNotice("");
    const payload = Object.fromEntries(Object.entries(form).map(([key, value]) => [key, key === "full_name" ? value : value.trim() || null]));
    const response = await portalFetch("/portal/profile", { method: "PATCH", body: JSON.stringify(payload) });
    setSaving(false);
    if (!response.ok) { setError(await portalError(response, "Profilo non salvato: controlla i dati.")); return; }
    const data: Profile = await response.json();
    setProfile(data);
    setForm(toForm(data));
    setNotice("Dati salvati.");
    onSaved();
  }

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setPasswordNotice("");
    const response = await portalFetch("/portal/password", { method: "POST", body: JSON.stringify({ current_password: passwords.current, new_password: passwords.next }) });
    if (!response.ok) { setPasswordNotice(await portalError(response, "Password non aggiornata.")); return; }
    savePortalToken((await response.json()).access_token);
    setPasswords({ current: "", next: "" });
    setPasswordNotice("Password aggiornata.");
    onSaved();
  }

  const c = profile?.customer;
  const company = c?.customer_type === "COMPANY";
  const taxData: [string, string | null | undefined][] = c ? [
    [company ? "Ragione sociale" : "Nome e cognome", company ? c.company_name : [c.first_name, c.last_name].filter(Boolean).join(" ")],
    ["Partita IVA", c.vat_number], ["Codice fiscale", c.tax_code], ["Codice SDI", c.sdi],
  ] : [];

  return <section className="panel portal-section">
    <h2>{t("Il mio profilo")}</h2>
    {error && <p className="record-error" role="alert">{t(error)}</p>}
    {profile && form && <>
      <div className="portal-profile-tax">
        <h3>{t("Dati fiscali")}</h3>
        <dl>{taxData.map(([label, value]) => <div key={label}><dt>{t(label)}</dt><dd>{value || "—"}</dd></div>)}</dl>
        <p className="hint">{t("Per modificare i dati fiscali contatta l'officina.")}</p>
      </div>

      <form className="record-form portal-add-form" onSubmit={save}>
        <h3>{t("Dati di contatto")}</h3>
        <label>{t("Referente")} *<input required minLength={2} maxLength={160} value={form.full_name} onChange={set("full_name")} /></label>
        <label>{t("Telefono")}<input type="tel" maxLength={32} value={form.phone} onChange={set("phone")} /></label>
        <label>{t("Email")}<input type="email" maxLength={255} value={form.email} onChange={set("email")} /></label>
        <label>{t("PEC")}<input type="email" maxLength={255} value={form.pec} onChange={set("pec")} /></label>
        <label className="wide">{t("Indirizzo")}<input maxLength={255} value={form.address} onChange={set("address")} /></label>
        <label>{t("Città")}<input maxLength={120} value={form.city} onChange={set("city")} /></label>
        <label>{t("CAP")}<input maxLength={16} value={form.postal_code} onChange={set("postal_code")} /></label>
        <label>{t("Provincia")}<input maxLength={8} value={form.province} onChange={set("province")} /></label>
        <div className="record-form-actions">
          {notice && <span className="portal-success" role="status">✓ {t(notice)}</span>}
          <button type="button" className="ghost" disabled={!dirty} onClick={() => setForm(toForm(profile))}>{t("Annulla modifiche")}</button>
          <button className="primary" disabled={!dirty || saving}>{saving ? t("Salvataggio…") : t("Salva dati")}</button>
        </div>
      </form>

      <form className="record-form portal-add-form" onSubmit={changePassword}>
        <h3>{t("Accesso al portale")}</h3>
        <p className="hint wide">{t("Email di accesso")}: <strong>{profile.account.email}</strong></p>
        <label>{t("Password attuale")}<PasswordInput required autoComplete="current-password" value={passwords.current} onChange={(e) => setPasswords({ ...passwords, current: e.target.value })} /></label>
        <label>{t("Nuova password")}<PasswordInput required minLength={10} autoComplete="new-password" value={passwords.next} onChange={(e) => setPasswords({ ...passwords, next: e.target.value })} /></label>
        <div className="record-form-actions">
          {passwordNotice && <span className="hint" role="status">{t(passwordNotice)}</span>}
          <button className="primary">{t("Cambia password")}</button>
        </div>
      </form>
    </>}
  </section>;
}
