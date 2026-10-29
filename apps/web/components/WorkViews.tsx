"use client";

import { useEffect, useState } from "react";
import { useLanguage } from "./LanguageProvider";
import { sessionUser } from "../lib/api";

/** One menu entry for the workshop jobs: the vehicle cards (/officina) and the work-order list (/lavori). */
export function WorkViews({ current }: { current: "/officina" | "/lavori" }) {
  const { language } = useLanguage();
  const words = (it: string, es: string) => language === "es" ? es : it;
  const [mine, setMine] = useState(false);
  useEffect(() => { setMine(Boolean(sessionUser()?.work_area)); }, []);
  const views: [string, string][] = [
    ["/officina", mine ? words("🚗 I miei veicoli", "🚗 Mis vehículos") : words("🚗 Veicoli in officina", "🚗 Vehículos en el taller")],
    ["/lavori", words("☰ Elenco ordini di lavoro", "☰ Lista de órdenes de trabajo")],
  ];
  return <nav className="work-views" aria-label={words("Viste dei lavori", "Vistas de los trabajos")}>
    {views.map(([href, label]) => <a key={href} href={href} aria-current={href === current ? "page" : undefined}>{label}</a>)}
  </nav>;
}
