import type { MarkerView } from "../components/DamagePhotoMap";

/** Where a mechanical part sits on the car, drawn on the 3D turntable. */
export type PartZone =
  | "ENGINE" | "BATTERY" | "FRONT_WHEELS" | "REAR_WHEELS" | "ALL_WHEELS" | "EXHAUST" | "GEARBOX"
  | "FRONT_LIGHTS" | "REAR_LIGHTS" | "WINDSHIELD" | "CABIN" | "RADIATOR" | "FUEL";

export const zoneNames: Record<PartZone, string> = {
  ENGINE: "Vano motore", BATTERY: "Batteria (vano motore)", FRONT_WHEELS: "Ruote / freni anteriori",
  REAR_WHEELS: "Ruote / freni posteriori", ALL_WHEELS: "Tutte le ruote", EXHAUST: "Scarico",
  GEARBOX: "Frizione / cambio", FRONT_LIGHTS: "Fari anteriori", REAR_LIGHTS: "Fanali posteriori",
  WINDSHIELD: "Parabrezza / tergicristalli", CABIN: "Abitacolo", RADIATOR: "Radiatore / clima", FUEL: "Serbatoio / alimentazione",
};

// First matching rule wins: more specific words before generic ones.
const rules: [RegExp, PartZone][] = [
  [/pneumatic|gomm|cerchi|convergenz|equilibratur|neumátic|llanta|ruote|ruedas/i, "ALL_WHEELS"],
  [/(fren|pastigl|disch|pinz|pastill|discos?).*(post|tras)|(post|tras).*(fren|pastigl|disch|pastill)/i, "REAR_WHEELS"],
  [/ammortizzator.*(post|tras)|amortiguador.*tras|ganasc|tambur/i, "REAR_WHEELS"],
  [/fren|pastigl|disch|pinz|pastill|ammortizzator|amortiguador|sospension|suspensi|braccio|bracci|testin|semiass|cuscinett|rodamiento|sterzo|direcci/i, "FRONT_WHEELS"],
  [/batteri|bater/i, "BATTERY"],
  [/marmitt|scaric|escape|silenziat|catalizzat|fap|dpf|sonda lambda/i, "EXHAUST"],
  [/frizion|embrague|cambio|volano|trasmission|caja de cambio/i, "GEARBOX"],
  [/radiator|clima|condizionat|aire acondicionado|refriger|termostat|pompa acqua|bomba de agua/i, "RADIATOR"],
  [/fari|faro|lampad|anabbagliant|luci anterior|faros|luces delanter/i, "FRONT_LIGHTS"],
  [/fanal|stop|luci poster|luces traser|pilotos/i, "REAR_LIGHTS"],
  [/parabrezz|tergicristall|spazzol|limpiaparabrisas|parabrisas/i, "WINDSHIELD"],
  [/serbatoi|carburant|pompa benzina|iniettor|inyector|dep[oó]sito|combustible/i, "FUEL"],
  [/cruscott|quadro|airbag|sedil|abitacol|autoradio|chiusur|alzacristall|salpicadero|asiento/i, "CABIN"],
  [/olio|filtr|tagliand|motor|candel|distribuz|cinghi|alternator|motorin|turbo|egr|iniezion|bobin|aceite|correa|bujía|diagnos|elettric|centralin/i, "ENGINE"],
];

export function partZone(description: string): PartZone | null {
  const text = description || "";
  return rules.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

type Point = [number, number];
// Schematic anchor points (share of the cropped picture) on each view.
// "side" shows the left flank with the nose on the left; "-right" views are mirrored.
const base: Partial<Record<MarkerView, Partial<Record<PartZone, Point[]>>>> = {
  "front": {
    ENGINE: [[0.5, 0.42]], BATTERY: [[0.36, 0.42]], RADIATOR: [[0.5, 0.64]], FRONT_WHEELS: [[0.14, 0.86], [0.86, 0.86]],
    ALL_WHEELS: [[0.14, 0.86], [0.86, 0.86]], FRONT_LIGHTS: [[0.2, 0.5], [0.8, 0.5]], WINDSHIELD: [[0.5, 0.26]], CABIN: [[0.5, 0.2]],
  },
  "rear": {
    REAR_WHEELS: [[0.14, 0.86], [0.86, 0.86]], ALL_WHEELS: [[0.14, 0.86], [0.86, 0.86]], EXHAUST: [[0.3, 0.9]],
    REAR_LIGHTS: [[0.14, 0.42], [0.86, 0.42]], CABIN: [[0.5, 0.22]],
  },
  "side": {
    ENGINE: [[0.14, 0.44]], BATTERY: [[0.18, 0.44]], RADIATOR: [[0.05, 0.6]], FRONT_WHEELS: [[0.2, 0.76]], REAR_WHEELS: [[0.79, 0.76]],
    ALL_WHEELS: [[0.2, 0.76], [0.79, 0.76]], EXHAUST: [[0.93, 0.88]], GEARBOX: [[0.32, 0.8]], FRONT_LIGHTS: [[0.05, 0.47]],
    REAR_LIGHTS: [[0.95, 0.4]], WINDSHIELD: [[0.33, 0.28]], CABIN: [[0.52, 0.4]], FUEL: [[0.84, 0.5]],
  },
  "front-3-4": {
    ENGINE: [[0.27, 0.43]], BATTERY: [[0.33, 0.43]], RADIATOR: [[0.23, 0.63]], FRONT_WHEELS: [[0.34, 0.8], [0.07, 0.72]],
    REAR_WHEELS: [[0.86, 0.74]], ALL_WHEELS: [[0.34, 0.8], [0.86, 0.74]], GEARBOX: [[0.45, 0.82]],
    FRONT_LIGHTS: [[0.1, 0.5], [0.42, 0.52]], WINDSHIELD: [[0.4, 0.26]], CABIN: [[0.62, 0.36]], FUEL: [[0.9, 0.5]],
  },
  "rear-3-4": {
    FRONT_WHEELS: [[0.13, 0.78]], REAR_WHEELS: [[0.57, 0.8], [0.9, 0.74]], ALL_WHEELS: [[0.13, 0.78], [0.57, 0.8]],
    EXHAUST: [[0.8, 0.88]], REAR_LIGHTS: [[0.66, 0.42], [0.95, 0.42]], CABIN: [[0.38, 0.38]], FUEL: [[0.5, 0.5]], GEARBOX: [[0.25, 0.82]],
  },
};

function mirror(points: Partial<Record<PartZone, Point[]>> | undefined) {
  if (!points) return undefined;
  return Object.fromEntries(Object.entries(points).map(([zone, list]) => [zone, (list || []).map(([x, y]) => [1 - x, y] as Point)])) as Partial<Record<PartZone, Point[]>>;
}

const anchors: Partial<Record<MarkerView, Partial<Record<PartZone, Point[]>>>> = {
  ...base,
  "side-right": mirror(base.side),
  "front-3-4-right": mirror(base["front-3-4"]),
  "rear-3-4-right": mirror(base["rear-3-4"]),
};

// View that shows each zone best, used to turn the car when a part is selected.
export const bestView: Record<PartZone, MarkerView> = {
  ENGINE: "front-3-4", BATTERY: "front-3-4", FRONT_WHEELS: "front-3-4", REAR_WHEELS: "rear-3-4", ALL_WHEELS: "side",
  EXHAUST: "rear-3-4", GEARBOX: "side", FRONT_LIGHTS: "front", REAR_LIGHTS: "rear", WINDSHIELD: "front-3-4",
  CABIN: "side", RADIATOR: "front", FUEL: "rear-3-4",
};

export function partPoints(zone: PartZone, view: MarkerView): Point[] {
  return anchors[view]?.[zone] || [];
}
