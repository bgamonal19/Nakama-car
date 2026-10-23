"use client";

import { useState } from "react";
import { useLanguage } from "./LanguageProvider";
import { NakamaLogo } from "./NakamaLogo";
import { LEGAL_PATHS, LEGAL_UPDATED, LegalDoc, legalDocument } from "../lib/legal";

/** Full page of one legal text (terms, privacy, cookies) in the chosen language. Public: no login needed. */
export function LegalPage({ doc }: { doc: LegalDoc }) {
  const { language, setLanguage } = useLanguage();
  const text = legalDocument(doc, language);
  return (
    <main className="public-estimate legal-page">
      <article className="public-card legal-card">
        <div className="legal-top">
          <div className="public-brand nakama-public-brand"><NakamaLogo /></div>
          <button type="button" className="legal-language" onClick={() => setLanguage(language === "it" ? "es" : "it")}>{language === "it" ? "Español" : "Italiano"}</button>
        </div>
        <h1>{text.title}</h1>
        <p className="legal-updated">{language === "es" ? "Última actualización" : "Ultimo aggiornamento"}: {LEGAL_UPDATED}</p>
        <p>{text.intro}</p>
        {text.sections.map((section) => (
          <section key={section.title}>
            <h2>{section.title}</h2>
            {section.text?.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
            {section.items && <ul>{section.items.map((item, index) => <li key={index}>{item}</li>)}</ul>}
          </section>
        ))}
        <LegalLinks />
      </article>
    </main>
  );
}

/** Links to the three legal texts, for the footer of login and public pages. */
export function LegalLinks() {
  const { t } = useLanguage();
  return (
    <nav className="legal-links" aria-label={t("Note legali")}>
      <a href={LEGAL_PATHS.termini} target="_blank" rel="noopener">{t("Termini e condizioni")}</a>
      <a href={LEGAL_PATHS.privacy} target="_blank" rel="noopener">{t("Privacy")}</a>
      <a href={LEGAL_PATHS.cookie} target="_blank" rel="noopener">{t("Cookie")}</a>
    </nav>
  );
}

export type LegalChoice = { terms: boolean; privacy: boolean };

/**
 * Two separate, unticked boxes: terms and conditions, privacy notice. Each one links to its text.
 * `terms` can be left out where only the privacy notice applies (e.g. rejecting an estimate).
 */
export function LegalConsent({ value, onChange, termsLabel }: { value: LegalChoice; onChange: (value: LegalChoice) => void; termsLabel?: string }) {
  const { t } = useLanguage();
  return (
    <div className="legal-consent">
      <label className="legal-check">
        <input type="checkbox" checked={value.terms} onChange={(event) => onChange({ ...value, terms: event.target.checked })} />
        <span>{t(termsLabel || "Accetto i")} <a href={LEGAL_PATHS.termini} target="_blank" rel="noopener">{t("termini e condizioni d'uso")}</a></span>
      </label>
      <label className="legal-check">
        <input type="checkbox" checked={value.privacy} onChange={(event) => onChange({ ...value, privacy: event.target.checked })} />
        <span>{t("Dichiaro di aver letto l'")}<a href={LEGAL_PATHS.privacy} target="_blank" rel="noopener">{t("informativa privacy")}</a></span>
      </label>
    </div>
  );
}

/** Step shown after the password when the account has not accepted the current terms and privacy notice. */
export function LegalStep({ onAccept, onCancel }: { onAccept: () => Promise<boolean>; onCancel: () => void }) {
  const { t } = useLanguage();
  const [choice, setChoice] = useState<LegalChoice>({ terms: false, privacy: false });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  async function accept() {
    setSaving(true);
    setError("");
    if (!(await onAccept())) setError(t("Non è stato possibile salvare l'accettazione. Riprova."));
    setSaving(false);
  }
  return (
    <div className="auth-form legal-step">
      <p>{t("Prima di entrare leggi e accetta i termini e l'informativa privacy. Te lo chiediamo solo la prima volta o quando cambiano.")}</p>
      <LegalConsent value={choice} onChange={setChoice} />
      {error && <div className="auth-error">{error}</div>}
      <button type="button" className="primary auth-submit" disabled={!choice.terms || !choice.privacy || saving} onClick={accept}>{saving ? t("Accesso…") : t("Accetta e continua")}</button>
      <button type="button" className="secondary" onClick={onCancel}>{t("Annulla")}</button>
    </div>
  );
}
