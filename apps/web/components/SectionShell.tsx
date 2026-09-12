"use client";

import { AppSidebar } from "./AppSidebar";

import { useLanguage } from "./LanguageProvider";
import { ReactNode } from "react";


export function SectionShell({ title, eyebrow, children, actions }: { title: string; eyebrow?: string; children: ReactNode; actions?: ReactNode }) {
  const { t } = useLanguage();
  return (
    <main className="app-shell nakama-theme">
      <AppSidebar />
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
