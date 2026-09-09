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
  return (
    <main className="app-shell nakama-theme">
      <aside className="sidebar">
        <a className="brand brand-link nakama-sidebar-brand" href="/">
          <NakamaLogo />
        </a>
        <nav>{nav.map(([href, label]) => <a key={href} className="nav-item" href={href}>{label}</a>)}</nav>
        <div className="sidebar-bottom">
          <a className="nav-item" href="/configurazione">⚙ Impostazioni</a>
          <a className="nav-item" href="/audit">◷ Audit log</a>
          <div className="pilot-badge">NAKAMA CAR · Bussnago</div>
        </div>
      </aside>
      <section className="workspace">
        <header className="topbar nakama-topbar">
          <div><p className="eyebrow">{eyebrow || "NAKAMA CAR ESTIMATE"}</p><h1>{title}</h1></div>
          <div className="top-actions">{actions}</div>
        </header>
        {children}
      </section>
    </main>
  );
}
