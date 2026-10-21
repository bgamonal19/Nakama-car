/** Version of the app online now (see app/app-version), or null when it cannot be read. */
export async function currentBuild(): Promise<string | null> {
  try {
    const response = await fetch(`/app-version?t=${Date.now()}`, { cache: "no-store" });
    if (!response.ok) return null;
    const data: { build?: string } = await response.json();
    return data.build || null;
  } catch {
    return null;
  }
}

/**
 * Loads the latest version for sure: drops any service worker and cached files, refetches the
 * page bypassing the HTTP cache (installed app and Android WebView keep it), then reloads.
 */
export async function forceUpdate() {
  try {
    const registrations = await navigator.serviceWorker?.getRegistrations();
    await Promise.all((registrations || []).map((registration) => registration.unregister()));
  } catch { /* not supported */ }
  try {
    if ("caches" in window) await Promise.all((await caches.keys()).map((name) => caches.delete(name)));
  } catch { /* not supported */ }
  try { await fetch(window.location.href, { cache: "reload", credentials: "same-origin" }); } catch { /* offline */ }
  window.location.reload();
}
