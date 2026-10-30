"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { LanguageSwitcher, useLanguage } from "./LanguageProvider";
import { ThemeToggle } from "./ThemeProvider";
import { UpdateAppButton } from "./UpdateWatcher";
import { LegalLinks } from "./Legal";
import { NakamaLogo } from "./NakamaLogo";
import { NavIcon } from "./NavIcon";
import { ChatBubble } from "./ChatBubble";
import { apiFetch, clearSession, hidesEstimates, homeFor, refreshSession, sessionUser, SessionUser } from "../lib/api";

// [href, label, icon, permission needed] — each user only sees what they can use.
const navigation = [
  ["/", "▦ Dashboard", "dashboard", "case.create"],
  ["/officina", "⚒ Il mio lavoro", "wrench", "work_order.read"],
  ["/diagnosi", "✚ Diagnosi", "diagnosis", "work_order.read"],
  ["/clienti", "◎ Clienti", "clients", "customer.read"],
  ["/contratti", "▣ Contratti flotta", "contract", "customer.read"],
  ["/veicoli", "◇ Veicoli", "car", "vehicle.read"],
  ["/pratiche", "▤ Pratiche", "folder", "case.read"],
  ["/preventivi", "€ Preventivi", "estimate", "estimate.read"],
  ["/taller-3d", "◇ Officina 3D", "car", "work_order.read"],
  ["/fatture", "◫ Fatture", "invoice", "invoice.read"],
  ["/personale", "♙ Personale", "people", "users.manage"],
];
// Workshop staff (mechanic / body shop) see their menu in the order they work.
// «Lavori in officina» (/lavori) is not a separate entry: it is a view inside «Il mio lavoro» / «Lavori in corso».
const workerOrder = ["/diagnosi", "/preventivi", "/pratiche", "/officina", "/taller-3d"];
const settings = [
  ["/profilo", "☺ Il mio profilo", "profile", ""],
  ["/configurazione", "⚙ Impostazioni", "settings", "settings.manage"],
  ["/audit", "◷ Audit log", "audit", "audit.read"],
];
const areaNames: Record<string, string> = { MECHANICAL: "Meccanica", BODY: "Carrozzeria" };

export function AppSidebar() {
  const pathname = usePathname();
  const { t, language } = useLanguage();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [pendingDiagnoses, setPendingDiagnoses] = useState(0);
  useEffect(() => {
    setUser(sessionUser());
    const sync = () => setUser(sessionUser());
    window.addEventListener("nakama-session", sync);
    void refreshSession();
    return () => window.removeEventListener("nakama-session", sync);
  }, []);
  // The office sees how many diagnoses are waiting for an estimate.
  const manager = Boolean(user?.permissions.includes("estimate.create"));
  useEffect(() => {
    if (!manager) return;
    const load = () => apiFetch("/diagnoses?status=SENT&limit=300").then(async (response) => {
      if (response.ok) setPendingDiagnoses((await response.json()).length);
    }).catch(() => undefined);
    void load();
    const timer = window.setInterval(load, 60_000);
    return () => window.clearInterval(timer);
  }, [manager]);
  // Workers: how many jobs the customer approved that nobody has started yet.
  const [newJobs, setNewJobs] = useState(0);
  const worker = !manager && Boolean(user?.permissions.includes("work_order.update_status"));
  useEffect(() => {
    if (!worker) return;
    const load = () => apiFetch("/my-work").then(async (response) => {
      if (response.ok) setNewJobs((await response.json()).new_jobs || 0);
    }).catch(() => undefined);
    void load();
    const timer = window.setInterval(load, 60_000);
    return () => window.clearInterval(timer);
  }, [worker]);
  // Until we know who is signed in, show no restricted entries: the static HTML used to
  // carry the full office menu, which flashed on every page load for workshop staff.
  const allowed = ([href, , , permission]: string[]) => (href !== "/preventivi" || !hidesEstimates(user)) && (!permission || Boolean(user?.permissions.includes(permission)));

  const rank = (href: string) => { const index = workerOrder.indexOf(href); return index < 0 ? workerOrder.length : index; };
  const menu = user?.work_area
    ? navigation.filter(allowed).sort((a, b) => rank(a[0]) - rank(b[0]))
    : navigation.filter(allowed);

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
    const badge = href === "/diagnosi" && manager && pendingDiagnoses > 0 ? pendingDiagnoses : href === "/officina" && worker && newJobs > 0 ? newJobs : 0;
    // Keep existing translation keys while rendering the symbol as a consistent SVG.
    // The main account (no area) sees every job of the workshop, not "my" work.
    const name = href === "/officina" && user && !user.work_area ? "⚒ Lavori in corso" : key;
    const label = t(name).replace(/^\S+\s+/, "");
    const active = pathname === href || (href !== "/" && pathname.startsWith(href + "/")) || (href === "/officina" && pathname.startsWith("/lavori"));
    return <a key={href} href={href} className={`nav-item${active ? " active" : ""}`} aria-current={active ? "page" : undefined} aria-label={label} title={label}>
      <NavIcon name={icon} /><span className="nav-label">{label}</span>
      {badge > 0 && <b className="nav-badge" aria-label={`${badge}`}>{badge}</b>}
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
    {/* The logo leads to each user's own start page: "/" is the office dashboard. */}
    <a className="brand brand-link nakama-sidebar-brand" href={homeFor(user)} aria-label="NAKAMA CAR"><NakamaLogo /></a>
    <nav aria-label={language === "es" ? "Navegación principal" : "Navigazione principale"}>{menu.map(link)}</nav>

    <div className="sidebar-bottom">
      <nav aria-label={language === "es" ? "Administración" : "Amministrazione"}>{settings.filter(allowed).map(link)}</nav>
      {user && <button type="button" className="nav-item logout-button" title={t("Esci")}
        onClick={() => { clearSession(); window.location.assign("/login"); }}>
        <NavIcon name="logout" /><span className="nav-label">{t("Esci")}</span>
      </button>}
      {user?.work_area && <p className="sidebar-area">{t("Area")}: <strong>{t(areaNames[user.work_area])}</strong></p>}
      <div className="sidebar-preferences"><LanguageSwitcher /><ThemeToggle /><UpdateAppButton /></div>
      <LegalLinks />
      <div className="nakama-location"><strong>NAKAMA CAR</strong><span>Bussnago · Lombardia</span><i><b></b><b></b><b></b></i></div>
    </div>
  </aside>
  <ChatBubble /></>;
}
