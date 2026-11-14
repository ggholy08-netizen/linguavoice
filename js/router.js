// Hash router: #/translate (home), #/conversation, #/games[/id], #/history, #/favorites, #/settings.
// Works on GitHub Pages without any server configuration.
import { bus } from "./state.js";
import { replay } from "./utils.js";

export const ROUTES = ["translate", "conversation", "games", "history", "favorites", "settings"];
const VIEW_OF = { translate: "translate", conversation: "conversation", history: "history", favorites: "history", settings: "settings", games: "games" };

export const Router = {
  current: null,
  init() {
    window.addEventListener("hashchange", () => this.apply());
    this.apply();
  },
  go(route) { if (location.hash !== "#/" + route) location.hash = "#/" + route; else this.apply(); },
  apply() {
    let r = (location.hash.match(/^#\/([a-z]+)/) || [])[1];
    if (!ROUTES.includes(r)) r = "translate";
    const prev = this.current;
    this.current = r;
    const view = VIEW_OF[r];
    document.querySelectorAll("[data-view]").forEach(v => {
      v.hidden = v.dataset.view !== view;
      if (!v.hidden && prev !== r) replay(v, "view-in");
    });
    document.querySelectorAll("[data-route]").forEach(a => {
      const on = a.dataset.route === r;
      a.classList.toggle("active", on);
      if (on) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    document.documentElement.dataset.route = r;
    if (prev !== r) window.scrollTo({ top: 0 });
    bus.emit("route", r, prev);
  }
};
