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
      name: 'Kaktus', emoji: '🌵', seedCost: 25, waterCost: 4, decay: 1.5,
      thresholds: [0, 3, 7, 12, 18, 26],
      desc: 'Verzeiht lange Pausen, wächst langsam.'
    },
    kirschbaum: {
      name: 'Kirschbaum', emoji: '🌸', seedCost: 50, waterCost: 8, decay: 2.5,
      thresholds: [0, 3, 8, 15, 24, 35],
      desc: 'Die Königsdisziplin – ein Bäumchen voller Blüten.'
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

  function canWater(plant) {
    if (plant.water >= RULES.waterAllowedBelow) return { ok: false, reason: 'Die Erde ist noch feucht.' };
    return { ok: true };
  }

  function fertilizerReadyIn(plant, now) {
    const readyAt = (plant.lastFertilized || 0) + RULES.fertilizerCooldownH * HOUR;
    return Math.max(0, readyAt - now);
  }

  function canFertilize(plant, now) {
    if (stageFor(plant.type, plant.growth) >= MAX_STAGE) return { ok: false, reason: 'Schon ausgewachsen.' };
    if (plant.water <= 0) return { ok: false, reason: 'Welke Pflanzen erst gießen.' };
    const wait = fertilizerReadyIn(plant, now);
    if (wait > 0) return { ok: false, reason: 'Dünger wieder in ' + formatDuration(wait) + '.' };
    return { ok: true };
  }

  function formatDuration(ms) {
    const min = Math.ceil(ms / 60000);
    if (min < 60) return min + ' Min.';
    const h = Math.floor(min / 60), m = min % 60;
    return m ? `${h} Std. ${m} Min.` : `${h} Std.`;
  }

  /* ---------------- SVG ---------------- */

  const C = {
    leaf: '#4f9d4a', leafDark: '#3a7d38', stem: '#3f8a3c',
    wiltLeaf: '#a39a52', wiltStem: '#8f8748',
    soil: '#5b3b26', soilTop: '#6f4a30',
    pot: '#c96f4a', potDark: '#a95a3a', potRim: '#d9825c'
  };

  function leafPath(x, y, len, angle, color) {
    const w = len * 0.42;
    return `<path d="M0 0 Q ${len / 2} ${-w} ${len} 0 Q ${len / 2} ${w} 0 0 Z" fill="${color}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${angle})"/>` +
      `<path d="M0 0 L ${len * 0.85} 0" stroke="rgba(0,0,0,.15)" stroke-width="1" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${angle})"/>`;
  }

  function pot() {
    return `
      <ellipse cx="60" cy="137" rx="30" ry="3" fill="rgba(0,0,0,.12)"/>
      <path d="M32 104 L88 104 L82 136 L38 136 Z" fill="${C.pot}"/>
      <path d="M70 104 L88 104 L82 136 L70 136 Z" fill="${C.potDark}" opacity=".55"/>
      <rect x="28" y="96" width="64" height="11" rx="3" fill="${C.potRim}"/>
      <ellipse cx="60" cy="98" rx="29" ry="4" fill="${C.soil}"/>`;
  }

  function seed() {
    return `
      <ellipse cx="60" cy="95" rx="11" ry="4" fill="${C.soilTop}"/>
      <ellipse cx="60" cy="93" rx="4" ry="2.8" fill="#c9a26b" stroke="#8a6a3e" stroke-width="1"/>`;
  }

  // Generische Pflanze mit Stängel (Sonnenblume, Tulpe)
  function stemPlant(kind, stage, wilted) {
    const heights = [0, 16, 30, 46, 60, 68];
    const h = heights[stage];
    const bend = wilted ? 14 : 0;
    const baseX = 60, baseY = 97;
    const topX = baseX + bend, topY = baseY - h + (wilted ? 6 : 0);
    const stemColor = wilted ? C.wiltStem : C.stem;
    const leafColor = wilted ? C.wiltLeaf : (kind === 'tulpe' ? '#5aa863' : C.leaf);
    let out = `<path d="M${baseX} ${baseY} Q ${baseX + (wilted ? 2 : 0)} ${baseY - h * 0.6} ${topX} ${topY}" stroke="${stemColor}" stroke-width="${2.5 + stage * 0.35}" fill="none" stroke-linecap="round"/>`;

    // Blätter
    const pairs = [0, 1, 1, 2, 2, 3][stage];
    for (let i = 0; i < pairs; i++) {
      const f = 0.22 + i * 0.26;
      const y = baseY - h * f;
      const x = baseX + bend * f * f;
      const len = (kind === 'tulpe' ? 16 : 12) + stage * 2 - i * 1.5;
      const up = kind === 'tulpe' ? -62 : -32;
      const droop = wilted ? 45 : 0;
      out += leafPath(x, y, len, up + droop, leafColor);
      out += leafPath(x, y, len, 180 - up - droop, leafColor);
    }
    if (stage === 1) {
      out += leafPath(topX, topY, 9, -40, leafColor) + leafPath(topX, topY, 9, 220, leafColor);
    }

    // Knospe / Blüte
    if (stage === 4) {
      const bud = wilted ? '#9c9a5a' : (kind === 'tulpe' ? '#e0607e' : '#7bb24c');
      out += `<ellipse cx="${topX}" cy="${topY - 5}" rx="6" ry="8" fill="${bud}"/>`;
      out += `<path d="M${topX - 6} ${topY - 1} Q ${topX} ${topY - 6} ${topX + 6} ${topY - 1}" fill="${wilted ? C.wiltLeaf : C.leafDark}"/>`;
    }
    if (stage === 5) {
      const rot = wilted ? 50 : 0;
      out += `<g transform="translate(${topX} ${topY}) rotate(${rot})">`;
      out += kind === 'tulpe' ? tulipHead(wilted) : sunflowerHead(wilted);
      out += `</g>`;
    }
    return out;
  }

  function sunflowerHead(wilted) {
    const petal = wilted ? '#c8b35e' : '#f6c431';
    const petal2 = wilted ? '#b9a453' : '#f0a92b';
    let petals = '';
    for (let i = 0; i < 14; i++) {
      petals += `<ellipse cx="0" cy="-14" rx="4.2" ry="9" fill="${i % 2 ? petal2 : petal}" transform="rotate(${(360 / 14) * i})"/>`;
    }
    // Mittelpunkt der Blüte liegt leicht über der Stängelspitze
    return `<g transform="translate(0 -8) scale(.78)">${petals}` +
      `<circle r="10" fill="${wilted ? '#6b5640' : '#6b4226'}"/>` +
      `<circle r="6.5" fill="${wilted ? '#58463a' : '#4e2f1b'}"/></g>`;
  }

  function tulipHead(wilted) {
    const a = wilted ? '#b98a8a' : '#e94f6f';
    const b = wilted ? '#a37777' : '#c93a5a';
    return `
      <path d="M-10 -4 Q -12 -20 -6 -24 L 0 -16 L 6 -24 Q 12 -20 10 -4 Q 0 4 -10 -4 Z" fill="${a}"/>
      <path d="M-3 -2 Q -4 -18 0 -26 Q 4 -18 3 -2 Z" fill="${b}"/>`;
  }

  function cactus(stage, wilted) {
    const hs = [0, 14, 26, 40, 52, 58];
    const ws = [0, 14, 17, 20, 22, 23];
    const h = hs[stage], w = ws[stage];
    const body = wilted ? '#9aa35a' : '#5fa35a';
    const dark = wilted ? '#828a49' : '#4a8a46';
    const baseY = 98;
    const tilt = wilted ? 8 : 0;
    let out = `<g transform="rotate(${tilt} 60 ${baseY})">`;
    // Arme
    if (stage >= 3) {
      const ay = baseY - h * 0.55;
      out += `<path d="M${60 - w / 2 + 2} ${ay} h -10 q -5 0 -5 -6 v -${8 + stage * 2} q 0 -5 5 -5 q 5 0 5 5 v ${6 + stage} h 6" fill="${body}" stroke="${dark}" stroke-width="1.2"/>`;
    }
    if (stage >= 4) {
      const ay = baseY - h * 0.4;
      out += `<path d="M${60 + w / 2 - 2} ${ay} h 10 q 5 0 5 -6 v -12 q 0 -5 -5 -5 q -5 0 -5 5 v 10 h -6" fill="${body}" stroke="${dark}" stroke-width="1.2"/>`;
    }
    out += `<rect x="${60 - w / 2}" y="${baseY - h}" width="${w}" height="${h}" rx="${w / 2}" fill="${body}" stroke="${dark}" stroke-width="1.2"/>`;
    // Rippen
    out += `<path d="M60 ${baseY - h + 4} V ${baseY - 2}" stroke="${dark}" stroke-width="1" opacity=".6"/>`;
    // Stacheln
    for (let y = baseY - h + 6; y < baseY - 3; y += 7) {
      out += `<path d="M${60 - w / 2 + 3} ${y} l -3 -1 M${60 + w / 2 - 3} ${y + 3} l 3 -1 M${60 - 4} ${y + 2} l -2 -2 M${60 + 4} ${y + 5} l 2 -2" stroke="#f3eed2" stroke-width="1" stroke-linecap="round"/>`;
    }
    if (stage === 5) {
      const fy = baseY - h - 2;
      const f = wilted ? '#c8a0ac' : '#ff6fa3';
      for (let i = 0; i < 6; i++) out += `<ellipse cx="60" cy="${fy - 4}" rx="2.6" ry="5" fill="${f}" transform="rotate(${i * 60} 60 ${fy})"/>`;
      out += `<circle cx="60" cy="${fy}" r="2.6" fill="#ffd86b"/>`;
    }
    return out + '</g>';
  }

  function tree(stage, wilted) {
    const baseY = 98;
    if (stage === 1) return stemPlant('sonnenblume', 1, wilted);
    const trunkH = [0, 0, 26, 36, 46, 52][stage];
    const trunkW = [0, 0, 3, 5, 6.5, 7.5][stage];
    const crown = wilted ? '#a7a15a' : '#4f9d4a';
    const crown2 = wilted ? '#938d4e' : '#3f8a3c';
    const topY = baseY - trunkH;
    let out = `<path d="M${60 - trunkW / 2} ${baseY} L ${60 - trunkW / 3} ${topY} L ${60 + trunkW / 3} ${topY} L ${60 + trunkW / 2} ${baseY} Z" fill="#7a5233"/>`;
    if (stage >= 4) out += `<path d="M60 ${topY + 14} L 48 ${topY + 2} M60 ${topY + 10} L 72 ${topY}" stroke="#7a5233" stroke-width="3" stroke-linecap="round"/>`;
    const r = [0, 0, 12, 17, 21, 23][stage];
    const blobs = stage === 2
      ? [[0, 0, 1]]
      : [[0, -4, 1], [-r * 0.75, 4, 0.75], [r * 0.75, 4, 0.75], [0, 8, 0.7]];
    blobs.forEach(([dx, dy, s], i) => {
      out += `<circle cx="${60 + dx}" cy="${topY + dy}" r="${r * s}" fill="${i % 2 ? crown2 : crown}"/>`;
    });
    if (stage === 5) {
      const pts = [[-14, -8], [8, -14], [16, 2], [-20, 6], [-4, 10], [2, -2], [20, 12], [-10, -18], [12, -4], [-16, -2]];
      const fc = wilted ? '#c9a9b0' : '#ffb3c8';
      pts.forEach(([dx, dy]) => {
        out += `<circle cx="${60 + dx}" cy="${topY + dy}" r="3.2" fill="${fc}"/><circle cx="${60 + dx}" cy="${topY + dy}" r="1.1" fill="#e8668f"/>`;
      });
    }
    return out;
  }

  function plantSVG(type, stage, wilted, extraClass) {
    let body;
    if (stage === 0) body = seed();
    else if (type === 'kaktus') body = cactus(stage, wilted);
    else if (type === 'kirschbaum') body = tree(stage, wilted);
    else body = stemPlant(type, stage, wilted);
    return `<svg class="plant-svg ${extraClass || ''}" viewBox="0 0 120 140" role="img" aria-label="${PLANT_TYPES[type].name}, ${STAGE_NAMES[stage]}${wilted ? ', welk' : ''}">
      <g class="plant-body">${body}</g>${pot()}</svg>`;
  }

  global.Plants = {
    PLANT_TYPES, STAGE_NAMES, MAX_STAGE, RULES,
    stageFor, stageProgress, applyDecay, createPlant, plantStatus,
    canWater, canFertilize, fertilizerReadyIn, formatDuration, plantSVG
  };
})(window);
