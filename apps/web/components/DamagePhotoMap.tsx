"use client";

import { PointerEvent, useEffect, useRef, useState } from "react";
import { useLanguage } from "./LanguageProvider";
import { apiFetch } from "../lib/api";

export type MarkerView =
  | "front" | "front-3-4" | "side" | "rear-3-4" | "rear" | "rear-3-4-right" | "side-right" | "front-3-4-right" | "top";
export type MarkerOperation = "CHECK" | "REPAIR" | "REPLACE" | "PAINT";
export type DamageMarker = { id: string; view: MarkerView; x: number; y: number; operation: MarkerOperation; area_label: string };
export type VehicleLook = { make?: string; model?: string; year?: string | number | null; color?: string };

// Turntable frames, walking around the car. The roof is a separate view.
const ring: MarkerView[] = ["front", "front-3-4", "side", "rear-3-4", "rear", "rear-3-4-right", "side-right", "front-3-4-right"];
export const viewNames: Record<MarkerView, string> = {
  "front": "Frontale",
  "front-3-4": "3/4 anteriore sinistro",
  "side": "Lato sinistro",
  "rear-3-4": "3/4 posteriore sinistro",
  "rear": "Posteriore",
  "rear-3-4-right": "3/4 posteriore destro",
  "side-right": "Lato destro",
  "front-3-4-right": "3/4 anteriore destro",
  "top": "Tetto",
};

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
    case "top": return `Tetto · ${band(y, ["anteriore", "centrale", "posteriore"])} · ${band(x, ["sinistra", "centro", "destra"])}`;
    default: return `${viewNames[view]} · ${band(x, ["sinistra", "centro", "destra"])} · ${height}`;
  }
}

function silhouetteFor(view: MarkerView): "side" | "side-right" | "front" | "rear" | "top" {
  if (view === "front" || view === "rear" || view === "top" || view === "side" || view === "side-right") return view;
  return view.endsWith("right") ? "side-right" : "side";
}

function Silhouette({ view }: { view: MarkerView }) {
  const shape = silhouetteFor(view);
  const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 3, strokeLinejoin: "round" as const, strokeLinecap: "round" as const };
  return (
    <svg viewBox="0 0 400 240" className="damage-silhouette" aria-hidden="true">
      {(shape === "side" || shape === "side-right") && (
        <g transform={shape === "side-right" ? "translate(400,0) scale(-1,1)" : undefined}>
          <path {...stroke} d="M30 160 L40 120 Q60 112 110 108 L150 70 Q170 58 230 58 L275 62 Q300 70 325 105 L360 115 Q375 122 372 160 Z" />
          <path {...stroke} d="M158 106 L180 74 L228 72 L230 106 Z M240 106 L240 74 L272 76 L300 106 Z" />
          <circle {...stroke} cx="105" cy="165" r="28" /><circle {...stroke} cx="300" cy="165" r="28" />
        </g>
      )}
      {(shape === "front" || shape === "rear") && (
        <g>
          <path {...stroke} d="M80 190 L80 130 Q85 95 120 90 L150 50 Q200 40 250 50 L280 90 Q315 95 320 130 L320 190 Z" />
          <path {...stroke} d={shape === "front" ? "M160 58 L240 58 L262 90 L138 90 Z" : "M165 60 L235 60 L252 88 L148 88 Z"} />
          <rect {...stroke} x="95" y="118" width="45" height="18" rx="6" /><rect {...stroke} x="260" y="118" width="45" height="18" rx="6" />
          <path {...stroke} d="M150 160 L250 160" />
          <rect {...stroke} x="85" y="190" width="40" height="22" rx="4" /><rect {...stroke} x="275" y="190" width="40" height="22" rx="4" />
        </g>
      )}
      {shape === "top" && (
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

const DRAG_STEP_PX = 45;

/** Real pictures of the vehicle as a 360° turntable: drag to turn, tap to pin a damage. */
export function DamagePhotoMap({ vehicle, markers, onAdd, onRemove }: Props) {
  const { t } = useLanguage();
  const [view, setView] = useState<MarkerView>("front-3-4");
  const [images, setImages] = useState<Partial<Record<MarkerView, string | null>>>({});
  const [disabled, setDisabled] = useState(false);
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null);
  const drag = useRef<{ x: number; startIndex: number; moved: boolean } | null>(null);
  const make = (vehicle.make || "").trim();
  const model = (vehicle.model || "").trim();
  const color = (vehicle.color || "").trim();
  const year = vehicle.year ? String(vehicle.year) : "";
  const ready = Boolean(make && model);

  useEffect(() => {
    setImages((current) => {
      Object.values(current).forEach((url) => { if (url) URL.revokeObjectURL(url); });
      return {};
    });
    setDisabled(false);
    setNotice(ready ? "" : "Inserisci marca e modello per vedere le foto reali del veicolo.");
  }, [make, model, year, color, ready]);

  // Frames are fetched one after the other, starting with the one on screen.
  // Each new make/model/colour/view costs one render credit once; then it is cached.
  useEffect(() => {
    if (!ready || disabled) return;
    const order = [view, ...ring.filter((code) => code !== view)];
    const next = order.find((code) => images[code] === undefined);
    if (!next) return;
    let cancelled = false;
    (async () => {
      const params = new URLSearchParams({ make, model, view: next });
      if (year) params.set("year", year);
      if (color) params.set("color", color);
      const response = await apiFetch(`/renders/car?${params.toString()}`).catch(() => null);
      if (cancelled) return;
      if (response && response.ok) {
        const url = URL.createObjectURL(await response.blob());
        if (cancelled) { URL.revokeObjectURL(url); return; }
        setImages((current) => ({ ...current, [next]: url }));
        return;
      }
      setImages((current) => ({ ...current, [next]: null }));
      // Only a missing service or the monthly cap stop the other views; a single
      // view the catalog cannot render just shows the outline.
      if (!response || response.status === 503 || response.status === 429) {
        setDisabled(true);
        setNotice(response?.status === 429 ? "Limite mensile di foto raggiunto: uso lo schema del veicolo." : "Foto reali non disponibili: uso lo schema del veicolo.");
      } else if (response.status === 404 && next !== "top") {
        setNotice("Modello non presente nel catalogo foto: uso lo schema del veicolo.");
      }
    })();
    return () => { cancelled = true; };
  }, [make, model, year, color, view, disabled, images, ready]);

  function turn(step: number) {
    const index = ring.indexOf(view);
    const from = index < 0 ? 0 : index;
    setView(ring[(from + step + ring.length) % ring.length]);
    setPending(null);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, startIndex: Math.max(0, ring.indexOf(view)), moved: false };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current || view === "top") return;
    const steps = Math.trunc((event.clientX - drag.current.x) / DRAG_STEP_PX);
    if (steps !== 0) drag.current.moved = true;
    const target = ring[(((drag.current.startIndex - steps) % ring.length) + ring.length) % ring.length];
    if (target !== view) { setView(target); setPending(null); }
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    drag.current = null;
    if (!state || state.moved || !onAdd) return;
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
  const loaded = ring.filter((code) => images[code]).length;
  return (
    <div className="damage-photo-map">
      <div className="turntable-bar">
        <button type="button" className="turn-button" aria-label={t("Ruota a sinistra")} onClick={() => turn(-1)}>◀</button>
        <strong>{t(viewNames[view])}</strong>
        <button type="button" className="turn-button" aria-label={t("Ruota a destra")} onClick={() => turn(1)}>▶</button>
        <button type="button" className={`roof-button${view === "top" ? " active" : ""}`} onClick={() => { setView(view === "top" ? "front-3-4" : "top"); setPending(null); }}>
          {view === "top" ? t("Vista laterale") : t("Tetto")}
        </button>
      </div>
      <div
        className={`damage-canvas${onAdd ? " editable" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { drag.current = null; }}
        aria-label={t("Trascina per ruotare il veicolo, tocca per segnare un danno")}
      >
        {image ? (
          <img src={image} alt={`${make} ${model} · ${t(viewNames[view])}`} draggable={false} />
        ) : image === null || disabled || !ready ? <Silhouette view={view} /> : <div className="damage-loading">{t("Caricamento…")}</div>}
        {visible.map((marker) => (
          <span key={marker.id} className="damage-pin" style={{ left: `${marker.x * 100}%`, top: `${marker.y * 100}%`, background: operationStyle[marker.operation].color }} title={`${marker.area_label} · ${t(operationStyle[marker.operation].label)}`}>
            {markers.indexOf(marker) + 1}
          </span>
        ))}
        {pending && <span className="damage-pin pending" style={{ left: `${pending.x * 100}%`, top: `${pending.y * 100}%` }} />}
      </div>
      <div className="turntable-dots" aria-hidden="true">
        {ring.map((code) => (
          <i key={code} className={`${code === view ? "current" : ""}${markers.some((marker) => marker.view === code) ? " marked" : ""}`} />
        ))}
      </div>
      {ready && !disabled && loaded < ring.length && <p className="hint">{t("Caricamento vista 360°")} {loaded}/{ring.length}</p>}
      {pending && (
        <div className="damage-chooser" role="group" aria-label={t("Tipo di intervento")}>
          <span>{areaLabel(view, pending.x, pending.y)}</span>
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
            <li key={marker.id}>
              <button type="button" className="damage-dot" style={{ background: operationStyle[marker.operation].color }} aria-label={t("Mostra")} onClick={() => { setView(marker.view); setPending(null); }}>{index + 1}</button>
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
