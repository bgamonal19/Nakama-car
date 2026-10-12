/**
 * NAKAMA CAR · app nativa para Mac.
 * Una ventana propia (icono en el Dock, ⌘Tab, menú de macOS) que abre
 * NAKAMA CAR ESTIMATE. Las novedades llegan solas: la app carga siempre la
 * versión publicada, igual que la web, sin descargar otra versión.
 */
const { app, BrowserWindow, Menu, dialog, screen, session, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs");

const APP_URL = process.env.NAKAMA_URL || "https://nakama-car-web-production.up.railway.app";
const ORIGIN = new URL(APP_URL).origin;
const ALLOWED_PERMISSIONS = new Set(["media", "notifications", "clipboard-sanitized-write", "fullscreen"]);

let win = null;
const stateFile = () => path.join(app.getPath("userData"), "window.json");

function readState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile(), "utf8"));
  } catch {
    return {};
  }
}

function saveState() {
  if (!win || win.isDestroyed()) return;
  try {
    fs.writeFileSync(stateFile(), JSON.stringify({ ...win.getNormalBounds(), maximized: win.isMaximized() }));
  } catch {
    /* sin permisos: no pasa nada */
  }
}

/** La ventana guardada, si todavía cabe en alguna pantalla. */
function startBounds() {
  const saved = readState();
  const area = screen.getPrimaryDisplay().workArea;
  const fallback = {
    width: Math.min(1360, area.width),
    height: Math.min(900, area.height),
  };
  if (!saved.width || !saved.height) return { bounds: fallback, maximized: false };
  const visible = screen.getAllDisplays().some(({ workArea: w }) =>
    saved.x >= w.x - 40 && saved.y >= w.y - 40 && saved.x < w.x + w.width - 80 && saved.y < w.y + w.height - 80);
  return { bounds: visible ? saved : { width: saved.width, height: saved.height }, maximized: Boolean(saved.maximized) };
}

const isOwn = (url) => {
  try {
    return new URL(url).origin === ORIGIN;
  } catch {
    return false;
  }
};

function openOutside(url) {
  if (/^(https?|mailto|tel):/i.test(url)) shell.openExternal(url);
}

function showOffline() {
  if (win && !win.isDestroyed()) win.loadFile(path.join(__dirname, "offline.html"));
}

function createWindow() {
  const { bounds, maximized } = startBounds();
  win = new BrowserWindow({
    ...bounds,
    minWidth: 380,
    minHeight: 560,
    title: "NAKAMA CAR",
    backgroundColor: "#0b2a4a",
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });
  if (maximized) win.maximize();
  win.once("ready-to-show", () => win.show());
  ["resize", "move", "close"].forEach((event) => win.on(event, saveState));
  win.on("closed", () => { win = null; });

  const contents = win.webContents;
  // Solo NAKAMA dentro de la app; el resto se abre en el navegador del Mac.
  contents.on("will-navigate", (event, url) => {
    if (url.startsWith("nakama://retry")) {
      event.preventDefault();
      win.loadURL(APP_URL);
      return;
    }
    if (!isOwn(url) && !url.startsWith("file://")) {
      event.preventDefault();
      openOutside(url);
    }
  });
  contents.setWindowOpenHandler(({ url }) => {
    // PDF de facturas y presupuestos, vistas del cliente: ventana propia.
    if (isOwn(url) || url.startsWith("blob:")) {
      return { action: "allow", overrideBrowserWindowOptions: { width: 1000, height: 800, autoHideMenuBar: true } };
    }
    openOutside(url);
    return { action: "deny" };
  });
  contents.on("did-fail-load", (_event, code, _description, url, isMainFrame) => {
    // -3 = cargada de nuevo antes de terminar: no es un error.
    if (isMainFrame && code !== -3 && isOwn(url)) showOffline();
  });

  win.loadURL(APP_URL);
}

function buildMenu() {
  const template = [
    { role: "appMenu" },
    {
      label: "Archivo",
      submenu: [
        { label: "Nueva ventana", accelerator: "CmdOrCtrl+N", click: () => createWindow() },
        { type: "separator" },
        { role: "close", label: "Cerrar ventana" },
      ],
    },
    { role: "editMenu", label: "Edición" },
    {
      label: "Ver",
      submenu: [
        { label: "Inicio", accelerator: "CmdOrCtrl+Shift+H", click: () => win?.loadURL(APP_URL) },
        { label: "Atrás", accelerator: "CmdOrCtrl+[", click: () => win?.webContents.navigationHistory.goBack() },
        { label: "Adelante", accelerator: "CmdOrCtrl+]", click: () => win?.webContents.navigationHistory.goForward() },
        { type: "separator" },
        { role: "reload", label: "Recargar" },
        { role: "forceReload", label: "Recargar sin caché" },
        { type: "separator" },
        { role: "resetZoom", label: "Tamaño real" },
        { role: "zoomIn", label: "Ampliar" },
        { role: "zoomOut", label: "Reducir" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Pantalla completa" },
      ],
    },
    { role: "windowMenu", label: "Ventana" },
    {
      label: "Ayuda",
      role: "help",
      submenu: [
        { label: "Abrir NAKAMA CAR en el navegador", click: () => shell.openExternal(APP_URL) },
        {
          label: "Acerca de NAKAMA CAR",
          click: () => dialog.showMessageBox({
            type: "info",
            title: "NAKAMA CAR",
            message: `NAKAMA CAR ${app.getVersion()}`,
            detail: "La app abre siempre la última versión de NAKAMA CAR ESTIMATE.",
          }),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!win) return createWindow();
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    // Cámara (fotos de daños), avisos y copiar al portapapeles, solo para NAKAMA.
    session.defaultSession.setPermissionRequestHandler((contents, permission, callback) => {
      callback(ALLOWED_PERMISSIONS.has(permission) && isOwn(contents.getURL()));
    });
    session.defaultSession.setPermissionCheckHandler((contents, permission) =>
      ALLOWED_PERMISSIONS.has(permission) && Boolean(contents) && isOwn(contents.getURL()));
    buildMenu();
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
