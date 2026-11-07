// Shared UI pieces: bottom sheets, the searchable language picker, theme, copy helper.
import { $, esc, isCoarse } from "../utils.js";
import { T, LANGS } from "../i18n.js";
import { prefs, savePref } from "../storage/settings.js";
import { Voices } from "../voice/tts.js";
import { toast } from "./notifications.js";
import { bus } from "../state.js";

/* ---------- sheets ---------- */
let lastFocus = null;
export function openSheet(id) {
  lastFocus = document.activeElement;
  const s = $(id); s.hidden = false;
  document.body.classList.add("sheet-open");
  const f = s.querySelector("[data-close]");
  if (f && !matchMedia("(pointer:fine)").matches) f.focus({ preventScroll: true });
}
export function closeSheet(s) {
  if (typeof s === "string") s = $(s);
  s.hidden = true;
  if (![...document.querySelectorAll(".sheet")].some(x => !x.hidden)) document.body.classList.remove("sheet-open");
  if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
}
export const anySheetOpen = () => [...document.querySelectorAll(".sheet")].some(s => !s.hidden);

export function initSheets() {
  document.querySelectorAll(".sheet").forEach(s => {
    s.addEventListener("click", e => { if (e.target === s || e.target.closest("[data-close]")) closeSheet(s); });
  });
  document.addEventListener("keydown", e => {
    if (e.key === "Escape") { const open = [...document.querySelectorAll(".sheet")].find(s => !s.hidden); if (open) closeSheet(open); }
  });
  $("langSearch").addEventListener("input", () => renderPicker());
}

/* ---------- language picker ---------- */
let picker = null; // { kind, title, current, allowAuto, needsVoice, onPick }

/** opts: { title, current, allowAuto, needsVoice, onPick(code) } */
export function pickLanguage(opts) {
  picker = opts;
  $("langSheetTitle").textContent = opts.title;
  $("langSearch").value = "";
  renderPicker();
  openSheet("langSheet");
  if (matchMedia("(pointer:fine)").matches) setTimeout(() => $("langSearch").focus(), 50);
}
function renderPicker() {
  if (!picker) return;
  const q = $("langSearch").value.trim().toLowerCase();
  let items = LANGS.slice();
  if (picker.needsVoice) items = items.filter(l => Voices.hasVoice(l.code)); // spoken output needs an Edge TTS voice
  if (picker.allowAuto) items.unshift({ code: "auto", kk: T.auto, native: "Auto" });
  if (q) items = items.filter(l => (l.kk + " " + l.native + " " + l.code).toLowerCase().includes(q));
  const ul = $("langList");
  ul.innerHTML = items.length ? items.map(l => `<li><button role="option" data-code="${l.code}" aria-selected="${l.code === picker.current}">
    <span class="code">${l.code === "auto" ? "✦" : esc(l.code)}</span><span class="nm"><b>${esc(l.kk)}</b><small>${esc(l.native)}</small></span>
    ${l.code === picker.current ? '<span class="tick">✓</span>' : ""}</button></li>`).join("") : `<li class="empty-note">${esc(T.noLang)}</li>`;
  ul.querySelectorAll("button").forEach(b => b.onclick = () => { const p = picker; closeSheet("langSheet"); p.onPick(b.dataset.code); });
}

/* ---------- theme ---------- */
export function isDark() {
  const t = prefs.theme;
  if (t === "system") return !matchMedia("(prefers-color-scheme: light)").matches;
  return t ? t === "dark" : true; // dark by default
}
export function applyTheme() {
  document.documentElement.dataset.theme = isDark() ? "dark" : "light";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = isDark() ? "#0A0B14" : "#F4F5FB";
  bus.emit("theme");
}
export function toggleTheme() { savePref("theme", isDark() ? "light" : "dark"); applyTheme(); }

/* ---------- clipboard ---------- */
export async function copyText(text) {
  if (!text) return;
  try { await navigator.clipboard.writeText(text); toast(T.copied, { type: "success", ms: 1800 }); }
  catch {
    try {
      const ta = document.createElement("textarea"); ta.value = text; ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;opacity:0;top:0"; document.body.appendChild(ta); ta.select();
      const ok = document.execCommand("copy"); ta.remove();
      toast(ok ? T.copied : T.err.clipboard, { type: ok ? "success" : "error" });
    } catch { toast(T.err.clipboard, { type: "error" }); }
  }
}

export function blurOnPhone(el) { if (isCoarse()) el.blur(); }
