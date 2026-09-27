export const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export function getAccessToken() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("nakama_access_token");
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const token = getAccessToken();
  const headers = new Headers(init.headers || {});
  if (!headers.has("Content-Type") && init.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  return fetch(`${API_URL}${path}`, {
    ...init,
    headers,
  });
}

export function saveSession(payload: {
  access_token: string;
  first_name: string;
  last_name: string;
  tenant_id: string;
  permissions: string[];
}) {
  localStorage.setItem("nakama_access_token", payload.access_token);
  localStorage.setItem("nakama_user", JSON.stringify({
    first_name: payload.first_name,
    last_name: payload.last_name,
    tenant_id: payload.tenant_id,
    permissions: payload.permissions,
  }));
}

export function clearSession() {
  localStorage.removeItem("nakama_access_token");
  localStorage.removeItem("nakama_user");
}

export function hasPermission(permission: string) {
  if (typeof window === "undefined") return false;
  try {
    const permissions: string[] = JSON.parse(localStorage.getItem("nakama_user") || "{}").permissions || [];
    return permissions.includes(permission);
  } catch {
    return false;
  }
}

/** Read an error message from a failed API response (FastAPI `detail`). */
export async function apiError(response: Response, fallback: string) {
  const data = await response.json().catch(() => ({}));
  const detail = data?.detail;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object" && typeof detail.message === "string") {
    if (Array.isArray(detail.missing)) return `Dati mancanti per l'XML FatturaPA: ${detail.missing.join(", ")}`;
    return detail.message;
  }
  return fallback;
}

/**
 * Open (PDF) or download (XML) a protected file. The API needs the bearer token,
 * so the file is fetched and handed to the browser as a blob URL.
 */
export async function openProtectedFile(path: string, filename: string, download = false) {
  const token = getAccessToken();
  if (!token) return "Sessione scaduta. Accedi di nuovo.";
  const response = await fetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok) return apiError(response, "File non disponibile");
  const url = URL.createObjectURL(await response.blob());
  if (download) {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } else {
    window.open(url, "_blank", "noopener");
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return null;
}

export function formatMoney(value: string | number | null | undefined) {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(Number(value || 0));
}

export function customerLabel(customer: { company_name?: string | null; first_name?: string | null; last_name?: string | null }) {
  return customer.company_name || [customer.first_name, customer.last_name].filter(Boolean).join(" ");
}
