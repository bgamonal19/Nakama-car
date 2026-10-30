"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

type Props = { make?: unknown; model?: unknown; year?: unknown; color?: unknown; size?: number };

/**
 * Small studio picture of the front of the vehicle (same renders as the damage map, paid once per model).
 * Shows nothing while loading, without make/model, or when the model is not in the catalog.
 */
export function VehicleFront({ make, model, year, color, size = 140 }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const brand = typeof make === "string" ? make.trim() : "";
  const name = typeof model === "string" ? model.trim() : "";
  const built = Number(year);
  const paint = typeof color === "string" ? color.trim() : "";

  useEffect(() => {
    setSrc(null);
    if (!brand || !name) return;
    let url: string | null = null;
    let cancelled = false;
    const params = new URLSearchParams({ make: brand, model: name, view: "front", v: "4" });
    if (built >= 1950 && built <= 2100) params.set("year", String(built));
    if (paint) params.set("color", paint);
    apiFetch(`/renders/car?${params.toString()}`)
      .then(async (response) => {
        if (!response.ok || cancelled) return;
        url = URL.createObjectURL(await response.blob());
        if (cancelled) URL.revokeObjectURL(url);
        else setSrc(url);
      })
      .catch(() => undefined);
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [brand, name, built, paint]);

  if (!src) return null;
  return <img className="vehicle-front" src={src} alt={`${brand} ${name}`} style={{ width: size }} />;
}
