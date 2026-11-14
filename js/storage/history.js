// Translation history in IndexedDB, version 2.
// Migration: v1 records ({id, ts, mode, speaker, src, tgt, source_text, translated_text}) are kept
// and upgraded in place (fav: 0, input: "voice"). Nothing is deleted during the upgrade.
import { CONFIG } from "../utils.js";
import { store } from "./settings.js";

const DB_NAME = "linguavoice";
const DB_VERSION = 2;
const STORE = "history";

let dbp = null;
let mem = null; // fallback when IndexedDB is unavailable (private mode in some browsers)

function upgradeRecord(r) {
  if (r.fav === undefined) r.fav = 0;
  if (!r.input) r.input = "voice";
  if (!r.mode) r.mode = "translate";
  return r;
}

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) return reject(new Error("no idb"));
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = req.result, tx = req.transaction;
      let st;
      if (e.oldVersion < 1) {
        st = db.createObjectStore(STORE, { keyPath: "id" });
        st.createIndex("ts", "ts");
      } else st = tx.objectStore(STORE);
      if (e.oldVersion < 2) {
        if (!st.indexNames.contains("fav")) st.createIndex("fav", "fav");
        // upgrade every existing v1 record in place
        const cur = st.openCursor();
        cur.onsuccess = () => {
          const c = cur.result;
          if (!c) return;
          c.update(upgradeRecord({ ...c.value }));
          c.continue();
        };
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error("blocked"));
  }).catch(() => {
    mem = (store.get("historyFallback", []) || []).map(upgradeRecord);
    return null;
  });
  return dbp;
}

const tx = (d, mode, fn) => new Promise((res, rej) => {
  const t = d.transaction(STORE, mode); const s = t.objectStore(STORE); const out = fn(s);
  t.oncomplete = () => res(out && out.result !== undefined ? out.result : undefined);
  t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
});
const saveMem = () => store.set("historyFallback", mem);

async function prune(d) {
  const all = await History.list();
  const limit = CONFIG.HISTORY_LIMIT;
  if (all.length <= limit) return;
  const keepPlain = Math.max(0, limit - all.filter(x => x.fav).length);
  const extra = all.filter(x => !x.fav).slice(keepPlain);
  if (!extra.length) return;
  if (!d) { const ids = new Set(extra.map(x => x.id)); mem = mem.filter(x => !ids.has(x.id)); saveMem(); return; }
  await tx(d, "readwrite", s => extra.forEach(x => s.delete(x.id)));
}

export const History = {
  ready: open,
  async put(item) {
    const rec = upgradeRecord({ ...item });
    const d = await open();
    if (!d) { mem = [rec, ...mem.filter(x => x.id !== rec.id)]; saveMem(); }
    else await tx(d, "readwrite", s => s.put(rec));
    await prune(d);
    return rec;
  },
  async get(id) {
    const d = await open();
    if (!d) return mem.find(x => x.id === id) || null;
    return (await tx(d, "readonly", s => s.get(id))) || null;
  },
  async list() {
    const d = await open();
    if (!d) return mem.slice().sort((a, b) => b.ts - a.ts);
    const all = await tx(d, "readonly", s => s.getAll());
    return (all || []).map(upgradeRecord).sort((a, b) => b.ts - a.ts);
  },
  /** query: { text, fav, input: "voice"|"text"|"conversation"|"all", lang } */
  async search(q = {}) {
    const words = (q.text || "").toLowerCase().split(/\s+/).filter(Boolean);
    return (await this.list()).filter(r => {
      if (q.fav && !r.fav) return false;
      if (q.input && q.input !== "all") {
        const kind = r.mode === "conversation" ? "conversation" : r.input;
        if (kind !== q.input) return false;
      }
      if (q.lang && q.lang !== "all" && r.src !== q.lang && r.tgt !== q.lang) return false;
      if (words.length) {
        const hay = `${r.source_text} ${r.translated_text}`.toLowerCase();
        if (!words.every(w => hay.includes(w))) return false;
      }
      return true;
    });
  },
  /** Set favourite on an existing record, or create it (fallbackRecord) if history was off. */
  async setFav(id, fav, fallbackRecord) {
    const cur = await this.get(id);
    const rec = cur || (fallbackRecord ? { ...fallbackRecord, id } : null);
    if (!rec) return null;
    rec.fav = fav ? 1 : 0;
    return this.put(rec);
  },
  async remove(id) {
    const d = await open();
    if (!d) { mem = mem.filter(x => x.id !== id); saveMem(); return; }
    await tx(d, "readwrite", s => s.delete(id));
  },
  async clear() {
    const d = await open();
    if (!d) { mem = []; saveMem(); return; }
    await tx(d, "readwrite", s => s.clear());
  }
};

/* ---------- export ---------- */
const pad = n => String(n).padStart(2, "0");
export const stamp = ts => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const kindOf = r => r.mode === "conversation" ? "conversation" : r.input === "text" ? "text" : "voice";

export function toTXT(items, langName) {
  return items.map(r => `[${stamp(r.ts)}] ${langName(r.src)} → ${langName(r.tgt)}${r.fav ? " ★" : ""}\n${r.source_text}\n${r.translated_text}\n`).join("\n");
}

export function toCSV(items) {
  const q = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const rows = [["date", "type", "source_lang", "target_lang", "source_text", "translated_text", "favorite"]];
  for (const r of items) rows.push([stamp(r.ts), kindOf(r), r.src, r.tgt, r.source_text, r.translated_text, r.fav ? "yes" : "no"]);
  // BOM so Excel opens Cyrillic/Kazakh text correctly; CRLF line endings per RFC 4180
  return "﻿" + rows.map(row => row.map(q).join(",")).join("\r\n");
}
