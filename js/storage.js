/* Fokusgarten – Spielstand laden, speichern, exportieren und importieren */
(function (global) {
  'use strict';

  const KEY = 'fokusgarten.save.v1';
  const SAVE_VERSION = 1;

  function defaultState() {
    return {
      version: SAVE_VERSION,
      coins: 20,              // Startguthaben für den ersten Samen
      totalEarned: 0,
      totalFocusMinutes: 0,
      sessionsCompleted: 0,
      cycleCount: 0,          // abgeschlossene Fokuseinheiten im aktuellen Zyklus
      settings: { focus: 25, short: 5, long: 15, longEvery: 4, autoStart: false, sound: true, notify: false },
      timer: { mode: 'focus', duration: 25 * 60, remaining: 25 * 60, running: false, endAt: null },
      plots: [null, null, null, null, null, null],
      collection: [],
      history: {}             // 'YYYY-MM-DD' -> Fokusminuten
    };
  }

  /** Fehlende Felder mit Standardwerten auffüllen (für ältere oder fremde Spielstände) */
  function normalize(raw) {
    const d = defaultState();
    if (!raw || typeof raw !== 'object') return d;
    const s = Object.assign({}, d, raw);
    s.settings = Object.assign({}, d.settings, raw.settings || {});
    s.timer = Object.assign({}, d.timer, raw.timer || {});
    s.history = (raw.history && typeof raw.history === 'object') ? raw.history : {};
    s.collection = Array.isArray(raw.collection) ? raw.collection : [];
    const plots = Array.isArray(raw.plots) ? raw.plots.slice(0, d.plots.length) : [];
    while (plots.length < d.plots.length) plots.push(null);
    s.plots = plots.map(p => (p && global.Plants.PLANT_TYPES[p.type]) ? p : null);
    ['coins', 'totalEarned', 'totalFocusMinutes', 'sessionsCompleted', 'cycleCount'].forEach(k => {
      s[k] = Number.isFinite(+s[k]) ? Math.max(0, Math.floor(+s[k])) : 0;
    });
    s.version = SAVE_VERSION;
    return s;
  }

  function load() {
    try {
      const txt = localStorage.getItem(KEY);
      return normalize(txt ? JSON.parse(txt) : null);
    } catch (e) {
      console.warn('Spielstand konnte nicht geladen werden:', e);
      return defaultState();
    }
  }

  function save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.warn('Spielstand konnte nicht gespeichert werden:', e);
      return false;
    }
  }

  function exportToFile(state) {
    const blob = new Blob([JSON.stringify({ app: 'fokusgarten', exportedAt: new Date().toISOString(), state }, null, 2)],
      { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `fokusgarten-spielstand-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  function importFromText(text) {
    const data = JSON.parse(text);
    const raw = data && data.app === 'fokusgarten' ? data.state : data;
    if (!raw || typeof raw !== 'object' || !('coins' in raw) || !Array.isArray(raw.plots)) {
      throw new Error('Das ist keine gültige Fokusgarten-Spielstanddatei.');
    }
    return normalize(raw);
  }

  function clear() {
    try { localStorage.removeItem(KEY); } catch (e) { /* ignorieren */ }
  }

  global.SaveGame = { load, save, clear, defaultState, normalize, exportToFile, importFromText };
})(window);
