// Edge TTS voices: the live list from the backend, per-language choice, gender / accent filtering.
import { fetchTimeout, api, BACKEND } from "../net.js";
import { AppError } from "../utils.js";
import { prefs, savePref } from "../storage/settings.js";
import { T } from "../i18n.js";
import { toast } from "../ui/notifications.js";
import { bus } from "../state.js";

// Display names for accents (locale region), Kazakh.
const REGION = {
  US: "АҚШ", GB: "Ұлыбритания", AU: "Австралия", CA: "Канада", IN: "Үндістан", IE: "Ирландия", NZ: "Жаңа Зеландия",
  ZA: "Оңтүстік Африка", SG: "Сингапур", PH: "Филиппин", KE: "Кения", NG: "Нигерия", TZ: "Танзания", HK: "Гонконг",
  KZ: "Қазақстан", RU: "Ресей", TR: "Түркия", UZ: "Өзбекстан", DE: "Германия", AT: "Австрия", CH: "Швейцария",
  FR: "Франция", BE: "Бельгия", ES: "Испания", MX: "Мексика", AR: "Аргентина", CO: "Колумбия", US_es: "АҚШ",
  PT: "Португалия", BR: "Бразилия", CN: "Қытай", TW: "Тайвань", JP: "Жапония", KR: "Корея", SA: "Сауд Арабиясы",
  EG: "Мысыр", AE: "БАӘ", IT: "Италия", NL: "Нидерланд", UA: "Украина", PL: "Польша", IR: "Иран", PK: "Пәкістан"
};

export const Voices = {
  list: [], defaults: {}, withVoices: null, loaded: false,
  async load() {
    if (!BACKEND.ok) return;
    try {
      const r = await fetchTimeout(api("/api/voices"), {}, 75000);
      if (!r.ok) throw new AppError("voices_unavailable");
      const j = await r.json();
      this.list = j.voices || []; this.defaults = j.defaults || {};
      this.withVoices = new Set(j.languages_with_voices || []);
      this.loaded = true;
    } catch (e) {
      this.withVoices = null;
      if (e.code !== "backend_unreachable" && e.code !== "no_internet") toast(T.err.voices_unavailable, { type: "error", ms: 4500 });
    }
    bus.emit("voices");
  },
  /** true when Edge TTS has a voice for this language (or when the list is unknown). */
  hasVoice(code) { return !this.withVoices || this.withVoices.has(code); },
  forLang(code) {
    const pref = code === "no" ? ["nb", "nn", "no"] : [code];
    return this.list.filter(v => pref.includes(v.locale.split("-")[0].toLowerCase()));
  },
  gendersFor(code) {
    const g = new Set(this.forLang(code).map(v => (v.gender || "").toLowerCase()));
    return { female: g.has("female"), male: g.has("male") };
  },
  name(v) { return v.id.split("-").slice(2).join("-").replace(/Neural$/, "") || v.id; },
  region(locale) { const r = (locale.split("-")[1] || "").toUpperCase(); return REGION[r] || r; },
  genderWord(v) { return /female/i.test(v.gender) ? T.female : /male/i.test(v.gender) ? T.male : ""; },
  label(v) { const g = this.genderWord(v); return `${this.name(v)}${g ? " · " + g : ""}`; },
  chosen(code) {
    const v = prefs.voices[code];
    return v && (this.list.length === 0 || this.list.some(x => x.id === v)) ? v : "auto";
  },
  choose(code, voiceId) { savePref("voices", { ...prefs.voices, [code]: voiceId }); },
  /** <select> markup: "auto" + voices grouped by accent, filtered by gender. */
  optionsHTML(code, gender, esc) {
    const all = this.forLang(code);
    const vs = gender === "all" ? all : all.filter(v => (v.gender || "").toLowerCase() === gender);
    const defV = all.find(v => v.id === this.defaults[code]);
    let html = `<option value="auto">${esc(T.autoVoice)}${defV ? " — " + esc(this.label(defV)) + " (" + esc(this.region(defV.locale)) + ")" : ""}</option>`;
    const groups = new Map();
    for (const v of vs) { if (!groups.has(v.locale)) groups.set(v.locale, []); groups.get(v.locale).push(v); }
    for (const [loc, items] of groups) {
      html += `<optgroup label="${esc(this.region(loc))} · ${esc(loc)}">` +
        items.map(v => `<option value="${esc(v.id)}">${esc(this.label(v))}</option>`).join("") + "</optgroup>";
    }
    return html;
  }
};
