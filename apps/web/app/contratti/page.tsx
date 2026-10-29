"use client";

import { useEffect, useState } from "react";
import { SectionShell } from "../../components/SectionShell";
import { FleetContracts } from "../../components/FleetContracts";
import { useLanguage } from "../../components/LanguageProvider";
import { getAccessToken, hasPermission } from "../../lib/api";

export default function ContrattiPage() {
  const { t, language } = useLanguage();
  const [signedIn, setSignedIn] = useState(false);
  const [canWrite, setCanWrite] = useState(false);
  const [creating, setCreating] = useState(0);

  useEffect(() => {
    setSignedIn(Boolean(getAccessToken()));
    setCanWrite(hasPermission("customer.write"));
  }, []);

  const actions = signedIn && canWrite ? <button className="primary" onClick={() => setCreating((n) => n + 1)}>{t("+ Nuovo contratto")}</button> : null;

  return (
    <SectionShell title={t("Contratti flotta")} eyebrow={t("FLOTTE AZIENDALI")} actions={actions}>
      {!signedIn ? (
        <div className="empty-state">{t("Accedi per gestire i contratti.")} <a href="/login">{t("Accedi")}</a></div>
      ) : (
        <>
          <p className="section-intro">
            {t("Le aziende con contratto (es. Univex, Gamonal) pagano un canone mensile: nei loro preventivi la manodopera è inclusa e i ricambi sono a costo più ricarico. I clienti al pubblico usano il listino normale.")}
            {" "}{language === "es" ? "El contrato también aparece en el perfil de cada cliente (Clientes)." : "Il contratto si vede e si gestisce anche nel profilo di ogni cliente (Clienti)."}
          </p>
          <FleetContracts creating={creating} />
        </>
      )}
    </SectionShell>
  );
}
