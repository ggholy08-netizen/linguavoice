// Tiny event bus shared by modules (one listener list per event name).

const listeners = new Map();

export const bus = {
  on(evt, fn) {
    if (!listeners.has(evt)) listeners.set(evt, new Set());
    listeners.get(evt).add(fn);
    return () => listeners.get(evt).delete(fn); // unsubscribe
  },
  emit(evt, ...args) {
    const set = listeners.get(evt);
    if (!set) return;
    for (const fn of [...set]) {
      try { fn(...args); } catch (e) { console.error("[LinguaVoice]", evt, e); }
    }
  }
};
