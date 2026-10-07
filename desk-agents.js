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
function skyline() {
  // Feste Pseudo-Zufallsfolge, damit die Stadt bei jedem Laden gleich aussieht
  let seed = 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  let out = '', x = 40;
  while (x < 560) {
    const w = 34 + Math.floor(rnd() * 46), h = 50 + Math.floor(rnd() * 120);
    const top = 230 - h;
    out += `<rect x="${x}" y="${top}" width="${w}" height="${h}" class="bld" />`;
    for (let wy = top + 10; wy < 222; wy += 14) {
      for (let wx = x + 6; wx < x + w - 8; wx += 11) {
        if (rnd() < 0.38) out += `<rect x="${wx}" y="${wy}" width="5" height="7" class="lit" />`;
      }
    }
    x += w + 4;
  }
  return out;
}

function hair(a) {
  switch (a.style) {
    case 'curly': return `<g fill="${a.hair}">${[-16, -8, 0, 8, 16].map(dx => `<circle cx="${dx}" cy="-113" r="9"/>`).join('')}<circle cx="-20" cy="-102" r="7"/><circle cx="20" cy="-102" r="7"/></g>`;
    case 'long': return `<path d="M-24 -92 Q-26 -122 0 -120 Q26 -122 24 -92 L26 -60 Q14 -64 14 -84 Q0 -104 -14 -84 Q-14 -64 -26 -60 Z" fill="${a.hair}"/>`;
    case 'side': return `<path d="M-23 -96 Q-22 -121 2 -119 Q24 -118 23 -96 Q12 -110 -6 -106 Q-16 -104 -23 -96 Z" fill="${a.hair}"/>`;
    default: return `<path d="M-23 -94 Q-24 -120 0 -119 Q24 -120 23 -94 Q20 -108 0 -108 Q-20 -108 -23 -94 Z" fill="${a.hair}"/>`;
  }
}

function accessory(a) {
  switch (a.acc) {
    case 'glasses': return `<g fill="none" stroke="#e5e7eb" stroke-width="1.6"><rect x="-15" y="-98" width="12" height="9" rx="3"/><rect x="3" y="-98" width="12" height="9" rx="3"/><path d="M-3 -94 H3"/></g>`;
    case 'headset': return `<g fill="none" stroke="#1f2937" stroke-width="4" stroke-linecap="round"><path d="M-24 -96 Q-24 -124 0 -124 Q24 -124 24 -96"/></g><rect x="-29" y="-101" width="9" height="14" rx="4" fill="#1f2937"/><rect x="20" y="-101" width="9" height="14" rx="4" fill="#1f2937"/><path d="M-25 -88 Q-22 -76 -8 -78" stroke="#1f2937" stroke-width="2.5" fill="none" stroke-linecap="round"/><circle cx="-8" cy="-78" r="2.5" fill="${a.color}"/>`;
    default: return '';
  }
}

function torso(a) {
  const base = `<path d="M-40 0 V-34 Q-40 -64 -14 -66 H14 Q40 -64 40 -34 V0 Z" fill="${a.shirt}"/>`;
  if (a.acc !== 'tie') return base + `<path d="M-9 -66 L0 -56 L9 -66" fill="none" stroke="rgba(255,255,255,.25)" stroke-width="2"/>`;
  return base + `<path d="M-12 -66 L0 -46 L12 -66 Z" fill="#f8fafc"/><path d="M-2 -60 H2 L4 -30 L0 -24 L-4 -30 Z" fill="${a.color}"/>`
    + `<path d="M-14 -66 L-4 -40 L-20 -50 Z M14 -66 L4 -40 L20 -50 Z" fill="#1e293b"/>`;
}

function screenUi(a) {
  // Inhalt des Monitors (lokale Koordinaten: Bildschirm x 40..100, y -70..-26)
  switch (a.screen) {
    case 'chart': {
      const c = [[46, -46, -38, 1], [53, -50, -42, 1], [60, -48, -40, 0], [67, -56, -46, 1], [74, -52, -45, 0], [81, -60, -50, 1], [88, -64, -55, 1]];
      return c.map(([x, y1, y2, up], i) => `<g class="${i === c.length - 1 ? 'live-candle' : ''}"><path d="M${x + 2} ${y1 - 4} V${y2 + 4}" stroke="${up ? '#4ade80' : '#fb7185'}" stroke-width="1"/><rect x="${x}" y="${y1}" width="4" height="${y2 - y1}" fill="${up ? '#4ade80' : '#fb7185'}"/></g>`).join('')
        + `<path d="M44 -34 L96 -34" stroke="#fbbf24" stroke-width="1" stroke-dasharray="3 2"/>`;
    }
    case 'gauge':
      return `<circle cx="62" cy="-48" r="13" fill="none" stroke="#2c3346" stroke-width="5"/>`
        + `<circle class="gauge-arc" cx="62" cy="-48" r="13" fill="none" stroke="${a.color}" stroke-width="5" stroke-dasharray="52 82" transform="rotate(-90 62 -48)"/>`
        + `<rect x="82" y="-60" width="12" height="3" rx="1.5" fill="#94a3b8"/><rect x="82" y="-52" width="9" height="3" rx="1.5" fill="#94a3b8"/><rect x="82" y="-44" width="12" height="3" rx="1.5" fill="#4ade80"/><rect x="82" y="-36" width="7" height="3" rx="1.5" fill="#94a3b8"/>`;
    case 'chat':
      return `<rect x="45" y="-66" width="34" height="9" rx="4" fill="#334155"/><rect x="60" y="-53" width="35" height="9" rx="4" fill="${a.color}" opacity=".85"/>`
        + `<rect class="chat-new" x="45" y="-40" width="28" height="9" rx="4" fill="#334155"/>`;
    default:
      return `<rect x="45" y="-66" width="22" height="14" rx="2" fill="${a.color}" opacity=".7"/><rect x="71" y="-66" width="24" height="3" rx="1.5" fill="#cbd5e1"/><rect x="71" y="-60" width="20" height="3" rx="1.5" fill="#64748b"/><rect x="71" y="-54" width="22" height="3" rx="1.5" fill="#64748b"/>`
        + `<g class="news-lines"><rect x="45" y="-46" width="50" height="3" rx="1.5" fill="#64748b"/><rect x="45" y="-40" width="42" height="3" rx="1.5" fill="#64748b"/><rect x="45" y="-34" width="47" height="3" rx="1.5" fill="#64748b"/></g>`;
  }
}

function station(a) {
  const skinDark = 'rgba(0,0,0,.18)';
  const phone = a.key === 'boss'
    ? `<g class="phone"><rect x="-64" y="-12" width="14" height="22" rx="3" transform="rotate(-70 -57 -1)" fill="#0f172a" stroke="#475569" stroke-width="1"/><circle class="phone-glow" cx="-57" cy="-2" r="4" fill="${a.color}"/></g>`
    : '';
  return `
  <g class="st st-${a.key}" transform="translate(${a.x} ${DESK_Y})">
    <ellipse cx="0" cy="74" rx="122" ry="9" fill="#000" opacity=".35"/>
    <rect x="-48" y="-122" width="96" height="122" rx="20" fill="#20273a"/>
    <rect x="-36" y="-116" width="72" height="5" rx="2.5" fill="${a.color}" opacity=".45"/>
    <g class="person">
      ${torso(a)}
      <rect x="-7" y="-78" width="14" height="14" rx="4" fill="${a.skin}"/><rect x="-7" y="-70" width="14" height="6" fill="${skinDark}"/>
      <g class="head">
        ${a.style === 'long' ? hair(a) : ''}
        <circle cx="0" cy="${HEAD_DY}" r="22" fill="${a.skin}"/>
        <circle cx="-13" cy="-86" r="3.5" fill="#f43f5e" opacity=".18"/><circle cx="13" cy="-86" r="3.5" fill="#f43f5e" opacity=".18"/>
        ${a.style === 'long' ? `<path d="M-22 -96 Q-18 -116 0 -116 Q18 -116 22 -96 Q10 -108 -4 -104 Q-16 -102 -22 -96 Z" fill="${a.hair}"/>` : hair(a)}
        <g class="eyes"><ellipse class="eye" cx="-8" cy="-93" rx="2.6" ry="3.2" fill="#111827"/><ellipse class="eye" cx="8" cy="-93" rx="2.6" ry="3.2" fill="#111827"/></g>
        <path class="mouth" d="M-6 -82 Q0 -77 6 -82" stroke="#7a3e2b" stroke-width="2" fill="none" stroke-linecap="round"/>
        ${accessory(a)}
      </g>
    </g>
    <rect x="-110" y="-4" width="220" height="12" rx="4" fill="#323a50"/>
    <rect x="-110" y="-4" width="220" height="3" rx="1.5" fill="#4a5470"/>
    <rect x="-102" y="8" width="204" height="62" rx="7" fill="#1a1f2d"/>
    <rect x="-102" y="8" width="204" height="3" fill="${a.color}" opacity=".6"/>
    <rect x="-28" y="-10" width="56" height="7" rx="2" fill="#0f131c"/>
    <path class="arm arm-l" d="M-33 -44 Q-44 -16 -18 -10" stroke="${a.shirt}" stroke-width="12" fill="none" stroke-linecap="round"/>
    <path class="arm arm-r" d="M33 -44 Q44 -16 18 -10" stroke="${a.shirt}" stroke-width="12" fill="none" stroke-linecap="round"/>
    <ellipse class="hand hand-l" cx="-16" cy="-10" rx="6" ry="4.5" fill="${a.skin}"/>
    <ellipse class="hand hand-r" cx="16" cy="-10" rx="6" ry="4.5" fill="${a.skin}"/>
    <rect x="66" y="-24" width="6" height="20" fill="#2c3346"/><rect x="56" y="-6" width="26" height="4" rx="2" fill="#2c3346"/>
    <rect x="36" y="-76" width="68" height="54" rx="6" fill="#0b0e15" stroke="#2f3750" stroke-width="2"/>
    <g class="screen-ui">${screenUi(a)}</g>
    <rect class="screen-glow" x="38" y="-74" width="64" height="50" rx="5" fill="${a.color}"/>
    <g class="mug"><rect x="-92" y="-20" width="15" height="16" rx="3" fill="#e8ebf2"/><path d="M-77 -16 Q-70 -13 -77 -9" stroke="#e8ebf2" stroke-width="2.5" fill="none"/>
      <g class="steam" stroke="#94a3b8" stroke-width="1.6" fill="none" stroke-linecap="round"><path d="M-88 -24 Q-91 -30 -88 -36"/><path d="M-82 -24 Q-79 -31 -82 -38"/></g></g>
    ${phone}
  </g>`;
}

function scene() {
  return `
  <svg class="office-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    <defs>
      <linearGradient id="ofWall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#171c2a"/><stop offset="1" stop-color="#0f131d"/></linearGradient>
      <linearGradient id="ofFloor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a1f2c"/><stop offset="1" stop-color="#10131b"/></linearGradient>
      <linearGradient id="ofSky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="sky-top"/><stop offset="1" class="sky-bottom"/></linearGradient>
      <radialGradient id="ofLamp" cx=".5" cy="0" r=".9"><stop offset="0" stop-color="#fde68a" stop-opacity=".22"/><stop offset="1" stop-color="#fde68a" stop-opacity="0"/></radialGradient>
      <clipPath id="ofWin"><rect x="40" y="36" width="520" height="194" rx="10"/></clipPath>
    </defs>

    <rect width="${W}" height="300" fill="url(#ofWall)"/>
    <rect y="300" width="${W}" height="${H - 300}" fill="url(#ofFloor)"/>
    <g opacity=".06" stroke="#c7d2fe">${Array.from({ length: 13 }, (_, i) => `<path d="M${i * 90 - 40} 300 L${i * 110 - 160} ${H}"/>`).join('')}<path d="M0 340 H${W}"/><path d="M0 395 H${W}"/></g>
    <rect y="296" width="${W}" height="5" fill="#252c3e"/>

    <!-- Fenster mit Skyline (Tageszeit per CSS) -->
    <g clip-path="url(#ofWin)">
      <rect x="40" y="36" width="520" height="194" fill="url(#ofSky)"/>
      <g class="stars">${[[90, 60], [160, 48], [250, 70], [330, 52], [420, 64], [500, 46], [530, 80]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.2" fill="#e0e7ff"/>`).join('')}</g>
      <circle class="sun" cx="470" cy="78" r="18"/>
      <g class="city">${skyline()}</g>
    </g>
    <rect x="40" y="36" width="520" height="194" rx="10" fill="none" stroke="#2c3448" stroke-width="6"/>
    <path d="M213 36 V230 M387 36 V230" stroke="#2c3448" stroke-width="5"/>
    <rect x="34" y="228" width="532" height="8" rx="3" fill="#262d40"/>

    <!-- Wandbildschirm (Text als HTML darüber) -->
    <rect x="606" y="40" width="318" height="166" rx="12" fill="#0a0d14" stroke="#2f3750" stroke-width="3"/>
    <rect x="762" y="206" width="6" height="12" fill="#2f3750"/>

    <!-- Pflanze -->
    <g transform="translate(583 298)">
      <path d="M-14 0 L-11 -26 H11 L14 0 Z" fill="#334155"/>
      <g fill="#22c55e"><ellipse cx="-12" cy="-44" rx="7" ry="18" transform="rotate(-25 -12 -44)"/><ellipse cx="10" cy="-48" rx="7" ry="20" transform="rotate(22 10 -48)"/><ellipse cx="0" cy="-56" rx="6" ry="22"/></g>
      <g fill="#16a34a"><ellipse cx="-4" cy="-38" rx="5" ry="14" transform="rotate(-10 -4 -38)"/><ellipse cx="6" cy="-36" rx="5" ry="13" transform="rotate(14 6 -36)"/></g>
    </g>

    <!-- Hängelampen -->
    ${[270, 510, 750].map(x => `<g class="lamp"><path d="M${x} 0 V26" stroke="#2f3750" stroke-width="2"/><path d="M${x - 22} 40 Q${x} 18 ${x + 22} 40 Z" fill="#2f3750"/><ellipse cx="${x}" cy="40" rx="10" ry="3" fill="#fde68a"/><path class="lamp-cone" d="M${x - 20} 40 L${x - 110} 300 H${x + 110} L${x + 20} 40 Z" fill="url(#ofLamp)"/></g>`).join('')}

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
