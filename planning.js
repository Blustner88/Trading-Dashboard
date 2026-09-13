import { supabase } from './accounts.js';

const $ = (id) => document.getElementById(id);
const DEFAULT_PAIRS = [
  'EURUSD', 'GBPUSD', 'NZDUSD', 'USDCHF', 'USDJPY', 'USDCAD', 'USDNOK', 'USDSEK', 'AUDUSD',
  'EURJPY', 'EURAUD', 'EURCAD', 'EURGBP', 'EURCHF', 'EURNZD', 'EURSEK', 'EURNOK',
  'GBPAUD', 'GBPCHF', 'GBPCAD', 'GBPJPY', 'GBPNZD', 'GBPNOK',
  'NZDCAD', 'CADCHF', 'CADJPY', 'AUDCAD',
  'AUDCHF', 'AUDNZD', 'CHFJPY', 'AUDJPY', 'NZDCHF', 'NZDJPY',
];

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

  $('addPairRowBtn').onclick = () => addPairRow({ pair: '', bias: 'neutral', watchlist_status: 'watching', notes: '' });
  $('addTradeRowBtn').onclick = () => addTradeRow({ pair: '', direction: 'long', setup_type: '', entry_zone: '', notes: '' });
  $('savePlanBtn').onclick = savePlan;

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
    // Fallback hint in case the Claude Desktop app isn't installed / scheme not handled
    setTimeout(() => {
      showFallbackHint();
    }, 900);
  };
}

function showFallbackHint() {
  const el = $('claudeLinkHint');
  if (el) el.style.display = 'block';

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
    .select('*, daily_plan_pairs(*), daily_plan_trades(*)')
    .eq('plan_date', dateStr)
    .maybeSingle();

  if (error) {
    setSaveStatus('Fehler beim Laden.');
    console.error(error);
    return;
  }

  if (plan) {
    currentPlanId = plan.id;
    riskSentiment = plan.risk_sentiment;
    $('riskNotes').value = plan.risk_sentiment_notes || '';
    $('calendarNotes').value = plan.calendar_notes || '';
    $('generalNotes').value = plan.general_notes || '';

    document.querySelectorAll('#riskSegmented .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.value === riskSentiment));

    const pairs = (plan.daily_plan_pairs || []).sort((a, b) => a.sort_order - b.sort_order);
    $('pairRows').innerHTML = '';
    if (pairs.length > 0) {
      pairs.forEach(p => addPairRow(p));
    } else {
      DEFAULT_PAIRS.forEach(p => addPairRow({ pair: p, bias: 'neutral', watchlist_status: 'watching', notes: '' }));
    }

    const tradeRows = (plan.daily_plan_trades || []).sort((a, b) => a.sort_order - b.sort_order);
    $('tradePlanRows').innerHTML = '';
    tradeRows.forEach(t => addTradeRow(t));

    setSaveStatus(`Gespeichert am ${new Date(plan.updated_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}`);
  } else {
    currentPlanId = null;
    riskSentiment = null;
    $('riskNotes').value = '';
    $('calendarNotes').value = '';
    $('generalNotes').value = '';
    document.querySelectorAll('#riskSegmented .seg-btn').forEach(b => b.classList.remove('active'));
    $('pairRows').innerHTML = '';
    DEFAULT_PAIRS.forEach(p => addPairRow({ pair: p, bias: 'neutral', watchlist_status: 'watching', notes: '' }));
    $('tradePlanRows').innerHTML = '';
    setSaveStatus('Noch kein Plan für diesen Tag.');
  }
}

function addPairRow(data) {
  const row = document.createElement('div');
  row.className = 'pair-row';
  row.innerHTML = `
    <input type="text" class="pair-name" value="${escapeAttr(data.pair || '')}" placeholder="Pair" />
    <select class="bias-select">
      <option value="long" ${data.bias === 'long' ? 'selected' : ''}>Long</option>
      <option value="neutral" ${data.bias === 'neutral' ? 'selected' : ''}>Neutral</option>
      <option value="short" ${data.bias === 'short' ? 'selected' : ''}>Short</option>
    </select>
    <select class="watchlist-select">
      <option value="watching" ${data.watchlist_status === 'watching' ? 'selected' : ''}>Beobachten</option>
      <option value="forming" ${data.watchlist_status === 'forming' ? 'selected' : ''}>Setup formt sich</option>
      <option value="ready" ${data.watchlist_status === 'ready' ? 'selected' : ''}>Bereit</option>
      <option value="no_interest" ${data.watchlist_status === 'no_interest' ? 'selected' : ''}>Kein Interesse</option>
    </select>
    <input type="text" class="pair-notes" value="${escapeAttr(data.notes || '')}" placeholder="Confluence-Faktoren, Begründung…" />
    <button type="button" class="pair-row-remove" title="Entfernen">✕</button>
  `;
  row.querySelector('.pair-row-remove').onclick = () => { row.remove(); refreshBiasChecks(); };
  row.querySelector('.pair-name').oninput = refreshBiasChecks;
  row.querySelector('.bias-select').onchange = refreshBiasChecks;
  $('pairRows').appendChild(row);
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
  document.querySelectorAll('#pairRows .pair-row').forEach(r => {
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
      calendar_notes: $('calendarNotes').value || null,
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

    // Replace pair rows
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

    // Replace planned trade rows
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
