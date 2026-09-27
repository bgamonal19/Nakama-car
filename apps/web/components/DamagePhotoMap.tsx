"use client";

import { MouseEvent, useEffect, useState } from "react";
import { useLanguage } from "./LanguageProvider";
import { apiFetch } from "../lib/api";

export type MarkerView = "front" | "side" | "side-right" | "rear" | "top";
export type MarkerOperation = "CHECK" | "REPAIR" | "REPLACE" | "PAINT";
export type DamageMarker = { id: string; view: MarkerView; x: number; y: number; operation: MarkerOperation; area_label: string };
export type VehicleLook = { make?: string; model?: string; year?: string | number | null; color?: string };

const views: [MarkerView, string][] = [
  ["front", "Frontale"],
  ["side", "Lato sinistro"],
  ["side-right", "Lato destro"],
  ["rear", "Posteriore"],
  ["top", "Tetto"],
];

export const operationStyle: Record<MarkerOperation, { label: string; color: string }> = {
  CHECK: { label: "Verificare", color: "#BA7517" },
  REPAIR: { label: "Riparare", color: "#185FA5" },
  REPLACE: { label: "Sostituire", color: "#A32D2D" },
  PAINT: { label: "Verniciare", color: "#534AB7" },
};

/** Italian name of the zone touched, from the view and the relative position on the picture. */
export function areaLabel(view: MarkerView, x: number, y: number) {
  const band = (value: number, parts: [string, string, string]) => (value < 0.34 ? parts[0] : value < 0.67 ? parts[1] : parts[2]);
  const height = band(y, ["alto", "centro", "basso"]);
  switch (view) {
    // Front picture: the car's left side is on the viewer's right.
    case "front": return `Frontale · ${band(x, ["lato destro", "centro", "lato sinistro"])} · ${height}`;
    case "rear": return `Posteriore · ${band(x, ["lato sinistro", "centro", "lato destro"])} · ${height}`;
    case "side": return `Lato sinistro · ${band(x, ["anteriore", "centrale", "posteriore"])} · ${height}`;
    case "side-right": return `Lato destro · ${band(x, ["posteriore", "centrale", "anteriore"])} · ${height}`;
    default: return `Tetto · ${band(y, ["anteriore", "centrale", "posteriore"])} · ${band(x, ["sinistra", "centro", "destra"])}`;
  }
}

function Silhouette({ view }: { view: MarkerView }) {
  const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 3, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  return (
    <svg viewBox="0 0 400 240" className="damage-silhouette" aria-hidden="true">
      {(view === "side" || view === "side-right") && (
        <g transform={view === "side-right" ? "translate(400,0) scale(-1,1)" : undefined}>
          <path {...stroke} d="M30 160 L40 120 Q60 112 110 108 L150 70 Q170 58 230 58 L275 62 Q300 70 325 105 L360 115 Q375 122 372 160 Z" />
          <path {...stroke} d="M158 106 L180 74 L228 72 L230 106 Z M240 106 L240 74 L272 76 L300 106 Z" />
          <circle {...stroke} cx="105" cy="165" r="28" /><circle {...stroke} cx="300" cy="165" r="28" />
        </g>
      )}
      {(view === "front" || view === "rear") && (
        <g>
          <path {...stroke} d="M80 190 L80 130 Q85 95 120 90 L150 50 Q200 40 250 50 L280 90 Q315 95 320 130 L320 190 Z" />
          <path {...stroke} d={view === "front" ? "M160 58 L240 58 L262 90 L138 90 Z" : "M165 60 L235 60 L252 88 L148 88 Z"} />
          <rect {...stroke} x="95" y="118" width="45" height="18" rx="6" /><rect {...stroke} x="260" y="118" width="45" height="18" rx="6" />
          <path {...stroke} d="M150 160 L250 160" />
          <rect {...stroke} x="85" y="190" width="40" height="22" rx="4" /><rect {...stroke} x="275" y="190" width="40" height="22" rx="4" />
        </g>
      )}
      {view === "top" && (
        <g>
          <path {...stroke} d="M60 120 Q60 70 110 65 L300 65 Q345 70 350 120 Q345 170 300 175 L110 175 Q60 170 60 120 Z" />
          <path {...stroke} d="M140 80 L270 80 Q285 120 270 160 L140 160 Q125 120 140 80 Z" />
        </g>
      )}
    </svg>
  );
}

type Props = {
  vehicle: VehicleLook;
  markers: DamageMarker[];
  onAdd?: (marker: Omit<DamageMarker, "id">) => void | Promise<void>;
  onRemove?: (marker: DamageMarker) => void | Promise<void>;
};

/** Tap on the real picture of the vehicle (or a generic outline) to pin damages. */
export function DamagePhotoMap({ vehicle, markers, onAdd, onRemove }: Props) {
  const { t } = useLanguage();
  const [view, setView] = useState<MarkerView>("side");
  const [images, setImages] = useState<Partial<Record<MarkerView, string | null>>>({});
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null);
  const make = (vehicle.make || "").trim();
  const model = (vehicle.model || "").trim();
  const color = (vehicle.color || "").trim();
  const year = vehicle.year ? String(vehicle.year) : "";

  const [disabled, setDisabled] = useState(false);

  useEffect(() => {
    setImages((current) => {
      Object.values(current).forEach((url) => { if (url) URL.revokeObjectURL(url); });
      return {};
    });
    setDisabled(false);
    setNotice(make && model ? "" : "Inserisci marca e modello per vedere le foto reali del veicolo.");
  }, [make, model, year, color]);

  // Load only the view being looked at: every new picture costs one render credit.
  useEffect(() => {
    if (!make || !model || disabled || images[view] !== undefined) return;
    let cancelled = false;
    (async () => {
      const params = new URLSearchParams({ make, model, view });
      if (year) params.set("year", year);
      if (color) params.set("color", color);
      const response = await apiFetch(`/renders/car?${params.toString()}`).catch(() => null);
      if (cancelled) return;
      if (response && response.ok) {
        const url = URL.createObjectURL(await response.blob());
        if (cancelled) { URL.revokeObjectURL(url); return; }
        setImages((current) => ({ ...current, [view]: url }));
        return;
      }
      setImages((current) => ({ ...current, [view]: null }));
      if (!response || response.status === 503 || response.status === 429 || response.status === 502) {
        setDisabled(true);
        setNotice(response?.status === 429 ? "Limite mensile di foto raggiunto: uso lo schema del veicolo." : "Foto reali non disponibili: uso lo schema del veicolo.");
      } else if (response.status === 404) {
        setNotice("Modello non presente nel catalogo foto: uso lo schema del veicolo.");
      }
    })();
    return () => { cancelled = true; };
  }, [make, model, year, color, view, disabled, images]);

  function place(event: MouseEvent<HTMLDivElement>) {
    if (!onAdd) return;
    const box = event.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
    const y = Math.min(1, Math.max(0, (event.clientY - box.top) / box.height));
    setPending({ x: Math.round(x * 10000) / 10000, y: Math.round(y * 10000) / 10000 });
  }

  async function choose(operation: MarkerOperation) {
    if (!pending || !onAdd) return;
    await onAdd({ view, x: pending.x, y: pending.y, operation, area_label: areaLabel(view, pending.x, pending.y) });
    setPending(null);
  }

  const image = images[view];
  const visible = markers.filter((marker) => marker.view === view);
  return (
    <div className="damage-photo-map">
      <div className="damage-view-tabs" role="tablist" aria-label={t("Vista del veicolo")}>
        {views.map(([code, label]) => {
          const count = markers.filter((marker) => marker.view === code).length;
          return (
            <button key={code} type="button" role="tab" aria-selected={view === code} className={view === code ? "active" : ""} onClick={() => { setView(code); setPending(null); }}>
              {t(label)}{count > 0 && <b>{count}</b>}
            </button>
          );
        })}
      </div>
      <div className={`damage-canvas${onAdd ? " editable" : ""}`} onClick={place} role={onAdd ? "button" : undefined} aria-label={onAdd ? t("Tocca il punto danneggiato") : undefined}>
        {image ? <img src={image} alt={`${make} ${model} · ${t(views.find(([code]) => code === view)?.[1])}`} draggable={false} /> : image === null || disabled || !make || !model ? <Silhouette view={view} /> : <div className="damage-loading">{t("Caricamento…")}</div>}
        {visible.map((marker, index) => (
          <span key={marker.id || index} className="damage-pin" style={{ left: `${marker.x * 100}%`, top: `${marker.y * 100}%`, background: operationStyle[marker.operation].color }} title={`${marker.area_label} · ${t(operationStyle[marker.operation].label)}`}>
            {markers.indexOf(marker) + 1}
          </span>
        ))}
        {pending && <span className="damage-pin pending" style={{ left: `${pending.x * 100}%`, top: `${pending.y * 100}%` }} />}
      </div>
      {pending && (
        <div className="damage-chooser" role="group" aria-label={t("Tipo di intervento")}>
          <span>{t(areaLabel(view, pending.x, pending.y))}</span>
          {(Object.keys(operationStyle) as MarkerOperation[]).map((operation) => (
            <button key={operation} type="button" style={{ borderColor: operationStyle[operation].color, color: operationStyle[operation].color }} onClick={() => choose(operation)}>
              {t(operationStyle[operation].label)}
            </button>
          ))}
          <button type="button" className="ghost" onClick={() => setPending(null)}>{t("Annulla")}</button>
        </div>
      )}
      {notice && <p className="hint">{t(notice)}</p>}
      {markers.length > 0 && (
        <ol className="damage-list">
          {markers.map((marker, index) => (
            <li key={marker.id || index}>
              <span className="damage-dot" style={{ background: operationStyle[marker.operation].color }}>{index + 1}</span>
              <span>{marker.area_label}</span>
              <strong style={{ color: operationStyle[marker.operation].color }}>{t(operationStyle[marker.operation].label)}</strong>
              {onRemove && <button type="button" className="ghost" aria-label={t("Elimina")} onClick={() => onRemove(marker)}>✕</button>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
