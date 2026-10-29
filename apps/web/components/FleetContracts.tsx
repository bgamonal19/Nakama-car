"use client";

import { FormEvent, useEffect, useState } from "react";
import { FleetPortalPanel } from "./FleetPortalPanel";
import { useLanguage } from "./LanguageProvider";
import { apiError, apiFetch, customerLabel, formatMoney, hasPermission } from "../lib/api";

export type Contract = {
  id: string;
  customer_id: string;
  customer_name: string;
  name: string;
  labor_included: boolean;
  labor_discount_percent: string;
  parts_markup_percent: string;
  monthly_fee: string;
  fee_vat_rate: string;
  fee_description?: string | null;
  start_date: string;
  end_date?: string | null;
  is_active: boolean;
  notes?: string | null;
};

type CustomerOption = { id: string; company_name?: string | null; first_name?: string | null; last_name?: string | null; vat_number?: string | null };

type Draft = {
  customer_id: string;
  customer_name: string;
  name: string;
  labor_included: boolean;
  labor_discount_percent: string;
  parts_markup_percent: string;
  monthly_fee: string;
  fee_vat_rate: string;
  fee_description: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  notes: string;
};

function today() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

const emptyDraft: Draft = {
  customer_id: "", customer_name: "", name: "", labor_included: true, labor_discount_percent: "0",
  parts_markup_percent: "5", monthly_fee: "0", fee_vat_rate: "22", fee_description: "",
  start_date: today(), end_date: "", is_active: true, notes: "",
};

/** A contract is in force today: active and inside its dates. */
export function contractInForce(contract: Contract) {
  const day = today();
  return contract.is_active && contract.start_date <= day && (!contract.end_date || contract.end_date >= day);
}

/**
 * Fleet contracts. Without `customer` it is the list of every contract (Contratti flotta);
 * with `customer` it lives inside the customer's profile and only shows that customer's contract.
 */
export function FleetContracts({ customer, creating, onCreatingDone, onLoaded }: {
  customer?: { id: string; name: string };
  creating?: number;
  onCreatingDone?: () => void;
  onLoaded?: (contracts: Contract[]) => void;
}) {
  const { t, language } = useLanguage();
  const words = (it: string, es: string) => language === "es" ? es : it;
  const [canWrite, setCanWrite] = useState(false);
  const [canInvoice, setCanInvoice] = useState(false);
  const [items, setItems] = useState<Contract[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerOption[]>([]);
  const [feeMonth, setFeeMonth] = useState<Record<string, string>>({});
  const [portalFor, setPortalFor] = useState<Contract | null>(null);

  async function load() {
    setBusy(true);
    setError("");
    try {
      const response = await apiFetch(customer ? `/contracts?customer_id=${customer.id}` : "/contracts");
      if (!response.ok) throw new Error(await apiError(response, "Impossibile caricare i contratti."));
      const data: Contract[] = await response.json();
      setItems(data);
      onLoaded?.(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore di connessione.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    setCanWrite(hasPermission("customer.write"));
    setCanInvoice(hasPermission("invoice.create"));
    setDraft(null);
    setEditingId(null);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id]);

  // The page header's «+ Nuovo contratto» opens the form.
  useEffect(() => {
    if (creating) startCreate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creating]);

  function startCreate() {
    setEditingId(null);
    setDraft(customer
      ? { ...emptyDraft, start_date: today(), customer_id: customer.id, customer_name: customer.name, name: `${t("Manutenzione flotta")} ${customer.name}` }
      : { ...emptyDraft, start_date: today() });
    setCustomerQuery("");
    setCustomerResults([]);
    setNotice("");
  }

  function close() {
    setDraft(null);
    onCreatingDone?.();
  }

  function startEdit(contract: Contract) {
    setEditingId(contract.id);
    setDraft({
      customer_id: contract.customer_id,
      customer_name: contract.customer_name,
      name: contract.name,
      labor_included: contract.labor_included,
      labor_discount_percent: String(contract.labor_discount_percent),
      parts_markup_percent: String(contract.parts_markup_percent),
      monthly_fee: String(contract.monthly_fee),
      fee_vat_rate: String(contract.fee_vat_rate),
      fee_description: contract.fee_description || "",
      start_date: contract.start_date,
      end_date: contract.end_date || "",
      is_active: contract.is_active,
      notes: contract.notes || "",
    });
    setNotice("");
  }

  async function searchCustomers(event?: FormEvent) {
    event?.preventDefault();
    const response = await apiFetch(`/customers?q=${encodeURIComponent(customerQuery.trim())}&limit=20`);
    if (response.ok) setCustomerResults(await response.json());
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft) return;
    if (!draft.customer_id) {
      setError(t("Seleziona il cliente del contratto."));
      return;
    }
    setSaving(true);
    setError("");
    const payload = {
      name: draft.name.trim(),
      labor_included: draft.labor_included,
      labor_discount_percent: Number(draft.labor_discount_percent || 0),
      parts_markup_percent: Number(draft.parts_markup_percent || 0),
      monthly_fee: Number(draft.monthly_fee || 0),
      fee_vat_rate: Number(draft.fee_vat_rate || 0),
      fee_description: draft.fee_description.trim() || null,
      start_date: draft.start_date,
      end_date: draft.end_date || null,
      is_active: draft.is_active,
      notes: draft.notes.trim() || null,
    };
    try {
      const response = editingId
        ? await apiFetch(`/contracts/${editingId}`, { method: "PATCH", body: JSON.stringify(payload) })
        : await apiFetch("/contracts", { method: "POST", body: JSON.stringify({ ...payload, customer_id: draft.customer_id }) });
      if (!response.ok) throw new Error(await apiError(response, "Impossibile salvare il contratto."));
      close();
      setEditingId(null);
      setNotice(t("Contratto salvato."));
      await load();
    } catch (e) {
      setError(t(e instanceof Error ? e.message : "Errore di connessione."));
    } finally {
      setSaving(false);
    }
  }

  async function createFeeInvoice(contract: Contract) {
    const period = feeMonth[contract.id] || currentMonth();
    setError("");
    setNotice("");
    const response = await apiFetch(`/contracts/${contract.id}/fee-invoices`, { method: "POST", body: JSON.stringify({ period_month: period }) });
    if (!response.ok) {
      setError(t(await apiError(response, "Impossibile creare la fattura del canone.")));
      return;
    }
    const invoice = await response.json();
    setNotice(t("Fattura canone {number} creata in bozza.").replace("{number}", invoice.invoice_number));
  }

  return (
    <>
      {error && <div className="record-error" role="alert">{t(error)}</div>}
      {notice && <p className="staff-success" role="status">{notice}</p>}

      {draft && (
        <section className={customer ? "contract-editor" : "panel record-editor"} aria-label={t("Contratto")}>
          <div className="panel-head">
            <h2>{editingId ? draft.name : t("Nuovo contratto")}</h2>
            <button className="secondary" type="button" disabled={saving} onClick={close}>{t("Chiudi")}</button>
          </div>
          {!editingId && !customer && (
            <div className="customer-picker">
              {draft.customer_id ? (
                <p>{t("Cliente")}: <strong>{draft.customer_name}</strong> <button type="button" className="ghost" onClick={() => setDraft({ ...draft, customer_id: "", customer_name: "" })}>{t("Cambia")}</button></p>
              ) : (
                <>
                  <form className="record-search" onSubmit={searchCustomers}>
                    <label>{t("Cerca cliente aziendale")}<input type="search" value={customerQuery} onChange={(e) => setCustomerQuery(e.target.value)} placeholder={t("Ragione sociale o P.IVA")} /></label>
                    <button className="secondary">{t("Cerca")}</button>
                  </form>
                  <div className="picker-results">
                    {customerResults.map((option) => (
                      <button type="button" key={option.id} className="picker-option" onClick={() => setDraft({ ...draft, customer_id: option.id, customer_name: customerLabel(option), name: draft.name || `${t("Manutenzione flotta")} ${customerLabel(option)}` })}>
                        <strong>{customerLabel(option)}</strong>{option.vat_number && <small>{option.vat_number}</small>}
                      </button>
                    ))}
                  </div>
                  <small className="hint">{t("Il cliente deve esistere in anagrafica. Crealo prima da Clienti se necessario.")}</small>
                </>
              )}
            </div>
          )}
          <form className="record-form" onSubmit={save}>
            <label>{t("Nome contratto")}<input required minLength={2} maxLength={160} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
            <label>{t("Canone mensile (€ + IVA)")}<input type="number" min="0" step="0.01" required value={draft.monthly_fee} onChange={(e) => setDraft({ ...draft, monthly_fee: e.target.value })} /></label>
            <label className="checkbox-row"><input type="checkbox" checked={draft.labor_included} onChange={(e) => setDraft({ ...draft, labor_included: e.target.checked })} />{t("Manodopera inclusa nel canone")}</label>
            <label>{t("Sconto manodopera % (se non inclusa)")}<input type="number" min="0" max="100" step="0.01" disabled={draft.labor_included} value={draft.labor_discount_percent} onChange={(e) => setDraft({ ...draft, labor_discount_percent: e.target.value })} /></label>
            <label>{t("Ricarico ricambi e materiali %")}<input type="number" min="0" max="100" step="0.01" required value={draft.parts_markup_percent} onChange={(e) => setDraft({ ...draft, parts_markup_percent: e.target.value })} /></label>
            <label>{t("IVA canone %")}<input type="number" min="0" max="100" step="0.01" required value={draft.fee_vat_rate} onChange={(e) => setDraft({ ...draft, fee_vat_rate: e.target.value })} /></label>
            <label>{t("Inizio")}<input type="date" required value={draft.start_date} onChange={(e) => setDraft({ ...draft, start_date: e.target.value })} /></label>
            <label>{t("Fine (opzionale)")}<input type="date" min={draft.start_date} value={draft.end_date} onChange={(e) => setDraft({ ...draft, end_date: e.target.value })} /></label>
            <label>{t("Descrizione in fattura del canone")}<input maxLength={255} value={draft.fee_description} placeholder={t("Canone manutenzione flotta")} onChange={(e) => setDraft({ ...draft, fee_description: e.target.value })} /></label>
            <label className="checkbox-row"><input type="checkbox" checked={draft.is_active} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} />{t("Contratto attivo")}</label>
            <label className="span-2">{t("Note")}<textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label>
            <div className="record-form-actions">
              <button className="primary" disabled={saving}>{saving ? t("Salvataggio…") : t("Salva")}</button>
              <button type="button" className="secondary" disabled={saving} onClick={close}>{t("Annulla")}</button>
            </div>
          </form>
        </section>
      )}

      {portalFor && <FleetPortalPanel customerId={portalFor.customer_id} customerName={portalFor.customer_name} onClose={() => setPortalFor(null)} />}

      {customer ? (
        <div className="customer-contracts" aria-busy={busy}>
          {busy ? <p>{t("Caricamento…")}</p> : items.length === 0 ? (
            <p className="hint">{words(
              "Nessun contratto flotta: questo cliente paga il listino normale. Se è un'azienda con canone mensile, crea il contratto.",
              "Sin contrato de flota: este cliente paga la tarifa normal. Si es una empresa con cuota mensual, crea el contrato.",
            )}</p>
          ) : items.map((contract) => (
            <div className="customer-contract" key={contract.id}>
              <div>
                <strong>{contract.name}</strong>
                <span className={`status-chip${contractInForce(contract) ? " ok" : ""}`}>{contractInForce(contract) ? t("Attivo") : t("Non attivo")}</span>
                <small>
                  {contract.labor_included ? t("Manodopera inclusa") : `${t("Sconto manodopera")} ${Number(contract.labor_discount_percent)}%`}
                  {" · "}{t("Ricambi")} +{Number(contract.parts_markup_percent)}%
                  {" · "}{formatMoney(contract.monthly_fee)} {t("+ IVA / mese")}
                  {" · "}{contract.start_date}{contract.end_date ? ` → ${contract.end_date}` : ""}
                </small>
              </div>
              <span className="table-actions wrap">
                {canWrite && <button type="button" onClick={() => startEdit(contract)}>{t("Modifica")}</button>}
                {canInvoice && Number(contract.monthly_fee) > 0 && (
                  <>
                    <input type="month" aria-label={t("Mese del canone")} value={feeMonth[contract.id] || currentMonth()} onChange={(e) => setFeeMonth({ ...feeMonth, [contract.id]: e.target.value })} />
                    <button type="button" onClick={() => createFeeInvoice(contract)}>{t("Fattura canone")}</button>
                  </>
                )}
              </span>
            </div>
          ))}
          {canWrite && !draft && <button type="button" className="secondary" onClick={startCreate}>{t("+ Nuovo contratto")}</button>}
        </div>
      ) : (
        <section className="panel list-panel" aria-busy={busy}>
          <div className="data-table contracts head">
            <span>{t("Cliente")}</span><span>{t("Condizioni")}</span><span>{t("Canone")}</span><span>{t("Validità")}</span><span>{t("Azioni")}</span>
          </div>
          {busy ? (
            <div className="empty-state">{t("Caricamento…")}</div>
          ) : items.length === 0 ? (
            <div className="empty-state">{t("Nessun contratto. Crea il contratto di Univex o Gamonal per applicare le loro condizioni.")}</div>
          ) : items.map((contract) => (
            <div className="data-table contracts" key={contract.id}>
              <span><strong>{contract.customer_name}</strong><small>{contract.name}</small></span>
              <span>
                {contract.labor_included ? t("Manodopera inclusa") : `${t("Sconto manodopera")} ${Number(contract.labor_discount_percent)}%`}
                <small>{t("Ricambi")} +{Number(contract.parts_markup_percent)}%</small>
              </span>
              <strong>{formatMoney(contract.monthly_fee)}<small>{t("+ IVA / mese")}</small></strong>
              <span>
                <span className={`status-chip${contract.is_active ? " ok" : ""}`}>{contract.is_active ? t("Attivo") : t("Non attivo")}</span>
                <small>{contract.start_date}{contract.end_date ? ` → ${contract.end_date}` : ""}</small>
              </span>
              <span className="table-actions wrap">
                <a className="secondary link-button" href={`/clienti?id=${contract.customer_id}`}>{words("Profilo cliente", "Perfil del cliente")}</a>
                {canWrite && <button onClick={() => startEdit(contract)}>{t("Modifica")}</button>}
                <button onClick={() => { setPortalFor(contract); window.scrollTo({ top: 0, behavior: "smooth" }); }}>{t("Portale e manutenzioni")}</button>
                {canInvoice && Number(contract.monthly_fee) > 0 && (
                  <>
                    <input type="month" aria-label={t("Mese del canone")} value={feeMonth[contract.id] || currentMonth()} onChange={(e) => setFeeMonth({ ...feeMonth, [contract.id]: e.target.value })} />
                    <button onClick={() => createFeeInvoice(contract)}>{t("Fattura canone")}</button>
                  </>
                )}
              </span>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
