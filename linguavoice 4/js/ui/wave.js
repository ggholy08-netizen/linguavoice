// Animated sound wave in the dock. Real microphone level while listening, a soft pulse while
// the translation is spoken, a travelling shimmer while processing. The animation loop stops
// completely when idle (no wasted CPU / battery).
import { bus } from "../state.js";

const BARS = 36;

export function createWave(canvas) {
  const ctx = canvas.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let mode = "idle", level = 0, smooth = 0, raf = 0, t0 = performance.now();
  const heights = new Float32Array(BARS);
  let colors = ["#5B7CFF", "#9A6BFF"];

  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    colors = [cs.getPropertyValue("--blue").trim() || "#5B7CFF", cs.getPropertyValue("--violet").trim() || "#9A6BFF"];
  }
  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw(performance.now());
  }
  function target(i, t) {
    const x = i / (BARS - 1), center = 1 - Math.abs(x - 0.5) * 1.5;
    if (mode === "listening") {
      const n = 0.55 + 0.45 * Math.sin(t / 120 + i * 1.7) * Math.sin(t / 310 + i * 0.6);
      return Math.max(0.06, smooth * (0.35 + 0.9 * center) * n);
    }
    if (mode === "playing") return 0.18 + 0.32 * center * (0.6 + 0.4 * Math.sin(t / 170 + i * 0.55));
    if (mode === "busy") { const p = (t / 900) % 1; const d = Math.abs(x - p); return 0.06 + 0.22 * Math.max(0, 1 - d * 6); }
    return 0.05;
  }
  function draw(t) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    ctx.clearRect(0, 0, w, h);
    const gap = 3, bw = Math.max(2, (w - gap * (BARS - 1)) / BARS);
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, colors[0]); grad.addColorStop(1, colors[1]);
    ctx.fillStyle = grad;
    for (let i = 0; i < BARS; i++) {
      heights[i] += (target(i, t) - heights[i]) * (reduce ? 1 : 0.22);
      const bh = Math.max(3, heights[i] * h);
      const x = i * (bw + gap), y = (h - bh) / 2;
      const r = Math.min(bw / 2, 3);
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, bw, bh, r); else ctx.rect(x, y, bw, bh);
      ctx.fill();
    }
  }
  function loop(t) {
    smooth += (level - smooth) * 0.3;
    draw(t - t0);
    const still = mode === "idle" && heights.every(v => Math.abs(v - 0.05) < 0.005);
    raf = still ? 0 : requestAnimationFrame(loop);
  }
  function kick() { if (!raf) raf = requestAnimationFrame(loop); }
  function setMode(m) { if (m === mode) return; mode = m; if (reduce && m !== "listening") { draw(performance.now()); return; } kick(); }

  readColors(); resize();
  const ro = "ResizeObserver" in window ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(canvas); else window.addEventListener("resize", resize);

  const offs = [
    bus.on("status", kind => {
      const k = { listening: "listening", hearing: "listening", processing: "busy", translating: "busy", tts: "busy", waking: "busy", playing: "playing" }[kind];
      setMode(k || "idle");
    }),
    bus.on("rec:level", (_rc, lv) => { level = lv; if (mode === "listening") kick(); }),
    bus.on("theme", () => { readColors(); draw(performance.now()); })
  ];
  document.addEventListener("visibilitychange", () => { if (document.hidden && raf) { cancelAnimationFrame(raf); raf = 0; } else if (!document.hidden) kick(); });

  return { destroy() { offs.forEach(f => f()); if (ro) ro.disconnect(); if (raf) cancelAnimationFrame(raf); } };
}
