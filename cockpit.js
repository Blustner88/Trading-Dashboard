import { supabase, drawdownOf } from './accounts.js';
import { toast } from './nav.js';
import { loadIdeas, renderIdeas, openIdeaEditor } from './ideas.js';

// Cockpit: Tagesstatus, Pairs mit Score (−100…+100), Währungsstärke, Termine, News.
// Schreibt nur Watchlist-Status und Notiz je Pair in den Tagesplan von heute
// (daily_plans / daily_plan_pairs — dieselben Tabellen wie die Seite "Tagesplan").

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hhmm = (ts) => new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const signed = (v, d = 0) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Number(v)).toFixed(d)}`;
const localDate = (d = new Date()) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };
const dirOf = (bias) => bias?.endsWith('long') ? 'long' : bias?.endsWith('short') ? 'short' : 'neutral';
const cls = (v) => v > 0 ? 'pos' : v < 0 ? 'neg' : '';
const sbar = (v, max = 100) => {
  const w = Math.min(Math.abs(v) / max, 1) * 50;
  return `<span class="sbar"><i class="${v > 0 ? 'pos' : v < 0 ? 'neg' : 'flat'}" style="--w:${w.toFixed(1)}%"></i></span>`;
};

const WATCH_N = 8;               // so viele Pairs mit dem stärksten Bias stehen automatisch auf der Watchlist
const STATUS = [['watching', 'Beobachten'], ['forming', 'Formt sich'], ['ready', 'Bereit'], ['no_interest', 'Kein Interesse']];
const STATUS_BADGE = { ready: ['Bereit', 'pos'], forming: ['Formt sich', 'warn'], no_interest: ['Kein Interesse', ''] };
const BIAS_LABEL = { strong_long: 'Stark long', long: 'Long', neutral: 'Neutral', short: 'Short', strong_short: 'Stark short' };
const SHORT = { rates: 'Zinsen', cot: 'COT', trend: 'Trend', seasonality: 'Saison', news: 'News', macro_labor: 'Arbeitsmarkt', macro_infl: 'Inflation', risk: 'Risiko', yield2y: '2J-Rendite', yield2y_mom: 'Renditetrend', macro: 'Makro' };
const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'NZD', 'NOK', 'SEK'];
const FILTER_KEY = 'td_ck_filter';

let pairBias = [];               // fb_latest_pair_bias (+ prev, reason)
let factorZ = {};                // currency -> factor -> z
let weights = [];                // fb_factor_weights (aktiv)
let events = [];
let plan = null;                 // heutiger daily_plan (oder null)
let planPairs = {};              // pair -> daily_plan_pairs-Zeile
let filter = 'all';
let accWorst = null, accLabel = '', riskState = null, propCount = 0;
try { filter = localStorage.getItem(FILTER_KEY) || 'all'; } catch { /* egal */ }

// ---------------------------------------------------------------------------
// Begrüßung, Datum, Session
// ---------------------------------------------------------------------------
function session(now = new Date()) {
  const p = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now);
  const wd = p.find(x => x.type === 'weekday').value, h = Number(p.find(x => x.type === 'hour').value) + Number(p.find(x => x.type === 'minute').value) / 60;
  if (wd === 'Sa' || (wd === 'So' && h < 23) || (wd === 'Fr' && h >= 23)) return ['Markt geschlossen', true];
  if (h >= 14 && h < 18) return ['London + New York', false];
  if (h >= 9 && h < 14) return ['London offen', false];
  if (h >= 18 && h < 23) return ['New York offen', false];
  return ['Asien-Session', false];
}
function renderHello() {
  const h = new Date().getHours();
  $('ckGreet').textContent = h < 11 ? 'Guten Morgen' : h < 18 ? 'Guten Tag' : 'Guten Abend';
  const [s, closed] = session();
  $('ckDate').innerHTML = `${esc(new Date().toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' }))} · <span class="sess${closed ? ' closed' : ''}">${esc(s)}</span>`;
}

// ---------------------------------------------------------------------------
// Tagesstatus: Handelbar / Vorsicht / Finger weg
// ---------------------------------------------------------------------------
async function loadRisk() {
  const { data } = await supabase.from('fb_risk_indicators').select('date, value')
    .eq('indicator', 'vix').order('date', { ascending: false }).limit(260);
  if (!data?.length) { $('stRisk').textContent = '–'; return; }
  const cur = Number(data[0].value);
  const vals = data.map(d => Number(d.value));
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (vals.length - 1));
  const z = (cur - mean) / sd;
  riskState = z <= -0.5 ? 'on' : z >= 0.5 ? 'off' : 'neutral';
  const [label, c] = { on: ['Risk-on', 'pos'], off: ['Risk-off', 'neg'], neutral: ['Neutral', ''] }[riskState];
  $('stRisk').textContent = label;
  $('stRisk').className = `v ${c}`;
  $('stRiskSub').textContent = `VIX ${cur.toFixed(1)} · Ø ${mean.toFixed(1)}`;
}

async function loadEvents() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 2);
  // nur der Kalender-Sammler (Forex Factory)
  const { data } = await supabase.from('desk_events').select('time, currency, name').like('run_id', 'ffcal-%')
    .gte('time', start.toISOString()).lt('time', end.toISOString()).order('time');
  const seen = new Set();
  events = (data || []).filter(e => { const k = `${e.time}|${e.currency}|${e.name}`; return !seen.has(k) && seen.add(k); });
  renderEvents();
}

function renderEvents() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const todayEnd = new Date(start); todayEnd.setDate(todayEnd.getDate() + 1);
  const now = Date.now();
  $('events').innerHTML = events.length ? events.map(e => {
    const t = new Date(e.time).getTime();
    const day = t < todayEnd ? 'heute' : 'morgen';
    const state = t < now ? ' past' : t - now < 2 * 3600e3 ? ' soon' : '';
    return `<div class="ck-ev${state}"><span class="t">${day} ${hhmm(e.time)}</span><span class="c">${esc(e.currency)}</span><span>${esc(e.name)}</span></div>`;
  }).join('') : '<p class="empty">Keine High-Impact-Termine heute und morgen.</p>';
}

function countdown(ms) {
  const m = Math.round(ms / 60000);
  if (m < 60) return `in ${Math.max(m, 0)} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `in ${h} h ${String(m % 60).padStart(2, '0')}` : `in ${Math.round(h / 24)} T`;
}

async function loadProposals() {
  const { data } = await supabase.from('trade_proposals').select('pair, direction').eq('status', 'pending');
  const rows = data || [];
  propCount = rows.length;
  $('stPropV').textContent = rows.length ? `${rows.length} offen` : 'keine';
  if (rows.length) $('stPropSub').textContent = rows.map(r => `${r.pair} ${r.direction === 'short' ? '▼' : '▲'}`).join(' · ');
  $('stProp').classList.toggle('hot', rows.length > 0);
}

// Gleiche Rechnung wie der Drawdown-Tracker in der Übersicht (dashboard.js)
async function loadAccounts() {
  const { data: accounts } = await supabase.from('accounts').select('*').eq('status', 'active');
  const acc = (accounts || []).filter(a => a.daily_loss_limit_pct || a.max_drawdown_pct);
  if (!acc.length) { $('stAcc').textContent = '–'; $('stAccSub').textContent = 'keine Limits hinterlegt'; $('accDetails').hidden = true; return; }
  const { data: trades } = await supabase.from('trades').select('account_id, entry_date, exit_date, profit_amount')
    .eq('status', 'closed').in('account_id', acc.map(a => a.id)).order('entry_date');
  const today = localDate();
  let worst = 0, minBuffer = Infinity;
  $('accountsBars').innerHTML = acc.map(a => {
    const ts = (trades || []).filter(t => t.account_id === a.id);
    const start = Number(a.starting_balance);
    const { ddPct } = drawdownOf(a, ts);
    // Tagesverlust: Tag des Schließens zählt
    const dayPL = ts.filter(t => localDate(t.exit_date || t.entry_date) === today).reduce((s, t) => s + (Number(t.profit_amount) || 0), 0);
    const dayPct = dayPL < 0 ? -dayPL / start * 100 : 0;
    if (a.max_drawdown_pct) minBuffer = Math.min(minBuffer, a.max_drawdown_pct - ddPct);
    const bar = (label, v, lim) => {
      if (!lim) return '';
      const used = Math.min(v / lim, 1);
      worst = Math.max(worst, used);
      return `<div class="ck-bar"><span>${label} ${v.toFixed(1)} / ${lim} %</span><i style="--w:${(used * 100).toFixed(0)}%" class="${used >= .9 ? 'danger' : used >= .6 ? 'warn' : ''}"></i></div>`;
    };
    return `<div class="ck-acc"><b>${esc(a.name.replace(/^\d+\s*-\s*/, ''))}</b>${bar('Tag', dayPct, a.daily_loss_limit_pct)}${bar('DD', ddPct, a.max_drawdown_pct)}</div>`;
  }).join('');
  accWorst = worst;
  accLabel = worst >= .9 ? 'Limit fast erreicht' : worst >= .6 ? 'Limit zu ' + Math.round(worst * 100) + ' % genutzt' : '';
  $('stAcc').textContent = Number.isFinite(minBuffer) ? `${minBuffer.toFixed(1)} %` : '–';
  $('stAcc').className = `v ${worst >= .9 ? 'neg' : worst >= .6 ? 'warn' : 'pos'}`;
  $('stAccSub').textContent = `Rest bis Max-Verlust · ${acc.length} Konto${acc.length > 1 ? 'en' : ''}`;
}

function renderStatus() {
  const now = Date.now();
  const next = events.find(e => new Date(e.time).getTime() > now);
  const recent = events.filter(e => { const t = new Date(e.time).getTime(); return t <= now && now - t < 15 * 60e3; });
  const toNext = next ? new Date(next.time).getTime() - now : Infinity;

  $('stEvent').textContent = next ? countdown(toNext) : 'keiner';
  $('stEvent').className = `v ${toNext < 30 * 60e3 ? 'neg' : toNext < 2 * 3600e3 ? 'warn' : ''}`;
  $('stEventSub').textContent = next ? `${hhmm(next.time)} ${next.currency} ${next.name}` : 'heute und morgen frei';

  const reasons = [];
  let level = 'go';
  const raise = (l) => { if (l === 'stop' || (l === 'caution' && level === 'go')) level = l; };
  if (accWorst !== null && accWorst >= .9) { raise('stop'); reasons.push(['Konto-Limit fast erreicht', true]); }
  else if (accWorst !== null && accWorst >= .6) { raise('caution'); reasons.push([accLabel, true]); }
  if (recent.length) { raise('stop'); reasons.push([`${recent[0].currency} ${recent[0].name} gerade erschienen`, true]); }
  if (toNext < 30 * 60e3) { raise('stop'); reasons.push([`${next.currency} ${next.name} ${countdown(toNext)}`, true]); }
  else if (toNext < 2 * 3600e3) { raise('caution'); reasons.push([`${next.currency} ${next.name} ${countdown(toNext)}`, true]); }
  if (riskState === 'off') { raise('caution'); reasons.push(['Risk-off (VIX erhöht)', true]); }
  if (session()[1]) { raise('caution'); reasons.push(['Markt geschlossen', false]); }
  const product = document.documentElement.classList.contains('view-product');
  if (!reasons.length) reasons.push(['Keine Termine in den nächsten 2 h', false], ['Konten im grünen Bereich', false]);
  if (propCount && !product) reasons.push([`${propCount} Vorschlag${propCount > 1 ? 'e' : ''} wartet`, false]);

  $('statusCard').dataset.level = level;
  $('ckState').textContent = { go: 'Handelbar', caution: 'Vorsicht', stop: 'Finger weg' }[level];
  $('ckReasons').innerHTML = reasons.map(([t, hot]) => `<li class="${hot ? 'hot' : ''}">${esc(t)}</li>`).join('');
  renderEvents();
}

// ---------------------------------------------------------------------------
// Fundamental: Währungsstärke + Pairs
// ---------------------------------------------------------------------------
function reasonFor(p) {
  const b = p.pair.slice(0, 3), q = p.pair.slice(3, 6);
  const sign = Math.sign(p.score);
  if (!sign) return 'kein klares Bild';
  const parts = weights.filter(w => Number(w.weight) > 0).map(w => {
    const zb = factorZ[b]?.[w.factor], zq = factorZ[q]?.[w.factor];
    return zb == null || zq == null ? null : { f: w.factor, c: Number(w.weight) * (zb - zq) };
  }).filter(x => x && Math.sign(x.c) === sign).sort((a, c) => Math.abs(c.c) - Math.abs(a.c));
  return parts.length ? parts.slice(0, 2).map(x => SHORT[x.f] || x.f).join(' + ') : 'gemischt';
}

async function loadFundamentals() {
  // Alles in einer Runde: aktuelle Scores, Faktor-Werte und der Stand vor einer Woche
  const [{ data: scores }, { data: bias }, { data: w }, { data: fz }, { data: prevRows }] = await Promise.all([
    supabase.from('fb_latest_currency_scores').select('*'),
    supabase.from('fb_latest_pair_bias').select('*'),
    supabase.from('fb_factor_weights').select('factor, label, weight, enabled').order('sort_order'),
    supabase.from('fb_latest_factor_scores').select('currency, factor, z_score'),
    supabase.from('fb_pair_bias_prev_week').select('pair, score'),
  ]);
  weights = (w || []).filter(x => x.enabled);
  factorZ = {};
  (fz || []).forEach(r => { (factorZ[r.currency] ||= {})[r.factor] = r.z_score == null ? null : Number(r.z_score); });

  // Stand vor einer Woche für die Veränderung
  const asOf = bias?.[0]?.as_of;
  const prev = {};
  (prevRows || []).forEach(r => { prev[r.pair] = Number(r.score); });
  if (asOf) {
    $('pairsStand').textContent = `Stand ${new Date(asOf).toLocaleDateString('de-DE')} · ▲▼ zur Vorwoche`;
    $('strengthStand').textContent = `Stand ${new Date(asOf).toLocaleDateString('de-DE')}`;
  }
  pairBias = (bias || []).map(p => ({ ...p, score: Number(p.score), prev: prev[p.pair] }))
    .map(p => ({ ...p, reason: reasonFor(p) }))
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score));

  const sc = (scores || []).map(s => ({ c: s.currency, v: Number(s.score) })).sort((a, b) => b.v - a.v);
  $('strength').innerHTML = sc.length ? sc.map(s => `
    <div class="ck-str"><span class="c">${esc(s.c)}</span>${sbar(s.v)}<span class="v ${cls(s.v)}">${signed(s.v)}</span></div>`).join('')
    : '<p class="empty">Noch keine Scores berechnet.</p>';
}

function watchSet() {
  const auto = pairBias.filter(p => p.bias !== 'neutral').slice(0, WATCH_N).map(p => p.pair);
  const set = new Set(auto.filter(p => planPairs[p]?.watchlist_status !== 'no_interest'));
  Object.values(planPairs).forEach(r => { if (r.watchlist_status === 'forming' || r.watchlist_status === 'ready') set.add(r.pair); });
  return set;
}

function filtered() {
  const ws = watchSet();
  switch (filter) {
    case 'all': return pairBias;
    case 'watch': return pairBias.filter(p => ws.has(p.pair));
    case 'strong': return pairBias.filter(p => Math.abs(p.score) >= 50);
    case 'moved': return pairBias.filter(p => p.prev != null && Math.abs(p.score - p.prev) >= 15)
      .sort((a, b) => Math.abs(b.score - b.prev) - Math.abs(a.score - a.prev));
    default: return pairBias.filter(p => p.pair.includes(filter));
  }
}

function renderFilter() {
  const ws = watchSet();
  const chips = [
    ['all', 'Alle', pairBias.length],
    ['watch', 'Watchlist', ws.size],
    ['strong', 'Stark', pairBias.filter(p => Math.abs(p.score) >= 50).length],
    ['moved', 'Bewegt', pairBias.filter(p => p.prev != null && Math.abs(p.score - p.prev) >= 15).length],
    ...CURRENCIES.filter(c => pairBias.some(p => p.pair.includes(c))).map(c => [c, c, null]),
  ];
  $('pairFilter').innerHTML = chips.map(([k, l, n]) =>
    `<button class="chip${filter === k ? ' active' : ''}" data-f="${k}" aria-pressed="${filter === k}">${l}${n != null ? `<span class="n">${n}</span>` : ''}</button>`).join('');
}

function renderPairs() {
  renderFilter();
  const rows = filtered();
  $('pairList').innerHTML = rows.length ? rows.map((p, i) => {
    const d = dirOf(p.bias);
    const st = STATUS_BADGE[planPairs[p.pair]?.watchlist_status];
    const delta = p.prev != null ? p.score - p.prev : null;
    const dTxt = delta == null ? '' : Math.abs(delta) < 3 ? '<small title="kaum verändert zur Vorwoche">=</small>'
      : `<small class="${delta > 0 ? 'up' : 'down'}" title="${delta > 0 ? '+' : '−'}${Math.abs(delta)} zur Vorwoche">${delta > 0 ? '▲' : '▼'} ${Math.abs(delta)}</small>`;
    return `<button class="ck-row ${d}" data-pair="${esc(p.pair)}" style="animation-delay:${Math.min(i * 18, 300)}ms">
      <span class="p"><b>${esc(p.pair)}${st ? ` <span class="badge ${st[1]}">${st[0]}</span>` : ''}</b><small>${esc(p.reason)}</small></span>
      <span class="b">${sbar(p.score)}<span class="lab ${cls(d === 'neutral' ? 0 : p.score)}">${BIAS_LABEL[p.bias] || p.bias}</span></span>
      <span class="s ${d === 'neutral' ? '' : cls(p.score)}">${signed(p.score)}${dTxt}</span>
    </button>`;
  }).join('') : `<p class="empty">${filter === 'watch' ? 'Noch nichts auf der Watchlist.' : 'Kein Pair für diesen Filter.'}</p>`;
  // Einblenden nur beim ersten Aufbau, nicht nach jedem Speichern
  requestAnimationFrame(() => setTimeout(() => $('pairList').classList.add('settled'), 1200));
}

$('pairFilter').addEventListener('click', (e) => {
  const c = e.target.closest('.chip');
  if (!c) return;
  filter = c.dataset.f;
  try { localStorage.setItem(FILTER_KEY, filter); } catch { /* egal */ }
  renderPairs();
});
$('pairList').addEventListener('click', (e) => {
  const r = e.target.closest('.ck-row');
  if (r) openPair(r.dataset.pair);
});

// ---------------------------------------------------------------------------
// Pair-Detail als Sheet (Handy: von unten, Desktop: Seitenpanel)
// ---------------------------------------------------------------------------
let sheetEl = null;
function closeSheet() {
  if (!sheetEl) return;
  sheetEl.forEach(el => el.remove());
  sheetEl = null;
  document.body.style.overflow = '';
  document.removeEventListener('keydown', onKey);
}
function onKey(e) { if (e.key === 'Escape') closeSheet(); }

async function openPair(pair) {
  closeSheet();
  const p = pairBias.find(x => x.pair === pair);
  if (!p) return;
  const b = pair.slice(0, 3), q = pair.slice(3, 6);
  const d = dirOf(p.bias);
  const delta = p.prev != null ? p.score - p.prev : null;
  const row = planPairs[pair] || {};
  const status = row.watchlist_status || 'watching';

  const factors = weights.map(w => {
    const zb = factorZ[b]?.[w.factor], zq = factorZ[q]?.[w.factor];
    if (zb == null || zq == null) return '';
    const diff = zb - zq, on = Number(w.weight) > 0;
    return `<div class="pd-f${on ? '' : ' obs'}"><span class="n">${esc(w.label)}<small>${on ? `<span data-owner>Gewicht ${Number(w.weight)} · </span>${b} ${signed(zb, 1)} / ${q} ${signed(zq, 1)}` : 'nur beobachtet'}</small></span>${sbar(diff, 3)}<span class="v ${cls(diff)}">${signed(diff, 2)}</span></div>`;
  }).join('');
  const evs = events.filter(e => (e.currency === b || e.currency === q) && new Date(e.time) > new Date());

  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', `${pair} Details`);
  sheet.innerHTML = `
    <button class="sheet-handle" aria-label="Schließen"></button>
    <div class="pd-head">
      <div><h2>${esc(pair)}</h2></div>
      <div class="pd-score ${d === 'neutral' ? '' : cls(p.score)}">${signed(p.score)}<small>${delta == null ? 'Score' : `${delta >= 0 ? '+' : '−'}${Math.abs(delta)} zur Vorwoche`}</small></div>
    </div>
    <div class="pd-sub">
      <span class="badge ${d === 'long' ? 'pos' : d === 'short' ? 'neg' : ''}">${BIAS_LABEL[p.bias] || p.bias}</span>
      <span class="badge">${esc(p.reason)}</span>
      <button class="modal-close" style="margin-left:auto" aria-label="Schließen">✕</button>
    </div>
    ${sbar(p.score)}
    <div class="pd-sec pd-watch">
      <h4 style="display:flex;justify-content:space-between;align-items:center">Mein Plan heute <button type="button" class="btn-ghost sm" id="pdIdea">+ Trade-Idee</button></h4>
      <div class="segmented" id="pdStatus">${STATUS.map(([v, l]) => `<button type="button" class="seg-btn${v === status ? ' active' : ''}" data-v="${v}">${l}</button>`).join('')}</div>
      <textarea id="pdNote" rows="2" placeholder="Notiz zum Pair (Zone, Trigger, Einwände)">${esc(row.notes || '')}</textarea>
      <div class="pd-saved" id="pdSaved" aria-live="polite"></div>
    </div>
    <div class="pd-sec"><h4>Warum ${d === 'neutral' ? 'neutral' : d}?</h4>${factors || '<p class="empty">Keine Faktordaten.</p>'}</div>
    ${evs.length ? `<div class="pd-sec"><h4>Termine</h4>${evs.map(e => `<div class="pd-ev"><span class="t">${hhmm(e.time)}</span><span><b>${esc(e.currency)}</b> ${esc(e.name)}</span></div>`).join('')}</div>` : ''}
    <div class="pd-sec"><h4>News (48 h)</h4><div class="ck-news" id="pdNews"><span class="skel line"></span><span class="skel line"></span></div></div>`;
  document.body.append(backdrop, sheet);
  sheetEl = [backdrop, sheet];
  document.body.style.overflow = 'hidden';
  document.addEventListener('keydown', onKey);
  backdrop.onclick = closeSheet;
  sheet.querySelectorAll('.sheet-handle, .modal-close').forEach(x => { x.onclick = closeSheet; });
  sheet.querySelector('.modal-close').focus();

  // Status + Notiz speichern
  let cur = status, noteTimer = null;
  const save = async () => {
    const ok = await saveWatch(p, cur, sheet.querySelector('#pdNote').value.trim() || null);
    const s = sheet.querySelector('#pdSaved');
    if (s) s.textContent = ok ? 'Im Tagesplan gespeichert' : '';
  };
  sheet.querySelector('#pdStatus').onclick = (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    cur = btn.dataset.v;
    sheet.querySelectorAll('#pdStatus .seg-btn').forEach(x => x.classList.toggle('active', x === btn));
    save();
  };
  sheet.querySelector('#pdNote').oninput = () => { clearTimeout(noteTimer); noteTimer = setTimeout(save, 800); };
  sheet.querySelector('#pdIdea').onclick = () => {
    closeSheet();
    openIdeaEditor(null, { pair, direction: d === 'short' ? 'short' : 'long' }, loadIdeaList);
  };

  const since = new Date(Date.now() - 48 * 3600000).toISOString();
  const { data: news } = await supabase.from('fb_news')
    .select('title, url, source, published_at, fb_news_impacts!inner(currency, direction, importance)')
    .in('fb_news_impacts.currency', [b, q]).gte('published_at', since)
    .order('published_at', { ascending: false }).limit(6);
  const box = sheet.querySelector('#pdNews');
  if (box) box.innerHTML = (news || []).length ? news.map(newsLine).join('') : '<p class="empty">Keine eingeordneten Schlagzeilen.</p>';
}

// ---------------------------------------------------------------------------
// Watchlist-Status / Notiz -> Tagesplan von heute
// ---------------------------------------------------------------------------
async function loadPlan() {
  const { data } = await supabase.from('daily_plans').select('id, general_notes, daily_plan_pairs(*)').eq('plan_date', localDate()).maybeSingle();
  plan = data;
  planPairs = {};
  (data?.daily_plan_pairs || []).forEach(r => { planPairs[r.pair] = r; });
  $('dayNote').value = data?.general_notes || '';
}

// Notiz zum Tag: speichert 1 s nach der letzten Eingabe in daily_plans.general_notes
let noteTimer = null;
$('dayNote').addEventListener('input', () => {
  $('dayNoteState').textContent = 'wird gespeichert …';
  clearTimeout(noteTimer);
  noteTimer = setTimeout(async () => {
    try {
      const { id } = await ensurePlan();
      const { error } = await supabase.from('daily_plans').update({ general_notes: $('dayNote').value.trim() || null }).eq('id', id);
      if (error) throw error;
      $('dayNoteState').textContent = `gespeichert ${hhmm(new Date())}`;
    } catch (err) {
      console.error(err);
      $('dayNoteState').textContent = 'nicht gespeichert';
      toast('Notiz konnte nicht gespeichert werden: ' + (err.message || err));
    }
  }, 1000);
});

async function ensurePlan() {
  if (plan) return plan;
  const { data, error } = await supabase.from('daily_plans').insert({ plan_date: localDate() }).select('id').single();
  if (error) throw error;
  plan = { id: data.id, daily_plan_pairs: [] };
  return plan;
}

async function saveWatch(p, status, notes) {
  const fields = { watchlist_status: status, notes, bias: dirOf(p.bias), score: p.score, confluence: p.reason };
  try {
    const { id } = await ensurePlan();
    const existing = planPairs[p.pair];
    const res = existing
      ? await supabase.from('daily_plan_pairs').update(fields).eq('id', existing.id).select().single()
      : await supabase.from('daily_plan_pairs').insert({ ...fields, pair: p.pair, daily_plan_id: id }).select().single();
    if (res.error) throw res.error;
    planPairs[p.pair] = res.data;
    renderPairs();
    return true;
  } catch (err) {
    console.error(err);
    toast('Speichern fehlgeschlagen: ' + (err.message || err));
    return false;
  }
}

// ---------------------------------------------------------------------------
// Top-News: die wichtigsten Schlagzeilen der letzten 24 h
// ---------------------------------------------------------------------------
function ago(ts) {
  const m = Math.round((Date.now() - new Date(ts)) / 60000);
  return m < 60 ? `vor ${Math.max(m, 1)} min` : `vor ${Math.round(m / 60)} h`;
}

function newsLine(n) {
  const imp = Math.max(...n.fb_news_impacts.map(i => Number(i.importance) || 1));
  const tags = n.fb_news_impacts.map(i => `<span class="${i.direction > 0 ? 'pos' : 'neg'}">${esc(i.currency)} ${i.direction > 0 ? '▲' : '▼'}</span>`).join(' ')
    + ` <span class="imp" title="Wichtigkeit ${imp} von 5">${'●'.repeat(imp)}${'○'.repeat(5 - imp)}</span>`;
  const href = /^https?:\/\//i.test(n.url || '') ? esc(n.url) : '#';
  return `<div class="ck-n"><span class="meta">${esc(n.source)} · ${ago(n.published_at)} · ${tags}</span><a href="${href}" target="_blank" rel="noopener noreferrer">${esc(n.title)}</a></div>`;
}

async function loadTopNews() {
  const since = new Date(Date.now() - 24 * 3600000).toISOString();
  const { data } = await supabase.from('fb_news')
    .select('title, url, source, published_at, fb_news_impacts!inner(currency, direction, importance)')
    .eq('relevant', true).gte('published_at', since).order('published_at', { ascending: false }).limit(80);
  const top = (data || [])
    .map(n => ({ ...n, s: Math.max(...n.fb_news_impacts.map(i => Number(i.importance))) }))
    .sort((a, b) => b.s - a.s || new Date(b.published_at) - new Date(a.published_at))
    .slice(0, 5);
  $('topNews').innerHTML = top.length ? top.map(newsLine).join('') : '<p class="empty">Keine eingeordneten Schlagzeilen in den letzten 24 h.</p>';
}

// ---------------------------------------------------------------------------
// Trade-Ideen: offene (letzte 14 Tage) + heute abgeschlossene
// ---------------------------------------------------------------------------
async function loadIdeaList() {
  const today = localDate();
  const all = await loadIdeas({ sinceDays: 14 });
  const shown = all.filter(i => ['idea', 'order'].includes(i.status) || i.idea_date === today);
  const open = shown.filter(i => ['idea', 'order'].includes(i.status)).length;
  $('ideasHint').textContent = open ? `${open} offen` : 'offen und von heute';
  await renderIdeas($('ideaList'), shown, { empty: 'Noch keine Idee geplant. Über „+ Idee“ oder im Pair-Detail anlegen.', onChange: loadIdeaList });
}
$('addIdeaBtn').onclick = () => openIdeaEditor(null, {}, loadIdeaList);
const ideaFromHash = () => {
  if (location.hash !== '#idee') return;
  history.replaceState(null, '', location.pathname);
  openIdeaEditor(null, {}, loadIdeaList);
};
window.addEventListener('hashchange', ideaFromHash);

// ---------------------------------------------------------------------------
renderHello();
await Promise.all([loadRisk(), loadEvents(), loadProposals(), loadAccounts(), loadFundamentals(), loadPlan(), loadTopNews(), loadIdeaList()]);
ideaFromHash();
renderPairs();
renderStatus();
setInterval(() => { renderHello(); renderStatus(); }, 30000);
window.addEventListener('view-changed', renderStatus);
setInterval(() => { loadProposals().then(renderStatus); loadTopNews(); }, 5 * 60000);
