// Toast notifications (stacked, with optional action button) and the top banner.
import { $, esc } from "../utils.js";

const MAX_TOASTS = 3;

/**
 * toast("text") | toast("text", { type: "error"|"success"|"info", ms, action: { label, run } })
 * Returns a function that dismisses the toast.
 */
export function toast(msg, opts = {}) {
  if (typeof opts === "boolean") opts = { type: opts ? "error" : "info" };
  const box = $("toasts");
  if (!box) return () => {};
  // the same message twice in a row: refresh instead of stacking
  const dup = [...box.children].find(t => t.dataset.msg === msg);
  if (dup) dup.remove();
  while (box.children.length >= MAX_TOASTS) box.firstElementChild.remove();
  const el = document.createElement("div");
  el.className = `toast ${opts.type || "info"}`;
  el.dataset.msg = msg;
  el.setAttribute("role", opts.type === "error" ? "alert" : "status");
  el.innerHTML = `<span class="toast-msg">${esc(msg)}</span>` +
    (opts.action ? `<button class="toast-act">${esc(opts.action.label)}</button>` : "") +
    `<button class="toast-x" aria-label="Жабу">×</button>`;
  const close = () => { el.classList.add("out"); setTimeout(() => el.remove(), 200); };
  el.querySelector(".toast-x").onclick = close;
  if (opts.action) el.querySelector(".toast-act").onclick = () => { close(); opts.action.run(); };
  box.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  const ms = opts.ms ?? (opts.type === "error" ? 5200 : 3000);
  if (ms > 0) setTimeout(close, ms);
  return close;
}

let bannerKind = null;
export function banner(html, kind) {
  const b = $("banner");
  if (!b) return;
  if (!html) { b.hidden = true; bannerKind = null; return; }
  $("bannerText").innerHTML = html; b.hidden = false; bannerKind = kind || "other";
}
export const bannerIs = kind => bannerKind === kind;
