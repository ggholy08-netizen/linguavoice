// 10. Жұп тап — memory game: turn two cards over and find a word and its translation.
import { esc } from "../utils.js";
import { store } from "../storage/settings.js";
import { Voices } from "../voice/tts.js";
import { BACKEND } from "../net.js";
import { frame, loadItems, loadingHTML, errorHTML, showResult, say, Pair, G } from "./core.js";
import { shuffle } from "./content.js";
import { normalize } from "./text-diff.js";

const PAIRS = { easy: 6, medium: 8, hard: 10 };
const FLIP_MS = 500;      // the CSS turn of a card
const SHOW_MS = 950;      // how long a wrong pair stays open

/**
 * Fit every word to its card: shrink the letters until the word fits on one line (several words may wrap at the
 * spaces). Only if it still does not fit at the smallest readable size is the word allowed to break.
 */
function fitWords(grid) {
  const max = matchMedia("(min-width: 700px)").matches ? 19 : 16, min = 9.5;
  for (const sp of grid.querySelectorAll(".mem-face.up span")) {
    const box = sp.parentElement;
    const roomW = box.clientWidth - 8, roomH = box.clientHeight - 26;
    if (roomW <= 0) continue;
    sp.classList.remove("tight");
    sp.classList.toggle("wrap", /\s/.test(sp.textContent.trim()));
    let size = max;
    sp.style.fontSize = size + "px";
    while (size > min && (sp.scrollWidth > roomW || sp.offsetHeight > roomH)) { size -= 0.5; sp.style.fontSize = size + "px"; }
    if (sp.scrollWidth > roomW) sp.classList.add("tight");
  }
}

export default {
  id: "memory", emoji: "🧩", title: "Жұп тап", group: "vocab",
  desc: "Карталарды аударып, сөз бен аудармасының жұбын табыңыз.", needs: [],
  async run(root, s) {
    const p = Pair.get();
    const want = PAIRS[p.level] || 6;
    const ui = frame(root, this, { total: want });
    const st = ui.stage;
    st.innerHTML = loadingHTML();
    let items;
    try { items = await loadItems(s, "words", Math.min(20, want + 4), p); }
    catch (e) { if (!s.alive()) return; st.innerHTML = errorHTML(e.code); st.querySelector("#gRetry").onclick = () => this.run(root, s); return; }
    if (!s.alive()) return;

    // two pairs with the same word or the same translation would be impossible to tell apart
    const seenW = new Set(), seenT = new Set(), pairs = [];
    for (const it of items) {
      const w = normalize(it.word), t = normalize(it.translation);
      if (!w || !t || w === t || seenW.has(w) || seenT.has(t) || seenW.has(t) || seenT.has(w)) continue;
      seenW.add(w); seenT.add(t); pairs.push(it);
      if (pairs.length === want) break;
    }
    if (pairs.length < 3) { st.innerHTML = errorHTML("bad_model_output"); st.querySelector("#gRetry").onclick = () => this.run(root, s); return; }

    const cards = shuffle(pairs.flatMap((it, k) => [
      { pair: k, side: "l", text: it.word, lang: p.learn },
      { pair: k, side: "k", text: it.translation, lang: p.know }
    ]));
    const cols = cards.length <= 12 ? 3 : 4;                 // phones
    const colsWide = cards.length <= 16 ? 4 : 5;             // tablets and computers
    let sound = store.get("memSound", true);
    const canSpeak = () => sound && BACKEND.ok && Voices.hasVoice(p.learn);

    let open = [], lock = false, moves = 0, found = 0, t0 = 0, clock = 0;
    const review = [];
    st.innerHTML = `
      <div class="mem-bar">
        <span>Жүріс: <b id="mMoves">0</b></span><span>·</span><span>Уақыт: <b id="mTime">0:00</b></span>
        <span class="spacer"></span>
        <button class="chip-btn" id="mSound" aria-pressed="${sound}">${sound ? "🔊" : "🔇"} Дауыс</button>
      </div>
      <div class="mem-grid" id="mGrid" style="--cols:${cols};--cols-w:${colsWide}">${cards.map((c, i) => `
        <button class="mem" data-i="${i}" data-side="${c.side}" aria-label="Жабық карта">
          <span class="mem-in">
            <span class="mem-face down" aria-hidden="true">?</span>
            <span class="mem-face up" aria-hidden="true"><span lang="${esc(c.lang)}">${esc(c.text)}</span><small>${esc(c.lang)}</small></span>
          </span>
        </button>`).join("")}</div>
      <p class="g-feedback" id="mFb" aria-live="polite">Екі картаны басыңыз: сөз + аудармасы.</p>`;
    const grid = st.querySelector("#mGrid"), fb = st.querySelector("#mFb");
    const els = [...grid.querySelectorAll(".mem")];
    fitWords(grid);
    if ("ResizeObserver" in window) { // the cards change size when the window or the phone is turned
      let raf = 0;
      const ro = new ResizeObserver(() => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => fitWords(grid)); });
      ro.observe(grid);
      s.onEnd(() => { ro.disconnect(); cancelAnimationFrame(raf); });
    }
    ui.setStep(0, pairs.length);

    st.querySelector("#mSound").onclick = e => {
      sound = !sound; store.set("memSound", sound);
      e.currentTarget.setAttribute("aria-pressed", String(sound));
      e.currentTarget.textContent = `${sound ? "🔊" : "🔇"} Дауыс`;
    };
    const fmt = ms => { const sec = Math.floor(ms / 1000); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`; };
    const startClock = () => {
      if (t0) return;
      t0 = performance.now();
      clock = s.every(() => { const el = st.querySelector("#mTime"); if (el) el.textContent = fmt(performance.now() - t0); }, 500);
    };
    const show = (el, c) => { el.classList.add("open"); el.setAttribute("aria-label", c.text); };
    const hide = el => { el.classList.remove("open", "miss"); el.setAttribute("aria-label", "Жабық карта"); };

    const tap = el => {
      const i = +el.dataset.i, c = cards[i];
      if (lock || el.classList.contains("open") || el.classList.contains("done")) return;
      startClock();
      show(el, c);
      open.push(i);
      if (open.length < 2) return;

      moves++;
      st.querySelector("#mMoves").textContent = moves;
      const [a, b] = open, A = cards[a], B = cards[b];
      open = [];
      if (A.pair === B.pair && A.side !== B.side) {
        found++;
        const it = pairs[A.pair];
        review.push({ q: it.word, a: it.translation, ok: true });
        // let the second card finish turning, then mark the pair
        s.later(() => {
          [els[a], els[b]].forEach(x => { x.classList.remove("open"); x.classList.add("done"); x.disabled = true; });
          fb.innerHTML = `<b class="good">${esc(it.word)} = ${esc(it.translation)}</b>`;
          ui.setStep(found, pairs.length);
          ui.setScore(score());
          if (canSpeak()) say(it.word, p.learn);
          if (found === pairs.length) { s.clear(clock); s.later(end, 1100); }
        }, FLIP_MS * 0.7);
      } else {
        lock = true; // no third card while a wrong pair is shown
        [els[a], els[b]].forEach(x => x.classList.add("miss"));
        fb.textContent = A.side === B.side ? "Бұл екеуі бір тілде. Сөз бен аудармасын табыңыз." : "Жұп емес. Есте сақтаңыз!";
        s.later(() => { hide(els[a]); hide(els[b]); lock = false; }, FLIP_MS + SHOW_MS);
      }
    };
    grid.addEventListener("click", e => { const el = e.target.closest(".mem"); if (el) tap(el); });

    // fewer wasted moves = more points; never less than 5 per pair
    const score = () => Math.max(found * 5, found * 20 - Math.max(0, moves - found) * 3);
    const end = () => {
      const ms = performance.now() - t0;
      const sc = score();
      showResult(root, this, {
        score: sc, correct: pairs.length, total: Math.max(moves, pairs.length), xp: pairs.length * 2 + Math.round(sc / 20), max: pairs.length * 20, review,
        extraHTML: `<p class="muted">Жұптар: <b>${pairs.length}</b> · жүріс: <b>${moves}</b> · уақыт: <b>${fmt(ms)}</b></p>`
      }, { onAgain: () => this.run(root, s) });
    };
  }
};
