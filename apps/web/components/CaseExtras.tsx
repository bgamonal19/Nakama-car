"use client";

import { ChangeEvent, useEffect, useState } from "react";
import { useLanguage } from "./LanguageProvider";
import { apiError, apiFetch, formatMoney, hasPermission, uploadCasePhoto } from "../lib/api";
import { DamageMarker, DamagePhotoMap, MapPhoto, VehicleLook } from "./DamagePhotoMap";
import { CaseTracking } from "./CaseTracking";
import { TelemetryCard, TelemetryReading } from "./Telemetry";
import { loadPlateSpots, PlateSpots, savePlateSpot } from "../lib/plateSpots";

type Media = { id: string; category: string; original_filename?: string | null; mime_type?: string | null; damage_marker_id?: string | null; estimate_line_id?: string | null; in_database?: boolean };
type EstimateSummary = { id: string; estimate_number: string; status: string; total: string; contract_name?: string | null };

const categories = ["DAMAGE", "FRONT", "REAR", "LEFT", "RIGHT", "INTERIOR", "ODOMETER", "VIN", "DOCUMENT", "OTHER"];

/** Photos and estimates of one repair case, shown inside the case record. */
export function CaseExtras({ caseId, plate, workType }: { caseId: string; plate?: string; workType?: string }) {
  const { t } = useLanguage();
  const [media, setMedia] = useState<Media[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [estimates, setEstimates] = useState<EstimateSummary[]>([]);
  const [category, setCategory] = useState("DAMAGE");
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  const [vehicle, setVehicle] = useState<VehicleLook | null>(null);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [plateSpots, setPlateSpots] = useState<PlateSpots>({});
  const [parts, setParts] = useState<{ id: string; label: string }[]>([]);
  const [telemetry, setTelemetry] = useState<TelemetryReading | null>(null);
  const [markers, setMarkers] = useState<DamageMarker[]>([]);
  const [canEdit, setCanEdit] = useState(false);

  async function loadMarkers() {
    const response = await apiFetch(`/cases/${caseId}/damage-markers`);
    if (response.ok) {
      const data: (DamageMarker & { x: string | number; y: string | number })[] = await response.json();
      setMarkers(data.map((marker) => ({ ...marker, x: Number(marker.x), y: Number(marker.y) })));
    }
  }

  async function addMarker(marker: Omit<DamageMarker, "id">): Promise<DamageMarker | void> {
    const response = await apiFetch(`/cases/${caseId}/damage-markers`, { method: "POST", body: JSON.stringify(marker) });
    if (!response.ok) { setMessage(await apiError(response, "Impossibile salvare il danno.")); return; }
    const created = await response.json();
    await loadMarkers();
    return { ...created, x: Number(created.x), y: Number(created.y) };
  }

  async function attachPhoto(marker: DamageMarker, file: File) {
    setMessage("");
    const response = await uploadCasePhoto(caseId, file, "DAMAGE", marker.id);
    if (!response.ok) { setMessage(await apiError(response, "Caricamento non riuscito.")); return; }
    await loadMedia();
  }

  async function removeMarker(marker: DamageMarker) {
    const response = await apiFetch(`/cases/${caseId}/damage-markers/${marker.id}`, { method: "DELETE" });
    if (response.ok) await loadMarkers();
  }

  async function changeColor(color: string) {
    if (!vehicleId) return;
    const response = await apiFetch(`/vehicles/${vehicleId}`, { method: "PATCH", body: JSON.stringify({ color_name: color }) });
    if (response.ok) setVehicle((current) => ({ ...(current || {}), color }));
    else setMessage(await apiError(response, "Impossibile salvare il colore."));
  }

  async function loadMedia() {
    const response = await apiFetch(`/cases/${caseId}/media`);
    if (!response.ok) return;
    const items: Media[] = await response.json();
    setMedia(items);
    const resolved: Record<string, string> = {};
    let storageMissing = false;
    await Promise.all(items.map(async (item) => {
      if (item.in_database) {
        const content = await apiFetch(`/cases/${caseId}/media/${item.id}/content`);
        if (content.ok) resolved[item.id] = URL.createObjectURL(await content.blob());
        return;
      }
      const access = await apiFetch(`/cases/${caseId}/media/${item.id}/access-url`);
      if (access.ok) resolved[item.id] = (await access.json()).url;
      else if (access.status === 503) storageMissing = true;
    }));
    setUrls((previous) => {
      Object.values(previous).forEach((url) => { if (url.startsWith("blob:")) URL.revokeObjectURL(url); });
      return resolved;
    });
    if (storageMissing) setMessage("Archivio foto (S3) non configurato: le foto registrate non sono visualizzabili.");
  }

  useEffect(() => {
    setCanEdit(hasPermission("case.update"));
    loadMarkers();
    apiFetch(`/cases/${caseId}/parts`).then(async (response) => { if (response.ok) setParts(await response.json()); }).catch(() => undefined);
    setVehicle(null);
    setTelemetry(null);
    if (plate) {
      apiFetch(`/vehicles/by-plate/${encodeURIComponent(plate)}`).then(async (response) => {
        if (response.ok) {
          const data = await response.json();
          setVehicleId(data.id);
          apiFetch(`/vehicles/${data.id}/telemetry?limit=1`).then(async (reply) => { if (reply.ok) setTelemetry((await reply.json())[0] || null); }).catch(() => undefined);
          setVehicle({ make: data.make || "", model: data.model || "", year: data.year, color: data.color_name || "" });
          loadPlateSpots(data.make, data.model).then(setPlateSpots);
        }
      });
    }
  }, [caseId, plate]);

  useEffect(() => {
    setMessage("");
    loadMedia();
    apiFetch(`/estimates?repair_case_id=${caseId}`).then(async (response) => {
      if (response.ok) setEstimates(await response.json());
    });
  }, [caseId]);

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (files.length === 0) return;
    setUploading(true);
    setMessage("");
    try {
      for (const file of files) {
        const saved = await uploadCasePhoto(caseId, file, category);
        if (!saved.ok) throw new Error(await apiError(saved, "Caricamento non riuscito."));
      }
      await loadMedia();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Errore di connessione.");
    } finally {
      setUploading(false);
    }
  }

  const mapPhotos: MapPhoto[] = media
    .filter((item) => urls[item.id] && item.category !== "DOCUMENT")
    .map((item) => ({ id: item.id, url: urls[item.id], markerId: item.damage_marker_id, partId: item.estimate_line_id, category: item.category }));

  return (
    <div className="case-extras">
      {telemetry && (
        <div className="case-extras-block">
          <TelemetryCard reading={telemetry} />
        </div>
      )}
      <div className="case-extras-block">
        <h3>{t("Cliente: link di avanzamento e chat")}</h3>
        <CaseTracking caseId={caseId} plate={plate} />
      </div>
      <div className="case-extras-block">
        <h3>{workType === "MECHANICAL" ? t("Veicolo sul ponte · ricambi e interventi") : t("Mappa danni")}</h3>
        <DamagePhotoMap
          vehicle={vehicle || {}}
          plate={plate}
          markers={markers}
          onAdd={canEdit ? addMarker : undefined}
          onRemove={canEdit ? removeMarker : undefined}
          photos={mapPhotos}
          onAttachPhoto={canEdit ? attachPhoto : undefined}
          onColorChange={canEdit && vehicleId ? changeColor : undefined}
          plateSpots={plateSpots}
          parts={parts}
          scene={workType === "MECHANICAL" ? "lift" : "turntable"}
          onAttachPartPhoto={canEdit ? async (partId, file) => {
            setMessage("");
            const params = new URLSearchParams({ category: "OTHER", estimate_line_id: partId, filename: file.name.slice(0, 200) });
            const response = await apiFetch(`/cases/${caseId}/media/direct?${params.toString()}`, { method: "POST", headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
            if (!response.ok) { setMessage(await apiError(response, "Caricamento non riuscito.")); return; }
            await loadMedia();
          } : undefined}
          onPlateSpotSave={canEdit && vehicle?.make && vehicle?.model ? async (view, spot) => {
            try { setPlateSpots(await savePlateSpot(vehicle.make || "", vehicle.model || "", view, spot)); }
            catch (e) { setMessage(e instanceof Error ? e.message : "Errore di connessione."); }
          } : undefined}
        />
      </div>
      <div className="case-extras-block">
        <h3>{t("Preventivi della pratica")}</h3>
        {estimates.length === 0 ? <p className="hint">{t("Nessun preventivo.")}</p> : estimates.map((estimate) => (
          <a key={estimate.id} className="case-link" href={`/preventivi?id=${estimate.id}`}>
            <strong>{estimate.estimate_number}</strong>
            <span className="status-chip">{t(estimate.status)}</span>
            {estimate.contract_name && <span className="status-chip contract">{t("Contratto")}</span>}
            <span>{formatMoney(estimate.total)}</span>
          </a>
        ))}
      </div>
      <div className="case-extras-block">
        <div className="case-extras-head">
          <h3>{t("Foto")} ({media.length})</h3>
          <div className="photo-upload">
            <select aria-label={t("Categoria foto")} value={category} onChange={(e) => setCategory(e.target.value)}>
              {categories.map((code) => <option key={code} value={code}>{t(code)}</option>)}
            </select>
            <label className="secondary file-button">
              {uploading ? t("Caricamento…") : t("+ Aggiungi foto")}
              <input type="file" accept="image/*" capture="environment" multiple hidden disabled={uploading} onChange={upload} />
            </label>
          </div>
        </div>
        {message && <p className="hint" role="status">{t(message)}</p>}
        {media.length === 0 ? <p className="hint">{t("Nessuna foto registrata per questa pratica.")}</p> : (
          <div className="photo-gallery">
            {media.map((item) => (
              <figure key={item.id}>
                {urls[item.id] ? (
                  <a href={urls[item.id]} target="_blank" rel="noopener noreferrer"><img src={urls[item.id]} alt={`${t(item.category)} ${item.original_filename || ""}`} loading="lazy" /></a>
                ) : <div className="photo-placeholder">{t("Anteprima non disponibile")}</div>}
                <figcaption>{t(item.category)}</figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
