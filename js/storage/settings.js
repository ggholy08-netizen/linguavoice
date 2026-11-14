// User preferences in localStorage. Keys are the same as in version 1 ("lv.*"),
// so settings chosen before the update are kept.
import { CONFIG } from "../utils.js";
import { bus } from "../state.js";

const PREFIX = "lv.";

export const store = {
  get(k, d) { try { const v = localStorage.getItem(PREFIX + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch { /* private mode / storage full */ } },
  clearAll() {
    try { Object.keys(localStorage).filter(k => k.startsWith(PREFIX)).forEach(k => localStorage.removeItem(k)); } catch { /* */ }
  }
};

const DEFAULTS = {
  theme: null,            // null = follow the system, "dark" | "light"
  src: "auto",            // "auto" = AUTO LANGUAGE on
  manualSrc: "kk",        // source used when AUTO LANGUAGE is switched off
  tgt: "en",
  convA: "kk",
  convB: "en",
  voices: {},             // per-language voice choice
  voiceGender: "all",     // all | female | male
  rate: 0,
  volume: 0,
  silenceMs: CONFIG.DEFAULT_SILENCE_MS,
  autoplay: true,
  saveHistory: true,
  metrics: false,
  route: "translate"
};

export const prefs = Object.fromEntries(Object.entries(DEFAULTS).map(([k, d]) => [k, store.get(k, d)]));

export function savePref(k, v) {
  prefs[k] = v;
  store.set(k, v);
  bus.emit("pref", k, v);
}

export function resetPrefs() {
  store.clearAll();
  Object.assign(prefs, structuredClone(DEFAULTS));
}
