import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://rabbtdooayruveribarq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_CsC9Ji0H9w_Xkbgoy1QtRg_RasuZtuX';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const $ = (id) => document.getElementById(id);

const COLORS = {
  indigo: '#6366f1',
  indigoBright: '#818cf8',
  profit: '#22c55e',
  loss: '#f43f5e',
  amber: '#f59e0b',
  grid: '#1d212b',
  textMuted: '#8b92a5',
  textFaint: '#565d70',
};

let allTrades = [];
let currentRange = '30';
let equityChart = null;
let weeklyChart = null;

async function init() {
  bindRangePicker();
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
  if (currentRange === 'all') return allTrades;
  const days = parseInt(currentRange, 10);
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return allTrades.filter(t => new Date(t.entry_date).getTime() >= cutoff);
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

// ---------- Equity curve ----------
function renderEquityCurve(closed) {
  const sorted = [...closed].sort((a, b) => new Date(a.entry_date) - new Date(b.entry_date));
  let cum = 0;
  const points = sorted.map(t => {
    cum += Number(t.r_multiple);
    return { x: new Date(t.entry_date), y: Math.round(cum * 100) / 100 };
  });

  const ctx = document.getElementById('equityChart');
  if (equityChart) equityChart.destroy();

  if (points.length === 0) {
    return;
  }

  const lineColor = points[points.length - 1].y >= 0 ? COLORS.profit : COLORS.loss;

  equityChart = new Chart(ctx, {
    type: 'line',
    data: {
      datasets: [{
        data: points,
        borderColor: lineColor,
        backgroundColor: lineColor + '22',
        fill: true,
        tension: 0.25,
        pointRadius: 0,
        pointHoverRadius: 4,
        borderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: {
          type: 'time',
          time: { unit: 'day' },
          grid: { color: COLORS.grid },
          ticks: { color: COLORS.textFaint, font: { family: 'JetBrains Mono', size: 10 } },
        },
        y: {
          grid: { color: COLORS.grid },
          ticks: { color: COLORS.textFaint, font: { family: 'JetBrains Mono', size: 10 }, callback: (v) => `${v}R` },
        }
      }
    }
  });
}

// ---------- Weekly R chart ----------
function renderWeeklyChart(closed) {
  const weekMap = {};
  closed.forEach(t => {
    const d = new Date(t.entry_date);
    const weekKey = isoWeekKey(d);
    weekMap[weekKey] = (weekMap[weekKey] || 0) + Number(t.r_multiple);
  });
  const labels = Object.keys(weekMap).sort();
  const values = labels.map(l => Math.round(weekMap[l] * 100) / 100);

  const ctx = document.getElementById('weeklyChart');
  if (weeklyChart) weeklyChart.destroy();

  if (labels.length === 0) return;

  weeklyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: values.map(v => v >= 0 ? COLORS.profit : COLORS.loss),
        borderRadius: 4,
        maxBarThickness: 28,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { color: COLORS.textFaint, font: { size: 10 } } },
        y: { grid: { color: COLORS.grid }, ticks: { color: COLORS.textFaint, font: { family: 'JetBrains Mono', size: 10 }, callback: (v) => `${v}R` } },
      }
    }
  });
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
