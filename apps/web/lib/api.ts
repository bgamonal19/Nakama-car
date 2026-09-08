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
