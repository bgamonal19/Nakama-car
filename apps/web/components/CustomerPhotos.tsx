"use client";

import { useLanguage } from "./LanguageProvider";
import { MapPhoto } from "./DamagePhotoMap";

/** Photos of the case as blob URLs (list endpoint + one fetch per photo). */
export async function loadCustomerPhotos(getList: () => Promise<Response>, getOne: (id: string) => Promise<Response>): Promise<MapPhoto[]> {
  try {
    const list = await getList();
    if (!list.ok) return [];
    const items: { id: string; category: string; damage_marker_id?: string | null }[] = await list.json();
    const loaded = await Promise.all(items.map(async (item): Promise<MapPhoto | null> => {
      const response = await getOne(item.id).catch(() => null);
      if (!response || !response.ok) return null;
      return { id: item.id, url: URL.createObjectURL(await response.blob()), markerId: item.damage_marker_id, category: item.category };
    }));
    return loaded.filter((photo): photo is MapPhoto => photo !== null);
  } catch {
    return [];
  }
}

const VIEW_CATEGORIES = ["FRONT", "REAR", "LEFT", "RIGHT"];

/** Photos not tied to a pin or a side of the car (interior, odometer, extra damage shots). */
export function OtherPhotos({ photos }: { photos: MapPhoto[] }) {
  const { t } = useLanguage();
  const others = photos.filter((photo) => !photo.markerId && !VIEW_CATEGORIES.includes(photo.category));
  if (!others.length) return null;
  return (
    <div className="customer-photos" aria-label={t("Altre foto")}>
      {others.map((photo) => (
        <a key={photo.id} href={photo.url} target="_blank" rel="noopener noreferrer"><img src={photo.url} alt={t(photo.category)} loading="lazy" /></a>
      ))}
    </div>
  );
}

