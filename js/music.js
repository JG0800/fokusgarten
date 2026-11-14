/* Fokusgarten – Fokus-Musik, live im Browser erzeugt (Web Audio, keine Audiodateien) */
(function (global) {
  'use strict';

  const STYLES = {
    meditativ: { name: 'Meditativ', icon: '🧘' },
    techno: { name: 'Fokus-Techno', icon: '🎧' },
    regen: { name: 'Regen', icon: '🌧️' }
  };

  let ctx = null, master = null, reverbIn = null, noise = null, analyser = null;
  let voice = null, voiceStyle = null, volume = 0.5, stopTimer = null;

  function ensure() {
    if (!ctx) {
      const AC = global.AudioContext || global.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
      master.connect(comp).connect(ctx.destination);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      comp.connect(analyser);
      // Hall aus einer künstlichen Impulsantwort
      const conv = ctx.createConvolver();
      conv.buffer = impulse(3.2, 2.6);
      reverbIn = ctx.createGain();
      reverbIn.gain.value = 0.4;
      reverbIn.connect(conv).connect(master);
      noise = noiseBuffer(2);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  function impulse(sec, decay) {
    const len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return buf;
  }

  function noiseBuffer(sec) {
    const len = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  /** Grundgerüst einer Stimme: eigener Ausgang + Taktgeber, der vorausplant */
  function makeVoice(tick, level = 1) {
    const out = ctx.createGain();
    out.gain.value = level;   // Lautstärke der Stile untereinander angleichen
    out.connect(master);
    const send = ctx.createGain();
    send.gain.value = 1;
    send.connect(reverbIn);
    out.connect(send);
    let planned = ctx.currentTime + 0.1;
    const state = {};
    const timer = setInterval(() => {
      const horizon = ctx.currentTime + 0.35;
      while (planned < horizon) { planned = tick(planned, out, send, state); }
    }, 60);
    return {
      stop() {
        clearInterval(timer);
        setTimeout(() => { try { out.disconnect(); send.disconnect(); } catch (e) { /* ignorieren */ } }, 2500);
      }
    };
  }

  /* ---------- Meditativ: langsame Akkordflächen + Glöckchen ---------- */

  const MED_CHORDS = [
    [110, 164.81, 196, 261.63, 329.63, 493.88],   // Am9
    [87.31, 130.81, 164.81, 220, 261.63, 329.63], // Fmaj7
    [130.81, 196, 246.94, 329.63, 392],           // Cmaj7
    [98, 146.83, 246.94, 329.63, 392]             // G6
  ];
  const MED_BELLS = [440, 523.25, 587.33, 659.25, 783.99, 880, 1046.5];

  function padNote(t, freq, dur, dest, gain) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.3;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 3);
    g.gain.setValueAtTime(gain, t + dur - 3.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    lp.connect(g).connect(dest);
    [['sine', 0], ['triangle', 5], ['triangle', -5]].forEach(([type, cents]) => {
      const o = ctx.createOscillator();
      o.type = type; o.frequency.value = freq; o.detune.value = cents;
      o.connect(lp); o.start(t); o.stop(t + dur + 0.1);
    });
  }

  function bell(t, freq, dest, gain) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    g.connect(dest);
    [[1, 1], [2.01, 0.35], [3.98, 0.12]].forEach(([mul, amp]) => {
      const o = ctx.createOscillator();
      const og = ctx.createGain();
      o.type = 'sine'; o.frequency.value = freq * mul; og.gain.value = amp;
      o.connect(og).connect(g); o.start(t); o.stop(t + 3.3);
    });
  }

  function meditativ() {
    return makeVoice((t, out, send, s) => {
      s.chord = (s.chord || 0);
      s.nextChord = s.nextChord || t;
      s.nextBell = s.nextBell || t + 2;
      if (t >= s.nextChord) {
        MED_CHORDS[s.chord % MED_CHORDS.length].forEach(f => padNote(t, f, 11, out, 0.035));
        s.chord++;
        s.nextChord = t + 9;
      }
      if (t >= s.nextBell) {
        bell(t, pick(MED_BELLS), send, 0.05);
        s.nextBell = t + rand(1.8, 5);
      }
      return t + 0.25;
    }, 1.5);
  }

  /* ---------- Fokus-Techno: 124 BPM, minimal und gleichmäßig ---------- */

  const BPM = 124, STEP = 60 / BPM / 4;   // Sechzehntel
  const ROOTS = [55, 55, 43.65, 49];       // A, A, F, G (tiefe Oktave)
  const BASS = [1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 1, 0];
  const ARP = [1, 1.5, 2, 2.996, 2, 1.5, 2.378, 2];

  function kick(t, dest) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.9, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
    o.connect(g).connect(dest); o.start(t); o.stop(t + 0.4);
  }

  function noiseHit(t, dest, { type = 'highpass', freq = 7000, q = 0.7, gain = 0.2, decay = 0.05 } = {}) {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
    src.connect(f).connect(g).connect(dest);
    src.start(t, Math.random() * 1.5); src.stop(t + decay + 0.02);
  }

  function bassNote(t, freq, cutoff, dest) {
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o.frequency.value = freq;
    f.type = 'lowpass'; f.frequency.setValueAtTime(cutoff, t); f.frequency.exponentialRampToValueAtTime(120, t + 0.12); f.Q.value = 6;
    g.gain.setValueAtTime(0.32, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    o.connect(f).connect(g).connect(dest); o.start(t); o.stop(t + 0.15);
  }

  function pluck(t, freq, dest, gain) {
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = freq;
    f.type = 'lowpass'; f.frequency.value = 2400;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(f).connect(g).connect(dest); o.start(t); o.stop(t + 0.25);
  }

  function techno() {
    return makeVoice((t, out, send, s) => {
      s.step = s.step || 0;
      const i = s.step % 16, bar = Math.floor(s.step / 16);
      const root = ROOTS[bar % ROOTS.length];
      if (i % 4 === 0) kick(t, out);
      if (i % 4 === 2) noiseHit(t, out, { gain: 0.16, decay: 0.045 });
      if (i % 2 === 1) noiseHit(t, out, { gain: 0.05, decay: 0.02, freq: 9000 });
      if (i === 4 || i === 12) noiseHit(t, send, { type: 'bandpass', freq: 1600, q: 1.2, gain: 0.12, decay: 0.16 });
      if (BASS[i]) {
        const sweep = 380 + 520 * (0.5 + 0.5 * Math.sin(s.step / 64 * Math.PI * 2));
        bassNote(t, i === 14 ? root * 2 : root, sweep, out);
      }
      if (bar % 2 === 1 && i % 2 === 0) pluck(t, root * 8 * ARP[(i / 2) % ARP.length], send, 0.035);
      s.step++;
      return t + STEP;
    }, 0.6);
  }

  /* ---------- Regen: Rauschen, Tropfen, fernes Donnern, leise Fläche ---------- */

  function regen() {
    let layers = null;
    const v = makeVoice((t, out, send, s) => {
      if (!layers) {
        layers = [];
        [[{ hp: 500, lp: 7000 }, 0.22], [{ hp: 60, lp: 700 }, 0.18]].forEach(([fq, gain]) => {
          const src = ctx.createBufferSource();
          src.buffer = noise; src.loop = true;
          const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = fq.hp;
          const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = fq.lp;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.exponentialRampToValueAtTime(gain, t + 2);
          src.connect(hp).connect(lp).connect(g).connect(out);
          src.start(t);
          layers.push({ src, g, base: gain });
        });
        s.nextDrop = t; s.nextSwell = t + 3; s.nextThunder = t + rand(25, 50); s.nextPad = t;
      }
      if (t >= s.nextSwell) {   // Regen wird mal stärker, mal schwächer
        layers.forEach(l => l.g.gain.linearRampToValueAtTime(l.base * rand(0.7, 1.25), t + 2.5));
        s.nextSwell = t + 2.5;
      }
      if (t >= s.nextDrop) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(rand(1600, 3800), t);
        o.frequency.exponentialRampToValueAtTime(rand(700, 1400), t + 0.05);
        g.gain.setValueAtTime(rand(0.01, 0.035), t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
        o.connect(g).connect(send); o.start(t); o.stop(t + 0.08);
        s.nextDrop = t + rand(0.05, 0.35);
      }
      if (t >= s.nextPad) {
        padNote(t, pick([110, 98, 87.31]), 14, out, 0.02);
        padNote(t, pick([164.81, 146.83, 130.81]), 14, out, 0.015);
        s.nextPad = t + 12;
      }
      if (t >= s.nextThunder) {
        const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 140;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(0.5, t + 1.2);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 6);
        src.connect(lp).connect(g).connect(send); src.start(t); src.stop(t + 6.2);
        s.nextThunder = t + rand(40, 90);
      }
      return t + 0.05;
    }, 1.5);
    return {
      stop() {
        v.stop();
        if (layers) layers.forEach(l => { try { l.src.stop(ctx.currentTime + 2); } catch (e) { /* ignorieren */ } });
      }
    };
  }

  const FACTORY = { meditativ, techno, regen };

  /* ---------- Steuerung ---------- */

  function fadeTo(value, sec) {
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
    master.gain.linearRampToValueAtTime(Math.max(0.0001, value), t + sec);
  }

  /** Stil starten (oder wechseln). Muss zuerst durch eine Nutzeraktion ausgelöst werden. */
  let switchTimer = null;
  function play(style) {
    if (!FACTORY[style] || !ensure()) return;
    clearTimeout(stopTimer);
    clearTimeout(switchTimer);
    if (voice && voiceStyle === style) { fadeTo(volume, 1.2); return; }
    const start = () => { voice = FACTORY[style](); voiceStyle = style; fadeTo(volume, 2); };
    voiceStyle = style;
    if (voice) {                         // sanft vom alten zum neuen Stil überblenden
      const old = voice;
      voice = null;
      fadeTo(0.0001, 0.6);
      switchTimer = setTimeout(() => { old.stop(); start(); }, 650);
    } else {
      start();
    }
  }

  function stop(fade = 1.5) {
    clearTimeout(switchTimer);
    if (!ctx || !voice) { voiceStyle = null; return; }
    fadeTo(0.0001, fade);
    const old = voice;
    voice = null; voiceStyle = null;
    stopTimer = setTimeout(() => old.stop(), fade * 1000 + 100);
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v)) * 0.9;
    if (ctx && voice) fadeTo(volume, 0.2);
  }

  /** Nach einer Nutzeraktion aufrufen, damit der Browser Audio erlaubt */
  function unlock() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

  /** Aktueller Ausgangspegel 0…1 (z. B. für eine kleine Anzeige) */
  function level() {
    if (!analyser) return 0;
    const d = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(d);
    let peak = 0;
    for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i] - 128));
    return peak / 128;
  }

  global.FocusMusic = {
    STYLES, play, stop, setVolume, unlock, level,
    get audioState() { return ctx ? ctx.state : 'none'; },
    get playing() { return !!voiceStyle; },
    get style() { return voiceStyle; }
  };
})(window);
