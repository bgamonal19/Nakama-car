import { CSSProperties } from "react";

type Props = { compact?: boolean; light?: boolean; style?: CSSProperties; };

export function NakamaLogo({ compact = false, light = false, style }: Props) {
  return (
    <div className={`nakama-logo ${compact ? "compact" : ""} ${light ? "light" : ""}`} style={style}>
      <img src="/brand/nakama-logo.webp" alt="NAKAMA CAR" className="nakama-logo-image" />
    </div>
  );
}
