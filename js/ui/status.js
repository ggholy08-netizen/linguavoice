// The status line in the dock + the four-stage indicator (Тыңдау → Өңдеу → Аудару → Сөйлеу).
import { $ } from "../utils.js";
import { T, errText } from "../i18n.js";
import { bus } from "../state.js";
import { toast } from "./notifications.js";

const KIND = {
  idle: "idle", ready: "ready", listening: "listening", hearing: "listening", processing: "busy",
  translating: "busy", tts: "busy", waking: "busy", playing: "playing", error: "error", offline: "error"
};
const STAGE = { listening: "listening", hearing: "listening", processing: "processing", translating: "translating", tts: "translating", playing: "speaking" };

export const status = {
  kind: "idle",
  set(kind, text) {
    this.kind = kind;
    const el = $("status");
    if (el) {
      el.dataset.kind = KIND[kind] || "ready";
      $("statusText").textContent = text || T.status[kind] || "";
    }
    const stage = STAGE[kind] || null;
    document.querySelectorAll(".stages [data-stage]").forEach(s => {
      s.classList.toggle("on", s.dataset.stage === stage);
    });
    document.documentElement.dataset.activity = KIND[kind] || "ready";
    bus.emit("status", kind);
  }
};

/** Show an error: status line + toast. soft = keep the result on screen (e.g. only the voice failed). */
export function fail(code, soft = false) {
  const msg = errText(code);
  status.set("error", soft ? msg : `${T.status.error}: ${msg}`);
  toast(msg, { type: "error" });
}
