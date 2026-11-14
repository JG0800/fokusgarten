/* Fokusgarten – Hauptlogik: Timer, Münzen, Garten, Statistik */
(function () {
  'use strict';

  const P = window.Plants;
  const SG = window.SaveGame;
  const $ = (sel, root = document) => root.querySelector(sel);

  const CYCLE_BONUS = 10;
  const TASK_REWARD = 50;
  const MODE_INFO = {
    focus: { label: 'Fokuszeit', tab: 'Fokus' },
    short: { label: 'Kurze Pause', tab: 'Kurze Pause' },
    long: { label: 'Lange Pause', tab: 'Lange Pause' }
  };
  const RING_C = 2 * Math.PI * 96;

  let state = SG.load();
  let audioCtx = null;
  let shopPlot = null;
  let scene = null;
  let selected = 0;
  const celebrateUntil = {};
  let focusModeWanted = false;
  let bonuses = P.computeBonuses([]);

  /** Boni aus der Sammlung neu berechnen und für die Pflanzenregeln aktivieren */
  function applyBonuses() {
    bonuses = P.computeBonuses(state.collection);
    P.setBonuses(bonuses);
  }

  /** Münzen für eine Fokuseinheit inkl. Sammlungs-Boni (Kirschbaum %, Sonnenblume +x) */
  function focusReward(minutes) {
    const base = Math.round(minutes * bonuses.focusMult);
    const extra = base - minutes + bonuses.sessionCoins;
    return { total: base + bonuses.sessionCoins, extra };
  }
  let statsView = 'week';
  try { statsView = localStorage.getItem('fokusgarten.statsView') || 'week'; } catch (e) { /* ignorieren */ }

  /* ---------- Hilfsfunktionen ---------- */

  const now = () => Date.now();

  function dateKey(d = new Date()) {
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }

  function fmtTime(sec) {
    sec = Math.max(0, Math.round(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  // Beim Wechsel zwischen echtem Spielstand und Testumgebung darf nichts mehr
  // gespeichert werden – sonst landet ein Stand im falschen Speicherplatz.
  let switching = false;
  function persist() {
    if (switching) return;
    if (!SG.isTest()) {
      // Nur echte Änderungen bekommen einen neuen Zeitstempel (nicht Laden, Wasserverlust usw.)
      const sg = sigOf(state);
      if (lastSig !== null && sg !== lastSig) { state.updatedAt = Date.now(); scheduleSync(4000); }
      lastSig = sg;
    }
    SG.save(state);
  }

  /* ---------- Synchronisation (privater GitHub-Gist) ---------- */

  const Sync = window.GistSync;
  const DEVICE_ID = (() => {
    try {
      let id = localStorage.getItem('fokusgarten.device');
      if (!id) { id = 'd' + Math.random().toString(36).slice(2, 10); localStorage.setItem('fokusgarten.device', id); }
      return id;
    } catch (e) { return 'd0'; }
  })();
  let lastSig = null, syncBusy = false, syncTimer = null, foreignWait = false;
  let syncStatus = { state: 'off', msg: '' };
  const syncOn = () => !!Sync && !SG.isTest() && Sync.configured();

  /** Fingerabdruck der Daten, die eine echte Änderung darstellen */
  function sigOf(s) {
    const t = s.timer || {};
    const settings = Object.assign({}, s.settings);
    delete settings.testCoins; delete settings.testNoWait; delete settings.testFast;
    return JSON.stringify([
      s.coins, s.totalEarned, s.totalFocusMinutes, s.sessionsCompleted, s.cycleCount, s.tasksCompleted || 0,
      settings,
      [t.mode, t.running, t.endAt, t.duration, t.running ? null : t.remaining, !!t.fast, t.device || null],
      (s.plots || []).map(p => p && [p.id, p.type, p.growth, p.lastFertilized || 0, p.waterings || 0]),
      s.collection, s.todos, s.history
    ]);
  }

  function scheduleSync(ms) {
    if (!syncOn()) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncNow, ms);
  }

  function setSyncStatus(st, msg = '') {
    syncStatus = { state: st, msg };
    renderSyncBadge();
    if ($('#settingsDialog').open) renderSyncSettings();
  }

  function askOverwrite(payload) {
    const when = payload && payload.updatedAt ? new Date(payload.updatedAt).toLocaleString('de-DE') : 'unbekannt';
    const dev = payload && payload.device ? ` auf dem ${payload.device}` : '';
    return Promise.resolve(confirm(
      `Auf GitHub liegt schon ein Spielstand (zuletzt geändert am ${when}${dev}).\n\n` +
      'OK = diesen GitHub-Spielstand auf dieses Gerät übernehmen\n' +
      'Abbrechen = den Spielstand dieses Geräts zu GitHub hochladen'));
  }

  /** Spielstand von einem anderen Gerät übernehmen */
  function adoptState(remote) {
    state = SG.normalize(remote);
    state.settings.testCoins = state.settings.testNoWait = state.settings.testFast = false;
    applyBonuses();
    updatePlants();
    lastSig = sigOf(state);
    SG.save(state);
    if (!state.plots[selected]) { const f = state.plots.findIndex(Boolean); selected = f >= 0 ? f : selected; }
    renderAll();
  }

  async function syncNow() {
    if (!syncOn() || syncBusy) return;
    clearTimeout(syncTimer);
    syncBusy = true;
    setSyncStatus('busy');
    try {
      updatePlants();
      persist();                               // lokale Änderungen vorher sichern
      const res = await Sync.sync(state, { askOverwrite });
      if (res.action === 'pulled' || res.action === 'merged') {
        adoptState(res.state);
        if (res.action === 'merged') toast('🔄 Änderungen von deinen Geräten wurden zusammengeführt.', '');
      }
      setSyncStatus('ok');
    } catch (e) {
      console.warn('Synchronisation fehlgeschlagen:', e);
      setSyncStatus('error', navigator.onLine === false ? 'Offline – wird später nachgeholt.' : e.message);
    } finally {
      syncBusy = false;
    }
  }

  function renderSyncBadge() {
    const b = $('#syncBadge');
    if (!b) return;
    const on = syncOn();
    b.hidden = !on;
    if (!on) return;
    const st = syncStatus.state;
    b.dataset.state = st;
    b.textContent = st === 'busy' ? '🔄' : st === 'error' ? '⚠️' : '☁️';
    const last = Sync.info().lastSync;
    b.title = st === 'error' ? `Synchronisation: ${syncStatus.msg}`
      : st === 'busy' ? 'Synchronisiere …'
      : `Synchronisiert${last ? ' um ' + new Date(last).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : ''} – klicken zum Abgleichen`;
  }

  function renderSyncSettings() {
    const inTest = SG.isTest();
    const conn = !!Sync && Sync.configured();
    if (Sync) $('#syncTokenLink').href = Sync.tokenUrl;
    $('#syncTestNote').hidden = !inTest;
    $('#syncConnectArea').hidden = conn;
    $('#syncActiveArea').hidden = !conn;
    if (conn) {
      const info = Sync.info();
      const last = info.lastSync ? new Date(info.lastSync).toLocaleString('de-DE') : 'noch nie';
      $('#syncInfo').innerHTML = `Verbunden mit GitHub als <strong>${esc(info.login || '?')}</strong>. Letzter Abgleich: ${esc(last)}.` +
        (syncStatus.state === 'error' ? `<br><span class="sync-error">⚠️ ${esc(syncStatus.msg)}</span>` : '');
    }
  }

  async function connectSync() {
    const input = $('#syncToken');
    const btn = $('#syncConnectBtn');
    btn.disabled = true;
    $('#syncConnectMsg').textContent = 'Verbinde mit GitHub …';
    try {
      updatePlants();
      persist();
      const r = await Sync.connect(input.value, state);
      input.value = '';
      $('#syncConnectMsg').textContent = '';
      toast(`☁️ Verbunden mit GitHub (${r.login}).`, 'success');
      await syncNow();
    } catch (e) {
      $('#syncConnectMsg').textContent = '⚠️ ' + e.message;
    } finally {
      btn.disabled = false;
      renderSyncSettings();
      renderSyncBadge();
    }
  }

  /** In die Testumgebung wechseln bzw. sie verlassen (lädt die Seite neu) */
  function switchEnvironment(toTest) {
    if (toTest) {
      if (T().running) pauseTimer();   // echter Timer wird pausiert und bleibt erhalten
      persist();
      switching = true;
      SG.startTest(state);
    } else {
      switching = true;
      SG.exitTest();
    }
    location.reload();
  }

  function toast(msg, kind = '') {
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), 3200);
    setTimeout(() => el.remove(), 3700);
  }

  function coinFloat(amount) {
    const target = $('.coins');
    const r = target.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = 'coin-float ' + (amount < 0 ? 'neg' : '');
    el.textContent = (amount > 0 ? '+' : '') + amount + ' 🪙';
    el.style.left = (r.left + r.width / 2) + 'px';
    el.style.top = (r.bottom + 4) + 'px';
    document.body.appendChild(el);
    target.classList.remove('bump'); void target.offsetWidth; target.classList.add('bump');
    setTimeout(() => el.remove(), 1400);
  }

  function spend(amount) {
    if (state.settings.testCoins) { coinFloat(-amount); return true; } // Testmodus: Münzen unbegrenzt
    if (state.coins < amount) {
      toast(`Dir fehlen ${amount - state.coins} 🪙 – Zeit für eine Fokuseinheit!`, 'warn');
      return false;
    }
    state.coins -= amount;
    coinFloat(-amount);
    return true;
  }

  /** Text sicher in HTML einsetzen */
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function earn(amount) {
    state.coins += amount;
    state.totalEarned += amount;
    coinFloat(amount);
  }

  /* ---------- Ton & Benachrichtigung ---------- */

  function ensureAudio() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audioCtx = null; }
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }

  function chime(up) {
    if (!state.settings.sound) return;
    ensureAudio();
    if (!audioCtx) return;
    const notes = up ? [523.25, 659.25, 783.99] : [783.99, 659.25, 523.25];
    const t0 = audioCtx.currentTime + 0.02;
    notes.forEach((f, i) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = 'sine';
      o.frequency.value = f;
      const t = t0 + i * 0.18;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      o.connect(g).connect(audioCtx.destination);
      o.start(t);
      o.stop(t + 0.55);
    });
  }

  function notify(title, body) {
    if (!state.settings.notify || !('Notification' in window)) return;
    if (Notification.permission === 'granted' && document.hidden) {
      try { new Notification(title, { body, icon: undefined }); } catch (e) { /* ignorieren */ }
    }
  }

  /* ---------- Fokus-Musik ---------- */

  const Music = window.FocusMusic;
  let previewStyle = null, previewTimer = null;

  /** Welcher Stil soll gerade laufen? (Fokuszeit läuft → gewählter Stil; sonst ggf. Hörprobe) */
  function wantedMusic() {
    const s = state.settings.music;
    if (T().mode === 'focus' && T().running && s && s !== 'off') return s;
    return previewStyle;
  }

  function syncMusic() {
    if (!Music) return;
    const want = wantedMusic();
    if (want && Music.style !== want) { Music.setVolume(state.settings.musicVolume / 100); Music.play(want); renderMusic(); }
    else if (!want && Music.playing) { Music.stop(); renderMusic(); }
  }

  function chooseMusic(style) {
    state.settings.music = style;
    persist();
    clearTimeout(previewTimer);
    previewStyle = null;
    // Außerhalb der Fokuszeit: kurze Hörprobe
    const focusRunning = T().mode === 'focus' && T().running;
    if (style !== 'off' && !focusRunning) {
      previewStyle = style;
      previewTimer = setTimeout(() => { previewStyle = null; syncMusic(); renderMusic(); }, 8000);
    }
    syncMusic();
    renderMusic();
  }

  function renderMusic() {
    if (!Music) { $('#musicBar').hidden = true; return; }
    const s = state.settings.music || 'off';
    document.querySelectorAll('.music-chip').forEach(b => {
      const on = b.dataset.music === s;
      b.classList.toggle('active', on);
      b.setAttribute('aria-checked', on);
    });
    $('#musicVolume').value = state.settings.musicVolume;
    const name = k => Music.STYLES[k] ? Music.STYLES[k].name : '';
    let note;
    if (s === 'off') note = 'Keine Musik';
    else if (previewStyle) note = `Hörprobe: ${name(previewStyle)} …`;
    else if (Music.playing) note = `♪ Läuft: ${name(Music.style)}`;
    else note = 'Startet automatisch mit der Fokuszeit';
    $('#musicNote').textContent = note;
  }

  /* ---------- Timer ---------- */

  const T = () => state.timer;

  function setMode(mode) {
    // Ein neuer Zyklus beginnt, sobald nach der langen Pause wieder fokussiert wird
    if (mode === 'focus' && state.cycleCount >= state.settings.longEvery) state.cycleCount = 0;
    T().mode = mode;
    T().fast = !!state.settings.testFast;
    T().duration = state.settings[mode] * (T().fast ? 1 : 60);
    T().remaining = T().duration;
    T().running = false;
    T().endAt = null;
  }

  /** Fokusminuten einer Phase (im Schnelltimer zählt jede Sekunde als Minute) */
  function timerMinutes(t) {
    return t.fast ? t.duration : Math.round(t.duration / 60);
  }

  function startTimer() {
    ensureAudio();
    if (T().running) return;
    if (T().remaining <= 0) T().remaining = T().duration;
    T().endAt = now() + T().remaining * 1000;
    T().running = true;
    T().device = DEVICE_ID;            // dieses Gerät schließt die Phase ab (gegen doppelte Münzen)
    persist();
    renderTimer();
  }

  function pauseTimer() {
    if (!T().running) return;
    T().remaining = Math.max(0, Math.ceil((T().endAt - now()) / 1000));
    T().running = false;
    T().endAt = null;
    persist();
    renderTimer();
  }

  function isFocusInProgress() {
    return T().mode === 'focus' && (T().running || T().remaining < T().duration);
  }

  function confirmAbortFocus() {
    return !isFocusInProgress() ||
      confirm('Laufende Fokuszeit abbrechen? Für abgebrochene Einheiten gibt es keine Münzen.');
  }

  function nextModeAfterFocus() {
    return state.cycleCount >= state.settings.longEvery ? 'long' : 'short';
  }

  /** Phase regulär beendet */
  function completePhase() {
    const finished = T().mode;
    if (finished === 'focus') {
      const minutes = timerMinutes(T());
      state.sessionsCompleted += 1;
      state.totalFocusMinutes += minutes;
      state.cycleCount += 1;
      const k = dateKey();
      state.history[k] = (state.history[k] || 0) + minutes;
      const fr = focusReward(minutes);
      let reward = fr.total;
      const cycleDone = state.cycleCount >= state.settings.longEvery;
      if (cycleDone) reward += CYCLE_BONUS;
      earn(reward);
      const extraTxt = fr.extra > 0 ? ` (davon ${fr.extra} 🪙 Sammlungs-Bonus)` : '';
      toast(cycleDone
        ? `Stark! Fokus + Zyklus-Bonus: ${reward} 🪙${extraTxt}. Gönn dir eine lange Pause.`
        : `Fokuszeit geschafft! Du erhältst ${reward} 🪙${extraTxt}.`, 'success');
      notify('Fokuszeit geschafft! 🌱', `+${reward} Münzen. Zeit für eine Pause.`);
      chime(true);
      setMode(nextModeAfterFocus());
    } else {
      toast('Pause vorbei – weiter geht’s!', '');
      notify('Pause vorbei ⏰', 'Bereit für die nächste Fokuseinheit?');
      chime(false);
      setMode('focus');
    }
    if (state.settings.autoStart) startTimer();
    persist();
    renderAll();
  }

  function skipPhase() {
    if (T().mode === 'focus') {
      if (!confirmAbortFocus()) return;
      setMode('short');
    } else {
      setMode('focus');
    }
    persist();
    renderAll();
  }

  function resetTimer() {
    if (T().mode === 'focus' && !confirmAbortFocus()) return;
    setMode(T().mode);
    persist();
    renderTimer();
  }

  function tick() {
    if (!T().running) return;
    T().remaining = Math.max(0, Math.ceil((T().endAt - now()) / 1000));
    if (T().remaining > 0) { renderTimer(); return; }
    // Phase auf einem anderen Gerät gestartet? Dann schließt das andere Gerät sie ab.
    // Erst wenn es sich 90 Sekunden lang nicht meldet, übernimmt dieses Gerät.
    if (syncOn() && T().device && T().device !== DEVICE_ID && now() - T().endAt < 90000) {
      renderTimer();
      $('#modeLabel').textContent = 'Wird auf dem anderen Gerät abgeschlossen …';
      if (!foreignWait) { foreignWait = true; setTimeout(() => { foreignWait = false; syncNow(); }, 5000); }
      return;
    }
    completePhase();
  }

  /* ---------- Garten ---------- */

  function updatePlants() {
    const t = now();
    state.plots.forEach(p => { if (p) P.applyDecay(p, t); });
  }

  function openShop(i) {
    shopPlot = i;
    const list = $('#shopList');
    list.innerHTML = Object.entries(P.PLANT_TYPES).map(([key, t]) => `
      <button type="button" class="shop-item" data-type="${key}" ${state.coins < t.seedCost && !state.settings.testCoins ? 'data-poor' : ''}>
        <span class="shop-preview">${P.plantSVG(key, 5, 'happy')}</span>
        <span class="shop-text">
          <strong>${t.emoji} ${t.name}</strong>
          <span class="muted small">${t.desc}</span>
          <span class="shop-meta small">Gießen: ${t.waterCost} 🪙 · Durst: ${'💧'.repeat(Math.round(t.decay / 1.3))}</span>
          <span class="shop-meta small">🏆 Ernte: <strong>${t.harvest} 🪙</strong> + Bonus: ${P.BONUS_INFO[key].per}</span>
        </span>
        <span class="price">${t.seedCost} 🪙</span>
      </button>`).join('');
    $('#shopDialog').showModal();
  }

  function buySeed(type) {
    const t = P.PLANT_TYPES[type];
    if (shopPlot === null || state.plots[shopPlot]) return;
    if (!spend(t.seedCost)) return;
    state.plots[shopPlot] = P.createPlant(type, now());
    toast(`${t.emoji} ${t.name} gepflanzt! Gieß ${t.male ? 'ihn' : 'sie'} regelmäßig.`, 'success');
    const i = shopPlot;
    shopPlot = null;
    selected = i;
    $('#shopDialog').close();
    celebrate(i, 2500);
    persist();
    renderGarden();
    animatePlot(i, 'pop');
  }

  function waterPlant(i) {
    const p = state.plots[i];
    if (!p) return;
    P.applyDecay(p, now());
    const check = P.canWater(p, state.settings.testNoWait);
    if (!check.ok) { toast(check.reason, 'warn'); return; }
    if (!spend(P.PLANT_TYPES[p.type].waterCost)) return;
    const before = P.stageFor(p.type, p.growth);
    const wasWilted = P.plantStatus(p) === 'welk';
    p.water = Math.min(P.RULES.waterMax, Math.max(0, p.water) + P.RULES.waterAmount);
    p.waterings = (p.waterings || 0) + 1;
    if (!wasWilted) p.growth += 1; // eine welke Pflanze muss sich erst erholen
    else toast('Deine Pflanze erholt sich wieder 💚', '');
    celebrate(i);
    afterGrowth(i, before);
    animatePlot(i, 'water');
  }

  function fertilizePlant(i) {
    const p = state.plots[i];
    if (!p) return;
    P.applyDecay(p, now());
    const check = P.canFertilize(p, now(), state.settings.testNoWait);
    if (!check.ok) { toast(check.reason, 'warn'); return; }
    if (!spend(P.RULES.fertilizerCost)) return;
    const before = P.stageFor(p.type, p.growth);
    p.growth += P.RULES.fertilizerGrowth;
    p.lastFertilized = now();
    celebrate(i);
    afterGrowth(i, before);
    animatePlot(i, 'sparkle');
  }

  function afterGrowth(i, before) {
    const p = state.plots[i];
    const max = P.PLANT_TYPES[p.type].thresholds[P.MAX_STAGE];
    p.growth = Math.min(p.growth, max);
    const after = P.stageFor(p.type, p.growth);
    persist();
    renderGarden();
    if (after > before) {
      const t = P.PLANT_TYPES[p.type];
      toast(after === P.MAX_STAGE
        ? `🎉 ${t.male ? 'Dein' : 'Deine'} ${t.name} ${t.type === 'pilz' ? 'ist voll ausgewachsen' : 'blüht'}! Du kannst ${t.male ? 'ihn' : 'sie'} in deine Sammlung aufnehmen.`
        : `🌱 ${t.male ? 'Dein' : 'Deine'} ${t.name} ist gewachsen: ${P.STAGE_NAMES[after]}`, 'success');
      animatePlot(i, 'pop');
    }
  }

  function harvestPlant(i) {
    const p = state.plots[i];
    if (!p || P.stageFor(p.type, p.growth) < P.MAX_STAGE) return;
    const t = P.PLANT_TYPES[p.type];
    const info = P.BONUS_INFO[p.type];
    const nBefore = bonuses.counts[p.type] || 0;
    if (scene) scene.harvest(i, t.harvest);   // Münzen sprudeln aus der Pflanze
    updatePlants();                       // bisherige Zeit noch mit den alten Boni abrechnen
    state.collection.push({ type: p.type, plantedAt: p.plantedAt, grownAt: now() });
    state.plots[i] = null;
    applyBonuses();
    earn(t.harvest);
    toast(`🏆 ${t.name} geerntet: +${t.harvest} 🪙! Bonus jetzt: ${info.total(nBefore + 1)}.`, 'success');
    persist();
    renderGarden();
    renderCollection();
    renderTimer();
  }

  function animatePlot(i, kind) {
    if (scene) scene.effect(i, kind);
  }

  function celebrate(i, ms = 4000) {
    celebrateUntil[i] = now() + ms;
    setTimeout(renderGarden, ms + 50);
  }

  /* ---------- Rendering ---------- */

  function renderCoins() {
    const test = state.settings.testCoins;
    $('#coinCount').textContent = test ? '∞' : state.coins.toLocaleString('de-DE');
    $('.coins').title = test ? 'Testumgebung: unbegrenzte Münzen' : 'Deine Münzen';
    const inTest = SG.isTest();
    $('#testBadge').hidden = !inTest;
    $('#testBanner').hidden = !inTest;
    document.body.classList.toggle('test-env', inTest);
  }

  /** Während eine Fokuszeit läuft, wird der Garten ausgeblendet */
  function applyFocusMode() {
    const on = T().mode === 'focus' && T().running;
    if (focusModeWanted === on) return;
    focusModeWanted = on;
    // Immer den zuletzt gewünschten Zustand anwenden (Übergänge laufen zeitversetzt)
    const apply = () => document.body.classList.toggle('focus-mode', focusModeWanted);
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (document.startViewTransition && !reduce && !document.hidden) {
      const vt = document.startViewTransition(apply);
      // Wird ein Übergang durch einen neuen abgelöst, ist das kein Fehler
      [vt.ready, vt.finished, vt.updateCallbackDone].forEach(pr => pr && pr.catch(() => {}));
    } else apply();
  }

  function renderTimer() {
    const t = T();
    document.body.dataset.mode = t.mode;
    applyFocusMode();
    syncMusic();
    $('#timeDisplay').textContent = fmtTime(t.remaining);
    $('#modeLabel').textContent = MODE_INFO[t.mode].label + (t.running ? '' : (t.remaining < t.duration ? ' · pausiert' : ''));
    const frac = t.duration ? t.remaining / t.duration : 0;
    const ring = $('#ringProgress');
    ring.style.strokeDasharray = RING_C;
    ring.style.strokeDashoffset = RING_C * (1 - frac);
    $('#startBtn').textContent = t.running ? 'Pause' : (t.remaining < t.duration ? 'Fortsetzen' : 'Start');
    document.querySelectorAll('.mode-tab').forEach(b => {
      const on = b.dataset.mode === t.mode;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on);
    });
    document.title = t.running || t.remaining < t.duration
      ? `${fmtTime(t.remaining)} · ${MODE_INFO[t.mode].tab} – Fokusgarten`
      : 'Fokusgarten';

    // Hinweis
    let hint;
    if (t.mode === 'focus') {
      const mins = timerMinutes(t);
      const fr = focusReward(mins);
      const bonus = state.cycleCount + 1 >= state.settings.longEvery;
      hint = `Diese Fokuseinheit bringt dir <strong>${fr.total} 🪙</strong>` +
        (fr.extra > 0 ? ` (inkl. ${fr.extra} 🪙 Sammlungs-Bonus)` : '') +
        (bonus ? ` + <strong>${CYCLE_BONUS} 🪙</strong> Zyklus-Bonus` : '') + '.';
    } else {
      hint = t.mode === 'long'
        ? 'Lange Pause – beweg dich, iss etwas, schau in die Ferne.'
        : 'Kurze Pause – steh auf und trink ein Glas Wasser. Deine Pflanzen freuen sich auch darüber.';
    }
    $('#timerHint').innerHTML = hint;

    // Zyklus-Punkte
    const dots = $('#cycleDots');
    const n = state.settings.longEvery;
    const done = Math.min(state.cycleCount, n);
    let html = '';
    for (let k = 0; k < n; k++) html += `<span class="dot ${k < done ? 'done' : ''} ${k === done && t.mode === 'focus' ? 'current' : ''}"></span>`;
    dots.innerHTML = html;
    dots.title = `${done} von ${n} Fokuseinheiten bis zur langen Pause`;
  }

  function streak() {
    let d = new Date();
    if (!state.history[dateKey(d)]) d.setDate(d.getDate() - 1);
    let n = 0;
    while (state.history[dateKey(d)] > 0) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  /** Minuten als lesbare Dauer: "45 Min.", "3 Std. 20 Min." */
  function fmtDuration(min) {
    min = Math.round(min || 0);
    if (min < 60) return `${min} Min.`;
    const h = Math.floor(min / 60), m = min % 60;
    return m ? `${h.toLocaleString('de-DE')} Std. ${m} Min.` : `${h.toLocaleString('de-DE')} Std.`;
  }

  /** Kompakt für Kacheln: "45 Min." bzw. "12,5 Std." */
  function fmtCompact(min) {
    min = Math.round(min || 0);
    if (min < 60) return `${min} Min.`;
    const h = min / 60;
    return `${(h >= 100 ? Math.round(h) : Math.round(h * 10) / 10).toLocaleString('de-DE')} Std.`;
  }

  /** Sehr kurz für Balkenbeschriftungen: "45m", "3,5h" */
  function fmtBar(min) {
    if (!min) return '';
    if (min < 60) return `${Math.round(min)}m`;
    const h = min / 60;
    return `${(h >= 10 ? Math.round(h) : Math.round(h * 10) / 10).toLocaleString('de-DE')}h`;
  }

  /** Tageswerte zu Monaten und Jahren zusammenfassen */
  function aggregateHistory() {
    const byMonth = {}, byYear = {};
    let total = 0, bestDay = null, first = null;
    Object.entries(state.history).forEach(([k, v]) => {
      if (!(v > 0)) return;
      total += v;
      const ym = k.slice(0, 7), y = k.slice(0, 4);
      byMonth[ym] = (byMonth[ym] || 0) + v;
      byYear[y] = (byYear[y] || 0) + v;
      if (!bestDay || v > bestDay.v) bestDay = { k, v };
      if (!first || k < first) first = k;
    });
    let bestMonth = null;
    Object.entries(byMonth).forEach(([k, v]) => { if (!bestMonth || v > bestMonth.v) bestMonth = { k, v }; });
    return { byMonth, byYear, total, bestDay, bestMonth, first };
  }

  const monthKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  const keyToDate = k => new Date(+k.slice(0, 4), +k.slice(5, 7) - 1, k.length > 7 ? +k.slice(8, 10) : 1);

  function barChart(items, minScale) {
    const max = Math.max(minScale, ...items.map(x => x.value));
    const el = $('#statsChart');
    el.style.setProperty('--n', items.length);
    el.innerHTML = items.map(x => `
      <div class="bar-col ${x.current ? 'today' : ''}" title="${x.title}">
        <span class="bar-val">${fmtBar(x.value)}</span>
        <div class="bar"><span style="height:${(x.value / max) * 100}%"></span></div>
        <span class="bar-day">${x.label}</span>
      </div>`).join('');
    el.setAttribute('aria-label', items.map(x => x.title).join(', '));
  }

  function renderStats() {
    const agg = aggregateHistory();
    const today = new Date();
    const thisMonth = monthKey(today), thisYear = String(today.getFullYear());

    $('#statToday').textContent = fmtCompact(state.history[dateKey()] || 0);
    $('#statMonth').textContent = fmtCompact(agg.byMonth[thisMonth] || 0);
    $('#statMonthLabel').textContent = today.toLocaleDateString('de-DE', { month: 'long' });
    $('#statYear').textContent = fmtCompact(agg.byYear[thisYear] || 0);
    $('#statYearLabel').textContent = thisYear;
    $('#statTotal').textContent = fmtCompact(agg.total);

    document.querySelectorAll('.seg-btn').forEach(b => {
      const on = b.dataset.view === statsView;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on);
    });

    let caption = '';
    if (statsView === 'week') {
      const items = [];
      for (let k = 6; k >= 0; k--) {
        const d = new Date(); d.setDate(d.getDate() - k);
        const v = state.history[dateKey(d)] || 0;
        items.push({
          value: v, current: k === 0,
          label: d.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', ''),
          title: `${d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}: ${fmtDuration(v)}`
        });
      }
      barChart(items, 60);
      const sum = items.reduce((a, x) => a + x.value, 0);
      caption = `Letzte 7 Tage: <strong>${fmtDuration(sum)}</strong> · Ø ${fmtDuration(sum / 7)} pro Tag`;
    } else if (statsView === 'month') {
      const items = [];
      for (let k = 11; k >= 0; k--) {
        const d = new Date(today.getFullYear(), today.getMonth() - k, 1);
        const v = agg.byMonth[monthKey(d)] || 0;
        items.push({
          value: v, current: k === 0,
          label: d.toLocaleDateString('de-DE', { month: 'short' }).replace('.', '').slice(0, 3),
          title: `${d.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })}: ${fmtDuration(v)}`
        });
      }
      barChart(items, 600);
      const sum = items.reduce((a, x) => a + x.value, 0);
      caption = `Letzte 12 Monate: <strong>${fmtDuration(sum)}</strong> · Ø ${fmtDuration(sum / 12)} pro Monat`;
    } else {
      const firstYear = agg.first ? +agg.first.slice(0, 4) : today.getFullYear();
      const startYear = Math.max(firstYear, today.getFullYear() - 7);
      const items = [];
      for (let y = startYear; y <= today.getFullYear(); y++) {
        const v = agg.byYear[String(y)] || 0;
        items.push({ value: v, current: y === today.getFullYear(), label: String(y), title: `${y}: ${fmtDuration(v)}` });
      }
      barChart(items, 600);
      caption = agg.first
        ? `Gesamt: <strong>${fmtDuration(agg.total)}</strong> seit ${keyToDate(agg.first).toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })}`
        : 'Noch keine Fokuszeit – starte deine erste Einheit!';
    }
    $('#chartCaption').innerHTML = caption;

    const rec = [
      `<li><span>📝 Erledigte Aufgaben</span><strong>${(state.tasksCompleted || 0).toLocaleString('de-DE')}</strong></li>`,
      `<li><span>🔥 Serie</span><strong>${streak()} ${streak() === 1 ? 'Tag' : 'Tage'} in Folge</strong></li>`,
      `<li><span>✅ Fokuseinheiten</span><strong>${state.sessionsCompleted.toLocaleString('de-DE')}</strong></li>`
    ];
    if (agg.bestDay) rec.push(`<li><span>🏅 Bester Tag</span><strong>${fmtDuration(agg.bestDay.v)} <span class="muted">(${keyToDate(agg.bestDay.k).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' })})</span></strong></li>`);
    if (agg.bestMonth) rec.push(`<li><span>📅 Bester Monat</span><strong>${fmtDuration(agg.bestMonth.v)} <span class="muted">(${keyToDate(agg.bestMonth.k).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' })})</span></strong></li>`);
    $('#records').innerHTML = rec.join('');
  }

  function renderGarden() {
    renderCoins();
    const t = now();
    const infos = state.plots.map((p, i) => {
      if (!p) return null;
      const stage = P.stageFor(p.type, p.growth);
      const type = P.PLANT_TYPES[p.type];
      return {
        type: p.type, stage, status: P.plantStatus(p), grown: stage >= P.MAX_STAGE,
        mood: P.moodFor(p, (celebrateUntil[i] || 0) > t),
        label: `Beet ${i + 1}: ${type.name}, ${P.STAGE_NAMES[stage]}, Wasser ${Math.round(p.water)} %`
      };
    });
    if (scene) scene.update(infos, selected);
    renderPanel();

    const planted = state.plots.filter(Boolean).length;
    const thirsty = state.plots.filter(p => p && P.plantStatus(p) !== 'gesund').length;
    $('#gardenSummary').textContent = `${planted}/${state.plots.length} Beete bepflanzt` + (thirsty ? ` · ${thirsty} brauchen Wasser` : '');
  }

  function renderPanel() {
    const i = selected;
    const p = state.plots[i];
    const panel = $('#plantPanel');
    if (!p) {
      panel.innerHTML = `<div class="panel-row">
        <div class="panel-info">
          <div class="plot-title"><span>🟫 Beet ${i + 1} ist frei</span></div>
          <p class="muted small panel-text">Pflanze einen Samen. Gegossen wird mit den Münzen aus deinen Fokuszeiten.</p>
        </div>
        <div class="plot-actions"><button type="button" class="btn btn-primary" data-action="plant" data-i="${i}">🌱 Samen pflanzen</button></div>
      </div>`;
      return;
    }
    const t = now();
    const type = P.PLANT_TYPES[p.type];
    const stage = P.stageFor(p.type, p.growth);
    const status = P.plantStatus(p);
    const grown = stage >= P.MAX_STAGE;
    const water = Math.max(0, Math.round(p.water));
    const prog = Math.round(P.stageProgress(p.type, p.growth) * 100);
    const wCheck = P.canWater(p, state.settings.testNoWait);
    const fCheck = P.canFertilize(p, t, state.settings.testNoWait);
    const badge = status === 'welk' ? '<span class="badge bad">Welk</span>'
      : status === 'durstig' ? '<span class="badge warn">Durstig</span>'
      : grown ? '<span class="badge gold">Blüht</span>' : '<span class="badge ok">Glücklich</span>';
    let note;
    if (status === 'welk') note = 'Gieß mich, damit ich mich erhole!';
    else if (grown) {
      const nNow = bonuses.counts[p.type] || 0;
      note = `Ausgewachsen! Ernte bringt <strong>${type.harvest} 🪙</strong>. Bonus danach: ${P.BONUS_INFO[p.type].total(nNow + 1)}.`;
    }
    else note = 'Gießen: +1 Wachstum · Dünger: +' + P.RULES.fertilizerGrowth + ' Wachstum';

    // Wartezeiten
    const noWait = state.settings.testNoWait;
    const dur = ms => P.formatDuration(ms);
    const waterWait = noWait ? 0 : P.waterReadyIn(p);
    const waterTimes = [
      status === 'welk' ? '<span class="wait bad">🥀 Welk – jetzt gießen!</span>'
        : waterWait > 0 ? `<span class="wait">💧 Gießen in <strong>${dur(waterWait)}</strong></span>`
        : '<span class="wait ok">💧 Gießen jetzt möglich</span>',
      status === 'welk' ? ''
        : status === 'durstig' ? `<span class="wait warn">⏳ Welkt in <strong>${dur(P.msUntilWilt(p))}</strong></span>`
        : `<span class="wait">⏳ Durstig in <strong>${dur(P.msUntilWater(p, P.RULES.thirstyBelow))}</strong></span>`
    ];
    let growTimes;
    if (grown) {
      growTimes = ['<span class="wait ok">🌸 Voll erblüht</span>'];
    } else {
      const fertWait = noWait ? 0 : P.fertilizerReadyIn(p, t);
      const toNext = type.thresholds[stage + 1] - p.growth;
      growTimes = [
        status === 'welk' ? '<span class="wait">🌿 Dünger erst nach dem Gießen</span>'
          : fertWait > 0 ? `<span class="wait">🌿 Dünger in <strong>${dur(fertWait)}</strong></span>`
          : '<span class="wait ok">🌿 Düngen jetzt möglich</span>',
        `<span class="wait">⬆️ Nächste Stufe: noch <strong>${toNext}</strong> ${toNext === 1 ? 'Punkt' : 'Punkte'}</span>`
      ];
    }

    const waterBtn = `<button type="button" class="btn btn-water" data-action="water" data-i="${i}" ${wCheck.ok ? '' : 'disabled'} title="${wCheck.ok ? 'Gießen: +' + P.RULES.waterAmount + ' % Wasser, +1 Wachstum' : wCheck.reason}">💧 Gießen <span class="cost">${type.waterCost} 🪙</span></button>`;
    const actions = grown
      ? `<button type="button" class="btn btn-gold" data-action="harvest" data-i="${i}">🏆 Ernten <span class="cost">+${type.harvest} 🪙</span></button>${waterBtn}`
      : `${waterBtn}<button type="button" class="btn btn-fert" data-action="fertilize" data-i="${i}" ${fCheck.ok ? '' : 'disabled'} title="${fCheck.ok ? 'Düngen: +' + P.RULES.fertilizerGrowth + ' Wachstum' : fCheck.reason}">🌿 Düngen <span class="cost">${P.RULES.fertilizerCost} 🪙</span></button>`;

    panel.innerHTML = `<div class="panel-row status-${status} ${grown ? 'grown' : ''}">
      <div class="panel-info">
        <div class="plot-title"><span>${type.emoji} ${type.name}</span>${badge}</div>
        <div class="plot-stage muted small">Beet ${i + 1} · Stufe ${stage + 1}/${P.MAX_STAGE + 1} · ${P.STAGE_NAMES[stage]}</div>
        <div class="meters">
          <div><div class="meter-label small"><span>Wasser</span><span>${water} %</span></div>
            <div class="meter water ${status !== 'gesund' ? 'low' : ''}"><span style="width:${water}%"></span></div>
            <div class="waits">${waterTimes.join('')}</div></div>
          <div><div class="meter-label small"><span>Wachstum</span><span>${grown ? '✓ fertig' : prog + ' %'}</span></div>
            <div class="meter growth"><span style="width:${grown ? 100 : prog}%"></span></div>
            <div class="waits">${growTimes.join('')}</div></div>
        </div>
        <div class="plot-note small">${note}</div>
      </div>
      <div class="plot-actions">${actions}</div>
    </div>`;
  }

  function selectPlot(i) {
    selected = i;
    renderGarden();
    if (!state.plots[i]) openShop(i);
  }

  function renderCollection() {
    const c = state.collection;
    $('#collectionCount').textContent = c.length ? `${c.length} ${c.length === 1 ? 'Pflanze' : 'Pflanzen'}` : '';
    $('#bonusList').innerHTML = Object.entries(P.PLANT_TYPES).map(([key, t]) => {
      const n = bonuses.counts[key] || 0;
      const info = P.BONUS_INFO[key];
      return `<div class="bonus ${n ? 'on' : ''}" title="${t.male ? 'Jeder' : 'Jede'} ${t.name} in der Sammlung: ${info.per} – jeweils vom aktuellen Wert">
        <span class="bonus-head"><span>${t.emoji} ${t.name}</span><span class="bonus-count">×${n}</span></span>
        <span class="bonus-text">${n ? info.total(n) : info.per}</span>
        <span class="bonus-bar" title="${Math.round(info.progress(n) * 100)} % des Höchstwerts"><span style="width:${(info.progress(n) * 100).toFixed(1)}%"></span></span>
        <span class="bonus-next">Mit der nächsten: ${info.total(n + 1)}</span>
      </div>`;
    }).join('');
    $('#collection').innerHTML = c.length
      ? c.slice().reverse().map(x => `
          <div class="trophy" title="${P.PLANT_TYPES[x.type].name} · ausgewachsen am ${new Date(x.grownAt).toLocaleDateString('de-DE')}">
            ${P.plantSVG(x.type, 5, 'joy')}
          </div>`).join('')
      : '<p class="muted small empty-note">Noch leer. Lass eine Pflanze bis zur Blüte wachsen und ernte sie – das bringt Münzen und einen dauerhaften Bonus.</p>';
  }

  /* ---------- Aufgaben ---------- */

  function addTodo(text) {
    text = text.trim().replace(/\s+/g, ' ');
    if (!text) return;
    state.todos.push({ id: 't' + now().toString(36) + Math.random().toString(36).slice(2, 6), text, done: false, createdAt: now(), doneAt: null });
    persist();
    renderTodos();
  }

  function completeTodo(id) {
    const t = state.todos.find(x => x.id === id);
    if (!t || t.done) return;
    t.done = true;
    t.doneAt = now();
    state.tasksCompleted = (state.tasksCompleted || 0) + 1;
    earn(TASK_REWARD);
    chime(true);
    toast(`✅ Aufgabe erledigt: +${TASK_REWARD} 🪙`, 'success');
    persist();
    // kurz abgehakt zeigen, dann in „Erledigt“ verschieben
    const li = document.querySelector(`#todoList [data-id="${id}"]`);
    if (li) { li.classList.add('just-done'); setTimeout(renderTodos, 650); } else renderTodos();
    renderStats();
  }

  function deleteTodo(id) {
    const t = state.todos.find(x => x.id === id);
    if (!t) return;
    if (!t.done && !confirm(`Aufgabe „${t.text}“ löschen?`)) return;
    state.todos = state.todos.filter(x => x.id !== id);
    persist();
    renderTodos();
  }

  function renderTodos() {
    const open = state.todos.filter(t => !t.done);
    const done = state.todos.filter(t => t.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
    $('#todoCount').textContent = open.length ? `${open.length} offen` : '';
    $('#todoEmpty').hidden = open.length > 0;
    $('#todoList').innerHTML = open.map(t => `
      <li class="todo-item" data-id="${t.id}">
        <button type="button" class="todo-check" data-todo="done" aria-label="„${esc(t.text)}“ erledigen (+${TASK_REWARD} Münzen)" title="Erledigt: +${TASK_REWARD} 🪙"></button>
        <span class="todo-text">${esc(t.text)}</span>
        <span class="todo-reward">+${TASK_REWARD} 🪙</span>
        <button type="button" class="todo-del" data-todo="delete" aria-label="Aufgabe löschen" title="Löschen">✕</button>
      </li>`).join('');
    $('#todoDoneWrap').hidden = done.length === 0;
    $('#todoDoneSummary').textContent = `Erledigt (${done.length})`;
    $('#todoDoneList').innerHTML = done.map(t => `
      <li class="todo-item done" data-id="${t.id}">
        <span class="todo-check checked" aria-hidden="true"></span>
        <span class="todo-text">${esc(t.text)}</span>
        <span class="todo-date muted small">${new Date(t.doneAt || t.createdAt).toLocaleDateString('de-DE', { day: 'numeric', month: 'short' })}</span>
        <button type="button" class="todo-del" data-todo="delete" aria-label="Erledigte Aufgabe entfernen" title="Entfernen">✕</button>
      </li>`).join('');
  }

  function renderAll() {
    applyBonuses();
    renderCoins();
    renderMusic();
    renderTodos();
    renderTimer();
    renderStats();
    renderGarden();
    renderCollection();
  }

  /* ---------- Einstellungen ---------- */

  function openSettings() {
    renderSyncSettings();
    const f = $('#settingsForm');
    const s = state.settings;
    f.focus.value = s.focus; f.short.value = s.short; f.long.value = s.long; f.longEvery.value = s.longEvery;
    f.autoStart.checked = s.autoStart; f.sound.checked = s.sound; f.notify.checked = s.notify;
    f.testCoins.checked = s.testCoins; f.testNoWait.checked = s.testNoWait; f.testFast.checked = s.testFast;
    const inTest = SG.isTest();
    $('#testStartArea').hidden = inTest;
    $('#testActiveArea').hidden = !inTest;
    $('#saveNote').textContent = inTest
      ? 'Du bist in der Testumgebung: Export, Import und Zurücksetzen betreffen nur die Testumgebung.'
      : 'Dein Spielstand wird automatisch im Browser gespeichert. Für eine Sicherung oder einen Gerätewechsel kannst du ihn als Datei exportieren.';
    $('#settingsDialog').showModal();
  }

  function saveSettings() {
    const f = $('#settingsForm');
    const num = (el, min, max) => Math.min(max, Math.max(min, Math.round(+el.value) || min));
    const s = state.settings;
    s.focus = num(f.focus, 1, 120);
    s.short = num(f.short, 1, 60);
    s.long = num(f.long, 1, 90);
    s.longEvery = num(f.longEvery, 2, 10);
    s.autoStart = f.autoStart.checked;
    s.sound = f.sound.checked;
    s.notify = f.notify.checked;
    // Test-Hilfen nur in der Testumgebung
    const inTest = SG.isTest();
    const fastChanged = inTest && s.testFast !== f.testFast.checked;
    s.testCoins = inTest && f.testCoins.checked;
    s.testNoWait = inTest && f.testNoWait.checked;
    s.testFast = inTest && f.testFast.checked;
    if (s.notify && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    // Neue Zeit sofort übernehmen, wenn die aktuelle Phase noch nicht begonnen hat
    if ((!T().running && T().remaining === T().duration) || fastChanged) setMode(T().mode);
    persist();
    renderAll();
    toast('Einstellungen gespeichert.', '');
  }

  /* ---------- Events ---------- */

  function bind() {
    $('#startBtn').addEventListener('click', () => (T().running ? pauseTimer() : startTimer()));
    $('#resetBtn').addEventListener('click', resetTimer);
    $('#skipBtn').addEventListener('click', skipPhase);

    document.querySelectorAll('.mode-tab').forEach(b => b.addEventListener('click', () => {
      const mode = b.dataset.mode;
      if (mode === T().mode) return;
      if (!confirmAbortFocus()) return;
      setMode(mode);
      persist();
      renderTimer();
    }));

    $('#plantPanel').addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn || btn.disabled) return;
      const i = +btn.dataset.i;
      ({ plant: openShop, water: waterPlant, fertilize: fertilizePlant, harvest: harvestPlant })[btn.dataset.action](i);
    });

    document.querySelectorAll('.seg-btn').forEach(b => b.addEventListener('click', () => {
      statsView = b.dataset.view;
      try { localStorage.setItem('fokusgarten.statsView', statsView); } catch (e) { /* ignorieren */ }
      renderStats();
    }));

    $('#shopList').addEventListener('click', e => {
      const item = e.target.closest('.shop-item');
      if (item) buySeed(item.dataset.type);
    });

    $('#todoForm').addEventListener('submit', e => {
      e.preventDefault();
      addTodo($('#todoInput').value);
      $('#todoInput').value = '';
      $('#todoInput').focus();
    });
    const onTodoClick = e => {
      const btn = e.target.closest('[data-todo]');
      if (!btn) return;
      const id = btn.closest('[data-id]').dataset.id;
      if (btn.dataset.todo === 'done') completeTodo(id);
      else deleteTodo(id);
    };
    $('#todoList').addEventListener('click', onTodoClick);
    $('#todoDoneList').addEventListener('click', onTodoClick);

    document.querySelectorAll('.music-chip').forEach(b => b.addEventListener('click', () => chooseMusic(b.dataset.music)));
    $('#musicVolume').addEventListener('input', e => {
      state.settings.musicVolume = +e.target.value;
      if (Music) Music.setVolume(state.settings.musicVolume / 100);
    });
    $('#musicVolume').addEventListener('change', persist);
    // Browser erlauben Ton erst nach einer Nutzeraktion – danach ggf. weiterspielen
    document.addEventListener('pointerdown', () => { if (Music) { Music.unlock(); syncMusic(); } });

    $('#settingsBtn').addEventListener('click', openSettings);
    // Direkt beim Klick speichern – nicht erst im 'close'-Ereignis des Dialogs,
    // das manche (eingebettete) Browser verzögert oder gar nicht auslösen.
    $('#saveSettingsBtn').addEventListener('click', e => {
      e.preventDefault();
      if (!$('#settingsForm').reportValidity()) return;
      saveSettings();
      $('#settingsDialog').close('save');
    });

    $('#exportBtn').addEventListener('click', () => { SG.exportToFile(state); toast('Spielstand exportiert.', 'success'); });
    $('#importBtn').addEventListener('click', () => $('#importFile').click());
    $('#importFile').addEventListener('change', async e => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      try {
        const imported = SG.importFromText(await file.text());
        if (!confirm('Aktuellen Spielstand durch die importierte Datei ersetzen?')) return;
        state = imported;
        applyBonuses();
        state.timer.running = false; state.timer.endAt = null;
        updatePlants();
        persist();
        $('#settingsDialog').close('cancel');
        renderAll();
        toast('Spielstand importiert.', 'success');
      } catch (err) {
        toast('Import fehlgeschlagen: ' + err.message, 'warn');
      }
    });
    $('#testStartBtn').addEventListener('click', () => switchEnvironment(true));
    const leaveTest = () => {
      if (confirm('Testumgebung verlassen? Alles darin wird verworfen und dein echter Spielstand wieder geladen.')) switchEnvironment(false);
    };
    $('#testExitBtn').addEventListener('click', leaveTest);
    $('#testExitBanner').addEventListener('click', leaveTest);
    $('#testRestartBtn').addEventListener('click', () => {
      if (!confirm('Testumgebung neu starten? Der aktuelle Testgarten wird gelöscht.')) return;
      switching = true;
      SG.startTest(state);
      location.reload();
    });

    $('#resetAllBtn').addEventListener('click', () => {
      if (SG.isTest()) { $('#testRestartBtn').click(); return; }
      if (!confirm('Wirklich alles zurücksetzen? Münzen, Pflanzen und Statistik gehen verloren. Exportiere vorher eine Sicherung, falls du sie behalten willst.')) return;
      state = SG.defaultState();
      applyBonuses();
      persist();
      $('#settingsDialog').close('cancel');
      renderAll();
      toast('Neuer Garten angelegt.', '');
    });

    document.addEventListener('keydown', e => {
      if (e.code !== 'Space' || e.target !== document.body || document.querySelector('dialog[open]')) return;
      e.preventDefault();
      T().running ? pauseTimer() : startTimer();
    });

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) { tick(); updatePlants(); renderGarden(); syncNow(); }
      persist();
    });
    window.addEventListener('online', () => syncNow());
    $('#syncBadge').addEventListener('click', () => syncNow());
    $('#syncConnectBtn').addEventListener('click', connectSync);
    $('#syncToken').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); connectSync(); } });
    $('#syncNowBtn').addEventListener('click', () => syncNow());
    $('#syncDisconnectBtn').addEventListener('click', () => {
      if (!confirm('Synchronisation auf diesem Gerät beenden? Der Spielstand bleibt hier und auf GitHub erhalten.')) return;
      Sync.disconnect();
      setSyncStatus('off');
      renderSyncSettings();
    });
    window.addEventListener('pagehide', persist);
  }

  /* ---------- Start ---------- */

  function init() {
    // Offline-Fähigkeit & Installierbarkeit (nur über http/https, nicht bei file://)
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(e => console.warn('Service Worker nicht registriert:', e));
    }
    document.body.insertAdjacentHTML('afterbegin', P.defsSVG());
    scene = window.GardenScene.create($('#scene'), selectPlot);
    applyBonuses();
    const firstPlanted = state.plots.findIndex(Boolean);
    selected = firstPlanted >= 0 ? firstPlanted : 0;
    updatePlants();
    lastSig = sigOf(state);
    // Wurde der Timer während die Seite geschlossen war beendet?
    // Mit Synchronisation erst abgleichen (vielleicht hat ein anderes Gerät die Phase schon abgeschlossen).
    if (T().running && T().endAt && T().endAt <= now() && !syncOn()) {
      T().remaining = 0;
      completePhase();
    } else if (T().running) {
      T().remaining = Math.max(0, Math.ceil((T().endAt - now()) / 1000));
    }
    persist();
    bind();
    renderAll();
    renderSyncBadge();
    if (syncOn()) syncNow().finally(() => setInterval(tick, 250));
    else setInterval(tick, 250);
    setInterval(() => { updatePlants(); renderGarden(); persist(); }, 30 * 1000);
    setInterval(() => { if (!document.hidden) syncNow(); }, 60 * 1000);
  }

  init();
})();
