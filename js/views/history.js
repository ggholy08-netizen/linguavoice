// History & Favourites: search (debounced), filters, favourite toggle, replay through Edge TTS,
// copy, delete, export of the filtered list to TXT / CSV.
import { $, esc, debounce, downloadText, SVG } from "../utils.js";
import { T, LANGS, langName } from "../i18n.js";
import { bus } from "../state.js";
import { prefs } from "../storage/settings.js";
import { History, toTXT, toCSV, stamp } from "../storage/history.js";
import { Engine } from "../translation/translator.js";
import { Recognition } from "../speech/recognition.js";
import { Voices } from "../voice/tts.js";
import { copyText } from "../ui/components.js";
import { toast } from "../ui/notifications.js";

let favOnly = false;
let items = [];

const fmt = (() => {
  try { const f = new Intl.DateTimeFormat("kk-KZ", { dateStyle: "short", timeStyle: "short" }); return ts => f.format(new Date(ts)); }
  catch { return ts => stamp(ts); }
})();
const kindLabel = r => r.mode === "conversation" ? T.modeConv : r.input === "text" ? T.modeText : T.modeVoice;

export const HistoryView = {
  init() {
    const refresh = debounce(() => this.render(), 200);
    $("histSearch").addEventListener("input", refresh);
    $("histType").onchange = () => this.render();
    $("histLang").onchange = () => this.render();
    $("histLang").innerHTML = `<option value="all">Барлық тіл</option>` + LANGS.map(l => `<option value="${l.code}">${esc(l.kk)}</option>`).join("");
    $("histList").addEventListener("click", e => this.onClick(e)); // one delegated handler, not one per item
    $("exportTxt").onclick = () => this.export("txt");
    $("exportCsv").onclick = () => this.export("csv");
    $("histClear").onclick = async () => {
      if (!confirm(T.confirmClear)) return;
      await History.clear(); toast(T.cleared, { type: "success" }); this.render(); bus.emit("history:changed");
    };
    bus.on("history:changed", () => { if (!document.querySelector('[data-view="history"]').hidden) this.render(); });
  },
  /** Called by the router: route "history" or "favorites". */
  show(route) {
    favOnly = route === "favorites";
    $("histTitle").textContent = favOnly ? "Таңдаулылар" : "Аударма тарихы";
    $("histClear").hidden = favOnly;
    this.render();
  },
  query() {
    return { text: $("histSearch").value.trim(), fav: favOnly, input: $("histType").value, lang: $("histLang").value };
  },
  async render() {
    try { items = await History.search(this.query()); } catch { items = []; }
    const list = $("histList");
    const q = this.query(), filtered = q.text || q.input !== "all" || q.lang !== "all";
    $("histCount").textContent = T.histCount(items.length);
    $("exportTxt").disabled = $("exportCsv").disabled = !items.length;
    if (!items.length) {
      const msg = filtered ? T.histNoMatch : favOnly ? T.favEmpty : (prefs.saveHistory ? T.histEmpty : T.histOff);
      list.innerHTML = `<p class="empty-note">${esc(msg)}</p>`;
      return;
    }
    list.innerHTML = items.map(r => `<article class="hist-item card" data-id="${esc(r.id)}">
      <div class="hist-meta"><span class="pill-tag">${esc(kindLabel(r))}</span><span>${esc(langName(r.src))} → ${esc(langName(r.tgt))}</span><span class="spacer"></span><time>${esc(fmt(r.ts))}</time></div>
      <p class="hist-src">${esc(r.source_text)}</p><p class="hist-tr">${esc(r.translated_text)}</p>
      <div class="hist-actions">
        <button data-act="play" class="chip-btn round" aria-label="${esc(T.play)}" title="${esc(T.play)}">${SVG.play}</button>
        <button data-act="csrc" class="chip-btn">${esc(T.copySrc)}</button>
        <button data-act="ctr" class="chip-btn">${esc(T.copyTr)}</button>
        <span class="spacer"></span>
        <button data-act="fav" class="icon-sm${r.fav ? " on" : ""}" aria-pressed="${!!r.fav}" aria-label="Таңдаулы" title="Таңдаулы">${SVG.star}</button>
        <button data-act="del" class="icon-sm danger" aria-label="${esc(T.del)}" title="${esc(T.del)}">${SVG.trash}</button>
      </div></article>`).join("");
  },
  async onClick(e) {
    const btn = e.target.closest("button[data-act]"); if (!btn) return;
    const card = btn.closest(".hist-item"); const r = items.find(x => x.id === card.dataset.id); if (!r) return;
    const act = btn.dataset.act;
    if (act === "play") {
      if (Recognition.active) Recognition.cancel();
      Engine.speak({ text: r.translated_text, lang: r.tgt, voice: Voices.chosen(r.tgt), tag: "history" });
    } else if (act === "csrc") copyText(r.source_text);
    else if (act === "ctr") copyText(r.translated_text);
    else if (act === "fav") {
      r.fav = r.fav ? 0 : 1;
      await History.setFav(r.id, !!r.fav);
      btn.classList.toggle("on", !!r.fav); btn.setAttribute("aria-pressed", String(!!r.fav));
      toast(r.fav ? T.favAdded : T.favRemoved, { type: "success", ms: 1800 });
      if (favOnly && !r.fav) this.render();
    } else if (act === "del") {
      await History.remove(r.id);
      card.remove(); items = items.filter(x => x.id !== r.id);
      $("histCount").textContent = T.histCount(items.length);
      toast(T.deleted, { ms: 1800 });
      if (!items.length) this.render();
    }
  },
  export(kind) {
    if (!items.length) { toast(T.nothingToExport); return; }
    const day = stamp(Date.now()).slice(0, 10);
    const name = `linguavoice-${favOnly ? "favorites" : "history"}-${day}.${kind}`;
    if (kind === "csv") downloadText(name, toCSV(items), "text/csv;charset=utf-8");
    else downloadText(name, toTXT(items, langName));
    toast(T.exported, { type: "success" });
  }
};
