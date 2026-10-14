"use client";

import { ChangeEvent, useEffect, useRef, useState } from "react";
import { useLanguage } from "./LanguageProvider";
import { apiFetch } from "../lib/api";

const fuelMarks: [number, string][] = [[0, "Vuoto"], [25, "¼"], [50, "½"], [75, "¾"], [100, "Pieno"]];

function fuelColor(value: number) {
  return value <= 15 ? "#d93025" : value <= 35 ? "#e0a100" : "#1e9e5a";
}

/** Fuel level on arrival: a gauge bar with quick marks (empty, ¼, ½, ¾, full) and a fine slider. */
export function FuelGauge({ value, onChange }: { value: number | null; onChange: (value: number | null) => void }) {
  const { t } = useLanguage();
  const shown = value ?? 0;
  return (
    <div className="fuel-gauge" role="group" aria-label={t("Carburante all'arrivo")}>
      <div className="fuel-gauge-head">
        <span>⛽ {t("Carburante all'arrivo")}</span>
        <strong>{value == null ? t("non indicato") : `${value}%`}</strong>
      </div>
      <div className="fuel-bar" aria-hidden="true">
        <span style={{ width: `${shown}%`, background: fuelColor(shown) }} />
        {[25, 50, 75].map((mark) => <i key={mark} style={{ left: `${mark}%` }} />)}
      </div>
      <input
        type="range" min={0} max={100} step={5} value={shown}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={t("Livello carburante in percentuale")}
        aria-valuetext={value == null ? t("non indicato") : `${value}%`}
      />
      <div className="choice-chips fuel-marks">
        {fuelMarks.map(([mark, label]) => (
          <button type="button" key={mark} className={value === mark ? "active" : ""} onClick={() => onChange(mark)}>{t(label)}</button>
        ))}
        {value != null && <button type="button" className="ghost" onClick={() => onChange(null)}>{t("Azzera")}</button>}
      </div>
    </div>
  );
}

export type PendingPhoto = { key: string; file: File; url: string; category: string };
export type SavedPhoto = { id: string; category: string };

export const photoCategories: [string, string, string][] = [
  ["FRONT", "Davanti", "🚘"], ["REAR", "Dietro", "🔙"], ["LEFT", "Lato sinistro", "⬅️"], ["RIGHT", "Lato destro", "➡️"],
  ["INTERIOR", "Interni", "💺"], ["ODOMETER", "Contachilometri", "⏱"], ["DAMAGE", "Danno", "⚠️"], ["OTHER", "Altra foto", "📷"],
];
const categoryName = Object.fromEntries(photoCategories.map(([code, name]) => [code, name]));

/** Photo of a diagnosis, loaded with the user's token. */
export function DiagnosisPhoto({ diagnosisId, photo, onRemove }: { diagnosisId: string; photo: SavedPhoto; onRemove?: () => void }) {
  const { t } = useLanguage();
  const [url, setUrl] = useState("");
  useEffect(() => {
    let alive = true;
    let objectUrl = "";
    apiFetch(`/diagnoses/${diagnosisId}/photos/${photo.id}`).then(async (response) => {
      if (!response.ok || !alive) return;
      objectUrl = URL.createObjectURL(await response.blob());
      setUrl(objectUrl);
    }).catch(() => undefined);
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [diagnosisId, photo.id]);
  return (
    <figure className="checkin-photo">
      {url ? <a href={url} target="_blank" rel="noopener noreferrer"><img src={url} alt={t(categoryName[photo.category] || "Foto")} /></a> : <span className="checkin-photo-loading" />}
      <figcaption>{t(photo.category === "OTHER" ? "Foto all'arrivo" : categoryName[photo.category] || "Foto")}</figcaption>
      {onRemove && <button type="button" className="checkin-remove" onClick={onRemove} aria-label={t("Elimina")}>✕</button>}
    </figure>
  );
}

/**
 * Check-in photos: one button per side of the car (opens the camera on a phone), previews
 * of the new photos, and the ones already saved with the diagnosis.
 */
export function CheckInPhotos({ pending, onAdd, onRemovePending, saved = [], diagnosisId, onRemoveSaved }: {
  pending: PendingPhoto[];
  onAdd: (photos: PendingPhoto[]) => void;
  onRemovePending: (key: string) => void;
  saved?: SavedPhoto[];
  diagnosisId?: string | null;
  onRemoveSaved?: (photo: SavedPhoto) => void;
}) {
  const { t } = useLanguage();
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  // Old Android app versions (WebView without the native camera bridge) cannot open the camera.
  const [oldApp, setOldApp] = useState(false);
  useEffect(() => {
    const w = window as unknown as { __nakamaCamera?: boolean };
    setOldApp(/; wv\)/.test(navigator.userAgent) && !w.__nakamaCamera);
  }, []);

  function picked(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []).filter((file) => file.type.startsWith("image/") || file.type === "");
    event.target.value = "";
    if (files.length === 0) return;
    // The mechanic just shoots: the office can say later which side each photo shows.
    onAdd(files.map((file, index) => ({ key: `${Date.now()}-${index}-${file.name}`, file, url: URL.createObjectURL(file), category: "OTHER" })));
  }

  const total = pending.length + saved.length;
  return (
    <div className="checkin-photos">
      <p className="checkin-title"><strong>📸 {t("Foto all'arrivo")}</strong> · {t("come è entrato il veicolo in officina")}{total ? ` · ${total}` : ""}</p>
      <button type="button" className="primary checkin-shoot" onClick={() => camera.current?.click()}>
        📷 {total ? t("Scatta un'altra foto") : t("Scatta foto")}
      </button>
      <button type="button" className="link-like checkin-gallery" onClick={() => gallery.current?.click()}>🖼 {t("oppure scegli dalla galleria")}</button>
      {oldApp && <p className="hint checkin-old-app">{t("Questa versione dell'app non apre la fotocamera: aggiorna l'app NAKAMA CAR, oppure scatta con la fotocamera del telefono e scegli le foto dalla galleria.")}</p>}
      {/* capture without "multiple": phones open the camera directly instead of the photo picker. */}
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={picked} />
      <input ref={gallery} type="file" accept="image/*" multiple hidden onChange={picked} />
      {total > 0 && (
        <div className="checkin-grid">
          {diagnosisId && saved.map((photo) => (
            <DiagnosisPhoto key={photo.id} diagnosisId={diagnosisId} photo={photo} onRemove={onRemoveSaved ? () => onRemoveSaved(photo) : undefined} />
          ))}
          {pending.map((photo) => (
            <figure key={photo.key} className="checkin-photo new">
              <img src={photo.url} alt={t(categoryName[photo.category] || "Foto")} />
              <figcaption>{t("da inviare")}</figcaption>
              <button type="button" className="checkin-remove" onClick={() => onRemovePending(photo.key)} aria-label={t("Elimina")}>✕</button>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
