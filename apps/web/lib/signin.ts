/**
 * One sign-in for both login pages: the workshop login (/login) and the customer portal login (/portale/login).
 * Each page tries its own account type first and, on wrong credentials, the other one, so a worker who types
 * their access on the customer page (or a customer on the workshop page) still gets in.
 * No imports on purpose: it is unit tested with plain `node --test` (lib/signin.test.ts).
 */

export type StaffSession = {
  access_token: string;
  first_name: string;
  last_name: string;
  tenant_id: string;
  permissions: string[];
  roles?: string[];
  work_area?: "BODY" | "MECHANICAL" | null;
  /** True until the user ticks the two boxes (terms, privacy notice) of the current version. */
  legal_required?: boolean;
};

export type SignInResult =
  | { kind: "staff"; session: StaffSession }
  | { kind: "portal"; token: string; legalRequired: boolean }
  | { kind: "error"; message: string };

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

export const WRONG_CREDENTIALS = "Email o password non corretti.";
export const SERVER_UNREACHABLE = "Server non raggiungibile. Controlla la connessione e riprova.";
export const SERVER_ERROR = "Errore del server. Riprova tra poco.";

type Attempt = { ok: true; data: Record<string, unknown> } | { ok: false; status: number; message?: string };

async function attempt(fetcher: Fetch, url: string, email: string, password: string): Promise<Attempt> {
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    return { ok: false, status: 0 };
  }
  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (response.ok && typeof data.access_token === "string") return { ok: true, data };
  return { ok: false, status: response.status, message: typeof data.detail === "string" ? data.detail : undefined };
}

function failure(result: Attempt & { ok: false }): string {
  if (result.status === 0) return SERVER_UNREACHABLE;
  if (result.status >= 500) return SERVER_ERROR;
  if (result.status === 401 || result.status === 422) return WRONG_CREDENTIALS;
  return result.message || WRONG_CREDENTIALS;
}

export async function signIn(apiUrl: string, rawEmail: string, password: string, prefer: "staff" | "portal", fetcher: Fetch = fetch): Promise<SignInResult> {
  // Phones often add a trailing space or a capital letter to the email.
  const email = rawEmail.trim().toLowerCase();
  const tries = {
    staff: () => attempt(fetcher, `${apiUrl}/auth/login`, email, password),
    portal: () => attempt(fetcher, `${apiUrl}/portal/auth/login`, email, password),
  };
  const other = prefer === "staff" ? "portal" : "staff";

  let kind: "staff" | "portal" = prefer;
  const first = await tries[prefer]();
  let result = first;
  if (!first.ok && first.status === 401) {
    kind = other;
    result = await tries[other]();
  }
  if (result.ok) {
    return kind === "staff"
      ? { kind: "staff", session: result.data as unknown as StaffSession }
      : { kind: "portal", token: result.data.access_token as string, legalRequired: result.data.legal_required === true };
  }
  // Report the first page's own problem (e.g. "No tenant membership"), unless it was only wrong credentials.
  return { kind: "error", message: failure(!first.ok && first.status !== 401 ? first : result as Attempt & { ok: false }) };
}

/** True when the account must tick the terms and privacy boxes before entering. */
export function needsLegal(result: SignInResult): boolean {
  if (result.kind === "staff") return result.session.legal_required === true;
  return result.kind === "portal" && result.legalRequired;
}

/** Stores the two acceptances (terms, privacy notice) on the account just signed in; false if it did not work. */
export async function acceptLegal(apiUrl: string, result: SignInResult, fetcher: Fetch = fetch): Promise<boolean> {
  if (result.kind === "error") return false;
  const [path, token] = result.kind === "staff" ? ["/auth/legal", result.session.access_token] : ["/portal/legal", result.token];
  try {
    const response = await fetcher(`${apiUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ accept_terms: true, accept_privacy: true }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
