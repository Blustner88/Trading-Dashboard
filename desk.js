import { supabase } from './accounts.js';

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

function renderPending(rows) {
  $('pendingList').innerHTML = rows.length ? rows.map(p => {
    const runner = p.tp1_lots != null ? Math.round((p.lots - p.tp1_lots) * 100) / 100 : null;
    const tpNote = runner > 0 ? `${p.tp1_lots} Lots schließen, ${runner} trailen` : 'alles schließen';
    return `
    <div class="proposal ${p.direction === 'short' ? 'short' : 'long'}">
      <div class="proposal-head">
        <span><span class="proposal-pair">${esc(p.pair)}</span>${dirTag(p.direction)}</span>
        <span class="valid">bis ${hhmm(p.valid_until)} · ${minutesLeft(p.valid_until)}</span>
      </div>
      <div class="levels">
        <div class="level"><span class="kpi-label">Entry</span><span class="v">${esc(p.entry_price)}</span></div>
        <div class="level"><span class="kpi-label">SL</span><span class="v">${esc(p.stop_loss)}</span><span class="s">${esc(p.sl_pips)} Pips</span></div>
        <div class="level"><span class="kpi-label">TP1 2,2R</span><span class="v">${esc(p.take_profit)}</span><span class="s">${esc(tpNote)}</span></div>
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
  const pending = (open || []).filter(r => r.status === 'pending');
  const watching = (open || []).filter(r => r.status === 'watching');
  renderPending(pending);
  renderWatching(watching);
  renderHistory(history || []);
  $('kpiWatching').textContent = watching.length;
  $('kpiPending').textContent = pending.length;
  $('kpiTaken').textContent = (today || []).filter(r => r.status === 'taken').length;
  $('kpiBlocked').textContent = (today || []).filter(r => r.status === 'blocked').length;
}

async function loadSquawk() {
  const { data } = await supabase.from('desk_squawk').select('*').order('created_at', { ascending: false }).limit(150);
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
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'trade_proposals' }, () => loadProposals())
    .subscribe((status) => $('liveDot').classList.toggle('on', status === 'SUBSCRIBED'));
}

await Promise.all([loadProposals(), loadSquawk()]);
subscribe();
// Fallback, falls Realtime hängt, und damit die Restlaufzeiten aktuell bleiben
setInterval(loadProposals, 60000);
