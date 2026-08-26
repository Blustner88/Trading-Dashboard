import { supabase, initAccountSwitcher, getSelectedAccountId, getAccounts, getAccountById } from './accounts.js';

const $ = (id) => document.getElementById(id);

let allTrades = [];
let currentRange = '30';

async function init() {
  await initAccountSwitcher();
  bindRangePicker();
  window.addEventListener('account-changed', render);
  await loadTrades();
}

function bindRangePicker() {
  document.querySelectorAll('#rangePicker .chip').forEach(btn => {
    btn.onclick = () => {
      currentRange = btn.dataset.range;
      document.querySelectorAll('#rangePicker .chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      render();
    };
  });
}

async function loadTrades() {
  const { data, error } = await supabase
    .from('trades')
    .select('*')
    .order('entry_date', { ascending: true });

  if (error) {
    console.error(error);
    return;
  }
  allTrades = data || [];
  render();
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
  const closed = trades.filter(t => t.status === 'closed' && t.r_multiple !== null && t.r_multiple !== undefined);

  renderKPIs(closed);
  renderEquityCurve(closed);
  renderWeeklyChart(closed);
  renderConsistency(trades);
  renderBreakdown('pairTable', closed, t => t.pair);
  renderBreakdown('setupTable', closed, t => t.setup_type || '—');
  renderBreakdown('sessionTable', closed, t => t.session || '—');
  renderMistakes(trades);
  renderOverallBalance();
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

  let grandStart = 0, grandProfit = 0, grandR = 0;

  const rows = accounts.map(acc => {
    const accTrades = allTrades.filter(t => t.account_id === acc.id);
    const closed = accTrades.filter(t => t.status === 'closed' && t.r_multiple !== null && t.r_multiple !== undefined);
    const totalR = closed.reduce((s, t) => s + Number(t.r_multiple), 0);
    const totalProfit = accTrades.reduce((s, t) => s + (Number(t.profit_amount) || 0), 0);
    const wins = closed.filter(t => t.r_multiple > 0).length;
    const winrate = closed.length ? Math.round((wins / closed.length) * 100) : null;
    const currentBalance = Number(acc.starting_balance) + totalProfit;

    grandStart += Number(acc.starting_balance);
    grandProfit += totalProfit;
    grandR += totalR;

    return { acc, totalR, totalProfit, winrate, currentBalance, count: closed.length };
  });

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="font-family:var(--font-body); color:var(--text-faint); text-align:center; padding:20px 0;">Noch keine Konten angelegt</td></tr>`;
  }

  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="acc-dot-inline" style="background:${r.acc.color}"></span>${escapeHtml(r.acc.name)}</td>
      <td>${r.count}</td>
      <td>${r.winrate !== null ? r.winrate + '%' : '–'}</td>
      <td class="${r.totalR >= 0 ? 'pos' : 'neg'}">${r.totalR >= 0 ? '+' : ''}${r.totalR.toFixed(2)}R</td>
      <td class="${r.totalProfit >= 0 ? 'pos' : 'neg'}">${r.totalProfit >= 0 ? '+' : ''}${r.totalProfit.toFixed(2)} ${r.acc.currency}</td>
      <td>${r.currentBalance.toFixed(2)} ${r.acc.currency}</td>
    `;
    tbody.appendChild(tr);
  });

  document.getElementById('grandTotalR').textContent = `${grandR >= 0 ? '+' : ''}${grandR.toFixed(2)}R`;
  document.getElementById('grandTotalR').className = `kpi-value ${grandR >= 0 ? 'pos' : 'neg'}`;
  document.getElementById('grandTotalProfit').textContent = `${grandProfit >= 0 ? '+' : ''}${grandProfit.toFixed(2)}`;
  document.getElementById('grandTotalProfit').className = `kpi-value ${grandProfit >= 0 ? 'pos' : 'neg'}`;
  document.getElementById('grandTotalBalance').textContent = (grandStart + grandProfit).toFixed(2);
}

// ---------- KPIs ----------
function renderKPIs(closed) {
  if (closed.length === 0) {
    ['kpiTotalR', 'kpiWinrate', 'kpiPF', 'kpiAvgR', 'kpiBest', 'kpiWorst'].forEach(id => $(id).textContent = '–');
    return;
  }
  const rValues = closed.map(t => Number(t.r_multiple));
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

  $('kpiTotalR').textContent = `${totalR >= 0 ? '+' : ''}${totalR.toFixed(2)}R`;
  $('kpiTotalR').className = `kpi-value ${totalR >= 0 ? 'pos' : 'neg'}`;
  $('kpiWinrate').textContent = `${winrate}%`;
  $('kpiPF').textContent = pf;
  $('kpiAvgR').textContent = `${avgR >= 0 ? '+' : ''}${avgR.toFixed(2)}R`;
  $('kpiAvgR').className = `kpi-value ${avgR >= 0 ? 'pos' : 'neg'}`;
  $('kpiBest').textContent = `+${best.toFixed(2)}R`;
  $('kpiWorst').textContent = `${worst.toFixed(2)}R`;
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
    cum += Number(t.r_multiple);
    return { date: new Date(t.entry_date), y: Math.round(cum * 100) / 100 };
  });

  const W = 900, H = 260, padL = 46, padR = 16, padT = 16, padB = 28;
  const innerW = W - padL - padR, innerH = H - padT - padB;

  const yMin = Math.min(0, ...points.map(p => p.y));
  const yMax = Math.max(0, ...points.map(p => p.y));
  const yRange = (yMax - yMin) || 1;
  const yPad = yRange * 0.1;
  const yLo = yMin - yPad, yHi = yMax + yPad;

  const xFor = (i) => padL + (points.length === 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
  const yFor = (v) => padT + innerH - ((v - yLo) / (yHi - yLo)) * innerH;

  const lineColor = points[points.length - 1].y >= 0 ? '#22c55e' : '#f43f5e';
  const zeroY = yFor(0);

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(1)} ${yFor(p.y).toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${xFor(points.length - 1).toFixed(1)} ${zeroY.toFixed(1)} L ${xFor(0).toFixed(1)} ${zeroY.toFixed(1)} Z`;

  // Gridlines (5 horizontal)
  const gridLines = [];
  for (let i = 0; i <= 4; i++) {
    const v = yLo + (yHi - yLo) * (i / 4);
    const y = yFor(v);
    gridLines.push(`<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W - padR}" y2="${y.toFixed(1)}" stroke="#1d212b" stroke-width="1" />`);
    gridLines.push(`<text x="${padL - 8}" y="${(y + 3).toFixed(1)}" text-anchor="end" font-size="10" font-family="JetBrains Mono, monospace" fill="#565d70">${v.toFixed(1)}R</text>`);
  }

  // X-axis labels (first, middle, last date)
  const xLabelIdxs = points.length > 1 ? [0, Math.floor((points.length - 1) / 2), points.length - 1] : [0];
  const xLabels = [...new Set(xLabelIdxs)].map(i => {
    const label = points[i].date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
    return `<text x="${xFor(i).toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="10" font-family="JetBrains Mono, monospace" fill="#565d70">${label}</text>`;
  }).join('');

  wrap.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="none" style="overflow:visible;">
      ${gridLines.join('')}
      <line x1="${padL}" y1="${zeroY.toFixed(1)}" x2="${W - padR}" y2="${zeroY.toFixed(1)}" stroke="#262b38" stroke-width="1" stroke-dasharray="3,3" />
      <path d="${areaPath}" fill="${lineColor}" fill-opacity="0.12" stroke="none" />
      <path d="${linePath}" fill="none" stroke="${lineColor}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
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
    weekMap[weekKey] = (weekMap[weekKey] || 0) + Number(t.r_multiple);
  });
  const labels = Object.keys(weekMap).sort();
  const values = labels.map(l => Math.round(weekMap[l] * 100) / 100);

  if (labels.length === 0) {
    wrap.innerHTML = `<div class="dash-empty">Keine Daten im Zeitraum</div>`;
    return;
  }

  const W = 700, H = 200, padL = 40, padR = 12, padT = 10, padB = 20;
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
    const color = v >= 0 ? '#22c55e' : '#f43f5e';
    return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${Math.max(h, 1).toFixed(1)}" fill="${color}" rx="2" />`;
  }).join('');

  const xLabels = labels.map((l, i) => {
    const x = padL + i * barSlot + barSlot / 2;
    return `<text x="${x.toFixed(1)}" y="${H - 4}" text-anchor="middle" font-size="9.5" font-family="Inter, sans-serif" fill="#565d70">${l}</text>`;
  }).join('');

  wrap.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="none" style="overflow:visible;">
      <line x1="${padL}" y1="${zeroY.toFixed(1)}" x2="${W - padR}" y2="${zeroY.toFixed(1)}" stroke="#262b38" stroke-width="1" />
      ${bars}
      ${xLabels}
    </svg>
  `;
}

function isoWeekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `KW${String(weekNo).padStart(2, '0')}`;
}

// ---------- Consistency check ----------
function renderConsistency(trades) {
  const container = $('consistencyList');
  container.innerHTML = '';

  if (trades.length === 0) {
    container.innerHTML = '<div class="dash-empty">Keine Trades im gewählten Zeitraum</div>';
    return;
  }

  const withRisk = trades.filter(t => t.risk_percent !== null && t.risk_percent !== undefined);
  const onTarget = withRisk.filter(t => Math.abs(Number(t.risk_percent) - 0.8) <= 0.1);
  const riskPct = withRisk.length ? Math.round((onTarget.length / withRisk.length) * 100) : 0;

  const splitTP = trades.filter(t => t.tp1 !== null && t.tp2 !== null);
  const splitPct = Math.round((splitTP.length / trades.length) * 100);

  const withNotes = trades.filter(t => t.notes && t.notes.trim().length > 0);
  const notesPct = Math.round((withNotes.length / trades.length) * 100);

  const items = [
    { label: `Risk-Konsistenz (Ziel: 0.8%)`, pct: riskPct },
    { label: `Split-TP genutzt (TP1 + TP2)`, pct: splitPct },
    { label: `Trades mit Entry-Notiz dokumentiert`, pct: notesPct },
  ];

  items.forEach(item => {
    const good = item.pct >= 80;
    const div = document.createElement('div');
    div.className = 'consistency-item';
    div.innerHTML = `
      <div class="consistency-top">
        <span class="consistency-label">${item.label}</span>
        <span class="consistency-value ${good ? 'good' : 'warn'}">${item.pct}%</span>
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
    groups[key].push(Number(t.r_multiple));
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
      <td class="${r.avg >= 0 ? 'pos' : 'neg'}">${r.avg >= 0 ? '+' : ''}${r.avg.toFixed(2)}</td>
      <td class="${r.total >= 0 ? 'pos' : 'neg'}">${r.total >= 0 ? '+' : ''}${r.total.toFixed(2)}R</td>
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

init();
