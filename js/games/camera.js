// 12. AI камера — take a photo; Gemini names the things it can see in the language you are learning.
// Then a short quiz on those words. The photo goes to Gemini through the backend and is not stored anywhere.
import { esc, uid, AppError } from "../utils.js";
import { Voices } from "../voice/tts.js";
import { BACKEND } from "../net.js";
import { History } from "../storage/history.js";
import { toast } from "../ui/notifications.js";
import { pop } from "../ui/components.js";
import { frame, showResult, say, Pair, ICON, G, gameErr, postForm, langStem } from "./core.js";
import { shuffle } from "./content.js";
import { matchAnswer } from "./text-diff.js";

const MAX_SIDE = 1024;   // the photo is shrunk on the phone before upload: faster, cheaper, less data
const JPEG_Q = 0.82;

const SVG_SWITCH = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 15.5-6.2L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.2L3 16"/><path d="M3 21v-5h5"/></svg>';
const SVG_X = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
const SVG_STAR = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.9 6.6 19.8l1.1-6.1L3.2 9.4l6.1-.8z"/></svg>';

const CAM_ERR = {
  cam_denied: "Камераға рұқсат берілмеді. Браузер баптауларында рұқсат беріңіз немесе дайын фотоны таңдаңыз.",
  cam_missing: "Бұл құрылғыда камера табылмады. Дайын фотоны таңдаңыз.",
  cam_failed: "Камераны қосу мүмкін болмады. Дайын фотоны таңдап көріңіз.",
  bad_image: "Бұл файл сурет емес немесе пішімі қолдау көрсетілмейді (JPEG, PNG, WebP).",
  image_too_large: "Сурет тым үлкен.",
  no_objects: "Gemini суреттен таныс зат таба алмады. Жарық жерде, затқа жақынырақ түсіріп көріңіз."
};
const err = code => CAM_ERR[code] || gameErr(code);

/** Draw any image source onto a canvas no larger than MAX_SIDE and return a JPEG blob. */
function toJpeg(src, w, h) {
  const k = Math.min(1, MAX_SIDE / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
  c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new AppError("bad_image"))), "image/jpeg", JPEG_Q));
}
async function fileToJpeg(file) {
  if (!/^image\//.test(file.type || "")) throw new AppError("bad_image");
  try {
    if (window.createImageBitmap) {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      try { return await toJpeg(bmp, bmp.width, bmp.height); } finally { bmp.close && bmp.close(); }
    }
  } catch { /* fall back to <img> below */ }
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new AppError("bad_image")); i.src = url; });
    return await toJpeg(img, img.naturalWidth, img.naturalHeight);
  } finally { URL.revokeObjectURL(url); }
}

export default {
  id: "camera", emoji: "📷", title: "AI камера", group: "vocab",
  desc: "Затты суретке түсіріңіз — Gemini атауын айтады, сосын шағын тест.", needs: ["cam", "server"],

  run(root, s) {
    const ui = frame(root, this);
    if (!BACKEND.ok) { ui.stage.innerHTML = `<div class="g-error"><p>${esc(gameErr(BACKEND.code))}</p></div>`; return; }
    const ctx = { root, s, ui, st: ui.stage, p: Pair.get(), stream: null, urls: [], facing: "environment" };
    const stop = () => { if (ctx.stream) { ctx.stream.getTracks().forEach(t => t.stop()); ctx.stream = null; } };
    ctx.stop = stop;
    s.onEnd(() => { stop(); ctx.urls.forEach(u => URL.revokeObjectURL(u)); ctx.urls = []; });
    // never leave the camera running in a hidden tab
    const onHide = () => { if (document.hidden && ctx.stream) { stop(); this.intro(ctx); } };
    document.addEventListener("visibilitychange", onHide);
    s.onEnd(() => document.removeEventListener("visibilitychange", onHide));
    this.intro(ctx);
  },

  intro(ctx, problem) {
    const { st, s, p } = ctx;
    ctx.stop();
    const canCam = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
    st.innerHTML = `
      <div class="cam-intro">
        <span class="g-emo" aria-hidden="true">📷</span>
        <p><b>Айналаңыздағы заттарды түсіріңіз.</b><br>Gemini суреттегі заттардың атын ${esc(langStem(p.learn))} тілінде жазып береді, сосын сол сөздерден шағын тест болады.</p>
        ${problem ? `<p class="g-error-line" role="alert" style="color:var(--danger)">${esc(err(problem))}</p>` : ""}
        <div class="g-actions">
          ${canCam ? `<button class="btn primary" id="camStart">📷 Камераны қосу</button>` : ""}
          <button class="btn${canCam ? "" : " primary"}" id="camPick">🖼 Фото таңдау</button>
        </div>
        <input type="file" id="camFile" accept="image/jpeg,image/png,image/webp,image/*" hidden>
        <p class="cam-privacy">🔒 Фото тексеру үшін сервер арқылы Google Gemini-ге жіберіледі. Ол серверде де, осы құрылғыда да сақталмайды. Адамдардың бетін, құжаттарды, банк карталарын және басқа құпия мәліметтерді түсірмеңіз. Тегін Gemini тарифінде Google жіберілген деректерді өз өнімдерін жақсартуға пайдалана алады.</p>
      </div>`;
    const file = st.querySelector("#camFile");
    st.querySelector("#camPick").onclick = () => file.click();
    file.onchange = async () => {
      const f = file.files && file.files[0]; file.value = "";
      if (!f) return;
      try { const blob = await fileToJpeg(f); if (s.alive()) this.analyze(ctx, blob); }
      catch (e) { if (s.alive()) this.intro(ctx, e.code || "bad_image"); }
    };
    const start = st.querySelector("#camStart");
    if (start) start.onclick = () => this.live(ctx);
  },

  async live(ctx) {
    const { st, s } = ctx;
    ctx.stop();
    st.innerHTML = `
      <div class="cam-box${ctx.facing === "user" ? " mirror" : ""}" id="camBox">
        <video id="camVideo" autoplay playsinline muted></video>
        <div class="cam-flash" id="camFlash"></div>
        <div class="cam-ui">
          <button class="cam-btn" id="camSwitch" aria-label="Камераны ауыстыру" hidden>${SVG_SWITCH}</button>
          <button class="cam-shutter" id="camShot" aria-label="Суретке түсіру" disabled></button>
          <button class="cam-btn" id="camClose" aria-label="Камераны жабу">${SVG_X}</button>
        </div>
      </div>
      <p class="g-micnote">Затты кадрдың ортасына келтіріп, дөңгелек түймені басыңыз.</p>`;
    st.querySelector("#camClose").onclick = () => this.intro(ctx);
    const video = st.querySelector("#camVideo"), shot = st.querySelector("#camShot");
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: ctx.facing }, width: { ideal: 1280 }, height: { ideal: 960 } } });
    } catch (e) {
      if (!s.alive()) return;
      const code = e && (e.name === "NotAllowedError" || e.name === "SecurityError") ? "cam_denied"
        : e && (e.name === "NotFoundError" || e.name === "OverconstrainedError") ? "cam_missing" : "cam_failed";
      return this.intro(ctx, code);
    }
    // the player may have left the game or closed the camera while the permission prompt was open
    if (!s.alive() || !video.isConnected) { stream.getTracks().forEach(t => t.stop()); return; }
    ctx.stream = stream;
    video.srcObject = stream;
    video.play().catch(() => {});
    const ready = () => { if (video.videoWidth) shot.disabled = false; };
    video.addEventListener("loadedmetadata", ready); video.addEventListener("playing", ready); ready();
    try {
      const cams = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "videoinput");
      const sw = st.querySelector("#camSwitch");
      if (sw && cams.length > 1) { sw.hidden = false; sw.onclick = () => { ctx.facing = ctx.facing === "user" ? "environment" : "user"; this.live(ctx); }; }
    } catch { /* the switch button simply stays hidden */ }
    shot.onclick = async () => {
      if (!video.videoWidth) return;
      shot.disabled = true;
      const flash = st.querySelector("#camFlash"); flash.classList.remove("go"); void flash.offsetWidth; flash.classList.add("go");
      try {
        const blob = await toJpeg(video, video.videoWidth, video.videoHeight);
        ctx.stop();
        if (s.alive()) this.analyze(ctx, blob);
      } catch { if (s.alive()) this.intro(ctx, "cam_failed"); }
    };
  },

  async analyze(ctx, blob) {
    const { st, s, p } = ctx;
    ctx.stop();
    const url = URL.createObjectURL(blob); ctx.urls.push(url);
    st.innerHTML = `
      <div class="cam-box"><img src="${url}" alt="Түсірілген фото"><div class="cam-scan" role="status">Gemini суретті қарап жатыр…</div></div>`;
    try {
      const fd = new FormData();
      fd.append("image", blob, "photo.jpg");
      fd.append("meta", JSON.stringify({ know: p.know, learn: p.learn, level: p.level }));
      const j = await postForm("/api/game/vision", fd, s.signal, 60000);
      if (!s.alive()) return;
      const objects = Array.isArray(j.objects) ? j.objects.filter(o => o && o.word && o.translation) : [];
      if (!objects.length) throw new AppError("no_objects");
      this.learn(ctx, objects, url);
    } catch (e) {
      if (!s.alive() || e.code === "cancelled") return;
      st.innerHTML = `
        <img class="cam-thumb" src="${url}" alt="Түсірілген фото">
        <div class="g-error" role="alert" style="min-height:0"><p>${esc(err(e.code))}</p></div>
        <div class="g-actions"><button class="btn primary" id="camRetry">${esc(G.retry)}</button><button class="btn" id="camNew">Басқа фото</button></div>`;
      st.querySelector("#camRetry").onclick = () => this.analyze(ctx, blob);
      st.querySelector("#camNew").onclick = () => this.intro(ctx);
    }
  },

  learn(ctx, objects, url) {
    const { st, p } = ctx;
    const speak = BACKEND.ok && Voices.hasVoice(p.learn);
    st.innerHTML = `
      <img class="cam-thumb" src="${url}" alt="Түсірілген фото">
      <p class="g-label">Gemini көрген заттар · ${objects.length}</p>
      <ul class="cam-list" lang="${p.learn}">${objects.map((o, k) => `
        <li class="cam-item" style="--i:${k}">
          <b lang="${p.learn}">${esc(o.word)}</b>
          <span class="tr" lang="${p.know}">${esc(o.translation)}</span>
          <span class="acts">
            ${speak ? `<button class="icon-sm" data-say="${k}" aria-label="Тыңдау" title="Тыңдау">${ICON.play}</button>` : ""}
            <button class="icon-sm" data-fav="${k}" aria-pressed="false" aria-label="Карточкаларға қосу" title="Карточкаларға қосу">${SVG_STAR}</button>
          </span>
          ${o.example ? `<p class="ex"><span lang="${p.learn}">${esc(o.example)}</span>${o.example_translation ? `<small lang="${p.know}">${esc(o.example_translation)}</small>` : ""}</p>` : ""}
        </li>`).join("")}</ul>
      <p class="g-note">Атауларды Gemini суретке қарап береді. Кейде қателесуі мүмкін — күмәнданған сөзді сөздіктен тексеріңіз.</p>
      <div class="g-actions">
        <button class="btn primary" id="camQuiz">Тест бастау</button>
        <button class="btn" id="camMore">📷 Тағы фото</button>
      </div>`;
    st.querySelectorAll("[data-say]").forEach(b => b.onclick = () => say(objects[+b.dataset.say].word, p.learn));
    st.querySelectorAll("[data-fav]").forEach(b => b.onclick = async () => {
      const o = objects[+b.dataset.fav];
      if (b.classList.contains("on")) return;
      try {
        // saved as a favourite, so it turns up in «Карточкалар»
        await History.setFav(uid(), true, { ts: Date.now(), mode: "translate", input: "text", speaker: null,
          src: p.know, tgt: p.learn, source_text: o.translation, translated_text: o.word, fav: 1 });
        b.classList.add("on"); b.setAttribute("aria-pressed", "true"); pop(b);
        toast("Карточкаларға қосылды", { type: "success", ms: 1800 });
      } catch { toast("Сақтау мүмкін болмады", { type: "error" }); }
    });
    st.querySelector("#camMore").onclick = () => this.intro(ctx);
    st.querySelector("#camQuiz").onclick = () => this.quiz(ctx, objects, url);
  },

  quiz(ctx, objects, url) {
    const { st, ui, root, s, p } = ctx;
    const order = shuffle(objects);
    const choice = objects.length >= 3; // with fewer words there is nothing to choose from: type the word instead
    let i = 0, score = 0, correct = 0;
    const review = [];
    const next = ok => { review.push({ q: order[i].translation, a: order[i].word, ok }); i++; ctx.s.later(show, ok ? 800 : 1700); };
    const show = () => {
      if (i >= order.length) return end();
      ui.setStep(i, order.length);
      const o = order[i];
      const head = `<div class="g-prompt"><p class="g-label">${esc(langStem(p.learn))} тілінде қалай?</p><p class="g-word mid" lang="${p.know}">${esc(o.translation)}</p></div>`;
      if (choice) {
        const opts = shuffle([o.word, ...shuffle(objects.filter(x => x !== o).map(x => x.word)).slice(0, 3)]);
        st.innerHTML = `${head}
          <div class="race-opts" lang="${p.learn}">${opts.map((w, k) => `<button class="opt" data-v="${esc(w)}"><kbd>${k + 1}</kbd><span>${esc(w)}</span></button>`).join("")}</div>
          <p class="g-feedback" id="cqFb" aria-live="polite"></p>`;
        st.querySelectorAll(".opt").forEach(b => b.onclick = () => {
          const ok = b.dataset.v === o.word;
          st.querySelectorAll(".opt").forEach(x => { x.disabled = true; if (x.dataset.v === o.word) x.classList.add("right"); else if (x === b) x.classList.add("wrong"); });
          if (ok) { score += 10; correct++; ui.setScore(score); }
          st.querySelector("#cqFb").innerHTML = ok ? `<b class="good">Дұрыс! +10</b>` : `<b class="bad">Қате.</b> Дұрысы: ${esc(o.word)}`;
          if (Voices.hasVoice(p.learn)) say(o.word, p.learn);
          next(ok);
        });
      } else {
        st.innerHTML = `${head}
          <div class="g-answer"><input class="g-input one" id="cqIn" lang="${p.learn}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Жауабыңыз…" aria-label="Жауабыңыз">
            <button class="btn primary" id="cqGo" disabled>Тексеру</button></div>
          <p class="g-feedback" id="cqFb" aria-live="polite"></p>`;
        const inp = st.querySelector("#cqIn"), go = st.querySelector("#cqGo");
        inp.oninput = () => { go.disabled = !inp.value.trim(); };
        inp.onkeydown = e => { if (e.key === "Enter" && !go.disabled) go.click(); };
        go.onclick = () => {
          const m = matchAnswer(inp.value, [o.word]);
          inp.disabled = go.disabled = true;
          if (m) { score += 10; correct++; ui.setScore(score); }
          st.querySelector("#cqFb").innerHTML = m ? `<b class="good">Дұрыс! +10</b> ${esc(o.word)}` : `<b class="bad">Қате.</b> Дұрысы: ${esc(o.word)}`;
          if (Voices.hasVoice(p.learn)) say(o.word, p.learn);
          next(!!m);
        };
      }
    };
    const end = () => showResult(root, this, { score, correct, total: order.length, xp: 5 + correct * 3, max: order.length * 10, review,
      extraHTML: `<img class="cam-thumb" src="${url}" alt="Түсірілген фото" style="max-height:120px">` },
      { onAgain: () => { ctx.ui = frame(root, this); ctx.st = ctx.ui.stage; this.intro(ctx); } });
    show();
  }
};
