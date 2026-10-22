import { supabase, initAccountSwitcher, getSelectedAccountId, getAccounts, drawdownOf } from './accounts.js';
import { toastError } from './nav.js';
import { computeLevel, XP_PER_LEVEL, isDocumented, hasOwnRisk, riskOnTarget, isPlanned } from './level-core.js';

const $ = (id) => document.getElementById(id);

let allTrades = [];
let allPayouts = [];
let allExpenses = [];
let allPlanDates = [];
let allIdeas = [];
let riskTarget = 0.8;   // Standard-Risiko aus den Einstellungen

// Zeitraum und Einheit bleiben über Besuche hinweg erhalten
const store = {
  get(k, d) { try { return localStorage.getItem(k) || d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* privates Fenster */ } },
};
let currentRange = store.get('td_dash_range', 'all');
let unitChoice = store.get('td_dash_unit', 'auto');   // auto | r | usd
let unit = 'r';                                        // tatsächlich genutzte Einheit

async function init() {
  await initAccountSwitcher();
  bindPicker('rangePicker', 'range', () => currentRange, v => { currentRange = v; store.set('td_dash_range', v); });
  bindPicker('unitPicker', 'unit', () => unitChoice, v => { unitChoice = v; store.set('td_dash_unit', v); });
  window.addEventListener('account-changed', render);
  await loadTrades();
}

function bindPicker(id, attr, get, set) {
  const btns = document.querySelectorAll(`#${id} .chip`);
  const mark = () => btns.forEach(b => {
    const on = b.dataset[attr] === get();
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', on);
  });
  if (![...btns].some(b => b.dataset[attr] === get())) set(btns[btns.length - 1].dataset[attr]);
  btns.forEach(btn => btn.onclick = () => { set(btn.dataset[attr]); mark(); render(); });
  mark();
}

async function loadTrades() {
  const [tr, pay, exp, plans, rs, ideas] = await Promise.all([
    supabase.from('trades').select('*').order('entry_date', { ascending: true }),
    supabase.from('payouts').select('*'),
    supabase.from('business_expenses').select('*'),
    supabase.from('daily_plans').select('plan_date'),
    supabase.from('user_settings').select('value').eq('key', 'default_risk_pct').maybeSingle(),
    supabase.from('trade_ideas').select('id, trade_id'),
  ]);
  if (tr.error) {
    toastError('Trades nicht geladen', tr.error);
    $('equityChartWrap').innerHTML = `<div class="dash-empty">Trades konnten nicht geladen werden. Bitte Seite neu laden.</div>`;
    return;
  }
  allTrades = tr.data || [];
  allPayouts = pay.data || [];
  allExpenses = exp.data || [];
  allPlanDates = (plans.data || []).map(p => p.plan_date);
  allIdeas = ideas.data || [];
  if (Number(rs.data?.value) > 0) riskTarget = Number(rs.data.value);

  render();
}

// ---------- Einheit: R-Vielfache oder Betrag ----------
const hasR = (t) => t.r_multiple !== null && t.r_multiple !== undefined;
const val = (t) => unit === 'r' ? Number(t.r_multiple) : (Number(t.profit_amount) || 0);
function fmt(v, signed = true) {
  const s = signed && v > 0 ? '+' : '';
  if (unit === 'r') return `${s}${v.toFixed(2)}R`;
  return `${s}${money(v)} $`;
}
function money(v) { return Number(v).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function axis(v) {
  const n = (x) => x.toLocaleString('de-DE', { maximumFractionDigits: 1 });
  return unit === 'r' ? `${n(v)}R` : Math.abs(v) >= 1000 ? `${n(v / 1000)}k` : v.toFixed(0);
}

function chooseUnit(closedAll) {
  const withR = closedAll.filter(hasR).length;
  if (unitChoice === 'r' || unitChoice === 'usd') return unitChoice;
  return closedAll.length && withR / closedAll.length >= 0.5 ? 'r' : 'usd';
}

function applyUnitLabels(closedAll, used) {
  const L = unit === 'r'
    ? { total: 'Total R', avg: 'Ø R pro Trade', equity: 'Equity-Kurve (kumulierte R)', week: 'R pro Woche', avgcol: 'Ø R', totcol: 'Total R' }
    : { total: 'Ergebnis', avg: 'Ø pro Trade', equity: 'Equity-Kurve (Betrag)', week: 'Ergebnis pro Woche', avgcol: 'Ø', totcol: 'Summe' };
  document.querySelectorAll('[data-l]').forEach(el => { if (L[el.dataset.l]) el.textContent = L[el.dataset.l]; });
  const missing = closedAll.length - used.length;
  let note = '';
  if (unit === 'r' && missing > 0) note = `${missing} Trade${missing === 1 ? '' : 's'} ohne R-Wert nicht enthalten`;
  else if (unitChoice === 'auto' && unit === 'usd' && closedAll.length) note = 'Betrag, weil die meisten Trades keinen R-Wert haben';
  $('unitNote').textContent = note;
}

function getFilteredTrades() {
  let base = allTrades;
  const accId = getSelectedAccountId();
  if (accId !== 'all') base = base.filter(t => t.account_id === accId);
  if (currentRange === 'all') return base;
  const days = parseInt(currentRange, 10);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return base.filter(t => new Date(t.entry_date).getTime() >= cutoff);
}

function render() {
  const trades = getFilteredTrades();
  const closedAll = trades.filter(t => t.status === 'closed');
  unit = chooseUnit(closedAll);
  const closed = unit === 'r' ? closedAll.filter(hasR) : closedAll;
  applyUnitLabels(closedAll, closed);

  renderKPIs(closed);
  renderEquityCurve(closed);
  renderWeeklyChart(closed);
  renderConsistency(trades);
  renderBreakdown('pairTable', closed, t => t.pair);
  renderBreakdown('setupTable', closed, t => t.setup_type || '—');
  renderBreakdown('sessionTable', closed, t => t.session || '—');
  renderMistakes(trades);
  renderOverallBalance();
  renderTaxWidget();
  renderLevelPanel();
  renderDrawdownTracker();
  renderChallengeProgress();
}

// ---------- Steuerjahr Mini-Widget ----------
function renderTaxWidget() {
  const year = new Date().getFullYear();
  $('taxYearLabel').textContent = year;
  const start = new Date(year, 0, 1), end = new Date(year + 1, 0, 1);

  const income = allPayouts
    .filter(p => { const d = new Date(p.payout_date + 'T00:00:00'); return d >= start && d < end; })
    .reduce((s, p) => s + Number(p.amount_eur), 0);
  const expenses = allExpenses
    .filter(e => { const d = new Date(e.expense_date + 'T00:00:00'); return d >= start && d < end; })
    .reduce((s, e) => s + Number(e.amount), 0);
  const result = income - expenses;

  $('taxIncome').textContent = `+${income.toFixed(2)} €`;
  $('taxExpenses').textContent = `-${expenses.toFixed(2)} €`;
  $('taxResult').textContent = `${result >= 0 ? '+' : ''}${result.toFixed(2)} €`;
  $('taxResult').className = `kpi-value ${result >= 0 ? 'pos' : 'neg'}`;
}

// ---------- Drawdown-Tracker (Propfirm-Limits) ----------
function getRelevantAccounts() {
  const accId = getSelectedAccountId();
  const accounts = getAccounts();
  return accId === 'all' ? accounts : accounts.filter(a => a.id === accId);
}

function renderDrawdownTracker() {
  const section = $('drawdownSection');
  const container = $('drawdownCards');
  const accounts = getRelevantAccounts().filter(a => a.daily_loss_limit_pct || a.max_drawdown_pct);

  if (accounts.length === 0) { section.style.display = 'none'; return; }
  section.style.display = 'block';
  container.innerHTML = '';

  accounts.forEach(acc => {
    const accTrades = allTrades
      .filter(t => t.account_id === acc.id && t.status === 'closed')
      .sort((a, b) => new Date(a.entry_date) - new Date(b.entry_date));

    const { ddPct: drawdownPct, label: ddLabel } = drawdownOf(acc, accTrades);

    // Today's P/L (Tag des Schließens zählt, wie bei den Prop-Firmen)
    const todayStr = new Date().toISOString().slice(0, 10);
    const todayPL = accTrades
      .filter(t => (t.exit_date || t.entry_date).slice(0, 10) === todayStr)
      .reduce((s, t) => s + (Number(t.profit_amount) || 0), 0);
    const todayLossPct = todayPL < 0 ? (Math.abs(todayPL) / Number(acc.starting_balance)) * 100 : 0;

    const card = document.createElement('div');
    card.className = 'risk-card';

    let metricsHtml = '';

    if (acc.daily_loss_limit_pct) {
      const usedPct = Math.min((todayLossPct / acc.daily_loss_limit_pct) * 100, 100);
      const level = usedPct >= 90 ? 'danger' : usedPct >= 60 ? 'warn' : 'ok';
      metricsHtml += `
        <div class="risk-metric">
          <div class="risk-metric-top"><span>Daily Loss heute</span><span class="val">${todayLossPct.toFixed(2)}% / ${acc.daily_loss_limit_pct}%</span></div>
          <div class="risk-bar"><div class="risk-bar-fill ${level}" style="width:${usedPct}%"></div></div>
        </div>
      `;
    }

    if (acc.max_drawdown_pct) {
      const usedPct = Math.min((drawdownPct / acc.max_drawdown_pct) * 100, 100);
      const level = usedPct >= 90 ? 'danger' : usedPct >= 60 ? 'warn' : 'ok';
      metricsHtml += `
        <div class="risk-metric">
          <div class="risk-metric-top"><span>${ddLabel}</span><span class="val">${drawdownPct.toFixed(2)}% / ${acc.max_drawdown_pct}%</span></div>
          <div class="risk-bar"><div class="risk-bar-fill ${level}" style="width:${usedPct}%"></div></div>
        </div>
      `;
    }

    const overallLevel = Math.max(
      acc.daily_loss_limit_pct ? todayLossPct / acc.daily_loss_limit_pct : 0,
      acc.max_drawdown_pct ? drawdownPct / acc.max_drawdown_pct : 0
    );
    const statusClass = overallLevel >= 0.9 ? 'danger' : overallLevel >= 0.6 ? 'warn' : 'ok';
    const statusLabel = overallLevel >= 0.9 ? 'Kritisch' : overallLevel >= 0.6 ? 'Beobachten' : 'OK';

    card.innerHTML = `
      <div class="risk-card-header">
        <div class="risk-card-title"><span class="acc-dot-inline" style="background:${acc.color}"></span>${escapeHtml(acc.name)}</div>
        <span class="risk-card-status ${statusClass}">${statusLabel}</span>
      </div>
      ${metricsHtml}
    `;
    container.appendChild(card);
  });
}

// ---------- Challenge-Fortschritt ----------
function renderChallengeProgress() {
  const section = $('challengeSection');
  const container = $('challengeCards');
  const accounts = getRelevantAccounts().filter(a =>
    (a.account_type === 'challenge' || a.account_type === 'verification') && a.profit_target_pct
  );

  if (accounts.length === 0) { section.style.display = 'none'; return; }
  section.style.display = 'block';
  container.innerHTML = '';

  accounts.forEach(acc => {
    const accTrades = allTrades.filter(t => t.account_id === acc.id && t.status === 'closed');
    const totalProfit = accTrades.reduce((s, t) => s + (Number(t.profit_amount) || 0), 0);
    const target = Number(acc.starting_balance) * (acc.profit_target_pct / 100);
    const progressPct = target > 0 ? Math.max(0, Math.min((totalProfit / target) * 100, 100)) : 0;

    const card = document.createElement('div');
    card.className = 'risk-card';
    card.innerHTML = `
      <div class="risk-card-header">
        <div class="risk-card-title"><span class="acc-dot-inline" style="background:${acc.color}"></span>${escapeHtml(acc.name)}</div>
        <span class="risk-card-status ${progressPct >= 100 ? 'ok' : 'warn'}">${accountTypeLabelLocal(acc.account_type)}</span>
      </div>
      <div class="challenge-progress-label">
        <span>${money(totalProfit)} ${acc.currency} von ${money(target)} ${acc.currency} Ziel</span>
        <span style="font-family:var(--font-mono); font-weight:600;">${progressPct.toFixed(0)}%</span>
      </div>
      <div class="challenge-bar"><div class="challenge-bar-fill" style="width:${progressPct}%"></div></div>
    `;
    container.appendChild(card);
  });
}

function accountTypeLabelLocal(type) {
  return { challenge: 'Challenge', verification: 'Verification' }[type] || type;
}

// ---------- Gesamtbilanz (nur bei "Alle Accounts") ----------
function renderOverallBalance() {
  const section = document.getElementById('overallBalanceSection');
  const isAll = getSelectedAccountId() === 'all';
  section.style.display = isAll ? 'block' : 'none';
  if (!isAll) return;

  const accounts = getAccounts();
  const tbody = document.querySelector('#overallBalanceTable tbody');
  tbody.innerHTML = '';

  let grandActive = 0, grandProfit = 0, grandR = 0, grandPayouts = 0;

  const rows = [...accounts].sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1)).map(acc => {
    const accTrades = allTrades.filter(t => t.account_id === acc.id);
    const closed = accTrades.filter(t => t.status === 'closed');
    const totalR = closed.filter(hasR).reduce((s, t) => s + Number(t.r_multiple), 0);
    const totalProfit = accTrades.reduce((s, t) => s + (Number(t.profit_amount) || 0), 0);
    const totalPayouts = allPayouts.filter(p => p.account_id === acc.id).reduce((s, p) => s + Number(p.amount_eur), 0);
    // Gewinner nach Betrag, wenn vorhanden, sonst nach R
    const wins = closed.filter(t => (t.profit_amount !== null && t.profit_amount !== undefined ? Number(t.profit_amount) : Number(t.r_multiple)) > 0).length;
    const winrate = closed.length ? Math.round((wins / closed.length) * 100) : null;
    const currentBalance = Number(acc.starting_balance) + totalProfit;

    // Beendete Challenges zählen nicht zum Kontostand, sonst steht dort Geld, das es nicht gibt
    if (acc.status === 'active') grandActive += currentBalance;
    grandProfit += totalProfit;
    grandR += totalR;
    grandPayouts += totalPayouts;

    return { acc, totalR, withR: closed.some(hasR), totalProfit, totalPayouts, winrate, currentBalance, count: closed.length };
  });

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="font-family:var(--font-body); color:var(--text-faint); text-align:center; padding:20px 0;">Noch keine Konten angelegt</td></tr>`;
  }

  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="acc-dot-inline" style="background:${r.acc.color}"></span>${escapeHtml(r.acc.name)}${r.acc.status !== 'active' ? ` <span class="acc-state">${({ passed: 'bestanden', breached: 'verloren', closed: 'geschlossen' })[r.acc.status] || escapeHtml(r.acc.status)}</span>` : ''}</td>
      <td>${r.count}</td>
      <td>${r.winrate !== null ? r.winrate + '%' : '–'}</td>
      <td class="${r.withR ? (r.totalR >= 0 ? 'pos' : 'neg') : ''}">${r.withR ? `${r.totalR >= 0 ? '+' : ''}${r.totalR.toFixed(2)}R` : '–'}</td>
      <td class="${r.totalProfit >= 0 ? 'pos' : 'neg'}">${r.totalProfit >= 0 ? '+' : ''}${money(r.totalProfit)} ${r.acc.currency}</td>
      <td class="${r.totalPayouts ? 'pos' : ''}">${money(r.totalPayouts)} €</td>
      <td>${money(r.currentBalance)} ${r.acc.currency}</td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('grandTotalR').textContent = `${grandR >= 0 ? '+' : ''}${grandR.toFixed(2)}R`;
  document.getElementById('grandTotalR').className = `kpi-value ${grandR >= 0 ? 'pos' : 'neg'}`;
  document.getElementById('grandTotalProfit').textContent = `${grandProfit >= 0 ? '+' : ''}${money(grandProfit)}`;
  document.getElementById('grandTotalProfit').className = `kpi-value ${grandProfit >= 0 ? 'pos' : 'neg'}`;
  document.getElementById('grandTotalPayouts').textContent = `${money(grandPayouts)} €`;
  document.getElementById('grandTotalBalance').textContent = money(grandActive);
}

// ---------- KPIs ----------
function renderKPIs(closed) {
  if (closed.length === 0) {
    ['kpiTotalR', 'kpiWinrate', 'kpiPF', 'kpiAvgR', 'kpiBest', 'kpiWorst'].forEach(id => $(id).textContent = '–');
    return;
  }
  const rValues = closed.map(val);
  const totalR = rValues.reduce((a, b) => a + b, 0);
  const wins = rValues.filter(r => r > 0);
  const losses = rValues.filter(r => r < 0);
  const winrate = Math.round((wins.length / closed.length) * 100);
  const grossWin = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));
  const pf = grossLoss === 0 ? (grossWin > 0 ? '∞' : '–') : (grossWin / grossLoss).toFixed(2);
  const avgR = totalR / closed.length;
  const best = Math.max(...rValues);
  const worst = Math.min(...rValues);

  $('kpiTotalR').textContent = fmt(totalR);
  $('kpiTotalR').className = `kpi-value ${totalR >= 0 ? 'pos' : 'neg'}`;
  $('kpiWinrate').textContent = `${winrate}%`;
  $('kpiPF').textContent = pf;
  $('kpiAvgR').textContent = fmt(avgR);
  $('kpiAvgR').className = `kpi-value ${avgR >= 0 ? 'pos' : 'neg'}`;
  $('kpiBest').textContent = fmt(best);
  $('kpiWorst').textContent = fmt(worst);
}

// ---------- Equity curve (pure SVG, no external library) ----------
function renderEquityCurve(closed) {
  const wrap = $('equityChartWrap');
  const sorted = [...closed].sort((a, b) => new Date(a.entry_date) - new Date(b.entry_date));

  if (sorted.length === 0) {
    wrap.innerHTML = `<div class="dash-empty">Noch keine geschlossenen Trades im Zeitraum</div>`;
    return;
  }

  let cum = 0;
  const points = sorted.map(t => {
    cum += val(t);
    return { date: new Date(t.entry_date), y: Math.round(cum * 100) / 100 };
  });

  // Echte Pixelgröße statt Verzerren: Schrift bleibt auf dem Handy lesbar
  const W = Math.max(wrap.clientWidth, 280), H = wrap.clientHeight || 260, padL = 46, padR = 12, padT = 12, padB = 24;
  const innerW = W - padL - padR, innerH = H - padT - padB;

  const yMin = Math.min(0, ...points.map(p => p.y));
  const yMax = Math.max(0, ...points.map(p => p.y));
  const yRange = (yMax - yMin) || 1;
  const yPad = yRange * 0.1;
  const yLo = yMin - yPad, yHi = yMax + yPad;

  const xFor = (i) => padL + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const yFor = (v) => padT + innerH - ((v - yLo) / (yHi - yLo)) * innerH;

  const lineColor = points[points.length - 1].y >= 0 ? 'var(--profit)' : 'var(--loss)';
  const zeroY = yFor(0);

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(1)} ${yFor(p.y).toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${xFor(points.length - 1).toFixed(1)} ${zeroY.toFixed(1)} L ${xFor(0).toFixed(1)} ${zeroY.toFixed(1)} Z`;

  // Gridlines (5 horizontal)
  const gridLines = [];
  for (let i = 0; i <= 4; i++) {
    const v = yLo + (yHi - yLo) * (i / 4);
    const y = yFor(v);
    gridLines.push(`<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" style="stroke:var(--border-soft)" stroke-width="1" />`);
    gridLines.push(`<text x="${padL - 8}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="10" font-family="JetBrains Mono, monospace" style="fill:var(--text-faint)">${axis(v)}</text>`);
  }

  // X-axis labels (first, middle, last date)
  const xLabelIdxs = points.length > 1 ? [0, Math.floor((points.length - 1) / 2), points.length - 1] : [0];
  const xLabels = [...new Set(xLabelIdxs)].map(i => {
    const label = points[i].date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
    return `<text x="${xFor(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="10" font-family="JetBrains Mono, monospace" style="fill:var(--text-faint)">${label}</text>`;
  }).join('');

  wrap.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" style="overflow:visible;display:block">
      ${gridLines.join('')}
      <line x1="${padL}" y1="${zeroY.toFixed(1)}" x2="${W - padR}" y2="${zeroY.toFixed(1)}" style="stroke:var(--border)" stroke-width="1" stroke-dasharray="3,3" />
      <path d="${areaPath}" style="fill:${lineColor}" fill-opacity="0.12" stroke="none" />
      <path d="${linePath}" fill="none" style="stroke:${lineColor}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
      ${xLabels}
    </svg>
  `;
}

// ---------- Weekly R (pure SVG bar chart) ----------
function renderWeeklyChart(closed) {
  const wrap = $('weeklyChartWrap');
  const weekMap = {};
  closed.forEach(t => {
    const d = new Date(t.entry_date);
    const weekKey = isoWeekKey(d);
    weekMap[weekKey] = (weekMap[weekKey] || 0) + val(t);
  });
  const labels = Object.keys(weekMap).sort();
  const values = labels.map(l => Math.round(weekMap[l] * 100) / 100);

  if (labels.length === 0) {
    wrap.innerHTML = `<div class="dash-empty">Keine Daten im Zeitraum</div>`;
    return;
  }

  const W = Math.max(wrap.clientWidth, 280), H = wrap.clientHeight || 200, padL = 12, padR = 12, padT = 10, padB = 20;
  const innerW = W - padL - padR, innerH = H - padT - padB;

  const yMin = Math.min(0, ...values);
  const yMax = Math.max(0, ...values);
  const yRange = (yMax - yMin) || 1;
  const yPad = yRange * 0.15;
  const yLo = yMin - yPad, yHi = yMax + yPad;
  const yFor = (v) => padT + innerH - ((v - yLo) / (yHi - yLo)) * innerH;
  const zeroY = yFor(0);

  const barSlot = innerW / values.length;
  const barWidth = Math.min(barSlot * 0.6, 32);

  const bars = values.map((v, i) => {
    const x = padL + i * barSlot + (barSlot - barWidth) / 2;
    const y = v >= 0 ? yFor(v) : zeroY;
    const h = Math.abs(yFor(v) - zeroY);
    const color = v >= 0 ? 'var(--profit)' : 'var(--loss)';
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(h, 1).toFixed(1)}" style="fill:${color}" rx="2" />`;
  }).join('');

  // Höchstens ~10 Beschriftungen, sonst überlappen sie
  const every = Math.ceil(labels.length / Math.max(3, Math.floor(innerW / 60)));
  const xLabels = labels.map((l, i) => {
    if (i % every && i !== labels.length - 1) return '';
    const x = padL + i * barSlot + barSlot / 2;
    return `<text x="${x.toFixed(1)}" y="${H - 4}" text-anchor="middle" font-size="9.5" font-family="Inter, sans-serif" style="fill:var(--text-faint)">${l.slice(5)}</text>`;
  }).join('');
  const tips = labels.map((l, i) => {
    const x = padL + i * barSlot;
    return `<rect x="${x.toFixed(1)}" y="${padT}" width="${barSlot.toFixed(1)}" height="${innerH}" fill="transparent"><title>${l.replace('-', ' ')}: ${fmt(values[i])}</title></rect>`;
  }).join('');

  wrap.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" style="overflow:visible;display:block">
      <line x1="${padL}" y1="${zeroY.toFixed(1)}" x2="${W - padR}" y2="${zeroY.toFixed(1)}" style="stroke:var(--border)" stroke-width="1" />
      ${bars}
      ${xLabels}
      ${tips}
    </svg>
  `;
}

function isoWeekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-KW${String(weekNo).padStart(2, '0')}`;
}

// ---------- Consistency check ----------
function renderConsistency(trades) {
  const container = $('consistencyList');
  container.innerHTML = '';

  if (trades.length === 0) {
    container.innerHTML = '<div class="dash-empty">Keine Trades im gewählten Zeitraum</div>';
    return;
  }

  // Nur echte Angaben: Import-Notizen und das beim Import gesetzte Standard-Risiko zählen nicht
  const closed = trades.filter(t => t.status === 'closed');
  const base = closed.length ? closed : trades;
  const withRisk = base.filter(hasOwnRisk);
  const pct = (n, d) => d ? Math.round((n / d) * 100) : 0;

  const items = [
    { label: `Risiko wie geplant (Ziel ${riskTarget.toLocaleString('de-DE')} % ± 0,1)`, pct: pct(withRisk.filter(t => riskOnTarget(t, riskTarget)).length, withRisk.length), none: !withRisk.length },
    { label: 'Stop und Ziel vorab eingetragen', pct: pct(base.filter(isPlanned).length, base.length) },
    { label: 'Trades mit eigener Notiz', pct: pct(base.filter(isDocumented).length, base.length) },
  ];

  items.forEach(item => {
    const good = item.pct >= 80;
    const div = document.createElement('div');
    div.className = 'consistency-item';
    div.innerHTML = `
      <div class="consistency-top">
        <span class="consistency-label">${item.label}</span>
        <span class="consistency-value ${item.none ? '' : good ? 'good' : 'warn'}">${item.none ? 'keine eigenen Angaben' : item.pct + ' %'}</span>
      </div>
      <div class="consistency-bar"><div class="consistency-bar-fill ${good ? '' : 'warn'}" style="width:${item.pct}%"></div></div>
    `;
    container.appendChild(div);
  });
}

// ---------- Breakdown tables ----------
function renderBreakdown(tableId, closed, keyFn) {
  const tbody = document.querySelector(`#${tableId} tbody`);
  tbody.innerHTML = '';

  const groups = {};
  closed.forEach(t => {
    const key = keyFn(t);
    if (!groups[key]) groups[key] = [];
    groups[key].push(val(t));
  });

  const rows = Object.entries(groups).map(([key, rValues]) => {
    const count = rValues.length;
    const wins = rValues.filter(r => r > 0).length;
    const winrate = Math.round((wins / count) * 100);
    const total = rValues.reduce((a, b) => a + b, 0);
    const avg = total / count;
    return { key, count, winrate, avg, total };
  }).sort((a, b) => b.total - a.total);

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="font-family:var(--font-body); color:var(--text-faint); text-align:center; padding:20px 0;">Keine Daten</td></tr>`;
    return;
  }

  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(r.key)}</td>
      <td>${r.count}</td>
      <td>${r.winrate}%</td>
      <td class="${r.avg >= 0 ? 'pos' : 'neg'}">${fmt(r.avg)}</td>
      <td class="${r.total >= 0 ? 'pos' : 'neg'}">${fmt(r.total)}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ---------- Mistake tags ----------
function renderMistakes(trades) {
  const container = $('mistakeList');
  container.innerHTML = '';

  const counts = {};
  trades.forEach(t => {
    if (t.mistake_tag && t.mistake_tag.trim()) {
      const tag = t.mistake_tag.trim();
      counts[tag] = (counts[tag] || 0) + 1;
    }
  });

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6);

  if (sorted.length === 0) {
    container.innerHTML = '<div class="dash-empty">Keine Fehler-Tags erfasst — gutes Zeichen, oder noch nicht dokumentiert.</div>';
    return;
  }

  sorted.forEach(([tag, count]) => {
    const row = document.createElement('div');
    row.className = 'mistake-row';
    row.innerHTML = `<span class="mistake-tag">${escapeHtml(tag)}</span><span class="mistake-count">${count}×</span>`;
    container.appendChild(row);
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Trader-Level — Kurzübersicht (Rechnung in level-core.js) ----------
function renderLevelPanel() {
  const L = computeLevel({
    closed: allTrades.filter(t => t.status === 'closed'),
    payouts: allPayouts.length,
    noteDates: allPlanDates,
    ideas: allIdeas.length,
    fromIdea: allIdeas.filter(i => i.trade_id).length,
    riskTarget,
  });
  $('levelBadgeCircle').textContent = L.level;
  $('levelTierBadge').textContent = L.tier + '-Trader';
  $('levelXpLabel').textContent = `${L.xpIntoLevel} / ${XP_PER_LEVEL} XP`;
  $('levelBarFill').style.width = `${L.progressPct}%`;
}

// Diagramme an neue Breite anpassen (Drehen, Fenstergröße)
let resizeTimer, lastWidth = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const w = $('equityChartWrap').clientWidth;
    if (w !== lastWidth) { lastWidth = w; render(); }
  }, 150);
});

init();
