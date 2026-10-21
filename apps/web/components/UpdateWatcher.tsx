"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "./LanguageProvider";
import { currentBuild, forceUpdate } from "../lib/appUpdate";

const CHECK_EVERY = 60 * 1000;
// Coming back to the app after this long, a new version is applied straight away
// (if nothing is being edited); otherwise a banner offers to refresh.
const AUTO_AFTER_AWAY = 10 * 60 * 1000;

// Something the user could lose with a reload: a wizard, an open dialog, a field being typed in.
function busy() {
  const active = document.activeElement;
  const typing = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement;
  return typing || Boolean(document.querySelector(".wizard, .modal-backdrop, .chat-dock, .chat-bubble-panel, .damage-chooser, .plate-editor"));
}

/**
 * Button in the side menu that always loads the latest version, with the version in use under it
 * (useful to check that a phone or the APK is up to date).
 */
export function UpdateAppButton() {
  const { t } = useLanguage();
  const [build, setBuild] = useState("");
  const [working, setWorking] = useState(false);
  useEffect(() => { currentBuild().then((value) => setBuild(value ? value.slice(0, 7) : "")); }, []);
  const label = working ? t("Aggiornamento…") : t("Aggiorna app");
  return <button type="button" className="nav-item theme-toggle update-app-button" disabled={working} aria-label={label} title={build ? `${label} · ${t("versione")} ${build}` : label}
    onClick={() => { setWorking(true); forceUpdate(); }}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5" />
    </svg><span>{label}{build && <small>{t("versione")} {build}</small>}</span>
  </button>;
}

/** Keeps every copy of the app (web, installed app, APK) on the latest version, no new download needed. */
export function UpdateWatcher() {
  const { t } = useLanguage();
  const loaded = useRef<string | null>(null);
  const hiddenAt = useRef<number | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stopped = false;
    currentBuild().then((build) => { if (!stopped) loaded.current = build; });

    async function check(resumed: boolean) {
      const build = await currentBuild();
      if (stopped || !build) return;
      if (!loaded.current) { loaded.current = build; return; }
      if (build === loaded.current) return;
      if (resumed && !busy()) { forceUpdate(); return; }
      setReady(true);
    }

    const timer = window.setInterval(() => { if (document.visibilityState === "visible") check(false); }, CHECK_EVERY);
    const onFocus = () => check(false);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    const onVisibility = () => {
      if (document.visibilityState === "hidden") { hiddenAt.current = Date.now(); return; }
      const away = hiddenAt.current ? Date.now() - hiddenAt.current : 0;
      hiddenAt.current = null;
      check(away >= AUTO_AFTER_AWAY);
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stopped = true;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
    };
  }, []);

  if (!ready) return null;
  return (
    <div className="update-banner" role="status">
      <span>🔄 {t("Nuova versione disponibile")}</span>
      <button type="button" onClick={() => forceUpdate()}>{t("Aggiorna ora")}</button>
      <button type="button" className="ghost" aria-label={t("Più tardi")} onClick={() => setReady(false)}>✕</button>
    </div>
  );
}
