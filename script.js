// Set this to your Render web service base, e.g. https://your-service.onrender.com
// If empty, DB features will be disabled.
// Default: same-origin (works when serving frontend via the same domain as the backend).
const API_BASE = "http://localhost:8000";

// App should start fresh on reload (no persistence).
try {
  sessionStorage.clear();
} catch {}

function getApiBase() {
  const base = String(API_BASE || "").trim();
  if (base) return base;
  return window.location.origin;
}

function parseTimeMs(iso) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    const t = d.getTime();
    return Number.isFinite(t) ? t : null;
  } catch {
    return null;
  }
}

const els = {
  renderPill: document.getElementById("renderPill"),
  usersHeader: document.getElementById("usersHeader"),
  usersList: document.getElementById("usersList"),
  usersPanel: document.querySelector(".left"),
  divider: document.getElementById("divider"),
  messages: document.getElementById("messages"),
  chatTitle: document.getElementById("chatTitle"),
  chatSubtitle: document.getElementById("chatSubtitle"),
  modeHint: document.getElementById("modeHint"),

  refreshUserFiltered: document.getElementById("refreshUserFiltered"),
  refreshUserAll: document.getElementById("refreshUserAll"),

  toast: document.getElementById("toast"),

  modeDb: document.getElementById("modeDb"),
  modeCsv: document.getElementById("modeCsv"),
  themeToggle: document.getElementById("themeToggle"),
  refreshBtn: document.getElementById("refreshBtn"),
  settingsBtn: document.getElementById("settingsBtn"),

  settingsModal: document.getElementById("settingsModal"),
  settingsClose: document.getElementById("settingsClose"),

  pgUrl: document.getElementById("pgUrl"),
  pgEdit: document.getElementById("pgEdit"),
  pgSave: document.getElementById("pgSave"),
  pgStatus: document.getElementById("pgStatus"),

  tableStatus: document.getElementById("tableStatus"),

  tableName: document.getElementById("tableName"),
  tableSet: document.getElementById("tableSet"),
  tableEdit: document.getElementById("tableEdit"),
  tableCols: document.getElementById("tableCols"),

  afterDate: document.getElementById("afterDate"),
  afterSet: document.getElementById("afterSet"),

  adminName: document.getElementById("adminName"),
  adminSet: document.getElementById("adminSet"),

  autoRefresh: document.getElementById("autoRefresh"),
  autoSet: document.getElementById("autoSet"),
  autoClear: document.getElementById("autoClear"),

  csvInput: document.getElementById("csvInput"),
  csvPick: document.getElementById("csvPick"),
  csvLoad: document.getElementById("csvLoad"),
  csvFileName: document.getElementById("csvFileName"),
  csvDownload: document.getElementById("csvDownload"),

  attachBtn: document.getElementById("attachBtn"),
  fileInput: document.getElementById("fileInput"),
  messageInput: document.getElementById("messageInput"),
  sendBtn: document.getElementById("sendBtn"),

  preview: document.getElementById("preview"),
  previewTitle: document.getElementById("previewTitle"),
  previewBody: document.getElementById("previewBody"),
  previewClose: document.getElementById("previewClose"),
  previewDownload: document.getElementById("previewDownload"),
};

const cache_data = {
  mode: safeGet("mode", "csv"),
  theme: safeGet("theme", "dark"),

  pgUrl: safeGet("pgUrl", ""),
  pgConnected: safeGet("pgConnected") === "true",

  tableName: safeGet("tableName", "messages"),
  tableCols: safeGet("tableCols", "id, user_identifier, sender, admin_name, message, file, created_at"),
  afterDateDraft: safeGet("afterDateDraft", ""),
  afterDateSet: safeGet("afterDateSet", ""),

  adminName: safeGet("adminName", ""),
  autoRefreshSec: safeGet("autoRefreshSec", ""),

  rows: [],
  byKey: new Set(),
  selectedUser: safeGet("selectedUser", ""),
  unread: {},

  usersCircle: false,
  usersCollapsed: false,
  allowUnreadIncrement: false,

  hasLoadedOnce: false,
  layoutLeftWidthPx: 320,

  composeAttachment: null,
  lastIncrementalSince: null,
  autoTimer: null,

  csvFileName: safeGet("csvFileName", ""),

  renderHealthTimer: null,
  renderHealthOk: false,
};


function safeGet(key, fallback = "") {
  try {
    return sessionStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function safeSet(key, value) {
  try {
    sessionStorage.setItem(key, value);
  } catch {}
}


function persist(k, v) {
  safeSet(k, v);
}


function on(el, eventName, handler) {
  if (!el) return;
  el.addEventListener(eventName, handler);
}

function toast(msg) {
  const m = String(msg || "").trim();
  if (!m || !els.toast) return;
  els.toast.textContent = m;
  els.toast.classList.remove("hidden");
  window.clearTimeout(els.toast._t);
  els.toast._t = window.setTimeout(() => {
    els.toast.classList.add("hidden");
  }, 5000);
}

window.addEventListener("error", (e) => {
  toast(e.message || "Unexpected error");
});

window.addEventListener("unhandledrejection", (e) => {
  toast(e.reason?.message || String(e.reason || "Unhandled promise rejection"));
});

function setPill(el, ok, goodText, badText) {
  el.classList.toggle("pill-good", ok);
  el.classList.toggle("pill-bad", !ok);
  // Keep inner structure (dot + label) if present.
  const label = el.querySelector?.(".label");
  if (label) {
    label.textContent = ok ? goodText : badText;
  } else {
    el.textContent = ok ? goodText : badText;
  }
}

function formatUserId(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const digits = (s.match(/\d+/g) || []).join("");
  if (digits) {
    return `USER ${digits.slice(-6).padStart(6, "0")}`;
  }
  return s;
}

function initialsFor(raw) {
  // Requirement: show 2 digits after USER (USER is constant).
  const f = formatUserId(raw);
  const digits = (f.match(/\d+/g) || []).join("");
  return digits.slice(-2).padStart(2, "0");
}

function applyLeftWidth(px) {
  const n = Math.max(220, Math.min(520, Math.floor(px)));
  cache_data.layoutLeftWidthPx = n;
  document.querySelector(".layout")?.style.setProperty("--leftW", `${n}px`);
}

function initDividerDrag() {
  if (!els.divider) return;
  let dragging = false;

  function onMove(e) {
    if (!dragging) return;
    const layout = document.querySelector(".layout");
    if (!layout) return;
    const rect = layout.getBoundingClientRect();
    applyLeftWidth(e.clientX - rect.left);
  }

  function stop() {
    dragging = false;
    document.body.style.cursor = "";
  }

  els.divider.addEventListener("pointerdown", (e) => {
    dragging = true;
    els.divider.setPointerCapture(e.pointerId);
    document.body.style.cursor = "col-resize";
  });

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", stop);
}

function setTheme(theme) {
  cache_data.theme = theme;
  persist("theme", theme);
  document.documentElement.setAttribute("data-theme", theme);
}

function setMode(mode) {
  cache_data.mode = mode;
  persist("mode", mode);

  els.modeDb.classList.toggle("active", mode === "db");
  els.modeCsv.classList.toggle("active", mode === "csv");

  document.querySelectorAll(".db-only").forEach((n) => (n.style.display = mode === "db" ? "block" : "none"));
  document.querySelectorAll(".csv-only").forEach((n) => (n.style.display = mode === "csv" ? "block" : "none"));

  // Do not show mode text until a user is selected.
  if (cache_data.selectedUser) {
    els.modeHint.textContent = mode === "db" ? "DB mode" : "CSV mode";
  } else {
    els.modeHint.textContent = "";
  }
  updatePgStatusPill();

  // Hide irrelevant controls in CSV mode.
  if (els.refreshBtn) {
    els.refreshBtn.style.display = mode === "csv" ? "none" : "inline-flex";
  }

  // Subtle mode lock: keep other-mode controls visible but inert.
  const dbDisabled = mode !== "db";
  [els.pgUrl, els.pgSave, els.pgEdit].forEach((x) => x && (x.disabled = dbDisabled));

  const csvDisabled = mode !== "csv";
  [els.csvPick, els.csvLoad, els.csvDownload].forEach((x) => x && (x.disabled = csvDisabled));
}

async function checkRenderStatus() {
  // "Render" badge is now based on backend health. If /api/health returns { ok: true }, show connected.
  const base = getApiBase();
  if (!base) {
    cache_data.renderHealthOk = false;
    setPill(els.renderPill, false, "API", "API");
    return;
  }
  try {
    const r = await fetch(`${base}/api/health`, { method: "GET" });
    const j = await r.json();
    cache_data.renderHealthOk = !!j.ok;
    setPill(els.renderPill, cache_data.renderHealthOk, "Render", "Render");
  } catch {
    cache_data.renderHealthOk = false;
    setPill(els.renderPill, false, "Render", "Render");
  }
}

function startRenderHealthPolling() {
  if (cache_data.renderHealthTimer) {
    clearInterval(cache_data.renderHealthTimer);
    cache_data.renderHealthTimer = null;
  }
  cache_data.renderHealthTimer = setInterval(() => {
    checkRenderStatus();
  }, 5000);
}

function updatePgStatusPill() {
  const ok = cache_data.pgConnected && cache_data.mode === "db";
  setPill(els.pgStatus, ok, "✓ Connected", "✕ Not connected");
}

function updateTableStatusPill({ editing = false } = {}) {
  const name = (cache_data.tableName || "messages").trim() || "messages";
  if (editing) {
    setPill(els.tableStatus, false, "", "✎ Editing");
    return;
  }
  setPill(els.tableStatus, true, `✓ Using ${name}`, "");
}

async function testDbConnection() {
  const base = getApiBase();
  if (!base) {
    cache_data.pgConnected = false;
    persist("pgConnected", "false");
    updatePgStatusPill();
    toast("API_BASE is empty. Set it to your backend URL.");
    return false;
  }

  try {
    const r = await fetch(`${base}/api/db-test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ db_url: cache_data.pgUrl }),
    });
    const j = await r.json();
    cache_data.pgConnected = !!j.connected;
    persist("pgConnected", String(cache_data.pgConnected));
    updatePgStatusPill();
    return cache_data.pgConnected;
  } catch {
    cache_data.pgConnected = false;
    persist("pgConnected", "false");
    updatePgStatusPill();
    toast(`DB test failed. API unreachable at ${base} or DB not configured.`);
    return false;
  }
}

function parseCols() {
  return cache_data.tableCols
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isAdminSender(sender) {
  return String(sender || "").toLowerCase() === "admin";
}

function toLocalTimeLabel(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso);
    return d.toLocaleString();
  } catch {
    return String(iso);
  }
}

function toMessageTimeLabel(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const t = d.getTime();
    if (!Number.isFinite(t)) return String(iso);

    const now = Date.now();
    const diffMs = Math.max(0, now - t);
    const s = Math.floor(diffMs / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;

    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return String(iso);
  }
}

function normalizeAfterDateForApi(s) {
  const v = String(s || "").trim();
  if (!v) return "";

  // Accept simple date strings: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return `${v}T00:00:00Z`;
  }

  // If user typed something else, try to parse it; fall back to the raw string.
  try {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  } catch {}
  return v;
}

function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16);
}

function messageKey(m) {
  if (m.id !== undefined && m.id !== null && String(m.id).length) return `id:${m.id}`;
  const a = String(m.user_identifier || "");
  const b = String(m.sender || "");
  const c = String(m.created_at || "");
  const d = String(m.message || "");
  return `h:${hash(`${a}|${b}|${c}|${d}`)}`;
}

function sameFile(a, b) {
  const aa = a ?? null;
  const bb = b ?? null;
  if (aa === bb) return true;
  // If either is empty string, treat as null.
  if (aa === "" && bb === null) return true;
  if (bb === "" && aa === null) return true;
  return false;
}

function reconcilePendingWithDbRow(dbRow) {
  // When sending, we optimistically insert a local "pending" row with id=null.
  // Later, an inserted DB row (with id) arrives and would otherwise show as a duplicate.
  if (!dbRow || dbRow.id === undefined || dbRow.id === null) return;

  const createdAt = String(dbRow.created_at || "");
  const msg = String(dbRow.message || "");
  const uid = String(dbRow.user_identifier || "");
  const sender = String(dbRow.sender || "");
  if (!createdAt || !uid) return;

  const dbT = (() => {
    try {
      const d = new Date(createdAt);
      const t = d.getTime();
      return Number.isFinite(t) ? t : null;
    } catch {
      return null;
    }
  })();

  const idx = cache_data.rows.findIndex((r) => {
    if (r.id !== undefined && r.id !== null) return false;
    if (String(r.user_identifier || "") !== uid) return false;
    if (String(r.sender || "") !== sender) return false;
    // DB might return timestamps with different formatting/timezone.
    const rt = (() => {
      try {
        const d = new Date(String(r.created_at || ""));
        const t = d.getTime();
        return Number.isFinite(t) ? t : null;
      } catch {
        return null;
      }
    })();

    if (dbT !== null && rt !== null) {
      if (Math.abs(dbT - rt) > 10_000) return false; // 10s tolerance
    } else {
      // Fallback if we cannot parse: require exact match.
      if (String(r.created_at || "") !== createdAt) return false;
    }

    if (String(r.message || "") !== msg) return false;
    if (!sameFile(r.file, dbRow.file)) return false;
    // Only reconcile optimistic admin messages.
    return isAdminSender(r.sender) && String(r._status || "") === "pending";
  });

  if (idx >= 0) {
    const old = cache_data.rows[idx];
    cache_data.rows.splice(idx, 1);
    cache_data.byKey.delete(messageKey(old));
  }
}

function normalizeRow(r) {
  const out = { ...r };
  if (!out.sender) out.sender = "user";
  if (!out.created_at) out.created_at = new Date().toISOString();
  if (out.file === "") out.file = null;
  return out;
}

function addRows(rows, { markUnread = true } = {}) {
  const newOnes = [];
  for (const raw of rows) {
    const r = normalizeRow(raw);

    // De-dup "pending" optimistic send vs DB row.
    reconcilePendingWithDbRow(r);

    const key = messageKey(r);
    if (cache_data.byKey.has(key)) continue;
    cache_data.byKey.add(key);
    cache_data.rows.push(r);
    newOnes.push(r);

    const uid = String(r.user_identifier || "");
    const canInc = cache_data.allowUnreadIncrement && cache_data.hasLoadedOnce;
    if (markUnread && canInc && uid && uid !== cache_data.selectedUser) {
      cache_data.unread[uid] = (cache_data.unread[uid] || 0) + 1;
    }
  }

  cache_data.rows.sort((a, b) => {
    const ta = new Date(a.created_at || 0).getTime();
    const tb = new Date(b.created_at || 0).getTime();
    return ta - tb;
  });

  const bumpUsers = new Set(newOnes.map((x) => String(x.user_identifier || "")).filter(Boolean));
  renderUsers({ bumpUsers });
  renderMessages({ animateNew: newOnes });
}

function groupUsers() {
  const map = new Map();
  for (const r of cache_data.rows) {
    const uid = String(r.user_identifier || "");
    if (!uid) continue;
    if (!map.has(uid)) map.set(uid, []);
    map.get(uid).push(r);
  }
  return map;
}

function renderUsers({ bumpUsers = new Set() } = {}) {
  const map = groupUsers();

  const users = Array.from(map.keys()).sort((a, b) => {
    const la = map.get(a)?.at(-1);
    const lb = map.get(b)?.at(-1);
    const ta = parseTimeMs(la?.created_at) ?? 0;
    const tb = parseTimeMs(lb?.created_at) ?? 0;
    if (tb !== ta) return tb - ta; // newest first
    return String(a).localeCompare(String(b));
  });

  els.usersList.innerHTML = "";

  els.usersList.classList.toggle("circle", !!cache_data.usersCircle);

  for (const uid of users) {
    const last = map.get(uid).at(-1);
    const btn = document.createElement("div");
    btn.className = `user${uid === cache_data.selectedUser ? " active" : ""}${bumpUsers.has(uid) ? " bump" : ""}`;
    btn.tabIndex = 0;

    const left = document.createElement("div");
    left.className = cache_data.usersCircle ? "" : "user-row";

    const avatar = document.createElement("div");
    avatar.className = "avatar";
    avatar.textContent = initialsFor(uid);
    left.appendChild(avatar);

    if (!cache_data.usersCircle) {
      const metaWrap = document.createElement("div");
      metaWrap.className = "meta";

      const name = document.createElement("div");
      name.className = "name";
      name.textContent = formatUserId(uid);

      const sub = document.createElement("div");
      sub.className = "sub";
      sub.textContent = last ? `${(last.message || "(attachment)").slice(0, 32)} · ${toMessageTimeLabel(last.created_at)}` : "";

      metaWrap.appendChild(name);
      metaWrap.appendChild(sub);
      left.appendChild(metaWrap);
    }

    const unread = cache_data.unread[uid] || 0;
    const right = document.createElement("div");
    if (unread > 0) {
      const badge = document.createElement("div");
      badge.className = "unread";
      badge.textContent = String(unread);
      right.appendChild(badge);
    }

    btn.appendChild(left);
    btn.appendChild(right);

    btn.addEventListener("click", () => selectUser(uid));
    btn.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") selectUser(uid);
    });

    els.usersList.appendChild(btn);
  }
}

function selectUser(uid) {
  cache_data.selectedUser = uid;
  persist("selectedUser", uid);

  // When a user is selected, switch the user list into circle-only mode.
  cache_data.usersCircle = true;

  cache_data.unread[uid] = 0;

  els.chatTitle.textContent = formatUserId(uid);
  els.chatSubtitle.textContent = cache_data.adminName ? `Admin • ${cache_data.adminName}` : "Admin";

  // Only show hint when a user is selected.
  if (els.modeHint) {
    els.modeHint.textContent = "";
  }

  renderUsers();
  renderMessages({ animateNew: [] });
}

function statusIconFor(m) {
  if (isAdminSender(m.sender)) {
    const s = String(m._status || "sent");
    if (s === "pending") return "◷"; // pending
    if (s === "failed") return "!";
    return "✓✓";
  }
  return "";
}

function renderMessages({ animateNew }) {
  const uid = cache_data.selectedUser;
  els.messages.innerHTML = "";

  if (!uid) {
    els.chatTitle.textContent = "Select a user";
    els.chatSubtitle.textContent = "";
    if (els.modeHint) els.modeHint.textContent = "";
    return;
  }

  const list = cache_data.rows.filter((r) => String(r.user_identifier || "") === uid);

  for (const m of list) {
    const isRight = isAdminSender(m.sender);
    const div = document.createElement("div");
    div.className = `msg${isRight ? " right" : ""}`;

    const text = document.createElement("div");
    text.textContent = m.message || "";
    div.appendChild(text);

    if (m.file) {
      const file = document.createElement("div");
      file.className = "file";
      file.textContent = "Open attachment";
      file.addEventListener("click", () => openAttachment(m));
      div.appendChild(file);
    }

    const meta = document.createElement("div");
    meta.className = "meta";

    const t = document.createElement("div");
    t.textContent = toMessageTimeLabel(m.created_at);

    const s = document.createElement("div");
    s.textContent = statusIconFor(m);

    meta.appendChild(t);
    meta.appendChild(s);
    div.appendChild(meta);

    const key = messageKey(m);
    if (animateNew && animateNew.some((x) => messageKey(x) === key)) {
      div.style.animation = "pop .18s ease-out";
    }

    els.messages.appendChild(div);
  }

  els.messages.scrollTop = els.messages.scrollHeight;
}

async function refreshCurrentUser({ useAfterFilter }) {
  if (cache_data.mode !== "db") return;
  if (!cache_data.selectedUser) return;

  if (!cache_data.pgConnected) {
    await testDbConnection();
    if (!cache_data.pgConnected) return;
  }

  const base = getApiBase();
  if (!base) return;

  const cols = parseCols();
  const uid = cache_data.selectedUser;
  const after = useAfterFilter ? normalizeAfterDateForApi((cache_data.afterDateSet || "").trim()) : "";

  try {
    const r = await fetch(`${base}/api/messages/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        db_url: cache_data.pgUrl,
        table: cache_data.tableName,
        columns: cols,
        since: after || null,
        limit: 5000,
      }),
    });

    const j = await r.json();
    if (!j.ok) return;

    const rows = Array.isArray(j.rows) ? j.rows : [];
    const onlyUser = rows.filter((x) => String(x.user_identifier || "") === uid);

    // If using filter, drop older cached messages for this user so the view matches the filter.
    if (useAfterFilter && after) {
      const afterT = parseTimeMs(after);
      if (afterT) {
        cache_data.rows = cache_data.rows.filter((r) => {
          if (String(r.user_identifier || "") !== uid) return true;
          const t = parseTimeMs(r.created_at);
          return !t || t >= afterT;
        });
        cache_data.byKey = new Set(cache_data.rows.map((r) => messageKey(r)));
      }
    }

    addRows(onlyUser, { markUnread: true });
    cache_data.hasLoadedOnce = true;
  } catch {
    toast("Refresh failed for current user.");
  }
}

function setSettingsOpen(open) {
  els.settingsModal.classList.toggle("hidden", !open);
}

function safeFileName(ext) {
  const base = cache_data.selectedUser ? cache_data.selectedUser.replace(/[^a-z0-9_-]/gi, "_") : "attachment";
  return `${base}_${Date.now()}.${ext}`;
}

function detectAttachmentType(bytes, mimeHint) {
  const h = bytes.slice(0, 8);
  const sig = Array.from(h)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  if (mimeHint && String(mimeHint).includes("pdf")) return { mime: "application/pdf", ext: "pdf" };
  if (sig.startsWith("25504446")) return { mime: "application/pdf", ext: "pdf" };
  if (sig.startsWith("89504e47")) return { mime: "image/png", ext: "png" };
  if (sig.startsWith("ffd8")) return { mime: "image/jpeg", ext: "jpg" };
  return { mime: "application/octet-stream", ext: "bin" };
}

function b64ToBytes(b64) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}

function openAttachment(m) {
  const bytes = b64ToBytes(m.file);
  const { mime, ext } = detectAttachmentType(bytes, m.file_mime);
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);

  els.previewTitle.textContent = `Attachment (${mime})`;
  els.previewBody.innerHTML = "";

  let downloadName = safeFileName(ext);
  els.previewDownload.onclick = () => {
    const a = document.createElement("a");
    a.href = url;
    a.download = downloadName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  if (mime.startsWith("image/")) {
    const stage = document.createElement("div");
    stage.style.position = "absolute";
    stage.style.inset = "0";
    stage.style.cursor = "grab";

    const img = document.createElement("img");
    img.src = url;
    img.style.position = "absolute";
    img.style.left = "50%";
    img.style.top = "50%";
    img.style.transform = "translate(-50%, -50%) scale(1)";
    img.style.transformOrigin = "center center";
    img.style.maxWidth = "none";
    img.style.maxHeight = "none";

    let scale = 1;
    let tx = 0;
    let ty = 0;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;

    function apply() {
      img.style.transform = `translate(calc(-50% + ${tx}px), calc(-50% + ${ty}px)) scale(${scale})`;
    }

    stage.addEventListener("wheel", (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.12 : 0.12;
      scale = Math.min(6, Math.max(0.3, scale + delta));
      apply();
    }, { passive: false });

    stage.addEventListener("pointerdown", (e) => {
      dragging = true;
      stage.setPointerCapture(e.pointerId);
      stage.style.cursor = "grabbing";
      lastX = e.clientX;
      lastY = e.clientY;
    });

    stage.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      tx += e.clientX - lastX;
      ty += e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      apply();
    });

    stage.addEventListener("pointerup", () => {
      dragging = false;
      stage.style.cursor = "grab";
    });

    stage.appendChild(img);
    els.previewBody.appendChild(stage);
  } else if (mime === "application/pdf") {
    const iframe = document.createElement("iframe");
    iframe.src = url;
    iframe.style.border = "0";
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    els.previewBody.appendChild(iframe);
  } else {
    const box = document.createElement("div");
    box.style.padding = "16px";
    box.textContent = "Preview not available. Use Download.";
    els.previewBody.appendChild(box);
  }

  els.preview.classList.remove("hidden");

  function cleanup() {
    URL.revokeObjectURL(url);
  }
  els.previewClose.onclick = () => {
    cleanup();
    els.preview.classList.add("hidden");
  };
  els.preview.onclick = (e) => {
    if (e.target === els.preview) {
      cleanup();
      els.preview.classList.add("hidden");
    }
  };
}

function clearSessionDataButKeepSettings() {
  cache_data.rows = [];
  cache_data.byKey = new Set();
  cache_data.unread = {};
  cache_data.lastIncrementalSince = null;
  renderUsers();
  renderMessages({ animateNew: [] });
}

async function refreshData({ incremental }) {
  if (cache_data.mode === "csv") {
    // CSV mode is static until you load or send.
    renderUsers();
    renderMessages({ animateNew: [] });
    return;
  }

  if (!cache_data.pgConnected) {
    await testDbConnection();
    if (!cache_data.pgConnected) return;
  }

  const base = getApiBase();
  if (!base) return;

  const cols = parseCols();
  const after = normalizeAfterDateForApi((cache_data.afterDateSet || "").trim());

  // If afterDate is set, a manual refresh should respect it.
  let since = null;
  if (incremental) {
    since = cache_data.lastIncrementalSince || after || null;
  } else {
    since = after || null;
    clearSessionDataButKeepSettings();
  }

  try {
    const r = await fetch(`${base}/api/messages/query`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        db_url: cache_data.pgUrl,
        table: cache_data.tableName,
        columns: cols,
        since,
        limit: 5000,
      }),
    });

    const j = await r.json();
    if (!j.ok) return;

    const rows = Array.isArray(j.rows) ? j.rows : [];
    addRows(rows, { markUnread: true });

    // After first successful fetch, allow unread logic on subsequent refreshes.
    cache_data.hasLoadedOnce = true;

    // Update incremental cursor
    const last = cache_data.rows.at(-1);
    if (last && last.created_at) {
      cache_data.lastIncrementalSince = last.created_at;
    }
  } catch {
    // ignore
    toast(`Refresh failed. Check backend at ${base}.`);
  }
}

function setAutoRefreshTimer(sec) {
  if (cache_data.autoTimer) {
    clearInterval(cache_data.autoTimer);
    cache_data.autoTimer = null;
  }

  const n = Number(sec);
  if (!Number.isFinite(n) || n <= 0) {
    cache_data.autoRefreshSec = "";
    persist("autoRefreshSec", "");
    els.autoRefresh.value = "";
    return;
  }

  cache_data.autoRefreshSec = String(Math.floor(n));
  persist("autoRefreshSec", cache_data.autoRefreshSec);

  cache_data.autoTimer = setInterval(() => {
    cache_data.allowUnreadIncrement = false;
    refreshData({ incremental: true });
  }, Math.max(1, Math.floor(n)) * 1000);
}

function validateAttachment(file) {
  if (!file) return { ok: true };
  if (file.size > 10 * 1024 * 1024) return { ok: false, error: "Max 10MB" };

  const okTypes = ["application/pdf", "image/png", "image/jpeg"];
  if (!okTypes.includes(file.type)) return { ok: false, error: "Only pdf/png/jpg/jpeg" };
  return { ok: true };
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = String(reader.result || "");
      const b64 = res.includes(",") ? res.split(",")[1] : res;
      resolve(b64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function ensureSelectedUser() {
  if (cache_data.selectedUser) return true;
  const map = groupUsers();
  const first = Array.from(map.keys()).sort((a, b) => a.localeCompare(b))[0];
  if (first) {
    selectUser(first);
    return true;
  }
  return false;
}

async function sendMessage() {
  if (!ensureSelectedUser()) return;

  const text = (els.messageInput.value || "").trim();
  const attachment = cache_data.composeAttachment;

  if (!text && !attachment) return;

  const temp = {
    id: null,
    user_identifier: cache_data.selectedUser,
    sender: "admin",
    admin_name: cache_data.adminName || "",
    message: text,
    file: null,
    created_at: new Date().toISOString(),
    _status: "pending",
  };

  if (attachment) {
    const b64 = await fileToBase64(attachment);
    temp.file = b64;
  }

  addRows([temp], { markUnread: false });
  els.messageInput.value = "";
  cache_data.composeAttachment = null;

  if (cache_data.mode === "csv") {
    temp._status = "sent";
    renderMessages({ animateNew: [] });
    return;
  }

  if (!cache_data.pgConnected) {
    temp._status = "failed";
    renderMessages({ animateNew: [] });
    return;
  }

  const base = getApiBase();
  if (!base) {
    temp._status = "failed";
    renderMessages({ animateNew: [] });
    return;
  }

  try {
    const r = await fetch(`${base}/api/messages/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        db_url: cache_data.pgUrl,
        table: cache_data.tableName,
        columns: parseCols(),
        user_identifier: temp.user_identifier,
        sender: "admin",
        admin_name: temp.admin_name,
        message: temp.message,
        file_base64: temp.file,
        created_at: temp.created_at,
      }),
    });

    const j = await r.json();
    temp._status = j.ok ? "sent" : "failed";
    renderMessages({ animateNew: [] });

    // Best-effort: refresh incrementally to pick up DB-side ids.
    if (j.ok) {
      await refreshData({ incremental: true });
    }
  } catch {
    temp._status = "failed";
    renderMessages({ animateNew: [] });
  }
}

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((x) => x.trim().length);
  if (!lines.length) return [];

  const header = splitCsvLine(lines[0]).map((h) => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = splitCsvLine(lines[i]);
    const obj = {};
    for (let c = 0; c < header.length; c++) {
      obj[header[c]] = vals[c] ?? "";
    }
    rows.push(obj);
  }
  return rows;
}

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
      continue;
    }
    if (ch === "," && !inQ) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function toCsv(rows) {
  const cols = parseCols();
  const esc = (v) => {
    const s = String(v ?? "");
    if (s.includes('"') || s.includes(",") || s.includes("\n")) {
      return '"' + s.replaceAll('"', '""') + '"';
    }
    return s;
  };

  const head = cols.join(",");
  const body = rows
    .map((r) => cols.map((c) => esc(r[c])).join(","))
    .join("\n");
  return head + "\n" + body + "\n";
}

function downloadCsv() {
  const csv = toCsv(cache_data.rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = (cache_data.csvFileName || "messages.csv").trim() || "messages.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function initFromSession() {
  setTheme(cache_data.theme);

  els.pgUrl.value = cache_data.pgUrl;
  els.tableName.value = cache_data.tableName;
  els.tableCols.value = cache_data.tableCols;
  if (!cache_data.afterDateDraft) {
    try {
      cache_data.afterDateDraft = new Date().toISOString().slice(0, 10);
      persist("afterDateDraft", cache_data.afterDateDraft);
    } catch {}
  }
  els.afterDate.value = cache_data.afterDateDraft;
  els.adminName.value = cache_data.adminName;
  els.autoRefresh.value = cache_data.autoRefreshSec;
  els.csvFileName.value = cache_data.csvFileName;

  setMode(cache_data.mode);
  updateTableStatusPill({ editing: false });

  if (cache_data.autoRefreshSec) {
    setAutoRefreshTimer(cache_data.autoRefreshSec);
  }

  renderUsers();
  if (cache_data.selectedUser) {
    selectUser(cache_data.selectedUser);
  } else {
    renderMessages({ animateNew: [] });
    if (els.modeHint) els.modeHint.textContent = "";
  }
}

function setUsersCollapsed(collapsed) {
  cache_data.usersCollapsed = !!collapsed;
  document.body.classList.toggle("users-collapsed", cache_data.usersCollapsed);
}

function initUsersPanelDragToCollapse() {
  if (!els.usersPanel || !els.usersHeader) return;

  let dragging = false;
  let startY = 0;
  let startHeight = 0;

  const isMobile = () => window.matchMedia && window.matchMedia("(max-width: 900px)").matches;

  function onDown(e) {
    if (!isMobile()) return;
    dragging = true;
    startY = e.clientY;
    startHeight = els.usersPanel.getBoundingClientRect().height;
    els.usersHeader.setPointerCapture(e.pointerId);
  }

  function onMove(e) {
    if (!dragging) return;
    const dy = e.clientY - startY;
    const next = Math.max(72, Math.min(360, startHeight + dy));
    els.usersPanel.style.height = `${next}px`;
    // auto-collapse threshold
    setUsersCollapsed(next <= 92);
  }

  function onUp() {
    dragging = false;
  }

  els.usersHeader.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);

  // Tap header to toggle collapsed state on mobile.
  els.usersHeader.addEventListener("click", () => {
    if (!isMobile()) return;
    setUsersCollapsed(!cache_data.usersCollapsed);
    els.usersPanel.style.height = cache_data.usersCollapsed ? "72px" : "260px";
  });
}

// Events
on(els.themeToggle, "click", () => {
  setTheme(cache_data.theme === "dark" ? "light" : "dark");
});

on(els.modeDb, "click", () => setMode("db"));
on(els.modeCsv, "click", () => setMode("csv"));

on(els.settingsBtn, "click", () => setSettingsOpen(true));
on(els.settingsClose, "click", () => setSettingsOpen(false));
on(els.settingsModal, "click", (e) => {
  if (e.target === els.settingsModal) setSettingsOpen(false);
});

on(els.pgEdit, "click", () => {
  els.pgUrl.focus();
  cache_data.pgConnected = false;
  persist("pgConnected", "false");
  updatePgStatusPill();
});

on(els.pgSave, "click", async () => {
  cache_data.pgUrl = String(els.pgUrl.value || "").trim();
  persist("pgUrl", cache_data.pgUrl);
  await testDbConnection();
});

on(els.tableSet, "click", () => {
  cache_data.tableName = String(els.tableName.value || "messages").trim() || "messages";
  persist("tableName", cache_data.tableName);
  updateTableStatusPill({ editing: false });
});

on(els.tableEdit, "click", () => {
  els.tableName.focus();
  updateTableStatusPill({ editing: true });
});

on(els.tableCols, "change", () => {
  cache_data.tableCols = String(els.tableCols.value || "");
  persist("tableCols", cache_data.tableCols);
});

on(els.afterDate, "change", () => {
  cache_data.afterDateDraft = String(els.afterDate.value || "").trim();
  persist("afterDateDraft", cache_data.afterDateDraft);
});

on(els.afterSet, "click", () => {
  cache_data.afterDateSet = String(els.afterDate.value || "").trim();
  persist("afterDateSet", cache_data.afterDateSet);
  toast("Show messages after: set");
});

on(els.refreshUserFiltered, "click", async () => {
  await refreshCurrentUser({ useAfterFilter: true });
});

on(els.refreshUserAll, "click", async () => {
  await refreshCurrentUser({ useAfterFilter: false });
});

on(els.adminSet, "click", () => {
  cache_data.adminName = String(els.adminName.value || "").trim();
  persist("adminName", cache_data.adminName);
  if (cache_data.selectedUser) {
    els.chatSubtitle.textContent = cache_data.adminName ? `Admin • ${cache_data.adminName}` : "Admin";
  }
});

on(els.autoSet, "click", () => {
  const v = String(els.autoRefresh.value || "").trim();
  persist("autoRefreshSec", v);
  setAutoRefreshTimer(v);
});

on(els.autoClear, "click", () => {
  setAutoRefreshTimer("");
});

on(els.refreshBtn, "click", async () => {
  els.refreshBtn?.classList.add("spinning");
  cache_data.allowUnreadIncrement = true;
  await checkRenderStatus();
  if (cache_data.mode === "db") {
    // Manual refresh should keep existing chat and only fetch new rows.
    await refreshData({ incremental: true });
  } else {
    renderUsers();
    renderMessages({ animateNew: [] });
  }
  cache_data.allowUnreadIncrement = false;
  window.setTimeout(() => els.refreshBtn?.classList.remove("spinning"), 700);
});

on(els.attachBtn, "click", () => {
  els.fileInput.value = "";
  els.fileInput.click();
});

on(els.fileInput, "change", async () => {
  const f = els.fileInput.files && els.fileInput.files[0];
  if (!f) return;
  const v = validateAttachment(f);
  if (!v.ok) return;
  cache_data.composeAttachment = f;
});

on(els.sendBtn, "click", () => {
  sendMessage();
});

on(els.messageInput, "keydown", (e) => {
  if (e.key === "Enter") sendMessage();
});

on(els.csvPick, "click", () => {
  els.csvInput.value = "";
  els.csvInput.click();
});

on(els.csvInput, "change", () => {
  const f = els.csvInput.files && els.csvInput.files[0];
  if (!f) return;
  cache_data.csvFileName = f.name;
  persist("csvFileName", cache_data.csvFileName);
  els.csvFileName.value = cache_data.csvFileName;
  cache_data._csvFile = f;
});

on(els.csvLoad, "click", async () => {
  const f = cache_data._csvFile;
  if (!f) return;
  const txt = await f.text();
  const rows = parseCsv(txt);

  clearSessionDataButKeepSettings();

  // Ensure missing columns if CSV is minimal.
  const cols = parseCols();
  const normalized = rows.map((r) => {
    const o = { ...r };
    for (const c of cols) {
      if (o[c] === undefined) o[c] = "";
    }
    if (!o.created_at) o.created_at = new Date().toISOString();
    return o;
  });

  addRows(normalized, { markUnread: true });
  ensureSelectedUser();
});

on(els.csvDownload, "click", () => downloadCsv());

// Boot
window.addEventListener("DOMContentLoaded", () => {
  try {
    initFromSession();
    initDividerDrag();
    initUsersPanelDragToCollapse();
    checkRenderStatus();
    startRenderHealthPolling();
    if (cache_data.mode === "db") {
      testDbConnection();
    }
  } catch (e) {
    toast(e?.message || String(e || "Fatal initialization error"));
  }
});
