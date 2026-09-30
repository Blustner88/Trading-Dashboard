import { supabase } from './accounts.js';

// Backtesting: eigene Tabelle `backtest_trades`, völlig getrennt von Live-Trades.
// Die Checkliste lebt hier im Code — Punkte ändern = nur dieses Array anpassen.
const CHECKLIST = [
  { id: 'bias',   label: 'Fundamentaler Bias stützt die Richtung' },
  { id: 'trend',  label: '4H-Trend in Trade-Richtung' },
  { id: 'zone',   label: 'Preis an definierter 4H-Zone / Key-Level' },
  { id: 'trigger',label: '15M-Trigger bestätigt (Schlusskurs, nicht Docht)' },
  { id: 'sl',     label: 'SL ATR-basiert und hinter Struktur' },
  { id: 'room',   label: 'Freier Weg bis zum Ziel-R (kein Level im Weg)' },
  { id: 'news',   label: 'Kein High-Impact-Event im Trade-Fenster' },
];
const TARGET = 50;
// Ziel-R je Setup-Typ. Position wird am TP komplett geschlossen.
const SETUPS = {
  'Trend':    { min: 2,   max: null, def: 2,   hint: 'mind. 2R, höher bei Freiraum' },
  'Scale-In': { min: 1.5, max: 2,    def: 1.5, hint: '1,5–2R je nach Freiraum' },
  'Pullback': { min: 1.5, max: 1.5,  def: 1.5, hint: 'fix 1,5R' },
};
const SETUP_ORDER = Object.keys(SETUPS);
const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const GRADES = ['A+', 'A', 'B', 'C'];

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => (v === '' || v == null ? null : Number(v));
const fmtR = (r) => r == null ? '–' : `${r > 0 ? '+' : ''}${r.toFixed(2)}R`;

let rows = [];
let series = localStorage.getItem('td_bt_series') || '';
let gradeFilter = null;
let editingId = null;
let direction = null;

function gradeFor(score) {
  const n = CHECKLIST.length;
  if (score >= n) return 'A+';
  if (score === n - 1) return 'A';
  if (score === n - 2) return 'B';
  return 'C';
}

// ---------- Daten ----------
async function load() {
  const { data, error } = await supabase.from('backtest_trades').select('*').order('setup_date');
  if (error) { toast('Laden fehlgeschlagen: ' + error.message); return; }
  rows = data || [];
  const all = [...new Set(rows.map(r => r.test_series))];
  if (!all.includes(series)) series = all[all.length - 1] || 'BITR v1';
  renderSeries(all);
  render();
}

function renderSeries(all) {
  const list = all.length ? all : [series];
  $('seriesSelect').innerHTML = list.map(s => `<option ${s === series ? 'selected' : ''}>${esc(s)}</option>`).join('');
  $('seriesList').innerHTML = list.map(s => `<option value="${esc(s)}">`).join('');
  $('pairList').innerHTML = [...new Set(rows.map(r => r.pair))].map(p => `<option value="${esc(p)}">`).join('');
}

function current() {
  return rows.filter(r => r.test_series === series && (!gradeFilter || r.grade === gradeFilter));
}

// ---------- Statistik ----------
function stats(list) {
  const closed = list.filter(r => r.r_multiple != null && r.result !== 'open');
  const rs = closed.map(r => Number(r.r_multiple));
  const wins = rs.filter(r => r > 0), losses = rs.filter(r => r < 0);
  const total = rs.reduce((a, b) => a + b, 0);
  const grossW = wins.reduce((a, b) => a + b, 0), grossL = -losses.reduce((a, b) => a + b, 0);
  let peak = 0, eq = 0, dd = 0, streak = 0, maxStreak = 0;
  const curve = [0];
  rs.forEach(r => {
    eq += r; curve.push(eq); peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq);
    streak = r < 0 ? streak + 1 : 0; maxStreak = Math.max(maxStreak, streak);
  });
  return {
    n: closed.length, total, curve, dd, maxStreak,
    win: closed.length ? wins.length / closed.length : null,
    exp: closed.length ? total / closed.length : null,
    pf: grossL > 0 ? grossW / grossL : (grossW > 0 ? Infinity : null),
  };
}

function render() {
  const list = current();
  const s = stats(list);
  const allInSeries = rows.filter(r => r.test_series === series).length;

  $('progressLabel').textContent = `${allInSeries} / ${TARGET} Trades`;
  $('progressFill').style.width = `${Math.min(100, allInSeries / TARGET * 100)}%`;
  $('progressHint').textContent = allInSeries >= TARGET ? 'Stichprobe erreicht — jetzt auswerten' : `noch ${TARGET - allInSeries} bis zur Auswertung`;

  $('kCount').textContent = s.n;
  $('kWin').textContent = s.win == null ? '–' : `${Math.round(s.win * 100)} %`;
  setSigned('kExp', s.exp);
  setSigned('kTotal', s.n ? s.total : null);
  $('kPF').textContent = s.pf == null ? '–' : (s.pf === Infinity ? '∞' : s.pf.toFixed(2));
  $('kDD').textContent = !s.n ? '–' : (s.dd > 0 ? `-${s.dd.toFixed(2)}R` : '0R');
  $('kDD').classList.toggle('neg', s.dd > 0);
  $('streakInfo').textContent = s.n ? `Längste Verlustserie: ${s.maxStreak}` : '';

  renderChart(s.curve);
  renderBreakdown('bySetup', list, r => r.setup_type || '–', SETUP_ORDER.concat('–'));
  renderBreakdown('byGrade', list, r => r.grade || '–', GRADES);
  renderBreakdown('byPair', list, r => r.pair);
  renderBreakdown('bySession', list, r => r.session || '–');
  renderBreakdown('byWeekday', list, r => WEEKDAYS[new Date(r.setup_date).getDay()], WEEKDAYS.slice(1).concat('So'));
  renderList(list);
}

function setSigned(id, v) {
  const el = $(id);
  el.textContent = v == null ? '–' : fmtR(v);
  el.classList.toggle('pos', v > 0);
  el.classList.toggle('neg', v < 0);
}

function renderChart(curve) {
  const el = $('equityChart');
  if (curve.length < 2) { el.innerHTML = '<p class="bt-empty">Noch keine abgeschlossenen Backtest-Trades.</p>'; return; }
  const W = 800, H = 200, P = 8;
  const min = Math.min(0, ...curve), max = Math.max(0, ...curve);
  const span = max - min || 1;
  const x = i => P + i * (W - 2 * P) / (curve.length - 1);
  const y = v => H - P - (v - min) * (H - 2 * P) / span;
  const pts = curve.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = curve[curve.length - 1];
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" class="bt-svg">
    <line x1="${P}" x2="${W - P}" y1="${y(0)}" y2="${y(0)}" class="bt-zero" />
    <polyline points="${pts}" class="bt-line ${last >= 0 ? 'up' : 'down'}" vector-effect="non-scaling-stroke" />
  </svg>`;
}

function renderBreakdown(id, list, keyFn, order) {
  const groups = {};
  list.forEach(r => { const k = keyFn(r); (groups[k] ||= []).push(r); });
  let keys = Object.keys(groups);
  keys = order ? order.filter(k => groups[k]) : keys.sort((a, b) => stats(groups[b]).total - stats(groups[a]).total);
  $(id).innerHTML = keys.length ? `<table class="bt-table">
    <thead><tr><th></th><th>n</th><th>Win</th><th>Ø R</th><th>Σ R</th></tr></thead>
    <tbody>${keys.map(k => {
      const s = stats(groups[k]);
      const cls = s.total > 0 ? 'pos' : s.total < 0 ? 'neg' : '';
      return `<tr><td>${esc(k)}</td><td>${s.n}</td><td>${s.win == null ? '–' : Math.round(s.win * 100) + '%'}</td>
        <td>${s.exp == null ? '–' : s.exp.toFixed(2)}</td><td class="${cls}">${s.n ? s.total.toFixed(1) : '–'}</td></tr>`;
    }).join('')}</tbody></table>` : '<p class="bt-empty">–</p>';
}

function renderList(list) {
  const el = $('btList');
  if (!list.length) {
    el.innerHTML = '<p class="bt-empty">Noch keine Trades in dieser Testreihe. Tipp: TradingView Bar-Replay starten, Setup suchen, Checkliste abhaken, dann Replay weiterlaufen lassen.</p>';
    return;
  }
  el.innerHTML = [...list].reverse().map(r => {
    const rv = r.r_multiple == null ? null : Number(r.r_multiple);
    const d = new Date(r.setup_date).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
    return `<div class="trade-card bt-card" data-id="${r.id}">
      <div class="tc-main">
        <div class="tc-pair-row">
          <span class="tc-pair">${esc(r.pair)}</span>
          <span class="bt-dir ${r.direction}">${r.direction === 'short' ? '▼ Short' : '▲ Long'}</span>
          <span class="bt-grade g-${(r.grade || 'C').replace('+', 'p')}">${esc(r.grade || '–')}</span>
        </div>
        <div class="tc-meta"><span>${d}</span><span>${esc(r.session || '')}</span><span>${r.checklist_score ?? 0}/${CHECKLIST.length}</span></div>
        ${r.setup_type ? `<div class="tc-setup">${esc(r.setup_type)}${r.target_r != null ? ` · Ziel ${Number(r.target_r).toFixed(1).replace('.', ',')}R` : ''}</div>` : ''}
      </div>
      <div class="tc-r"><span class="tc-r-value ${rv > 0 ? 'pos' : rv < 0 ? 'neg' : ''}">${fmtR(rv)}</span></div>
    </div>`;
  }).join('');
  el.querySelectorAll('.bt-card').forEach(c => c.onclick = () => openModal(rows.find(r => r.id === c.dataset.id)));
}

// ---------- Formular ----------
function buildChecklist() {
  $('checklist').innerHTML = CHECKLIST.map(c => `
    <label class="bt-check"><input type="checkbox" data-id="${c.id}" /> <span>${esc(c.label)}</span></label>`).join('');
  $('checklist').addEventListener('change', updateGradePreview);
}

function checkedMap() {
  const m = {};
  document.querySelectorAll('#checklist input').forEach(i => { m[i.dataset.id] = i.checked; });
  return m;
}

function updateGradePreview() {
  const score = Object.values(checkedMap()).filter(Boolean).length;
  const g = gradeFor(score);
  const el = $('gradePreview');
  el.textContent = `${score}/${CHECKLIST.length} · ${g}${g === 'C' ? ' — kein Trade' : ''}`;
  el.className = `bt-grade g-${g.replace('+', 'p')}`;
}

function setDirection(d) {
  direction = d;
  document.querySelectorAll('#f_direction .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.value === d));
}

function toLocalInput(iso) {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function openModal(r = null) {
  editingId = r ? r.id : null;
  $('btForm').reset();
  $('modalTitle').textContent = r ? 'Backtest-Trade bearbeiten' : 'Backtest-Trade erfassen';
  $('deleteBtn').style.display = r ? 'block' : 'none';
  $('f_series').value = r ? r.test_series : series;
  setDirection(r ? r.direction : null);
  document.querySelectorAll('#checklist input').forEach(i => { i.checked = !!(r && r.checklist?.[i.dataset.id]); });
  if (r) {
    $('f_pair').value = r.pair;
    $('f_date').value = toLocalInput(r.setup_date);
    $('f_session').value = r.session || '';
    $('f_setup').value = SETUPS[r.setup_type] ? r.setup_type : '';
    $('f_target').value = r.target_r ?? '';
    $('f_entry').value = r.entry_price ?? '';
    $('f_sl').value = r.stop_loss ?? '';
    $('f_tp1').value = r.tp1 ?? '';
    $('f_exit').value = r.exit_price ?? '';
    $('f_result').value = r.result || '';
    $('f_r').value = r.r_multiple ?? '';
    $('f_mfe').value = r.mfe_r ?? '';
    $('f_chart').value = r.chart_url || '';
    $('f_notes').value = r.notes || '';
  }
  tpManual = !!(r && r.tp1 != null);
  applySetupRule(false);
  updateGradePreview();
  $('modalOverlay').classList.add('visible');
}

function closeModal() {
  $('modalOverlay').classList.remove('visible');
  editingId = null;
}

// ---------- Ziel-R & Take Profit ----------
let tpManual = false;

function applySetupRule(resetTarget = true) {
  const rule = SETUPS[$('f_setup').value];
  const t = $('f_target');
  $('targetHint').textContent = rule ? rule.hint : '';
  if (!rule) { t.disabled = false; t.removeAttribute('min'); t.removeAttribute('max'); return; }
  t.min = rule.min;
  if (rule.max != null) t.max = rule.max; else t.removeAttribute('max');
  if (resetTarget || t.value === '') t.value = rule.def;
  t.disabled = rule.min === rule.max;
  if (t.disabled) t.value = rule.min;
  syncTp();
}

// TP aus Entry, SL und Ziel-R, solange der TP nicht von Hand geändert wurde
function syncTp() {
  const entry = num($('f_entry').value), sl = num($('f_sl').value), tr = num($('f_target').value);
  if (tpManual || entry == null || sl == null || tr == null || entry === sl || !direction) return;
  const risk = Math.abs(entry - sl), sign = direction === 'short' ? -1 : 1;
  const decimals = Math.max(countDecimals($('f_entry').value), countDecimals($('f_sl').value));
  $('f_tp1').value = (entry + sign * tr * risk).toFixed(decimals);
}
const countDecimals = (v) => (String(v).split('.')[1] || '').length;

// R aus Preisen, falls nicht manuell eingetragen. Am TP wird komplett geschlossen.
function computeR(result, entry, sl, exit, targetR) {
  if (result === 'sl') return -1;
  if (result === 'be') return 0;
  if (result === 'tp' && targetR != null) return +targetR.toFixed(2);
  if (entry == null || sl == null || entry === sl) return null;
  const risk = Math.abs(entry - sl);
  const sign = direction === 'short' ? -1 : 1;
  if (result === 'partial' && exit != null) return +(sign * (exit - entry) / risk).toFixed(2);
  return null;
}

async function save(e) {
  e.preventDefault();
  if (!direction) { toast('Bitte Richtung wählen.'); return; }
  const checklist = checkedMap();
  const score = Object.values(checklist).filter(Boolean).length;
  const entry = num($('f_entry').value), sl = num($('f_sl').value), exit = num($('f_exit').value);
  const result = $('f_result').value;
  const setupType = $('f_setup').value;
  const rule = SETUPS[setupType];
  const targetR = num($('f_target').value);
  if (rule && (targetR == null || targetR < rule.min || (rule.max != null && targetR > rule.max))) {
    toast(`Ziel-R für ${setupType}: ${rule.hint}.`); return;
  }
  let r = num($('f_r').value);
  if (r == null && result !== 'open') r = computeR(result, entry, sl, exit, targetR);

  const payload = {
    test_series: $('f_series').value.trim(),
    pair: $('f_pair').value.trim().toUpperCase(),
    direction,
    setup_date: new Date($('f_date').value).toISOString(),
    session: $('f_session').value || null,
    setup_type: setupType || null,
    target_r: targetR,
    checklist, checklist_score: score, grade: gradeFor(score),
    entry_price: entry, stop_loss: sl, tp1: num($('f_tp1').value), exit_price: exit,
    result, r_multiple: r, mfe_r: num($('f_mfe').value),
    chart_url: $('f_chart').value.trim() || null,
    notes: $('f_notes').value.trim() || null,
    updated_at: new Date().toISOString(),
  };
  const q = editingId
    ? supabase.from('backtest_trades').update(payload).eq('id', editingId)
    : supabase.from('backtest_trades').insert(payload);
  const { error } = await q;
  if (error) { toast('Speichern fehlgeschlagen: ' + error.message); return; }
  series = payload.test_series;
  localStorage.setItem('td_bt_series', series);
  if (r == null && result !== 'open') toast('Gespeichert — R bitte manuell nachtragen (Preise fehlen).');
  else toast(editingId ? 'Aktualisiert' : `Gespeichert · ${payload.grade}`);
  closeModal();
  await load();
}

async function remove() {
  if (!editingId || !confirm('Diesen Backtest-Trade löschen?')) return;
  const { error } = await supabase.from('backtest_trades').delete().eq('id', editingId);
  if (error) { toast('Löschen fehlgeschlagen: ' + error.message); return; }
  closeModal();
  await load();
}

function buildGradeFilter() {
  const g = $('gradeFilter');
  GRADES.forEach(k => {
    const b = document.createElement('button');
    b.className = 'chip'; b.textContent = k;
    b.onclick = () => {
      gradeFilter = gradeFilter === k ? null : k;
      g.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c.textContent === gradeFilter));
      render();
    };
    g.appendChild(b);
  });
}

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('visible');
  setTimeout(() => t.classList.remove('visible'), 3200);
}

function init() {
  buildChecklist();
  buildGradeFilter();
  $('openAddBt').onclick = () => openModal();
  $('modalClose').onclick = closeModal;
  $('cancelBtn').onclick = closeModal;
  $('deleteBtn').onclick = remove;
  $('modalOverlay').onclick = (e) => { if (e.target.id === 'modalOverlay') closeModal(); };
  $('btForm').onsubmit = save;
  document.querySelectorAll('#f_direction .seg-btn').forEach(b => b.onclick = () => { setDirection(b.dataset.value); syncTp(); });
  $('f_setup').onchange = () => applySetupRule(true);
  ['f_entry', 'f_sl', 'f_target'].forEach(id => $(id).addEventListener('input', syncTp));
  $('f_tp1').addEventListener('input', () => { tpManual = $('f_tp1').value !== ''; });
  $('seriesSelect').onchange = (e) => { series = e.target.value; localStorage.setItem('td_bt_series', series); render(); };
  load();
}

init();
