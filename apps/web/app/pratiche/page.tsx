"use client";

import { useLanguage } from "../../components/LanguageProvider";

import { useEffect, useState } from "react";
import { SectionShell } from "../../components/SectionShell";
import { apiFetch, getAccessToken } from "../../lib/api";

type Item = { id: string; case_number: string; status: string; plate: string; vehicle_name: string; customer_name: string; mileage?: number };

export default function PratichePage() {
  const { t } = useLanguage();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!getAccessToken()) return setLoading(false);
    apiFetch("/cases").then(async r => { if (r.ok) setItems(await r.json()); }).finally(() => setLoading(false));
  }, []);
  return (
    <SectionShell title={t("Pratiche")} eyebrow={t("ACCETTAZIONE E RIPARAZIONI")} actions={<a className="primary link-button" href="/?new=practice">{t("+ Nuova pratica")}</a>}>
      {!getAccessToken() && <div className="empty-state">{t("Accedi per visualizzare le pratiche salvate.")} <a href="/login">{t("Accedi")}</a></div>}
      {getAccessToken() && <div className="panel list-panel">
        <div className="data-table head"><span>{t("Pratica")}</span><span>{t("Targa / Veicolo")}</span><span>{t("Cliente")}</span><span>Km</span><span>{t("Stato")}</span></div>
        {loading ? <div className="empty-state">{t("Caricamento…")}</div> : items.length === 0 ? <div className="empty-state">{t("Nessuna pratica ancora.")}</div> : items.map(x => (
          <div className="data-table" key={x.id}><strong>{x.case_number}</strong><span><b>{x.plate}</b><small>{x.vehicle_name}</small></span><span>{x.customer_name}</span><span>{x.mileage ?? "—"}</span><span className="status-chip">{t(x.status)}</span></div>
        ))}
      </div>}
    </SectionShell>
  );
}
