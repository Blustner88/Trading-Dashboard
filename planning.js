import { supabase } from './accounts.js';

const $ = (id) => document.getElementById(id);
const DEFAULT_PAIRS = [
  'EURUSD', 'GBPUSD', 'NZDUSD', 'USDCHF', 'USDJPY', 'USDCAD', 'USDNOK', 'USDSEK', 'AUDUSD',
  'EURJPY', 'EURAUD', 'EURCAD', 'EURGBP', 'EURCHF', 'EURNZD', 'EURSEK', 'EURNOK',
  'GBPAUD', 'GBPCHF', 'GBPCAD', 'GBPJPY', 'GBPNZD', 'GBPNOK',
  'NZDCAD', 'CADCHF', 'CADJPY', 'AUDCAD',
  'AUDCHF', 'AUDNZD', 'CHFJPY', 'AUDJPY', 'NZDCHF', 'NZDJPY',
];

const GROUP_IDS = { ready: 'groupReady', forming: 'groupForming', watching: 'groupWatching', no_interest: 'groupNoInterest' };
const COUNT_IDS = { ready: 'countReady', forming: 'countForming', watching: 'countWatching', no_interest: 'countNoInterest' };

let currentDate = todayStr();
let currentPlanId = null;
let riskSentiment = null;

function todayStr() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

async function init() {
  $('planDate').value = currentDate;
  bindEvents();
  await loadPlan(currentDate);
}

function bindEvents() {
  $('planDate').onchange = (e) => { currentDate = e.target.value; loadPlan(currentDate); };
  $('prevDayBtn').onclick = () => shiftDate(-1);
  $('nextDayBtn').onclick = () => shiftDate(1);
  $('todayBtn').onclick = () => { currentDate = todayStr(); $('planDate').value = currentDate; loadPlan(currentDate); };

  document.querySelectorAll('#riskSegmented .seg-btn').forEach(btn => {
    btn.onclick = () => {
      riskSentiment = btn.dataset.value;
      document.querySelectorAll('#riskSegmented .seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    };
  });

  $('addPairRowBtn').onclick = () => { addPairRow({ pair: '', bias: 'neutral', watchlist_status: 'watching', notes: '' }); updateGroupCounts(); };
  $('addTradeRowBtn').onclick = () => addTradeRow({ pair: '', direction: 'long', setup_type: '', entry_zone: '', notes: '' });
  $('addCalendarRowBtn').onclick = () => addCalendarRow({ event_time: '', currency: '', event_name: '', impact: 'medium', notes: '' });
  $('savePlanBtn').onclick = savePlan;

  $('noInterestToggle').onclick = () => {
    const group = $('noInterestToggle').closest('.bias-group');
    const rows = $('groupNoInterest');
    const collapsed = group.classList.toggle('collapsed');
    rows.style.display = collapsed ? 'none' : 'flex';
  };

  $('copyPromptBtn').onclick = () => {
    navigator.clipboard.writeText($('promptText').textContent.trim());
    const btn = $('copyPromptBtn');
    const original = btn.textContent;
    btn.textContent = 'Kopiert ✓';
    setTimeout(() => { btn.textContent = original; }, 1800);
  };

  $('openInClaudeBtn').onclick = () => {
    const promptText = $('promptText').textContent.trim();
    const url = 'claude://claude.ai/new?q=' + encodeURIComponent(promptText);
    window.location.href = url;
    setTimeout(() => { showFallbackHint(); }, 900);
  };
}

function showFallbackHint() {
  const el = $('claudeLinkHint');
  if (el) el.style.display = 'block';
}

function shiftDate(deltaDays) {
  const d = new Date(currentDate + 'T00:00:00');
  d.setDate(d.getDate() + deltaDays);
  currentDate = d.toISOString().slice(0, 10);
  $('planDate').value = currentDate;
  loadPlan(currentDate);
}

async function loadPlan(dateStr) {
  setSaveStatus('Lädt…');
  const { data: plan, error } = await supabase
    .from('daily_plans')
    .select('*, daily_plan_pairs(*), daily_plan_trades(*), daily_plan_calendar(*)')
    .eq('plan_date', dateStr)
    .maybeSingle();

  if (error) {
    setSaveStatus('Fehler beim Laden.');
    console.error(error);
    return;
  }

  clearAllGroups();
  $('calendarRows').innerHTML = '';
  $('tradePlanRows').innerHTML = '';

  if (plan) {
    currentPlanId = plan.id;
    riskSentiment = plan.risk_sentiment;
    $('riskNotes').value = plan.risk_sentiment_notes || '';
    $('generalNotes').value = plan.general_notes || '';

    document.querySelectorAll('#riskSegmented .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.value === riskSentiment));

    const calRows = (plan.daily_plan_calendar || []).sort((a, b) => (a.event_time || '').localeCompare(b.event_time || ''));
    calRows.forEach(c => addCalendarRow(c));

    const pairs = (plan.daily_plan_pairs || []).sort((a, b) => a.pair.localeCompare(b.pair));
    if (pairs.length > 0) {
      pairs.forEach(p => addPairRow(p));
    } else {
      DEFAULT_PAIRS.forEach(p => addPairRow({ pair: p, bias: 'neutral', watchlist_status: 'watching', notes: '' }));
    }

    const tradeRows = (plan.daily_plan_trades || []).sort((a, b) => a.sort_order - b.sort_order);
    tradeRows.forEach(t => addTradeRow(t));

    setSaveStatus(`Gespeichert am ${new Date(plan.updated_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`);
  } else {
    currentPlanId = null;
    riskSentiment = null;
    $('riskNotes').value = '';
    $('generalNotes').value = '';
    document.querySelectorAll('#riskSegmented .seg-btn').forEach(b => b.classList.remove('active'));
    DEFAULT_PAIRS.forEach(p => addPairRow({ pair: p, bias: 'neutral', watchlist_status: 'watching', notes: '' }));
    setSaveStatus('Noch kein Plan für diesen Tag.');
  }

  updateGroupCounts();
  refreshBiasChecks();
}

function clearAllGroups() {
  Object.values(GROUP_IDS).forEach(id => { $(id).innerHTML = ''; });
}

// ---------- Calendar (Termine) ----------
function addCalendarRow(data) {
  const tr = document.createElement('tr');
  tr.className = 'calendar-row';
  tr.innerHTML = `
    <td><input type="text" class="time-input" value="${escapeAttr(data.event_time || '')}" placeholder="14:30" /></td>
    <td><input type="text" class="currency-input" value="${escapeAttr(data.currency || '')}" placeholder="USD" /></td>
    <td><input type="text" class="event-input" value="${escapeAttr(data.event_name || '')}" placeholder="z.B. FOMC-Entscheid" /></td>
    <td>
      <select class="impact-select impact-${data.impact || 'medium'}">
        <option value="low" ${data.impact === 'low' ? 'selected' : ''}>Niedrig</option>
        <option value="medium" ${(!data.impact || data.impact === 'medium') ? 'selected' : ''}>Mittel</option>
        <option value="high" ${data.impact === 'high' ? 'selected' : ''}>Hoch</option>
      </select>
    </td>
    <td><input type="text" class="calendar-notes-input" value="${escapeAttr(data.notes || '')}" placeholder="Erwartung…" /></td>
    <td><button type="button" class="pair-row-remove" title="Entfernen">✕</button></td>
  `;
  const impactSelect = tr.querySelector('.impact-select');
  impactSelect.onchange = () => { impactSelect.className = `impact-select impact-${impactSelect.value}`; };
  tr.querySelector('.pair-row-remove').onclick = () => { tr.remove(); toggleCalendarEmptyHint(); };
  $('calendarRows').appendChild(tr);
  toggleCalendarEmptyHint();
}

function toggleCalendarEmptyHint() {
  const hasRows = $('calendarRows').children.length > 0;
  $('calendarEmptyHint').style.display = hasRows ? 'none' : 'block';
}

// ---------- Pair-Bias (gruppiert) ----------
function addPairRow(data) {
  const status = data.watchlist_status || 'watching';
  const row = document.createElement('div');
  row.className = 'pair-row';
  row.dataset.status = status;
  row.innerHTML = `
    <input type="text" class="pair-name" value="${escapeAttr(data.pair || '')}" placeholder="Pair" />
    <select class="bias-select">
      <option value="long" ${data.bias === 'long' ? 'selected' : ''}>Long</option>
      <option value="neutral" ${data.bias === 'neutral' ? 'selected' : ''}>Neutral</option>
      <option value="short" ${data.bias === 'short' ? 'selected' : ''}>Short</option>
    </select>
    <select class="watchlist-select">
      <option value="watching" ${status === 'watching' ? 'selected' : ''}>Beobachten</option>
      <option value="forming" ${status === 'forming' ? 'selected' : ''}>Setup formt sich</option>
      <option value="ready" ${status === 'ready' ? 'selected' : ''}>Bereit</option>
      <option value="no_interest" ${status === 'no_interest' ? 'selected' : ''}>Kein Interesse</option>
    </select>
    <input type="text" class="pair-notes" value="${escapeAttr(data.notes || '')}" placeholder="Confluence-Faktoren, Begründung…" />
    <button type="button" class="pair-row-remove" title="Entfernen">✕</button>
  `;
  row.querySelector('.pair-row-remove').onclick = () => { row.remove(); updateGroupCounts(); refreshBiasChecks(); };
  row.querySelector('.pair-name').oninput = refreshBiasChecks;
  row.querySelector('.bias-select').onchange = refreshBiasChecks;
  row.querySelector('.watchlist-select').onchange = (e) => {
    row.dataset.status = e.target.value;
    $(GROUP_IDS[e.target.value]).appendChild(row);
    updateGroupCounts();
  };
  $(GROUP_IDS[status]).appendChild(row);
}

function updateGroupCounts() {
  Object.entries(GROUP_IDS).forEach(([status, groupId]) => {
    $(COUNT_IDS[status]).textContent = $(groupId).children.length;
  });
}

function addTradeRow(data) {
  const row = document.createElement('div');
  row.className = 'trade-plan-row';
  row.innerHTML = `
    <input type="text" class="pair-name" value="${escapeAttr(data.pair || '')}" placeholder="Pair" />
    <select class="direction-select">
      <option value="long" ${data.direction === 'long' ? 'selected' : ''}>Long</option>
      <option value="short" ${data.direction === 'short' ? 'selected' : ''}>Short</option>
    </select>
    <input type="text" class="setup-input" value="${escapeAttr(data.setup_type || '')}" placeholder="Setup-Typ" />
    <input type="text" class="entry-input" value="${escapeAttr(data.entry_zone || '')}" placeholder="Entry-Zone/Preis" />
    <input type="text" class="notes-input" value="${escapeAttr(data.notes || '')}" placeholder="Notizen" />
    <div style="display:flex; align-items:center; gap:6px;">
      <span class="bias-check-badge unknown">–</span>
      <button type="button" class="pair-row-remove" title="Entfernen">✕</button>
    </div>
  `;
  row.querySelector('.pair-row-remove').onclick = () => row.remove();
  row.querySelector('.pair-name').oninput = refreshBiasChecks;
  row.querySelector('.direction-select').onchange = refreshBiasChecks;
  $('tradePlanRows').appendChild(row);
  refreshBiasChecks();
}

function refreshBiasChecks() {
  const biasMap = {};
  document.querySelectorAll('.pair-row').forEach(r => {
    const pair = r.querySelector('.pair-name').value.trim().toUpperCase();
    if (pair) biasMap[pair] = r.querySelector('.bias-select').value;
  });

  document.querySelectorAll('#tradePlanRows .trade-plan-row').forEach(r => {
    const pair = r.querySelector('.pair-name').value.trim().toUpperCase();
    const direction = r.querySelector('.direction-select').value;
    const badge = r.querySelector('.bias-check-badge');
    const bias = biasMap[pair];

    if (!pair || bias === undefined) {
      badge.textContent = 'Kein Bias';
      badge.className = 'bias-check-badge unknown';
    } else if (bias === 'neutral') {
      badge.textContent = 'Bias neutral';
      badge.className = 'bias-check-badge unknown';
    } else if (bias === direction) {
      badge.textContent = '✓ Stimmt überein';
      badge.className = 'bias-check-badge match';
    } else {
      badge.textContent = `⚠ Gegen Bias (${bias === 'long' ? 'Long' : 'Short'})`;
      badge.className = 'bias-check-badge mismatch';
    }
  });
}

async function savePlan() {
  const btn = $('savePlanBtn');
  btn.disabled = true;
  btn.textContent = 'Speichere…';

  try {
    const planPayload = {
      plan_date: currentDate,
      risk_sentiment: riskSentiment,
      risk_sentiment_notes: $('riskNotes').value || null,
      general_notes: $('generalNotes').value || null,
    };

    let planId = currentPlanId;
    if (planId) {
      const { error } = await supabase.from('daily_plans').update(planPayload).eq('id', planId);
      if (error) throw error;
    } else {
      const { data, error } = await supabase.from('daily_plans').insert(planPayload).select().single();
      if (error) throw error;
      planId = data.id;
      currentPlanId = planId;
    }

    // Pair rows
    await supabase.from('daily_plan_pairs').delete().eq('daily_plan_id', planId);
    const rows = Array.from(document.querySelectorAll('.pair-row')).map((row, idx) => ({
      daily_plan_id: planId,
      pair: row.querySelector('.pair-name').value.trim().toUpperCase(),
      bias: row.querySelector('.bias-select').value,
      watchlist_status: row.querySelector('.watchlist-select').value,
      notes: row.querySelector('.pair-notes').value.trim() || null,
      sort_order: idx,
    })).filter(r => r.pair);
    if (rows.length > 0) {
      const { error } = await supabase.from('daily_plan_pairs').insert(rows);
      if (error) throw error;
    }

    // Planned trades
    await supabase.from('daily_plan_trades').delete().eq('daily_plan_id', planId);
    const tradeRows = Array.from(document.querySelectorAll('.trade-plan-row')).map((row, idx) => ({
      daily_plan_id: planId,
      pair: row.querySelector('.pair-name').value.trim().toUpperCase(),
      direction: row.querySelector('.direction-select').value,
      setup_type: row.querySelector('.setup-input').value.trim() || null,
      entry_zone: row.querySelector('.entry-input').value.trim() || null,
      notes: row.querySelector('.notes-input').value.trim() || null,
      sort_order: idx,
    })).filter(r => r.pair);
    if (tradeRows.length > 0) {
      const { error } = await supabase.from('daily_plan_trades').insert(tradeRows);
      if (error) throw error;
    }

    // Calendar events
    await supabase.from('daily_plan_calendar').delete().eq('daily_plan_id', planId);
    const calRows = Array.from(document.querySelectorAll('.calendar-row')).map((row, idx) => ({
      daily_plan_id: planId,
      event_time: row.querySelector('.time-input').value.trim() || null,
      currency: row.querySelector('.currency-input').value.trim().toUpperCase() || null,
      event_name: row.querySelector('.event-input').value.trim(),
      impact: row.querySelector('.impact-select').value,
      notes: row.querySelector('.calendar-notes-input').value.trim() || null,
      sort_order: idx,
    })).filter(r => r.event_name);
    if (calRows.length > 0) {
      const { error } = await supabase.from('daily_plan_calendar').insert(calRows);
      if (error) throw error;
    }

    setSaveStatus(`Gespeichert am ${new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`);
  } catch (err) {
    console.error(err);
    setSaveStatus('Fehler beim Speichern: ' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Plan speichern';
  }
}

function setSaveStatus(text) {
  $('saveStatus').textContent = text;
}

function escapeAttr(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML.replace(/"/g, '&quot;');
}

init();
