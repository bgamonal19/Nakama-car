import { ReactNode } from "react";

const shapes: Record<string, ReactNode> = {
  RECEPTION: <><path d="M4 16h16v5H4zM7 12a5 5 0 0 1 10 0v4M12 7V5m-2 0h4" /></>,
  BODYSHOP: <><path d="m4 10 2-5h12l2 5M3 10h18v8H3zM6 18v3m12-3v3M6 13h2m8 0h2" /></>,
  PAINTER: <><path d="M5 3h14v6H5zM19 6h2v6h-9v3M10 15h4v6h-4z" /></>,
  MECHANIC: <><path d="M14 3a6 6 0 0 0-7 8L3 15a3 3 0 0 0 4 4l4-4a6 6 0 0 0 8-7l-4 4-3-3z" /></>,
  ACCOUNTING: <><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M8 6h8M8 10h1m6 0h1m-8 4h1m6 0h1m-8 4h1m6 0h1" /></>,
  ADMIN: <><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6" /></>,
};

export function ItemIcon({ name }: { name: string }) {
  return <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{shapes[name] || <circle cx="12" cy="12" r="8" />}</svg>;
}
