const ext = (typeof browser !== "undefined") ? browser : chrome;

const ROOT_MENU_ID = "save-image-to-root";
const SETTINGS_MENU_ID = "save-image-to-settings";

let lastImageInfo = {
  srcUrl: "",
  pageUrl: "",
  width: 0,
  height: 0
};

function isThenable(x) {
  return x && typeof x.then === "function";
}

function storageGet(defaults) {
  try {
    const maybe = ext.storage.local.get(defaults);
    if (isThenable(maybe)) return maybe;
  } catch {}
  return new Promise((resolve) => ext.storage.local.get(defaults, resolve));
}

async function getSettings() {
  const DEFAULT_SETTINGS = {
    folders: [
      {
        id: "saved_images",
        label: "Default",
        path: "saved_images",
        namingOverrideEnabled: false,
        namingOverride: null
      }
    ],
    naming: {
      separator: "_",
      dateFormat: "DD-MM-YY",
      timeFormat: "HH-mm-SS",
      parts: [
        { key: "site", enabled: true },
        { key: "date", enabled: true },
        { key: "original", enabled: true },
        { key: "time", enabled: false },
        { key: "dims", enabled: false }
      ]
    }
  };

  const got = await storageGet(DEFAULT_SETTINGS);
  return got;
}

function sanitizeFilenamePart(s) {
  return (s || "")
    .replace(/[\/\\?%*:|"<>]/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

function getDomainFromUrl(url) {
  try {
    const u = new URL(url);
    const host = u.hostname || "";
    return host.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function formatDate(date, fmt) {
  const yyyy = String(date.getFullYear());
  const yy = yyyy.slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");

  const MONTHS_SHORT_EN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const MONTHS_LONG_EN  = ["January","February","March","April","May","June","July","August","September","October","November","December"];
  const monthIndex = date.getMonth();

  switch (fmt) {
    case "DD-MM-YY": return `${dd}-${mm}-${yy}`;
    case "DD-MMM-YY": return `${dd}-${MONTHS_SHORT_EN[monthIndex]}-${yy}`;
    case "DD-MMMM-YY": return `${dd}-${MONTHS_LONG_EN[monthIndex]}-${yy}`;
    case "YYYY-MM-DD": return `${yyyy}-${mm}-${dd}`;
    case "YYMMDD": return `${yy}${mm}${dd}`;
    default: return `${dd}-${mm}-${yy}`;
  }
}

function formatTime(date, fmt) {
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");

  switch (fmt) {
    case "HH-mm-SS": return `${hh}-${mi}-${ss}`;
    case "HHMMSS": return `${hh}${mi}${ss}`;
    default: return `${hh}-${mi}-${ss}`;
  }
}

function extractOriginalName(url) {
  try {
    const u = new URL(url);
    const pathname = u.pathname || "";
    const base = pathname.split("/").filter(Boolean).pop() || "image";
    const noQuery = base.split("?")[0];
    const clean = noQuery.replace(/\.(jpg|jpeg|png|gif|webp|bmp|avif)$/i, "");
    return sanitizeFilenamePart(clean || "image");
  } catch {
    return "image";
  }
}

function getExtensionFromUrl(url) {
  try {
    const u = new URL(url);
    const pathname = u.pathname || "";
    const base = pathname.split("/").filter(Boolean).pop() || "";
    const m = /\.([a-zA-Z0-9]+)$/.exec(base);
    if (m) return m[1].toLowerCase();
  } catch {}
  return "jpg";
}

function buildFilename(naming, pageUrl, srcUrl, dims) {
  const now = new Date();
  const sep = naming.separator || "_";

  const site = sanitizeFilenamePart(getDomainFromUrl(pageUrl) || getDomainFromUrl(srcUrl) || "site");
  const date = formatDate(now, naming.dateFormat);
  const time = formatTime(now, naming.timeFormat);
  const original = extractOriginalName(srcUrl);
  const size = dims && dims.width && dims.height ? `${dims.width}x${dims.height}` : "";

  const values = { site, date, time, original, dims: size };

  const parts = (naming.parts || [])
    .filter(p => p && p.enabled)
    .map(p => values[p.key] || "")
    .filter(Boolean);

  const extn = getExtensionFromUrl(srcUrl);
  return `${parts.join(sep)}.${extn}`;
}

async function rebuildContextMenu() {
  try { ext.contextMenus.removeAll(); } catch {}

  ext.contextMenus.create({
    id: ROOT_MENU_ID,
    title: "Save image to...",
    contexts: ["image"]
  });

  const settings = await getSettings();
  const folders = Array.isArray(settings.folders) ? settings.folders : [];

  for (const f of folders) {
    if (!f || !f.id || !f.label || !f.path) continue;

    ext.contextMenus.create({
      id: `folder:${f.id}`,
      parentId: ROOT_MENU_ID,
      title: f.label,
      contexts: ["image"]
    });
  }

  ext.contextMenus.create({
    id: SETTINGS_MENU_ID,
    parentId: ROOT_MENU_ID,
    title: "Settings...",
    contexts: ["image"]
  });
}

async function downloadToFolder(folderId, info) {
  const settings = await getSettings();
  const folders = Array.isArray(settings.folders) ? settings.folders : [];
  const folder = folders.find(x => x.id === folderId);
  if (!folder) return;

  const naming = (folder.namingOverrideEnabled && folder.namingOverride)
    ? folder.namingOverride
    : settings.naming;

  const filename = buildFilename(naming, info.pageUrl, info.srcUrl, { width: info.width, height: info.height });

  const fullPath = folder.path.replace(/\/+$/, "") + "/" + filename;

  await ext.downloads.download({
    url: info.srcUrl,
    filename: fullPath,
    conflictAction: "uniquify",
    saveAs: false
  });
}

ext.runtime.onMessage.addListener((msg) => {
  if (!msg) return;

  if (msg.type === "LAST_IMAGE") {
    lastImageInfo = {
      srcUrl: msg.srcUrl || "",
      pageUrl: msg.pageUrl || "",
      width: Number(msg.width || 0),
      height: Number(msg.height || 0)
    };
  }
});

ext.contextMenus.onClicked.addListener(async (info) => {
  try {
    if (!info || !info.menuItemId) return;

    if (info.menuItemId === SETTINGS_MENU_ID) {
      ext.runtime.openOptionsPage();
      return;
    }

    if (typeof info.menuItemId === "string" && info.menuItemId.startsWith("folder:")) {
      const folderId = info.menuItemId.split(":")[1];

      const srcUrl = (info.srcUrl && info.srcUrl.startsWith("http")) ? info.srcUrl : lastImageInfo.srcUrl;
      const pageUrl = lastImageInfo.pageUrl || info.pageUrl || "";
      const width = lastImageInfo.width || 0;
      const height = lastImageInfo.height || 0;

      if (!srcUrl) return;

      await downloadToFolder(folderId, { srcUrl, pageUrl, width, height });
    }
  } catch (e) {
    console.error("[Save image to...] onClicked error:", e);
  }
});

ext.runtime.onInstalled.addListener(rebuildContextMenu);
ext.runtime.onStartup.addListener(rebuildContextMenu);
ext.storage.onChanged.addListener(rebuildContextMenu);

rebuildContextMenu().catch(console.error);

