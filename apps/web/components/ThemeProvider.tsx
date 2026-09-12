"use client";

import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { useLanguage } from "./LanguageProvider";

type Theme = "light" | "dark";
const ThemeContext = createContext({ theme: "light" as Theme, toggle: () => {} });
const storageKey = "nakama-theme";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => {
    try { if (localStorage.getItem(storageKey) === "dark") setTheme("dark"); } catch { /* Storage is optional. */ }
    const sync = (event: StorageEvent) => {
      if (event.key === storageKey) setTheme(event.newValue === "dark" ? "dark" : "light");
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  function toggle() {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    try { localStorage.setItem(storageKey, next); } catch { /* Switching still works without persistence. */ }
  }
  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export function ThemeToggle() {
  const { theme, toggle } = useContext(ThemeContext);
  const { language } = useLanguage();
  const dark = theme === "dark";
  const label = language === "es" ? (dark ? "Tema claro" : "Tema oscuro") : (dark ? "Tema chiaro" : "Tema scuro");
  return <button type="button" className="nav-item theme-toggle" onClick={toggle} aria-label={label} title={label}>
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
      {dark ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" /></> : <path d="M20.8 13.2A9 9 0 0 1 10.8 3.2a9 9 0 1 0 10 10Z" />}
    </svg><span>{label}</span>
  </button>;
}
