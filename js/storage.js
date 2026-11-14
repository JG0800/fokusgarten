/* Fokusgarten – Spielstand laden, speichern, exportieren und importieren */
(function (global) {
  'use strict';

  const KEY_REAL = 'fokusgarten.save.v1';   // dein echter Spielstand
  const KEY_TEST = 'fokusgarten.test.v1';   // getrennte Testumgebung
  const KEY_ENV = 'fokusgarten.env';        // 'test', solange die Testumgebung aktiv ist
  const SAVE_VERSION = 1;

  /** Läuft gerade die Testumgebung? */
  function isTest() {
    try { return localStorage.getItem(KEY_ENV) === 'test'; } catch (e) { return false; }
  }
  const key = () => (isTest() ? KEY_TEST : KEY_REAL);

  function defaultState() {
    return {
      version: SAVE_VERSION,
      coins: 20,              // Startguthaben für den ersten Samen
      totalEarned: 0,
      totalFocusMinutes: 0,
      sessionsCompleted: 0,
      cycleCount: 0,          // abgeschlossene Fokuseinheiten im aktuellen Zyklus
      settings: {
        focus: 25, short: 5, long: 15, longEvery: 4, autoStart: false, sound: true, notify: false,
        music: 'off', musicVolume: 50,
        // Testmodus
        testCoins: false, testNoWait: false, testFast: false
      },
      timer: { mode: 'focus', duration: 25 * 60, remaining: 25 * 60, running: false, endAt: null },
      plots: [null, null, null, null, null, null],
      collection: [],
      history: {},            // 'YYYY-MM-DD' -> Fokusminuten
      todos: [],              // Aufgaben: { id, text, done, createdAt, doneAt }
      musicLinks: [],         // eigene YouTube-Musik: { id, name, videoId, listId }
      tasksCompleted: 0
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
    s.musicLinks = Array.isArray(raw.musicLinks)
      ? raw.musicLinks.filter(l => l && typeof l.id === 'string' && (/^[\w-]{11}$/.test(l.videoId || '') || /^[\w-]+$/.test(l.listId || '')))
          .map(l => ({ id: l.id.slice(0, 40), name: String(l.name || 'YouTube').slice(0, 60),
            videoId: /^[\w-]{11}$/.test(l.videoId || '') ? l.videoId : null, listId: /^[\w-]+$/.test(l.listId || '') ? l.listId : null }))
          .slice(0, 12)
      : [];
    s.todos = Array.isArray(raw.todos)
      ? raw.todos.filter(t => t && typeof t.text === 'string').map(t => ({
          id: String(t.id || ('t' + Math.random().toString(36).slice(2))), text: t.text.slice(0, 200),
          done: !!t.done, createdAt: +t.createdAt || Date.now(), doneAt: t.doneAt ? +t.doneAt : null
        }))
      : [];
    ['coins', 'totalEarned', 'totalFocusMinutes', 'sessionsCompleted', 'cycleCount', 'tasksCompleted'].forEach(k => {
      s[k] = Number.isFinite(+s[k]) ? Math.max(0, Math.floor(+s[k])) : 0;
    });
    s.version = SAVE_VERSION;
    return s;
  }

  function load() {
    let s;
    try {
      const txt = localStorage.getItem(key());
      s = normalize(txt ? JSON.parse(txt) : null);
    } catch (e) {
      console.warn('Spielstand konnte nicht geladen werden:', e);
      s = defaultState();
    }
    // Test-Hilfen gibt es nur in der Testumgebung – nie im echten Spielstand
    if (!isTest()) s.settings.testCoins = s.settings.testNoWait = s.settings.testFast = false;
    return s;
  }

  /**
   * Neue, leere Testumgebung anlegen und aktivieren. Der echte Spielstand wird
   * nicht angefasst; nur die Timer-Einstellungen werden übernommen.
   */
  function startTest(realState) {
    const t = defaultState();
    t.settings = Object.assign({}, realState.settings, { testCoins: true, testNoWait: true, testFast: false });
    t.timer.duration = t.timer.remaining = t.settings.focus * 60;
    localStorage.setItem(KEY_TEST, JSON.stringify(t));
    localStorage.setItem(KEY_ENV, 'test');
  }

  /** Testumgebung verlassen und verwerfen – zurück zum echten Spielstand */
  function exitTest() {
    try {
      localStorage.removeItem(KEY_TEST);
      localStorage.setItem(KEY_ENV, 'real');
    } catch (e) { /* ignorieren */ }
  }

  function save(state) {
    try {
      localStorage.setItem(key(), JSON.stringify(state));
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
    a.download = `fokusgarten-${isTest() ? 'testumgebung' : 'spielstand'}-${new Date().toISOString().slice(0, 10)}.json`;
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
    try { localStorage.removeItem(key()); } catch (e) { /* ignorieren */ }
  }

  global.SaveGame = { load, save, clear, defaultState, normalize, exportToFile, importFromText, isTest, startTest, exitTest };
})(window);
