/** Specific part drawn for an estimate line (more precise than its zone on the car). */
export type PartKind =
  | "OIL" | "OIL_FILTER" | "AIR_FILTER" | "FUEL_FILTER" | "SPARK_PLUG" | "GLOW_PLUG" | "TIMING_KIT" | "WATER_PUMP" | "BELT"
  | "HEAD_GASKET" | "EGR" | "TURBO" | "INJECTOR" | "BRAKE_PAD" | "BRAKE_DISC" | "BRAKE_SHOE" | "CALIPER" | "FLUID"
  | "SHOCK" | "SPRING" | "CONTROL_ARM" | "TIE_ROD" | "BEARING" | "DRIVESHAFT" | "ALIGNMENT" | "CLUTCH" | "FLYWHEEL"
  | "ENGINE_MOUNT" | "DIAGNOSTIC" | "BATTERY" | "ALTERNATOR" | "STARTER" | "BULB" | "SENSOR" | "WIRING" | "AC"
  | "COMPRESSOR" | "RADIATOR" | "THERMOSTAT" | "TYRE" | "BALANCING" | "PUNCTURE" | "MUFFLER" | "CATALYST" | "DPF"
  | "INSPECTION" | "WIPER" | "TOW" | "COURTESY_CAR" | "WASTE" | "ENGINE";

// First match wins: specific words before generic ones (Italian and Spanish).
const rules: [RegExp, PartKind][] = [
  [/filtro (olio|aceite)/i, "OIL_FILTER"],
  [/filtro (aria|aire|abitacolo|habit[aá]culo|polline)/i, "AIR_FILTER"],
  [/filtro (carburante|gasolio|combustible|gasoil)/i, "FUEL_FILTER"],
  [/antiparticolato|dpf|fap/i, "DPF"],
  [/candelett|calentador/i, "GLOW_PLUG"],
  [/candel|buj[ií]a/i, "SPARK_PLUG"],
  [/distribuz|distribuci/i, "TIMING_KIT"],
  [/pompa (acqua|dell'acqua)|bomba de agua/i, "WATER_PUMP"],
  [/cinghi|correa/i, "BELT"],
  [/guarnizion|junta de culata/i, "HEAD_GASKET"],
  [/egr/i, "EGR"],
  [/turbo/i, "TURBO"],
  [/iniettor|inyector/i, "INJECTOR"],
  [/pastigl|pastill/i, "BRAKE_PAD"],
  [/ganasc|zapata|tambur/i, "BRAKE_SHOE"],
  [/pinz/i, "CALIPER"],
  [/disch|disco(s)? de freno/i, "BRAKE_DISC"],
  [/liquido (freni|refrigerante)|l[ií]quido (de frenos|refrigerante)|antigelo/i, "FLUID"],
  [/olio|aceite|lubrific/i, "OIL"],
  [/ammortizzator|amortiguador/i, "SHOCK"],
  [/moll|muelle/i, "SPRING"],
  [/braccio|brazo|trapezio/i, "CONTROL_ARM"],
  [/testin|r[oó]tula|sterzo|direcci/i, "TIE_ROD"],
  [/cuscinett|rodamiento/i, "BEARING"],
  [/semiass|palier|giunto/i, "DRIVESHAFT"],
  [/convergenz|alineaci|assetto/i, "ALIGNMENT"],
  [/frizion|embrague/i, "CLUTCH"],
  [/volano|volante bimasa/i, "FLYWHEEL"],
  [/support|soporte/i, "ENGINE_MOUNT"],
  [/diagnos|centralin|obd/i, "DIAGNOSTIC"],
  [/batteri|bater/i, "BATTERY"],
  [/alternator/i, "ALTERNATOR"],
  [/motorino|avviamento|motor de arranque/i, "STARTER"],
  [/lampad|fari|faro|bombill|luci|luces/i, "BULB"],
  [/sensor|sonda|lambda/i, "SENSOR"],
  [/elettric|el[eé]ctric|cablag/i, "WIRING"],
  [/compressore|compresor/i, "COMPRESSOR"],
  [/clima|aire acondicionado|condizionat/i, "AC"],
  [/radiator/i, "RADIATOR"],
  [/termostat/i, "THERMOSTAT"],
  [/equilibr/i, "BALANCING"],
  [/foratur|pinchazo/i, "PUNCTURE"],
  [/pneumat|gomm|neum[aá]tic/i, "TYRE"],
  [/catalizzat|catalizador/i, "CATALYST"],
  [/marmitt|silenziat|silencioso|scaric|escape/i, "MUFFLER"],
  [/revision|itv|collaudo/i, "INSPECTION"],
  [/tergicristall|spazzol|limpiaparabrisas/i, "WIPER"],
  [/soccorso|traino|gr[uú]a|carro attrezzi/i, "TOW"],
  [/cortesia|cortes[ií]a|sostitutiva/i, "COURTESY_CAR"],
  [/smaltiment|rifiut|residuo/i, "WASTE"],
  [/tagliand|motore|motor/i, "ENGINE"],
];

export function partKind(description: string): PartKind | null {
  return rules.find(([pattern]) => pattern.test(description || ""))?.[1] ?? null;
}
