import { ReactNode } from "react";

const nav = [
  ["/", "▦ Dashboard"],
  ["/pratiche", "▤ Pratiche"],
  ["/preventivi", "€ Preventivi"],
  ["/lavori", "⌁ Ordini di lavoro"],
  ["/clienti", "◎ Clienti"],
  ["/veicoli", "◇ Veicoli"],
  ["/fatture", "◫ Fatture"],
];

export function SectionShell({ title, eyebrow, children, actions }: { title: string; eyebrow?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand brand-link" href="/">
          <div className="brand-mark">N</div>
          <div><strong>NAKAMA CAR</strong><span>ESTIMATE</span></div>
        </a>
        <nav>{nav.map(([href, label]) => <a key={href} className="nav-item" href={href}>{label}</a>)}</nav>
        <div className="sidebar-bottom">
          <a className="nav-item" href="/configurazione">⚙ Configurazione</a>
          <a className="nav-item" href="/audit">◷ Audit log</a>
          <div className="pilot-badge">Pilot • NAKAMA CAR</div>
        </div>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div><p className="eyebrow">{eyebrow || "NAKAMA CAR ESTIMATE"}</p><h1>{title}</h1></div>
          <div className="top-actions">{actions}</div>
        </header>
        {children}
      </section>
    </main>
  );
}
