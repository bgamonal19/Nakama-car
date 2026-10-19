"use client";

import { useLanguage } from "./LanguageProvider";
import { estimateTone, estimateToneLabel } from "../lib/api";

/** Green when accepted, red when rejected, orange while it waits to be evaluated (by the office or by the customer from the link or the portal). */
export function EstimateChip({ status, prefix }: { status: string; prefix?: string }) {
  const { t } = useLanguage();
  const tone = estimateTone(status);
  if (!tone) return <span className="status-chip">{prefix ? `${prefix} · ` : ""}{t(status)}</span>;
  return <span className={`status-chip tone-${tone}`} title={t(status)}>{prefix ? `${prefix} · ` : ""}{t(estimateToneLabel(tone))}</span>;
}
