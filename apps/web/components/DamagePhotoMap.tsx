"use client";

import { PointerEvent, useEffect, useRef, useState } from "react";
import { useLanguage } from "./LanguageProvider";
import { apiFetch } from "../lib/api";
import { bestView, partPoints, partZone, zoneNames } from "../lib/partZones";
import { PartIcon } from "./PartIcon";

export type MarkerView =
  | "front" | "front-3-4" | "side" | "rear-3-4" | "rear" | "rear-3-4-right" | "side-right" | "front-3-4-right" | "top";
export type MarkerOperation = "CHECK" | "REPAIR" | "REPLACE" | "PAINT";
export type DamageMarker = { id: string; view: MarkerView; x: number; y: number; operation: MarkerOperation; area_label: string };
/** A photo of the case, optionally pinned to a damage marker. */
export type MapPhoto = { id: string; url: string; markerId?: string | null; category: string };
export type VehicleLook = { make?: string; model?: string; year?: string | number | null; color?: string };

// Turntable frames every 45°, walking around the car. The roof is a separate view.
const ring: MarkerView[] = ["front", "front-3-4", "side", "rear-3-4", "rear", "rear-3-4-right", "side-right", "front-3-4-right"];
const STEP = 360 / ring.length;
const DEGREES_PER_PX = 0.55;

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

// Where the number plate sits on each studio picture (share of the cropped picture box,
// sized to a real 520 mm EU plate on a ~1.65 m wide car),
// with the turn of the plate for three-quarter views. Pure side and roof views have none.
const platePlacement: Partial<Record<MarkerView, { x: number; y: number; width: number; turn: number }>> = {
  "front": { x: 0.5, y: 0.634, width: 0.28, turn: 0 },
  "rear": { x: 0.5, y: 0.592, width: 0.3, turn: 0 },
  "front-3-4": { x: 0.23, y: 0.673, width: 0.26, turn: -40 },
  "front-3-4-right": { x: 0.771, y: 0.671, width: 0.26, turn: 40 },
  "rear-3-4": { x: 0.786, y: 0.605, width: 0.25, turn: 40 },
  "rear-3-4-right": { x: 0.215, y: 0.593, width: 0.25, turn: -40 },
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

export type PlateSpotValue = { x: number; y: number; width: number; turn: number };

function Plate({ spot, plate, editing, onMove }: {
  spot: PlateSpotValue;
  plate: string;
  editing?: boolean;
  onMove?: (x: number, y: number) => void;
}) {
  function start(event: PointerEvent<HTMLSpanElement>) {
    if (!editing || !onMove) return;
    event.stopPropagation();
    const element = event.currentTarget;
    element.setPointerCapture(event.pointerId);
    const frame = element.closest(".car-frame")?.getBoundingClientRect();
    if (!frame) return;
    const move = (moveEvent: globalThis.PointerEvent) => {
      onMove(
        Math.min(1, Math.max(0, (moveEvent.clientX - frame.left) / frame.width)),
        Math.min(1, Math.max(0, (moveEvent.clientY - frame.top) / frame.height)),
      );
    };
    const stop = () => {
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", stop);
      element.removeEventListener("pointercancel", stop);
    };
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", stop);
    element.addEventListener("pointercancel", stop);
  }
  return (
    <span
      className={`vehicle-plate${editing ? " editing" : ""}`}
      style={{
        left: `${spot.x * 100}%`,
        top: `${spot.y * 100}%`,
        width: `${spot.width * 100}%`,
        transform: `translate(-50%, -50%) perspective(400px) rotateY(${spot.turn}deg)`,
      }}
      aria-hidden={!editing}
      onPointerDown={start}
      onPointerUp={(event) => { if (editing) event.stopPropagation(); }}
    >
      <i>I</i><b>{plate}</b><i />
    </span>
  );
}

type Props = {
  vehicle: VehicleLook;
  plate?: string;
  markers: DamageMarker[];
  onAdd?: (marker: Omit<DamageMarker, "id">) => void | DamageMarker | Promise<void | DamageMarker>;
  onRemove?: (marker: DamageMarker) => void | Promise<void>;
  /** Fetch a picture from another endpoint (customer link / portal) instead of the staff API. */
  loadRender?: (view: MarkerView, version: string) => Promise<Response>;
  /** Photos of the case: shown on their damage pin, or on the matching view (front, rear, sides). */
  photos?: MapPhoto[];
  /** Attach a new photo to a damage pin (workshop only). */
  onAttachPhoto?: (marker: DamageMarker, file: File) => void | Promise<void>;
  /** Plate positions saved for this make/model (override the defaults). */
  plateSpots?: Partial<Record<MarkerView, PlateSpotValue>>;
  /** Workshop: save (or reset with null) the plate position of a view for this model. */
  onPlateSpotSave?: (view: MarkerView, spot: PlateSpotValue | null) => void | Promise<void>;
  /** Parts / mechanical jobs: each is pinned where it sits on the car (engine, wheels, exhaust…). */
  parts?: { id: string; label: string }[];
  /** Workshop: change the paint of the car (saved on the vehicle). */
  onColorChange?: (color: string) => void | Promise<void>;
};

// Paint choices offered under the car: stored name (Italian) + swatch colour + catalog code.
export const paintSwatches: { name: string; hex: string; code: string }[] = [
  { name: "Bianco", hex: "#f5f5f3", code: "white" },
  { name: "Nero", hex: "#15171a", code: "black" },
  { name: "Grigio", hex: "#6d737a", code: "gray" },
  { name: "Argento", hex: "#c3c8cd", code: "silver" },
  { name: "Blu", hex: "#1c3f94", code: "blue" },
  { name: "Azzurro", hex: "#3fa7d6", code: "cyan" },
  { name: "Rosso", hex: "#c0141c", code: "red" },
  { name: "Verde", hex: "#23703a", code: "green" },
  { name: "Giallo", hex: "#f2c313", code: "yellow" },
  { name: "Arancione", hex: "#ee7418", code: "orange" },
  { name: "Marrone", hex: "#6b4128", code: "brown" },
  { name: "Beige", hex: "#d9c7a3", code: "beige" },
  { name: "Oro", hex: "#b8932f", code: "gold" },
  { name: "Viola", hex: "#5b2a86", code: "purple" },
];

const paintKeywords: [string, string][] = [
  ["argent", "silver"], ["silver", "silver"], ["grigio", "gray"], ["antracite", "gray"], ["gray", "gray"], ["grey", "gray"],
  ["nero", "black"], ["black", "black"], ["bianc", "white"], ["white", "white"], ["rosso", "red"], ["bordeaux", "red"], ["red", "red"],
  ["azzurr", "cyan"], ["blu", "blue"], ["verde", "green"], ["green", "green"], ["giall", "yellow"], ["arancio", "orange"],
  ["marron", "brown"], ["bronzo", "brown"], ["beige", "beige"], ["sabbia", "beige"], ["oro", "gold"], ["viola", "purple"],
];

/** Catalog colour code of a free-text colour (same rules as the server), or the hex value. */
export function paintCode(color?: string | null) {
  const text = (color || "").trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(text)) return text;
  if (!text) return "silver";
  const exact = paintSwatches.find((swatch) => swatch.code === text || swatch.name.toLowerCase() === text);
  if (exact) return exact.code;
  return paintKeywords.find(([keyword]) => text.includes(keyword))?.[1] || "silver";
}

// Photo categories that belong to one side of the turntable.
const viewOfCategory: Record<string, MarkerView> = { FRONT: "front", REAR: "rear", LEFT: "side", RIGHT: "side-right" };

const RENDER_VERSION = "4";

const normalizeAngle = (value: number) => ((value % 360) + 360) % 360;

/**
 * The vehicle on a workshop turntable: drag to turn it (smooth cross-fade between the
 * 8 real pictures, with inertia), release to settle on the nearest picture, tap to pin a damage.
 */
export function DamagePhotoMap({ vehicle, plate, markers, onAdd, onRemove, loadRender, photos = [], onAttachPhoto, onColorChange, plateSpots, onPlateSpotSave, parts = [] }: Props) {
  const { t } = useLanguage();
  const [angle, setAngle] = useState(STEP);
  const [roof, setRoof] = useState(false);
  const [images, setImages] = useState<Partial<Record<MarkerView, string | null>>>({});
  const [ratios, setRatios] = useState<Partial<Record<MarkerView, number>>>({});
  const [disabled, setDisabled] = useState(false);
  const [notice, setNotice] = useState("");
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; start: number; moved: boolean; lastX: number; lastT: number; velocity: number } | null>(null);
  const animation = useRef<number | null>(null);
  const [lightbox, setLightbox] = useState<{ items: MapPhoto[]; index: number; title: string } | null>(null);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [attaching, setAttaching] = useState<string | null>(null);
  const [editSpot, setEditSpot] = useState<PlateSpotValue | null>(null);
  const customTimer = useRef<number | null>(null);
  // The native colour dialog fires on every move: only the colour kept for a moment is applied
  // (each new colour costs render credits the first time).
  function pickCustom(value: string) {
    if (customTimer.current) window.clearTimeout(customTimer.current);
    customTimer.current = window.setTimeout(() => { onColorChange?.(value); }, 1200);
  }
  const renderLoader = useRef(loadRender);
  renderLoader.current = loadRender;
  const make = (vehicle.make || "").trim();
  const model = (vehicle.model || "").trim();
  const color = (vehicle.color || "").trim();
  const year = vehicle.year ? String(vehicle.year) : "";
  const ready = Boolean(make && model);

  const settled = Math.abs(angle - Math.round(angle / STEP) * STEP) < 0.5;
  const index = ((Math.round(angle / STEP) % ring.length) + ring.length) % ring.length;
  const view: MarkerView = roof ? "top" : ring[index];

  useEffect(() => {
    setImages((current) => {
      Object.values(current).forEach((url) => { if (url) URL.revokeObjectURL(url); });
      return {};
    });
    setRatios({});
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
      // "v" follows the server crop version, so browsers drop pictures cached before a re-crop.
      const params = new URLSearchParams({ make, model, view: next, v: RENDER_VERSION });
      if (year) params.set("year", year);
      if (color) params.set("color", color);
      const fetchOnce = () => (renderLoader.current
        ? renderLoader.current(next, RENDER_VERSION)
        : apiFetch(`/renders/car?${params.toString()}`)).catch(() => null);
      // A model never asked before is drawn on the fly by the catalog and can time out: retry.
      let response = await fetchOnce();
      for (const wait of [2000, 6000]) {
        if (cancelled || (response && response.status !== 502 && response.status !== 504)) break;
        await new Promise((resolve) => window.setTimeout(resolve, wait));
        if (!cancelled) response = await fetchOnce();
      }
      if (cancelled) return;
      if (response && response.ok) {
        const url = URL.createObjectURL(await response.blob());
        if (cancelled) { URL.revokeObjectURL(url); return; }
        const picture = new Image();
        picture.onload = () => setRatios((current) => ({ ...current, [next]: picture.naturalWidth / Math.max(1, picture.naturalHeight) }));
        picture.src = url;
        setImages((current) => ({ ...current, [next]: url }));
        return;
      }
      setImages((current) => ({ ...current, [next]: null }));
      // Only a missing service or the monthly cap stop the other views.
      if (!response || response.status === 503 || response.status === 429) {
        setDisabled(true);
        setNotice(response?.status === 429 ? "Limite mensile di foto raggiunto: uso lo schema del veicolo." : "Foto reali non disponibili: uso lo schema del veicolo.");
      } else if (response.status === 404 && next !== "top") {
        setNotice("Modello non presente nel catalogo foto: uso lo schema del veicolo.");
      }
    })();
    return () => { cancelled = true; };
  }, [make, model, year, color, view, disabled, images, ready]);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setStageSize({ width: element.clientWidth, height: element.clientHeight }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => () => { if (animation.current) cancelAnimationFrame(animation.current); }, []);

  function animateTo(target: number, velocity = 0) {
    if (animation.current) cancelAnimationFrame(animation.current);
    let current = angle;
    let speed = velocity;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(48, now - last) / 1000;
      last = now;
      if (Math.abs(speed) > 25) {
        // Inertia: keep spinning and slow down like a real turntable.
        current += speed * dt;
        speed *= Math.pow(0.12, dt);
        target = Math.round(current / STEP) * STEP;
      } else {
        const delta = target - current;
        current += delta * Math.min(1, dt * 12);
        if (Math.abs(delta) < 0.4) {
          setAngle(target);
          animation.current = null;
          return;
        }
      }
      setAngle(current);
      animation.current = requestAnimationFrame(tick);
    };
    animation.current = requestAnimationFrame(tick);
  }

  function turn(step: number) {
    setRoof(false);
    setPending(null);
    animateTo(Math.round(angle / STEP) * STEP + step * STEP);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (editSpot) return;
    if (animation.current) { cancelAnimationFrame(animation.current); animation.current = null; }
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, start: angle, moved: false, lastX: event.clientX, lastT: performance.now(), velocity: 0 };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const state = drag.current;
    if (!state || roof) return;
    const dx = event.clientX - state.x;
    if (Math.abs(dx) > 4) state.moved = true;
    const now = performance.now();
    const dt = Math.max(1, now - state.lastT);
    state.velocity = (-(event.clientX - state.lastX) * DEGREES_PER_PX) / (dt / 1000);
    state.lastX = event.clientX;
    state.lastT = now;
    if (state.moved) {
      setPending(null);
      setAngle(state.start - dx * DEGREES_PER_PX);
    }
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    if (editSpot) { drag.current = null; return; }
    const state = drag.current;
    drag.current = null;
    if (!state) return;
    if (state.moved) {
      const fresh = performance.now() - state.lastT < 80;
      animateTo(Math.round(angle / STEP) * STEP, fresh ? state.velocity : 0);
      return;
    }
    if (!settled && !roof) return;
    const stage = event.currentTarget.querySelector<HTMLElement>(".car-frame");
    if (!stage) return;
    const box = stage.getBoundingClientRect();
    // A tap on an existing pin opens its photos instead of adding a new pin.
    const hit = markers.find((marker) => marker.view === view
      && Math.hypot(box.left + marker.x * box.width - event.clientX, box.top + marker.y * box.height - event.clientY) < 18);
    if (hit) {
      const items = photos.filter((photo) => photo.markerId === hit.id);
      if (items.length) setLightbox({ items, index: 0, title: `${markers.indexOf(hit) + 1} · ${hit.area_label}` });
      return;
    }
    if (!onAdd) return;
    const x = (event.clientX - box.left) / box.width;
    const y = (event.clientY - box.top) / box.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    setPending({ x: Math.round(x * 10000) / 10000, y: Math.round(y * 10000) / 10000 });
  }

  async function choose(operation: MarkerOperation) {
    if (!pending || !onAdd) return;
    const created = await onAdd({ view, x: pending.x, y: pending.y, operation, area_label: areaLabel(view, pending.x, pending.y) });
    setPending(null);
    if (created && onAttachPhoto) setJustAdded(created.id);
  }

  // Two neighbouring pictures cross-fade while the turntable moves.
  const base = Math.floor(angle / STEP);
  const fraction = angle / STEP - base;
  const eased = fraction * fraction * (3 - 2 * fraction);
  const layers: { code: MarkerView; opacity: number }[] = roof
    ? [{ code: "top", opacity: 1 }]
    : [
        { code: ring[((base % ring.length) + ring.length) % ring.length], opacity: 1 - eased },
        { code: ring[(((base + 1) % ring.length) + ring.length) % ring.length], opacity: eased },
      ];
  // Every picture is cropped to the car body, so drawing them all at the same height keeps
  // the car at the same scale while it turns (the side views are just wider).
  const ratio = ratios[view] || (view === "side" || view === "side-right" ? 2.1 : 1.5);
  const widest = roof ? ratio : Math.max(2.2, ...ring.map((code) => ratios[code] || 0));
  const maxWidth = stageSize.width * 0.92;
  const maxHeight = stageSize.height * (roof ? 0.88 : 0.66);
  const stageHeight = Math.min(maxHeight, maxWidth / widest);
  const stageWidth = stageHeight * widest;
  const frameWidth = stageHeight * ratio;
  const visible = settled || roof ? markers.filter((marker) => marker.view === view) : [];
  const loaded = ring.filter((code) => images[code]).length;
  const showPlate = Boolean(plate && images[view] && (settled || roof));
  const savedSpot = plateSpots?.[view];
  const plateSpot: PlateSpotValue | undefined = editSpot || savedSpot || platePlacement[view];
  const canEditPlate = Boolean(onPlateSpotSave && showPlate && platePlacement[view] && !roof);
  const nudge = (change: Partial<PlateSpotValue>) => setEditSpot((current) => current && ({
    ...current, ...change,
    width: Math.min(0.8, Math.max(0.05, change.width ?? current.width)),
    turn: Math.min(80, Math.max(-80, change.turn ?? current.turn)),
  }));
  async function savePlate(spot: PlateSpotValue | null) {
    if (!onPlateSpotSave) return;
    await onPlateSpotSave(view, spot);
    setEditSpot(null);
  }
  const placedParts = parts.map((part, position) => ({ ...part, zone: partZone(part.label), letter: String.fromCharCode(65 + (position % 26)) }));
  const visibleParts = settled && !roof ? placedParts.flatMap((part) => (part.zone ? partPoints(part.zone, view) : []).map(([x, y], index) => ({ ...part, x, y, key: `${part.id}-${index}` }))) : [];
  function showPart(zone: ReturnType<typeof partZone>) {
    if (!zone) return;
    setRoof(false);
    const target = ring.indexOf(bestView[zone]) * STEP;
    const current = normalizeAngle(angle);
    let delta = target - current;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    animateTo(angle + delta);
  }
  const viewPhotos = photos.filter((photo) => !photo.markerId && viewOfCategory[photo.category] === view);
  const photosOf = (marker: DamageMarker) => photos.filter((photo) => photo.markerId === marker.id);

  async function attach(marker: DamageMarker, file: File | undefined) {
    if (!file || !onAttachPhoto) return;
    setAttaching(marker.id);
    try {
      await onAttachPhoto(marker, file);
      setJustAdded(null);
    } finally {
      setAttaching(null);
    }
  }

  return (
    <div className="damage-photo-map">
      <div className="turntable-bar">
        <button type="button" className="turn-button" aria-label={t("Ruota a sinistra")} disabled={Boolean(editSpot)} onClick={() => turn(-1)}>◀</button>
        <strong>{t(viewNames[view])}</strong>
        <button type="button" className="turn-button" aria-label={t("Ruota a destra")} disabled={Boolean(editSpot)} onClick={() => turn(1)}>▶</button>
        <button type="button" className={`roof-button${roof ? " active" : ""}`} onClick={() => { setRoof(!roof); setPending(null); }}>
          {roof ? t("Vista laterale") : t("Tetto")}
        </button>
        {canEditPlate && !editSpot && (
          <button type="button" className="roof-button" title={t("Allinea la targa su questo modello")} onClick={() => { setPending(null); setEditSpot({ ...(plateSpot as PlateSpotValue) }); }}>
            ✎ {t("Targa")}
          </button>
        )}
        {viewPhotos.length > 0 && (settled || roof) && (
          <button type="button" className="roof-button" onClick={() => setLightbox({ items: viewPhotos, index: 0, title: t(viewNames[view]) })}>
            📷 {viewPhotos.length}
          </button>
        )}
      </div>
      <div
        ref={canvas}
        className={`damage-canvas workshop-scene${onAdd ? " editable" : ""}${roof ? " roof" : ""}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { drag.current = null; }}
        aria-label={onAdd ? t("Trascina per ruotare il veicolo, tocca per segnare un danno") : t("Trascina per ruotare il veicolo")}
      >
        <div className="workshop-wall" aria-hidden="true" />
        <div className="workshop-floor" aria-hidden="true" />
        {!roof && (
          <div className="turntable" aria-hidden="true" style={{ transform: `translateX(-50%) perspective(700px) rotateX(74deg) rotateZ(${normalizeAngle(angle)}deg)` }} />
        )}
        <div className="car-stage" style={{ width: stageWidth || undefined, height: stageHeight || undefined }}>
          {layers.map(({ code, opacity }) => {
            const url = images[code];
            if (opacity < 0.01) return null;
            if (url) return <img key={code} src={url} alt={opacity > 0.5 ? `${make} ${model} · ${t(viewNames[code])}` : ""} draggable={false} style={{ opacity }} />;
            if (url === null || disabled || !ready) return <div key={code} className="stage-layer" style={{ opacity }}><Silhouette view={code} /></div>;
            return <div key={code} className="damage-loading stage-layer" style={{ opacity }}>{t("Caricamento…")}</div>;
          })}
          <div className="car-frame" style={{ width: frameWidth || undefined }}>
          {showPlate && plate && plateSpot && (
            <Plate
              spot={plateSpot}
              plate={plate.toUpperCase()}
              editing={Boolean(editSpot)}
              onMove={(x, y) => setEditSpot((current) => current && { ...current, x: Math.round(x * 10000) / 10000, y: Math.round(y * 10000) / 10000 })}
            />
          )}
          {visible.map((marker) => (
            <span key={marker.id} className={`damage-pin${photosOf(marker).length ? " has-photo" : ""}`} style={{ left: `${marker.x * 100}%`, top: `${marker.y * 100}%`, background: operationStyle[marker.operation].color }} title={`${marker.area_label} · ${t(operationStyle[marker.operation].label)}`}>
              {markers.indexOf(marker) + 1}
            </span>
          ))}
          {visibleParts.map((part) => (
            // X-ray lens: the body becomes see-through and the part appears in its place.
            <span key={part.key} className="part-lens" style={{ left: `${part.x * 100}%`, top: `${part.y * 100}%` }} title={part.label}>
              <span className="part-lens-glass" aria-hidden="true" />
              <PartIcon zone={part.zone} size={30} />
              <b>{part.letter}</b>
            </span>
          ))}
          {pending && <span className="damage-pin pending" style={{ left: `${pending.x * 100}%`, top: `${pending.y * 100}%` }} />}
          </div>
        </div>
      </div>
      {editSpot && (
        <div className="plate-editor" role="group" aria-label={t("Allinea la targa")}>
          <p className="hint">{t("Trascina la targa nel suo alloggio. Vale per tutti i veicoli di questo modello.")}</p>
          <div>
            <button type="button" onClick={() => nudge({ width: editSpot.width - 0.01 })} aria-label={t("Più piccola")}>－</button>
            <button type="button" onClick={() => nudge({ width: editSpot.width + 0.01 })} aria-label={t("Più grande")}>＋</button>
            <button type="button" onClick={() => nudge({ turn: editSpot.turn - 4 })} aria-label={t("Ruota a sinistra")}>⟲</button>
            <button type="button" onClick={() => nudge({ turn: editSpot.turn + 4 })} aria-label={t("Ruota a destra")}>⟳</button>
            <button type="button" onClick={() => nudge({ y: Math.max(0, editSpot.y - 0.004) })} aria-label={t("Su")}>▲</button>
            <button type="button" onClick={() => nudge({ y: Math.min(1, editSpot.y + 0.004) })} aria-label={t("Giù")}>▼</button>
            <button type="button" onClick={() => nudge({ x: Math.max(0, editSpot.x - 0.004) })} aria-label={t("Sinistra")}>◀</button>
            <button type="button" onClick={() => nudge({ x: Math.min(1, editSpot.x + 0.004) })} aria-label={t("Destra")}>▶</button>
          </div>
          <div>
            <button type="button" className="primary" onClick={() => savePlate(editSpot)}>{t("Salva posizione")}</button>
            {savedSpot && <button type="button" className="ghost" onClick={() => savePlate(null)}>{t("Ripristina")}</button>}
            <button type="button" className="secondary" onClick={() => setEditSpot(null)}>{t("Annulla")}</button>
          </div>
        </div>
      )}
      {onColorChange && ready && !editSpot && (
        <div className="paint-picker" role="group" aria-label={t("Colore del veicolo")}>
          <span>{t("Colore")}</span>
          {paintSwatches.map((swatch) => (
            <button
              key={swatch.code}
              type="button"
              className={`paint-swatch${paintCode(color) === swatch.code ? " active" : ""}`}
              style={{ background: swatch.hex }}
              title={t(swatch.name)}
              aria-label={t(swatch.name)}
              aria-pressed={paintCode(color) === swatch.code}
              onClick={() => onColorChange(swatch.name)}
            />
          ))}
          <label className={`paint-swatch custom${/^#/.test(color) ? " active" : ""}`} title={t("Altro colore")} style={/^#/.test(color) ? { background: color } : undefined}>
            <span aria-hidden="true">＋</span>
            <input type="color" aria-label={t("Altro colore")} value={/^#[0-9a-f]{6}$/i.test(color) ? color : "#808080"} onChange={(event) => pickCustom(event.target.value)} />
          </label>
          <small>{t(paintSwatches.find((swatch) => swatch.code === paintCode(color))?.name || (color || "Argento"))}</small>
        </div>
      )}
      <div className="turntable-dots" aria-hidden="true">
        {ring.map((code) => (
          <i key={code} className={`${!roof && code === view ? "current" : ""}${markers.some((marker) => marker.view === code) ? " marked" : ""}`} />
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
          {markers.map((marker, position) => (
            <li key={marker.id}>
              <button
                type="button"
                className="damage-dot"
                style={{ background: operationStyle[marker.operation].color }}
                aria-label={t("Mostra")}
                onClick={() => {
                  setPending(null);
                  if (marker.view === "top") { setRoof(true); return; }
                  setRoof(false);
                  const target = ring.indexOf(marker.view) * STEP;
                  const current = normalizeAngle(angle);
                  let delta = target - current;
                  if (delta > 180) delta -= 360;
                  if (delta < -180) delta += 360;
                  animateTo(angle + delta);
                }}
              >{position + 1}</button>
              <span>{marker.area_label}</span>
              <strong style={{ color: operationStyle[marker.operation].color }}>{t(operationStyle[marker.operation].label)}</strong>
              {photosOf(marker).length > 0 && (
                <span className="damage-thumbs">
                  {photosOf(marker).map((photo, photoIndex) => (
                    <button key={photo.id} type="button" onClick={() => setLightbox({ items: photosOf(marker), index: photoIndex, title: `${position + 1} · ${marker.area_label}` })}>
                      <img src={photo.url} alt={`${t("Foto")} ${position + 1}`} loading="lazy" />
                    </button>
                  ))}
                </span>
              )}
              {onAttachPhoto && (
                <label className={`damage-photo-add${justAdded === marker.id ? " highlight" : ""}`} title={t("Aggiungi foto di questo danno")}>
                  {attaching === marker.id ? "…" : `📷${justAdded === marker.id ? ` ${t("Foto")}` : ""}`}
                  <input type="file" accept="image/*" capture="environment" hidden disabled={attaching !== null} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; attach(marker, file); }} />
                </label>
              )}
              {onRemove && <button type="button" className="ghost" aria-label={t("Elimina")} onClick={() => onRemove(marker)}>✕</button>}
            </li>
          ))}
        </ol>
      )}
      {placedParts.length > 0 && (
        <div className="parts-list">
          <strong>🔧 {t("Ricambi e interventi")}</strong>
          <ol>
            {placedParts.map((part) => (
              <li key={part.id}>
                <button type="button" className="part-thumb" disabled={!part.zone} onClick={() => showPart(part.zone)} aria-label={`${t("Mostra")} ${part.label}`}>
                  <PartIcon zone={part.zone} size={30} />
                  <b>{part.letter}</b>
                </button>
                <span>{part.label}</span>
                <small>{part.zone ? t(zoneNames[part.zone]) : t("Posizione non indicata")}</small>
              </li>
            ))}
          </ol>
        </div>
      )}
      {lightbox && (
        <div className="photo-lightbox" role="dialog" aria-modal="true" aria-label={lightbox.title} onClick={() => setLightbox(null)}>
          <figure onClick={(event) => event.stopPropagation()}>
            <img src={lightbox.items[lightbox.index].url} alt={lightbox.title} />
            <figcaption>
              <span>{lightbox.title}{lightbox.items.length > 1 ? ` · ${lightbox.index + 1}/${lightbox.items.length}` : ""}</span>
              {lightbox.items.length > 1 && (
                <>
                  <button type="button" aria-label={t("Precedente")} onClick={() => setLightbox({ ...lightbox, index: (lightbox.index - 1 + lightbox.items.length) % lightbox.items.length })}>◀</button>
                  <button type="button" aria-label={t("Successiva")} onClick={() => setLightbox({ ...lightbox, index: (lightbox.index + 1) % lightbox.items.length })}>▶</button>
                </>
              )}
              <button type="button" onClick={() => setLightbox(null)}>{t("Chiudi")}</button>
            </figcaption>
          </figure>
        </div>
      )}
    </div>
  );
}
