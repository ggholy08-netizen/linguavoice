// 11. Сөз құра — build the word from shuffled letter tiles. Tiles glide between the pool and the slots (FLIP).
import { esc } from "../utils.js";
import { Voices } from "../voice/tts.js";
import { BACKEND } from "../net.js";
import { frame, loadItems, loadingHTML, errorHTML, showResult, say, Pair, ICON, G, flip } from "./core.js";
import { shuffle } from "./content.js";

const ROUNDS = 8;
const DECOYS = { easy: 0, medium: 2, hard: 3 };
const SEP = /^[\s\-'’.]$/; // these stay in place; they are not tiles

/** user-perceived letters (so that a letter with a combining mark stays one tile) */
function letters(str) {
  const t = String(str || "").normalize("NFC");
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    try { return [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(t)].map(x => x.segment); } catch { /* fall through */ }
  }
  return [...t];
}
const low = ch => ch.toLocaleLowerCase();

export default {
  id: "build", emoji: "🔤", title: "Сөз құра", group: "vocab",
  desc: "Әріптерден сөздің аудармасын құрастырыңыз.", needs: [],
  async run(root, s) {
    const p = Pair.get();
    const ui = frame(root, this, { total: ROUNDS });
    const st = ui.stage;
    st.innerHTML = loadingHTML();
    let items;
    try { items = await loadItems(s, "words", Math.min(20, ROUNDS + 6), p); }
    catch (e) { if (!s.alive()) return; st.innerHTML = errorHTML(e.code); st.querySelector("#gRetry").onclick = () => this.run(root, s); return; }
    if (!s.alive()) return;
    items = items.map(it => ({ ...it, chars: letters(it.word).map(low) }))
      .filter(it => { const n = it.chars.filter(c => !SEP.test(c)).length; return n >= 2 && n <= 16; })
      .slice(0, ROUNDS);
    if (!items.length) { st.innerHTML = errorHTML("bad_model_output"); st.querySelector("#gRetry").onclick = () => this.run(root, s); return; }
    const alphabet = [...new Set(items.flatMap(it => it.chars.filter(c => !SEP.test(c))))];
    const canSpeak = () => BACKEND.ok && Voices.hasVoice(p.learn);

    let i = 0, score = 0, correct = 0, onKey = null;
    const review = [];
    const offKeys = () => { if (onKey) { document.removeEventListener("keydown", onKey); onKey = null; } };
    s.onEnd(offKeys);

    const show = () => {
      offKeys();
      if (i >= items.length) return end();
      ui.setStep(i, items.length);
      const it = items[i];
      const target = it.chars;
      const need = target.filter(c => !SEP.test(c));
      const decoys = shuffle(alphabet.filter(c => !need.includes(c))).slice(0, DECOYS[p.level] || 0);
      let pool = shuffle([...need, ...decoys]);
      // a shuffle that happens to spell the word already would give the answer away
      for (let k = 0; k < 5 && need.length > 1 && pool.slice(0, need.length).join("") === need.join(""); k++) pool = shuffle(pool);
      let hints = 0, wrongChecks = 0, done = false;

      // tile size: one row when the word fits, otherwise the slots wrap
      const cells = target.length, avail = Math.max(220, st.clientWidth - 36);
      const ts = Math.max(30, Math.min(48, Math.floor((avail - 6 * (cells - 1)) / cells)));

      st.innerHTML = `
        <div class="g-prompt">
          <p class="g-label">Аудармасын әріптерден құраңыз</p>
          <p class="g-word mid" lang="${p.know}">${esc(it.translation)}</p>
        </div>
        <div class="wb" id="wb" style="--ts:${ts}px">
          <div class="wb-slots" id="wbSlots" lang="${p.learn}">${target.map((c, k) => SEP.test(c)
            ? `<span class="wb-gap" aria-hidden="true">${c.trim() ? esc(c) : ""}</span>`
            : `<span class="wb-slot" data-k="${k}"></span>`).join("")}</div>
          <div class="wb-pool" id="wbPool" lang="${p.learn}">${pool.map((c, k) =>
            `<span class="wb-cell" data-c="${k}"><button class="wb-tile" data-c="${k}" data-ch="${esc(c)}">${esc(c)}</button></span>`).join("")}</div>
          <p class="g-feedback" id="wbFb" aria-live="polite"></p>
          <div class="wb-foot">
            ${canSpeak() ? `<button class="chip-btn" id="wbSay">${ICON.play} ${esc(G.listen)}</button>` : ""}
            <button class="chip-btn" id="wbHint">💡 Әріп ашу (−3)</button>
            <button class="chip-btn" id="wbClear">↺ Тазалау</button>
            <button class="chip-btn" id="wbSkip">Өткізу</button>
          </div>
        </div>`;
      const wb = st.querySelector("#wb"), fb = st.querySelector("#wbFb");
      const slots = [...st.querySelectorAll(".wb-slot")];
      const cellOf = t => st.querySelector(`.wb-cell[data-c="${t.dataset.c}"]`);
      const tileIn = sl => sl.querySelector(".wb-tile");
      const want = sl => target[+sl.dataset.k];
      const firstEmpty = () => slots.find(sl => !tileIn(sl));
      const markNext = () => { const n = done ? null : firstEmpty(); slots.forEach(sl => sl.classList.toggle("next", sl === n)); };

      const place = (tile, slot) => { tile.classList.remove("bad"); flip(tile, () => slot.appendChild(tile)); };
      const home = tile => { tile.classList.remove("bad"); flip(tile, () => cellOf(tile).appendChild(tile)); };
      const points = () => (hints >= need.length ? 0 : Math.max(2, 10 - hints * 3 - wrongChecks * 2));

      const win = () => {
        done = true; markNext();
        const pts = points();
        score += pts; if (pts > 0) correct++;
        ui.setScore(score);
        review.push({ q: it.translation, a: it.word, ok: pts > 0, note: hints ? `кеңес: ${hints}` : "" });
        slots.forEach((sl, k) => { const t = tileIn(sl); if (t) { t.style.setProperty("--i", k); t.disabled = true; } });
        wb.classList.add("won");
        fb.innerHTML = `<b class="good">${pts ? `Дұрыс! +${pts}` : "Дұрыс!"}</b> ${esc(it.word)}`;
        lockButtons();
        if (canSpeak()) say(it.word, p.learn);
        s.later(() => { i++; show(); }, 1500);
      };
      const lockButtons = () => st.querySelectorAll(".wb-foot .chip-btn:not(#wbSay)").forEach(b => { b.disabled = true; });

      const check = () => {
        if (done || firstEmpty()) { markNext(); return; }
        const bad = slots.filter(sl => low(tileIn(sl).dataset.ch) !== want(sl));
        if (!bad.length) return win();
        wrongChecks++;
        bad.forEach(sl => tileIn(sl).classList.add("bad"));
        wb.classList.remove("wrong"); void wb.offsetWidth; wb.classList.add("wrong");
        fb.innerHTML = `<b class="bad">Әзірге дұрыс емес.</b> Қызыл әріптерді басып, орнын ауыстырыңыз.`;
        markNext();
      };

      const tapTile = tile => {
        if (done || tile.classList.contains("locked")) return;
        if (tile.parentElement.classList.contains("wb-slot")) { home(tile); fb.textContent = ""; markNext(); return; }
        const slot = firstEmpty();
        if (!slot) return;
        place(tile, slot);
        markNext();
        if (!firstEmpty()) s.later(check, 300); // let the tile land first
      };
      wb.addEventListener("click", e => { const t = e.target.closest(".wb-tile"); if (t) tapTile(t); });

      st.querySelector("#wbHint").onclick = () => {
        if (done) return;
        // the first slot that is empty or holds a wrong letter
        const slot = slots.find(sl => { const t = tileIn(sl); return !t || low(t.dataset.ch) !== want(sl); });
        if (!slot) return check();
        const cur = tileIn(slot);
        if (cur) home(cur);
        const free = [...st.querySelectorAll(".wb-cell .wb-tile")].find(t => low(t.dataset.ch) === want(slot))
          || slots.map(tileIn).find(t => t && !t.classList.contains("locked") && low(t.dataset.ch) === want(slot) && low(t.dataset.ch) !== want(t.parentElement));
        if (!free) return;
        hints++;
        place(free, slot);
        free.classList.add("locked");
        fb.textContent = "";
        markNext();
        if (!firstEmpty()) s.later(check, 300);
      };
      st.querySelector("#wbClear").onclick = () => {
        if (done) return;
        slots.map(tileIn).forEach(t => { if (t && !t.classList.contains("locked")) home(t); });
        fb.textContent = ""; markNext();
      };
      st.querySelector("#wbSkip").onclick = () => {
        if (done) return;
        done = true; lockButtons();
        // put every letter where it belongs so the player sees the answer
        slots.map(tileIn).forEach(t => { if (t && !t.classList.contains("locked")) home(t); });
        slots.forEach(sl => {
          if (tileIn(sl)) return;
          const t = [...st.querySelectorAll(".wb-cell .wb-tile")].find(x => low(x.dataset.ch) === want(sl));
          if (t) { place(t, sl); t.classList.add("locked"); }
        });
        markNext();
        review.push({ q: it.translation, a: it.word, ok: false });
        fb.innerHTML = `Жауабы: <b>${esc(it.word)}</b>`;
        if (canSpeak()) say(it.word, p.learn);
        s.later(() => { i++; show(); }, 2000);
      };
      const sayBtn = st.querySelector("#wbSay");
      if (sayBtn) sayBtn.onclick = () => say(it.word, p.learn);

      // a real keyboard: type the letters, Backspace takes the last one back
      onKey = e => {
        if (done || e.ctrlKey || e.metaKey || e.altKey || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)) return;
        if (e.key === "Backspace") {
          const last = slots.map(tileIn).filter(t => t && !t.classList.contains("locked")).pop();
          if (last) { e.preventDefault(); tapTile(last); }
          return;
        }
        if ([...e.key].length !== 1) return;
        const t = [...st.querySelectorAll(".wb-cell .wb-tile")].find(x => low(x.dataset.ch) === low(e.key));
        if (t) { e.preventDefault(); tapTile(t); }
      };
      document.addEventListener("keydown", onKey);
      markNext();
    };

    const end = () => showResult(root, this, { score, correct, total: items.length, xp: correct * 3 + Math.round(score / 10), max: items.length * 10, review },
      { onAgain: () => this.run(root, s) });
    show();
  }
};
