import { supabase } from './accounts.js';

// Cockpit: alles, was vor und während der Session zählt, auf einen Blick.
// Nur lesend, bis auf Watchlist-Status/Notiz (daily_plans / daily_plan_pairs,
// dieselben Tabellen wie der Tagesplan — ein Plan wird erst beim ersten Eintrag angelegt).

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hhmm = (ts) => new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
const signed = (v, d = 2) => `${v > 0 ? '+' : ''}${Number(v).toFixed(d)}`;
const localDate = (d = new Date()) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };

const WATCH_N = 8;               // so viele Pairs mit dem stärksten Bias kommen auf die Watchlist
const STATUS = [['watching', 'Beobachten'], ['forming', 'Setup formt sich'], ['ready', 'Bereit'], ['no_interest', 'Kein Interesse']];
const BIAS_LABEL = { strong_long: 'stark long', long: 'long', neutral: 'neutral', short: 'short', strong_short: 'stark short' };

let pairBias = [];               // fb_latest_pair_bias
let factorZ = {};                // currency -> factor -> z (letzter Stand)
let weights = [];                // fb_factor_weights
let events = [];
let plan = null;                 // heutiger daily_plan (oder null)
let planPairs = {};              // pair -> daily_plan_pairs-Zeile
let openPair = null;

$('ckDate').textContent = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long' });

// ---------------------------------------------------------------------------
// Briefing
// ---------------------------------------------------------------------------
async function loadRisk() {
  const { data } = await supabase.from('fb_risk_indicators').select('date, value')
    .eq('indicator', 'vix').order('date', { ascending: false }).limit(260);
  if (!data?.length) return;
  const cur = Number(data[0].value);
  const vals = data.map(d => Number(d.value));
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const sd = Math.sqrt(vals.reduce((a, b) => a + (b - mean) ** 2, 0) / (vals.length - 1));
  const z = (cur - mean) / sd;
  const [label, cls] = z <= -0.5 ? ['Risk-on', 'pos'] : z >= 0.5 ? ['Risk-off', 'neg'] : ['Neutral', ''];
  $('riskLabel').textContent = label;
  $('riskLabel').className = `ck-big ${cls}`;
  $('riskSub').textContent = `VIX ${cur.toFixed(1)} · 1-J-Schnitt ${mean.toFixed(1)} · Stand ${new Date(data[0].date).toLocaleDateString('de-DE')}`;
}

async function loadEvents() {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 2);
  // nur der Kalender-Sammler (Forex Factory); alte ForexFundamentals-Termine hätten andere Namen fürs selbe Ereignis
  const { data } = await supabase.from('desk_events').select('time, currency, name').like('run_id', 'ffcal-%')
    .gte('time', start.toISOString()).lt('time', end.toISOString()).order('time');
  const seen = new Set();
  events = (data || []).filter(e => { const k = `${e.time}|${e.currency}|${e.name}`; return !seen.has(k) && seen.add(k); });
  const todayEnd = new Date(start); todayEnd.setDate(todayEnd.getDate() + 1);
  const today = events.filter(e => new Date(e.time) < todayEnd);
  const next = events.find(e => new Date(e.time) > new Date());
  $('eventsCount').textContent = today.length;
  $('eventsNext').textContent = next
    ? `nächster: ${new Date(next.time) < todayEnd ? '' : 'morgen '}${hhmm(next.time)} ${next.currency} ${next.name}`
    : 'keine weiteren heute/morgen';
  $('events').innerHTML = events.length ? events.map(e => {
    const past = new Date(e.time) < new Date();
    const day = new Date(e.time) < todayEnd ? 'heute' : 'morgen';
    return `<div class="ck-ev${past ? ' past' : ''}"><span class="t">${day} ${hhmm(e.time)}</span><span class="c">${esc(e.currency)}</span><span>${esc(e.name)}</span></div>`;
  }).join('') : '<p class="desk-empty">Keine High-Impact-Termine heute und morgen.</p>';
}

async function loadProposals() {
  const { data } = await supabase.from('trade_proposals').select('pair, direction').eq('status', 'pending');
  const rows = data || [];
  $('proposalsCount').textContent = rows.length;
  if (rows.length) $('proposalsSub').textContent = rows.map(r => `${r.pair} ${r.direction === 'short' ? '▼' : '▲'}`).join(' · ');
  $('tileProposals').classList.toggle('hot', rows.length > 0);
}

// Gleiche Rechnung wie der Drawdown-Tracker in der Übersicht (dashboard.js)
async function loadAccounts() {
  const { data: accounts } = await supabase.from('accounts').select('*').eq('status', 'active');
  const acc = (accounts || []).filter(a => a.daily_loss_limit_pct || a.max_drawdown_pct);
  if (!acc.length) { $('accountsLabel').textContent = 'keine Limits'; return; }
  const { data: trades } = await supabase.from('trades').select('account_id, entry_date, profit_amount')
    .eq('status', 'closed').in('account_id', acc.map(a => a.id)).order('entry_date');
  const today = new Date().toISOString().slice(0, 10);
  let worst = 0;
  $('accountsBars').innerHTML = acc.map(a => {
    const ts = (trades || []).filter(t => t.account_id === a.id);
    const start = Number(a.starting_balance);
    let run = start, peak = start;
    ts.forEach(t => { run += Number(t.profit_amount) || 0; peak = Math.max(peak, run); });
    const ddPct = (peak - run) / start * 100;
    const dayPL = ts.filter(t => t.entry_date.slice(0, 10) === today).reduce((s, t) => s + (Number(t.profit_amount) || 0), 0);
    const dayPct = dayPL < 0 ? -dayPL / start * 100 : 0;
    const bar = (label, v, lim) => {
      if (!lim) return '';
      const used = Math.min(v / lim, 1);
      worst = Math.max(worst, used);
      return `<div class="ck-bar"><span>${label} ${v.toFixed(1)} / ${lim} %</span><i style="--w:${(used * 100).toFixed(0)}%" class="${used >= .9 ? 'danger' : used >= .6 ? 'warn' : ''}"></i></div>`;
    };
    return `<div class="ck-acc"><b>${esc(a.name.replace(/^\d+\s*-\s*/, ''))}</b>${bar('Tag', dayPct, a.daily_loss_limit_pct)}${bar('DD', ddPct, a.max_drawdown_pct)}</div>`;
  }).join('');
  const [label, cls] = worst >= .9 ? ['Kritisch', 'neg'] : worst >= .6 ? ['Vorsicht', 'warn'] : ['OK', 'pos'];
  $('accountsLabel').textContent = label;
  $('accountsLabel').className = `ck-big ${cls}`;
}

// ---------------------------------------------------------------------------
// Fundamental: Währungsstärke + Pairs
// ---------------------------------------------------------------------------
async function loadFundamentals() {
  const [{ data: scores }, { data: bias }, { data: w }, { data: last }] = await Promise.all([
    supabase.from('fb_latest_currency_scores').select('*'),
    supabase.from('fb_latest_pair_bias').select('*'),
    supabase.from('fb_factor_weights').select('factor, label, weight, enabled').order('sort_order'),
    supabase.from('fb_factor_scores').select('as_of').order('as_of', { ascending: false }).limit(1),
  ]);
  pairBias = (bias || []).sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  weights = (w || []).filter(x => x.enabled);
  if (last?.length) {
    const { data: fz } = await supabase.from('fb_factor_scores').select('currency, factor, z_score').eq('as_of', last[0].as_of);
    factorZ = {};
    (fz || []).forEach(r => { (factorZ[r.currency] ||= {})[r.factor] = r.z_score == null ? null : Number(r.z_score); });
    $('strengthStand').textContent = `eigenes Fundamental-Tool · Stand ${new Date(last[0].as_of).toLocaleDateString('de-DE')}`;
  }

  // Score −100..+100; Balken auf dieselbe Skala, Mitte = 0
  const sc = (scores || []).map(s => ({ c: s.currency, v: Number(s.score) })).sort((a, b) => b.v - a.v);
  $('strength').innerHTML = sc.map(s => `
    <div class="ck-str">
      <span class="c">${esc(s.c)}</span>
      <span class="track"><i class="${s.v >= 0 ? 'pos' : 'neg'}" style="--w:${(Math.abs(s.v) / 100 * 50).toFixed(1)}%"></i></span>
      <span class="v ${s.v >= 0 ? 'pos' : 'neg'}">${signed(s.v, 0)}</span>
    </div>`).join('');

  $('pairTiles').innerHTML = pairBias.map(p => {
    const dir = p.bias.endsWith('long') ? 'long' : p.bias.endsWith('short') ? 'short' : 'neutral';
    return `<button class="ck-pair ${dir}${p.bias.startsWith('strong') ? ' strong' : ''}" data-pair="${esc(p.pair)}" title="${esc(p.confluence || '')}">
      <span class="p">${esc(p.pair)}</span><span class="d">${dir === 'long' ? '▲' : dir === 'short' ? '▼' : '•'} ${signed(p.score, 0)}</span></button>`;
  }).join('');
}

async function showPair(pair) {
  const el = $('pairDetail');
  if (openPair === pair) { openPair = null; el.hidden = true; return; }
  openPair = pair;
  const p = pairBias.find(x => x.pair === pair);
  const b = pair.slice(0, 3), q = pair.slice(3, 6);
  const rows = weights.map(w => {
    const zb = factorZ[b]?.[w.factor], zq = factorZ[q]?.[w.factor];
    if (zb == null || zq == null) return '';
    const d = zb - zq;
    return `<tr class="${Number(w.weight) > 0 ? '' : 'obs'}"><td>${esc(w.label)}<span class="s">${Number(w.weight) > 0 ? `Gewicht ${Number(w.weight)}` : 'nur beobachtet'}</span></td>
      <td class="r">${signed(zb)}</td><td class="r">${signed(zq)}</td>
      <td class="r ${d > 0 ? 'pos' : d < 0 ? 'neg' : ''}">${signed(d)}</td></tr>`;
  }).join('');

  const since = new Date(Date.now() - 48 * 3600000).toISOString();
  const { data: news } = await supabase.from('fb_news')
    .select('title, url, source, published_at, fb_news_impacts!inner(currency, direction, importance)')
    .in('fb_news_impacts.currency', [b, q]).gte('published_at', since)
    .order('published_at', { ascending: false }).limit(6);
  const evs = events.filter(e => e.currency === b || e.currency === q);

  el.hidden = false;
  el.innerHTML = `
    <div class="ck-detail-head"><b>${esc(pair)}</b> · ${esc(BIAS_LABEL[p.bias] || p.bias)} · Score ${signed(p.score, 0)} <span class="desk-hint">(−100…+100 · ab ±20 Richtung, ab ±50 stark)</span>
      <span class="desk-hint">${esc(p.confluence || '')}</span></div>
    <table class="ck-ftable"><thead><tr><th>Faktor</th><th>${esc(b)}</th><th>${esc(q)}</th><th>Differenz</th></tr></thead><tbody>${rows}</tbody></table>
    ${evs.length ? `<p class="ck-mini"><b>⚠ Termine:</b> ${evs.map(e => `${hhmm(e.time)} ${esc(e.currency)} ${esc(e.name)}`).join(' · ')}</p>` : ''}
    <div class="ck-mini"><b>📰 News (48 h)</b>${(news || []).length ? news.map(n => newsLine(n)).join('') : '<p class="desk-empty">Keine eingeordneten Schlagzeilen.</p>'}</div>`;
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

$('pairTiles').addEventListener('click', (e) => {
  const t = e.target.closest('.ck-pair');
  if (t) showPair(t.dataset.pair);
});

// ---------------------------------------------------------------------------
// Watchlist (Status + Notiz -> Tagesplan von heute)
// ---------------------------------------------------------------------------
async function loadPlan() {
  const { data } = await supabase.from('daily_plans').select('id, daily_plan_pairs(*)').eq('plan_date', localDate()).maybeSingle();
  plan = data;
  planPairs = {};
  (data?.daily_plan_pairs || []).forEach(r => { planPairs[r.pair] = r; });
}

function renderWatchlist() {
  const auto = pairBias.filter(p => p.bias !== 'neutral').slice(0, WATCH_N).map(p => p.pair);
  const manual = Object.values(planPairs).filter(r => r.watchlist_status !== 'watching' && !auto.includes(r.pair)).map(r => r.pair);
  const list = [...auto, ...manual];
  $('watchlist').innerHTML = list.length ? list.map(pair => {
    const p = pairBias.find(x => x.pair === pair) || { bias: 'neutral', diff: 0 };
    const r = planPairs[pair] || {};
    const dir = p.bias.endsWith('long') ? 'long' : p.bias.endsWith('short') ? 'short' : 'neutral';
    const evs = events.filter(e => (e.currency === pair.slice(0, 3) || e.currency === pair.slice(3, 6)) && new Date(e.time) > new Date());
    return `<div class="ck-w" data-pair="${esc(pair)}">
      <span class="p ${dir}">${esc(pair)} ${dir === 'long' ? '▲' : dir === 'short' ? '▼' : ''}</span>
      <select aria-label="Status ${esc(pair)}">${STATUS.map(([v, l]) => `<option value="${v}"${(r.watchlist_status || 'watching') === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
      <input type="text" placeholder="Notiz …" value="${esc(r.notes || '')}" aria-label="Notiz ${esc(pair)}">
      ${evs.length ? `<span class="ev" title="${esc(evs.map(e => `${hhmm(e.time)} ${e.currency} ${e.name}`).join('\n'))}">⚠ ${hhmm(evs[0].time)}</span>` : '<span></span>'}
    </div>`;
  }).join('') : '<p class="desk-empty">Kein Pair mit klarem Bias.</p>';
}

async function ensurePlan() {
  if (plan) return plan;
  const { data, error } = await supabase.from('daily_plans').insert({ plan_date: localDate() }).select('id').single();
  if (error) throw error;
  plan = { id: data.id, daily_plan_pairs: [] };
  return plan;
}

async function saveWatch(row) {
  const pair = row.dataset.pair;
  const p = pairBias.find(x => x.pair === pair);
  const fields = {
    watchlist_status: row.querySelector('select').value,
    notes: row.querySelector('input').value.trim() || null,
    bias: p ? (p.bias.endsWith('long') ? 'long' : p.bias.endsWith('short') ? 'short' : 'neutral') : 'neutral',
    score: p ? p.score : null,
    confluence: p?.confluence || null,
  };
  try {
    const { id } = await ensurePlan();
    const existing = planPairs[pair];
    const res = existing
      ? await supabase.from('daily_plan_pairs').update(fields).eq('id', existing.id).select().single()
      : await supabase.from('daily_plan_pairs').insert({ ...fields, pair, daily_plan_id: id }).select().single();
    if (res.error) throw res.error;
    planPairs[pair] = res.data;
    row.classList.add('saved');
    setTimeout(() => row.classList.remove('saved'), 900);
  } catch (err) {
    console.error(err);
    row.classList.add('error');
  }
}

$('watchlist').addEventListener('change', (e) => {
  const row = e.target.closest('.ck-w');
  if (row) saveWatch(row);
});

// ---------------------------------------------------------------------------
// Top-News: die stärksten Schlagzeilen der letzten 24 h
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
  $('topNews').innerHTML = top.length ? top.map(newsLine).join('') : '<p class="desk-empty">Keine eingeordneten Schlagzeilen in den letzten 24 h.</p>';
}

// ---------------------------------------------------------------------------
await Promise.all([loadRisk(), loadEvents(), loadProposals(), loadAccounts(), loadFundamentals(), loadPlan(), loadTopNews()]);
renderWatchlist();
setInterval(() => { loadProposals(); loadTopNews(); }, 5 * 60000);
