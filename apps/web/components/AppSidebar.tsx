"use client";

import { useEffect, useRef, useState } from "react";
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
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 1100px)");
    const onResize = () => { if (!media.matches) setOpen(false); };
    media.addEventListener("change", onResize);
    return () => media.removeEventListener("change", onResize);
  }, []);
  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const scrollY = window.scrollY;
    const previous = { position: body.style.position, top: body.style.top, width: body.style.width, overflow: body.style.overflow };
    Object.assign(body.style, { position: "fixed", top: `-${scrollY}px`, width: "100%", overflow: "hidden" });
    const siblings = Array.from(sidebarRef.current?.parentElement?.children ?? [])
      .filter((element): element is HTMLElement => element instanceof HTMLElement && !element.matches(".sidebar, .mobile-nav-header, .mobile-nav-backdrop"));
    const inertStates = siblings.map(element => element.inert);
    siblings.forEach(element => { element.inert = true; });
    sidebarRef.current?.querySelector<HTMLElement>("a[href]")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); }
      if (event.key === "Tab") {
        const controls = [toggleRef.current, ...Array.from(sidebarRef.current?.querySelectorAll<HTMLElement>("a[href], button:not(:disabled)") ?? [])]
          .filter((element): element is HTMLElement => !!element && element.getClientRects().length > 0);
        const index = controls.indexOf(document.activeElement as HTMLElement);
        event.preventDefault();
        controls[(index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length]?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      siblings.forEach((element, index) => { element.inert = inertStates[index]; });
      Object.assign(body.style, previous);
      window.scrollTo(0, scrollY);
      toggleRef.current?.focus({ preventScroll: true });
    };
  }, [open]);

  function link([href, key, icon]: string[]) {
    // Keep existing translation keys while rendering the symbol as a consistent SVG.
    const label = t(key).replace(/^\S+\s+/, "");
    const active = pathname === href || (href !== "/" && pathname.startsWith(href + "/"));
    return <a key={href} href={href} className={`nav-item${active ? " active" : ""}`} aria-current={active ? "page" : undefined} aria-label={label} title={label}>
      <NavIcon name={icon} /><span className="nav-label">{label}</span>
    </a>;
  }
  return <>
    <header className="mobile-nav-header">
      <button ref={toggleRef} type="button" className="mobile-nav-toggle"
        aria-expanded={open} aria-controls="nakama-navigation"
        aria-label={language === "es" ? (open ? "Cerrar menú" : "Abrir menú") : (open ? "Chiudi menu" : "Apri menu")}
        onClick={() => setOpen(value => !value)}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d={open ? "M6 6l12 12M6 18L18 6" : "M4 6h16M4 12h16M4 18h16"} />
        </svg>
      </button>
    </header>
    <div className={`mobile-nav-backdrop${open ? " is-open" : ""}`} aria-hidden="true" onClick={() => setOpen(false)} />
    <aside ref={sidebarRef} id="nakama-navigation" className={`sidebar minimal-sidebar${open ? " is-open" : ""}`}
      onClick={event => { if ((event.target as HTMLElement).closest("a, button")) setOpen(false); }}>
    <a className="brand brand-link nakama-sidebar-brand" href="/" aria-label="NAKAMA CAR"><NakamaLogo /></a>
    <nav aria-label={language === "es" ? "Navegación principal" : "Navigazione principale"}>{navigation.map(link)}</nav>
    <div className="sidebar-bottom">
      <nav aria-label={language === "es" ? "Administración" : "Amministrazione"}>{settings.map(link)}</nav>
      <div className="sidebar-preferences"><LanguageSwitcher /><ThemeToggle /></div>
      <div className="nakama-location"><strong>NAKAMA CAR</strong><span>Bussnago · Lombardia</span><i><b></b><b></b><b></b></i></div>
    </div>
  </aside></>;
}
