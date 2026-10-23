"use client";

import { useEffect, useState } from "react";

/**
 * Company logo of a customer, fetched with the session (staff or portal) and shown as a blob URL;
 * without a logo, the initials of the name. `version` (the logo's date) refreshes it after a change.
 */
export function CustomerLogo({ name, version, load, size = 64 }: {
  name: string; version?: string | null; load: () => Promise<Response>; size?: number;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!version) { setUrl(null); return; }
    let objectUrl: string | null = null;
    let cancelled = false;
    load().then(async (response) => {
      if (!response.ok || cancelled) return;
      objectUrl = URL.createObjectURL(await response.blob());
      if (cancelled) URL.revokeObjectURL(objectUrl); else setUrl(objectUrl);
    }).catch(() => setUrl(null));
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
    // `load` is a new function on every render: the logo changes only with its version.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "?";
  return (
    <span className={`customer-logo${url ? " has-image" : ""}`} style={{ width: size, height: size, fontSize: Math.round(size / 2.6) }}>
      {url ? <img src={url} alt="" /> : <span aria-hidden="true">{initials}</span>}
    </span>
  );
}
