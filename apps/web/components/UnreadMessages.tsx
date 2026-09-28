"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "./LanguageProvider";
import { apiFetch, getAccessToken } from "../lib/api";

type Unread = { repair_case_id: string; case_number: string; plate: string; unread: number };

const POLL_MS = 30000;

/** Sidebar alert with the customer chats waiting for an answer. */
export function UnreadMessages() {
  const { t } = useLanguage();
  const [items, setItems] = useState<Unread[]>([]);

  useEffect(() => {
    if (!getAccessToken()) return;
    let active = true;
    const load = async () => {
      if (document.hidden) return;
      const response = await apiFetch("/messages/unread").catch(() => null);
      if (active && response?.ok) setItems(await response.json());
    };
    load();
    const timer = window.setInterval(load, POLL_MS);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  if (!items.length) return null;
  const total = items.reduce((sum, item) => sum + item.unread, 0);
  return (
    <div className="unread-chats" role="status">
      <strong>💬 {t("Messaggi dei clienti")} <b>{total}</b></strong>
      {items.slice(0, 5).map((item) => (
        <a key={item.repair_case_id} href={`/pratiche?q=${encodeURIComponent(item.case_number)}&chat=${item.repair_case_id}`}>
          <span>{item.plate}</span><small>{item.case_number}</small><b>{item.unread}</b>
        </a>
      ))}
    </div>
  );
}
