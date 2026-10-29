import { apiError, apiFetch, hasPermission } from "./api";
import { typedConfirm } from "./caseDeletion";

type Words = (it: string, es: string) => string;
type Plate = { id: string; license_plate: string };
type Plan = { deleted: Plate[]; refused: (Plate & { reason: string })[]; cases: number; with_history: string[]; blocked: string[] };

/**
 * Deletes the selected vehicles after telling the user what goes with them (same rules as customers):
 * vehicles with invoiced cases stay, vehicles with cases need an administrator and the word ELIMINA.
 * Returns the deleted vehicles (empty when the user cancels); throws a message when none can go.
 */
export async function deleteVehiclesWithConfirm(ids: string[], words: Words): Promise<{ deleted: Plate[]; kept: string[] }> {
  const force = hasPermission("users.manage");
  const send = async (dryRun: boolean): Promise<Plan> => {
    const response = await apiFetch(`/vehicles/bulk-delete${dryRun ? "?dry_run=true" : ""}`, { method: "POST", body: JSON.stringify({ ids, force }) });
    if (response.status === 403) throw new Error(words("Il tuo profilo non consente questa operazione.", "Tu perfil no permite esta operación."));
    if (!response.ok) throw new Error(await apiError(response, words("Operazione non riuscita. Riprova.", "La operación falló. Inténtalo de nuevo.")));
    return response.json();
  };
  const plan = await send(true);
  const going = new Set(plan.deleted.map((item) => item.license_plate));
  const withHistory = plan.with_history.filter((plate) => going.has(plate));
  const notes = [
    plan.blocked.length ? words(`Restano perché hanno fatture: ${plan.blocked.join(", ")}.`, `Se quedan porque tienen facturas: ${plan.blocked.join(", ")}.`) : "",
    !force && plan.with_history.length ? words(`Hanno pratiche, solo un amministratore può eliminarli: ${plan.with_history.join(", ")}.`, `Tienen expedientes, solo un administrador puede eliminarlos: ${plan.with_history.join(", ")}.`) : "",
  ].filter(Boolean).join("\n");
  if (!plan.deleted.length) throw new Error(notes || words("Nessun veicolo da eliminare.", "Ningún vehículo que eliminar."));

  const plates = plan.deleted.map((item) => item.license_plate);
  const list = plates.length > 12 ? `${plates.slice(0, 12).join(", ")}… (+${plates.length - 12})` : plates.join(", ");
  const history = withHistory.length
    ? words(`\n\n${withHistory.join(", ")} ${withHistory.length === 1 ? "ha" : "hanno"} pratiche: si eliminano anche ${plan.cases} pratiche con preventivi, lavori, foto e chat.`,
      `\n\n${withHistory.join(", ")} ${withHistory.length === 1 ? "tiene" : "tienen"} expedientes: también se eliminan ${plan.cases} expedientes con presupuestos, trabajos, fotos y chat.`)
    : "";
  const text = words(
    `Eliminare ${plates.length === 1 ? "il veicolo" : `${plates.length} veicoli`}: ${list}?${history}${notes ? `\n\n${notes}` : ""}\n\nL'operazione non si può annullare.`,
    `¿Eliminar ${plates.length === 1 ? "el vehículo" : `${plates.length} vehículos`}: ${list}?${history}${notes ? `\n\n${notes}` : ""}\n\nNo se puede deshacer.`);
  if (!window.confirm(text)) return { deleted: [], kept: [] };
  if (withHistory.length && !(await typedConfirm(words))) return { deleted: [], kept: [] };
  const result = await send(false);
  return { deleted: result.deleted, kept: result.refused.map((item) => item.license_plate) };
}
