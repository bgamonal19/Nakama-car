"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "./LanguageProvider";
import { apiError, apiFetch } from "../lib/api";

type ContractDocument = { id: string; filename: string; content_type: string; size_bytes: number; created_at: string };

const MAX_BYTES = 15 * 1024 * 1024;

function size(bytes: number) {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Upload one file to a contract; returns an error message, or "" when it went through. */
export async function uploadContractDocument(contractId: string, file: File): Promise<string> {
  if (file.size > MAX_BYTES) return `${file.name}: max 15 MB`;
  const response = await apiFetch(`/contracts/${contractId}/documents?filename=${encodeURIComponent(file.name)}`, {
    method: "POST", body: file, headers: { "Content-Type": file.type || "application/octet-stream" },
  });
  return response.ok ? "" : `${file.name}: ${await apiError(response, "Caricamento non riuscito.")}`;
}

/** Files kept with a fleet contract: the signed contract, annexes, price lists… */
export function ContractDocuments({ contractId, canWrite }: { contractId: string; canWrite: boolean }) {
  const { language } = useLanguage();
  const words = (it: string, es: string) => language === "es" ? es : it;
  const [items, setItems] = useState<ContractDocument[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  async function load() {
    const response = await apiFetch(`/contracts/${contractId}/documents`);
    if (response.ok) setItems(await response.json());
  }

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [contractId]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError("");
    const failed: string[] = [];
    for (const file of Array.from(files)) {
      const problem = await uploadContractDocument(contractId, file);
      if (problem) failed.push(problem);
    }
    if (failed.length) setError(failed.join(" · "));
    await load();
    setBusy(false);
  }

  async function download(document_: ContractDocument) {
    const response = await apiFetch(`/contracts/${contractId}/documents/${document_.id}`);
    if (!response.ok) { setError(await apiError(response, "Impossibile scaricare il file.")); return; }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement("a");
    link.href = url;
    link.download = document_.filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function remove(document_: ContractDocument) {
    if (!window.confirm(words(`Eliminare il file «${document_.filename}»?`, `¿Eliminar el archivo «${document_.filename}»?`))) return;
    const response = await apiFetch(`/contracts/${contractId}/documents/${document_.id}`, { method: "DELETE" });
    if (!response.ok) { setError(await apiError(response, "Impossibile eliminare il file.")); return; }
    await load();
  }

  return (
    <div className="contract-documents">
      <span className="contract-documents-title">{words("Documenti del contratto", "Documentos del contrato")}</span>
      {items.length === 0 && <small className="hint">{words("Nessun file. Carica il contratto firmato o gli allegati (PDF, foto, Word, Excel).", "Ningún archivo. Sube el contrato firmado o los anexos (PDF, fotos, Word, Excel).")}</small>}
      {items.map((item) => (
        <span className="contract-document" key={item.id}>
          <button type="button" className="ghost" onClick={() => download(item)}>📄 {item.filename}</button>
          <small>{size(item.size_bytes)} · {item.created_at.slice(0, 10)}</small>
          {canWrite && <button type="button" className="ghost record-delete" onClick={() => remove(item)}>{words("Elimina", "Eliminar")}</button>}
        </span>
      ))}
      {error && <small className="record-error" role="alert">{error}</small>}
      {canWrite && <>
        <input ref={input} type="file" multiple hidden onChange={(e) => { const files = e.target.files; void upload(files).then(() => { if (input.current) input.current.value = ""; }); }} />
        <button type="button" className="secondary" disabled={busy} onClick={() => input.current?.click()}>{busy ? words("Caricamento…", "Subiendo…") : words("+ Carica file", "+ Subir archivo")}</button>
      </>}
    </div>
  );
}
