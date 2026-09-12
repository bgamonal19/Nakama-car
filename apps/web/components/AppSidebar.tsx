"use client";

import { usePathname } from "next/navigation";
import { LanguageSwitcher, useLanguage } from "./LanguageProvider";
import { ThemeToggle } from "./ThemeProvider";
import { NakamaLogo } from "./NakamaLogo";
import { NavIcon } from "./NavIcon";

const navigation = [
  ["/", "▦ Dashboard", "dashboard"],
  ["/clienti", "◎ Clienti", "clients"],
  ["/veicoli", "◇ Veicoli", "car"],
  ["/pratiche", "▤ Pratiche", "folder"],
  ["/preventivi", "€ Preventivi", "estimate"],
  ["/lavori", "⌁ Lavori in officina", "work"],
  ["/fatture", "◫ Fatture", "invoice"],
  ["/personale", "♙ Personale", "people"],
];
const settings = [["/configurazione", "⚙ Impostazioni", "settings"], ["/audit", "◷ Audit log", "audit"]];

export function AppSidebar() {
  const pathname = usePathname();
  const { t, language } = useLanguage();
  function link([href, key, icon]: string[]) {
    // Keep existing translation keys while rendering the symbol as a consistent SVG.
    const label = t(key).replace(/^\S+\s+/, "");
    const active = pathname === href || (href !== "/" && pathname.startsWith(href + "/"));
    return <a key={href} href={href} className={`nav-item${active ? " active" : ""}`} aria-current={active ? "page" : undefined} aria-label={label} title={label}>
      <NavIcon name={icon} /><span className="nav-label">{label}</span>
    </a>;
  }
  return <aside className="sidebar minimal-sidebar">
    <a className="brand brand-link nakama-sidebar-brand" href="/" aria-label="NAKAMA CAR"><NakamaLogo /></a>
    <nav aria-label={language === "es" ? "Navegación principal" : "Navigazione principale"}>{navigation.map(link)}</nav>
    <div className="sidebar-bottom">
      <nav aria-label={language === "es" ? "Administración" : "Amministrazione"}>{settings.map(link)}</nav>
      <div className="sidebar-preferences"><LanguageSwitcher /><ThemeToggle /></div>
      <div className="nakama-location"><strong>NAKAMA CAR</strong><span>Bussnago · Lombardia</span><i><b></b><b></b><b></b></i></div>
    </div>
  </aside>;
}
