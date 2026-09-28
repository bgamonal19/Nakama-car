import { apiError, apiFetch } from "./api";
import type { MarkerView, PlateSpotValue } from "../components/DamagePhotoMap";

export type PlateSpots = Partial<Record<MarkerView, PlateSpotValue>>;

export async function loadPlateSpots(make?: string, model?: string): Promise<PlateSpots> {
  if (!make || !model) return {};
  const response = await apiFetch(`/renders/plate-spots?${new URLSearchParams({ make, model }).toString()}`).catch(() => null);
  return response?.ok ? response.json() : {};
}

/** Save (or reset with null) the plate position of one view for this make/model. */
export async function savePlateSpot(make: string, model: string, view: MarkerView, spot: PlateSpotValue | null): Promise<PlateSpots> {
  const response = spot
    ? await apiFetch("/renders/plate-spots", { method: "PUT", body: JSON.stringify({ make, model, view, ...spot }) })
    : await apiFetch(`/renders/plate-spots?${new URLSearchParams({ make, model, view }).toString()}`, { method: "DELETE" });
  if (!response.ok) throw new Error(await apiError(response, "Impossibile salvare la posizione della targa."));
  return response.json();
}
