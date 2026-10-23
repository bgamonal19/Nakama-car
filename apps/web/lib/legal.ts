/**
 * Legal texts of the app (Italian + Spanish): terms and conditions, privacy notice (art. 13 GDPR) and cookie policy.
 * Written for NAKAMA CAR S.R.L.S. under Italian law (GDPR, D.Lgs. 196/2003 as amended, Garante cookie guidelines of
 * 10 June 2021, Codice del Consumo). Data marked «DA COMPLETARE» must be filled in, and the texts reviewed by a lawyer.
 * When a change must be accepted again, bump LEGAL_VERSION here and in apps/api/app/services/access.py.
 */
import type { Language } from "./translations";

export const LEGAL_VERSION = "2026-10-23";
export const LEGAL_UPDATED = "23/10/2026";

/** Company data shown in the texts. Replace the bracketed placeholders with the real data. */
export const COMPANY = {
  name: "NAKAMA CAR S.R.L.S.",
  vat: "[DA COMPLETARE: Partita IVA]",
  address: "[DA COMPLETARE: sede legale, CAP, città]",
  email: "[DA COMPLETARE: email per la privacy]",
  pec: "[DA COMPLETARE: PEC]",
  court: "[DA COMPLETARE: città del tribunale della sede]",
  storage: "[DA COMPLETARE: fornitore archivio foto/documenti, es. Cloudflare R2 o AWS S3, e regione]",
};

export type LegalDoc = "termini" | "privacy" | "cookie";
export const LEGAL_PATHS: Record<LegalDoc, string> = { termini: "/legal/termini", privacy: "/legal/privacy", cookie: "/legal/cookie" };

type Section = { title: string; text?: string[]; items?: string[] };
type Document = { title: string; intro: string; sections: Section[] };

const c = COMPANY;

const it: Record<LegalDoc, Document> = {
  termini: {
    title: "Termini e condizioni d'uso",
    intro: `Questi termini regolano l'uso dell'app NAKAMA CAR (sito web, app Android e app per Mac) messa a disposizione da ${c.name}. Accedendo all'app o accettando un preventivo online li accetti. Leggi anche l'informativa privacy, che è un documento separato.`,
    sections: [
      { title: "1. Chi siamo", text: [`${c.name}, P.IVA ${c.vat}, sede ${c.address}. Email ${c.email}, PEC ${c.pec}.`] },
      { title: "2. A cosa serve l'app", text: ["L'app serve a gestire i servizi dell'officina: preventivi, riparazioni, manutenzione dei veicoli, fatture e comunicazioni con l'officina. La usano il personale dell'officina, i clienti con accesso al portale (per esempio i clienti flotta) e i clienti che ricevono un preventivo tramite link."] },
      { title: "3. Credenziali di accesso", items: [
        "Le credenziali sono personali: non cederle e non condividerle.",
        "Sei responsabile di custodirle. Se pensi che qualcuno le conosca, cambia la password e avvisa subito l'officina.",
        "Per sicurezza registriamo ogni accesso (data, ora, indirizzo IP, app usata ed esito), come spiegato nell'informativa privacy.",
        "Possiamo sospendere un accesso in caso di uso improprio o su richiesta del cliente titolare dell'account.",
      ] },
      { title: "4. Uso consentito", items: [
        "Usa l'app solo per i rapporti con l'officina.",
        "È vietato cercare di accedere a dati di altri, aggirare le protezioni, caricare contenuti illeciti, offensivi o virus, o usare l'app in modo da danneggiarne il funzionamento.",
        "Nei messaggi e nelle note non inserire dati non necessari, in particolare dati sulla salute o altri dati particolari.",
      ] },
      { title: "5. Preventivi accettati online", items: [
        "Il preventivo indica lavori, ricambi, prezzi e IVA. Accettarlo con nome e cognome e con la spunta dei termini vale come conferma dell'incarico all'officina (contratto d'opera, art. 2222 e seguenti del Codice civile).",
        "Il preventivo vale per i giorni indicati. Lavori in più, scoperti durante la riparazione, vengono eseguiti solo dopo una nuova approvazione.",
        "Registriamo la risposta con data, ora, indirizzo IP e browser come prova dell'accettazione.",
        "Se sei un consumatore e accetti il preventivo a distanza (dal link, senza firmare in officina), hai diritto di recedere entro 14 giorni senza motivo (artt. 52 e seguenti del Codice del Consumo). Se chiedi di iniziare subito i lavori, paghi quanto già eseguito in caso di recesso e perdi il diritto di recesso quando la riparazione è completata (art. 59, lett. a, del Codice del Consumo). Il recesso si esercita scrivendo a " + c.email + ".",
      ] },
      { title: "6. Informazioni e documenti", text: ["Stato dei lavori, scadenze di manutenzione e chilometri sono indicativi e dipendono dai dati disponibili. Il documento fiscale valido è la fattura elettronica trasmessa allo SdI; il PDF nell'app è una copia di cortesia."] },
      { title: "7. Disponibilità del servizio", text: ["Facciamo il possibile perché l'app sia sempre disponibile, ma può interrompersi per manutenzione, aggiornamenti o problemi dei fornitori tecnici. In quel caso puoi sempre contattare l'officina direttamente."] },
      { title: "8. Responsabilità", text: ["Non rispondiamo dei danni dovuti a uso improprio dell'app o delle credenziali da parte dell'utente, né di interruzioni non dipendenti da noi. Restano sempre salvi i diritti che la legge riconosce al consumatore e la responsabilità per dolo o colpa grave."] },
      { title: "9. Proprietà intellettuale", text: ["L'app, il marchio NAKAMA CAR, la grafica e i testi appartengono ai rispettivi titolari. Non è consentito copiarli o riutilizzarli senza autorizzazione."] },
      { title: "10. Privacy e cookie", text: ["Il trattamento dei dati personali è descritto nell'informativa privacy; gli strumenti salvati sul dispositivo nella cookie policy."] },
      { title: "11. Modifiche", text: ["Possiamo aggiornare questi termini. Se le modifiche sono importanti, ti chiederemo di accettarli di nuovo al prossimo accesso."] },
      { title: "12. Legge applicabile e foro", text: [`Si applica la legge italiana. Per i consumatori è competente il giudice del luogo di residenza o domicilio del consumatore (art. 66-bis Codice del Consumo). Per tutti gli altri utenti è competente in via esclusiva il Foro di ${c.court}.`] },
    ],
  },
  privacy: {
    title: "Informativa sul trattamento dei dati personali",
    intro: "Ai sensi degli artt. 13 e 14 del Regolamento (UE) 2016/679 (GDPR) e del D.Lgs. 196/2003 (Codice privacy), ti spieghiamo quali dati trattiamo con l'app NAKAMA CAR, perché, per quanto tempo e quali sono i tuoi diritti.",
    sections: [
      { title: "1. Titolare del trattamento", text: [`${c.name}, P.IVA ${c.vat}, sede ${c.address}. Contatti per la privacy: ${c.email}, PEC ${c.pec}. Non è stato nominato un Responsabile della protezione dei dati (DPO) perché per la nostra attività non è obbligatorio.`] },
      { title: "2. Quali dati trattiamo", items: [
        "Clienti: nome e cognome o ragione sociale, codice fiscale o partita IVA, indirizzo, telefono, email, PEC e codice SDI (solo quelli che servono per i lavori e per la fattura).",
        "Veicoli: targa, telaio (VIN), marca, modello, chilometri, foto del veicolo e dei danni, lavori, preventivi, fatture e scadenze di manutenzione.",
        "Accettazione dei preventivi online: nome indicato come firma, eventuali note, data, ora, indirizzo IP e browser.",
        "Clienti con accesso al portale: nome del referente, email, password (salvata solo in forma cifrata) e messaggi scambiati con l'officina.",
        "Dati dai sistemi di bordo (solo per i clienti flotta che collegano la telematica): chilometri, anomalie e ultima posizione del veicolo. Il cliente flotta deve informare i propri autisti.",
        "Personale dell'officina: nome, email, telefono, contatto di emergenza, ruolo, competenze e lavori assegnati.",
        "Registro degli accessi: account, data e ora, esito, indirizzo IP, browser e tipo di app (web, Android, Mac).",
      ] },
      { title: "3. Perché li trattiamo e su quale base", items: [
        "Preparare preventivi, eseguire riparazioni e manutenzioni, gestire il portale e comunicare con te: esecuzione del contratto o di misure precontrattuali (art. 6.1.b GDPR).",
        "Fatturazione elettronica, contabilità e obblighi fiscali: obbligo di legge (art. 6.1.c GDPR).",
        "Sicurezza dell'app, registro degli accessi, prevenzione di abusi e difesa dei nostri diritti: legittimo interesse (art. 6.1.f GDPR).",
        "Personale: gestione del rapporto di lavoro (art. 6.1.b e art. 88 GDPR, art. 113 Codice privacy). Il registro accessi serve solo alla sicurezza e non per controllare l'attività dei lavoratori (art. 4 L. 300/1970).",
        "Non usiamo i dati per pubblicità, non facciamo profilazione e non prendiamo decisioni automatizzate.",
      ] },
      { title: "4. Sei obbligato a darci i dati?", text: ["I dati richiesti sono quelli necessari per i lavori e per la fattura: senza di essi non possiamo eseguire il servizio. I campi facoltativi restano facoltativi."] },
      { title: "5. A chi comunichiamo i dati", text: ["I dati non vengono diffusi. Possono riceverli, solo per quanto necessario:"], items: [
        "fornitori tecnici nominati responsabili del trattamento (art. 28 GDPR): hosting dell'app e del database (Railway Corporation), pubblicazione del sito (Vercel Inc.), archivio di foto e documenti (" + c.storage + "), servizio di dati del veicolo dalla targa (RegCheck / targa.co.it), immagini illustrative dei modelli (carimage.dev), software di contabilità e fatturazione (DATEV Koinos / SuperBill);",
        "commercialista e consulenti, Agenzia delle Entrate e Sistema di Interscambio per le fatture;",
        "autorità pubbliche, quando la legge lo richiede.",
      ] },
      { title: "6. Trasferimenti fuori dall'Unione europea", text: ["Alcuni fornitori (Railway e Vercel) sono società statunitensi. Il trasferimento avviene sulla base della decisione di adeguatezza UE-USA (EU-U.S. Data Privacy Framework) per i fornitori aderenti o, in mancanza, delle clausole contrattuali tipo approvate dalla Commissione europea (art. 46 GDPR). Puoi chiederne copia scrivendoci."] },
      { title: "7. Per quanto tempo li conserviamo", items: [
        "Fatture e documenti contabili: 10 anni (art. 2220 Codice civile).",
        "Schede cliente, storico del veicolo e preventivi accettati: per la durata del rapporto e fino a 10 anni dall'ultimo intervento, per garanzie e contestazioni.",
        "Preventivi non accettati: 24 mesi.",
        "Account del portale: finché resta attivo; alla chiusura viene cancellato, salvo i documenti da conservare per legge.",
        "Registro degli accessi: 12 mesi, poi viene cancellato automaticamente.",
        "Dati del personale: per la durata del rapporto di lavoro e poi per i termini previsti dalla legge.",
      ] },
      { title: "8. I tuoi diritti", text: [`Puoi chiedere in ogni momento l'accesso ai tuoi dati, la rettifica, la cancellazione, la limitazione, la portabilità e opporti al trattamento basato sul legittimo interesse (artt. 15-22 GDPR), scrivendo a ${c.email}. Rispondiamo entro un mese. Se ritieni che il trattamento violi la legge puoi proporre reclamo al Garante per la protezione dei dati personali (www.garanteprivacy.it, Piazza Venezia 11, 00187 Roma).`] },
      { title: "9. Come proteggiamo i dati", text: ["Connessione cifrata (HTTPS), password salvate solo in forma cifrata (Argon2), accessi divisi per ruolo (ognuno vede solo ciò che gli serve), registro degli accessi e delle modifiche importanti."] },
      { title: "10. Minori", text: ["L'app non è destinata ai minori di 18 anni."] },
      { title: "11. Modifiche", text: ["Pubblichiamo qui ogni aggiornamento con la data. Se cambia qualcosa di importante te lo chiederemo al prossimo accesso."] },
    ],
  },
  cookie: {
    title: "Cookie policy",
    intro: "Questa pagina spiega quali informazioni l'app salva sul tuo dispositivo e perché non ti chiediamo il consenso con un banner.",
    sections: [
      { title: "1. Nessun cookie di profilazione o di terze parti", text: ["L'app NAKAMA CAR non usa cookie di profilazione, pubblicità, statistiche (analytics), social network né altri strumenti di terze parti che ti tracciano."] },
      { title: "2. Strumenti tecnici che usiamo", text: ["L'app salva nella memoria del browser (localStorage) solo queste informazioni, necessarie per farla funzionare:"], items: [
        "nakama_access_token: sessione del personale dell'officina; scade dopo 30 minuti o all'uscita.",
        "nakama_user: nome e permessi dell'utente, per mostrare il menu giusto; si cancella all'uscita.",
        "nakama_portal_token: sessione del portale clienti; scade dopo 12 ore o all'uscita.",
        "nakama-language: lingua scelta (italiano o spagnolo).",
        "nakama-theme: tema chiaro o scuro.",
        "nakama_chat_bubble: posizione del pulsante della chat sullo schermo.",
        "Cache dell'app: copia dei file dell'app per aprirla più velocemente; si svuota con «Aggiorna app».",
      ] },
      { title: "3. Perché non serve il consenso", text: ["Sono strumenti tecnici, strettamente necessari per il servizio che hai chiesto (accesso, lingua, preferenze). Per questi la legge non richiede il consenso, ma solo questa informativa (art. 122, comma 1, Codice privacy e Linee guida del Garante sui cookie del 10 giugno 2021). Per questo l'app non mostra un banner. Se in futuro aggiungessimo strumenti di statistica o marketing, ti chiederemo prima il consenso."] },
      { title: "4. Link esterni", text: ["Alcuni pulsanti aprono servizi di terzi, come WhatsApp o Google Maps, solo se li tocchi. Da quel momento valgono le regole privacy e cookie di quei servizi."] },
      { title: "5. Come cancellarli", text: ["Puoi cancellare questi dati in ogni momento uscendo dall'app o eliminando i dati del sito dalle impostazioni del browser. Dovrai poi accedere di nuovo."] },
      { title: "6. Contatti", text: [`Per domande: ${c.email}. Maggiori dettagli nell'informativa privacy.`] },
    ],
  },
};

const es: Record<LegalDoc, Document> = {
  termini: {
    title: "Términos y condiciones de uso",
    intro: `Estos términos regulan el uso de la app NAKAMA CAR (web, app Android y app para Mac) que ofrece ${c.name}. Al entrar en la app o aceptar un presupuesto online los aceptas. Lee también la política de privacidad, que es un documento aparte. En caso de duda prevalece la versión italiana.`,
    sections: [
      { title: "1. Quiénes somos", text: [`${c.name}, P.IVA ${c.vat}, sede ${c.address}. Email ${c.email}, PEC ${c.pec}.`] },
      { title: "2. Para qué sirve la app", text: ["La app sirve para gestionar los servicios del taller: presupuestos, reparaciones, mantenimiento de vehículos, facturas y comunicación con el taller. La usan el personal del taller, los clientes con acceso al portal (por ejemplo los clientes de flota) y los clientes que reciben un presupuesto por enlace."] },
      { title: "3. Credenciales de acceso", items: [
        "Las credenciales son personales: no las cedas ni las compartas.",
        "Eres responsable de guardarlas. Si crees que alguien las conoce, cambia la contraseña y avisa al taller enseguida.",
        "Por seguridad registramos cada acceso (fecha, hora, dirección IP, app usada y resultado), como explica la política de privacidad.",
        "Podemos suspender un acceso en caso de uso indebido o a petición del cliente titular de la cuenta.",
      ] },
      { title: "4. Uso permitido", items: [
        "Usa la app solo para tu relación con el taller.",
        "Está prohibido intentar acceder a datos de otros, saltarse las protecciones, subir contenidos ilegales, ofensivos o virus, o usar la app de forma que dañe su funcionamiento.",
        "En mensajes y notas no escribas datos innecesarios, en especial datos de salud u otros datos sensibles.",
      ] },
      { title: "5. Presupuestos aceptados online", items: [
        "El presupuesto indica trabajos, recambios, precios e IVA. Aceptarlo con nombre y apellidos y marcando los términos equivale a confirmar el encargo al taller (contrato de obra, art. 2222 y siguientes del Código civil italiano).",
        "El presupuesto vale los días indicados. Los trabajos extra que aparezcan durante la reparación solo se hacen tras una nueva aprobación.",
        "Registramos la respuesta con fecha, hora, dirección IP y navegador como prueba de la aceptación.",
        "Si eres consumidor y aceptas el presupuesto a distancia (desde el enlace, sin firmar en el taller), puedes desistir en 14 días sin dar motivos (arts. 52 y siguientes del Código del Consumo italiano). Si pides empezar los trabajos enseguida, en caso de desistimiento pagas lo ya hecho y pierdes el derecho cuando la reparación está terminada (art. 59, letra a). Para desistir escribe a " + c.email + ".",
      ] },
      { title: "6. Información y documentos", text: ["El estado de los trabajos, los vencimientos de mantenimiento y los kilómetros son orientativos y dependen de los datos disponibles. El documento fiscal válido es la factura electrónica enviada al SdI; el PDF de la app es una copia de cortesía."] },
      { title: "7. Disponibilidad del servicio", text: ["Hacemos lo posible para que la app esté siempre disponible, pero puede interrumpirse por mantenimiento, actualizaciones o problemas de los proveedores técnicos. En ese caso puedes contactar directamente con el taller."] },
      { title: "8. Responsabilidad", text: ["No respondemos de los daños causados por el uso indebido de la app o de las credenciales por parte del usuario, ni de interrupciones ajenas a nosotros. Quedan siempre a salvo los derechos que la ley reconoce al consumidor y la responsabilidad por dolo o culpa grave."] },
      { title: "9. Propiedad intelectual", text: ["La app, la marca NAKAMA CAR, el diseño y los textos pertenecen a sus titulares. No se pueden copiar ni reutilizar sin autorización."] },
      { title: "10. Privacidad y cookies", text: ["El tratamiento de datos personales se describe en la política de privacidad; lo que se guarda en el dispositivo, en la política de cookies."] },
      { title: "11. Cambios", text: ["Podemos actualizar estos términos. Si los cambios son importantes, te pediremos aceptarlos de nuevo en el próximo acceso."] },
      { title: "12. Ley aplicable y tribunal", text: [`Se aplica la ley italiana. Para los consumidores es competente el juez del lugar de residencia o domicilio del consumidor (art. 66-bis Código del Consumo). Para los demás usuarios es competente en exclusiva el tribunal de ${c.court}.`] },
    ],
  },
  privacy: {
    title: "Política de privacidad",
    intro: "Según los arts. 13 y 14 del Reglamento (UE) 2016/679 (RGPD) y el D.Lgs. 196/2003 (Código de privacidad italiano), te explicamos qué datos tratamos con la app NAKAMA CAR, por qué, durante cuánto tiempo y cuáles son tus derechos. En caso de duda prevalece la versión italiana.",
    sections: [
      { title: "1. Responsable del tratamiento", text: [`${c.name}, P.IVA ${c.vat}, sede ${c.address}. Contacto de privacidad: ${c.email}, PEC ${c.pec}. No se ha nombrado un Delegado de protección de datos (DPO) porque para nuestra actividad no es obligatorio.`] },
      { title: "2. Qué datos tratamos", items: [
        "Clientes: nombre y apellidos o razón social, código fiscal o P.IVA, dirección, teléfono, email, PEC y código SDI (solo los necesarios para los trabajos y la factura).",
        "Vehículos: matrícula, bastidor (VIN), marca, modelo, kilómetros, fotos del vehículo y de los daños, trabajos, presupuestos, facturas y vencimientos de mantenimiento.",
        "Aceptación de presupuestos online: nombre indicado como firma, notas, fecha, hora, dirección IP y navegador.",
        "Clientes con acceso al portal: nombre del responsable, email, contraseña (guardada solo cifrada) y mensajes con el taller.",
        "Datos de los sistemas a bordo (solo clientes de flota que conectan la telemática): kilómetros, averías y última posición del vehículo. El cliente de flota debe informar a sus conductores.",
        "Personal del taller: nombre, email, teléfono, contacto de emergencia, rol, competencias y trabajos asignados.",
        "Registro de accesos: cuenta, fecha y hora, resultado, dirección IP, navegador y tipo de app (web, Android, Mac).",
      ] },
      { title: "3. Para qué y con qué base legal", items: [
        "Preparar presupuestos, hacer reparaciones y mantenimientos, gestionar el portal y comunicarnos contigo: ejecución del contrato o de medidas precontractuales (art. 6.1.b RGPD).",
        "Factura electrónica, contabilidad y obligaciones fiscales: obligación legal (art. 6.1.c RGPD).",
        "Seguridad de la app, registro de accesos, prevención de abusos y defensa de nuestros derechos: interés legítimo (art. 6.1.f RGPD).",
        "Personal: gestión de la relación laboral (art. 6.1.b y art. 88 RGPD, art. 113 Código de privacidad). El registro de accesos sirve solo para la seguridad, no para controlar la actividad de los trabajadores (art. 4 Ley 300/1970).",
        "No usamos los datos para publicidad, no hacemos perfiles ni tomamos decisiones automatizadas.",
      ] },
      { title: "4. ¿Es obligatorio darnos los datos?", text: ["Los datos que pedimos son los necesarios para los trabajos y la factura: sin ellos no podemos prestar el servicio. Los campos opcionales siguen siendo opcionales."] },
      { title: "5. A quién comunicamos los datos", text: ["Los datos no se publican. Pueden recibirlos, solo en lo necesario:"], items: [
        "proveedores técnicos nombrados encargados del tratamiento (art. 28 RGPD): alojamiento de la app y la base de datos (Railway Corporation), publicación de la web (Vercel Inc.), archivo de fotos y documentos (" + c.storage + "), datos del vehículo a partir de la matrícula (RegCheck / targa.co.it), imágenes ilustrativas de modelos (carimage.dev), software de contabilidad y facturación (DATEV Koinos / SuperBill);",
        "gestor y asesores, Agenzia delle Entrate y Sistema di Interscambio para las facturas;",
        "autoridades públicas, cuando la ley lo exige.",
      ] },
      { title: "6. Transferencias fuera de la Unión Europea", text: ["Algunos proveedores (Railway y Vercel) son empresas de EE. UU. La transferencia se basa en la decisión de adecuación UE-EE. UU. (EU-U.S. Data Privacy Framework) para los proveedores adheridos o, si no, en las cláusulas contractuales tipo de la Comisión Europea (art. 46 RGPD). Puedes pedirnos una copia."] },
      { title: "7. Cuánto tiempo los guardamos", items: [
        "Facturas y documentos contables: 10 años (art. 2220 Código civil italiano).",
        "Fichas de cliente, historial del vehículo y presupuestos aceptados: mientras dure la relación y hasta 10 años desde el último trabajo, por garantías y reclamaciones.",
        "Presupuestos no aceptados: 24 meses.",
        "Cuenta del portal: mientras esté activa; al cerrarla se borra, salvo los documentos que la ley obliga a conservar.",
        "Registro de accesos: 12 meses, después se borra automáticamente.",
        "Datos del personal: mientras dure la relación laboral y después durante los plazos legales.",
      ] },
      { title: "8. Tus derechos", text: [`Puedes pedir en cualquier momento acceso a tus datos, rectificación, supresión, limitación, portabilidad y oponerte al tratamiento basado en el interés legítimo (arts. 15-22 RGPD), escribiendo a ${c.email}. Respondemos en un mes. Si crees que el tratamiento infringe la ley puedes reclamar ante el Garante per la protezione dei dati personali (www.garanteprivacy.it, Piazza Venezia 11, 00187 Roma).`] },
      { title: "9. Cómo protegemos los datos", text: ["Conexión cifrada (HTTPS), contraseñas guardadas solo cifradas (Argon2), accesos por rol (cada uno ve solo lo que necesita), registro de accesos y de los cambios importantes."] },
      { title: "10. Menores", text: ["La app no está dirigida a menores de 18 años."] },
      { title: "11. Cambios", text: ["Publicamos aquí cada actualización con la fecha. Si cambia algo importante te lo pediremos en el próximo acceso."] },
    ],
  },
  cookie: {
    title: "Política de cookies",
    intro: "Esta página explica qué información guarda la app en tu dispositivo y por qué no te pedimos el consentimiento con un banner. En caso de duda prevalece la versión italiana.",
    sections: [
      { title: "1. Ninguna cookie de perfil ni de terceros", text: ["La app NAKAMA CAR no usa cookies de perfil, publicidad, estadísticas (analytics), redes sociales ni otras herramientas de terceros que te rastreen."] },
      { title: "2. Herramientas técnicas que usamos", text: ["La app guarda en la memoria del navegador (localStorage) solo esta información, necesaria para que funcione:"], items: [
        "nakama_access_token: sesión del personal del taller; caduca a los 30 minutos o al salir.",
        "nakama_user: nombre y permisos del usuario, para mostrar el menú correcto; se borra al salir.",
        "nakama_portal_token: sesión del portal de clientes; caduca a las 12 horas o al salir.",
        "nakama-language: idioma elegido (italiano o español).",
        "nakama-theme: tema claro u oscuro.",
        "nakama_chat_bubble: posición del botón del chat en la pantalla.",
        "Caché de la app: copia de los archivos de la app para abrirla más rápido; se vacía con «Aggiorna app».",
      ] },
      { title: "3. Por qué no hace falta el consentimiento", text: ["Son herramientas técnicas, estrictamente necesarias para el servicio que pides (acceso, idioma, preferencias). Para ellas la ley no exige consentimiento, solo esta información (art. 122, apartado 1, Código de privacidad y Directrices del Garante sobre cookies del 10 de junio de 2021). Por eso la app no muestra un banner. Si en el futuro añadimos herramientas de estadística o marketing, te pediremos antes el consentimiento."] },
      { title: "4. Enlaces externos", text: ["Algunos botones abren servicios de terceros, como WhatsApp o Google Maps, solo si los tocas. Desde ese momento se aplican las reglas de privacidad y cookies de esos servicios."] },
      { title: "5. Cómo borrarlos", text: ["Puedes borrar estos datos cuando quieras saliendo de la app o eliminando los datos del sitio en los ajustes del navegador. Después tendrás que volver a entrar."] },
      { title: "6. Contacto", text: [`Para preguntas: ${c.email}. Más detalles en la política de privacidad.`] },
    ],
  },
};

export function legalDocument(doc: LegalDoc, language: Language): Document {
  return (language === "es" ? es : it)[doc];
}
