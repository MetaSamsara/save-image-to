const ext = (typeof browser !== "undefined") ? browser : chrome;

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
      { key: "dims", enabled: false } // Size (WxH)
    ]
  }
};

const PART_META = {
  date: { label: "Date" },
  time: { label: "Time" },
  site: { label: "Site domain" },
  original: { label: "Original name" },
  dims: { label: "Size" }
};

const MONTHS_SHORT_EN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTHS_LONG_EN  = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const DATE_FORMAT_OPTIONS = [
  { value: "DD-MM-YY", label: "DD-MM-YY" },
  { value: "DD-MMM-YY", label: "DD-MMM-YY" },
  { value: "DD-MMMM-YY", label: "DD-MMMM-YY" },
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD" },
  { value: "YYMMDD", label: "YYMMDD" }
];

const TIME_FORMAT_OPTIONS = [
  { value: "HH-mm-SS", label: "HH-mm-SS" },
  { value: "HHMMSS", label: "HHMMSS" }
];

let draftSettings = null;
let dirty = false;

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

function storageSet(obj) {
  try {
    const maybe = ext.storage.local.set(obj);
    if (isThenable(maybe)) return maybe;
  } catch {}
  return new Promise((resolve) => ext.storage.local.set(obj, resolve));
}

function deepClone(x) {
  return JSON.parse(JSON.stringify(x));
}

function makeId() {
  return Math.random().toString(16).slice(2) + Date.now().toString(16);
}

function sanitizeRelativePath(p) {
  return (p || "")
    .replace(/\\/g, "/")
    .replace(/^\//, "")
    .replace(/\.\./g, "_")
    .replace(/\/+/g, "/")
    .trim()
    .replace(/\/$/, "");
}

function setDirty(nextDirty) {
  dirty = !!nextDirty;

  const saveBtn = document.getElementById("saveBtn");
  const dirtyText = document.getElementById("dirtyText");
  const dirtyDot = document.getElementById("dirtyDot");

  if (saveBtn) saveBtn.disabled = !dirty;

  if (dirtyText && dirtyDot) {
    if (dirty) {
      dirtyText.textContent = "Unsaved changes";
      dirtyDot.className = "dirtyDot";
    } else {
      dirtyText.textContent = "All changes saved";
      dirtyDot.className = "savedDot";
    }
  }
}

/** ---- Tabs logic ---- **/
function initTabs() {
  const tabSettings = document.getElementById("tab-settings");
  const tabAbout = document.getElementById("tab-about");
  const panelSettings = document.getElementById("panel-settings");
  const panelAbout = document.getElementById("panel-about");

  if (!tabSettings || !tabAbout || !panelSettings || !panelAbout) return;

  function setTab(which) {
    const isSettings = which === "settings";

    tabSettings.setAttribute("aria-selected", String(isSettings));
    tabAbout.setAttribute("aria-selected", String(!isSettings));

    panelSettings.classList.toggle("active", isSettings);
    panelAbout.classList.toggle("active", !isSettings);
  }

  tabSettings.addEventListener("click", () => setTab("settings"));
  tabAbout.addEventListener("click", () => setTab("about"));

  setTab("settings");
}

function formatDatePreview(naming) {
  const yyyy = "2024";
  const yy = "24";
  const mmIndex = 9;
  const mm = "10";
  const dd = "30";

  switch (naming.dateFormat) {
    case "DD-MM-YY":
      return `${dd}-${mm}-${yy}`;
    case "DD-MMM-YY":
      return `${dd}-${MONTHS_SHORT_EN[mmIndex]}-${yy}`;
    case "DD-MMMM-YY":
      return `${dd}-${MONTHS_LONG_EN[mmIndex]}-${yy}`;
    case "YYYY-MM-DD":
      return `${yyyy}-${mm}-${dd}`;
    case "YYMMDD":
      return `${yy}${mm}${dd}`;
    default:
      return `${dd}-${mm}-${yy}`;
  }
}

function formatTimePreview(naming) {
  const hh = "18";
  const mi = "45";
  const ss = "12";

  switch (naming.timeFormat) {
    case "HH-mm-SS":
      return `${hh}-${mi}-${ss}`;
    case "HHMMSS":
      return `${hh}${mi}${ss}`;
    default:
      return `${hh}-${mi}-${ss}`;
  }
}

function normalizeNaming(n) {
  const naming = { ...(DEFAULT_SETTINGS.naming), ...(n || {}) };
  naming.parts = Array.isArray(naming.parts) ? naming.parts : DEFAULT_SETTINGS.naming.parts.slice();

  const keys = new Set(naming.parts.map(p => p.key));
  for (const k of ["date", "time", "site", "original", "dims"]) {
    if (!keys.has(k)) naming.parts.push({ key: k, enabled: false });
  }

  naming.separator = typeof naming.separator === "string" ? naming.separator : "_";

  const allowedDates = DATE_FORMAT_OPTIONS.map(o => o.value);
  if (!allowedDates.includes(naming.dateFormat)) naming.dateFormat = DEFAULT_SETTINGS.naming.dateFormat;

  const allowedTimes = TIME_FORMAT_OPTIONS.map(o => o.value);
  if (!allowedTimes.includes(naming.timeFormat)) naming.timeFormat = DEFAULT_SETTINGS.naming.timeFormat;

  naming.parts = naming.parts.map(p => ({ key: p.key, enabled: !!p.enabled }));
  return naming;
}

function normalizeFolders(folders) {
  const arr = Array.isArray(folders) ? folders : DEFAULT_SETTINGS.folders.slice();

  return arr.map((f) => {
    const folder = { ...f };

    if (!folder.id) folder.id = makeId();
    if (!folder.label) folder.label = "Default";
    if (!folder.path) folder.path = "saved_images";

    folder.path = sanitizeRelativePath(folder.path);

    if (typeof folder.namingOverrideEnabled !== "boolean") folder.namingOverrideEnabled = false;

    if (folder.namingOverrideEnabled) {
      folder.namingOverride = normalizeNaming(folder.namingOverride || DEFAULT_SETTINGS.naming);
    } else {
      folder.namingOverride = folder.namingOverride ? normalizeNaming(folder.namingOverride) : null;
    }

    return folder;
  });
}

/**
 * ✅ Robust load strategy:
 * - Load explicit keys (folders/naming) so we never mis-detect storage as empty.
 * - Only write defaults if BOTH are missing.
 */
async function loadSettingsOnce() {
  const cur = await storageGet({ folders: null, naming: null });

  const hasFolders = Array.isArray(cur.folders);
  const hasNaming = cur.naming && typeof cur.naming === "object";

  if (!hasFolders && !hasNaming) {
    const initial = deepClone(DEFAULT_SETTINGS);
    await storageSet(initial);
    return initial;
  }

  const merged = {
    ...deepClone(DEFAULT_SETTINGS),
    ...cur
  };

  merged.folders = normalizeFolders(merged.folders);
  merged.naming = normalizeNaming(merged.naming);

  return merged;
}

async function saveDraftToStorage() {
  if (!draftSettings) return;

  const s = deepClone(draftSettings);
  s.folders = normalizeFolders(s.folders);
  s.naming = normalizeNaming(s.naming);

  await storageSet(s);
  draftSettings = s;
  setDirty(false);
}

function renderPreview(naming, previewEl) {
  const sep = naming.separator || "_";

  const date = formatDatePreview(naming);
  const time = formatTimePreview(naming);
  const site = "tumblr";
  const original = "img34243543";
  const dims = "2048x1536";

  const values = { date, time, site, original, dims };

  const parts = naming.parts
    .filter(p => p.enabled)
    .map(p => p.key)
    .map(k => values[k] || "")
    .filter(Boolean);

  const target = previewEl || document.getElementById("previewBox");
  if (!target) return;
  target.textContent = (parts.join(sep) + ".jpg");
}

function fillSelect(select, options) {
  if (!select) return;
  select.textContent = "";
  for (const opt of options) {
    const o = document.createElement("option");
    o.value = opt.value;
    o.textContent = opt.label;
    select.appendChild(o);
  }
}

function makePartRow(part, index, parts, onChange) {
  const li = document.createElement("li");
  li.className = "part";
  li.draggable = true;
  li.dataset.index = String(index);

  const handle = document.createElement("div");
  handle.className = "handle";
  handle.textContent = "≡";
  handle.title = "Drag to reorder";

  const main = document.createElement("div");
  main.className = "partMain";

  const enable = document.createElement("input");
  enable.type = "checkbox";
  enable.checked = !!part.enabled;

  const meta = PART_META[part.key] || { label: part.key };
  const label = document.createElement("strong");
  label.textContent = meta.label;

  main.appendChild(enable);
  main.appendChild(label);

  const actions = document.createElement("div");
  actions.className = "partActions";

  const up = document.createElement("button");
  up.type = "button";
  up.className = "smallBtn";
  up.textContent = "↑";
  up.title = "Move up";

  const down = document.createElement("button");
  down.type = "button";
  down.className = "smallBtn";
  down.textContent = "↓";
  down.title = "Move down";

  up.disabled = index === 0;
  down.disabled = index === parts.length - 1;

  actions.appendChild(up);
  actions.appendChild(down);

  li.appendChild(handle);
  li.appendChild(main);
  li.appendChild(actions);

  enable.addEventListener("change", () => {
    onChange({ type: "toggle", index, enabled: enable.checked });
  });

  up.addEventListener("click", () => onChange({ type: "move", from: index, to: index - 1 }));
  down.addEventListener("click", () => onChange({ type: "move", from: index, to: index + 1 }));

  li.addEventListener("dragstart", (e) => {
    li.classList.add("dragging");
    e.dataTransfer.setData("text/plain", String(index));
    e.dataTransfer.effectAllowed = "move";
  });

  li.addEventListener("dragend", () => {
    li.classList.remove("dragging");
  });

  li.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  });

  li.addEventListener("drop", (e) => {
    e.preventDefault();
    const from = Number(e.dataTransfer.getData("text/plain"));
    const to = index;
    if (Number.isFinite(from) && Number.isFinite(to) && from !== to) {
      onChange({ type: "move", from, to });
    }
  });

  return li;
}

function renderFoldersTable() {
  if (!draftSettings) return;

  const s = draftSettings;
  const tbody = document.getElementById("foldersTbody");
  if (!tbody) return;
  tbody.textContent = "";

  for (const f of s.folders) {
    const tr = document.createElement("tr");

    const tdLabel = document.createElement("td");
    tdLabel.textContent = f.label;

    const tdPath = document.createElement("td");
    tdPath.textContent = f.path;

    const tdOverride = document.createElement("td");
    const tdActions = document.createElement("td");

    const del = document.createElement("button");
    del.textContent = "Delete";
    del.addEventListener("click", async () => {
      draftSettings.folders = draftSettings.folders.filter(x => x.id !== f.id);
      setDirty(true);
      renderFoldersTable();
    });
    tdActions.appendChild(del);

    tdOverride.textContent = "—"; // keep per-folder override UI unchanged elsewhere if you already have it
    tr.appendChild(tdLabel);
    tr.appendChild(tdPath);
    tr.appendChild(tdOverride);
    tr.appendChild(tdActions);

    tbody.appendChild(tr);
  }
}

async function renderGlobalNaming() {
  if (!draftSettings) return;

  const naming = normalizeNaming(draftSettings.naming);

  const list = document.getElementById("partsList");
  if (!list) return;
  list.textContent = "";

  function onChange(evt) {
    const n = normalizeNaming(draftSettings.naming);

    if (evt.type === "toggle") {
      n.parts = n.parts.map((p, i) => (i === evt.index ? { ...p, enabled: !!evt.enabled } : p));
    } else if (evt.type === "move") {
      const { from, to } = evt;
      if (to < 0 || to >= n.parts.length) return;
      const copy = n.parts.slice();
      const [item] = copy.splice(from, 1);
      copy.splice(to, 0, item);
      n.parts = copy;
    }

    draftSettings.naming = n;
    setDirty(true);
    renderGlobalNaming();
  }

  naming.parts.forEach((p, idx) => list.appendChild(makePartRow(p, idx, naming.parts, onChange)));

  const separatorInput = document.getElementById("separatorInput");
  if (separatorInput) separatorInput.value = naming.separator;

  const dateSelect = document.getElementById("dateFormatSelect");
  const timeSelect = document.getElementById("timeFormatSelect");
  fillSelect(dateSelect, DATE_FORMAT_OPTIONS);
  fillSelect(timeSelect, TIME_FORMAT_OPTIONS);

  if (dateSelect) dateSelect.value = naming.dateFormat;
  if (timeSelect) timeSelect.value = naming.timeFormat;

  renderPreview(naming);
}

/** ---------------- Init ---------------- **/

async function init() {
  initTabs();

  draftSettings = await loadSettingsOnce();
  draftSettings.folders = normalizeFolders(draftSettings.folders);
  draftSettings.naming = normalizeNaming(draftSettings.naming);

  setDirty(false);

  const saveBtn = document.getElementById("saveBtn");
  saveBtn?.addEventListener("click", async () => {
    await saveDraftToStorage();
  });

  const labelEl = document.getElementById("newLabel");
  const pathEl = document.getElementById("newPath");
  const addBtn = document.getElementById("addBtn");

  async function doAdd() {
    const label = (labelEl?.value || "").trim();
    const path = sanitizeRelativePath(pathEl?.value || "");
    if (!label || !path) return;

    draftSettings.folders = [
      ...(draftSettings.folders || []),
      { id: makeId(), label, path, namingOverrideEnabled: false, namingOverride: null }
    ];

    setDirty(true);

    if (labelEl) labelEl.value = "";
    if (pathEl) pathEl.value = "";
    if (labelEl) {
      labelEl.focus();
      labelEl.select();
    }

    renderFoldersTable();
  }

  addBtn?.addEventListener("click", doAdd);

  labelEl?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      pathEl?.focus();
      pathEl?.select();
    }
  });

  pathEl?.addEventListener("keydown", async (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      await doAdd();
    }
  });

  const separatorInput = document.getElementById("separatorInput");
  const dateFormatSelect = document.getElementById("dateFormatSelect");
  const timeFormatSelect = document.getElementById("timeFormatSelect");

  function updateGlobalNaming(patch) {
    draftSettings.naming = normalizeNaming({ ...draftSettings.naming, ...patch });
    setDirty(true);
    renderGlobalNaming();
  }

  separatorInput?.addEventListener("input", () => updateGlobalNaming({ separator: separatorInput.value }));
  dateFormatSelect?.addEventListener("change", () => updateGlobalNaming({ dateFormat: dateFormatSelect.value }));
  timeFormatSelect?.addEventListener("change", () => updateGlobalNaming({ timeFormat: timeFormatSelect.value }));

  const resetAllLink = document.getElementById("resetAllLink");
  resetAllLink?.addEventListener("click", async () => {
    const ok = window.confirm(
      "Reset to defaults?\n\nThis will reset your folder list and naming options."
    );
    if (!ok) return;

    draftSettings = deepClone(DEFAULT_SETTINGS);
    draftSettings.folders = normalizeFolders(draftSettings.folders);
    draftSettings.naming = normalizeNaming(draftSettings.naming);

    setDirty(true);
    renderGlobalNaming();
    renderFoldersTable();

    labelEl?.focus();
    labelEl?.select();
  });

  await renderGlobalNaming();
  renderFoldersTable();

  labelEl?.focus();
  labelEl?.select();
}

init().catch((e) => console.error("[Options] init failed:", e));

