"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "./LanguageProvider";

const CHECK_EVERY = 3 * 60 * 1000;
// Coming back to the app after this long, a new version is applied straight away
// (if nothing is being edited); otherwise a banner offers to refresh.
const AUTO_AFTER_AWAY = 10 * 60 * 1000;

async function currentBuild(): Promise<string | null> {
  try {
    const response = await fetch(`/app-version?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return null;
    const data: { build?: string } = await response.json();
    return data.build || null;
  } catch {
    return null;
  }
}

// Something the user could lose with a reload: a wizard, an open dialog, a field being typed in.
function busy() {
  const active = document.activeElement;
  const typing = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement || active instanceof HTMLSelectElement;
  return typing || Boolean(document.querySelector(".wizard, .modal-backdrop, .chat-dock, .chat-bubble-panel, .damage-chooser, .plate-editor"));
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
      if (resumed && !busy()) { window.location.reload(); return; }
      setReady(true);
    }

    const timer = window.setInterval(() => { if (document.visibilityState === "visible") check(false); }, CHECK_EVERY);
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
    };
  }, []);

  if (!ready) return null;
  return (
    <div className="update-banner" role="status">
      <span>🔄 {t("Nuova versione disponibile")}</span>
      <button type="button" onClick={() => window.location.reload()}>{t("Aggiorna ora")}</button>
      <button type="button" className="ghost" aria-label={t("Più tardi")} onClick={() => setReady(false)}>✕</button>
    </div>
  );
}
