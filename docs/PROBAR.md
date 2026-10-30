# Probar un PR antes de hacer el merge

Hay dos formas. Las dos usan **una base de datos de prueba, vacía y separada**: nunca tocan los clientes,
vehículos ni facturas reales. Al arrancar, la copia de prueba se rellena sola con un taller de ejemplo:

- Usuario: `prova@example.com`
- Contraseña: `ProvaNakama2026!`
- Datos de ejemplo: 2 clientes (Trasporti Prova Srl y Mario Rossi) y 3 vehículos (GA123BC, FT456DE, EZ789FG).

Puedes crear, cambiar y borrar lo que quieras: es todo de mentira.

**Protección:** si por un error de configuración una copia de prueba se conectara a la base de datos real,
la app se niega a arrancar (y no cambia nada). La web de prueba tampoco se deja construir si apunta a la API real.

---

## Opción 1: enlace de prueba en Railway para cada PR

Cada PR crea su propia copia de la app (web + API + base de datos) con un enlace temporal.
Al hacer el merge o cerrar el PR, Railway la borra sola.

### Configurarlo (una sola vez)

1. Entra en <https://railway.com/dashboard> y abre el proyecto **extraordinary-adaptation**
   (el que tiene `Nakama-car-web`, `Nakama-car` y `Postgres`).
2. Arriba a la derecha, pulsa **Settings** (del proyecto) → pestaña **Environments**.
3. Pulsa **Enable PR Environments**.
4. En la misma pantalla, activa también **Enable Bot PR Environments**
   (los PR que prepara Claude cuentan como «bot»; sin esto, puede que no se cree la copia).
5. Comprueba que la API usa la base de datos de su propio entorno:
   - Pulsa el servicio **Nakama-car** → pestaña **Variables** → busca `DATABASE_URL`.
   - Pulsa los tres puntos ⋮ → **Edit**. Si el valor es `${{Postgres.DATABASE_URL}}`, está bien: no toques nada.
   - Si en cambio es un texto largo que empieza por `postgresql://…`, cámbialo por
     `${{Postgres.DATABASE_URL}}` y pulsa **Deploy** arriba. La app real sigue igual (es la misma base de datos),
     pero así cada copia de prueba usa la suya.
6. Haz lo mismo con la web:
   - Servicio **Nakama-car-web** → **Variables** → `NEXT_PUBLIC_API_URL`.
   - Debe ser `https://${{Nakama-car.RAILWAY_PUBLIC_DOMAIN}}/api/v1`. Si es
     `https://nakama-car-production.up.railway.app/api/v1`, cámbialo por lo de antes y pulsa **Deploy**.
     (La web real sigue llamando a la misma API; las copias de prueba llaman a la suya.)

### Usarlo con cada PR

1. Abre el PR en GitHub. Al cabo de unos minutos, el bot de **Railway** escribe un comentario con los enlaces.
2. Pulsa el enlace de **Nakama-car-web** (termina en `…-pr-<número>.up.railway.app`).
3. Entra con `prova@example.com` / `ProvaNakama2026!` y prueba los cambios.
4. Si todo está bien, haz el merge. La copia de prueba se borra sola.

> Si el enlace no aparece: en Railway, arriba a la izquierda, despliega el selector de entorno
> (pone «production») y elige el que termina en `pr-<número>`. Ahí ves las copias y sus enlaces.

**Ojo con los servicios de pago:** la copia de prueba usa las mismas claves que la app real para buscar matrículas
(targa.co.it) y para las fotos de los coches (carimage.dev). Cada matrícula o foto nueva que pruebes gasta un crédito.

---

## Opción 2: probarlo en tu Mac

### Preparar el Mac (una sola vez)

1. Instala **Docker Desktop**: <https://www.docker.com/products/docker-desktop/> → *Download for Mac*
   (elige *Apple Silicon* si tu Mac tiene chip M1/M2/M3/M4, si no *Intel*). Ábrelo y espera a que diga *running*.
2. Abre la app **Terminal** (Cmd + espacio, escribe «Terminal», Enter).
3. Copia y pega esto y pulsa Enter (si el Mac te pide instalar las «herramientas de línea de comandos», acepta):

   ```bash
   cd ~ && git clone https://github.com/bgamonal19/Nakama-car.git
   ```

   Si te pide usuario y contraseña de GitHub: el usuario es `bgamonal19` y la «contraseña» es un *token*
   que se crea en <https://github.com/settings/tokens> (o instala GitHub Desktop y clona el repositorio desde ahí,
   en la carpeta de inicio).

### Probar un PR

En Terminal, con el número del PR (por ejemplo, el 110):

```bash
cd ~/nakama-car && ./scripts/probar-pr.sh 110
```

La primera vez tarda unos minutos (descarga lo necesario). Cuando termina, se abre el navegador en
<http://localhost:3000/login>. Entra con `prova@example.com` / `ProvaNakama2026!`.

Sin número (`./scripts/probar-pr.sh`) arranca la versión actual (main).

### Pararlo

```bash
cd ~/nakama-car && ./scripts/parar-prueba.sh
```

Para la copia, borra sus datos de prueba y deja la carpeta otra vez en la versión actual.
Cada vez que pruebas un PR empiezas con los datos de ejemplo limpios.

### Si algo falla

- «Falta Docker Desktop» o «Docker Desktop está cerrado»: ábrelo y espera a que diga *running*.
- «Hay archivos cambiados en esta carpeta»: no has cambiado nada a propósito, así que pídele a Claude que lo revise.
- «No ha arrancado en 6 minutos»: copia las últimas líneas que salen en Terminal y pásaselas a Claude.
