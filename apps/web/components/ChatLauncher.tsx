"use client";

import { useLanguage } from "./LanguageProvider";

/** Chat button placed next to the logo: opens / minimises the floating chat. */
export function ChatLauncher({ open, unread, onToggle }: { open: boolean; unread: number; onToggle: () => void }) {
  const { t } = useLanguage();
  return (
    <button type="button" className={`chat-launcher${open ? " open" : ""}${unread > 0 ? " has-unread" : ""}`} aria-expanded={open} onClick={onToggle}>
      <span aria-hidden="true">💬</span>
      <strong>{open ? t("Riduci chat") : t("Chat")}</strong>
      {unread > 0 && !open && <b aria-label={`${unread} ${t("nuovi messaggi")}`}>{unread}</b>}
    </button>
  );
}
