import { supabase } from './accounts.js';
import { toast, toastError } from './nav.js';
import { computeMentoring, BLOCK_SIZE, fmtR, fmtPct, fmtPctPlain } from './mentoring-core.js';

// Mentoring-Seite: Fortschritt im 100-Trade-Block, Ziele, Tilt-Regeln, Monatskennzahlen.
// Einzige eigene Angabe: Startdatum des Blocks (user_settings.mentor_block_start).

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const KEY = 'mentor_block_start';
const todayIso = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const dmy = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('de-DE');

let input = null;

async function init() {
  const [tr, acc, pay, rs, bs] = await Promise.all([
    supabase.from('trades').select('*').eq('status', 'closed'),
    supabase.from('accounts').select('id, starting_balance'),
    supabase.from('payouts').select('payout_date, amount_eur'),
    supabase.from('user_settings').select('value').eq('key', 'default_risk_pct').maybeSingle(),
    supabase.from('user_settings').select('value').eq('key', KEY).maybeSingle(),
  ]);
  const failed = [tr, acc, pay].find(r => r.error);
  if (failed) toastError('Daten unvollständig geladen', failed.error);
  input = {
    closed: tr.data || [],
    accounts: acc.data || [],
    payouts: pay.data || [],
    defaultRisk: Number(rs.data?.value) > 0 ? Number(rs.data.value) : 0.8,
    blockStart: typeof bs.data?.value === 'string' ? bs.data.value : null,
  };
  render();
}

function render() {
  const M = computeMentoring(input);

  // Tilt
  const stop = M.tilt.some(t => t.stop);
  $('tiltVerdict').textContent = stop ? 'Nein – Stop-Regel greift' : 'Ja, nach Playbook';
  $('tiltVerdict').className = `mt-verdict ${stop ? 'neg' : 'pos'}`;
  $('tiltPanel').classList.toggle('mt-stop', stop);
  $('tiltList').innerHTML = M.tilt.map(t => `
    <div class="xp-source-row">
      <span class="label">${esc(t.rule)}<span class="count">${esc(t.value)}</span></span>
      <span class="value ${t.stop ? 'neg' : 'pos'}">${t.stop ? 'Stopp' : 'ok'}</span>
    </div>`).join('');

  // Block
  const B = M.blockStats;
  if (!M.blockStart) {
    $('blockBadge').textContent = 'nicht gestartet';
    $('blockBody').innerHTML = `<div class="mt-start">
      <label>Start des Blocks <input type="date" id="blockDate" value="${todayIso()}"></label>
      <button class="btn-primary" id="blockStartBtn" type="button">Block starten</button></div>`;
  } else {
    const n = Math.min(B.n, BLOCK_SIZE);
    const done = B.n >= BLOCK_SIZE;
    $('blockBadge').textContent = done ? 'Block abgeschlossen' : `Trade ${n} / ${BLOCK_SIZE}`;
    $('blockBody').innerHTML = `
      <div class="level-progress-wrap">
        <div class="level-progress-label"><span>seit ${dmy(M.blockStart)}</span><span>${done ? 'Zeit für die Auswertung (Phase 3)' : `noch ${BLOCK_SIZE - n} Trades`}</span></div>
        <div class="level-bar" role="progressbar" aria-label="Fortschritt im 100-Trade-Block" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${n}"><div class="level-bar-fill" style="width:${n}%"></div></div>
      </div>
      <div class="level-stats-row">
        <div class="level-stat"><span class="kpi-label">Erwartungswert</span><span class="kpi-value ${B.expectancy > 0 ? 'pos' : B.expectancy < 0 ? 'neg' : ''}">${fmtR(B.expectancy)}</span></div>
        <div class="level-stat"><span class="kpi-label">Win-Rate</span><span class="kpi-value">${fmtPctPlain(B.winrate)}</span></div>
        <div class="level-stat"><span class="kpi-label">Regeltreue</span><span class="kpi-value">${fmtPctPlain(B.ruleRate)}</span></div>
        <div class="level-stat"><span class="kpi-label">Ohne Score</span><span class="kpi-value ${B.n - B.scored ? 'neg' : ''}">${B.n - B.scored}</span></div>
        <div class="level-stat"><span class="kpi-label">Max. Drawdown</span><span class="kpi-value">≈ ${B.maxDd.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %</span></div>
      </div>
      <div class="mt-block-actions">
        <a class="btn-ghost sm" href="index.html">Journal: Scores ergänzen</a>
        <button class="btn-ghost sm" id="blockResetBtn" type="button">${done ? 'Neuen Block starten' : 'Startdatum ändern'}</button>
      </div>`;
  }

  // Ziele
  $('goalCount').textContent = `${M.goals.filter(g => g.ok).length} von ${M.goals.length} erreicht`;
  $('goalList').innerHTML = M.goals.map(g => `
    <div class="mt-goal${g.ok ? ' ok' : ''}">
      <span class="kpi-label">${esc(g.label)}</span>
      <span class="kpi-value">${esc(g.text)}</span>
      <span class="mt-goal-sub">Ziel ${esc(g.target)} · ${esc(g.sub)}</span>
    </div>`).join('');
  const approx = M.monthRows.reduce((s, m) => s + m.approx, 0);
  $('approxHint').hidden = !approx;
  $('approxHint').textContent = `≈ ${approx} Trades der letzten 12 Monate haben keinen Stop im Journal (meist Importe). Ihr R ist aus Gewinn ÷ (Startkapital × Risiko) geschätzt. Mit eingetragenem SL wird es exakt.`;

  // Monate
  const head = '<thead><tr><th>Monat</th><th>Trades</th><th>Win-Rate</th><th>Ø R</th><th>Summe</th><th>Max. DD</th><th>Regeltreue</th><th>Payouts</th></tr></thead>';
  const rows = M.monthRows.map(m => `<tr${m.n ? '' : ' class="empty"'}>
    <td>${esc(m.label)}</td><td>${m.n}</td><td>${fmtPctPlain(m.winrate)}</td>
    <td class="${m.expectancy > 0 ? 'pos' : m.expectancy < 0 ? 'neg' : ''}">${fmtR(m.expectancy)}</td>
    <td class="${m.sumPct > 0 ? 'pos' : m.sumPct < 0 ? 'neg' : ''}">${m.n ? fmtPct(m.sumPct) : '–'}</td>
    <td>${m.n ? `${m.maxDd.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %` : '–'}</td>
    <td>${m.scored ? fmtPctPlain(m.ruleRate) : '–'}</td>
    <td>${m.payouts ? `${m.payouts} · ${m.payoutEur.toLocaleString('de-DE', { maximumFractionDigits: 0 })} €` : '–'}</td></tr>`).join('');
  $('monthTable').innerHTML = head + `<tbody>${rows}</tbody>`;
}

async function saveStart(value) {
  const { error } = await supabase.from('user_settings').upsert({ key: KEY, value, updated_at: new Date().toISOString() });
  if (error) { toastError('Nicht gespeichert', error); return; }
  input.blockStart = value;
  render();
  toast(value ? 'Block gestartet – viel Disziplin!' : 'Block zurückgesetzt');
}

document.addEventListener('click', (e) => {
  if (e.target.id === 'blockStartBtn') saveStart($('blockDate').value || todayIso());
  if (e.target.id === 'blockResetBtn') { input.blockStart = null; render(); }
});

init();
