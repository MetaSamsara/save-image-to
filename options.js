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

/** ---------------- Tabs logic ---------------- **/
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

  return naming;
}

function normalizeFolders(folders) {
  const arr = Array.isArray(folders) ? folders : DEFAULT_SETTINGS.folders.slice();

  return arr.map((f) => {
    const folder = { ...f };

    if (!folder.id) folder.id = makeId();
    if (!folder.label) folder.label = "Default";
    if (!folder.path) folder.path = "saved_images";

    if (typeof folder.namingOverrideEnabled !== "boolean") folder.namingOverrideEnabled = false;

    if (folder.namingOverrideEnabled) {
      folder.namingOverride = normalizeNaming(folder.namingOverride || DEFAULT_SETTINGS.naming);
    } else {
      folder.namingOverride = folder.namingOverride ? normalizeNaming(folder.namingOverride) : null;
    }

    return folder;
  });
}

async function getSettings() {
  const got = await storageGet(DEFAULT_SETTINGS);
  got.folders = normalizeFolders(got.folders);
  got.naming = normalizeNaming(got.naming);
  return got;
}

async function setSettings(next) {
  await storageSet(next);
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

async function renderGlobalNaming() {
  const s = await getSettings();
  const naming = normalizeNaming(s.naming);

  const list = document.getElementById("partsList");
  if (!list) return;
  list.textContent = "";

  function onChange(evt) {
    (async () => {
      const ss = await getSettings();
      const n = normalizeNaming(ss.naming);

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

      await setSettings({ ...ss, naming: n });
      await renderGlobalNaming();
      await renderFoldersTable();
    })().catch(console.error);
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

function makeOverrideUI(folder, s, onUpdateFolder) {
  const wrap = document.createElement("div");

  const enabled = document.createElement("label");
  enabled.className = "inlineRow";

  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.checked = !!folder.namingOverrideEnabled;

  const txt = document.createElement("span");
  txt.textContent = "Override naming for this folder";

  enabled.appendChild(cb);
  enabled.appendChild(txt);
  wrap.appendChild(enabled);

  const overrideBox = document.createElement("div");
  overrideBox.className = "folderOverride";
  overrideBox.style.display = folder.namingOverrideEnabled ? "block" : "none";

  const n = normalizeNaming(folder.namingOverride || s.naming);

  const row1 = document.createElement("div");
  row1.className = "inlineRow";
  row1.style.marginTop = "8px";

  const sepLabel = document.createElement("span");
  sepLabel.className = "muted";
  sepLabel.textContent = "Separator:";

  const sepInput = document.createElement("input");
  sepInput.type = "text";
  sepInput.className = "tinyInput";
  sepInput.value = n.separator;

  const dateSel = document.createElement("select");
  fillSelect(dateSel, DATE_FORMAT_OPTIONS);
  dateSel.value = n.dateFormat;

  const timeSel = document.createElement("select");
  fillSelect(timeSel, TIME_FORMAT_OPTIONS);
  timeSel.value = n.timeFormat;

  row1.appendChild(sepLabel);
  row1.appendChild(sepInput);
  row1.appendChild(dateSel);
  row1.appendChild(timeSel);

  overrideBox.appendChild(row1);

  const partsList = document.createElement("ul");
  partsList.className = "parts";
  partsList.style.marginTop = "10px";

  const preview = document.createElement("div");
  preview.className = "tinyPreview";

  function renderOverrideParts(currentNaming) {
    partsList.textContent = "";

    function onPartsChange(evt) {
      const nn = normalizeNaming(currentNaming);

      if (evt.type === "toggle") {
        nn.parts = nn.parts.map((p, i) => (i === evt.index ? { ...p, enabled: !!evt.enabled } : p));
      } else if (evt.type === "move") {
        const { from, to } = evt;
        if (to < 0 || to >= nn.parts.length) return;
        const copy = nn.parts.slice();
        const [item] = copy.splice(from, 1);
        copy.splice(to, 0, item);
        nn.parts = copy;
      }

      onUpdateFolder({ namingOverride: nn });
    }

    currentNaming.parts.forEach((p, idx) =>
      partsList.appendChild(makePartRow(p, idx, currentNaming.parts, onPartsChange))
    );

    renderPreview(currentNaming, preview);
  }

  sepInput.addEventListener("input", () => onUpdateFolder({ namingOverride: { ...n, separator: sepInput.value } }));
  dateSel.addEventListener("change", () => onUpdateFolder({ namingOverride: { ...n, dateFormat: dateSel.value } }));
  timeSel.addEventListener("change", () => onUpdateFolder({ namingOverride: { ...n, timeFormat: timeSel.value } }));

  overrideBox.appendChild(partsList);
  overrideBox.appendChild(preview);
  wrap.appendChild(overrideBox);

  cb.addEventListener("change", () => {
    const enabledNow = cb.checked;
    overrideBox.style.display = enabledNow ? "block" : "none";

    if (enabledNow) {
      onUpdateFolder({
        namingOverrideEnabled: true,
        namingOverride: normalizeNaming(folder.namingOverride || s.naming)
      });
    } else {
      onUpdateFolder({
        namingOverrideEnabled: false
      });
    }
  });

  renderOverrideParts(n);
  return wrap;
}

async function renderFoldersTable() {
  const s = await getSettings();
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
      const ss = await getSettings();
      const nextFolders = ss.folders.filter(x => x.id !== f.id);
      await setSettings({ ...ss, folders: nextFolders });
      await renderFoldersTable();
    });
    tdActions.appendChild(del);

    function onUpdateFolder(patch) {
      (async () => {
        const ss = await getSettings();
        const nextFolders = ss.folders.map(folder => {
          if (folder.id !== f.id) return folder;
          const next = { ...folder, ...patch };
          if (next.namingOverrideEnabled) {
            next.namingOverride = normalizeNaming(next.namingOverride || ss.naming);
          }
          return next;
        });

        await setSettings({ ...ss, folders: nextFolders });
        await renderFoldersTable();
      })().catch(console.error);
    }

    tdOverride.appendChild(makeOverrideUI(f, s, onUpdateFolder));

    tr.appendChild(tdLabel);
    tr.appendChild(tdPath);
    tr.appendChild(tdOverride);
    tr.appendChild(tdActions);

    tbody.appendChild(tr);
  }
}

async function init() {
  initTabs();

  const cur0 = await storageGet({});
  const hasFolders = ("folders" in cur0) && Array.isArray(cur0.folders);
  const hasNaming = ("naming" in cur0);

  if (!hasFolders || !hasNaming) {
    await setSettings(DEFAULT_SETTINGS);
  } else {
    const s = await getSettings();
    await setSettings({ ...s, folders: normalizeFolders(s.folders), naming: normalizeNaming(s.naming) });
  }

  const labelEl = document.getElementById("newLabel");
  const pathEl = document.getElementById("newPath");
  const addBtn = document.getElementById("addBtn");

  async function doAdd() {
    const label = (labelEl?.value || "").trim();
    const path = sanitizeRelativePath(pathEl?.value || "");
    if (!label || !path) return;

    const cur = await getSettings();
    const nextFolders = [
      ...cur.folders,
      { id: makeId(), label, path, namingOverrideEnabled: false, namingOverride: null }
    ];

    await setSettings({ ...cur, folders: nextFolders });

    if (labelEl) labelEl.value = "";
    if (pathEl) pathEl.value = "";
    if (labelEl) {
      labelEl.focus();
      labelEl.select();
    }

    await renderFoldersTable();
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
  const resetNamingBtn = document.getElementById("resetNamingBtn");

  async function updateGlobalNaming(patch) {
    const cur = await getSettings();
    const naming = normalizeNaming({ ...cur.naming, ...patch });
    await setSettings({ ...cur, naming });
    await renderGlobalNaming();
    await renderFoldersTable();
  }

  separatorInput?.addEventListener("input", () => updateGlobalNaming({ separator: separatorInput.value }));
  dateFormatSelect?.addEventListener("change", () => updateGlobalNaming({ dateFormat: dateFormatSelect.value }));
  timeFormatSelect?.addEventListener("change", () => updateGlobalNaming({ timeFormat: timeFormatSelect.value }));

  resetNamingBtn?.addEventListener("click", async () => {
    const cur = await getSettings();
    await setSettings({ ...cur, naming: DEFAULT_SETTINGS.naming });
    await renderGlobalNaming();
    await renderFoldersTable();
  });

  // ✅ Reset ALL settings to defaults (footer link)
  const resetAllLink = document.getElementById("resetAllLink");
  resetAllLink?.addEventListener("click", async () => {
    const ok = window.confirm(
      "Reset to defaults?\n\nThis will reset your folder list and naming options."
    );
    if (!ok) return;

    await setSettings(DEFAULT_SETTINGS);

    await renderGlobalNaming();
    await renderFoldersTable();

    labelEl?.focus();
    labelEl?.select();
  });

  await renderGlobalNaming();
  await renderFoldersTable();

  labelEl?.focus();
  labelEl?.select();
}

init().catch((e) => console.error("[Options] init failed:", e));

