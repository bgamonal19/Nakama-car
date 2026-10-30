"use client";

import { AppSidebar } from "./AppSidebar";

import { useLanguage } from "./LanguageProvider";
import { ReactNode } from "react";


/** «Indietro»: an open record or tab closes first (it cancels the nakama-back event), otherwise the previous page. */
export function goBack() {
  if (!window.dispatchEvent(new Event("nakama-back", { cancelable: true }))) return;
  if (window.history.length > 1) window.history.back();
  else window.location.assign("/");
}

export function SectionShell({ title, eyebrow, children, actions }: { title: string; eyebrow?: string; children: ReactNode; actions?: ReactNode }) {
  const { t } = useLanguage();
  return (
    <main className="app-shell nakama-theme">
      <AppSidebar />
      <section className="workspace">
        <header className="topbar nakama-topbar">
          <div className="topbar-title">
            <button type="button" className="ghost back-button" onClick={goBack}>← {t("Indietro")}</button>
            <div><p className="eyebrow">{t(eyebrow || "NAKAMA CAR ESTIMATE")}</p><h1>{t(title)}</h1></div>
          </div>
          <div className="top-actions">{actions}</div>
        </header>
        {children}
      </section>
    </main>
  );
}
