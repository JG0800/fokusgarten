/* Fokusgarten – eigene Musik über YouTube-Links
 *
 * Nutzt den offiziellen YouTube-IFrame-Player (datensparsame Variante
 * youtube-nocookie.com). Laut YouTube-Richtlinien muss der Player beim
 * Abspielen sichtbar sein – die App zeigt ihn deshalb im Musikbereich an.
 */
(function (global) {
  'use strict';

  let apiPromise = null, player = null, playerKey = null, container = null;

  // YouTube muss wissen, auf welcher Webseite der Player eingebettet ist. Wird die App
  // direkt als Datei geöffnet (file://), gibt es keine Webadresse → YouTube-Fehler 153.
  const supported = /^https?:$/.test(location.protocol);
  const ONLINE_URL = 'https://jg0800.github.io/fokusgarten/';
  const NEED_WEB = 'YouTube funktioniert nur, wenn der Fokusgarten über eine Webadresse läuft – ' +
    'nicht als direkt geöffnete Datei. Öffne ihn über ' + ONLINE_URL + ' (oder einen lokalen Server).';
  let volume = 50, fadeTimer = null, isPlaying = false, onStateCb = null;

  /** Link (oder reine ID) zerlegen → { videoId, listId } oder null */
  function parse(input) {
    const raw = String(input || '').trim();
    if (!raw) return null;
    if (/^[\w-]{11}$/.test(raw)) return { videoId: raw, listId: null };
    let url;
    try { url = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw); } catch (e) { return null; }
    const host = url.hostname.replace(/^(www|m|music)\./, '');
    if (!/^(youtube\.com|youtu\.be|youtube-nocookie\.com)$/.test(host)) return null;
    let videoId = null;
    const listId = url.searchParams.get('list');
    if (host === 'youtu.be') videoId = url.pathname.slice(1, 12);
    else if (url.searchParams.get('v')) videoId = url.searchParams.get('v');
    else {
      const m = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/);
      if (m) videoId = m[1];
    }
    if (videoId && !/^[\w-]{11}$/.test(videoId)) videoId = null;
    if (!videoId && !listId) return null;
    return { videoId, listId: listId && /^[\w-]+$/.test(listId) ? listId : null };
  }

  /** Titel über YouTubes oEmbed abfragen (falls möglich) */
  async function fetchTitle(parsed) {
    const watch = parsed.videoId
      ? `https://www.youtube.com/watch?v=${parsed.videoId}`
      : `https://www.youtube.com/playlist?list=${parsed.listId}`;
    try {
      const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watch)}`);
      if (!res.ok) return null;
      const data = await res.json();
      return data && data.title ? String(data.title).slice(0, 80) : null;
    } catch (e) { return null; }
  }

  function loadApi() {
    if (global.YT && global.YT.Player) return Promise.resolve();
    if (apiPromise) return apiPromise;
    apiPromise = new Promise((resolve, reject) => {
      const prev = global.onYouTubeIframeAPIReady;
      global.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(); };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.async = true;
      s.onerror = () => { apiPromise = null; reject(new Error('YouTube konnte nicht geladen werden (offline?).')); };
      document.head.appendChild(s);
    });
    return apiPromise;
  }

  const keyOf = e => e.listId ? `list:${e.listId}:${e.videoId || ''}` : `v:${e.videoId}`;

  function fade(to, ms, done) {
    clearInterval(fadeTimer);
    if (!player || !player.getVolume) { if (done) done(); return; }
    let cur = player.getVolume();
    const steps = Math.max(1, Math.round(ms / 80));
    const delta = (to - cur) / steps;
    let i = 0;
    fadeTimer = setInterval(() => {
      i++;
      cur = i >= steps ? to : cur + delta;
      try { player.setVolume(Math.round(cur)); } catch (e) { /* ignorieren */ }
      if (i >= steps) { clearInterval(fadeTimer); if (done) done(); }
    }, 80);
  }

  /**
   * Eintrag abspielen. el = Element, in dem der Player sichtbar erscheint.
   * onState(type, info) meldet 'playing' | 'paused' | 'error' | 'loading'.
   */
  async function play(entry, el, onState) {
    onStateCb = onState || null;
    if (!supported) { if (onStateCb) onStateCb('error', NEED_WEB); return; }
    const key = keyOf(entry);
    if (player && playerKey === key && container === el) {
      try { player.playVideo(); } catch (e) { /* ignorieren */ }
      fade(volume, 900);
      isPlaying = true;
      return;
    }
    destroy();
    container = el;
    playerKey = key;
    isPlaying = true;
    if (onStateCb) onStateCb('loading');
    await loadApi();
    if (playerKey !== key) return;   // inzwischen umentschieden
    el.innerHTML = '<div></div>';
    const vars = { autoplay: 1, playsinline: 1, rel: 0, modestbranding: 1, loop: 1 };
    if (location.origin && location.origin !== 'null') { vars.origin = location.origin; vars.widget_referrer = location.href; }
    if (entry.listId) { vars.listType = 'playlist'; vars.list = entry.listId; }
    else vars.playlist = entry.videoId;            // nötig, damit ein einzelnes Video in Schleife läuft
    player = new global.YT.Player(el.firstChild, {
      host: 'https://www.youtube-nocookie.com',
      width: '100%', height: '100%',
      videoId: entry.videoId || undefined,
      playerVars: vars,
      events: {
        onReady: e => {
          e.target.setVolume(0);
          if (isPlaying) { e.target.playVideo(); fade(volume, 1200); }
        },
        onStateChange: e => {
          if (!onStateCb) return;
          if (e.data === global.YT.PlayerState.PLAYING) onStateCb('playing');
          else if (e.data === global.YT.PlayerState.PAUSED) onStateCb('paused');
        },
        onError: e => {
          const msg = e.data === 153 ? NEED_WEB
            : (e.data === 101 || e.data === 150)
            ? 'Dieses Video darf nicht außerhalb von YouTube abgespielt werden – bitte einen anderen Link wählen.'
            : (e.data === 2 || e.data === 100) ? 'Video nicht gefunden – ist der Link richtig?' : 'YouTube konnte das Video nicht abspielen.';
          if (onStateCb) onStateCb('error', msg);
        }
      }
    });
  }

  /** Leise ausblenden und pausieren (Position bleibt erhalten) */
  function pause() {
    isPlaying = false;
    if (!player) return;
    fade(0, 900, () => { try { if (!isPlaying) player.pauseVideo(); } catch (e) { /* ignorieren */ } });
  }

  function destroy() {
    clearInterval(fadeTimer);
    isPlaying = false;
    if (player) { try { player.destroy(); } catch (e) { /* ignorieren */ } }
    player = null; playerKey = null;
    if (container) container.innerHTML = '';
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(100, Math.round(v)));
    if (player && isPlaying) { clearInterval(fadeTimer); try { player.setVolume(volume); } catch (e) { /* ignorieren */ } }
  }

  global.YouTubeMusic = {
    parse, fetchTitle, play, pause, destroy, setVolume, keyOf, supported, NEED_WEB, ONLINE_URL,
    get playing() { return isPlaying; },
    /** YouTube-Status: 1 = spielt, 2 = pausiert, 3 = lädt (null, solange kein Player) */
    get playerState() { try { return player && player.getPlayerState ? player.getPlayerState() : null; } catch (e) { return null; } },
    get volume() { try { return player && player.getVolume ? player.getVolume() : null; } catch (e) { return null; } },
    get key() { return playerKey; }
  };
})(window);
