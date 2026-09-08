import { CSSProperties } from "react";

type Props = {
  compact?: boolean;
  light?: boolean;
  style?: CSSProperties;
};

export function NakamaLogo({ compact = false, light = false, style }: Props) {
  const navy = light ? "#ffffff" : "#0b2a4a";
  return (
    <div className={`nakama-logo ${compact ? "compact" : ""} ${light ? "light" : ""}`} style={style}>
      <svg className="nakama-logo-mark" viewBox="0 0 260 88" role="img" aria-label="NAKAMA CAR">
        <path d="M18 50c25-3 48-9 75-11l12-13c4-4 10-7 16-8 28-5 65-3 91 9l18 9c7 4 12 8 14 14l-15-2c-3-10-12-16-23-16-13 0-22 7-25 18h-81l-18-19-39 3z" fill={navy}/>
        <path d="M37 24c38-12 79-17 123-13 16 1 30 5 43 11l-34-3c-40-3-79 0-118 10z" fill="#ef2438"/>
        <path d="M30 34c36-8 69-12 105-12l-18 9c-30 1-58 4-87 9z" fill="#0a9d5b"/>
        <path d="M27 43c28-4 54-6 84-6l-9 8c-26 1-50 3-75 6z" fill="#0b2a4a"/>
        <circle cx="203" cy="52" r="12" fill="none" stroke={navy} strokeWidth="5"/>
        <path d="M220 47l20 2c-2-7-8-11-16-14z" fill="#ef2438"/>
      </svg>
      {!compact && (
        <div className="nakama-logo-type">
          <strong><span>NAKAMA</span> <em>CAR</em></strong>
          <small>CARROZZERIA E SERVIZI AUTO</small>
          <small>QUALITÀ IN OGNI DETTAGLIO</small>
          <i aria-hidden="true"><b></b><b></b><b></b></i>
        </div>
      )}
    </div>
  );
}
