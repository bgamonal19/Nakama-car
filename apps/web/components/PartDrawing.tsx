import type { ReactNode } from "react";
import type { PartKind } from "../lib/partKinds";

// Original line drawings, 48x48, drawn with currentColor.
const S = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
const F = { fill: "currentColor", stroke: "none" };
const thin = { ...S, strokeWidth: 1.4 };

const ring = (count: number, radius: number, draw: (x: number, y: number, angle: number, index: number) => ReactNode, cx = 24, cy = 24) =>
  Array.from({ length: count }, (_, index) => {
    const angle = (360 / count) * index;
    const rad = (angle * Math.PI) / 180;
    return draw(cx + radius * Math.cos(rad), cy + radius * Math.sin(rad), angle, index);
  });

const bottle = (label: string) => (
  <g>
    <path {...S} d="M17 12h14v4l4 5v19a3 3 0 0 1-3 3H16a3 3 0 0 1-3-3V21l4-5z" />
    <rect {...F} x="19" y="6" width="10" height="6" rx="1.5" />
    <rect {...thin} x="16" y="24" width="16" height="11" rx="1.5" />
    <text x="24" y="32.5" textAnchor="middle" fontSize="8" fontWeight="800" fill="currentColor">{label}</text>
  </g>
);

const drawings: Record<PartKind, ReactNode> = {
  OIL: bottle("OIL"),
  FLUID: bottle("DOT"),
  OIL_FILTER: (
    <g>
      <rect {...S} x="13" y="13" width="22" height="28" rx="4" />
      <path {...S} d="M16 13v-4h16v4" />
      {[18, 23, 28, 33].map((y) => <line key={y} {...thin} x1="13" y1={y} x2="35" y2={y} />)}
    </g>
  ),
  AIR_FILTER: (
    <g>
      <rect {...S} x="6" y="12" width="36" height="24" rx="3" />
      <path {...thin} d="M10 16l3 16 3-16 3 16 3-16 3 16 3-16 3 16 3-16 3 16" />
    </g>
  ),
  FUEL_FILTER: (
    <g>
      <rect {...S} x="15" y="12" width="18" height="26" rx="6" />
      <path {...S} d="M24 12V6M24 38v6" />
      <path {...F} d="M24 19c-3 4-4 6-4 8a4 4 0 0 0 8 0c0-2-1-4-4-8z" />
    </g>
  ),
  SPARK_PLUG: (
    <g>
      <rect {...S} x="20" y="4" width="8" height="8" rx="1.5" />
      <path {...S} d="M18 12h12l-2 10h-8z" />
      <path {...S} d="M19 22h10v4H19zM20 26h8v10h-8z" />
      {[29, 32, 35].map((y) => <line key={y} {...thin} x1="20" y1={y} x2="28" y2={y} />)}
      <path {...S} d="M24 36v6h4" />
    </g>
  ),
  GLOW_PLUG: (
    <g>
      <rect {...S} x="20" y="4" width="8" height="7" rx="1.5" />
      <path {...S} d="M19 11h10v8H19z" />
      {[22, 25, 28].map((y) => <line key={y} {...thin} x1="20" y1={y} x2="28" y2={y} />)}
      <path {...S} d="M21 30h6v6l-3 8-3-8z" />
      <path {...thin} d="M16 40c-2-2-2-4 0-6M32 40c2-2 2-4 0-6" />
    </g>
  ),
  TIMING_KIT: (
    <g>
      <circle {...S} cx="14" cy="16" r="8" /><circle {...S} cx="34" cy="16" r="8" /><circle {...S} cx="24" cy="38" r="6" />
      <path {...S} d="M7 18l12 22M41 18L29 40M14 8h20" />
      <circle {...F} cx="14" cy="16" r="2" /><circle {...F} cx="34" cy="16" r="2" /><circle {...F} cx="24" cy="38" r="2" />
    </g>
  ),
  WATER_PUMP: (
    <g>
      <circle {...S} cx="22" cy="26" r="13" />
      {ring(6, 8, (x, y, a) => <path key={a} {...thin} d={`M22 26L${x} ${y}`} />, 22, 26)}
      <path {...S} d="M35 22h8v8h-8" />
      <path {...F} d="M40 10c-2 3-3 4-3 6a3 3 0 0 0 6 0c0-2-1-3-3-6z" />
    </g>
  ),
  BELT: (
    <g>
      <circle {...S} cx="14" cy="24" r="9" /><circle {...S} cx="36" cy="16" r="6" /><circle {...S} cx="36" cy="34" r="6" />
      <path {...S} d="M12 15l24-5M12 33l24 7M42 16v18" />
    </g>
  ),
  HEAD_GASKET: (
    <g>
      <rect {...S} x="4" y="13" width="40" height="22" rx="3" />
      {[12, 24, 36].map((x) => <circle key={x} {...S} cx={x} cy="24" r="5" />)}
      {[8, 18, 30, 40].map((x) => <circle key={x} {...F} cx={x} cy="16.5" r="1.3" />)}
    </g>
  ),
  EGR: (
    <g>
      <rect {...S} x="14" y="16" width="20" height="18" rx="3" />
      <path {...S} d="M4 25h10M34 25h10M24 16V8M18 8h12" />
      <circle {...F} cx="24" cy="25" r="3" />
    </g>
  ),
  TURBO: (
    <g>
      <path {...S} d="M24 8a16 16 0 1 1-16 16" />
      <path {...S} d="M8 24H3M24 8V3" />
      <circle {...S} cx="24" cy="24" r="7" />
      {ring(6, 7, (x, y, a) => <path key={a} {...thin} d={`M24 24L${x} ${y}`} />)}
    </g>
  ),
  INJECTOR: (
    <g>
      <rect {...S} x="18" y="4" width="12" height="10" rx="2" />
      <path {...S} d="M20 14h8v18l-2 6h-4l-2-6z" />
      <path {...thin} d="M24 38v2M19 42l-3 3M24 43v3M29 42l3 3" />
      <path {...S} d="M30 8h6v4" />
    </g>
  ),
  BRAKE_PAD: (
    <g>
      <path {...S} d="M8 16q16-10 32 0v8q-16-8-32 0z" />
      <path {...F} d="M10 26q14-7 28 0v8q-14-7-28 0z" opacity="0.85" />
      <circle {...F} cx="16" cy="14" r="1.5" /><circle {...F} cx="32" cy="14" r="1.5" />
    </g>
  ),
  BRAKE_DISC: (
    <g>
      <circle {...S} cx="24" cy="24" r="19" />
      <circle {...S} cx="24" cy="24" r="8" />
      {ring(5, 4.5, (x, y, a) => <circle key={a} {...F} cx={x} cy={y} r="1.4" />)}
      {ring(10, 14, (x, y, a) => <circle key={a} {...F} cx={x} cy={y} r="1" />)}
    </g>
  ),
  BRAKE_SHOE: (
    <g>
      <circle {...S} cx="24" cy="24" r="19" />
      <path {...S} strokeWidth={4} d="M12 16a14 14 0 0 1 24 0M12 32a14 14 0 0 0 24 0" />
      <path {...thin} d="M14 24h20" />
    </g>
  ),
  CALIPER: (
    <g>
      <path {...S} d="M6 30a18 18 0 0 1 36 0" />
      <path {...F} d="M14 10h20q6 0 6 6v6h-8v-6H16v6H8v-6q0-6 6-6z" />
      <circle {...S} cx="24" cy="34" r="4" />
    </g>
  ),
  SHOCK: (
    <g>
      <circle {...S} cx="24" cy="7" r="3" /><circle {...S} cx="24" cy="41" r="3" />
      <rect {...S} x="19" y="22" width="10" height="16" rx="2" />
      <path {...S} d="M24 10v12" />
      <path {...thin} d="M16 12l16 3-16 3 16 3" />
    </g>
  ),
  SPRING: <path {...S} d="M14 6h20M14 42h20M14 6l20 6-20 6 20 6-20 6 20 6-20 6" />,
  CONTROL_ARM: (
    <g>
      <path {...S} d="M8 12l30 12L8 36" />
      <circle {...S} cx="8" cy="12" r="4" /><circle {...S} cx="8" cy="36" r="4" /><circle {...F} cx="38" cy="24" r="4" />
    </g>
  ),
  TIE_ROD: (
    <g>
      <path {...S} d="M4 30h26" />
      <circle {...S} cx="34" cy="30" r="5" />
      <path {...S} d="M34 25V12" />
      <circle {...F} cx="34" cy="10" r="3" />
      {[8, 12, 16].map((x) => <line key={x} {...thin} x1={x} y1="27" x2={x} y2="33" />)}
    </g>
  ),
  BEARING: (
    <g>
      <circle {...S} cx="24" cy="24" r="18" /><circle {...S} cx="24" cy="24" r="8" />
      {ring(9, 13, (x, y, a) => <circle key={a} {...F} cx={x} cy={y} r="2.6" />)}
    </g>
  ),
  DRIVESHAFT: (
    <g>
      <path {...S} d="M12 24h24" strokeWidth={3} />
      <path {...S} d="M4 16q8 8 0 16M12 16q-8 8 0 16M36 16q8 8 0 16M44 16q-8 8 0 16" />
    </g>
  ),
  ALIGNMENT: (
    <g>
      <path {...S} d="M8 36a18 18 0 0 1 32 0" />
      {ring(7, 16, (x, y, a) => <line key={a} {...thin} x1={x} y1={y} x2={24 + (x - 24) * 0.8} y2={36 + (y - 36) * 0.8} />, 24, 36)}
      <path {...S} d="M24 36l8-12" />
      <circle {...F} cx="24" cy="36" r="2.5" />
    </g>
  ),
  CLUTCH: (
    <g>
      <circle {...S} cx="24" cy="24" r="19" /><circle {...S} cx="24" cy="24" r="7" />
      {ring(4, 12, (x, y, a) => <rect key={a} {...F} x={x - 3} y={y - 2} width="6" height="4" rx="1.5" transform={`rotate(${a + 45} ${x} ${y})`} />)}
      {ring(12, 17, (x, y, a) => <circle key={a} {...F} cx={x} cy={y} r="0.9" />)}
    </g>
  ),
  FLYWHEEL: (
    <g>
      <circle {...S} cx="24" cy="24" r="19" /><circle {...S} cx="24" cy="24" r="12" /><circle {...S} cx="24" cy="24" r="4" />
      {ring(24, 19, (x, y, a) => <line key={a} {...thin} x1={x} y1={y} x2={24 + (x - 24) * 1.1} y2={24 + (y - 24) * 1.1} />)}
    </g>
  ),
  ENGINE_MOUNT: (
    <g>
      <rect {...S} x="8" y="30" width="32" height="8" rx="2" />
      <path {...S} d="M14 30v-6q10-10 20 0v6" />
      <circle {...F} cx="24" cy="20" r="3" />
      <path {...S} d="M24 17V8" />
    </g>
  ),
  DIAGNOSTIC: (
    <g>
      <rect {...S} x="10" y="6" width="28" height="36" rx="4" />
      <rect {...thin} x="14" y="10" width="20" height="14" rx="2" />
      <path {...S} d="M16 19l3-4 3 5 3-6 3 4 3-2" />
      <circle {...F} cx="19" cy="32" r="2" /><circle {...F} cx="29" cy="32" r="2" />
    </g>
  ),
  BATTERY: (
    <g>
      <rect {...S} x="7" y="15" width="34" height="24" rx="3" />
      <rect {...F} x="12" y="10" width="6" height="5" rx="1" /><rect {...F} x="30" y="10" width="6" height="5" rx="1" />
      <path {...S} d="M12 25h6M15 22v6M30 25h6" />
    </g>
  ),
  ALTERNATOR: (
    <g>
      <circle {...S} cx="26" cy="24" r="15" />
      {ring(8, 11, (x, y, a) => <line key={a} {...thin} x1={26 + (x - 24) * 0.5} y1={24 + (y - 24) * 0.5} x2={x + 2} y2={y} />)}
      <circle {...S} cx="8" cy="24" r="4" />
      <path {...S} d="M12 24h2" />
    </g>
  ),
  STARTER: (
    <g>
      <rect {...S} x="6" y="16" width="24" height="16" rx="6" />
      <path {...S} d="M30 20h8v8h-8" />
      <rect {...S} x="12" y="8" width="12" height="8" rx="2" />
      {ring(8, 5, (x, y, a) => <circle key={a} {...F} cx={x} cy={y} r="1" />, 42, 24)}
    </g>
  ),
  BULB: (
    <g>
      <path {...S} d="M17 30a11 11 0 1 1 14 0v4H17z" />
      <path {...S} d="M18 38h12M20 42h8" />
      <path {...thin} d="M21 30l3-8 3 8" />
    </g>
  ),
  SENSOR: (
    <g>
      <path {...S} d="M16 8h16v6l-3 4v12h-10V18l-3-4z" />
      <path {...S} d="M24 30v6q0 6 8 6h8" />
      <path {...thin} d="M36 12a8 8 0 0 1 0 10M40 9a12 12 0 0 1 0 16" />
    </g>
  ),
  WIRING: (
    <g>
      <path {...S} d="M4 14c10 0 10 20 20 20s10-20 20-20" />
      <path {...S} d="M4 34c10 0 10-20 20-20s10 20 20 20" />
      <rect {...F} x="20" y="20" width="8" height="8" rx="2" />
    </g>
  ),
  AC: (
    <g>
      <path {...S} d="M24 6v36M8.4 15l31.2 18M8.4 33l31.2-18" />
      <path {...thin} d="M20 9l4 4 4-4M20 39l4-4 4 4M9 20l5-1-1-5M39 28l-5 1 1 5M9 28l5 1-1 5M39 20l-5-1 1-5" />
    </g>
  ),
  COMPRESSOR: (
    <g>
      <rect {...S} x="12" y="12" width="26" height="24" rx="5" />
      <circle {...S} cx="8" cy="24" r="5" />
      {ring(6, 3, (x, y, a) => <circle key={a} {...F} cx={x} cy={y} r="0.9" />, 8, 24)}
      <path {...S} d="M38 18h6M38 30h6" />
      <path {...thin} d="M18 18v12M24 18v12M30 18v12" />
    </g>
  ),
  RADIATOR: (
    <g>
      <rect {...S} x="6" y="10" width="36" height="28" rx="3" />
      {[14, 19, 24, 29, 34].map((y) => <line key={y} {...thin} x1="10" y1={y} x2="38" y2={y} />)}
      <path {...S} d="M42 16h3v4" />
    </g>
  ),
  THERMOSTAT: (
    <g>
      <circle {...S} cx="24" cy="28" r="12" />
      <path {...S} d="M20 12h8v6h-8zM24 4v8" />
      <path {...thin} d="M18 28h12M24 22v12" />
    </g>
  ),
  TYRE: (
    <g>
      <circle {...S} cx="24" cy="24" r="19" /><circle {...S} cx="24" cy="24" r="10" /><circle {...F} cx="24" cy="24" r="3" />
      {ring(12, 17, (x, y, a) => <line key={a} {...thin} x1={24 + (x - 24) * 0.88} y1={24 + (y - 24) * 0.88} x2={24 + (x - 24) * 1.1} y2={24 + (y - 24) * 1.1} />)}
    </g>
  ),
  BALANCING: (
    <g>
      <circle {...S} cx="24" cy="24" r="18" /><circle {...S} cx="24" cy="24" r="8" />
      <rect {...F} x="20" y="4" width="8" height="5" rx="1" /><rect {...F} x="20" y="39" width="8" height="5" rx="1" />
      <path {...thin} d="M4 24h6M38 24h6" />
    </g>
  ),
  PUNCTURE: (
    <g>
      <path {...S} d="M8 30a16 16 0 0 1 32 0" />
      <path {...S} d="M4 34h40" />
      <path {...F} d="M22 14l4 0-1 10h-2z" />
      <circle {...F} cx="24" cy="10" r="2.5" />
    </g>
  ),
  MUFFLER: (
    <g>
      <path {...S} d="M3 30h8" />
      <rect {...S} x="11" y="20" width="24" height="18" rx="9" />
      <path {...S} d="M35 29h8v4h-8" />
      <path {...thin} d="M40 22c2-2 2-4 0-6M44 22c2-2 2-4 0-6" />
    </g>
  ),
  CATALYST: (
    <g>
      <path {...S} d="M4 24h6l4-6h20l4 6h6M10 24l4 6h20l4-6" />
      {[18, 22, 26, 30].map((x) => <line key={x} {...thin} x1={x} y1="19" x2={x} y2="29" />)}
    </g>
  ),
  DPF: (
    <g>
      <rect {...S} x="8" y="14" width="32" height="20" rx="10" />
      <path {...S} d="M2 24h6M40 24h6" />
      {ring(6, 5, (x, y, a) => <circle key={a} {...F} cx={x} cy={y} r="1.2" />)}
      <circle {...F} cx="24" cy="24" r="1.2" />
    </g>
  ),
  INSPECTION: (
    <g>
      <rect {...S} x="10" y="8" width="28" height="34" rx="3" />
      <rect {...F} x="18" y="5" width="12" height="6" rx="2" />
      <path {...S} d="M16 20l3 3 5-6M16 31l3 3 5-6" />
      <path {...thin} d="M28 20h5M28 31h5" />
    </g>
  ),
  WIPER: (
    <g>
      <path {...S} d="M6 36q18-26 36 0" />
      <path {...S} d="M24 38L11 20" strokeWidth={3} />
      <circle {...F} cx="24" cy="38" r="3" />
    </g>
  ),
  TOW: (
    <g>
      <path {...S} d="M4 32h26v-8h8l6 6v2h-4" />
      <path {...S} d="M8 32l-4-14h6l10 14" />
      <circle {...S} cx="12" cy="36" r="4" /><circle {...S} cx="36" cy="36" r="4" />
    </g>
  ),
  COURTESY_CAR: (
    <g>
      <path {...S} d="M6 32v-6l5-9h22l7 9h2v6z" />
      <circle {...F} cx="14" cy="34" r="4" /><circle {...F} cx="34" cy="34" r="4" />
      <path {...thin} d="M14 17l-3 9h26l-5-9" />
      <path {...S} d="M38 10l3-3 3 3-3 3z" />
    </g>
  ),
  WASTE: (
    <g>
      <path {...S} d="M12 14h24l-2 28H14z" />
      <path {...S} d="M8 14h32M19 14v-4h10v4" />
      <path {...thin} d="M20 20v16M24 20v16M28 20v16" />
    </g>
  ),
  ENGINE: (
    <g>
      <path {...S} d="M8 20h6v-5h14v5h6l4 4h4v12h-4l-4 4H14l-6-6z" />
      <path {...S} d="M18 15v-4h8v4" />
      <rect {...F} opacity="0.85" x="30" y="27" width="7" height="10" rx="2" />
      <path {...thin} d="M14 26h12M14 31h10" />
    </g>
  ),
};

export function PartDrawing({ kind, size = 40 }: { kind: PartKind; size?: number }) {
  return <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" className="part-icon">{drawings[kind]}</svg>;
}
