"use client";

import { useLanguage, LanguageSwitcher } from "./LanguageProvider";
import { ReactNode } from "react";
import { NakamaLogo } from "./NakamaLogo";

const nav = [
  ["/", "▦ Dashboard"],
  ["/pratiche", "▤ Pratiche"],
  ["/preventivi", "€ Preventivi"],
  ["/lavori", "⌁ Lavori in officina"],
  ["/clienti", "◎ Clienti"],
  ["/veicoli", "◇ Veicoli"],
  ["/fatture", "◫ Fatture"],
  ["/personale", "♙ Personale"],
];

export function SectionShell({ title, eyebrow, children, actions }: { title: string; eyebrow?: string; children: ReactNode; actions?: ReactNode }) {
  const { t } = useLanguage();
  return (
    <main className="app-shell nakama-theme">
      <aside className="sidebar">
        <a className="brand brand-link nakama-sidebar-brand" href="/">
          <NakamaLogo />
        </a>
        <nav>{nav.map(([href, label]) => <a key={href} className="nav-item" href={href}>{t(label)}</a>)}</nav>
        <div className="sidebar-bottom">
          <a className="nav-item" href="/configurazione">{t("⚙ Impostazioni")}</a>
          <a className="nav-item" href="/audit">{t("◷ Audit log")}</a>
          <LanguageSwitcher />
          <div className="pilot-badge">NAKAMA CAR · Bussnago</div>
        </div>
      </aside>
      <div className="mobile-language"><LanguageSwitcher /></div>
      <section className="workspace">
        <header className="topbar nakama-topbar">
          <div><p className="eyebrow">{t(eyebrow || "NAKAMA CAR ESTIMATE")}</p><h1>{t(title)}</h1></div>
          <div className="top-actions">{actions}</div>
        </header>
        {children}
      </section>
    </main>
  );
}
