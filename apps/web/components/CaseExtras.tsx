"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { useLanguage } from "./LanguageProvider";
import { apiError, apiFetch, formatMoney } from "../lib/api";

type Media = { id: string; category: string; original_filename?: string | null; mime_type?: string | null };
type EstimateSummary = { id: string; estimate_number: string; status: string; total: string; contract_name?: string | null };

const categories = ["DAMAGE", "FRONT", "REAR", "LEFT", "RIGHT", "INTERIOR", "ODOMETER", "VIN", "DOCUMENT", "OTHER"];

/** Photos and estimates of one repair case, shown inside the case record. */
export function CaseExtras({ caseId }: { caseId: string }) {
  const { t } = useLanguage();
  const [media, setMedia] = useState<Media[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [estimates, setEstimates] = useState<EstimateSummary[]>([]);
  const [category, setCategory] = useState("DAMAGE");
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);

  async function loadMedia() {
    const response = await apiFetch(`/cases/${caseId}/media`);
    if (!response.ok) return;
    const items: Media[] = await response.json();
    setMedia(items);
    const resolved: Record<string, string> = {};
    let storageMissing = false;
    await Promise.all(items.map(async (item) => {
      const access = await apiFetch(`/cases/${caseId}/media/${item.id}/access-url`);
      if (access.ok) resolved[item.id] = (await access.json()).url;
      else if (access.status === 503) storageMissing = true;
    }));
    setUrls(resolved);
    if (storageMissing) setMessage("Archivio foto (S3) non configurato: le foto registrate non sono visualizzabili.");
  }

  useEffect(() => {
    setMessage("");
    loadMedia();
    apiFetch(`/estimates?repair_case_id=${caseId}`).then(async (response) => {
      if (response.ok) setEstimates(await response.json());
    });
  }, [caseId]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (files.length === 0) return;
    setUploading(true);
    setMessage("");
    try {
      for (const file of files) {
        const mime = file.type || "image/jpeg";
        const target = await apiFetch(`/cases/${caseId}/media/upload-target`, {
          method: "POST",
          body: JSON.stringify({ filename: file.name, mime_type: mime, category, media_type: "PHOTO" }),
        });
        if (!target.ok) throw new Error(target.status === 503 ? "Archivio foto (S3) non configurato." : await apiError(target, "Caricamento non riuscito."));
        const { upload_url, storage_key } = await target.json();
        const put = await fetch(upload_url, { method: "PUT", headers: { "Content-Type": mime }, body: file });
        if (!put.ok) throw new Error("Caricamento non riuscito.");
        const saved = await apiFetch(`/cases/${caseId}/media`, {
          method: "POST",
          body: JSON.stringify({ storage_key, original_filename: file.name, mime_type: mime, size_bytes: file.size, category, media_type: "PHOTO" }),
        });
        if (!saved.ok) throw new Error(await apiError(saved, "Caricamento non riuscito."));
      }
      await loadMedia();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Errore di connessione.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="case-extras">
      <div className="case-extras-block">
        <h3>{t("Preventivi della pratica")}</h3>
        {estimates.length === 0 ? <p className="hint">{t("Nessun preventivo.")}</p> : estimates.map((estimate) => (
          <a key={estimate.id} className="case-link" href={`/preventivi?id=${estimate.id}`}>
            <strong>{estimate.estimate_number}</strong>
            <span className="status-chip">{t(estimate.status)}</span>
            {estimate.contract_name && <span className="status-chip contract">{t("Contratto")}</span>}
            <span>{formatMoney(estimate.total)}</span>
          </a>
        ))}
      </div>
      <div className="case-extras-block">
        <div className="case-extras-head">
          <h3>{t("Foto")} ({media.length})</h3>
          <div className="photo-upload">
            <select aria-label={t("Categoria foto")} value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((code) => <option key={code} value={code}>{t(code)}</option>)}
            </select>
            <label className="secondary file-button">
              {uploading ? t("Caricamento…") : t("+ Aggiungi foto")}
              <input type="file" accept="image/*" capture="environment" multiple hidden disabled={uploading} onChange={upload} />
            </label>
          </div>
        </div>
        {message && <p className="hint" role="status">{t(message)}</p>}
        {media.length === 0 ? <p className="hint">{t("Nessuna foto registrata per questa pratica.")}</p> : (
          <div className="photo-gallery">
            {media.map((item) => (
              <figure key={item.id}>
                {urls[item.id] ? (
                  <a href={urls[item.id]} target="_blank" rel="noopener noreferrer"><img src={urls[item.id]} alt={`${t(item.category)} ${item.original_filename || ""}`} loading="lazy" /></a>
                ) : <div className="photo-placeholder">{t("Anteprima non disponibile")}</div>}
                <figcaption>{t(item.category)}</figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
