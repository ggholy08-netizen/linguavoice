// PWA: service worker registration, "new version" notice, install prompt.
import { bus } from "./state.js";
import { T } from "./i18n.js";
import { toast } from "./ui/notifications.js";

let deferred = null;
let reloading = false;
let wantReload = false; // reload only after the user pressed "Жаңарту" (not on the very first install)
const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

export const Pwa = {
  init() {
    window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; bus.emit("pwa"); });
    window.addEventListener("appinstalled", () => { deferred = null; toast(T.installed, { type: "success" }); bus.emit("pwa"); });
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (!wantReload || reloading) return; reloading = true; location.reload(); });
    navigator.serviceWorker.register("./sw.js").then(reg => {
      const offer = w => toast(T.updateReady, { ms: 0, action: { label: T.updateBtn, run: () => { wantReload = true; w.postMessage({ type: "SKIP_WAITING" }); } } });
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const w = reg.installing; if (!w) return;
        w.addEventListener("statechange", () => {
          if (w.state === "installed" && navigator.serviceWorker.controller) offer(w); // an update, not the first install
        });
      });
      // look for updates when the app comes back to the foreground
      document.addEventListener("visibilitychange", () => { if (!document.hidden) reg.update().catch(() => {}); });
    }).catch(() => { /* offline or blocked: the app still works without the worker */ });
  },
  state() { return { canPrompt: !!deferred, installed: standalone(), ios: isIOS() && !standalone() }; },
  async install() {
    if (!deferred) { toast(isIOS() ? T.iosInstall : T.installUnavailable, { ms: 6000 }); return; }
    deferred.prompt();
    try { await deferred.userChoice; } catch { /* */ }
    deferred = null; bus.emit("pwa");
  }
};
