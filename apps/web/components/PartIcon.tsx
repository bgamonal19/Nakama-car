import type { PartZone } from "../lib/partZones";

/** Original drawings of the part families, used on the car (x-ray lens) and in the parts list. */
export function PartIcon({ zone, size = 40 }: { zone: PartZone | null; size?: number }) {
  const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 2.2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const solid = { fill: "currentColor", stroke: "none" };
  const polar = (radius: number, degrees: number): [number, number] => [24 + radius * Math.cos((degrees * Math.PI) / 180), 24 + radius * Math.sin((degrees * Math.PI) / 180)];
  let drawing;
  switch (zone) {
    case "FRONT_WHEELS":
    case "REAR_WHEELS":
      // Brake disc with caliper.
      drawing = (
        <g>
          <circle {...stroke} cx="24" cy="24" r="17" />
          <circle {...stroke} cx="24" cy="24" r="6" />
          {[0, 72, 144, 216, 288].map((angle) => {
            const [x, y] = polar(11, angle);
            return <circle key={angle} {...solid} cx={x} cy={y} r="1.6" />;
          })}
          <path {...solid} opacity="0.9" d="M34 9 q9 6 9 15 q0 5 -3 9 l-6 -3 q2 -3 2 -6 q0 -6 -5 -10 z" />
        </g>
      );
      break;
    case "ALL_WHEELS":
      // Tyre with tread.
      drawing = (
        <g>
          <circle {...stroke} cx="24" cy="24" r="19" />
          <circle {...stroke} cx="24" cy="24" r="11" />
          <circle {...solid} cx="24" cy="24" r="3" />
          {Array.from({ length: 12 }, (_, index) => index * 30).map((angle) => {
            const [x1, y1] = polar(15, angle);
            const [x2, y2] = polar(19, angle);
            return <line key={angle} {...stroke} strokeWidth={1.6} x1={x1} y1={y1} x2={x2} y2={y2} />;
          })}
        </g>
      );
      break;
    case "BATTERY":
      drawing = (
        <g>
          <rect {...stroke} x="7" y="15" width="34" height="24" rx="3" />
          <rect {...solid} x="12" y="10" width="6" height="5" rx="1" />
          <rect {...solid} x="30" y="10" width="6" height="5" rx="1" />
          <path {...stroke} d="M12 25h6M15 22v6M30 25h6" />
        </g>
      );
      break;
    case "EXHAUST":
      // Silencer and tail pipe.
      drawing = (
        <g>
          <path {...stroke} d="M3 30h8" />
          <rect {...stroke} x="11" y="20" width="24" height="18" rx="9" />
          <path {...stroke} d="M35 29h8v4h-8" />
          <path {...stroke} strokeWidth={1.4} opacity="0.7" d="M40 22c2-2 2-4 0-6M44 22c2-2 2-4 0-6" />
        </g>
      );
      break;
    case "GEARBOX":
      // Clutch disc with springs.
      drawing = (
        <g>
          <circle {...stroke} cx="24" cy="24" r="18" />
          <circle {...stroke} cx="24" cy="24" r="7" />
          {[45, 135, 225, 315].map((angle) => {
            const [x, y] = polar(11.5, angle);
            return <rect key={angle} {...solid} x={x - 3} y={y - 2} width="6" height="4" rx="1.5" transform={`rotate(${angle} ${x} ${y})`} />;
          })}
          <circle {...solid} cx="24" cy="24" r="2.5" />
        </g>
      );
      break;
    case "FRONT_LIGHTS":
      drawing = (
        <g>
          <path {...stroke} d="M8 16q14-8 30 0v16q-16 8-30 0z" />
          <circle {...stroke} cx="20" cy="24" r="5" />
          <path {...stroke} d="M41 18l5-2M42 24h5M41 30l5 2" />
        </g>
      );
      break;
    case "REAR_LIGHTS":
      drawing = (
        <g>
          <rect {...stroke} x="8" y="12" width="32" height="24" rx="5" />
          <rect {...solid} opacity="0.85" x="12" y="16" width="11" height="16" rx="2" />
          <rect {...stroke} x="26" y="16" width="10" height="16" rx="2" />
        </g>
      );
      break;
    case "RADIATOR":
      drawing = (
        <g>
          <rect {...stroke} x="6" y="10" width="36" height="28" rx="3" />
          {[14, 19, 24, 29, 34].map((y) => <line key={y} {...stroke} strokeWidth={1.5} x1="10" y1={y} x2="38" y2={y} />)}
          <path {...stroke} d="M42 16h3v4" />
        </g>
      );
      break;
    case "WINDSHIELD":
      drawing = (
        <g>
          <path {...stroke} d="M6 34q18-26 36 0" />
          <path {...stroke} d="M24 36l-12-14" />
          <circle {...solid} cx="24" cy="36" r="2.5" />
        </g>
      );
      break;
    case "CABIN":
      // Steering wheel.
      drawing = (
        <g>
          <circle {...stroke} cx="24" cy="24" r="17" />
          <circle {...stroke} cx="24" cy="24" r="5" />
          <path {...stroke} d="M8 21h11M29 21h11M24 29v12" />
        </g>
      );
      break;
    case "FUEL":
      drawing = (
        <g>
          <rect {...stroke} x="9" y="10" width="22" height="30" rx="3" />
          <rect {...solid} opacity="0.85" x="13" y="14" width="14" height="8" rx="1.5" />
          <path {...stroke} d="M31 18h5l4 5v11a3 3 0 0 1-6 0v-7" />
        </g>
      );
      break;
    case "ENGINE":
    default:
      // Engine block with oil filter.
      drawing = (
        <g>
          <path {...stroke} d="M8 20h6v-5h14v5h6l4 4h4v12h-4l-4 4H14l-6-6z" />
          <path {...stroke} d="M18 15v-4h8v4" />
          <rect {...solid} opacity="0.85" x="30" y="27" width="7" height="10" rx="2" />
          <path {...stroke} strokeWidth={1.6} d="M14 26h12M14 31h10" />
        </g>
      );
  }
  return <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true" className="part-icon">{drawing}</svg>;
}
