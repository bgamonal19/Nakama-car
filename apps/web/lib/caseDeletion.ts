import { apiError, apiFetch, hasPermission } from "./api";
import { askText } from "./askText";

type Words = (it: string, es: string) => string;
type Plan = Record<string, string | number | boolean | null>;

/**
 * Deletes a repair case after telling the user what goes with it. Cases whose work has started
 * need an administrator and the word ELIMINA typed in; cases with invoices are never deleted.
 * Returns false when the user cancels; throws with a message to show when it cannot be done.
 */
export async function deleteCaseWithConfirm(caseId: string, label: string, words: Words): Promise<boolean> {
  const path = `/cases/${caseId}`;
  const preview = await apiFetch(`${path}/deletion`);
  if (preview.status === 403) throw new Error(words("Il tuo profilo non consente questa operazione.", "Tu perfil no permite esta operación."));
  if (preview.status === 404) return true;
  if (!preview.ok) throw new Error(words("Operazione non riuscita. Riprova.", "La operación falló. Inténtalo de nuevo."));
  const plan: Plan = await preview.json();
  if (plan.blocked) throw new Error(words("Questa pratica ha fatture: le fatture emesse restano in archivio, quindi la pratica non si può eliminare.", "Este expediente tiene facturas: las facturas emitidas se conservan, así que el expediente no se puede eliminar."));
  const force = Boolean(plan.work_started);
  if (force && !hasPermission("users.manage")) throw new Error(words("I lavori di questa pratica sono già iniziati: solo un amministratore può eliminarla.", "Los trabajos de este expediente ya empezaron: solo un administrador puede eliminarlo."));
  const parts = ([
    [plan.estimates, "preventivi", "presupuestos"], [plan.work_orders, "ordini di lavoro", "órdenes de trabajo"],
    [plan.started_tasks, "lavorazioni iniziate o fatte", "tareas empezadas o hechas"], [plan.photos, "foto", "fotos"], [plan.messages, "messaggi", "mensajes"],
  ] as [unknown, string, string][]).filter(([n]) => Number(n) > 0).map(([n, it, es]) => `${n} ${words(it, es)}`).join(", ");
  const text = words(
    `Eliminare la pratica ${label}?${force ? " I lavori sono già iniziati." : ""}\n\nSi elimina anche: ${parts || "nient'altro"}.\nCliente e veicolo restano.\n\nL'operazione non si può annullare.`,
    `¿Eliminar el expediente ${label}?${force ? " Los trabajos ya empezaron." : ""}\n\nTambién se elimina: ${parts || "nada más"}.\nEl cliente y el vehículo se quedan.\n\nNo se puede deshacer.`);
  if (!window.confirm(text)) return false;
  if (force && !(await typedConfirm(words))) return false;
  const response = await apiFetch(`${path}${force ? "?force=true" : ""}`, { method: "DELETE" });
  if (response.status === 409) throw new Error(await apiError(response, words("Non si può eliminare.", "No se puede eliminar.")));
  if (response.status === 403) throw new Error(words("Solo un amministratore può eliminarlo.", "Solo un administrador puede eliminarlo."));
  if (!response.ok && response.status !== 404) throw new Error(words("Operazione non riuscita. Riprova.", "La operación falló. Inténtalo de nuevo."));
  return true;
}

/** Records with history need the word typed in, so a slip of the finger never removes them. */
export async function typedConfirm(words: Words) {
  const typed = await askText(words("Per confermare scrivi ELIMINA", "Para confirmar escribe ELIMINA"), { ok: words("Elimina", "Eliminar"), cancel: words("Annulla", "Cancelar") });
  return typed?.trim().toUpperCase() === "ELIMINA";
}
