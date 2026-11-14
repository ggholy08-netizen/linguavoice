// Games screen: progress (level, XP, daily streak, week chart), language pair + difficulty, the 12 game cards.
// #/games → hub, #/games/<id> → that game.
import { $, esc, replay } from "../utils.js";
import { langName } from "../i18n.js";
import { bus } from "../state.js";
import { pickLanguage } from "../ui/components.js";
import { toast } from "../ui/notifications.js";
import { Pair, Stats, DAILY_GOAL, G, session } from "./core.js";
import race from "./race.js";
import dictation from "./dictation.js";
import cards from "./flashcards.js";
import sayTr from "./saytranslate.js";
import twister from "./twister.js";
import quick from "./quickanswer.js";
import travel from "./travel.js";
import detective from "./detective.js";
import duel from "./duel.js";
import memory from "./memory.js";
import build from "./wordbuild.js";
import camera from "./camera.js";

export const GAMES = [race, memory, build, detective, cards, camera, dictation, sayTr, twister, quick, travel, duel];
const GROUPS = [
  { id: "vocab", title: "Сөздік қор" },
  { id: "listen", title: "Тыңдау және сөйлеу" },
  { id: "talk", title: "Сөйлесу" }
];
const NEED = { mic: "🎙 Микрофон", server: "✦ Gemini", tts: "🔊 Дауыс", cam: "📷 Камера" };
const WEEK = ["Жс", "Дс", "Сс", "Ср", "Бс", "Жм", "Сб"];

let current = null; // { game, s }

const pairHelp = p => Pair.builtin(p)
  ? (p.fresh ? "Тапсырмаларды әр жолы Gemini жаңадан жасайды (интернет қажет)." : "Қазақ, орыс және ағылшын тілдері үшін дайын тапсырмалар бар. Gemini жаңа тапсырмаларды да жасай алады.")
  : "Бұл тіл жұбы үшін тапсырмаларды Gemini жасайды (интернет қажет).";

export const GamesView = {
  init() {
    bus.on("game:stats", () => { if (this.visible() && !current) this.renderHub(); });
    bus.on("voices", () => { if (this.visible() && !current) this.renderHub(); });
  },
  visible() { const v = document.querySelector('[data-view="games"]'); return v && !v.hidden; },

  stop() { if (current) { current.s.end(); current = null; } },

  /** called on every route change */
  route(r, prev) {
    if (r !== "games") { this.stop(); return; }
    const id = (location.hash.match(/^#\/games\/([a-z]+)/) || [])[1];
    const game = GAMES.find(g => g.id === id);
    this.stop();
    window.scrollTo({ top: 0 });
    const root = $("gamesRoot");
    // this screen brings its own entrance; drop the generic one so the two fades do not stack
    const section = root.closest("[data-view]");
    if (section) section.classList.remove("view-in");
    if (game) {
      const s = session();
      current = { game, s };
      document.documentElement.dataset.game = game.id;
      root.classList.remove("hub-enter");
      replay(root, "g-enter");
      Promise.resolve(game.run(root, s)).catch(e => { console.error("[LinguaVoice] game", e); toast(G.err.generic, { type: "error" }); });
    } else {
      delete document.documentElement.dataset.game;
      root.classList.remove("g-enter");
      this.renderHub(true);
    }
  },

  /** enter = true only when the player arrives here; plain re-draws (new stats, new pair) must not replay the entrance */
  renderHub(enter = false) {
    const root = $("gamesRoot");
    root.classList.toggle("hub-enter", enter);
    let n = 0; // stagger index
    const p = Pair.get();
    const st = Stats.load();
    const lv = Stats.level(st.xp);
    const streak = Stats.streakNow(st);
    const today = Stats.today(st);
    const week = Stats.week(st);
    const maxW = Math.max(DAILY_GOAL, ...week.map(d => d.xp));
    const plays = Object.values(st.games).reduce((a, g) => a + g.plays, 0);
    const tot = Object.values(st.games).reduce((a, g) => [a[0] + g.correct, a[1] + g.total], [0, 0]);
    const builtin = Pair.builtin(p);
    const goalPct = Math.min(100, Math.round((today / DAILY_GOAL) * 100));

    root.innerHTML = `
      <div class="view-head"><h1>Ойындар</h1></div>
      <div class="g-hero card glass" style="--i:${n++}">
        <div class="ring" style="--p:${lv.pct}" aria-label="Деңгей ${lv.level}"><b>${lv.level}</b><small>деңгей</small></div>
        <div class="hero-main">
          <p class="hero-xp"><b>${st.xp}</b> XP <small>· келесі деңгейге ${lv.need - lv.into} XP</small></p>
          <div class="bar" aria-hidden="true"><i style="width:${lv.pct}%"></i></div>
          <div class="hero-row">
            <span class="pill ${streak ? "fire" : ""}" title="Күнделікті серия">🔥 ${streak} күн</span>
            <span class="pill ${goalPct >= 100 ? "done" : ""}" title="Бүгінгі мақсат">🎯 Бүгін: ${today}/${DAILY_GOAL} XP</span>
          </div>
        </div>
        <div class="week" aria-label="Соңғы 7 күн, XP">${week.map((d, k) => `<span title="${d.xp} XP"><i style="height:${Math.max(4, Math.round((d.xp / maxW) * 100))}%;--i:${k}" class="${d.xp >= DAILY_GOAL ? "full" : ""}"></i><small>${WEEK[d.d.getDay()]}</small></span>`).join("")}</div>
      </div>

      <div class="card glass g-pair" style="--i:${n++}">
        <div class="langrow">
          <button class="lang-btn" id="gKnow"><small>Мен білемін</small><span>${esc(langName(p.know))}</span></button>
          <button class="swap" id="gSwap" aria-label="Тілдерді алмастыру"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4 3 8l4 4"/><path d="M3 8h14"/><path d="m17 20 4-4-4-4"/><path d="M21 16H7"/></svg></button>
          <button class="lang-btn right" id="gLearn"><small>Үйренемін</small><span>${esc(langName(p.learn))}</span></button>
        </div>
        <div class="pair-row">
          <div class="seg" id="gLevel" role="group" aria-label="Қиындық">${Object.entries(G.levels).map(([k, v]) => `<button data-l="${k}" aria-pressed="${p.level === k}">${v}</button>`).join("")}</div>
          ${builtin ? `<label class="toggle small">✦ Gemini жаңа тапсырмалары<input type="checkbox" class="switch" id="gFresh" ${p.fresh ? "checked" : ""}></label>` : ""}
        </div>
        <p class="help" id="gPairHelp">${esc(pairHelp(p))}</p>
      </div>

      ${GROUPS.map(gr => `
        <h2 class="g-group" style="--i:${n++}">${esc(gr.title)}</h2>
        <div class="g-grid">${GAMES.filter(g => g.group === gr.id).map(g => {
          const gs = st.games[g.id];
          return `<a class="g-card card glass" href="#/games/${g.id}" style="--i:${n++}">
            <span class="g-emo" aria-hidden="true">${g.emoji}</span>
            <span class="g-body"><b>${esc(g.title)}</b><small>${esc(g.desc)}</small>
              <span class="g-tags">${g.needs.map(n => `<i>${NEED[n]}</i>`).join("")}${gs ? `<i class="best">Рекорд ${gs.best}</i>` : ""}</span></span>
          </a>`;
        }).join("")}</div>`).join("")}

      <div class="card glass g-stats" style="--i:${n++}">
        <h3>Прогресс</h3>
        <dl class="kv">
          <dt>Ойындар саны</dt><dd>${plays}</dd>
          <dt>Жалпы дәлдік</dt><dd>${tot[1] ? Math.round((tot[0] / tot[1]) * 100) + "%" : "—"}</dd>
          <dt>Ең ұзақ серия</dt><dd>${st.bestStreak || 0} күн</dd>
        </dl>
        ${plays ? `<ul class="g-best">${GAMES.filter(g => st.games[g.id]).map(g => { const x = st.games[g.id];
          return `<li><span>${g.emoji} ${esc(g.title)}</span><span>${x.plays} рет · рекорд ${x.best}${x.total ? ` · ${Math.round((x.correct / x.total) * 100)}%` : ""}</span></li>`; }).join("")}</ul>` : ""}
        <p class="help">Прогресс тек осы құрылғыда сақталады. Дыбыс жазбалары сақталмайды.</p>
        <button class="btn danger" id="gReset" ${plays || st.xp ? "" : "disabled"}>Прогресті тазалау</button>
      </div>`;

    $("gKnow").onclick = () => pickLanguage({ title: "Мен білетін тіл", current: p.know, onPick: c => this.setPair("know", c) });
    $("gLearn").onclick = () => pickLanguage({ title: "Үйренетін тіл", current: p.learn, needsVoice: true, onPick: c => this.setPair("learn", c) });
    $("gSwap").onclick = () => { Pair.set({ know: p.learn, learn: p.know }); this.renderHub(); };
    // difficulty and the Gemini switch change in place: re-drawing the whole hub for them made it flicker
    root.querySelectorAll("#gLevel button").forEach(b => b.onclick = () => {
      Pair.set({ level: b.dataset.l });
      root.querySelectorAll("#gLevel button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    });
    const fresh = $("gFresh"); if (fresh) fresh.onchange = () => { $("gPairHelp").textContent = pairHelp(Pair.set({ fresh: fresh.checked })); };
    $("gReset").onclick = () => {
      if (!confirm("Ойын прогресін (XP, деңгей, серия, рекордтар, карточкалар) жою керек пе?")) return;
      Stats.reset(); this.renderHub(); toast("Прогресс тазаланды", { type: "success" });
    };
  },

  setPair(k, c) {
    const p = Pair.get();
    const patch = { [k]: c };
    if (c === (k === "know" ? p.learn : p.know)) patch[k === "know" ? "learn" : "know"] = p[k]; // same language → swap
    Pair.set(patch);
    this.renderHub();
  }
};
