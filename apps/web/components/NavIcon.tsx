import { ReactNode } from "react";

const paths: Record<string, ReactNode> = {
  dashboard: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  clients: <><circle cx="9" cy="8" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 5" /></>,
  car: <><path d="m5 8 2-4h10l2 4M3 10l2-2h14l2 2v8H3V10Zm2 8v3m14-3v3M6 13h2m8 0h2" /></>,
  folder: <path d="M3 7V4h6l3 3h9v13H3V7Z" />,
  estimate: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 7h8M8 11h2m4 0h2m-8 4h2m4 0h2m-8 3h2m4 0h2" /></>,
  work: <path d="M14 4a6 6 0 0 0-7 8L3 16a3 3 0 0 0 4 4l5-5a6 6 0 0 0 8-7l-4 4-4-4 4-4Z" />,
  invoice: <><path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3Z" /><path d="M8 7h8M8 11h8m-8 4h4" /></>,
  people: <><rect x="3" y="4" width="18" height="17" rx="2" /><circle cx="12" cy="10" r="3" /><path d="M7 19v-1a5 5 0 0 1 10 0v1M8 2v4m8-4v4" /></>,
  settings: <><path d="M3 6h18M3 12h18M3 18h18" /><path d="M8 3v6m8 0v6M8 15v6" /></>,
  audit: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  language: <><circle cx="12" cy="12" r="9" /><ellipse cx="12" cy="12" rx="4" ry="9" /><path d="M3 12h18" /></>,
};

export function NavIcon({ name }: { name: string }) {
  return <svg className="nav-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
