/* Fokusgarten – Pflanzenarten, Wachstumslogik und SVG-Darstellung */
(function (global) {
  'use strict';

  const STAGE_NAMES = ['Samen', 'Keimling', 'Jungpflanze', 'Wachsend', 'Knospe', 'Blühend'];
  const MAX_STAGE = STAGE_NAMES.length - 1;

  /**
   * decay: Wasserverlust in Prozentpunkten pro Stunde
   * thresholds: benötigte Wachstumspunkte für Stufe 0..5
   */
  const PLANT_TYPES = {
    sonnenblume: {
      name: 'Sonnenblume', emoji: '🌻', seedCost: 15, waterCost: 5, decay: 4,
      thresholds: [0, 2, 5, 9, 14, 20],
      desc: 'Fröhlich und schnell – braucht aber oft Wasser.'
    },
    tulpe: {
      name: 'Tulpe', emoji: '🌷', seedCost: 20, waterCost: 5, decay: 3,
      thresholds: [0, 2, 5, 9, 14, 22],
      desc: 'Elegant und genügsam, mittleres Tempo.'
    },
    kaktus: {
      name: 'Kaktus', male: true, emoji: '🌵', seedCost: 25, waterCost: 4, decay: 1.5,
      thresholds: [0, 3, 7, 12, 18, 26],
      desc: 'Verzeiht lange Pausen, wächst langsam.'
    },
    kirschbaum: {
      name: 'Kirschbaum', male: true, emoji: '🌸', seedCost: 50, waterCost: 8, decay: 2.5,
      thresholds: [0, 3, 8, 15, 24, 35],
      desc: 'Die Königsdisziplin – ein Bäumchen voller Blüten.'
    },
    pilz: {
      name: 'Pilz', male: true, type: 'pilz', emoji: '🍄', seedCost: 30, waterCost: 5, decay: 2,
      thresholds: [0, 2, 6, 11, 17, 24],
      desc: 'Gemütlich und treu – mag feuchte Erde und bekommt Pilzkinder.'
    }
  };

  const RULES = {
    waterAmount: 25,        // so viel Wasser bringt eine Gießkanne
    waterMax: 100,
    waterAllowedBelow: 85,  // erst gießen, wenn die Erde etwas abgetrocknet ist
    startWater: 40,
    thirstyBelow: 25,
    fertilizerCost: 20,
    fertilizerGrowth: 3,
    fertilizerCooldownH: 8,
    maxPlots: 6
  };

  const HOUR = 3600 * 1000;

  function stageFor(type, growth) {
    const t = PLANT_TYPES[type].thresholds;
    let s = 0;
    for (let i = 0; i < t.length; i++) if (growth >= t[i]) s = i;
    return s;
  }

  /** Fortschritt innerhalb der aktuellen Stufe (0..1) */
  function stageProgress(type, growth) {
    const t = PLANT_TYPES[type].thresholds;
    const s = stageFor(type, growth);
    if (s >= MAX_STAGE) return 1;
    return (growth - t[s]) / (t[s + 1] - t[s]);
  }

  /** Wasserverlust seit dem letzten Update anwenden (mutiert die Pflanze) */
  function applyDecay(plant, now) {
    const type = PLANT_TYPES[plant.type];
    const hours = Math.max(0, (now - plant.lastUpdate) / HOUR);
    // Ausgewachsene Pflanzen verlieren nur halb so viel Wasser
    const rate = stageFor(plant.type, plant.growth) >= MAX_STAGE ? type.decay / 2 : type.decay;
    plant.water = Math.max(0, plant.water - rate * hours);
    plant.lastUpdate = now;
    return plant;
  }

  function createPlant(type, now) {
    return {
      id: 'p' + now.toString(36) + Math.random().toString(36).slice(2, 7),
      type,
      growth: 0,
      water: RULES.startWater,
      lastUpdate: now,
      plantedAt: now,
      lastFertilized: 0
    };
  }

  function plantStatus(plant) {
    if (plant.water <= 0) return 'welk';
    if (plant.water < RULES.thirstyBelow) return 'durstig';
    return 'gesund';
  }

  function canWater(plant, noWait) {
    if (noWait) return { ok: true };
    if (plant.water >= RULES.waterAllowedBelow) return { ok: false, reason: 'Die Erde ist noch feucht.' };
    return { ok: true };
  }

  /** Wasserverlust pro Stunde (ausgewachsene Pflanzen: halb so viel) */
  function decayRate(plant) {
    const d = PLANT_TYPES[plant.type].decay;
    return stageFor(plant.type, plant.growth) >= MAX_STAGE ? d / 2 : d;
  }

  /** Millisekunden, bis der Wasserstand auf `level` gesunken ist */
  function msUntilWater(plant, level) {
    return plant.water <= level ? 0 : (plant.water - level) / decayRate(plant) * HOUR;
  }

  /** Millisekunden, bis wieder gegossen werden darf */
  function waterReadyIn(plant) {
    return plant.water < RULES.waterAllowedBelow ? 0 : msUntilWater(plant, RULES.waterAllowedBelow - 0.01);
  }

  function fertilizerReadyIn(plant, now) {
    const readyAt = (plant.lastFertilized || 0) + RULES.fertilizerCooldownH * HOUR;
    return Math.max(0, readyAt - now);
  }

  function canFertilize(plant, now, noWait) {
    if (stageFor(plant.type, plant.growth) >= MAX_STAGE) return { ok: false, reason: 'Schon ausgewachsen.' };
    if (plant.water <= 0) return { ok: false, reason: 'Welke Pflanzen erst gießen.' };
    const wait = noWait ? 0 : fertilizerReadyIn(plant, now);
    if (wait > 0) return { ok: false, reason: 'Dünger wieder in ' + formatDuration(wait) + '.' };
    return { ok: true };
  }

  function formatDuration(ms) {
    const min = Math.ceil(ms / 60000);
    if (min < 60) return min + ' Min.';
    const h = Math.floor(min / 60), m = min % 60;
    return m ? `${h} Std. ${m} Min.` : `${h} Std.`;
  }

  /**
   * Stimmung einer Pflanze – bestimmt das Gesicht.
   * sleep (Samen), happy, joy (blühend / gerade gegossen), thirsty, sad (welk)
   */
  function moodFor(plant, celebrating) {
    const status = plantStatus(plant);
    if (status === 'welk') return 'sad';
    if (celebrating) return 'joy';
    if (status === 'durstig') return 'thirsty';
    const stage = stageFor(plant.type, plant.growth);
    if (stage === 0) return 'sleep';
    if (stage === MAX_STAGE) return 'joy';
    return 'happy';
  }

  /* ================= SVG ================= */

  const f = n => Math.round(n * 10) / 10;

  function lin(id, stops, x1 = 0, y1 = 0, x2 = 0, y2 = 1) {
    return `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">` +
      stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('') + '</linearGradient>';
  }
  function rad(id, stops, fx = 0.36, fy = 0.3) {
    return `<radialGradient id="${id}" cx="0.45" cy="0.42" r="0.62" fx="${fx}" fy="${fy}">` +
      stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('') + '</radialGradient>';
  }

  /** Gemeinsame Farbverläufe – einmal pro Seite einfügen */
  function defsSVG() {
    const d = [
      // Blätter & Stängel (normal / welk)
      lin('gLeaf', [[0, '#a6e48c'], [0.45, '#5db352'], [1, '#2c7230']]),
      lin('gLeafW', [[0, '#ddd28a'], [0.5, '#b0a457'], [1, '#7b7135']]),
      lin('gStem', [[0, '#2f7a2e'], [0.45, '#7fcb6e'], [1, '#2a6a2a']], 0, 0, 1, 0),
      lin('gStemW', [[0, '#7b7135'], [0.45, '#c2b866'], [1, '#6d6430']], 0, 0, 1, 0),
      rad('gBud', [[0, '#c4f0a8'], [0.5, '#5fb352'], [1, '#2a6a2a']]),
      rad('gBudW', [[0, '#e6dc9a'], [0.5, '#b0a457'], [1, '#6d6430']]),
      // Sonnenblume
      lin('gPetal', [[0, '#fff3a0'], [0.5, '#ffcf33'], [1, '#f08a12']]),
      lin('gPetalW', [[0, '#eadfa0'], [0.5, '#cdb65e'], [1, '#9c8640']]),
      rad('gSunC', [[0, '#c98a52'], [0.6, '#8a5530'], [1, '#5a341b']]),
      rad('gSunCW', [[0, '#a99178'], [0.6, '#7d6650'], [1, '#55432f']]),
      // Tulpe
      rad('gTulip', [[0, '#ffb3c4'], [0.45, '#f04f75'], [1, '#a81d43']]),
      rad('gTulipW', [[0, '#e3c4c4'], [0.5, '#b88a8a'], [1, '#7c5656']]),
      // Kaktus
      lin('gCactus', [[0, '#2c6e2c'], [0.3, '#7fcb6e'], [0.55, '#5db352'], [1, '#235a24']], 0, 0, 1, 0),
      lin('gCactusW', [[0, '#6d6430'], [0.3, '#cfc27a'], [0.55, '#b0a457'], [1, '#5c5428']], 0, 0, 1, 0),
      rad('gCFlower', [[0, '#ffd0e2'], [0.5, '#ff6fa3'], [1, '#c8326c']]),
      // Baum
      lin('gTrunk', [[0, '#4e3019'], [0.4, '#a0703f'], [1, '#4a2d17']], 0, 0, 1, 0),
      rad('gCanopy', [[0, '#b6ec97'], [0.5, '#5db352'], [1, '#2c7230']]),
      rad('gCanopyW', [[0, '#e4d995'], [0.5, '#b0a457'], [1, '#6d6430']]),
      rad('gCanopyB', [[0, '#7fcb6e'], [0.55, '#3f8f3a'], [1, '#1f5520']]),
      rad('gCanopyBW', [[0, '#c2b866'], [0.55, '#8f8546'], [1, '#5c5428']]),
      rad('gBlossom', [[0, '#ffffff'], [0.45, '#ffc2d4'], [1, '#e8668f']]),
      // Samen, Erde, Topf, Wangen
      rad('gSeed', [[0, '#f1d7a4'], [0.55, '#c99a5c'], [1, '#7f5a2e']]),
      // Pilz
      rad('gCap', [[0, '#d39a58'], [0.45, '#9a6232'], [1, '#5e3817']], 0.32, 0.22),
      rad('gCapW', [[0, '#b8a68e'], [0.5, '#8a7a64'], [1, '#5a4c3a']], 0.32, 0.22),
      lin('gStalk', [[0, '#c4a06c'], [0.4, '#fbe8c2'], [0.7, '#ecd2a0'], [1, '#b08a58']], 0, 0, 1, 0),
      lin('gStalkW', [[0, '#a99a80'], [0.4, '#e2d8c4'], [1, '#958670']], 0, 0, 1, 0),
      lin('gGills', [[0, '#6b4a2a'], [0.5, '#c9a87a'], [1, '#e9d4ad']]),
      rad('gEyeWhite', [[0, '#ffffff'], [0.75, '#f4f6f8'], [1, '#d9dee4']], 0.4, 0.3),
      rad('gSoil', [[0, '#8a5d3c'], [0.6, '#5e3d26'], [1, '#3e2716']], 0.5, 0.2),
      lin('gPot', [[0, '#9c4a2a'], [0.35, '#e08a60'], [0.6, '#c96f4a'], [1, '#8a3f22']], 0, 0, 1, 0),
      lin('gPotRim', [[0, '#b25a36'], [0.35, '#f09a70'], [1, '#a04d2c']], 0, 0, 1, 0),
      `<radialGradient id="gCheek"><stop offset="0" stop-color="#ff7b8f" stop-opacity=".75"/><stop offset="1" stop-color="#ff7b8f" stop-opacity="0"/></radialGradient>`,
      `<radialGradient id="gShadow"><stop offset="0" stop-color="#000" stop-opacity=".32"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>`
    ];
    return `<svg class="svg-defs" width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute;width:0;height:0;overflow:hidden"><defs>${d.join('')}</defs></svg>`;
  }

  const G = (name, wilted) => `url(#g${name}${wilted ? 'W' : ''})`;

  /* ---------- Gesicht ---------- */

  // Konturfarben für den Cartoon-Look
  const OL = {
    green: '#1d4a1c', greenW: '#5a5226', petal: '#b0600a', petalW: '#7d6a35',
    sun: '#3a200d', cap: '#3b230f', tulip: '#7a1330', tulipW: '#5c3c3c', trunk: '#3a2210', seed: '#5e3f1a', flower: '#a3204f'
  };
  const olGreen = w => w ? OL.greenW : OL.green;

  /**
   * Gesicht ohne Mund: große weiße Augen mit hellblauer Iris (nach Skizze).
   * Stimmung über Augenform, Blickrichtung, Wangen und Tropfen.
   */
  function face(cx, cy, s, mood) {
    const ink = '#1d140c';
    const sw = f(Math.max(0.9, s * 0.07));
    const ex = s * 0.29;                   // Abstand der Augen zur Mitte
    const ey = cy;
    const rx = s * 0.2, ry = s * 0.29;     // hohe, ovale Augen
    const iris = '#55c3ee', irisDark = '#2a8fc4';
    let out = '';

    // Rosige Wangen nur bei Freude
    if (mood === 'joy') {
      out += [-1, 1].map(d => `<ellipse cx="${f(cx + d * s * 0.56)}" cy="${f(ey + ry * 0.75)}" rx="${f(s * 0.16)}" ry="${f(s * 0.1)}" fill="url(#gCheek)"/>`).join('');
    }

    if (mood === 'sleep') {
      out += [-1, 1].map(d => {
        const x = cx + d * ex;
        return `<path d="M${f(x - rx)} ${f(ey)} Q ${f(x)} ${f(ey + ry * 0.8)} ${f(x + rx)} ${f(ey)}" stroke="${ink}" stroke-width="${sw}" fill="none" stroke-linecap="round"/>`;
      }).join('');
      return `<g class="face">${out}</g>`;
    }

    if (mood === 'sad') {
      // halb geschlossene Augen, Blick nach unten, eine Träne
      out += '<g class="eyes">' + [-1, 1].map(d => {
        const x = cx + d * ex, tilt = d * s * 0.05;
        return `<path d="M${f(x - rx)} ${f(ey - tilt)} A ${f(rx)} ${f(ry)} 0 0 0 ${f(x + rx)} ${f(ey + tilt)} Z" fill="#fff" stroke="${ink}" stroke-width="${f(sw * 0.8)}" stroke-linejoin="round"/>` +
          `<circle cx="${f(x)}" cy="${f(ey + ry * 0.5)}" r="${f(rx * 0.5)}" fill="${iris}"/>` +
          `<circle cx="${f(x)}" cy="${f(ey + ry * 0.55)}" r="${f(rx * 0.22)}" fill="${ink}"/>`;
      }).join('') + '</g>';
      out += `<path d="M${f(cx + ex + rx * 0.3)} ${f(ey + ry * 1.05)} q ${f(-s * 0.08)} ${f(s * 0.14)} 0 ${f(s * 0.17)} q ${f(s * 0.08)} ${f(-s * 0.03)} 0 ${f(-s * 0.17)} Z" fill="#8fd0ff" stroke="#4a9be0" stroke-width="${f(Math.max(0.5, s * 0.025))}"/>`;
      return `<g class="face">${out}</g>`;
    }

    // Offene Augen: weiß mit Kontur, Iris mit Pupille und Glanzlichtern
    const irisR = rx * (mood === 'joy' ? 0.68 : mood === 'thirsty' ? 0.5 : 0.6);
    const lookY = mood === 'thirsty' ? -ry * 0.32 : ry * 0.12;
    let whites = '', irises = '';
    [-1, 1].forEach(d => {
      const x = cx + d * ex;
      whites += `<ellipse cx="${f(x)}" cy="${f(ey)}" rx="${f(rx)}" ry="${f(ry)}" fill="url(#gEyeWhite)" stroke="${ink}" stroke-width="${f(sw * 0.85)}"/>`;
      const ix = x + rx * 0.18, iy = ey + lookY;
      irises += `<circle cx="${f(ix)}" cy="${f(iy)}" r="${f(irisR)}" fill="${iris}" stroke="${irisDark}" stroke-width="${f(Math.max(0.4, s * 0.02))}"/>` +
        `<circle cx="${f(ix)}" cy="${f(iy)}" r="${f(irisR * 0.48)}" fill="${ink}"/>` +
        `<circle cx="${f(ix - irisR * 0.38)}" cy="${f(iy - irisR * 0.4)}" r="${f(irisR * 0.32)}" fill="#fff"/>` +
        `<circle cx="${f(ix + irisR * 0.4)}" cy="${f(iy + irisR * 0.35)}" r="${f(irisR * 0.14)}" fill="#fff" opacity=".85"/>`;
    });
    out += `<g class="eyes">${whites}<g class="pupils" style="--look:${f(s * 0.05)}px">${irises}</g></g>`;

    if (mood === 'thirsty') {
      out += `<path d="M${f(cx + s * 0.62)} ${f(ey - ry * 1.2)} q ${f(-s * 0.12)} ${f(s * 0.2)} 0 ${f(s * 0.25)} q ${f(s * 0.12)} ${f(-s * 0.05)} 0 ${f(-s * 0.25)} Z" fill="#8fd0ff" stroke="#4a9be0" stroke-width="${f(Math.max(0.5, s * 0.03))}"/>`;
    }
    return `<g class="face">${out}</g>`;
  }

  /* ---------- Bausteine ---------- */

  /*
   * Nahtlose Formen: Zuerst werden alle Teile als Kontur gezeichnet (etwas dicker),
   * darüber alle Füllungen. Dadurch verschmelzen Arme, Blätter, Stängel und Krone
   * zu einer gemeinsamen Silhouette – ohne Trennlinien an den Übergängen.
   *   part = { d, fill, tf?, ol? }                  gefüllte Fläche
   *   part = { line, width, paint, tf?, ol? }       dicke, runde Linie (z. B. Kaktusarm)
   */
  function merged(parts, ol, ow = 2.8) {
    let outline = '', fill = '';
    parts.forEach(p => {
      const tf = p.tf ? ` transform="${p.tf}"` : '';
      const o = p.ol || ol;
      if (p.line) {
        outline += `<path d="${p.line}"${tf} fill="none" stroke="${o}" stroke-width="${f(p.width + ow)}" stroke-linecap="round" stroke-linejoin="round"/>`;
        fill += `<path d="${p.line}"${tf} fill="none" stroke="${p.paint}" stroke-width="${f(p.width)}" stroke-linecap="round" stroke-linejoin="round"/>`;
      } else {
        outline += `<path d="${p.d}"${tf} fill="${o}" stroke="${o}" stroke-width="${ow}" stroke-linejoin="round"/>`;
        fill += `<path d="${p.d}"${tf} fill="${p.fill}"/>`;
      }
    });
    return outline + fill;
  }

  const circleD = (cx, cy, r) => `M${f(cx - r)} ${f(cy)} a ${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0 a ${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0 Z`;

  function leafD(len) {
    const w = len * 0.42;
    return `M0 0 Q ${f(len * 0.45)} ${f(-w)} ${f(len)} 0 Q ${f(len * 0.5)} ${f(w * 0.7)} 0 0 Z`;
  }

  function midrib(len, tf) {
    return `<path d="M2 0 Q ${f(len * 0.5)} ${f(-len * 0.05)} ${f(len * 0.88)} 0" transform="${tf}" stroke="rgba(255,255,255,.35)" stroke-width="1" fill="none"/>`;
  }

  /** Spitz zulaufender Stängel von (0,0) nach (tx,ty) – als Pfad */
  function stemD(tx, ty, w0, w1, cx, cy) {
    return `M${f(-w0 / 2)} 2 Q ${f(cx - w0 / 2)} ${f(cy)} ${f(tx - w1 / 2)} ${f(ty)} L ${f(tx + w1 / 2)} ${f(ty)} Q ${f(cx + w0 / 2)} ${f(cy)} ${f(w0 / 2)} 2 Z`;
  }

  function sphere(cx, cy, r, fill, stroke, sw = 1.5) {
    return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${fill}"${stroke ? ` stroke="${stroke}" stroke-width="${sw}"` : ''}/>`;
  }

  function seed(mood) {
    const wilted = mood === 'sad';
    return `<g class="bob"><ellipse cx="0" cy="-11" rx="13" ry="14" fill="url(#gSeed)" stroke="${OL.seed}" stroke-width="1.3"/>` +
      `<path d="M2 -24 q 4 -8 10 -6 q -4 2 -6 8 Z" fill="${G('Leaf', wilted)}" stroke="${olGreen(wilted)}" stroke-width="1"/>` +
      face(0, -11, 11, mood) + '</g>' +
      `<path d="M-24 2 Q -14 -8 0 -4 Q 14 -8 24 2 Z" fill="url(#gSoil)"/>`;
  }

  /* ---------- Pflanzen mit Stängel (Sonnenblume, Tulpe, Baum-Keimling) ---------- */

  const STEM_H = [0, 26, 44, 62, 80, 92];
  const BUD_R = [0, 10, 12, 14];

  function stemPlant(kind, stage, mood) {
    const wilted = mood === 'sad';
    const H = STEM_H[stage];
    const bend = wilted ? 20 : 0;
    const tx = bend, ty = -H + (wilted ? 10 : 0);
    const cx = bend * 0.05, cy = -H * 0.6;
    let out = '';

    // Blätter entlang des Stängels – mit dem Stängel zu einer Form verschmolzen
    const parts = [], details = [];
    const addLeaf = (x, y, len, angle, mirror) => {
      const tf = `translate(${f(x)} ${f(y)})${mirror ? ' scale(-1 1)' : ''} rotate(${f(angle)})`;
      parts.push({ d: leafD(len), fill: G('Leaf', wilted), tf });
      details.push(midrib(len, tf));
    };
    const pairs = [0, 0, 1, 2, 2, 3][stage];
    for (let i = 0; i < pairs; i++) {
      const t = 0.22 + i * 0.24;
      const x = 2 * (1 - t) * t * cx + t * t * tx;
      const y = 2 * (1 - t) * t * cy + t * t * ty;
      const len = (kind === 'tulpe' ? 26 : 22) + stage * 2.5 - i * 3;
      const angle = (kind === 'tulpe' ? -60 : -26) + (wilted ? 55 : 0);
      addLeaf(x, y, len, angle, false);
      addLeaf(x, y, len, angle, true);
    }
    // Keimblätter direkt unter dem Köpfchen
    if (stage === 1) { addLeaf(tx, ty + 1, 15, -30, false); addLeaf(tx, ty + 1, 15, -30, true); }
    parts.push({ d: stemD(tx, ty, 3 + stage * 1.1, 2 + stage * 0.5, cx, cy), fill: G('Stem', wilted) });
    out += merged(parts, olGreen(wilted), 2.6) + details.join('');

    // Kopf
    let head = '';
    if (stage <= 3) {
      const r = BUD_R[stage];
      head += sphere(0, -r + 3, r, G('Bud', wilted), olGreen(wilted)) + face(0, -r + 4, r * 1.02, mood);
    } else if (kind === 'tulpe') {
      head += stage === 4 ? tulipBud(mood) : tulipBloom(mood);
    } else {
      head += stage === 4 ? sunBud(mood) : sunBloom(mood);
    }
    out += `<g transform="translate(${f(tx)} ${f(ty)}) rotate(${wilted ? 38 : 0})"><g class="head"><g class="bob">${head}</g></g></g>`;
    return out;
  }

  function sunBud(mood) {
    const w = mood === 'sad';
    let tips = '';
    for (let i = 0; i < 9; i++) tips += `<ellipse cx="0" cy="-27" rx="4" ry="7" fill="${G('Petal', w)}" stroke="${w ? OL.petalW : OL.petal}" stroke-width="1" transform="rotate(${-80 + i * 20} 0 -13)"/>`;
    return tips + sphere(0, -13, 16, G('Bud', w), olGreen(w)) + face(0, -12, 16, mood);
  }

  function sunBloom(mood) {
    const w = mood === 'sad';
    let back = '', front = '';
    for (let i = 0; i < 16; i++) {
      back += `<ellipse cx="0" cy="-31" rx="6" ry="12" fill="${G('Petal', w)}" stroke="${w ? OL.petalW : OL.petal}" stroke-width="1" transform="rotate(${i * 22.5 + 11} 0 0)" opacity=".9"/>`;
      front += `<ellipse cx="0" cy="-29" rx="5.6" ry="11" fill="${G('Petal', w)}" stroke="${w ? OL.petalW : OL.petal}" stroke-width="1" transform="rotate(${i * 22.5} 0 0)"/>`;
    }
    let seeds = '';
    for (let i = 0; i < 18; i++) {
      const a = i * 20 * Math.PI / 180;
      seeds += `<circle cx="${f(Math.cos(a) * 15)}" cy="${f(Math.sin(a) * 15)}" r="1.3" fill="rgba(40,20,8,.45)"/>`;
    }
    return `<g transform="translate(0 -22)">${back}${front}${sphere(0, 0, 20, G('SunC', w), OL.sun, 1.8)}${seeds}${face(0, 1, 19, mood)}</g>`;
  }

  function tulipBud(mood) {
    const w = mood === 'sad';
    return `<path d="M-8 2 Q 0 -6 8 2 Z" fill="${G('Leaf', w)}"/>` +
      `<path d="M-12 -24 Q -15 -3 0 0 Q 15 -3 12 -24 Q 7 -36 0 -39 Q -7 -36 -12 -24 Z" fill="${G('Tulip', w)}" stroke="${w ? OL.tulipW : OL.tulip}" stroke-width="1.5" stroke-linejoin="round"/>` +
      `<path d="M-5 -30 Q -8 -14 -2 -4" stroke="rgba(255,255,255,.35)" stroke-width="2" fill="none" stroke-linecap="round"/>` +
      face(0, -16, 14, mood);
  }

  function tulipBloom(mood) {
    const w = mood === 'sad';
    const ol = w ? OL.tulipW : OL.tulip;
    return `<path d="M-21 -36 Q -27 -2 0 1 Q 27 -2 21 -36 L 12 -26 L 6 -44 L 0 -30 L -6 -44 L -12 -26 Z" fill="${G('Tulip', w)}" stroke="${ol}" stroke-width="1.6" stroke-linejoin="round"/>` +
      `<path d="M-12 -34 Q -16 -8 0 -3 Q 16 -8 12 -34 Q 0 -22 -12 -34 Z" fill="${G('Tulip', w)}" stroke="${ol}" stroke-width="1" stroke-linejoin="round"/>` +
      `<path d="M-8 -30 Q -11 -14 -4 -6" stroke="rgba(255,255,255,.35)" stroke-width="2.4" fill="none" stroke-linecap="round"/>` +
      face(0, -18, 19, mood);
  }

  /* ---------- Kaktus (nach Skizze: hohe, leicht geneigte Säule mit angewinkelten Armen) ---------- */

  const CACTUS_H = [0, 30, 48, 66, 82, 92];
  const CACTUS_W = [0, 22, 27, 32, 36, 38];

  function cactus(stage, mood) {
    const w = mood === 'sad';
    const H = CACTUS_H[stage], W = CACTUS_W[stage];
    const lean = W * 0.12;                         // Spitze leicht nach rechts geneigt
    const xAt = y => lean * (-y / H);              // Mittellinie in Höhe y
    const fill = G('Cactus', w);
    const armPaint = w ? '#b0a457' : '#5db352';
    const parts = [];
    let shine = '';

    // Arme: waagerecht aus dem Körper, dann im Bogen nach oben (wie in der Skizze)
    const armW = W * 0.34;
    const arm = side => {
      const ay = -H * 0.48;
      const bx = xAt(ay) + side * W * 0.15;        // Ansatz im Körper
      const ax = xAt(ay) + side * (W / 2 + W * 0.32);
      const top = ay - H * 0.2, r = armW * 0.55;
      parts.push({ line: `M${f(bx)} ${f(ay)} L ${f(ax - side * r)} ${f(ay)} Q ${f(ax)} ${f(ay)} ${f(ax)} ${f(ay - r)} L ${f(ax)} ${f(top)}`, width: armW, paint: armPaint });
      shine += `<path d="M${f(ax - side * armW * 0.2)} ${f(ay - r - 1)} V ${f(top + 2)}" stroke="rgba(255,255,255,.32)" stroke-width="${f(armW * 0.18)}" stroke-linecap="round"/>`;
    };
    if (stage >= 3) arm(-1);
    if (stage >= 4) arm(1);

    // Körper: gerader Fuß in der Erde, oben rund, leicht geneigt
    const tl = -W / 2 + lean, tr = W / 2 + lean, yr = -H + W / 2;
    parts.push({ d: `M${f(-W / 2)} 3 L ${f(tl)} ${f(yr)} A ${f(W / 2)} ${f(W / 2)} 0 0 1 ${f(tr)} ${f(yr)} L ${f(W / 2)} 3 Z`, fill });
    let out = merged(parts, olGreen(w), 3.2) + shine;

    // Rippen, Glanz und feine Stacheln für Tiefe
    [-0.22, 0.22].forEach(k => {
      out += `<path d="M${f(W * k)} 0 L ${f(W * k + lean * 0.85)} ${f(-H + W * 0.4)}" stroke="rgba(0,0,0,.13)" stroke-width="1.6" stroke-linecap="round"/>`;
    });
    out += `<path d="M${f(-W * 0.3)} ${f(-H * 0.12)} L ${f(-W * 0.3 + lean * 0.75)} ${f(-H + W * 0.55)}" stroke="rgba(255,255,255,.32)" stroke-width="${f(W * 0.09)}" stroke-linecap="round"/>`;
    for (let y = -H + W * 0.6; y < -6; y += 10) {
      const cxl = xAt(y);
      out += `<path d="M${f(cxl - W / 2 + 0.5)} ${f(y)} l -3 -1.5 M${f(cxl + W / 2 - 0.5)} ${f(y + 5)} l 3 -1.5" stroke="#fffbe6" stroke-width="1" stroke-linecap="round"/>`;
    }
    // Augen weit oben
    const fy = -H + W * 0.62;
    out += face(xAt(fy), fy, W * 0.74, mood);
    if (stage === 5) {
      const tx = lean, ty = -H - 1;
      let fl = '';
      for (let i = 0; i < 7; i++) fl += `<ellipse cx="${f(tx)}" cy="${f(ty - 7)}" rx="4.5" ry="8" fill="url(#gCFlower)" stroke="${OL.flower}" stroke-width="1" transform="rotate(${i * 51} ${f(tx)} ${f(ty)})"/>`;
      out += `<g class="head">${fl}<circle cx="${f(tx)}" cy="${f(ty)}" r="4" fill="#ffd86b"/></g>`;
    }
    return `<g transform="rotate(${w ? 9 : 0})"><g class="bob">${out}</g></g>`;
  }

  /* ---------- Pilz ---------- */

  const PILZ = {
    capW: [12, 13, 18, 24, 30, 36],  // halbe Hutbreite
    capH: [10, 10, 14, 18, 23, 27],  // Hutwölbung
    stemH: [0, 10, 15, 21, 27, 32],
    stemW: [0, 5, 6.5, 8, 10, 12]    // halbe Stielbreite
  };

  /** Einzelner Pilz; base y = 0. Gibt {body, capTop} zurück */
  function mushroomShape(cw, ch, sh, sw, w, opts = {}) {
    const ol = w ? '#4a3d2c' : OL.cap;
    const y0 = -sh + 2;                            // Unterkante des Huts
    let out = '';
    // Lamellen auf der Hutunterseite
    out += `<ellipse cx="0" cy="${f(y0 + ch * 0.06)}" rx="${f(cw * 0.9)}" ry="${f(ch * 0.26)}" fill="url(#gGills)" stroke="${ol}" stroke-width="1"/>`;
    for (let k = -3; k <= 3; k++) {
      out += `<path d="M${f(k * cw * 0.12)} ${f(y0 + ch * 0.04)} L ${f(k * cw * 0.26)} ${f(y0 + ch * 0.26)}" stroke="rgba(90,60,30,.35)" stroke-width=".8"/>`;
    }
    const parts = [];
    if (sh > 0) parts.push({ d: `M${f(-sw)} 3 Q ${f(-sw * 0.78)} ${f(-sh * 0.5)} ${f(-sw * 0.82)} ${f(y0 + 2)} L ${f(sw * 0.82)} ${f(y0 + 2)} Q ${f(sw * 0.78)} ${f(-sh * 0.5)} ${f(sw)} 3 Z`, fill: G('Stalk', w) });
    const cap = `M${f(-cw)} ${f(y0)} C ${f(-cw)} ${f(y0 - ch * 1.34)} ${f(cw)} ${f(y0 - ch * 1.34)} ${f(cw)} ${f(y0)} Q 0 ${f(y0 + ch * 0.16)} ${f(-cw)} ${f(y0)} Z`;
    parts.push({ d: cap, fill: G('Cap', w) });
    out += merged(parts, ol, 2.8);
    // Hutdetails: helle Sprenkel und Glanzlicht
    if (!opts.plain) {
      [[-0.55, 0.5, 0.12], [0.45, 0.62, 0.1], [0.1, 0.82, 0.08], [-0.2, 0.32, 0.07], [0.7, 0.3, 0.07]].forEach(([px, py, r]) => {
        out += `<ellipse cx="${f(px * cw)}" cy="${f(y0 - py * ch)}" rx="${f(r * cw)}" ry="${f(r * cw * 0.7)}" fill="rgba(255,236,200,.38)"/>`;
      });
    }
    out += `<path d="M${f(-cw * 0.62)} ${f(y0 - ch * 0.45)} Q ${f(-cw * 0.45)} ${f(y0 - ch * 0.95)} ${f(-cw * 0.05)} ${f(y0 - ch * 0.98)}" stroke="rgba(255,255,255,.45)" stroke-width="${f(Math.max(1.2, ch * 0.13))}" fill="none" stroke-linecap="round"/>`;
    // Stiel: kleiner Ring (Manschette) bei großen Pilzen
    if (sh > 16) out += `<path d="M${f(-sw * 0.85)} ${f(y0 + 6)} Q 0 ${f(y0 + 9)} ${f(sw * 0.85)} ${f(y0 + 6)}" stroke="rgba(120,90,50,.45)" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
    return { body: out, y0 };
  }

  function mushroom(stage, mood) {
    const w = mood === 'sad';
    const cw = PILZ.capW[stage], ch = PILZ.capH[stage], sh = PILZ.stemH[stage], sw = PILZ.stemW[stage];
    let out = '';
    // Ab voller Größe: zwei kleine Pilzkinder daneben
    if (stage === 5) {
      [[-cw - 10, 0.42], [cw + 12, 0.34]].forEach(([dx, k]) => {
        const kid = mushroomShape(cw * k, ch * k * 1.1, sh * k * 1.1, sw * k * 1.1, w, { plain: true });
        out += `<g transform="translate(${f(dx)} 1)">${kid.body}</g>`;
      });
    }
    const m = mushroomShape(cw, ch, sh, sw, w);
    const eyesY = m.y0 - ch * 0.5;
    const body = m.body + face(0, eyesY, cw * 0.76, mood);
    out += `<g transform="rotate(${w ? 12 : 0} 0 0)"><g class="bob">${body}</g></g>`;
    return out;
  }

  /** Pilz im Samen-Stadium: kleiner Hut, der aus der Erde lugt */
  function mushroomSeed(mood) {
    const m = mushroomShape(PILZ.capW[0], PILZ.capH[0], 0, 0, mood === 'sad', { plain: true });
    return `<g class="bob"><g transform="translate(0 -3)">${m.body}${face(0, m.y0 - PILZ.capH[0] * 0.5, 9, mood)}</g></g>` +
      `<path d="M-22 2 Q -13 -6 0 -3 Q 13 -6 22 2 Z" fill="url(#gSoil)"/>`;
  }

  /* ---------- Kirschbaum ---------- */

  function tree(stage, mood) {
    if (stage === 1) return stemPlant('baum', 1, mood);
    const w = mood === 'sad';
    const th = [0, 0, 30, 42, 52, 58][stage];
    const tw = [0, 0, 6, 9, 11, 13][stage];
    const R = [0, 0, 22, 28, 34, 38][stage];
    const cy = -th - R * 0.5;
    const parts = [];
    // Stamm mit Wurzelansatz – reicht bis in die Krone hinein
    parts.push({ d: `M${f(-tw / 2 - 5)} 3 Q ${f(-tw / 2)} -3 ${f(-tw * 0.32)} ${f(-th - R * 0.3)} L ${f(tw * 0.32)} ${f(-th - R * 0.3)} Q ${f(tw / 2)} -3 ${f(tw / 2 + 5)} 3 Z`, fill: 'url(#gTrunk)', ol: OL.trunk });
    if (stage >= 3) {
      parts.push({ line: `M0 ${f(-th + 10)} Q ${f(-R * 0.25)} ${f(-th - 2)} ${f(-R * 0.55)} ${f(-th - 10)}`, width: 4, paint: '#8a5a33', ol: OL.trunk });
      parts.push({ line: `M0 ${f(-th + 6)} Q ${f(R * 0.25)} ${f(-th - 4)} ${f(R * 0.5)} ${f(-th - 14)}`, width: 3.5, paint: '#8a5a33', ol: OL.trunk });
    }
    const back = stage === 2 ? [] : [[-R * 0.72, R * 0.12, R * 0.68], [R * 0.72, R * 0.08, R * 0.7], [0, -R * 0.55, R * 0.72]];
    back.forEach(([dx, dy, r]) => parts.push({ d: circleD(dx, cy + dy, r), fill: G('CanopyB', w) }));
    parts.push({ d: circleD(0, cy + R * 0.12, R * 0.86), fill: G('Canopy', w) });
    let out = merged(parts, olGreen(w), 3);
    if (stage === 5) {
      const pts = [[-0.9, -0.1], [-0.55, -0.75], [0.1, -1.05], [0.65, -0.7], [0.95, 0.05], [-0.75, 0.5], [0.75, 0.55], [-0.62, 0.9], [0.62, 0.92], [-1.15, 0.3], [1.15, 0.35]];
      pts.forEach(([px, py]) => {
        out += `<circle cx="${f(px * R)}" cy="${f(cy + py * R)}" r="4.6" fill="url(#gBlossom)"/><circle cx="${f(px * R)}" cy="${f(cy + py * R)}" r="1.3" fill="#d94f7a"/>`;
      });
    }
    out += face(0, cy + R * 0.16, R * 0.7, mood);
    return `<g class="bob">${out}</g>`;
  }

  /** Ungefähre Höhe der Pflanze über dem Boden (für Sprechblasen) */
  function plantTop(type, stage) {
    if (stage === 0) return 26;
    if (type === 'kaktus') return CACTUS_H[stage] + (stage === 5 ? 16 : 0);
    if (type === 'pilz') return PILZ.stemH[stage] + PILZ.capH[stage] * 1.05;
    if (type === 'kirschbaum' && stage >= 2) {
      const th = [0, 0, 30, 42, 52, 58][stage], R = [0, 0, 22, 28, 34, 38][stage];
      return th + R * 0.5 + (stage === 2 ? R * 0.74 : R * 1.27);
    }
    const H = STEM_H[stage];
    if (stage <= 3) return H + BUD_R[stage] * 2 - 3;
    if (type === 'tulpe') return H + (stage === 4 ? 39 : 44);
    return H + (stage === 4 ? 34 : 64);
  }

  /** Pflanze als <g>, Basis bei (0,0), wächst nach oben (negative y) */
  function plantGroup(type, stage, mood, opts = {}) {
    let body;
    if (stage === 0) body = type === 'pilz' ? mushroomSeed(mood) : seed(mood);
    else if (type === 'kaktus') body = cactus(stage, mood);
    else if (type === 'pilz') body = mushroom(stage, mood);
    else if (type === 'kirschbaum') body = tree(stage, mood);
    else body = stemPlant(type, stage, mood);
    const amp = type === 'kaktus' ? 1 : type === 'pilz' ? 1.2 : type === 'kirschbaum' ? 1.6 : 3;
    const style = `--amp:${stage === 0 ? 0.5 : amp}deg;` + (opts.style || '');
    // Erdhügel vor dem Fuß der Pflanze – sie steckt sichtbar im Boden
    const mw = type === 'kaktus' ? 30 : type === 'kirschbaum' ? 28 : type === 'pilz' ? 20 : 22;
    const mound = stage === 0 ? '' :
      `<path d="M${-mw} 4 Q ${f(-mw * 0.7)} -5 ${f(-mw * 0.3)} -6 Q 0 -8 ${f(mw * 0.3)} -6 Q ${f(mw * 0.7)} -5 ${mw} 4 Z" fill="url(#gSoil)" stroke="#3e2716" stroke-width="1" stroke-linejoin="round"/>` +
      `<ellipse cx="${f(-mw * 0.45)}" cy="-1" rx="2.2" ry="1.4" fill="rgba(255,255,255,.14)"/>` +
      `<ellipse cx="${f(mw * 0.35)}" cy="0" rx="1.8" ry="1.1" fill="rgba(255,255,255,.12)"/>` +
      `<ellipse cx="${f(mw * 0.05)}" cy="-4" rx="1.5" ry="1" fill="rgba(0,0,0,.18)"/>`;
    return `<g class="plant mood-${mood}">` +
      `<ellipse cx="0" cy="2" rx="${stage === 0 ? 22 : mw + 8}" ry="6" fill="url(#gShadow)"/>` +
      `<g class="sway" style="${style}">${body}</g>${mound}</g>`;
  }

  /** Einzelbild mit Topf (Shop, Sammlung) */
  function plantSVG(type, stage, mood = 'happy', extraClass = '') {
    const pot = `
      <path d="M33 112 L87 112 L81 146 L39 146 Z" fill="url(#gPot)"/>
      <rect x="29" y="103" width="62" height="12" rx="4" fill="url(#gPotRim)"/>
      <ellipse cx="60" cy="105" rx="28" ry="3.6" fill="#4a2f1c"/>`;
    return `<svg class="plant-svg ${extraClass}" viewBox="0 0 120 150" role="img" aria-label="${PLANT_TYPES[type].name}, ${STAGE_NAMES[stage]}">
      <g transform="translate(60 106) scale(.62)">${plantGroup(type, stage, mood)}</g>${pot}</svg>`;
  }

  global.Plants = {
    PLANT_TYPES, STAGE_NAMES, MAX_STAGE, RULES,
    stageFor, stageProgress, applyDecay, createPlant, plantStatus, moodFor,
    canWater, canFertilize, fertilizerReadyIn, waterReadyIn, msUntilWater, formatDuration,
    defsSVG, plantGroup, plantSVG, plantTop
  };
})(window);
