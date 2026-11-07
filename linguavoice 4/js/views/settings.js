// Settings screen: endpointing, playback, history, theme, app install, server info, privacy, data wipe.
import { $, APP_VERSION } from "../utils.js";
import { T } from "../i18n.js";
import { bus } from "../state.js";
import { prefs, savePref, resetPrefs } from "../storage/settings.js";
import { History } from "../storage/history.js";
import { BACKEND, Net } from "../net.js";
import { applyTheme } from "../ui/components.js";
import { toast } from "../ui/notifications.js";
import { Pwa } from "../pwa.js";

export const SettingsView = {
  init() {
    $("silenceRange").value = prefs.silenceMs; $("silenceOut").textContent = T.ms(prefs.silenceMs);
    $("silenceRange").oninput = e => { const v = +e.target.value; $("silenceOut").textContent = T.ms(v); savePref("silenceMs", v); };
    $("optAutoplay").checked = prefs.autoplay; $("optAutoplay").onchange = e => savePref("autoplay", e.target.checked);
    $("optHistory").checked = prefs.saveHistory; $("optHistory").onchange = e => savePref("saveHistory", e.target.checked);
    $("optMetrics").checked = prefs.metrics; $("optMetrics").onchange = e => savePref("metrics", e.target.checked);
    $("themeSel").value = prefs.theme || "dark";
    $("themeSel").onchange = e => { savePref("theme", e.target.value); applyTheme(); };
    bus.on("theme", () => { $("themeSel").value = prefs.theme || "dark"; });

    $("appVersion").textContent = APP_VERSION;
    $("infoUrl").textContent = BACKEND.ok ? BACKEND.base : (BACKEND.raw || "—");
    bus.on("conn", s => { $("infoState").textContent = T.conn[s] || s; });
    bus.on("server:ready", m => { $("infoModel").textContent = m.model || "—"; });

    $("installBtn").onclick = () => Pwa.install();
    bus.on("pwa", () => this.renderInstall());
    this.renderInstall();

    $("wipeData").onclick = async () => {
      if (!confirm(T.confirmWipe)) return;
      try { await History.clear(); } catch { /* */ }
      resetPrefs();
      toast(T.wiped, { type: "success" });
      setTimeout(() => location.reload(), 700);
    };
    if (!Net.state || Net.state === "off") $("infoState").textContent = BACKEND.ok ? T.conn.connecting : T.conn.unconfigured;
  },
  renderInstall() {
    const st = Pwa.state();
    $("installBtn").hidden = !st.canPrompt;
    $("installNote").textContent = st.installed ? T.installed : st.ios ? T.iosInstall : st.canPrompt ? "" : T.installUnavailable;
  }
};
