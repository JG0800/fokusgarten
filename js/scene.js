/* Fokusgarten – Gartenszene: Himmel, Wolken, Beete und Pflanzen */
(function (global) {
  'use strict';

  const P = global.Plants;

  // Breites Layout: 2 Reihen x 3 Beete, schmales Layout (Handy): 3 Reihen x 2 Beete
  const LAYOUTS = {
    wide: { W: 1000, H: 700, horizon: 290, cols: 3, xs: [190, 500, 810], rows: [{ y: 405, s: 1.2 }, { y: 655, s: 1.42 }] },
    narrow: { W: 600, H: 980, horizon: 290, cols: 2, xs: [165, 435], rows: [{ y: 425, s: 1.05 }, { y: 660, s: 1.2 }, { y: 920, s: 1.35 }] }
  };

  const f = n => Math.round(n * 10) / 10;

  /** Animationsphase an die Uhr koppeln, damit Neuzeichnen nicht ruckelt */
  function phase(dur, offset) {
    return `-${f(((Date.now() / 1000) + offset) % dur)}s`;
  }

  function cloud(W, y, s, dur, offset) {
    const x = -170;
    const puffs = [[0, 0, 34], [36, -14, 30], [70, 2, 28], [32, 10, 30], [-30, 8, 24]];
    const body = puffs.map(([dx, dy, r]) => `<circle cx="${dx}" cy="${dy}" r="${r}"/>`).join('');
    return `<g class="cloud" style="--drift:${W + 340}px;animation-duration:${dur}s;animation-delay:${phase(dur, offset)}">
      <g transform="translate(${x} ${y}) scale(${s})">
        <g fill="#c9dff2" transform="translate(4 8)">${body}</g>
        <g fill="url(#gCloud)">${body}</g>
      </g></g>`;
  }

  function grassTufts(L, y, count, seedOffset) {
    let out = '';
    for (let i = 0; i < count; i++) {
      const x = ((i * 137 + seedOffset * 61) % L.W);
      const h = 10 + ((i * 7 + seedOffset) % 9);
      const dur = 2.6 + (i % 4) * 0.4;
      out += `<g transform="translate(${x} ${y + (i % 3) * 6})"><g class="grass" style="animation-duration:${dur}s;animation-delay:${phase(dur * 2, i)}">
        <path d="M-6 0 Q -5 ${-h * 0.6} -9 ${-h} Q -2 ${-h * 0.5} -1 0 Z M-1 0 Q 0 ${-h * 0.8} 2 ${-h * 1.25} Q 4 ${-h * 0.6} 4 0 Z M3 0 Q 6 ${-h * 0.5} 10 ${-h * 0.85} Q 7 ${-h * 0.3} 8 0 Z" fill="url(#gGrass)"/>
      </g></g>`;
    }
    return out;
  }

  function flowersInMeadow(L) {
    const colors = ['#ffffff', '#ffd6e4', '#fff3a0', '#d9c7ff'];
    let out = '';
    for (let i = 0; i < 18; i++) {
      const x = (i * 211 + 40) % L.W;
      const y = L.horizon + 30 + ((i * 53) % 70);
      out += `<circle cx="${x}" cy="${y}" r="${2 + (i % 2)}" fill="${colors[i % 4]}" opacity=".9"/>`;
    }
    return out;
  }

  function fence(L) {
    let out = `<rect x="0" y="${L.horizon + 4}" width="${L.W}" height="5" rx="2" fill="#d9b48a"/><rect x="0" y="${L.horizon + 20}" width="${L.W}" height="5" rx="2" fill="#d9b48a"/>`;
    for (let x = 12; x < L.W; x += 34) {
      out += `<path d="M${x} ${L.horizon + 34} V ${L.horizon - 6} l 6 -7 l 6 7 V ${L.horizon + 34} Z" fill="#ead0ae" stroke="#b58e63" stroke-width="1.2"/>`;
    }
    return `<g opacity=".95">${out}</g>`;
  }

  function bed(L, row) {
    const x0 = L.xs[0] - 140, x1 = L.xs[L.xs.length - 1] + 140;
    const w = x1 - x0, y = row.y;
    const h = 30 * row.s;
    let stones = '';
    for (let i = 0; i < 14; i++) {
      stones += `<ellipse cx="${f(x0 + 30 + ((i * 97) % (w - 60)))}" cy="${f(y - h * 0.3 + ((i * 13) % (h * 0.6)))}" rx="${f(2.5 * row.s)}" ry="${f(1.6 * row.s)}" fill="rgba(255,255,255,.12)"/>`;
    }
    return `<g class="bed">
      <rect x="${x0}" y="${f(y - h * 0.15)}" width="${w}" height="${f(h * 0.95)}" rx="${f(h * 0.4)}" fill="#3e2716"/>
      <rect x="${x0}" y="${f(y - h * 0.6)}" width="${w}" height="${f(h)}" rx="${f(h * 0.5)}" fill="url(#gBed)"/>
      ${stones}
    </g>`;
  }

  function sceneDefs() {
    return `<defs>
      <linearGradient id="gSky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#3f9be8"/><stop offset=".55" stop-color="#8fcdf7"/><stop offset="1" stop-color="#d9f1ff"/>
      </linearGradient>
      <radialGradient id="gSun"><stop offset="0" stop-color="#fffbe0"/><stop offset=".5" stop-color="#ffe066"/><stop offset="1" stop-color="#ffb52e"/></radialGradient>
      <radialGradient id="gSunGlow"><stop offset="0" stop-color="#fff6c0" stop-opacity=".8"/><stop offset="1" stop-color="#fff6c0" stop-opacity="0"/></radialGradient>
      <linearGradient id="gCloud" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#eef6fd"/></linearGradient>
      <radialGradient id="gCoin" cx=".38" cy=".32" r=".75"><stop offset="0" stop-color="#fff6c4"/><stop offset=".45" stop-color="#ffd23f"/><stop offset="1" stop-color="#d4900d"/></radialGradient>
      <radialGradient id="gRainCloud" cx=".45" cy=".35" r=".7"><stop offset="0" stop-color="#ffffff"/><stop offset=".7" stop-color="#e6f0fa"/><stop offset="1" stop-color="#c9daea"/></radialGradient>
      <linearGradient id="gHillFar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fd88a"/><stop offset="1" stop-color="#6fb85f"/></linearGradient>
      <linearGradient id="gHillNear" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7fc96b"/><stop offset="1" stop-color="#4f9d4a"/></linearGradient>
      <linearGradient id="gMeadow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7cc767"/><stop offset="1" stop-color="#3f8a3c"/></linearGradient>
      <linearGradient id="gBed" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8a5d3c"/><stop offset=".5" stop-color="#6b4630"/><stop offset="1" stop-color="#523422"/></linearGradient>
      <linearGradient id="gGrass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a6e48c"/><stop offset="1" stop-color="#3f8a3c"/></linearGradient>
    </defs>`;
  }

  function background(L) {
    const { W, H, horizon } = L;
    const sunX = W - 120, sunY = 95;
    return `
      <rect width="${W}" height="${horizon + 40}" fill="url(#gSky)"/>
      <circle class="sun-glow" cx="${sunX}" cy="${sunY}" r="110" fill="url(#gSunGlow)"/>
      <circle cx="${sunX}" cy="${sunY}" r="46" fill="url(#gSun)"/>
      ${cloud(W, 80, 0.9, 95, 0)}
      ${cloud(W, 150, 0.65, 120, 60)}
      ${cloud(W, 55, 0.75, 105, 70)}
      ${cloud(W, 215, 0.5, 140, 100)}
      <path d="M0 ${horizon - 40} Q ${W * 0.18} ${horizon - 120} ${W * 0.4} ${horizon - 50} T ${W * 0.78} ${horizon - 70} T ${W} ${horizon - 60} V ${horizon + 20} H 0 Z" fill="url(#gHillFar)"/>
      <path d="M0 ${horizon - 10} Q ${W * 0.25} ${horizon - 70} ${W * 0.55} ${horizon - 15} T ${W} ${horizon - 30} V ${horizon + 30} H 0 Z" fill="url(#gHillNear)"/>
      <rect y="${horizon}" width="${W}" height="${H - horizon}" fill="url(#gMeadow)"/>
      ${fence(L)}
      ${flowersInMeadow(L)}
      ${grassTufts(L, horizon + 50, Math.round(W / 60), 3)}`;
  }

  /** Höhe der Klickfläche (lokale Einheiten): bis knapp vor die Reihe dahinter */
  function hitHeightFor(L, i) {
    const r = Math.floor(i / L.cols), row = L.rows[r];
    if (r === 0) return 175;
    return Math.min(175, (row.y - L.rows[r - 1].y) / row.s - 10);
  }

  function slotPos(L, i) {
    const row = L.rows[Math.floor(i / L.cols)];
    return { x: L.xs[i % L.cols], y: row.y, s: row.s, row };
  }

  /* ---------- Inhalt eines Beets ---------- */

  function bubble(y, emoji, cls) {
    return `<g transform="translate(26 ${f(y)})"><g class="bubble ${cls}">
      <path d="M-16 -14 h32 a6 6 0 0 1 6 6 v14 a6 6 0 0 1 -6 6 h-18 l-6 7 l-1 -7 h-7 a6 6 0 0 1 -6 -6 v-14 a6 6 0 0 1 6 -6 Z" fill="#fff" stroke="rgba(0,0,0,.12)"/>
      <text x="0" y="5" text-anchor="middle" font-size="15">${emoji}</text></g></g>`;
  }

  function slotContent(info, i, selected, hitH) {
    let out = '';
    if (selected) {
      out += `<ellipse class="select-ring" cx="0" cy="2" rx="58" ry="14" fill="rgba(255,255,255,.28)" stroke="#fff" stroke-width="2.5" stroke-dasharray="7 6"/>`;
    }
    // Einzige Klickfläche des Beets. Sie endet genau dort, wo die Reihe dahinter beginnt –
    // so fängt eine große Pflanze vorne nie die Maus für ein Beet weiter hinten ab.
    out += `<rect class="hit" x="-52" y="${f(-hitH)}" width="104" height="${f(hitH + 14)}" fill="transparent"/>`;
    if (!info) {
      out += `<g class="empty-spot">
        <ellipse cx="0" cy="2" rx="30" ry="8" fill="#3a2414"/>
        <ellipse cx="0" cy="0" rx="24" ry="5" fill="#2a190d"/>
        <rect x="18" y="-46" width="4" height="46" rx="2" fill="#a77b4f"/>
        <rect x="2" y="-58" width="36" height="22" rx="5" fill="#ead0ae" stroke="#b58e63" stroke-width="1.5"/>
        <text x="20" y="-41" text-anchor="middle" font-size="18" font-weight="800" fill="#6b4630">+</text>
      </g>`;
      return out;
    }
    const sway = 3.4 + (i % 3) * 0.55;
    const blink = 4.2 + i * 0.7;
    out += `<g class="grow-wrap">${P.plantGroup(info.type, info.stage, info.mood, {
      style: `--sway-dur:${sway}s;--sway-delay:${phase(sway * 2, i * 1.3)};--blink-dur:${blink}s;--blink-delay:${phase(blink, i * 2.1)};`
    })}</g>`;
    const top = -P.plantTop(info.type, info.stage) - 20;
    if (info.status === 'welk') out += bubble(top, '🥀', 'bad');
    else if (info.status === 'durstig') out += bubble(top, '💧', 'warn');
    else if (info.grown) out += bubble(top, '🏆', 'gold');
    return out;
  }

  /* ---------- Regenwolke mit Augen (Gieß-Effekt) ---------- */

  function rainCloud(slotEl) {
    // Wolke schwebt knapp über der Pflanze
    let top = -120;
    const plant = slotEl.querySelector('.plant');
    if (plant) { try { top = plant.getBBox().y; } catch (e) { /* ignorieren */ } }
    const cy = Math.max(-205, Math.min(-80, top - 44));
    const puffs = [[-27, 5, 15], [-12, -7, 19], [9, -11, 19], [27, 1, 15], [0, 7, 18], [-20, 9, 12], [20, 9, 12]]
      .map(([x, y, r]) => [x * 1.3, y * 1.3, r * 1.3]);
    const circles = (fill, extra = '') => puffs.map(([x, y, r]) => `<circle cx="${x}" cy="${cy + y}" r="${r}" fill="${fill}"${extra}/>`).join('');
    // Kontur unter alle Wölkchen, darüber die Füllung → eine weiche, zusammenhängende Wolke
    const body = circles('#7f9cb8', ' stroke="#7f9cb8" stroke-width="5"') + circles('url(#gRainCloud)') +
      `<ellipse cx="-16" cy="${cy - 18}" rx="12" ry="6" fill="rgba(255,255,255,.8)"/>` +
      window.Plants.face(0, cy + 1, 31, 'joy');
    let drops = '';
    const fall = -(cy + 28) - 4;
    for (let k = 0; k < 18; k++) {
      const x = -32 + ((k * 37) % 65);
      const delay = (0.35 + (k % 8) * 0.09 + Math.floor(k / 8) * 0.38).toFixed(2);
      drops += `<path class="rain" d="M${x} ${cy + 24} q -4 7 0 10 q 4 -3 0 -10 Z" fill="#3d9be6" stroke="#2a7cc0" stroke-width=".8" style="--fall:${fall}px;animation-delay:${delay}s"/>`;
    }
    return `${drops}<g class="rain-cloud"><g class="rain-cloud-bob">${body}</g></g>`;
  }

  /* ---------- Szene-Objekt ---------- */

  function create(container, onSelect) {
    let layoutKey = null;
    let L = null;
    const cache = [];

    const hitHeight = i => hitHeightFor(L, i);

    function build() {
      const w = container.clientWidth || 800;
      const key = w < 560 ? 'narrow' : 'wide';
      if (key === layoutKey) return false;
      layoutKey = key;
      L = LAYOUTS[key];
      cache.length = 0;
      let rows = '';
      L.rows.forEach((row, r) => {
        rows += bed(L, row);
        for (let c = 0; c < L.cols; c++) {
          const i = r * L.cols + c;
          const p = slotPos(L, i);
          rows += `<g class="slot" id="slot-${i}" data-i="${i}" tabindex="0" role="button" transform="translate(${p.x} ${p.y}) scale(${p.s})"></g>`;
        }
      });
      container.innerHTML = `<svg class="scene-svg" viewBox="0 0 ${L.W} ${L.H}" preserveAspectRatio="xMidYMid meet">
        ${sceneDefs()}${background(L)}${rows}
        ${grassTufts(L, L.H - 16, Math.round(L.W / 45), 7)}
        <g class="fx-layer" id="fxLayer"></g>
      </svg>`;
      return true;
    }

    /** infos: Array (pro Beet) mit {type, stage, mood, status, grown, label} oder null */
    function update(infos, selected) {
      build();
      infos.forEach((info, i) => {
        const el = container.querySelector(`#slot-${i}`);
        if (!el) return;
        const key = info ? `${info.type}|${info.stage}|${info.mood}|${info.status}|${info.grown}` : 'empty';
        const k = key + '|' + (i === selected);
        el.setAttribute('aria-label', info ? info.label : `Beet ${i + 1}: frei – Samen pflanzen`);
        el.classList.toggle('is-selected', i === selected);
        if (cache[i] === k) return;
        cache[i] = k;
        el.innerHTML = slotContent(info, i, i === selected, hitHeight(i));
      });
    }

    /** Effekte: 'water', 'sparkle', 'pop' */
    function effect(i, kind) {
      const el = container.querySelector(`#slot-${i}`);
      if (!el) return;
      if (kind === 'pop') {
        const g = el.querySelector('.grow-wrap');
        if (g) { g.classList.remove('pop'); void g.getBoundingClientRect(); g.classList.add('pop'); }
        return;
      }
      const ns = 'http://www.w3.org/2000/svg';
      const fx = document.createElementNS(ns, 'g');
      fx.setAttribute('class', 'fx fx-' + kind);
      if (kind === 'water') {
        fx.innerHTML = rainCloud(el);
      } else {
        let html = '';
        for (let k = 0; k < 6; k++) {
          html += `<text class="spark" x="${-40 + k * 16}" y="${-30 - (k % 3) * 25}" font-size="16" style="animation-delay:${(k * 0.12).toFixed(2)}s">✨</text>`;
        }
        fx.innerHTML = html;
      }
      el.appendChild(fx);
      setTimeout(() => fx.remove(), 2400);
    }

    container.addEventListener('click', e => {
      const slot = e.target.closest('.slot');
      if (slot) onSelect(+slot.dataset.i);
    });
    container.addEventListener('keydown', e => {
      const slot = e.target.closest && e.target.closest('.slot');
      if (slot && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect(+slot.dataset.i); }
    });

    let lastInfos = null, lastSel = 0;
    const ro = new ResizeObserver(() => {
      if (lastInfos && build()) update(lastInfos, lastSel);
    });
    ro.observe(container);

    /**
     * Ernte: Die Pflanze springt aus dem Beet, Münzen sprudeln heraus und der
     * Münzwert erscheint über ihr. Muss VOR dem Entfernen der Pflanze aufgerufen werden.
     */
    function harvest(i, amount) {
      const slot = container.querySelector(`#slot-${i}`);
      const layer = container.querySelector('#fxLayer');
      if (!slot || !layer) return;
      const plant = slot.querySelector('.plant');
      let top = -100;
      if (plant) { try { top = plant.getBBox().y; } catch (e) { /* ignorieren */ } }
      const mid = top * 0.55;
      const ns = 'http://www.w3.org/2000/svg';
      const fx = document.createElementNS(ns, 'g');
      fx.setAttribute('class', 'fx fx-harvest');
      fx.setAttribute('transform', slot.getAttribute('transform'));
      // Pflanze als „Geist“, der kurz hochspringt und verschwindet
      let html = plant ? `<g class="harvest-ghost">${plant.outerHTML}</g>` : '';
      // Münzen in alle Richtungen nach oben
      const n = 10;
      for (let k = 0; k < n; k++) {
        const a = (-160 + (140 / (n - 1)) * k) * Math.PI / 180;   // Fächer nach oben
        const dist = 55 + (k % 3) * 18;
        const dx = Math.cos(a) * dist, dy = Math.sin(a) * dist - 10;
        html += `<g class="coin-pop" style="--dx:${dx.toFixed(1)}px;--dy:${dy.toFixed(1)}px;animation-delay:${(k * 0.035).toFixed(3)}s">
          <g transform="translate(0 ${mid.toFixed(1)})"><g class="coin-spin" style="animation-delay:${(k * 0.07).toFixed(2)}s">
            <circle r="8" fill="url(#gCoin)" stroke="#a86e00" stroke-width="1.4"/>
            <circle r="5.2" fill="none" stroke="rgba(160,100,0,.45)" stroke-width="1"/>
            <path d="M-1.5 -3.2 v6.4 M1.5 -3.2 v6.4" stroke="rgba(160,100,0,.55)" stroke-width="1.1" stroke-linecap="round"/>
            <circle cx="-3" cy="-3.2" r="1.6" fill="#fff" opacity=".8"/>
          </g></g></g>`;
      }
      // Münzwert über der Pflanze
      html += `<g class="harvest-amount" style="--y:${(top - 26).toFixed(1)}px">
        <text x="0" y="0" text-anchor="middle" font-size="26" font-weight="900" font-family="Nunito, system-ui, sans-serif"
          fill="#ffd23f" stroke="#7a4b00" stroke-width="2.4" paint-order="stroke" stroke-linejoin="round">+${amount} 🪙</text></g>`;
      fx.innerHTML = html;
      layer.appendChild(fx);
      setTimeout(() => fx.remove(), 2400);
    }

    return {
      update(infos, selected) { lastInfos = infos; lastSel = selected; update(infos, selected); },
      effect,
      harvest
    };
  }

  global.GardenScene = { create };
})(window);
