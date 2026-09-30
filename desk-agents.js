// Desk-Büro: animierte Pixel-Agenten, gesteuert von desk_squawk und trade_proposals.
// Jeder Agent arbeitet sichtbar, sobald er eine Meldung schreibt, und geht danach wieder in Ruhe.

const AGENTS = [
  { key: 'fundamental', name: 'Fundamental', role: 'Bias & News', shirt: '#6366f1', hair: '#3b2f2a', acc: 'glasses' },
  { key: 'technik', name: 'Technik', role: 'BITR-Setups', shirt: '#f59e0b', hair: '#1f2937', acc: 'headphones' },
  { key: 'risk', name: 'Risk', role: 'Größe & Limits', shirt: '#f43f5e', hair: '#7c4a2d', acc: 'cap' },
  { key: 'boss', name: 'Boss', role: 'Entscheidung', shirt: '#22c55e', hair: '#9ca3af', acc: 'tie' },
];

const WORK_MS = 25000;      // so lange tippt ein Agent nach einer Meldung
const BUBBLE_MS = 7000;     // so lange bleibt die Sprechblase stehen
const SLEEP_MS = 30 * 60000; // ab hier schläft ein Agent (Zzz)

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const state = {}; // key -> { el, lastActive, workTimer, bubbleTimer }

function avatarSvg(a) {
  const skin = '#f1c27d';
  const acc = {
    glasses: `<g class="acc"><rect x="20" y="9" width="4" height="4" fill="none" stroke="#111827" stroke-width="1"/><rect x="25" y="9" width="4" height="4" fill="none" stroke="#111827" stroke-width="1"/><rect x="24" y="10" width="1" height="1" fill="#111827"/></g>`,
    headphones: `<g class="acc"><rect x="17" y="2" width="14" height="2" fill="#111827"/><rect x="16" y="8" width="3" height="6" fill="#111827"/><rect x="29" y="8" width="3" height="6" fill="#111827"/><rect x="16" y="3" width="2" height="5" fill="#111827"/><rect x="30" y="3" width="2" height="5" fill="#111827"/></g>`,
    cap: `<g class="acc"><rect x="17" y="2" width="14" height="4" fill="#be123c"/><rect x="28" y="5" width="6" height="2" fill="#9f1239"/></g>`,
    tie: `<g class="acc"><rect x="23" y="18" width="2" height="2" fill="#111827"/><rect x="22" y="20" width="4" height="6" fill="#111827"/><rect x="21" y="18" width="2" height="2" fill="#f8fafc"/><rect x="25" y="18" width="2" height="2" fill="#f8fafc"/></g>`,
  }[a.acc];
  return `
  <svg class="agent-svg" viewBox="0 0 48 40" shape-rendering="crispEdges" aria-hidden="true">
    <rect class="chair" x="13" y="${a.key === 'boss' ? 12 : 15}" width="22" height="${a.key === 'boss' ? 17 : 14}" fill="#2a2f3d"/>
    <g class="body-g">
      <rect x="16" y="17" width="16" height="11" fill="${a.shirt}"/>
      <rect x="18" y="5" width="12" height="12" fill="${skin}"/>
      <rect x="18" y="3" width="12" height="4" fill="${a.hair}"/>
      <rect x="17" y="4" width="2" height="6" fill="${a.hair}"/>
      <rect class="eye" x="21" y="10" width="2" height="2" fill="#111827"/>
      <rect class="eye" x="26" y="10" width="2" height="2" fill="#111827"/>
      <rect class="mouth" x="22" y="14" width="4" height="1" fill="#9a5b3c"/>
      ${acc}
    </g>
    <rect class="arm arm-l" x="14" y="19" width="3" height="8" fill="${a.shirt}"/>
    <rect class="arm arm-r" x="31" y="19" width="3" height="8" fill="${a.shirt}"/>
    <rect class="hand hand-l" x="17" y="25" width="3" height="2" fill="${skin}"/>
    <rect class="hand hand-r" x="28" y="25" width="3" height="2" fill="${skin}"/>
    <rect class="lid" x="18" y="20" width="12" height="7" fill="#4b5263"/>
    <rect class="lid-glow" x="23" y="22" width="2" height="2" fill="${a.shirt}"/>
    <rect x="3" y="27" width="42" height="3" fill="#3a3f4f"/>
    <rect x="5" y="30" width="2" height="9" fill="#2a2f3d"/>
    <rect x="41" y="30" width="2" height="9" fill="#2a2f3d"/>
    <rect class="mug" x="37" y="23" width="4" height="4" fill="#e5e7eb"/>
    <rect x="41" y="24" width="1" height="2" fill="#e5e7eb"/>
  </svg>`;
}

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
  s.el.classList.remove('working', 'idle', 'sleeping');
  s.el.classList.add(mode);
  s.el.querySelector('.agent-mode').textContent =
    mode === 'working' ? 'arbeitet …' : mode === 'sleeping' ? 'schläft' : 'wartet';
}

function refreshIdle() {
  for (const a of AGENTS) {
    const s = state[a.key];
    if (!s || s.el.classList.contains('working')) continue;
    setMode(a.key, s.lastActive && Date.now() - s.lastActive < SLEEP_MS ? 'idle' : 'sleeping');
    s.el.querySelector('.agent-when').textContent = relTime(s.lastActive);
  }
}

function say(key, text) {
  const s = state[key];
  if (!s || !text) return;
  const b = s.el.querySelector('.bubble');
  b.innerHTML = text;
  b.classList.add('show');
  clearTimeout(s.bubbleTimer);
  s.bubbleTimer = setTimeout(() => b.classList.remove('show'), BUBBLE_MS);
}

function work(key, ts = Date.now()) {
  const s = state[key];
  if (!s) return;
  s.lastActive = Math.max(s.lastActive || 0, ts);
  s.el.querySelector('.agent-when').textContent = relTime(s.lastActive);
  const left = WORK_MS - (Date.now() - ts);
  if (left <= 0) return;
  setMode(key, 'working');
  clearTimeout(s.workTimer);
  s.workTimer = setTimeout(() => { s.el.classList.remove('working'); refreshIdle(); }, left);
}

function fly(fromKey, toKey, label) {
  const from = state[fromKey]?.el, to = state[toKey]?.el, office = document.getElementById('deskOffice');
  if (!from || !to || !office || reduceMotion) return;
  const o = office.getBoundingClientRect();
  const f = from.querySelector('.agent-svg').getBoundingClientRect();
  const t = to.querySelector('.agent-svg').getBoundingClientRect();
  const doc = document.createElement('div');
  doc.className = 'flying-doc';
  doc.innerHTML = `<span>📄</span>${label ? `<b>${esc(label)}</b>` : ''}`;
  office.appendChild(doc);
  const x0 = f.left + f.width / 2 - o.left, y0 = f.top + f.height * 0.5 - o.top;
  const x1 = t.left + t.width / 2 - o.left, y1 = t.top + t.height * 0.5 - o.top;
  const lift = Math.min(60, Math.abs(x1 - x0) / 3 + 20);
  doc.animate([
    { transform: `translate(${x0}px, ${y0}px) scale(0.6)`, opacity: 0 },
    { transform: `translate(${(x0 + x1) / 2}px, ${Math.min(y0, y1) - lift}px) scale(1)`, opacity: 1, offset: 0.5 },
    { transform: `translate(${x1}px, ${y1}px) scale(0.6)`, opacity: 0 },
  ], { duration: 1400, easing: 'ease-in-out' }).onfinish = () => doc.remove();
}

export function initAgents(container) {
  container.innerHTML = `
    <div class="office" id="deskOffice">
      ${AGENTS.map(a => `
        <div class="agent idle" data-agent="${a.key}">
          <div class="bubble" role="status"></div>
          ${avatarSvg(a)}
          <div class="zzz" aria-hidden="true">z<span>z</span><span>z</span></div>
          <div class="agent-meta">
            <span class="agent-name src ${a.key}">${a.name}</span>
            <span class="agent-role">${a.role}</span>
            <span class="agent-status"><span class="agent-mode">wartet</span> · <span class="agent-when">–</span></span>
          </div>
        </div>`).join('')}
    </div>`;
  for (const a of AGENTS) state[a.key] = { el: container.querySelector(`[data-agent="${a.key}"]`) };
  refreshIdle();
  setInterval(refreshIdle, 30000);

  // Blinzeln in unregelmäßigen Abständen
  if (!reduceMotion) setInterval(() => {
    const a = AGENTS[Math.floor(Math.random() * AGENTS.length)];
    const el = state[a.key].el;
    if (el.classList.contains('sleeping')) return;
    el.classList.add('blink');
    setTimeout(() => el.classList.remove('blink'), 160);
  }, 1300);
}

// Historie beim Laden: letzte Aktivität je Agent setzen, ohne Sprechblasen
export function seedAgents(squawks) {
  for (const s of [...(squawks || [])].reverse()) {
    if (state[s.source]) work(s.source, new Date(s.created_at).getTime());
  }
  refreshIdle();
}

export function agentSquawk(s) {
  if (!state[s.source]) return;
  work(s.source);
  const msg = String(s.message || '');
  say(s.source, `${s.pair ? `<b>${esc(s.pair)}</b> ` : ''}${esc(msg.length > 90 ? msg.slice(0, 88) + '…' : msg)}`);
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
    setTimeout(() => { work('boss'); say('boss', `Neuer Vorschlag: <b>${esc(p.pair)}</b> ${p.direction === 'short' ? '▼' : '▲'} — ab aufs Handy.`); }, 1300);
  } else if (p.status === 'watching') {
    fly('fundamental', 'technik', p.pair);
  } else {
    const txt = { taken: 'genommen ✅', dismissed: 'verworfen', blocked: 'blockiert ⛔', expired: 'abgelaufen' }[p.status];
    if (txt && prev) { work('boss'); say('boss', `<b>${esc(p.pair)}</b> ${txt}`); }
  }
}

// Vorschau ohne Live-Daten: desk.html?demo=1
export function runDemo() {
  const script = [
    ['fundamental', 'EURAUD', 'Bias strong short (−1,57) · COT, Trend und Saison dagegen'],
    ['technik', 'EURAUD', '4H-Struktur bestätigt, warte auf 15M-Retest'],
    ['risk', 'EURAUD', '0,8 % Risiko → 1,34 Lots, SL 42 Pips, keine Korrelation offen'],
    [null, 'EURAUD', null],
    ['fundamental', 'AUDCHF', 'Long-Bias 3/3, Risk-on stützt AUD'],
    ['technik', 'AUDCHF', 'Noch kein BITR-Setup, bleibt auf der Watchlist'],
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
