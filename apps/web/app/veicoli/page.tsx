"use client";

import { useLanguage } from "../../components/LanguageProvider";

import { useEffect, useState } from "react";
import { SectionShell } from "../../components/SectionShell";
import { apiFetch, getAccessToken } from "../../lib/api";

type Vehicle={id:string;license_plate:string;vin?:string;make?:string;model?:string;version?:string;year?:number;mileage?:number;color_name?:string;paint_code?:string};

export default function VeicoliPage(){
  const { t } = useLanguage();
 const [items,setItems]=useState<Vehicle[]>([]);
 useEffect(()=>{if(getAccessToken())apiFetch("/vehicles").then(async r=>r.ok&&setItems(await r.json()));},[]);
 return <SectionShell title={t("Veicoli")} eyebrow={t("PARCO VEICOLI CLIENTI")}>
  {!getAccessToken()?<div className="empty-state">{t("Accedi per visualizzare i veicoli.")} <a href="/login">{t("Accedi")}</a></div>:<div className="panel list-panel">
   <div className="data-table vehicles head"><span>{t("Targa")}</span><span>{t("Veicolo")}</span><span>VIN</span><span>{t("Anno")}</span><span>Km</span><span>{t("Vernice")}</span></div>
   {items.length===0?<div className="empty-state">{t("Nessun veicolo.")}</div>:items.map(x=><div className="data-table vehicles" key={x.id}><strong>{x.license_plate}</strong><span>{[x.make,x.model,x.version].filter(Boolean).join(" ")||"—"}</span><span>{x.vin||"—"}</span><span>{x.year||"—"}</span><span>{x.mileage||"—"}</span><span>{x.paint_code||x.color_name||"—"}</span></div>)}
  </div>}
 </SectionShell>;
}
