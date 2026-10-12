"use client";

import { FormEvent, useEffect, useState } from "react";
import { SectionShell } from "../../components/SectionShell";
import { useLanguage } from "../../components/LanguageProvider";
import { apiError, apiFetch, formatMoney, getAccessToken, hasPermission, openProtectedFile } from "../../lib/api";

type Invoice = {
  id: string;
  invoice_number: string;
  invoice_kind: string;
  status: string;
  subtotal: string;
  vat_total: string;
  total: string;
  customer_name: string;
  plate?: string | null;
  period_month?: string | null;
  issue_date?: string | null;
  due_date?: string | null;
  payment_method?: string | null;
  paid_at?: string | null;
  notes?: string | null;
};

type InvoiceDetail = Invoice & {
  lines: { id: string; description: string; quantity: string; unit_price: string; vat_rate: string; line_subtotal: string }[];
};

const statuses = ["", "DRAFT", "ISSUED", "PAID", "CANCELLED"];
const kinds = ["", "REPAIR", "CONTRACT_FEE"];
const paymentMethods = ["MP05", "MP01", "MP08", "MP02", "MP12", "MP19"];
const nextStatuses: Record<string, string[]> = {
  DRAFT: ["ISSUED", "CANCELLED"],
  ISSUED: ["PAID", "CANCELLED"],
  PAID: ["ISSUED"],
  CANCELLED: [],
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export default function FatturePage() {
  const { t } = useLanguage();
  const [signedIn, setSignedIn] = useState(false);
  const [items, setItems] = useState<Invoice[]>([]);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("");
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  async function load() {
    setBusy(true);
    try {
      const params = new URLSearchParams({ q: search });
      if (status) params.set("status", status);
      if (kind) params.set("kind", kind);
      const response = await apiFetch(`/invoices?${params.toString()}`);
      if (!response.ok) throw new Error(await apiError(response, "Impossibile caricare le fatture."));
      setItems(await response.json());
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore di connessione.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const token = Boolean(getAccessToken());
    setSignedIn(token);
    if (!token) setBusy(false);
  }, []);

  useEffect(() => {
    if (getAccessToken()) load();
  }, [search, status, kind]);

  const totals = items
    .filter((invoice) => invoice.status === "ISSUED")
    .reduce((sum, invoice) => sum + Number(invoice.total), 0);

  return (
    <SectionShell title={t("Fatture")} eyebrow={t("AMMINISTRAZIONE")} actions={<a className="secondary link-button" href="/contratti">{t("Canoni flotta")}</a>}>
      {!signedIn ? (
        <div className="empty-state">{t("Accedi per visualizzare la fatturazione.")} <a href="/login">{t("Accedi")}</a></div>
      ) : (
        <>
          <form className="record-search filters" onSubmit={(e: FormEvent) => { e.preventDefault(); setSearch(query.trim()); }}>
            <label>{t("Cerca")}<input type="search" value={query} placeholder={t("Numero, cliente o targa")} onChange={(e) => setQuery(e.target.value)} /></label>
            <label className="narrow">{t("Stato")}
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                {statuses.map((code) => <option key={code || "all"} value={code}>{code ? t(code) : t("Tutti")}</option>)}
              </select>
            </label>
            <label className="narrow">{t("Tipo")}
              <select value={kind} onChange={(e) => setKind(e.target.value)}>
                {kinds.map((code) => <option key={code || "all"} value={code}>{code ? t(code) : t("Tutti")}</option>)}
              </select>
            </label>
            <button className="secondary">{t("Cerca")}</button>
          </form>
          {error && <div className="record-error" role="alert">{t(error)}</div>}
          {totals > 0 && <p className="section-intro">{t("Da incassare (fatture emesse in elenco)")}: <strong>{formatMoney(totals)}</strong></p>}
          {openId && <InvoiceEditor key={openId} id={openId} onClose={() => setOpenId(null)} onChanged={load} />}
          <div className="panel list-panel" aria-busy={busy}>
            <div className="data-table invoices head">
              <span>{t("Fattura")}</span><span>{t("Cliente")}</span><span>{t("Stato")}</span><span>{t("Scadenza")}</span><span>{t("Totale")}</span><span>{t("Azioni")}</span>
            </div>
            {busy ? <div className="empty-state">{t("Caricamento…")}</div> : items.length === 0 ? <div className="empty-state">{t("Nessuna fattura.")}</div> : items.map((x) => (
              <div className="data-table invoices" key={x.id}>
                <span><strong>{x.invoice_number}</strong><small>{t(x.invoice_kind)}{x.period_month ? ` · ${x.period_month}` : ""}</small></span>
                <span>{x.customer_name || "—"}<small>{x.plate || ""}</small></span>
                <span className={`status-chip status-${x.status.toLowerCase()}`}>{t(x.status)}</span>
                <span>{formatDate(x.due_date)}{x.paid_at && <small>{t("Pagata il")} {formatDate(x.paid_at)}</small>}</span>
                <strong>{formatMoney(x.total)}</strong>
                <span className="table-actions"><button onClick={() => { setOpenId(x.id); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{t("Apri")}</button></span>
              </div>
            ))}
          </div>
        </>
      )}
    </SectionShell>
  );
}

function InvoiceEditor({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { t } = useLanguage();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [form, setForm] = useState({ issue_date: "", due_date: "", payment_method: "", notes: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [canEdit, setCanEdit] = useState(false);

  function fill(data: InvoiceDetail) {
    setInvoice(data);
    setForm({ issue_date: data.issue_date || "", due_date: data.due_date || "", payment_method: data.payment_method || "", notes: data.notes || "" });
  }

  useEffect(() => {
    setCanEdit(hasPermission("invoice.create"));
    apiFetch(`/invoices/${id}`).then(async (response) => {
      if (response.ok) fill(await response.json());
      else setError(t("Fattura non trovata."));
    });
  }, [id]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!invoice) return;
    setError("");
    setNotice("");
    const payload: Record<string, string | null> = {
      due_date: form.due_date || null,
      payment_method: form.payment_method || null,
      notes: form.notes.trim() || null,
    };
    if (invoice.status === "DRAFT") payload.issue_date = form.issue_date || null;
    const response = await apiFetch(`/invoices/${id}`, { method: "PATCH", body: JSON.stringify(payload) });
    if (!response.ok) {
      setError(t(await apiError(response, "Impossibile salvare la fattura.")));
      return;
    }
    fill(await response.json());
    setNotice(t("Salvato correttamente."));
    onChanged();
  }

  async function changeStatus(next: string) {
    if (!invoice) return;
    if (next === "ISSUED" && invoice.status === "DRAFT" && !confirm(t("Emettere la fattura? Numero e data non saranno più modificabili."))) return;
    if (next === "CANCELLED" && !confirm(t("Annullare la fattura? Se è già stata trasmessa allo SdI serve una nota di credito."))) return;
    setError("");
    const response = await apiFetch(`/invoices/${id}/status`, { method: "PATCH", body: JSON.stringify({ status: next }) });
    if (!response.ok) {
      setError(t(await apiError(response, "Impossibile aggiornare lo stato.")));
      return;
    }
    const refreshed = await apiFetch(`/invoices/${id}`);
    if (refreshed.ok) fill(await refreshed.json());
    onChanged();
  }

  async function download(kind: "pdf" | "xml") {
    if (!invoice) return;
    setError("");
    const failure = kind === "pdf"
      ? await openProtectedFile(`/invoices/${id}/pdf`, `${invoice.invoice_number}.pdf`)
      : await openProtectedFile(`/invoices/${id}/fatturapa`, `${invoice.invoice_number}.xml`, true);
    if (failure) setError(t(failure));
  }

  const draft = invoice?.status === "DRAFT";
  return (
    <section className="panel record-editor" aria-label={t("Fattura")}>
      <div className="panel-head">
        <div>
          <h2>{invoice?.invoice_number || t("Caricamento…")}</h2>
          {invoice && <p>{invoice.customer_name} · {t(invoice.invoice_kind)} · {t(invoice.status)}</p>}
        </div>
        <button className="secondary" onClick={onClose}>{t("Chiudi")}</button>
      </div>
      {error && <div className="record-error" role="alert">{error}</div>}
      {notice && <p className="staff-success" role="status">{notice}</p>}
      {invoice && (
        <>
          <div className="invoice-actions">
            <button className="secondary" onClick={() => download("pdf")}>{t("PDF cortesia")}</button>
            <button className="secondary" onClick={() => download("xml")} disabled={draft} title={draft ? t("Emetti la fattura per generare l'XML") : undefined}>{t("XML FatturaPA (SdI)")}</button>
            {canEdit && nextStatuses[invoice.status]?.map((next) => (
              <button key={next} className={next === "CANCELLED" ? "ghost" : "primary"} onClick={() => changeStatus(next)}>
                {next === "ISSUED" && invoice.status === "PAID" ? t("Segna come non pagata") : next === "ISSUED" ? t("Emetti fattura") : next === "PAID" ? t("Segna come pagata") : t("Annulla fattura")}
              </button>
            ))}
          </div>
          <div className="line-editor readonly">
            <div className="line-row invoice head"><span>{t("Descrizione")}</span><span>{t("Q.tà")}</span><span>{t("Prezzo unit.")}</span><span>{t("IVA %")}</span><span>{t("Imponibile")}</span></div>
            {invoice.lines.map((line) => (
              <div className="line-row invoice" key={line.id}>
                <span>{line.description}</span><span>{Number(line.quantity)}</span><span>{formatMoney(line.unit_price)}</span><span>{Number(line.vat_rate)}%</span><strong>{formatMoney(line.line_subtotal)}</strong>
              </div>
            ))}
            <div className="line-row invoice totals-row"><span>{t("Imponibile")} {formatMoney(invoice.subtotal)} · {t("IVA")} {formatMoney(invoice.vat_total)}</span><span /><span /><span /><strong>{formatMoney(invoice.total)}</strong></div>
          </div>
          <form className="record-form" onSubmit={save}>
            <label>{t("Data fattura")}<input type="date" disabled={!canEdit || !draft} value={form.issue_date} onChange={(e) => setForm({ ...form, issue_date: e.target.value })} /></label>
            <label>{t("Scadenza")}<input type="date" disabled={!canEdit || invoice.status === "CANCELLED"} value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></label>
            <label>{t("Modalità di pagamento")}
              <select disabled={!canEdit || invoice.status === "CANCELLED"} value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
                <option value="">—</option>
                {paymentMethods.map((code) => <option key={code} value={code}>{t(code)}</option>)}
              </select>
            </label>
            <label>{t("Pagata il")}<input type="date" disabled value={invoice.paid_at || ""} /></label>
            <label className="span-2">{t("Note in fattura")}<textarea disabled={!canEdit || invoice.status === "CANCELLED"} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
            {canEdit && invoice.status !== "CANCELLED" && <div className="record-form-actions"><button className="primary">{t("Salva")}</button></div>}
          </form>
          <p className="hint">{t("L'XML va caricato sul portale Fatture e Corrispettivi dell'Agenzia delle Entrate o inviato tramite il tuo intermediario. Per generarlo servono i dati fiscali dell'officina (Impostazioni) e del cliente.")}</p>
        </>
      )}
    </section>
  );
}
