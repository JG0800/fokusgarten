/* Fokusgarten – Hauptlogik: Timer, Münzen, Garten, Statistik */
(function () {
  'use strict';

  const P = window.Plants;
  const SG = window.SaveGame;
  const $ = (sel, root = document) => root.querySelector(sel);

  const CYCLE_BONUS = 10;
  const MODE_INFO = {
    focus: { label: 'Fokuszeit', tab: 'Fokus' },
    short: { label: 'Kurze Pause', tab: 'Kurze Pause' },
    long: { label: 'Lange Pause', tab: 'Lange Pause' }
  };
  const RING_C = 2 * Math.PI * 96;

  let state = SG.load();
  let audioCtx = null;
  let shopPlot = null;

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

  function persist() { SG.save(state); }

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
    if (state.coins < amount) {
      toast(`Dir fehlen ${amount - state.coins} 🪙 – Zeit für eine Fokuseinheit!`, 'warn');
      return false;
    }
    state.coins -= amount;
    coinFloat(-amount);
    return true;
  }

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

  /* ---------- Timer ---------- */

  const T = () => state.timer;

  function setMode(mode) {
    // Ein neuer Zyklus beginnt, sobald nach der langen Pause wieder fokussiert wird
    if (mode === 'focus' && state.cycleCount >= state.settings.longEvery) state.cycleCount = 0;
    T().mode = mode;
    T().duration = state.settings[mode] * 60;
    T().remaining = T().duration;
    T().running = false;
    T().endAt = null;
  }

  function startTimer() {
    ensureAudio();
    if (T().running) return;
    if (T().remaining <= 0) T().remaining = T().duration;
    T().endAt = now() + T().remaining * 1000;
    T().running = true;
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
      const minutes = Math.round(T().duration / 60);
      state.sessionsCompleted += 1;
      state.totalFocusMinutes += minutes;
      state.cycleCount += 1;
      const k = dateKey();
      state.history[k] = (state.history[k] || 0) + minutes;
      let reward = minutes;
      const cycleDone = state.cycleCount >= state.settings.longEvery;
      if (cycleDone) reward += CYCLE_BONUS;
      earn(reward);
      toast(cycleDone
        ? `Stark! ${minutes} Minuten Fokus + Zyklus-Bonus: ${reward} 🪙. Gönn dir eine lange Pause.`
        : `Fokuszeit geschafft! Du erhältst ${reward} 🪙.`, 'success');
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
    if (T().remaining <= 0) completePhase();
    else renderTimer();
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
      <button type="button" class="shop-item" data-type="${key}" ${state.coins < t.seedCost ? 'data-poor' : ''}>
        <span class="shop-preview">${P.plantSVG(key, 5, false)}</span>
        <span class="shop-text">
          <strong>${t.emoji} ${t.name}</strong>
          <span class="muted small">${t.desc}</span>
          <span class="shop-meta small">Gießen: ${t.waterCost} 🪙 · Durst: ${'💧'.repeat(Math.round(t.decay / 1.3))}</span>
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
    toast(`${t.emoji} ${t.name} gepflanzt! Gieß sie regelmäßig.`, 'success');
    const i = shopPlot;
    shopPlot = null;
    $('#shopDialog').close();
    persist();
    renderGarden();
    animatePlot(i, 'pop');
  }

  function waterPlant(i) {
    const p = state.plots[i];
    if (!p) return;
    P.applyDecay(p, now());
    const check = P.canWater(p);
    if (!check.ok) { toast(check.reason, 'warn'); return; }
    if (!spend(P.PLANT_TYPES[p.type].waterCost)) return;
    const before = P.stageFor(p.type, p.growth);
    const wasWilted = p.water <= 0;
    p.water = Math.min(P.RULES.waterMax, p.water + P.RULES.waterAmount);
    if (!wasWilted) p.growth += 1; // eine welke Pflanze muss sich erst erholen
    else toast('Deine Pflanze erholt sich wieder 💚', '');
    afterGrowth(i, before);
    animatePlot(i, 'splash');
  }

  function fertilizePlant(i) {
    const p = state.plots[i];
    if (!p) return;
    P.applyDecay(p, now());
    const check = P.canFertilize(p, now());
    if (!check.ok) { toast(check.reason, 'warn'); return; }
    if (!spend(P.RULES.fertilizerCost)) return;
    const before = P.stageFor(p.type, p.growth);
    p.growth += P.RULES.fertilizerGrowth;
    p.lastFertilized = now();
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
        ? `🎉 Deine ${t.name} blüht! Du kannst sie in deine Sammlung aufnehmen.`
        : `🌱 Deine ${t.name} ist gewachsen: ${P.STAGE_NAMES[after]}`, 'success');
      animatePlot(i, 'pop');
    }
  }

  function harvestPlant(i) {
    const p = state.plots[i];
    if (!p || P.stageFor(p.type, p.growth) < P.MAX_STAGE) return;
    state.collection.push({ type: p.type, plantedAt: p.plantedAt, grownAt: now() });
    state.plots[i] = null;
    toast(`🏆 ${P.PLANT_TYPES[p.type].name} wurde in die Sammlung aufgenommen.`, 'success');
    persist();
    renderGarden();
    renderCollection();
  }

  function animatePlot(i, cls) {
    const el = document.querySelector(`[data-plot="${i}"] .plot-visual`);
    if (!el) return;
    if (cls === 'splash') {
      for (let k = 0; k < 7; k++) {
        const d = document.createElement('span');
        d.className = 'drop';
        d.style.left = (30 + Math.random() * 40) + '%';
        d.style.animationDelay = (k * 0.07) + 's';
        el.appendChild(d);
        setTimeout(() => d.remove(), 1200);
      }
    }
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), 1200);
  }

  /* ---------- Rendering ---------- */

  function renderCoins() {
    $('#coinCount').textContent = state.coins.toLocaleString('de-DE');
  }

  function renderTimer() {
    const t = T();
    document.body.dataset.mode = t.mode;
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
      const mins = Math.round(t.duration / 60);
      const bonus = state.cycleCount + 1 >= state.settings.longEvery;
      hint = `Diese Fokuseinheit bringt dir <strong>${mins} 🪙</strong>${bonus ? ` + <strong>${CYCLE_BONUS} 🪙</strong> Zyklus-Bonus` : ''}.`;
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

  function renderStats() {
    $('#statToday').textContent = state.history[dateKey()] || 0;
    $('#statSessions').textContent = state.sessionsCompleted;
    $('#statStreak').textContent = streak();
    const days = [];
    for (let k = 6; k >= 0; k--) {
      const d = new Date(); d.setDate(d.getDate() - k);
      days.push({ d, min: state.history[dateKey(d)] || 0, today: k === 0 });
    }
    const max = Math.max(60, ...days.map(x => x.min));
    $('#weekChart').innerHTML = days.map(x => `
      <div class="bar-col ${x.today ? 'today' : ''}" title="${x.d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' })}: ${x.min} Min.">
        <span class="bar-val">${x.min || ''}</span>
        <div class="bar"><span style="height:${(x.min / max) * 100}%"></span></div>
        <span class="bar-day">${x.d.toLocaleDateString('de-DE', { weekday: 'short' }).replace('.', '')}</span>
      </div>`).join('');
  }

  function renderGarden() {
    renderCoins();
    const t = now();
    let planted = 0;
    $('#garden').innerHTML = state.plots.map((p, i) => {
      if (!p) {
        return `<div class="plot empty" data-plot="${i}">
          <button type="button" class="plant-btn" data-action="plant" data-i="${i}">
            <span class="plus">+</span><span>Samen pflanzen</span>
          </button></div>`;
      }
      planted++;
      const type = P.PLANT_TYPES[p.type];
      const stage = P.stageFor(p.type, p.growth);
      const status = P.plantStatus(p);
      const grown = stage >= P.MAX_STAGE;
      const water = Math.round(p.water);
      const prog = Math.round(P.stageProgress(p.type, p.growth) * 100);
      const wCheck = P.canWater(p);
      const fCheck = P.canFertilize(p, t);
      const badge = status === 'welk' ? '<span class="badge bad">Welk</span>'
        : status === 'durstig' ? '<span class="badge warn">Durstig</span>' : '';
      let note = '';
      if (status === 'welk') note = 'Gieß mich, damit ich mich erhole!';
      else if (!wCheck.ok && !grown) note = wCheck.reason;

      const actions = grown
        ? `<button type="button" class="btn btn-small btn-gold" data-action="harvest" data-i="${i}">🏆 In die Sammlung</button>
           <button type="button" class="btn btn-small" data-action="water" data-i="${i}" ${wCheck.ok ? '' : 'disabled'} title="${wCheck.ok ? 'Gießen' : wCheck.reason}">💧 Gießen <span class="cost">${type.waterCost} 🪙</span></button>`
        : `<button type="button" class="btn btn-small btn-water" data-action="water" data-i="${i}" ${wCheck.ok ? '' : 'disabled'} title="${wCheck.ok ? 'Gießen: +' + P.RULES.waterAmount + ' % Wasser, +1 Wachstum' : wCheck.reason}">💧 Gießen <span class="cost">${type.waterCost} 🪙</span></button>
           <button type="button" class="btn btn-small btn-fert" data-action="fertilize" data-i="${i}" ${fCheck.ok ? '' : 'disabled'} title="${fCheck.ok ? 'Düngen: +' + P.RULES.fertilizerGrowth + ' Wachstum' : fCheck.reason}">🌿 Düngen <span class="cost">${P.RULES.fertilizerCost} 🪙</span></button>`;

      return `<div class="plot status-${status} ${grown ? 'grown' : ''}" data-plot="${i}">
        <div class="plot-visual">${P.plantSVG(p.type, stage, status === 'welk')}</div>
        <div class="plot-title"><span>${type.emoji} ${type.name}</span>${badge}</div>
        <div class="plot-stage muted small">Stufe ${stage + 1}/${P.MAX_STAGE + 1} · ${P.STAGE_NAMES[stage]}</div>
        <div class="meter-label small"><span>Wasser</span><span>${water} %</span></div>
        <div class="meter water ${status !== 'gesund' ? 'low' : ''}"><span style="width:${water}%"></span></div>
        <div class="meter-label small"><span>Wachstum</span><span>${grown ? '✓ fertig' : prog + ' %'}</span></div>
        <div class="meter growth"><span style="width:${grown ? 100 : prog}%"></span></div>
        <div class="plot-note small">${note || (fCheck.ok || grown ? '&nbsp;' : fCheck.reason)}</div>
        <div class="plot-actions">${actions}</div>
      </div>`;
    }).join('');

    const thirsty = state.plots.filter(p => p && P.plantStatus(p) !== 'gesund').length;
    $('#gardenSummary').textContent = `${planted}/${state.plots.length} Beete bepflanzt` + (thirsty ? ` · ${thirsty} brauchen Wasser` : '');
  }

  function renderCollection() {
    const c = state.collection;
    $('#collectionCount').textContent = c.length ? `${c.length} ${c.length === 1 ? 'Pflanze' : 'Pflanzen'}` : '';
    $('#collection').innerHTML = c.length
      ? c.slice().reverse().map(x => `
          <div class="trophy" title="${P.PLANT_TYPES[x.type].name} · ausgewachsen am ${new Date(x.grownAt).toLocaleDateString('de-DE')}">
            ${P.plantSVG(x.type, 5, false)}
          </div>`).join('')
      : '<p class="muted small empty-note">Noch leer. Lass eine Pflanze bis zur Blüte wachsen und nimm sie hier auf.</p>';
  }

  function renderAll() {
    renderCoins();
    renderTimer();
    renderStats();
    renderGarden();
    renderCollection();
  }

  /* ---------- Einstellungen ---------- */

  function openSettings() {
    const f = $('#settingsForm');
    const s = state.settings;
    f.focus.value = s.focus; f.short.value = s.short; f.long.value = s.long; f.longEvery.value = s.longEvery;
    f.autoStart.checked = s.autoStart; f.sound.checked = s.sound; f.notify.checked = s.notify;
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
    if (s.notify && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
    // Neue Zeit sofort übernehmen, wenn die aktuelle Phase noch nicht begonnen hat
    if (!T().running && T().remaining === T().duration) setMode(T().mode);
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

    $('#garden').addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn || btn.disabled) return;
      const i = +btn.dataset.i;
      ({ plant: openShop, water: waterPlant, fertilize: fertilizePlant, harvest: harvestPlant })[btn.dataset.action](i);
    });

    $('#shopList').addEventListener('click', e => {
      const item = e.target.closest('.shop-item');
      if (item) buySeed(item.dataset.type);
    });

    $('#settingsBtn').addEventListener('click', openSettings);
    $('#settingsDialog').addEventListener('close', () => {
      if ($('#settingsDialog').returnValue === 'save') saveSettings();
    });
    $('#saveSettingsBtn').addEventListener('click', e => {
      if (!$('#settingsForm').reportValidity()) e.preventDefault();
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
    $('#resetAllBtn').addEventListener('click', () => {
      if (!confirm('Wirklich alles zurücksetzen? Münzen, Pflanzen und Statistik gehen verloren. Exportiere vorher eine Sicherung, falls du sie behalten willst.')) return;
      state = SG.defaultState();
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
      if (!document.hidden) { tick(); updatePlants(); renderGarden(); }
      persist();
    });
    window.addEventListener('pagehide', persist);
  }

  /* ---------- Start ---------- */

  function init() {
    updatePlants();
    // Wurde der Timer während die Seite geschlossen war beendet?
    if (T().running && T().endAt && T().endAt <= now()) {
      T().remaining = 0;
      completePhase();
    } else if (T().running) {
      T().remaining = Math.max(0, Math.ceil((T().endAt - now()) / 1000));
    }
    persist();
    bind();
    renderAll();
    setInterval(tick, 250);
    setInterval(() => { updatePlants(); renderGarden(); persist(); }, 60 * 1000);
  }

  init();
})();
