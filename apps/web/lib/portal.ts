import { API_URL } from "./api";

const TOKEN_KEY = "nakama_portal_token";

export function getPortalToken() {
  if (typeof window === "undefined") return null;
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function savePortalToken(token: string) {
  try { localStorage.setItem(TOKEN_KEY, token); } catch { /* private mode */ }
}

export function clearPortalToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* private mode */ }
}

/** Fetch for the fleet customer portal; an expired session goes back to the portal login. */
export async function portalFetch(path: string, init: RequestInit = {}) {
  const token = getPortalToken();
  const headers = new Headers(init.headers || {});
  if (!headers.has("Content-Type") && init.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (response.status === 401 && typeof window !== "undefined" && !window.location.pathname.startsWith("/portale/login")) {
    clearPortalToken();
    window.location.assign("/portale/login?expired=1");
  }
  return response;
}

export async function portalError(response: Response, fallback: string) {
  const data = await response.json().catch(() => ({}));
  return typeof data.detail === "string" ? data.detail : fallback;
}
