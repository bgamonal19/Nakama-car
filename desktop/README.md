# NAKAMA CAR para Mac

App nativa (icono en el Dock, ⌘Tab, menú de macOS, ventana propia) que abre NAKAMA CAR ESTIMATE.
Las novedades llegan solas: la app carga siempre la versión publicada.

## Instalar

1. Descarga **NAKAMA-CAR-mac.dmg**: https://github.com/bgamonal19/Nakama-car/releases/latest/download/NAKAMA-CAR-mac.dmg
2. Ábrelo y arrastra **NAKAMA CAR** a **Aplicaciones**.
3. La primera vez: en Aplicaciones, **clic derecho → Abrir → Abrir** (la app no está firmada por Apple).
   Si macOS dice que «está dañada», abre Terminal y ejecuta:
   `xattr -cr "/Applications/NAKAMA CAR.app"`

## Desarrollo

```bash
cd desktop
npm install
npm start                               # usa la web de producción
NAKAMA_URL=http://localhost:3000 npm start
npm run dist                            # crea el .dmg en desktop/dist (solo en un Mac)
```

El .dmg lo construye GitHub Actions (**App para Mac**) en un Mac y lo publica en Releases al unir en main.
