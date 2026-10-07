// Desk-Büro: ein gemeinsames Großraumbüro, in dem die vier Agenten an ihren Plätzen sitzen.
// Gesteuert von desk_squawk und trade_proposals: wer eine Meldung schreibt, arbeitet sichtbar
// (tippt, Bildschirm leuchtet, Sprechblase), danach Ruhe; nach langer Pause schläft er ein.
// Szene = ein SVG (viewBox W×H), Texte liegen als HTML darüber (Positionen in % derselben Maße).

const W = 1000, H = 460;
const DESK_Y = 360;                 // Oberkante der Tische in der Szene
const HEAD_DY = -94;                // Kopfmitte relativ zur Tischkante

const AGENTS = [
  { key: 'fundamental', name: 'Fundamental', role: 'Bias & News', x: 150, color: '#818cf8', shirt: '#4f46e5', skin: '#f1c27d', hair: '#3b2f2a', style: 'short', acc: 'glasses', screen: 'news' },
  { key: 'technik', name: 'Technik', role: 'BITR & ORB', x: 390, color: '#fbbf24', shirt: '#d97706', skin: '#8d5524', hair: '#111827', style: 'curly', acc: 'headset', screen: 'chart' },
  { key: 'risk', name: 'Risk', role: 'Größe & Limits', x: 630, color: '#fb7185', shirt: '#e11d48', skin: '#e0ac69', hair: '#7c2d12', style: 'long', acc: 'none', screen: 'gauge' },
  { key: 'boss', name: 'Boss', role: 'Entscheidung', x: 870, color: '#4ade80', shirt: '#334155', skin: '#c68642', hair: '#9ca3af', style: 'side', acc: 'tie', screen: 'chat' },
];

const WORK_MS = 25000;       // so lange arbeitet ein Agent nach einer Meldung
const BUBBLE_MS = 7000;      // so lange bleibt die Sprechblase stehen
const SLEEP_MS = 30 * 60000; // ab hier schläft ein Agent

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pct = (v, total) => `${(v / total * 100).toFixed(2)}%`;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const state = {};   // key -> { nodes, anchor, bubble, chip, lastActive, workTimer, bubbleTimer }
let officeEl = null;

// ---------------------------------------------------------------------------
// Szene
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Figuren als moderne Pixel-Art: Raster mit PX Einheiten je Pixel, dunkle
// Kontur, Licht links / Schatten rechts. Zeichen -> Farbe siehe palette().
// ---------------------------------------------------------------------------
const PX = 4;

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  return '#' + [n >> 16, (n >> 8) & 255, n & 255].map(v => ch(v).toString(16).padStart(2, '0')).join('');
}

function palette(a) {
  return {
    o: '#121622', s: a.skin, S: shade(a.skin, -0.18), b: shade(a.skin, -0.08),
    h: a.hair, H: shade(a.hair, 0.28), c: a.shirt, L: shade(a.shirt, 0.22), C: shade(a.shirt, -0.25),
    w: '#f1f5f9', t: a.color, g: '#0f172a', k: '#1f2937', a: a.color,
  };
}

// Gesicht ohne Haare (14 × 13)
const FACE = [
  '..............', '..............',
  '...oooooooo...', '..ossssssssSo.', '.ossssssssssSo', '.ossssssssssSo',
  '.ossssssssssSo', '.ossssssssssSo', '.osbssssssbsSo', '.ossssssssssSo',
  '..osssssssSSo.', '...oSSSSSSoo..', '....oooooo....',
];

const HAIR = {
  short: ['....oooooo....', '..oohHHhhhoo..', '.ohhHhhhhhhho.', '.ohhhhhhhhhhho', 'ohh........hho', 'oh..........ho'],
  curly: ['..oo.oooo.oo..', '.ohhohhhhohho.', 'ohhhhHhhhhhhho', 'ohhHhhhhhhHhho', 'ohh........hho', 'oh..........ho', 'oh..........ho'],
  long: ['....oooooo....', '..oohhhhhhoo..', '.ohhhHHhhhhho.', 'ohhhhhhhhhhhho', 'ohhh......hhho', 'ohh........hho',
    'oh..........ho', 'oh..........ho', 'oh..........ho', 'oh..........ho', 'ohh........hho', 'ohhh......hhho', '.ooo......ooo.'],
  side: ['....oooooo....', '..oohhhhHHoo..', '.ohhhhhhhHHho.', '.ohhhhhh....o.', '.oh...........'],
};

const ACC = {
  glasses: ['', '', '', '', '', '...ggg..ggg...', '...g.gggg.g...', '...g.g..g.g...', '...ggg..ggg...'],
  headset: ['', '...kkkkkkkk...', '..k........k..', '.k..........k.', 'kk..........kk', 'kk..........kk', 'kk..........kk',
    'kk..........kk', '.k............', '.k............', '..kkka........'],
};

// Oberkörper: linke Hälfte (11 Spalten), wird gespiegelt; rechts L -> C (Schatten)
const BODY_LEFT = [
  '.........os', '.........oS', '....oooooLs', '..ooLLccccw', '.oLLccccccc', '.oLcccccccc',
  'oLccccccccc', 'oLccccccccc', 'oLccccccccc', 'oLcoccccccc', 'oLcoccccccc', 'oLcoccccccc',
  'oLcoccccccc', 'oLcoccccccc', 'oLcoccccccc', 'oLcoccccccc', 'oLcoccccccc',
];

function bodyRows(a) {
  return BODY_LEFT.map((left, r) => {
    const row = (left + [...left].reverse().join('').replace(/L/g, 'C')).split('');
    if (a.acc === 'tie' && r >= 3 && r <= 15) {   // Sakko: Hemd + Krawatte in der Mitte, Revers
      row[9] = row[12] = 'w';
      row[10] = row[11] = 't';
      if (r <= 8) row[8] = row[13] = 'o';
    }
    return row.join('');
  });
}

function overlay(base, top) {
  return base.map((row, r) => {
    const t = top[r];
    if (!t) return row;
    return [...row].map((ch, i) => (t[i] && t[i] !== '.' ? t[i] : ch)).join('');
  });
}

// Raster -> <rect>s (gleichfarbige Läufe je Zeile zusammengefasst)
function pixels(rows, pal, x0, y0) {
  let out = '';
  rows.forEach((row, r) => {
    for (let i = 0; i < row.length;) {
      const ch = row[i];
      let j = i;
      while (j < row.length && row[j] === ch) j++;
      if (ch !== '.' && pal[ch]) out += `<rect x="${x0 + i * PX}" y="${y0 + r * PX}" width="${(j - i) * PX}" height="${PX}" fill="${pal[ch]}"/>`;
      i = j;
    }
  });
  return out;
}

function pixelPerson(a) {
  const pal = palette(a);
  const hx = -7 * PX, hy = -122;                 // Kopf 14 × 13 Pixel
  let head = overlay(FACE, HAIR[a.style] || HAIR.short);
  if (ACC[a.acc]) head = overlay(head, ACC[a.acc]);
  return `
    <g class="person" shape-rendering="crispEdges">
      ${pixels(bodyRows(a), pal, -11 * PX, -70)}
      <g class="head">
        ${pixels(head, pal, hx, hy)}
        <g class="eyes"><rect class="eye" x="${hx + 4 * PX}" y="${hy + 6 * PX}" width="${PX}" height="${2 * PX}" fill="#0b0d14"/><rect class="eye" x="${hx + 9 * PX}" y="${hy + 6 * PX}" width="${PX}" height="${2 * PX}" fill="#0b0d14"/></g>
        <rect class="mouth" x="${hx + 6 * PX}" y="${hy + 9 * PX}" width="${2 * PX}" height="${PX}" fill="${shade(a.skin, -0.42)}"/>
      </g>
    </g>`;
}

function pixelHands(a) {
  const pal = palette(a);
  const hand = ['CCoo.', 'Cosso', 'CoSSo'];        // Ärmel + Hand, 5 × 3 Pixel
  const mirror = hand.map(r => [...r].reverse().join(''));
  return `
    <g class="hand hand-l" shape-rendering="crispEdges">${pixels(hand, pal, -6 * PX, -15)}</g>
    <g class="hand hand-r" shape-rendering="crispEdges">${pixels(mirror, pal, 1 * PX, -15)}</g>`;
}

function screenUi(a) {
  // Inhalt des Monitors (lokale Koordinaten: Bildschirm x 40..100, y -72..-24), alles im 4er-Raster
  switch (a.screen) {
    case 'chart': {
      const c = [[44, -44, 8, 1], [52, -48, 8, 1], [60, -48, 4, 0], [68, -56, 12, 1], [76, -52, 4, 0], [84, -60, 8, 1], [92, -64, 8, 1]];
      return c.map(([x, y, h, up], i) => `<rect class="${i === c.length - 1 ? 'live-candle' : ''}" x="${x}" y="${y}" width="4" height="${h}" fill="${up ? '#4ade80' : '#fb7185'}"/>`).join('')
        + [44, 56, 68, 80, 92].map(x => `<rect x="${x}" y="-32" width="4" height="4" fill="#fbbf24" opacity=".7"/>`).join('');
    }
    case 'gauge': {
      const ring = ['..rrr..', '.r...r.', 'r.....r', 'g.....r', 'g.....r', '.g...g.', '..ggg..'];
      return pixels(ring, { r: '#2c3346', g: a.color }, 44, -68)
        + `<rect x="76" y="-64" width="16" height="4" fill="#94a3b8"/><rect x="76" y="-56" width="12" height="4" fill="#94a3b8"/><rect x="76" y="-48" width="16" height="4" fill="#4ade80"/><rect x="76" y="-40" width="8" height="4" fill="#94a3b8"/>`;
    }
    case 'chat':
      return `<rect x="44" y="-68" width="32" height="8" fill="#334155"/><rect x="60" y="-56" width="36" height="8" fill="${a.color}" opacity=".85"/>`
        + `<rect class="chat-new" x="44" y="-44" width="28" height="8" fill="#334155"/>`;
    default:
      return `<rect x="44" y="-68" width="20" height="16" fill="${a.color}" opacity=".7"/><rect x="68" y="-68" width="28" height="4" fill="#cbd5e1"/><rect x="68" y="-60" width="20" height="4" fill="#64748b"/>`
        + `<g class="news-lines"><rect x="44" y="-48" width="52" height="4" fill="#64748b"/><rect x="44" y="-40" width="40" height="4" fill="#64748b"/><rect x="44" y="-32" width="48" height="4" fill="#64748b"/></g>`;
  }
}

// Kasten mit abgeschnittenen Ecken (Pixel-Look statt Rundung)
function pbox(x, y, w, h, fill, extra = '') {
  return `<rect x="${x + 4}" y="${y}" width="${w - 8}" height="${h}" fill="${fill}" ${extra}/><rect x="${x}" y="${y + 4}" width="${w}" height="${h - 8}" fill="${fill}" ${extra}/>`;
}

function station(a) {
  const mug = pixels(['wwwW.', 'wwwWW', 'wwwWW', 'wwwW.'], { w: '#e8ebf2', W: '#b6bccb' }, -92, -20);
  const phone = a.key === 'boss'
    ? `<g class="phone">${pbox(-68, -24, 16, 20, '#475569')}<rect x="-64" y="-20" width="8" height="12" fill="#0f172a"/><rect class="phone-glow" x="-64" y="-16" width="8" height="4" fill="${a.color}"/></g>`
    : '';
  return `
  <g class="st st-${a.key}" transform="translate(${a.x} ${DESK_Y})">
    <rect x="-116" y="72" width="232" height="8" fill="#000" opacity=".3"/>
    <rect x="-108" y="80" width="216" height="4" fill="#000" opacity=".18"/>
    <!-- Stuhl -->
    <rect x="-40" y="-124" width="80" height="4" fill="#20273a"/><rect x="-44" y="-120" width="88" height="4" fill="#20273a"/>
    <rect x="-48" y="-116" width="96" height="116" fill="#20273a"/>
    <rect x="-44" y="-116" width="4" height="112" fill="#2a3249"/>
    <rect x="-36" y="-116" width="72" height="4" fill="${a.color}" opacity=".45"/>
    ${pixelPerson(a)}
    <!-- Tisch -->
    <rect x="-112" y="-4" width="224" height="4" fill="#4a5470"/>
    <rect x="-112" y="0" width="224" height="8" fill="#323a50"/>
    <rect x="-104" y="8" width="208" height="64" fill="#12151f"/>
    <rect x="-100" y="8" width="200" height="60" fill="#1a1f2d"/>
    <rect x="-100" y="8" width="200" height="4" fill="${a.color}" opacity=".6"/>
    <rect x="-100" y="64" width="200" height="4" fill="#151925"/>
    <rect x="-28" y="-12" width="56" height="8" fill="#0f131c"/>
    ${[-24, -16, -8, 0, 8, 16].map(x => `<rect x="${x}" y="-12" width="4" height="4" fill="#232a3b"/>`).join('')}
    ${pixelHands(a)}
    <!-- Monitor -->
    <rect x="64" y="-24" width="8" height="20" fill="#2c3346"/><rect x="56" y="-8" width="24" height="4" fill="#2c3346"/>
    ${pbox(36, -76, 68, 56, '#2f3750')}
    <rect x="40" y="-72" width="60" height="48" fill="#0b0e15"/>
    <rect x="40" y="-72" width="60" height="4" fill="#141a26"/>
    <g class="screen-ui">${screenUi(a)}</g>
    <rect class="screen-glow" x="40" y="-72" width="60" height="48" fill="${a.color}"/>
    <g class="mug">${mug}
      <g class="steam" fill="#94a3b8"><rect x="-88" y="-28" width="4" height="4"/><rect x="-84" y="-32" width="4" height="4"/><rect x="-88" y="-36" width="4" height="4"/><rect x="-80" y="-36" width="4" height="4"/></g></g>
    ${phone}
  </g>`;
}

function skyline() {
  // Feste Pseudo-Zufallsfolge, damit die Stadt bei jedem Laden gleich aussieht; alles im 4er-Raster
  let seed = 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  const snap = (v) => Math.round(v / 4) * 4;
  let out = '', x = 40;
  while (x < 560) {
    const w = Math.min(snap(32 + rnd() * 44), 556 - x), h = snap(48 + rnd() * 116);
    if (w < 8) break;
    const top = 228 - h;
    out += `<rect x="${x}" y="${top}" width="${w}" height="${h}" class="bld"/><rect x="${x + w - 8}" y="${top}" width="8" height="${h}" class="bld2"/>`;
    if (rnd() < 0.3) out += `<rect x="${x + snap(w / 2) - 4}" y="${top - 12}" width="4" height="12" class="bld"/><rect x="${x + snap(w / 2) - 4}" y="${top - 16}" width="4" height="4" class="beacon"/>`;
    for (let wy = top + 8; wy < 220; wy += 12) {
      for (let wx = x + 4; wx < x + w - 12; wx += 8) {
        if (rnd() < 0.36) out += `<rect x="${wx}" y="${wy}" width="4" height="4" class="lit"/>`;
      }
    }
    x += w + 4;
  }
  return out;
}

function plant() {
  const g = ['..l.....l', '.lL....lL.', '.lLl..lLl.', '..lLllLl..', '.l.lLLl.l.', 'lLl.ll.lLl', '.lLlllLl..', '..lLlLl...',
    '...llll...', '....ll....', '..pppppp..', '..pPPPPp..', '...pPPp...', '...pppp...'];
  return pixels(g.map(r => r.padEnd(10, '.')), { l: '#16a34a', L: '#4ade80', p: '#334155', P: '#475569' }, 564, 244);
}

function lamp(x) {
  const shade = pixels(['..ooooooo..', '.ossssssso.', 'ossssssssso', '.yyyyyyyyy.'], { o: '#232a3d', s: '#2f3750', y: '#fde68a' }, x - 22, 24);
  let cone = '';
  for (let i = 0; i < 16; i++) {
    const y = 40 + i * 16, half = 20 + i * 6;
    cone += `<rect x="${x - Math.round(half / 4) * 4}" y="${y}" width="${Math.round(half / 4) * 8}" height="16" fill="#fde68a" opacity="${(0.045 - i * 0.0026).toFixed(3)}"/>`;
  }
  return `<g class="lamp"><rect x="${x - 2}" y="0" width="4" height="24" fill="#2f3750"/>${shade}<g class="lamp-cone">${cone}</g></g>`;
}

function scene() {
  const SUN = ['..sss..', '.sssss.', 'sssssss', 'sssssss', 'sssssss', '.sssss.', '..sss..'];
  // Boden: Dielen in zwei Tönen mit versetzten Fugen
  let floor = '';
  for (let r = 0, y = 304; y < H; r++, y += 16) {
    floor += `<rect x="0" y="${y}" width="${W}" height="16" fill="${r % 2 ? '#171c28' : '#1a1f2c'}"/>`;
    for (let x = (r % 2) * 48; x < W; x += 96) floor += `<rect x="${x}" y="${y}" width="4" height="16" fill="#131722"/>`;
  }
  return `
  <svg class="office-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" shape-rendering="crispEdges" aria-hidden="true">
    <!-- Wand mit Paneelen, Sockel und Fußleiste -->
    <rect width="${W}" height="304" fill="#161b28"/>
    ${Array.from({ length: 9 }, (_, i) => `<rect x="${i * 120 + 56}" y="0" width="4" height="248" fill="#1a2030"/>`).join('')}
    <rect y="248" width="${W}" height="48" fill="#131826"/>
    <rect y="244" width="${W}" height="4" fill="#222a3d"/>
    <rect y="296" width="${W}" height="8" fill="#252c3e"/>
    <rect y="296" width="${W}" height="4" fill="#2d3550"/>
    ${floor}

    <!-- Fenster mit Skyline (Himmelsstufen und Licht per CSS nach Tageszeit) -->
    ${[0, 1, 2, 3, 4, 5].map(i => `<rect class="sky-${i}" x="40" y="${40 + i * 32}" width="520" height="32"/>`).join('')}
    <g class="stars">${[[88, 56], [160, 48], [248, 68], [328, 52], [420, 60], [500, 48], [532, 80], [120, 96], [380, 88]].map(([x, y]) => `<rect x="${x}" y="${y}" width="4" height="4" fill="#e0e7ff"/>`).join('')}</g>
    <g class="sun">${pixels(SUN, { s: '#fde68a' }, 456, 64)}</g>
    <g class="city">${skyline()}</g>
    <rect x="36" y="32" width="528" height="8" fill="#2c3448"/><rect x="36" y="32" width="528" height="4" fill="#3a4460"/>
    <rect x="36" y="40" width="8" height="192" fill="#2c3448"/><rect x="556" y="40" width="8" height="192" fill="#2c3448"/>
    <rect x="208" y="40" width="8" height="188" fill="#2c3448"/><rect x="384" y="40" width="8" height="188" fill="#2c3448"/>
    <rect x="32" y="228" width="536" height="8" fill="#262d40"/><rect x="32" y="228" width="536" height="4" fill="#323b55"/>

    <!-- Wandbildschirm (Text als HTML darüber) -->
    ${pbox(604, 36, 324, 172, '#2f3750')}
    <rect x="612" y="44" width="308" height="156" fill="#0a0d14"/>
    ${Array.from({ length: 19 }, (_, i) => `<rect x="612" y="${48 + i * 8}" width="308" height="4" fill="#0d1119"/>`).join('')}
    <rect x="760" y="208" width="8" height="12" fill="#2f3750"/>

    ${plant()}
    ${[270, 510, 750].map(lamp).join('')}

    ${AGENTS.map(station).join('')}
  </svg>`;
}

function overlays() {
  return AGENTS.map((a, i) => {
    const align = i === 0 ? 'left' : i === AGENTS.length - 1 ? 'right' : 'center';
    return `
    <div class="ag-anchor" data-agent="${a.key}" style="left:${pct(a.x, W)};top:${pct(DESK_Y + HEAD_DY, H)}">
      <div class="bubble ${align}" role="status"></div>
      <div class="zzz" aria-hidden="true">z<span>z</span><span>z</span></div>
    </div>
    <div class="ag-tag st-${a.key}" style="left:${pct(a.x, W)};top:${pct(DESK_Y + 26, H)}">
      <span class="ag-name" style="color:${a.color}">${a.name}</span><span class="ag-role">${a.role}</span>
    </div>`;
  }).join('');
}

// ---------------------------------------------------------------------------
// Zustand
// ---------------------------------------------------------------------------
function relTime(ts) {
  if (!ts) return 'noch nichts gemeldet';
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'jetzt';
  if (m < 60) return `vor ${m} min`;
  const h = Math.round(m / 60);
  return h < 24 ? `vor ${h} h` : `vor ${Math.round(h / 24)} T`;
}

function setMode(key, mode) {
  const s = state[key];
  if (!s) return;
  for (const n of s.nodes) {
    n.classList.remove('working', 'idle', 'sleeping');
    n.classList.add(mode);
  }
  s.chip.querySelector('.tb-mode').textContent =
    mode === 'working' ? 'arbeitet' : mode === 'sleeping' ? 'schläft' : 'bereit';
}

function refreshIdle() {
  for (const a of AGENTS) {
    const s = state[a.key];
    if (!s) continue;
    s.chip.querySelector('.tb-when').textContent = relTime(s.lastActive);
    if (s.nodes[0].classList.contains('working')) continue;
    setMode(a.key, s.lastActive && Date.now() - s.lastActive < SLEEP_MS ? 'idle' : 'sleeping');
  }
}

function setDaytime() {
  if (!officeEl) return;
  const h = new Date().getHours();
  const t = h >= 8 && h < 17 ? 'day' : (h >= 17 && h < 20) || (h >= 6 && h < 8) ? 'dusk' : 'night';
  officeEl.classList.remove('t-day', 't-dusk', 't-night');
  officeEl.classList.add(`t-${t}`);
}

function say(key, html, plain) {
  const s = state[key];
  if (!s || !html) return;
  s.bubble.innerHTML = html;
  s.bubble.classList.add('show');
  clearTimeout(s.bubbleTimer);
  s.bubbleTimer = setTimeout(() => s.bubble.classList.remove('show'), BUBBLE_MS);
  s.chip.querySelector('.tb-msg').textContent = plain || s.bubble.textContent;
}

function wallScreen(pair, msg, src) {
  const el = officeEl?.querySelector('.wall-msg');
  if (!el) return;
  const a = AGENTS.find(x => x.key === src);
  el.innerHTML = `${a ? `<span class="wm-src" style="color:${a.color}">${esc(a.name)}</span>` : ''}${pair ? `<b>${esc(pair)}</b> ` : ''}${esc(msg)}`;
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
}

function work(key, ts = Date.now()) {
  const s = state[key];
  if (!s) return;
  s.lastActive = Math.max(s.lastActive || 0, ts);
  s.chip.querySelector('.tb-when').textContent = relTime(s.lastActive);
  const left = WORK_MS - (Date.now() - ts);
  if (left <= 0) return;
  setMode(key, 'working');
  clearTimeout(s.workTimer);
  s.workTimer = setTimeout(() => { for (const n of s.nodes) n.classList.remove('working'); refreshIdle(); }, left);
}

function fly(fromKey, toKey, label) {
  const from = state[fromKey]?.anchor, to = state[toKey]?.anchor;
  const box = officeEl?.querySelector('.office-scene');
  if (!from || !to || !box || reduceMotion) return;
  const o = box.getBoundingClientRect(), f = from.getBoundingClientRect(), t = to.getBoundingClientRect();
  const doc = document.createElement('div');
  doc.className = 'flying-doc';
  doc.innerHTML = `<span class="fd-icon"></span>${label ? `<b>${esc(label)}</b>` : ''}`;
  box.appendChild(doc);
  const x0 = f.left - o.left, y0 = f.top - o.top + 30;
  const x1 = t.left - o.left, y1 = t.top - o.top + 30;
  const lift = Math.min(90, Math.abs(x1 - x0) / 3 + 30);
  doc.animate([
    { transform: `translate(${x0}px, ${y0}px) scale(.6)`, opacity: 0 },
    { transform: `translate(${(x0 + x1) / 2}px, ${Math.min(y0, y1) - lift}px) scale(1)`, opacity: 1, offset: 0.5 },
    { transform: `translate(${x1}px, ${y1}px) scale(.6)`, opacity: 0 },
  ], { duration: 1500, easing: 'cubic-bezier(.45,0,.25,1)' }).onfinish = () => doc.remove();
}

// ---------------------------------------------------------------------------
// Öffentliche Schnittstelle (unverändert für desk.js)
// ---------------------------------------------------------------------------
export function initAgents(container) {
  container.innerHTML = `
    <div class="office" id="deskOffice">
      <div class="office-scene">
        ${scene()}
        <div class="wall-screen">
          <div class="ws-head"><span class="ws-live">● LIVE</span><span class="ws-clock">--:--</span></div>
          <div class="wall-msg">Warte auf die erste Meldung …</div>
        </div>
        ${overlays()}
      </div>
      <div class="team-bar">
        ${AGENTS.map(a => `
          <div class="tb-item" data-agent="${a.key}">
            <span class="tb-dot" style="--c:${a.color}"></span>
            <div class="tb-text">
              <div class="tb-line"><span class="tb-name">${a.name}</span><span class="tb-mode">bereit</span><span class="tb-when">–</span></div>
              <div class="tb-msg">—</div>
            </div>
          </div>`).join('')}
      </div>
    </div>`;
  officeEl = container.querySelector('#deskOffice');
  for (const a of AGENTS) {
    const anchor = officeEl.querySelector(`.ag-anchor[data-agent="${a.key}"]`);
    const chip = officeEl.querySelector(`.tb-item[data-agent="${a.key}"]`);
    state[a.key] = {
      anchor, chip, bubble: anchor.querySelector('.bubble'),
      nodes: [officeEl.querySelector(`g.st-${a.key}`), anchor, officeEl.querySelector(`.ag-tag.st-${a.key}`), chip],
    };
  }
  setDaytime();
  refreshIdle();
  const clock = officeEl.querySelector('.ws-clock');
  const tick = () => { clock.textContent = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); };
  tick();
  setInterval(tick, 15000);
  setInterval(refreshIdle, 30000);
  setInterval(setDaytime, 10 * 60000);

  // Blinzeln in unregelmäßigen Abständen
  if (!reduceMotion) setInterval(() => {
    const a = AGENTS[Math.floor(Math.random() * AGENTS.length)];
    const g = state[a.key].nodes[0];
    if (g.classList.contains('sleeping')) return;
    g.classList.add('blink');
    setTimeout(() => g.classList.remove('blink'), 170);
  }, 1400);
}

// Historie beim Laden: letzte Aktivität und letzte Meldung je Agent, ohne Sprechblasen
export function seedAgents(squawks) {
  const list = squawks || [];   // neueste zuerst
  for (const s of [...list].reverse()) {
    if (!state[s.source]) continue;
    work(s.source, new Date(s.created_at).getTime());
    state[s.source].chip.querySelector('.tb-msg').textContent = `${s.pair ? s.pair + ' · ' : ''}${s.message || ''}`;
  }
  const last = list.find(s => state[s.source]);
  if (last) wallScreen(last.pair, last.message, last.source);
  refreshIdle();
}

export function agentSquawk(s) {
  if (!state[s.source]) return;
  work(s.source);
  const msg = String(s.message || '');
  const short = msg.length > 90 ? msg.slice(0, 88) + '…' : msg;
  say(s.source, `${s.pair ? `<b>${esc(s.pair)}</b> ` : ''}${esc(short)}`, `${s.pair ? s.pair + ' · ' : ''}${msg}`);
  wallScreen(s.pair, short, s.source);
}

// Letzter bekannter Status je Vorschlag, damit nur echte Statuswechsel animiert werden
// (Realtime liefert bei UPDATE ohne REPLICA IDENTITY FULL keinen alten Status mit).
const lastStatus = new Map();
export function seedProposals(rows) {
  for (const r of rows || []) if (r?.id) lastStatus.set(r.id, r.status);
}

export function agentProposal(evt) {
  const p = evt.new || {};
  if (!p.id && evt.eventType !== 'INSERT') return;
  const prev = p.id ? lastStatus.get(p.id) : undefined;
  if (p.id) lastStatus.set(p.id, p.status);
  if (p.status === prev) return;

  if (p.status === 'pending') {
    fly('risk', 'boss', p.pair);
    setTimeout(() => { work('boss'); say('boss', `Neuer Vorschlag: <b>${esc(p.pair)}</b> ${p.direction === 'short' ? '▼' : '▲'} — ab aufs Handy.`); }, 1400);
  } else if (p.status === 'watching') {
    fly('technik', 'risk', p.pair);
  } else {
    const txt = { taken: 'genommen ✅', dismissed: 'verworfen', blocked: 'blockiert ⛔', expired: 'abgelaufen' }[p.status];
    if (txt && prev) { work('boss'); say('boss', `<b>${esc(p.pair)}</b> ${txt}`); }
  }
}

// Vorschau ohne Live-Daten: desk.html?demo=1
export function runDemo() {
  const script = [
    ['fundamental', null, 'Fundamental-Stand: 31 Pairs gespeichert; aligned short: GBPUSD, EURAUD'],
    ['technik', 'NZDJPY', 'BITR 4H Limit short: 4H Abwärtstrend, Liquidität über BITR geholt — Ampel gelb'],
    ['risk', 'NZDJPY', 'Alle Risk-Checks bestanden: 1/3 belegt, keine High-Impact-News in 2 h'],
    [null, 'NZDJPY', null],
    ['technik', 'NDX100', 'ORB long: Opening Range 30461–30583, 15M-Schluss über dem Range-Hoch'],
    ['risk', 'NDX100', 'Veto: High-Impact-News USD FOMC Minutes um 20:00'],
  ];
  let i = 0;
  const step = () => {
    const [src, pair, msg] = script[i % script.length];
    if (src) agentSquawk({ source: src, pair, message: msg });
    else agentProposal({ eventType: 'INSERT', new: { id: 'demo-' + i, status: 'pending', pair, direction: 'short' } });
    i++;
  };
  step();
  setInterval(step, 4500);
}
