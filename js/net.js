// Backend address, HTTP helper with timeout/cancel, and the persistent WebSocket.
import { CONFIG, AppError, now } from "./utils.js";
import { bus } from "./state.js";

function backendConfig() {
  const raw = String(CONFIG.API_BASE_URL || "").trim().replace(/\/+$/, "");
  if (!raw || /YOUR-BACKEND|example$|example\//i.test(raw)) return { ok: false, code: "config_missing", raw };
  let u; try { u = new URL(raw); } catch { return { ok: false, code: "config_invalid", raw }; }
  if (!/^https?:$/.test(u.protocol)) return { ok: false, code: "config_invalid", raw };
  if (location.protocol === "https:" && u.protocol === "http:") return { ok: false, code: "mixed_content", raw };
  const base = (u.origin + u.pathname).replace(/\/+$/, "");
  return { ok: true, base, ws: base.replace(/^http/, "ws") + "/ws", raw };
}

export const BACKEND = backendConfig();
export const api = path => BACKEND.base + path;

export async function fetchTimeout(url, opts = {}, ms = CONFIG.REQUEST_TIMEOUT_MS) {
  const ctl = new AbortController();
  const outer = opts.signal;
  const onAbort = () => ctl.abort();
  if (outer) { if (outer.aborted) ctl.abort(); else outer.addEventListener("abort", onAbort, { once: true }); }
  const timer = setTimeout(() => ctl.abort("timeout"), ms);
  try { return await fetch(url, { ...opts, signal: ctl.signal, cache: "no-store" }); }
  catch {
    if (outer && outer.aborted) throw new AppError("cancelled");
    if (ctl.signal.aborted) throw new AppError("timeout");
    throw new AppError(navigator.onLine === false ? "no_internet" : "backend_unreachable");
  } finally { clearTimeout(timer); if (outer) outer.removeEventListener("abort", onAbort); }
}

/** POST JSON and return parsed JSON, or throw AppError(code from the server). */
export async function postJSON(path, body, signal, ms) {
  const r = await fetchTimeout(api(path), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal
  }, ms);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new AppError((j.error && j.error.code) || (r.status === 404 ? "bad_request" : "translate_failed"));
  return j;
}

export function unpackFrame(ab) {
  const dv = new DataView(ab); const hl = dv.getUint32(0, false);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(ab, 4, hl)));
  return { header, payload: ab.slice(4 + hl) };
}

/** Persistent WebSocket: one TLS connection reused for every request; auto-reconnect with backoff. */
export const Net = {
  ws: null, state: "off", backoff: 800, retryTimer: 0, pingTimer: 0, model: null, geminiOk: true,
  setConn(state) { this.state = state; bus.emit("conn", state); },
  connect() {
    if (!BACKEND.ok) return;
    if (this.ws && (this.ws.readyState === 0 || this.ws.readyState === 1)) return;
    clearTimeout(this.retryTimer);
    this.setConn("connecting");
    let ws;
    try { ws = new WebSocket(BACKEND.ws); } catch { this.scheduleRetry(); return; }
    ws.binaryType = "arraybuffer";
    this.ws = ws;
    ws.onopen = () => {
      this.backoff = 800; this.setConn("online");
      clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => this.send({ type: "ping", t: Date.now() }), 25000);
    };
    ws.onmessage = ev => {
      if (typeof ev.data === "string") {
        let m; try { m = JSON.parse(ev.data); } catch { return; }
        if (m.type === "ready") { this.model = m.model; this.geminiOk = !!m.gemini_configured; bus.emit("server:ready", m); }
        bus.emit("ws:json", m);
      } else bus.emit("ws:binary", ev.data);
    };
    ws.onclose = () => {
      clearInterval(this.pingTimer);
      if (this.ws !== ws) return;
      this.ws = null; this.setConn("offline");
      bus.emit("ws:lost");
      if (document.visibilityState === "visible") this.scheduleRetry();
    };
    ws.onerror = () => { /* onclose follows */ };
  },
  scheduleRetry() {
    clearTimeout(this.retryTimer);
    this.retryTimer = setTimeout(() => this.connect(), this.backoff);
    this.backoff = Math.min(this.backoff * 2, 15000);
  },
  get open() { return !!this.ws && this.ws.readyState === 1; },
  async waitOpen(ms) {
    if (this.open) return true;
    this.connect();
    const t0 = now();
    while (now() - t0 < ms) { await new Promise(r => setTimeout(r, 60)); if (this.open) return true; }
    return false;
  },
  send(obj) { if (this.open) { this.ws.send(JSON.stringify(obj)); return true; } return false; },
  sendFrame(header, payload) {
    if (!this.open) return false;
    const h = new TextEncoder().encode(JSON.stringify(header));
    const buf = new Uint8Array(4 + h.length + payload.byteLength);
    new DataView(buf.buffer).setUint32(0, h.length, false);
    buf.set(h, 4); buf.set(new Uint8Array(payload), 4 + h.length);
    this.ws.send(buf.buffer); return true;
  }
};
