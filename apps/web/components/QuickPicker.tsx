"use client";

import { KeyboardEvent, useMemo, useState } from "react";
import { useLanguage } from "./LanguageProvider";

export type QuickKind = "PART" | "MATERIAL" | "SERVICE";
export type QuickPick = {
  key: string;
  name: string;          // stored text (Italian for the built-in catalog)
  kind: QuickKind;
  hours: number;
  group: string;
  icon: string;
  id?: string;           // set for items the workshop added
  deletable?: boolean;
};

const kindLabels: Record<QuickKind, string> = { PART: "Ricambio", MATERIAL: "Materiale", SERVICE: "Lavoro" };

/** Lowercase, no accents, single spaces: "Paraurti  Anteriore" ≈ "paraurti anteriore". */
export function normalize(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Quick-add as a searchable list. When the search finds nothing exact, the worker can
 * add the item: it is saved for the whole workshop and added to the diagnosis.
 */
export function QuickPicker({ items, onPick, onCreate, onDelete }: {
  items: QuickPick[];
  onPick: (item: QuickPick) => void;
  onCreate: (name: string, kind: QuickKind, hours: number) => Promise<QuickPick | null>;
  onDelete?: (item: QuickPick) => void;
}) {
  const { t } = useLanguage();
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<QuickKind>("PART");
  const [hours, setHours] = useState("");
  const [saving, setSaving] = useState(false);
  const [last, setLast] = useState("");

  const term = normalize(query);
  const results = useMemo(() => {
    if (!term) return items;
    const words = term.split(" ");
    return items.filter((item) => {
      const text = `${normalize(t(item.name))} ${normalize(item.name)} ${normalize(t(item.group))}`;
      return words.every((word) => text.includes(word));
    });
  }, [items, term, t]);
  const exact = term !== "" && items.some((item) => normalize(item.name) === term || normalize(t(item.name)) === term);
  const groups = useMemo(() => {
    const map = new Map<string, QuickPick[]>();
    results.forEach((item) => map.set(item.group, [...(map.get(item.group) || []), item]));
    return Array.from(map.entries());
  }, [results]);

  function pick(item: QuickPick) {
    onPick(item);
    setLast(t(item.name));
    setQuery("");
    setAdding(false);
  }

  async function create() {
    const name = query.replace(/\s+/g, " ").trim();
    if (name.length < 2 || saving) return;
    setSaving(true);
    try {
      const value = Number(hours.replace(",", "."));
      const item = await onCreate(name, kind, Number.isFinite(value) && value > 0 ? value : 0);
      if (item) pick(item);
    } finally { setSaving(false); }
  }

  function onKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (adding) void create();
    else if (results.length > 0 && term) pick(results[0]);
    else if (term) setAdding(true);
  }

  return (
    <div className="quick-picker">
      <div className="quick-search">
        <span aria-hidden="true">🔎</span>
        <input
          type="search"
          value={query}
          onChange={(event) => { setQuery(event.target.value); setAdding(false); }}
          onKeyDown={onKey}
          placeholder={t("Cerca ricambio, materiale o lavoro…")}
          aria-label={t("Cerca ricambio, materiale o lavoro…")}
          enterKeyHint="done"
        />
        {query && <button type="button" className="ghost" onClick={() => { setQuery(""); setAdding(false); }} aria-label={t("Cancella")}>✕</button>}
      </div>
      {last && <p className="hint quick-last" role="status">✔ {t("Aggiunto")}: {last}</p>}

      {term && !exact && (
        <div className="quick-add">
          {!adding ? (
            <button type="button" className="quick-add-open" onClick={() => setAdding(true)}>
              ＋ {t("Aggiungi")} «{query.trim()}» {results.length === 0 ? `· ${t("non è nella lista")}` : ""}
            </button>
          ) : (
            <div className="quick-add-form">
              <strong>＋ {query.trim()}</strong>
              <div className="choice-chips" role="radiogroup" aria-label={t("Tipo")}>
                {(Object.keys(kindLabels) as QuickKind[]).map((code) => (
                  <button type="button" key={code} role="radio" aria-checked={kind === code} className={kind === code ? "active" : ""} onClick={() => setKind(code)}>{t(kindLabels[code])}</button>
                ))}
              </div>
              <label>{t("Ore di lavoro (facoltativo)")}<input inputMode="decimal" value={hours} onChange={(event) => setHours(event.target.value.replace(/[^\d.,]/g, ""))} placeholder="0" /></label>
              <div className="quick-add-actions">
                <button type="button" className="ghost" onClick={() => setAdding(false)}>{t("Annulla")}</button>
                <button type="button" className="primary" disabled={saving} onClick={create}>{saving ? t("Salvataggio…") : t("Salva e aggiungi")}</button>
              </div>
              <p className="hint">{t("Resterà nella lista per tutta l'officina.")}</p>
            </div>
          )}
        </div>
      )}

      <div className="quick-list" role="listbox" aria-label={t("Aggiunta rapida")}>
        {groups.length === 0 && term && <p className="hint">{t("Nessun risultato.")}</p>}
        {groups.map(([group, groupItems]) => (
          <div key={group} className="quick-list-group">
            <p className="quick-list-title">{groupItems[0].icon} {t(group)}</p>
            {groupItems.map((item) => (
              <div key={item.key} className="quick-row">
                <button type="button" role="option" aria-selected={false} onClick={() => pick(item)}>
                  <span className="quick-row-name">{t(item.name)}</span>
                  <span className={`quick-kind kind-${item.kind.toLowerCase()}`}>{t(kindLabels[item.kind])}</span>
                  {item.hours > 0 && <span className="quick-hours">{item.hours.toLocaleString("it-IT")} h</span>}
                  <span className="quick-plus" aria-hidden="true">＋</span>
                </button>
                {item.deletable && onDelete && (
                  <button type="button" className="ghost quick-delete" aria-label={`${t("Elimina")} ${item.name}`} onClick={() => onDelete(item)}>🗑</button>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
