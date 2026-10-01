import { supabase } from './accounts.js';
import { initAgents, seedAgents, agentSquawk, agentProposal, seedProposals, runDemo } from './desk-agents.js';

// Desk: nur lesend. Vorschläge und Squawk schreibt der lokale Bot;
// entschieden wird per Telegram.

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hhmm = (ts) => ts ? new Date(ts).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '–';
const dayTime = (ts) => ts ? new Date(ts).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–';

const STATUS_LABEL = {
  taken: 'Genommen', dismissed: 'Verworfen', expired: 'Abgelaufen', blocked: 'Blockiert',
  pending: 'Offen', watching: 'Wartet', analysed: 'Neu',
};
const SOURCE_LABEL = { fundamental: 'Fundamental', technik: 'Technik', risk: 'Risk', boss: 'Boss', system: 'System' };

function dirTag(d) {
  return `<span class="dir ${d === 'short' ? 'short' : 'long'}">${d === 'short' ? '▼ SHORT' : '▲ LONG'}</span>`;
}

function minutesLeft(ts) {
  const m = Math.round((new Date(ts) - Date.now()) / 60000);
  return m > 0 ? `noch ${m} min` : 'läuft ab';
}

// Strategie-Regel: Trend ≥ 2R, Scale-In 1,5–2R, Pullback 1,5R — am TP komplett schließen.
const MIN_R = { 'Trend': 2, 'Scale-In': 1.5, 'Pullback': 1.5 };
const fmtR1 = (v) => v == null ? '–' : `${Number(v).toFixed(1).replace('.', ',')}R`;

function rewardR(p) {
  const e = Number(p.entry_price), sl = Number(p.stop_loss), tp = Number(p.take_profit);
  if (!isFinite(e) || !isFinite(sl) || !isFinite(tp) || e === sl) return null;
  return Math.abs(tp - e) / Math.abs(e - sl);
}

function renderPending(rows) {
  $('pendingList').innerHTML = rows.length ? rows.map(p => {
    const rr = rewardR(p);
    const minR = MIN_R[p.setup_type];
    const partial = p.tp1_lots != null && Number(p.tp1_lots) < Number(p.lots);
    const warn = [
      minR != null && rr != null && rr < minR - 0.05 ? `unter ${fmtR1(minR)} Minimum` : null,
      partial ? 'Bot plant Teilschluss' : null,
    ].filter(Boolean).join(' · ');
    const tpNote = warn ? `⚠ ${warn}` : 'komplett schließen';
    return `
    <div class="proposal ${p.direction === 'short' ? 'short' : 'long'}">
      <div class="proposal-head">
        <span><span class="proposal-pair">${esc(p.pair)}</span>${dirTag(p.direction)}${p.setup_type ? `<span class="setup-tag">${esc(p.setup_type)}</span>` : ''}</span>
        <span class="valid">bis ${hhmm(p.valid_until)} · ${minutesLeft(p.valid_until)}</span>
      </div>
      <div class="levels">
        <div class="level"><span class="kpi-label">Entry</span><span class="v">${esc(p.entry_price)}</span></div>
        <div class="level"><span class="kpi-label">SL</span><span class="v">${esc(p.stop_loss)}</span><span class="s">${esc(p.sl_pips)} Pips</span></div>
        <div class="level"><span class="kpi-label">TP ${fmtR1(rr)}</span><span class="v">${esc(p.take_profit)}</span><span class="s${warn ? ' warn' : ''}">${esc(tpNote)}</span></div>
        <div class="level"><span class="kpi-label">Lots</span><span class="v">${esc(p.lots)}</span><span class="s">${esc(p.risk_percent)} % Risiko</span></div>
      </div>
      <p class="why"><b>Technik:</b> ${esc(p.tech_notes)}</p>
      <p class="why"><b>Risk:</b> ${esc(p.risk_notes)}</p>
      <p class="why"><b>Confidence ${esc(p.confidence)}:</b> ${esc(p.confidence_reasoning)}</p>
      <p class="why"><b>Fundamental:</b> Score ${esc(p.score)} · ${esc(p.conviction)} — ${esc(p.fundamental_notes)}</p>
      ${p.event_risks ? `<p class="why"><b>⚠ Events:</b> ${esc(p.event_risks)}</p>` : ''}
    </div>`;
  }).join('') : '<p class="desk-empty">Keine offenen Vorschläge.</p>';
}

function renderWatching(rows) {
  $('watchingList').innerHTML = rows.length ? rows.map(r => `
    <div class="row">
      <span class="p">${esc(r.pair)} ${dirTag(r.direction)}</span>
      <span class="t" title="${esc(r.tech_notes)}">${esc(r.tech_notes || `Score ${r.score} · ${r.conviction}`)}</span>
      <span class="desk-hint">bis ${hhmm(r.watch_until)}</span>
    </div>`).join('') : '<p class="desk-empty">Kein Kandidat in Beobachtung.</p>';
}

function renderHistory(rows) {
  $('historyList').innerHTML = rows.length ? rows.map(r => {
    const rVal = r.shadow_r != null ? Number(r.shadow_r) : null;
    const rText = rVal == null ? '–' : `${rVal > 0 ? '+' : ''}${rVal.toFixed(2)}R${r.shadow_result === 'open' ? ' …' : ''}`;
    return `
    <div class="row">
      <span class="p">${esc(r.pair)} ${dirTag(r.direction)}</span>
      <span class="t" title="${esc(r.status_reason)}"><span class="status ${esc(r.status)}">${esc(STATUS_LABEL[r.status] || r.status)}</span> ${dayTime(r.decided_at || r.updated_at)} ${esc(r.status_reason || '')}</span>
      <span class="r ${rVal > 0 ? 'pos' : rVal < 0 ? 'neg' : ''}">${rText}</span>
    </div>`;
  }).join('') : '<p class="desk-empty">Noch keine Entscheidungen.</p>';
}

// Schatten-Bilanz — gleiche Rechnung wie shadow.py (/bilanz im Telegram)
const RISK_PERCENT = 0.8;          // risk.DEFAULT_RISK_PERCENT
const MAX_CONCURRENT_TRADES = 3;   // risk.MAX_CONCURRENT_TRADES
const CLOSED = ['tp', 'sl', 'timeout'];
const HORIZONS = [['Woche', 1], ['Monat', 52 / 12], ['Quartal', 13], ['Jahr', 52]];
const SHADOW_STATUS_LABEL = {
  taken: 'Genommen', dismissed: 'Verworfen', expired: 'Abgelaufen / kein Setup', blocked: 'Blockiert (Risk)',
  analysed: 'Nie verarbeitet', watching: 'Wartet auf Setup', pending: 'Offen',
};
const signed = (v, digits = 2) => `${v > 0 ? '+' : ''}${v.toFixed(digits)}`;
const rClass = (v) => v > 0 ? 'pos' : v < 0 ? 'neg' : '';

function scoreBucket(score) {
  const s = Math.abs(Number(score || 0));
  return s >= 25 ? 'Score ≥25' : s >= 15 ? 'Score 15–24' : 'Score <15';
}

function statsCells(rows) {
  const rs = rows.map(r => Number(r.shadow_r));
  const sum = rs.reduce((a, b) => a + b, 0);
  const wins = rows.filter(r => r.shadow_result === 'tp').length;  // TP1 erreicht
  return `<td>${rows.length}</td><td>${Math.round(wins / rows.length * 100)} %</td>
    <td class="r ${rClass(sum)}">${signed(sum / rows.length)}R</td><td class="r ${rClass(sum)}">${signed(sum, 1)}R</td>`;
}

function groupTable(title, closed, key) {
  const buckets = {};
  closed.forEach(r => (buckets[key(r)] ||= []).push(r));
  const body = Object.keys(buckets).sort().map(k => `<tr><td>${esc(k)}</td>${statsCells(buckets[k])}</tr>`).join('');
  return `<tr class="grp"><td colspan="5">${title}</td></tr>${body}`;
}

function projectionTable(closed) {
  const start = Math.min(...closed.map(r => new Date(r.shadow_start || r.created_at).getTime()));
  const weeks = Math.max((Date.now() - start) / (7 * 86400000), 1);   // unter 1 Woche nicht aufblasen
  const groups = [
    ['Alle Vorschläge', closed],
    ['Mit BITR-Setup', closed.filter(r => r.entry_price != null)],
    ['Genommen', closed.filter(r => r.status === 'taken')],
  ].filter(([, rows]) => rows.length);
  const body = groups.map(([label, rows]) => {
    const perWeek = rows.reduce((a, r) => a + Number(r.shadow_r), 0) / weeks;
    return `<tr><td>${label}<span class="s">${(rows.length / weeks).toFixed(1)}/Wo.</span></td>${HORIZONS.map(([, w]) => {
      const r = perWeek * w;
      return `<td class="r ${rClass(r)}">${signed(r, 1)}R<span class="s">${signed(r * RISK_PERCENT, 1)} %</span></td>`;
    }).join('')}</tr>`;
  }).join('');
  return `
    <h4 class="shadow-sub">Hochrechnung <span class="desk-hint">Tempo der letzten ${weeks.toFixed(1)} Wo. · ${RISK_PERCENT} % Risiko/Trade</span></h4>
    <div class="shadow-scroll"><table class="shadow-table proj">
      <thead><tr><th></th>${HORIZONS.map(([n]) => `<th>${n}</th>`).join('')}</tr></thead>
      <tbody>${body}</tbody>
    </table></div>
    <p class="desk-hint">Linear, ohne Zinseszins und ohne Limit von ${MAX_CONCURRENT_TRADES} gleichzeitigen Trades.</p>`;
}

async function loadShadow() {
  const { data } = await supabase.from('trade_proposals')
    .select('pair, status, conviction, score, entry_price, created_at, shadow_start, shadow_result, shadow_r')
    .in('shadow_result', [...CLOSED, 'open']);
  const rows = (data || []).filter(r => r.shadow_r != null);
  const closed = rows.filter(r => CLOSED.includes(r.shadow_result));
  const open = rows.filter(r => r.shadow_result === 'open');
  if (!closed.length) {
    $('shadowStats').innerHTML = `<p class="desk-empty">Noch kein Vorschlag abgeschlossen${open.length ? ` (${open.length} offen)` : ''}.</p>`;
    return;
  }
  $('shadowStats').innerHTML = `
    <div class="shadow-scroll"><table class="shadow-table">
      <thead><tr><th></th><th>Anzahl</th><th>TP1</th><th>Ø</th><th>Σ</th></tr></thead>
      <tbody>
        <tr class="total"><td>Gesamt</td>${statsCells(closed)}</tr>
        ${groupTable('Nach deiner Entscheidung', closed, r => SHADOW_STATUS_LABEL[r.status] || r.status)}
        ${groupTable('Nach Conviction', closed, r => r.conviction || '?')}
        ${groupTable('Nach Score', closed, r => scoreBucket(r.score))}
      </tbody>
    </table></div>
    ${projectionTable(closed)}
    ${open.length ? `<p class="shadow-open"><b>Noch offen (${open.length}):</b> ${open.map(r =>
      `${esc(r.pair)} <span class="r ${rClass(Number(r.shadow_r))}">${signed(Number(r.shadow_r), 1)}R</span>`).join(' · ')}</p>` : ''}
    ${closed.length < 30 ? `<p class="desk-hint">Erst ${closed.length} abgeschlossene Vorschläge — unter ~30 ist das statistisch noch nicht belastbar.</p>` : ''}`;
}

function squawkRow(s, isNew = false) {
  return `
    <div class="sq${isNew ? ' new' : ''}">
      <span class="time">${hhmm(s.created_at)}</span>
      <span class="src ${esc(s.source)}">${esc(SOURCE_LABEL[s.source] || s.source)}</span>
      <span class="msg">${s.pair ? `<b>${esc(s.pair)}</b> ` : ''}${esc(s.message)}</span>
    </div>`;
}

async function loadProposals() {
  const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
  const [{ data: open }, { data: history }, { data: today }] = await Promise.all([
    supabase.from('trade_proposals').select('*').in('status', ['pending', 'watching']).order('score', { ascending: false }),
    supabase.from('trade_proposals').select('*').in('status', ['taken', 'dismissed', 'expired', 'blocked'])
      .order('updated_at', { ascending: false }).limit(25),
    supabase.from('trade_proposals').select('status').gte('updated_at', startOfDay.toISOString()),
  ]);
  seedProposals([...(open || []), ...(history || [])]);
  const pending = (open || []).filter(r => r.status === 'pending');
  const watching = (open || []).filter(r => r.status === 'watching');
  renderPending(pending);
  renderWatching(watching);
  renderHistory(history || []);
  $('kpiWatching').textContent = watching.length;
  $('kpiPending').textContent = pending.length;
  $('kpiTaken').textContent = (today || []).filter(r => r.status === 'taken').length;
  $('kpiBlocked').textContent = (today || []).filter(r => r.status === 'blocked').length;
  await loadShadow();
}

async function loadSquawk() {
  const { data } = await supabase.from('desk_squawk').select('*').order('created_at', { ascending: false }).limit(150);
  seedAgents(data);
  $('squawkFeed').innerHTML = (data || []).length
    ? data.map(s => squawkRow(s)).join('')
    : '<p class="desk-empty">Noch keine Meldungen.</p>';
}

function subscribe() {
  supabase.channel('desk')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'desk_squawk' }, ({ new: s }) => {
      const feed = $('squawkFeed');
      if (feed.querySelector('.desk-empty')) feed.innerHTML = '';
      feed.insertAdjacentHTML('afterbegin', squawkRow(s, true));
      agentSquawk(s);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'trade_proposals' }, (evt) => { agentProposal(evt); loadProposals(); })
    .subscribe((status) => $('liveDot').classList.toggle('on', status === 'SUBSCRIBED'));
}

initAgents($('agentOffice'));
await Promise.all([loadProposals(), loadSquawk()]);
if (new URLSearchParams(location.search).has('demo')) runDemo();
subscribe();
// Fallback, falls Realtime hängt, und damit die Restlaufzeiten aktuell bleiben
setInterval(loadProposals, 60000);
