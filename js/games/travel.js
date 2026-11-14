// 7. Саяхат — role-play travel scenes with Gemini (airport, cafe, taxi, hotel, shop, pharmacy).
// The player answers by voice or text; Gemini plays the local person, points out real mistakes, gives hints.
import { esc } from "../utils.js";
import { langName } from "../i18n.js";
import { frame, loadingHTML, showResult, say, Pair, ICON, G, gameErr, roleplay, recordPhrase, recording, stopRecording, micProblem } from "./core.js";
import { langStem } from "./core.js";
import { BACKEND } from "../net.js";

const SCENES = [
  { id: "airport", emoji: "✈️", title: "Әуежай", goal: "Тіркеуден өтіп, жүкті тапсырыңыз және қақпаны біліңіз." },
  { id: "cafe", emoji: "☕", title: "Кафе", goal: "Тамақ пен сусынға тапсырыс беріп, есепшотты сұраңыз." },
  { id: "taxi", emoji: "🚕", title: "Такси", goal: "Мекенжайды айтып, бағасы мен уақытын біліңіз." },
  { id: "hotel", emoji: "🏨", title: "Қонақүй", goal: "Бөлмеге орналасып, таңғы ас пен Wi-Fi туралы сұраңыз." },
  { id: "shop", emoji: "🛍️", title: "Дүкен", goal: "Өз өлшеміңізді тауып, бағасын сұрап, төлеңіз." },
  { id: "pharmacy", emoji: "💊", title: "Дәріхана", goal: "Жеңіл суық тиюді сипаттап, дәрі сатып алыңыз." }
];
const MAX_TURNS = 10;

export default {
  id: "travel", emoji: "🧳", title: "Саяхат", group: "talk",
  desc: "Әуежай, кафе, такси… Gemini-мен рөлдік диалог.", needs: ["server", "tts"],
  run(root, s) {
    const p = Pair.get();
    const ui = frame(root, this);
    const st = ui.stage;
    if (!BACKEND.ok) { st.innerHTML = `<div class="g-error"><p>${esc(gameErr(BACKEND.code))}</p></div>`; return; }
    st.innerHTML = `
      <p class="g-label">Сахнаны таңдаңыз · сіз ${esc(langStem(p.learn))} тілінде сөйлейсіз</p>
      <div class="scene-grid">${SCENES.map(c => `<button class="scene" data-id="${c.id}"><span class="s-emo" aria-hidden="true">${c.emoji}</span><b>${esc(c.title)}</b><small>${esc(c.goal)}</small></button>`).join("")}</div>`;
    st.querySelectorAll(".scene").forEach(b => b.onclick = () => this.scene(root, s, ui, SCENES.find(c => c.id === b.dataset.id)));
  },

  scene(root, s, ui, sc) {
    const p = Pair.get();
    const st = ui.stage;
    const hist = [];
    let turns = 0, mistakes = 0, goal = false, busy = false;
    st.innerHTML = `
      <div class="g-row between"><span class="chip">${sc.emoji} ${esc(sc.title)}</span><button class="btn ghost-btn" id="vEnd">Аяқтау</button></div>
      <p class="g-goal">🎯 ${esc(sc.goal)}</p>
      <div class="chat rp" id="vChat" aria-live="polite"></div>
      <p class="g-tip" id="vHint" hidden></p>
      <div class="rp-input">
        <textarea id="vText" rows="1" lang="${p.learn}" placeholder="Жауап жазыңыз…" aria-label="Жауабыңыз"></textarea>
        <button class="icon-btn send" id="vSend" aria-label="Жіберу" disabled>${ICON.send}</button>
        <button class="mic gmic small" id="vMic" data-state="idle" aria-label="Дауыспен жауап беру">${ICON.mic}</button>
      </div>`;
    const chat = st.querySelector("#vChat"), txt = st.querySelector("#vText"), send = st.querySelector("#vSend"), mic = st.querySelector("#vMic");
    const hintEl = st.querySelector("#vHint");
    if (micProblem()) mic.hidden = true;
    const scroll = () => chat.lastElementChild && chat.lastElementChild.scrollIntoView({ block: "nearest", behavior: "smooth" });
    const setBusy = b => { busy = b; send.disabled = b || !txt.value.trim(); mic.disabled = b; txt.disabled = b; };

    const addAI = r => {
      const el = document.createElement("div");
      el.className = "bubble b";
      el.innerHTML = `<div class="b-meta">${sc.emoji} ${esc(sc.title)}</div><p class="b-tr" lang="${p.learn}">${esc(r.reply)}</p>
        ${r.reply_translation ? `<p class="b-src" hidden>${esc(r.reply_translation)}</p>` : ""}
        <div class="b-actions">${r.reply_translation ? `<button class="tr" aria-label="Аудармасы" title="Аудармасы">Аа</button>` : ""}<button class="say" aria-label="Тыңдау">${ICON.play}</button></div>`;
      const trBtn = el.querySelector(".tr");
      if (trBtn) trBtn.onclick = () => { el.querySelector(".b-src").hidden = !el.querySelector(".b-src").hidden; };
      el.querySelector(".say").onclick = () => say(r.reply, p.learn);
      chat.appendChild(el); scroll();
      hist.push({ role: "ai", text: r.reply });
      if (r.hint) { hintEl.hidden = false; hintEl.textContent = `💡 ${r.hint}`; } else hintEl.hidden = true;
      say(r.reply, p.learn);
    };
    const addUser = (text, ms) => {
      const el = document.createElement("div");
      el.className = "bubble a";
      el.innerHTML = `<div class="b-meta">Сіз</div><p class="b-tr" lang="${p.learn}">${esc(text)}</p>
        ${ms && ms.length ? `<ul class="rp-mist">${ms.map(m => `<li><s>${esc(m.wrong)}</s> → <b>${esc(m.right)}</b>${m.note ? ` <small>${esc(m.note)}</small>` : ""}</li>`).join("")}</ul>` : ""}`;
      chat.appendChild(el); scroll();
      hist.push({ role: "user", text });
    };
    const pending = () => {
      const el = document.createElement("div");
      el.className = "bubble b pending"; el.innerHTML = `<span class="spinner sm"></span>`;
      chat.appendChild(el); scroll(); return el;
    };

    const turn = async ({ text, wav, start }) => {
      setBusy(true);
      const wait = pending();
      try {
        const r = await roleplay(s, { scenario: sc.id, learn: p.learn, know: p.know, level: p.level, history: hist.slice(-12), text: text || "", start: !!start }, wav);
        if (!s.alive()) return;
        wait.remove();
        if (!start) { addUser(r.user_text || text, r.mistakes); turns++; mistakes += (r.mistakes || []).length; }
        addAI(r);
        if (r.goal_done) { goal = true; return finish(); }
        if (turns >= MAX_TURNS) return finish();
      } catch (e) {
        if (!s.alive()) return;
        wait.remove();
        const el = document.createElement("div");
        el.className = "bubble b err"; el.innerHTML = `<p class="b-tr">${esc(gameErr(e.code))}</p>`;
        if (start) { const b = document.createElement("button"); b.className = "btn primary"; b.textContent = G.retry; b.onclick = () => { el.remove(); turn({ start: true }); }; el.appendChild(b); }
        chat.appendChild(el); scroll();
        if (text) txt.value = text;
      } finally { if (s.alive()) setBusy(false); }
    };

    txt.oninput = () => { send.disabled = busy || !txt.value.trim(); txt.style.height = "auto"; txt.style.height = Math.min(txt.scrollHeight, 120) + "px"; };
    txt.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!send.disabled) send.click(); } };
    send.onclick = () => { const t = txt.value.trim(); if (!t || busy) return; txt.value = ""; txt.oninput(); turn({ text: t }); };
    mic.onclick = async () => {
      if (recording()) { stopRecording(); return; }
      if (busy) return;
      const rec = await recordPhrase(mic, s, { maxMs: 25000 });
      if (rec && s.alive()) turn({ wav: rec.wav });
    };
    const finish = () => {
      setBusy(true);
      const xp = turns * 4 + (goal ? 25 : 0);
      const score = turns * 10 + (goal ? 50 : 0) - mistakes * 2;
      s.later(() => showResult(root, this, {
        score: Math.max(0, score), correct: goal ? 1 : 0, total: 1, xp, max: 100,
        extraHTML: `<p class="muted">${goal ? "🎯 Мақсат орындалды!" : "Сахна аяқталды."} Жауаптар: <b>${turns}</b> · түзетулер: <b>${mistakes}</b></p>`
      }, { onAgain: () => this.scene(root, s, ui, sc) }), goal ? 2200 : 300);
    };
    st.querySelector("#vEnd").onclick = () => { if (turns) finish(); else this.run(root, s); };
    turn({ start: true });
  }
};
