// LinguaVoice AI 2.0 — entry point. Wires the modules together; no business logic here.
import { $, esc } from "./utils.js";
import { T } from "./i18n.js";
import { bus } from "./state.js";
import { prefs } from "./storage/settings.js";
import { BACKEND, Net, fetchTimeout, api } from "./net.js";
import { Engine } from "./translation/translator.js";
import { Recognition, missingFeatures } from "./speech/recognition.js";
import { Player } from "./voice/playback.js";
import { Voices } from "./voice/tts.js";
import { History } from "./storage/history.js";
import { Router } from "./router.js";
import { Pwa } from "./pwa.js";
import { status } from "./ui/status.js";
import { toast, banner, bannerIs } from "./ui/notifications.js";
import { initSheets, applyTheme, toggleTheme, anySheetOpen } from "./ui/components.js";
import { createWave } from "./ui/wave.js";
import { Dashboard } from "./views/dashboard.js";
import { Conversation } from "./views/conversation.js";
import { HistoryView } from "./views/history.js";
import { SettingsView } from "./views/settings.js";
import { GamesView } from "./games/hub.js";

const errBanner = (msg, extra = "") => `<b>${esc(T.status.error)}:</b> ${esc(msg)}${extra}`;

function initDock() {
  $("micBtn").onclick = () => Dashboard.mic();
  $("spkA").onclick = () => Conversation.mic("a");
  $("spkB").onclick = () => Conversation.mic("b");
  $("cancelBtn").onclick = () => Recognition.cancel();
  $("stopPlayBtn").onclick = () => Engine.stopAudio();
  $("convStop").onclick = () => Engine.stopAudio();

  const setMic = (rc, state) => {
    const tr = rc && rc.view === "translate";
    const mic = $("micBtn");
    mic.dataset.state = tr ? state : "idle";
    mic.setAttribute("aria-label", tr && state === "listening" ? "Жазуды тоқтату" : "Сөйлеуді бастау");
    $("cancelBtn").classList.toggle("ghost", !(tr && state === "listening"));
    ["a", "b"].forEach(k => { $("spk" + k.toUpperCase()).dataset.state = rc && rc.view === "conversation" && rc.speaker === k ? state : "idle"; });
    document.documentElement.dataset.rec = state;
  };
  bus.on("rec:state", (rc, state) => setMic(rc, state));
  bus.on("rec:level", (rc, lv) => {
    const el = rc.view === "conversation" ? $("spk" + rc.speaker.toUpperCase()) : $("micBtn");
    el.style.setProperty("--level", lv.toFixed(2));
  });
  bus.on("rec:speech", (_rc, on) => { $("micBtn").dataset.speech = on ? "1" : "0"; });
  const idle = job => { if (job.kind === "translate" && !job.ctx.typed) setMic(null, "idle"); updateStop(); };
  bus.on("job:done", idle); bus.on("job:error", idle); bus.on("job:cancel", idle);
  const updateStop = () => {
    const any = Player.busy || (Engine.job && Engine.job.kind === "speak");
    $("stopPlayBtn").classList.toggle("ghost", !any);
    $("convStop").classList.toggle("dim", !any);
  };
  bus.on("player", updateStop); bus.on("job:new", updateStop);
  updateStop();
  createWave($("wave"));
  // keep the content clear of the dock whatever its real height is
  const dock = $("dock");
  const setH = () => document.documentElement.style.setProperty("--dock-h", (dock.offsetHeight || 0) + "px");
  if ("ResizeObserver" in window) new ResizeObserver(setH).observe(dock); else window.addEventListener("resize", setH);
  setH();
}

function initConnection() {
  bus.on("conn", s => {
    $("conn").dataset.state = s; $("connText").textContent = T.conn[s] || s;
    if (s === "online") {
      if (["offline", "idle", "waking"].includes(status.kind)) status.set("ready");
      if (bannerIs("unreachable")) banner(null);
    }
  });
  bus.on("server:ready", m => { if (!m.gemini_configured) banner(errBanner(T.err.server_misconfigured)); });
  const net = () => {
    $("offlineBar").hidden = navigator.onLine !== false;
    if (navigator.onLine === false) status.set("offline", T.status.noInternet);
  };
  window.addEventListener("offline", net);
  window.addEventListener("online", () => { net(); toast(T.online, { type: "success", ms: 2000 }); if (BACKEND.ok) Net.connect(); });
  net();
}

async function checkHealth() {
  // A free Render server may sleep; waking it takes up to about a minute.
  const wake = setTimeout(() => { if (!Net.open && status.kind === "idle") status.set("waking"); }, 4000);
  try {
    const r = await fetchTimeout(api("/api/health"), {}, 75000);
    const j = await r.json();
    $("infoModel").textContent = j.model || "—";
    if (!j.gemini_configured) banner(errBanner(T.err.server_misconfigured));
    if (status.kind === "idle" || status.kind === "waking") status.set("ready");
  } catch (e) {
    if (!Net.open && e.code !== "no_internet") {
      status.set("offline");
      banner(errBanner(T.err.backend_unreachable, `<br><code>${esc(BACKEND.base)}</code>`), "unreachable");
    }
  } finally { clearTimeout(wake); }
}

function initGlobalKeys() {
  document.addEventListener("keydown", e => {
    const tag = (e.target.tagName || "").toLowerCase();
    if (e.code === "Space" && !e.repeat && !["input", "select", "textarea", "button"].includes(tag) && !anySheetOpen()) {
      if (Router.current === "translate") { e.preventDefault(); Dashboard.mic(); }
    }
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") { if (Recognition.active) Recognition.cancel(); }
    else if (BACKEND.ok && !Net.open) Net.connect();
  });
  window.addEventListener("pagehide", () => Recognition.cancel());
  bus.on("route", (r, prev) => {
    // leaving a screen releases the microphone
    if (prev && prev !== r && Recognition.active) Recognition.cancel();
    if (r === "history" || r === "favorites") HistoryView.show(r);
    GamesView.route(r, prev);
  });
}

function boot() {
  applyTheme();
  matchMedia("(prefers-color-scheme: light)").addEventListener?.("change", () => { if (prefs.theme === "system") applyTheme(); });
  $("btnTheme").onclick = () => toggleTheme();
  initSheets();
  Engine.init();
  initDock();
  initConnection();
  Dashboard.init();
  Conversation.init();
  HistoryView.init();
  SettingsView.init();
  GamesView.init();
  initGlobalKeys();
  Router.init();
  Pwa.init();
  History.ready(); // runs the IndexedDB v1 → v2 upgrade early, in the background

  const missing = missingFeatures();
  if (missing) banner(errBanner(T.err[missing]));
  if (!BACKEND.ok) {
    $("conn").dataset.state = "unconfigured"; $("connText").textContent = T.conn.unconfigured;
    status.set("error", T.status.offline);
    banner(errBanner(T.err[BACKEND.code], `<br><code>config.js → API_BASE_URL</code>`));
    return;
  }
  status.set("idle");
  Net.connect();
  checkHealth();
  Voices.load();
  document.documentElement.classList.add("ready");
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
