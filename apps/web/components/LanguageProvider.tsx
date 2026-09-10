"use client";

import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { translate, Language } from "../lib/translations";

const STORAGE_KEY = "nakama-language";
const LanguageContext = createContext({ language: "it" as Language, setLanguage: (_language: Language) => {}, t: (text: string | undefined) => text || "" });

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, updateLanguage] = useState<Language>("it");
  useEffect(() => {
    try { if (localStorage.getItem(STORAGE_KEY) === "es") updateLanguage("es"); } catch { /* Storage may be disabled. */ }
    const sync = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY) updateLanguage(event.newValue === "es" ? "es" : "it");
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  const setLanguage = useCallback((value: Language) => {
    updateLanguage(value);
    try { localStorage.setItem(STORAGE_KEY, value); } catch { /* The current page still switches language. */ }
  }, []);
  const t = useCallback((text: string | undefined) => translate(text || "", language), [language]);
  return <LanguageContext.Provider value={{ language, setLanguage, t }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() { return useContext(LanguageContext); }

export function LanguageSwitcher() {
  const { language, setLanguage } = useLanguage();
  return <button type="button" className="nav-item language-switcher" onClick={() => setLanguage(language === "it" ? "es" : "it")}
    aria-label={language === "it" ? "Cambiar idioma a español" : "Cambia lingua in italiano"}>
    <span aria-hidden="true">◎</span><span lang={language === "it" ? "es" : "it"}>{language === "it" ? "Español" : "Italiano"}</span>
    <span className="language-current" aria-hidden="true">{language.toUpperCase()}</span>
  </button>;
}
