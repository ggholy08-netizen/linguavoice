// Toast notifications (stacked, with optional action button) and the top banner.
import { $, esc, reduceMotion } from "../utils.js";

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
  const before = positions(box);
  const el = document.createElement("div");
  el.className = `toast ${opts.type || "info"}`;
  el.dataset.msg = msg;
  el.setAttribute("role", opts.type === "error" ? "alert" : "status");
  el.innerHTML = `<span class="toast-msg">${esc(msg)}</span>` +
    (opts.action ? `<button class="toast-act">${esc(opts.action.label)}</button>` : "") +
    `<button class="toast-x" aria-label="Жабу">×</button>`;
  let closed = false;
  const close = () => {
    if (closed) return; closed = true;
    el.classList.add("out");
    setTimeout(() => { const pos = positions(box); el.remove(); glide(box, pos); }, 180);
  };
  el.querySelector(".toast-x").onclick = close;
  if (opts.action) el.querySelector(".toast-act").onclick = () => { close(); opts.action.run(); };
  box.appendChild(el);
  glide(box, before);
  void el.offsetWidth; // the browser must see the start state first, or the toast appears without its animation
  el.classList.add("show");
  const ms = opts.ms ?? (opts.type === "error" ? 5200 : 3000);
  if (ms > 0) setTimeout(close, ms);
  return close;
}

/* FLIP: remember where the toasts are, change the list, then let them slide to their new places */
function positions(box) { return new Map([...box.children].map(t => [t, t.getBoundingClientRect().top])); }
function glide(box, before) {
  if (reduceMotion()) return;
  for (const t of box.children) {
    const was = before.get(t); if (was === undefined || !t.animate) continue;
    const dy = was - t.getBoundingClientRect().top;
    if (Math.abs(dy) > 1) t.animate([{ translate: `0 ${dy}px` }, { translate: "0 0" }], { duration: 260, easing: "cubic-bezier(.22,.8,.26,1)" });
  }
}

let bannerKind = null;
export function banner(html, kind) {
  const b = $("banner");
  if (!b) return;
  if (!html) { b.hidden = true; bannerKind = null; return; }
  $("bannerText").innerHTML = html; b.hidden = false; bannerKind = kind || "other";
}
export const bannerIs = kind => bannerKind === kind;
