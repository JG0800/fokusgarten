/* Fokusgarten – automatische Synchronisation über einen privaten GitHub-Gist
 *
 * Der Spielstand liegt als Datei „fokusgarten.json“ in einem geheimen Gist im
 * GitHub-Konto des Nutzers. Jedes Gerät braucht einmalig einen Zugangsschlüssel
 * (Token) mit dem Recht „gist“. Der Token bleibt nur auf dem jeweiligen Gerät.
 */
(function (global) {
  'use strict';

  const CFG_KEY = 'fokusgarten.sync';
  const FILE = 'fokusgarten.json';
  const DESC = 'Fokusgarten – Spielstand (automatische Synchronisation)';
  const API = 'https://api.github.com';
  let fetchFn = (...a) => global.fetch(...a);

  /* ---------- Konfiguration (nur lokal auf diesem Gerät) ---------- */

  function cfg() {
    try { return JSON.parse(localStorage.getItem(CFG_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveCfg(c) {
    try { localStorage.setItem(CFG_KEY, JSON.stringify(c)); } catch (e) { /* ignorieren */ }
  }
  const configured = () => !!(cfg().token && cfg().gistId);

  function deviceName() {
    const ua = navigator.userAgent || '';
    if (/iPhone|Android.+Mobile|Mobi/i.test(ua)) return 'Handy';
    if (/iPad|Tablet|Android/i.test(ua)) return 'Tablet';
    return 'PC';
  }

  /* ---------- GitHub-API ---------- */

  async function api(path, { method = 'GET', body, token, etag } = {}) {
    const headers = {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Authorization': `Bearer ${token || cfg().token}`
    };
    if (body) headers['Content-Type'] = 'application/json';
    if (etag) headers['If-None-Match'] = etag;
    const res = await fetchFn(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    if (res.status === 304) return { notModified: true };
    if (!res.ok) {
      const err = new Error(res.status === 401 ? 'Der Zugangsschlüssel ist ungültig oder abgelaufen.'
        : res.status === 403 || res.status === 404 ? 'Kein Zugriff – hat der Schlüssel das Recht „gist“?'
        : `GitHub antwortet mit Fehler ${res.status}.`);
      err.status = res.status;
      throw err;
    }
    return { data: await res.json(), etag: res.headers.get('ETag') };
  }

  async function readGist(gistId, etag) {
    const r = await api(`/gists/${gistId}`, { etag });
    if (r.notModified) return { notModified: true };
    const file = r.data.files && r.data.files[FILE];
    if (!file) return { payload: null, etag: r.etag };
    let content = file.content;
    if (file.truncated && file.raw_url) content = await (await fetchFn(file.raw_url, { cache: 'no-store' })).text();
    let payload = null;
    try { payload = JSON.parse(content); } catch (e) { payload = null; }
    return { payload: payload && payload.app === 'fokusgarten' ? payload : null, etag: r.etag };
  }

  const pack = state => JSON.stringify({ app: 'fokusgarten', version: 1, updatedAt: state.updatedAt || 0, device: deviceName(), state });

  /**
   * Mit Token verbinden: Konto prüfen, vorhandenen Fokusgarten-Gist suchen
   * oder einen neuen geheimen Gist mit dem aktuellen Spielstand anlegen.
   */
  async function connect(token, currentState) {
    token = String(token || '').trim();
    if (!token) throw new Error('Bitte einen Zugangsschlüssel eingeben.');
    const user = (await api('/user', { token })).data;
    const list = (await api('/gists?per_page=100', { token })).data;
    const found = list.find(g => g.files && g.files[FILE] && (g.description || '').startsWith('Fokusgarten'));
    let gistId;
    if (found) {
      gistId = found.id;
    } else {
      const created = (await api('/gists', {
        method: 'POST', token,
        body: { description: DESC, public: false, files: { [FILE]: { content: pack(currentState) } } }
      })).data;
      gistId = created.id;
    }
    saveCfg({ token, gistId, login: user.login, base: null, lastSync: 0, etag: null });
    return { login: user.login, existed: !!found };
  }

  function disconnect() {
    try { localStorage.removeItem(CFG_KEY); } catch (e) { /* ignorieren */ }
  }

  /* ---------- Zusammenführen bei gleichzeitigen Änderungen ---------- */

  const clone = o => JSON.parse(JSON.stringify(o));
  const plotSig = p => p ? [p.id, p.type, p.growth, p.lastFertilized || 0, p.waterings || 0].join('|') : '-';

  /**
   * Drei-Wege-Zusammenführung: base = letzter gemeinsamer Stand,
   * local/remote = die beiden geänderten Stände.
   */
  function merge3(base, local, remote) {
    const newer = (local.updatedAt || 0) >= (remote.updatedAt || 0) ? local : remote;
    const out = clone(newer);
    const b = base || {};
    // Zähler: Änderungen beider Seiten addieren
    ['coins', 'totalEarned', 'totalFocusMinutes', 'sessionsCompleted', 'tasksCompleted'].forEach(k => {
      const bv = +b[k] || 0;
      out[k] = Math.max(0, bv + ((+local[k] || 0) - bv) + ((+remote[k] || 0) - bv));
    });
    // Statistik pro Tag ebenso
    const days = new Set([...Object.keys(local.history || {}), ...Object.keys(remote.history || {})]);
    out.history = {};
    days.forEach(d => {
      const bv = (b.history && b.history[d]) || 0;
      const v = bv + (((local.history || {})[d] || 0) - bv) + (((remote.history || {})[d] || 0) - bv);
      if (v > 0) out.history[d] = v;
    });
    // Beete: wer das Beet seit dem letzten Abgleich verändert hat, gewinnt
    out.plots = (newer.plots || []).map((_, i) => {
      const bp = b.plots ? b.plots[i] : undefined;
      const lp = local.plots ? local.plots[i] : null, rp = remote.plots ? remote.plots[i] : null;
      if (plotSig(lp) === plotSig(bp)) return rp;
      if (plotSig(rp) === plotSig(bp)) return lp;
      return newer === local ? lp : rp;
    });
    // Sammlung: Vereinigung
    const seen = new Set();
    out.collection = [...(local.collection || []), ...(remote.collection || [])].filter(c => {
      const k = `${c.type}|${c.grownAt}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    }).sort((x, y) => (x.grownAt || 0) - (y.grownAt || 0));
    // Aufgaben: neue von beiden Seiten behalten, Löschungen respektieren, „erledigt“ gewinnt
    const baseIds = new Set((b.todos || []).map(t => t.id));
    const lMap = new Map((local.todos || []).map(t => [t.id, t]));
    const rMap = new Map((remote.todos || []).map(t => [t.id, t]));
    const ids = [...new Set([...lMap.keys(), ...rMap.keys()])];
    out.todos = ids.map(id => {
      const l = lMap.get(id), r = rMap.get(id);
      if (l && r) return Object.assign({}, l, { done: l.done || r.done, doneAt: l.doneAt || r.doneAt });
      if ((l && !r) || (r && !l)) return baseIds.has(id) ? null : (l || r);   // auf der anderen Seite gelöscht?
      return null;
    }).filter(Boolean).sort((x, y) => (x.createdAt || 0) - (y.createdAt || 0));
    out.updatedAt = Date.now();
    return out;
  }

  /* ---------- Abgleich ---------- */

  /**
   * Gleicht ab und gibt zurück, was passiert ist:
   *  { action: 'none'|'pushed'|'pulled'|'merged', state? }
   * askOverwrite(remoteInfo) wird nur beim allerersten Abgleich eines Geräts
   * gefragt, wenn hier UND auf GitHub schon unterschiedliche Spielstände liegen.
   */
  async function sync(localState, { askOverwrite } = {}) {
    const c = cfg();
    if (!c.token || !c.gistId) return { action: 'none' };
    const r = await readGist(c.gistId, c.etag && c.base ? c.etag : null);
    const base = c.base ? JSON.parse(c.base) : null;
    let remote = r.notModified ? base : (r.payload ? r.payload.state : null);
    const remoteStamp = remote ? (remote.updatedAt || 0) : -1;
    const baseStamp = base ? (base.updatedAt || 0) : -2;
    const localStamp = localState.updatedAt || 0;
    let result;

    if (!remote) {
      result = { action: 'pushed', state: localState };
    } else if (remoteStamp === baseStamp) {
      result = localStamp === baseStamp ? { action: 'none', state: localState } : { action: 'pushed', state: localState };
    } else if (!base) {
      // Erster Abgleich dieses Geräts
      if (remoteStamp === localStamp) result = { action: 'none', state: localState };
      else if (isFresh(localState)) result = { action: 'pulled', state: remote };
      else {
        const takeRemote = askOverwrite ? await askOverwrite(r.payload) : true;
        result = takeRemote ? { action: 'pulled', state: remote } : { action: 'pushed', state: localState };
      }
    } else if (localStamp === baseStamp) {
      result = { action: 'pulled', state: remote };
    } else {
      result = { action: 'merged', state: merge3(base, localState, remote) };
    }

    let etag = r.notModified ? c.etag : r.etag;
    if (result.action === 'pushed' || result.action === 'merged') {
      const w = await api(`/gists/${c.gistId}`, { method: 'PATCH', body: { files: { [FILE]: { content: pack(result.state) } } } });
      etag = w.etag || null;
    }
    saveCfg(Object.assign(cfg(), { base: JSON.stringify(result.state), lastSync: Date.now(), etag }));
    return result;
  }

  /** Noch nichts passiert auf diesem Gerät? (dann darf der GitHub-Stand einfach übernommen werden) */
  function isFresh(s) {
    return !s.sessionsCompleted && !(s.collection || []).length && !(s.plots || []).some(Boolean) &&
      !(s.todos || []).length && !(s.tasksCompleted) && Object.keys(s.history || {}).length === 0;
  }

  global.GistSync = {
    configured, connect, disconnect, sync, merge3, isFresh,
    info: () => { const c = cfg(); return { login: c.login, gistId: c.gistId, lastSync: c.lastSync || 0 }; },
    tokenUrl: 'https://github.com/settings/tokens/new?scopes=gist&description=Fokusgarten%20Sync',
    _setFetch: f => { fetchFn = f; }   // nur für Tests
  };
})(window);
