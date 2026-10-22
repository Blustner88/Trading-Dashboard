import { supabase, initAccountSwitcher, getSelectedAccountId, getAccounts } from './accounts.js';
import { toast, confirmDialog, deleteWithUndo, busy } from './nav.js';

const BUCKET = 'trade-screenshots';
const ALL_PAIRS = [
  'EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'USDNOK', 'USDSEK',
  'EURJPY', 'EURGBP', 'EURAUD', 'EURCAD', 'EURCHF', 'EURNZD', 'EURNOK', 'EURSEK',
  'GBPJPY', 'GBPAUD', 'GBPCAD', 'GBPCHF', 'GBPNZD', 'GBPNOK',
  'AUDJPY', 'AUDCAD', 'AUDCHF', 'AUDNZD', 'NZDJPY', 'NZDCAD', 'NZDCHF', 'CADJPY', 'CADCHF', 'CHFJPY',
  'XAUUSD', 'XAGUSD', 'NDX100', 'SPX500', 'GER30', 'EUSTX50', 'USOUSD',
];

let trades = [];
let activeFilters = { pair: null, status: null, search: '' };
let currentDirection = null;
let editingId = null;
let editingTrade = null;
let currentStep = 1;
let pendingEntryFile = null;
let pendingExitFile = null;

const $ = (id) => document.getElementById(id);

// ---------- Init ----------
// Standard-Risiko für neue Trades (Einstellungen → Trading)
let defaultRisk = 0.8;

async function init() {
  const { data: rs } = await supabase.from('user_settings').select('value').eq('key', 'default_risk_pct').maybeSingle();
  if (rs && Number(rs.value) > 0) defaultRisk = Number(rs.value);
  await initAccountSwitcher();
  populateAccountSelect();
  $('pairList').innerHTML = ALL_PAIRS.map(p => `<option value="${p}"></option>`).join('');
  buildFilterChips();
  bindEvents();
  window.addEventListener('account-changed', () => { populateAccountSelect(); loadTrades(); });
  await loadTrades();
  // "+ Trade" aus der Navigation (nav.js) öffnet direkt den Dialog — auch wenn das Journal schon offen ist
  const openFromHash = async () => {
    const m = location.hash.match(/^#idee=([0-9a-f-]{36})$/);
    if (location.hash !== '#neu' && !m) return;
    history.replaceState(null, '', location.pathname);
    $('openAddTrade').click();
    if (m) await prefillFromIdea(m[1]);
  };
  window.addEventListener('hashchange', openFromHash);
  openFromHash();
}

function populateAccountSelect() {
  const sel = $('f_account');
  const accounts = getAccounts();
  sel.innerHTML = accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
  const current = getSelectedAccountId();
  if (current !== 'all' && accounts.find(a => a.id === current)) sel.value = current;
  else { const active = accounts.find(a => a.status === 'active'); if (active) sel.value = active.id; }
}

// Pair-Chips: die meistgehandelten Pairs aus dem Journal
function buildPairChips() {
  const pairGroup = $('filterPair');
  pairGroup.querySelectorAll('.chip').forEach(c => c.remove());
  const counts = {};
  trades.forEach(t => { counts[t.pair] = (counts[t.pair] || 0) + 1; });
  Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([p]) => {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.textContent = p;
    chip.dataset.pair = p;
    chip.onclick = () => {
      activeFilters.pair = activeFilters.pair === p ? null : p;
      renderChips();
      renderTrades();
    };
    pairGroup.appendChild(chip);
  });
  renderChips();
}

function buildFilterChips() {
  const statusGroup = $('filterStatus');
  [['open', 'Offen'], ['closed', 'Geschlossen'], ['cancelled', 'Storniert']].forEach(([val, label]) => {
    const chip = document.createElement('button');
    chip.className = 'chip';
    chip.textContent = label;
    chip.dataset.status = val;
    chip.onclick = () => {
      activeFilters.status = activeFilters.status === val ? null : val;
      renderChips();
      renderTrades();
    };
    statusGroup.appendChild(chip);
  });
}

function renderChips() {
  document.querySelectorAll('#filterPair .chip').forEach(c => {
    c.classList.toggle('active', c.dataset.pair === activeFilters.pair);
  });
  document.querySelectorAll('#filterStatus .chip').forEach(c => {
    c.classList.toggle('active', c.dataset.status === activeFilters.status);
  });
}

function bindEvents() {
  $('openAddTrade').onclick = () => {
    if (getAccounts().length === 0) { showToast('Bitte zuerst ein Konto anlegen (oben rechts).'); return; }
    openModal();
  };
  $('modalClose').onclick = closeModal;
  $('modalOverlay').onclick = (e) => { if (e.target.id === 'modalOverlay') closeModal(); };

  $('f_pair').oninput = (e) => { e.target.value = e.target.value.toUpperCase(); };
  document.querySelectorAll('.step-tab').forEach(t => { t.onclick = () => { if (Number(t.dataset.step) < currentStep || validateStep(currentStep)) showStep(Number(t.dataset.step)); }; });
  $('nextStepBtn').onclick = () => { if (validateStep(currentStep)) showStep(currentStep + 1); };
  $('prevStepBtn').onclick = () => showStep(currentStep - 1);

  document.querySelectorAll('#f_direction .seg-btn').forEach(btn => {
    btn.onclick = () => {
      currentDirection = btn.dataset.value;
      document.querySelectorAll('#f_direction .seg-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    };
  });

  $('f_chart_entry').onchange = (e) => { pendingEntryFile = e.target.files[0]; previewFile(e.target.files[0], 'entryPreview'); };
  $('f_chart_exit').onchange = (e) => { pendingExitFile = e.target.files[0]; previewFile(e.target.files[0], 'exitPreview'); };

  $('tradeForm').onsubmit = handleSave;
  $('deleteTradeBtn').onclick = handleDelete;

  $('searchNotes').oninput = (e) => { activeFilters.search = e.target.value.toLowerCase(); renderTrades(); };

  $('importCsvBtn').onclick = () => {
    document.getElementById('importOverlay').classList.add('visible');
    window.dispatchEvent(new Event('open-csv-import'));
  };
}

function previewFile(file, targetId) {
  const target = $(targetId);
  target.innerHTML = '';
  if (!file) return;
  const img = document.createElement('img');
  img.src = URL.createObjectURL(file);
  target.appendChild(img);
}

// ---------- Schritte ----------
function showStep(n) {
  currentStep = Math.max(1, Math.min(3, n));
  document.querySelectorAll('.wizard-step').forEach(s => { s.hidden = Number(s.dataset.step) !== currentStep; });
  document.querySelectorAll('.step-tab').forEach(t => {
    const s = Number(t.dataset.step);
    t.classList.toggle('active', s === currentStep);
    t.classList.toggle('done', s < currentStep);
    t.setAttribute('aria-selected', String(s === currentStep));
  });
  $('prevStepBtn').hidden = currentStep === 1;
  $('nextStepBtn').hidden = currentStep === 3;
  $('modalOverlay').scrollTop = 0;
}

const isImported = () => editingTrade?.source === 'mt5_import';

// Prüft nur, was für den jeweiligen Schritt nötig ist; meldet das erste fehlende Feld
function validateStep(step) {
  const need = (cond, msg, el) => { if (cond) return true; showToast(msg); el?.focus(); return false; };
  if (step >= 1) {
    if (!need($('f_account').value, 'Bitte ein Konto wählen.', $('f_account'))) return false;
    if (!need($('f_pair').value.trim(), 'Bitte Pair angeben.', $('f_pair'))) return false;
    if (!need(currentDirection, 'Bitte Long oder Short wählen.')) return false;
    if (!need($('f_entry_date').value, 'Bitte den Einstiegszeitpunkt angeben.', $('f_entry_date'))) return false;
  }
  if (step >= 2) {
    if (!need($('f_entry_price').value, 'Bitte den Entry-Preis angeben.', $('f_entry_price'))) return false;
    if (!isImported() && !need($('f_stop_loss').value, 'Bitte den initialen Stop Loss angeben (für den R-Wert).', $('f_stop_loss'))) return false;
  }
  return true;
}

// Importierte Trades der letzten 14 Tage ohne Setup als Vorschläge zum Ergänzen
function renderImportSuggest() {
  const box = $('importSuggest');
  const cutoff = Date.now() - 14 * 864e5;
  const todo = trades.filter(t => t.source === 'mt5_import' && !t.setup_type && new Date(t.entry_date).getTime() >= cutoff).slice(0, 6);
  box.hidden = !!editingId || !todo.length;
  $('importSuggestList').innerHTML = todo.map(t => {
    const pl = t.profit_amount != null ? ` · ${Number(t.profit_amount) >= 0 ? '+' : ''}${Number(t.profit_amount).toFixed(0)} $` : '';
    return `<button type="button" class="chip" data-id="${t.id}">${escapeHtml(t.pair)} ${t.direction === 'long' ? '▲' : '▼'} ${new Date(t.entry_date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}${pl}</button>`;
  }).join('');
  $('importSuggestList').querySelectorAll('.chip').forEach(c => {
    c.onclick = () => openModal(trades.find(t => t.id === c.dataset.id), 2);
  });
}

// Trade aus einer Trade-Idee (Cockpit/Tagesplan): Werte + Screenshot übernehmen
let fromIdea = null;
async function prefillFromIdea(id) {
  const { data: idea } = await supabase.from('trade_ideas').select('*').eq('id', id).maybeSingle();
  if (!idea) { showToast('Trade-Idee nicht gefunden.'); return; }
  fromIdea = idea;
  $('modalTitle').textContent = 'Trade aus Idee erfassen';
  $('f_pair').value = idea.pair;
  currentDirection = idea.direction;
  document.querySelectorAll('#f_direction .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.value === idea.direction));
  $('f_setup_type').value = idea.setup_type || '';
  $('f_entry_price').value = idea.entry_price ?? '';
  $('f_stop_loss').value = idea.stop_loss ?? '';
  $('f_tp1').value = idea.tp1 ?? '';
  $('f_tp2').value = idea.tp2 ?? '';
  $('f_notes').value = idea.reasoning || '';
  if (idea.screenshot_url) previewFromUrl(idea.screenshot_url, 'entryPreview');
  $('importSuggest').hidden = true;
}

// ---------- Modal ----------
function openModal(trade = null, startStep = 1) {
  fromIdea = null;
  editingId = trade ? trade.id : null;
  editingTrade = trade;
  $('modalTitle').textContent = trade ? (trade.source === 'mt5_import' && !trade.setup_type ? 'Import ergänzen' : 'Trade bearbeiten') : 'Trade erfassen';
  $('deleteTradeBtn').style.display = trade ? 'block' : 'none';
  $('tradeForm').reset();
  $('entryPreview').innerHTML = '';
  $('exitPreview').innerHTML = '';
  pendingEntryFile = null;
  pendingExitFile = null;
  currentDirection = null;
  document.querySelectorAll('#f_direction .seg-btn').forEach(b => b.classList.remove('active'));
  $('slHint').textContent = trade?.source === 'mt5_import'
    ? 'Importierter Trade: SL ist optional. Mit SL wird der R-Wert berechnet.'
    : 'Der initiale SL ist die Grundlage für den R-Wert.';

  if (trade) {
    $('f_account').value = trade.account_id;
    $('f_pair').value = trade.pair;

    currentDirection = trade.direction;
    document.querySelector(`#f_direction .seg-btn[data-value="${trade.direction}"]`)?.classList.add('active');

    $('f_entry_date').value = toLocalInput(trade.entry_date);
    $('f_session').value = trade.session || '';
    $('f_setup_type').value = trade.setup_type || '';
    $('f_entry_price').value = trade.entry_price;
    $('f_stop_loss').value = trade.stop_loss ?? '';
    $('f_trailed_sl').value = trade.trailed_stop_loss ?? '';
    $('f_risk_percent').value = trade.risk_percent ?? (trade.source === 'mt5_import' ? '' : 0.8);
    $('f_tp1').value = trade.tp1 ?? '';
    $('f_tp2').value = trade.tp2 ?? '';
    $('f_notes').value = trade.notes === 'FundedNext-Import' ? '' : (trade.notes || '');
    $('f_exit_price').value = trade.exit_price ?? '';
    $('f_exit_date').value = trade.exit_date ? toLocalInput(trade.exit_date) : '';
    $('f_profit_amount').value = trade.profit_amount ?? '';
    $('f_mistake_tag').value = trade.mistake_tag || '';
    if (trade.chart_entry_url) previewFromUrl(trade.chart_entry_url, 'entryPreview');
    if (trade.chart_exit_url) previewFromUrl(trade.chart_exit_url, 'exitPreview');
  } else {
    const current = getSelectedAccountId();
    if (current !== 'all') $('f_account').value = current;
    $('f_risk_percent').value = defaultRisk;
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    $('f_entry_date').value = now.toISOString().slice(0, 16);
  }

  renderImportSuggest();
  showStep(startStep);
  $('modalOverlay').classList.add('visible');
}

function previewFromUrl(url, targetId) {
  const target = $(targetId);
  target.innerHTML = '';
  const img = document.createElement('img');
  img.src = url;
  target.appendChild(img);
}

function closeModal() {
  $('modalOverlay').classList.remove('visible');
  editingId = null;
  editingTrade = null;
}

function toLocalInput(isoString) {
  const d = new Date(isoString);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

// ---------- Save / Delete ----------
async function handleSave(e) {
  e.preventDefault();

  // Erst Schritt 1+2 prüfen; fehlt etwas, springt der Assistent dorthin
  for (const s of [1, 2]) {
    if (!validateStep(s)) { showStep(s); return; }
  }
  const pair = $('f_pair').value.trim().toUpperCase();

  const saveBtn = $('saveBtn');
  if (saveBtn.disabled) return;   // läuft schon (Doppelklick)
  saveBtn.disabled = true;
  saveBtn.textContent = 'Speichern…';

  try {
    let chartEntryUrl = null;
    let chartExitUrl = null;

    if (pendingEntryFile) chartEntryUrl = await uploadScreenshot(pendingEntryFile);
    if (pendingExitFile) chartExitUrl = await uploadScreenshot(pendingExitFile);

    const entryPrice = parseFloat($('f_entry_price').value);
    const stopLoss = $('f_stop_loss').value ? parseFloat($('f_stop_loss').value) : null;
    const exitPriceRaw = $('f_exit_price').value;
    const exitPrice = exitPriceRaw ? parseFloat(exitPriceRaw) : null;

    const payload = {
      account_id: $('f_account').value,
      pair,
      direction: currentDirection,
      entry_date: new Date($('f_entry_date').value).toISOString(),
      session: $('f_session').value || null,
      setup_type: $('f_setup_type').value || null,
      entry_price: entryPrice,
      stop_loss: stopLoss,
      trailed_stop_loss: $('f_trailed_sl').value ? parseFloat($('f_trailed_sl').value) : null,
      tp1: $('f_tp1').value ? parseFloat($('f_tp1').value) : null,
      tp2: $('f_tp2').value ? parseFloat($('f_tp2').value) : null,
      risk_percent: $('f_risk_percent').value ? parseFloat($('f_risk_percent').value) : (isImported() ? null : defaultRisk),
      notes: $('f_notes').value || (isImported() ? editingTrade.notes : null),
      exit_price: exitPrice,
      exit_date: $('f_exit_date').value ? new Date($('f_exit_date').value).toISOString() : null,
      mistake_tag: $('f_mistake_tag').value || null,
      profit_amount: $('f_profit_amount').value ? parseFloat($('f_profit_amount').value) : null,
      status: exitPrice ? 'closed' : 'open',
    };

    payload.r_multiple = exitPrice && stopLoss != null ? calcRMultiple(currentDirection, entryPrice, stopLoss, exitPrice) : null;

    if (!chartEntryUrl && fromIdea?.screenshot_url && !editingId) chartEntryUrl = fromIdea.screenshot_url;
    if (chartEntryUrl) payload.chart_entry_url = chartEntryUrl;
    if (chartExitUrl) payload.chart_exit_url = chartExitUrl;

    if (editingId) {
      const { error } = await supabase.from('trades').update(payload).eq('id', editingId);
      if (error) throw error;
      showToast('Trade aktualisiert.');
    } else {
      const { data: created, error } = await supabase.from('trades').insert(payload).select('id').single();
      if (error) throw error;
      if (fromIdea) {
        await supabase.from('trade_ideas').update({ status: 'taken', trade_id: created.id }).eq('id', fromIdea.id);
        fromIdea = null;
      }
      showToast('Trade gespeichert.');
    }

    closeModal();
    await loadTrades();
  } catch (err) {
    console.error(err);
    showToast('Fehler beim Speichern: ' + (navigator.onLine ? err.message : 'keine Internetverbindung'), { error: true });
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Speichern';
  }
}

async function handleDelete() {
  if (!editingId) return;
  const id = editingId;
  const t = trades.find(x => x.id === id);
  if (!await confirmDialog({ title: 'Trade löschen?', text: t ? `${t.pair} vom ${new Date(t.entry_date).toLocaleDateString('de-DE')}` : '' })) return;
  closeModal();
  const before = trades;
  deleteWithUndo({
    label: 'Trade',
    hide: () => { trades = trades.filter(x => x.id !== id); renderStats(); renderTrades(); },
    restore: () => { trades = before; renderStats(); renderTrades(); },
    commit: () => supabase.from('trades').delete().eq('id', id),
    onDone: loadTrades,
  });
}

function calcRMultiple(direction, entry, sl, exit) {
  const riskDistance = Math.abs(entry - sl);
  if (riskDistance === 0) return 0;
  const move = direction === 'long' ? (exit - entry) : (entry - exit);
  return Math.round((move / riskDistance) * 100) / 100;
}

async function uploadScreenshot(file) {
  const ext = file.name.split('.').pop();
  const path = `${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file);
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// ---------- Load / Render ----------
async function loadTrades() {
  let query = supabase.from('trades').select('*').order('entry_date', { ascending: false });
  const accId = getSelectedAccountId();
  if (accId !== 'all') query = query.eq('account_id', accId);

  const { data, error } = await query;

  if (error) {
    showToast('Fehler beim Laden: ' + (navigator.onLine ? error.message : 'keine Internetverbindung'), { error: true });
    return;
  }
  trades = data || [];
  buildPairChips();
  renderStats();
  renderTrades();
}

function renderStats() {
  const openCount = trades.filter(t => t.status === 'open').length;
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const last30 = trades.filter(t => new Date(t.entry_date).getTime() >= cutoff);
  // Win-Rate über alle geschlossenen Trades (Betrag, sonst R); Ø R nur über Trades mit R-Wert
  const closed30 = last30.filter(t => t.status === 'closed');
  const result = (t) => t.profit_amount !== null && t.profit_amount !== undefined ? Number(t.profit_amount) : Number(t.r_multiple ?? 0);
  const wins = closed30.filter(t => result(t) > 0).length;
  const winrate = closed30.length ? Math.round((wins / closed30.length) * 100) : null;
  const withR = closed30.filter(t => t.r_multiple !== null && t.r_multiple !== undefined);
  const avgR = withR.length ? (withR.reduce((s, t) => s + Number(t.r_multiple), 0) / withR.length) : null;

  $('statOpen').textContent = openCount;
  $('statCount').textContent = last30.length;
  $('statWinrate').textContent = winrate !== null ? `${winrate}%` : '–';
  $('statAvgR').textContent = avgR !== null ? `${avgR >= 0 ? '+' : ''}${avgR.toFixed(2)}R` : '–';
}

function renderTrades() {
  const list = $('tradeList');
  let filtered = trades;

  if (activeFilters.pair) filtered = filtered.filter(t => t.pair === activeFilters.pair);
  if (activeFilters.status) filtered = filtered.filter(t => t.status === activeFilters.status);
  if (activeFilters.search) {
    filtered = filtered.filter(t =>
      (t.notes || '').toLowerCase().includes(activeFilters.search) ||
      (t.setup_type || '').toLowerCase().includes(activeFilters.search) ||
      (t.mistake_tag || '').toLowerCase().includes(activeFilters.search)
    );
  }

  list.innerHTML = '';

  if (filtered.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = trades.length === 0
      ? `<p class="empty-title">Noch keine Trades erfasst</p><p class="empty-sub">Leg deinen ersten Trade an — jede Zeile hier ist eine Entscheidung, die du später auswerten kannst.</p>`
      : `<p class="empty-title">Keine Trades für diesen Filter</p><p class="empty-sub">Filter zurücksetzen, um alle Trades zu sehen.</p>`;
    list.appendChild(empty);
    return;
  }

  filtered.forEach(trade => list.appendChild(renderTradeCard(trade)));
}

function renderTradeCard(trade) {
  const card = document.createElement('div');
  card.className = 'trade-card';
  card.onclick = () => openModal(trade);

  const dir = document.createElement('div');
  dir.className = `tc-dir ${trade.direction}`;
  card.appendChild(dir);

  const main = document.createElement('div');
  main.className = 'tc-main';
  const entryDate = new Date(trade.entry_date);
  const dateStr = entryDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
  const timeStr = entryDate.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

  main.innerHTML = `
    <div class="tc-pair-row">
      <span class="tc-pair">${trade.pair} · ${trade.direction === 'long' ? 'Long' : 'Short'}</span>
      <span class="tc-badge ${trade.status}">${statusLabel(trade.status)}</span>
      ${trade.source === 'mt5_import' && !trade.setup_type ? '<span class="tc-badge todo">ergänzen</span>' : ''}
      ${getSelectedAccountId() === 'all' ? accountTagHtml(trade.account_id) : ''}
    </div>
    <div class="tc-meta"><span>${dateStr} · ${timeStr}</span>${trade.session ? `<span>${trade.session}</span>` : ''}</div>
    ${trade.setup_type ? `<div class="tc-setup">${escapeHtml(trade.setup_type)}</div>` : ''}
  `;
  card.appendChild(main);

  const prices = document.createElement('div');
  prices.className = 'tc-prices';
  prices.innerHTML = `
    <div><span class="lbl">E</span>${trade.entry_price}</div>
    ${trade.stop_loss != null ? `<div><span class="lbl">SL</span>${trade.stop_loss}${trade.trailed_stop_loss ? ` → ${trade.trailed_stop_loss}` : ''}</div>` : ''}
    ${trade.exit_price ? `<div><span class="lbl">X</span>${trade.exit_price}</div>` : ''}
  `;
  card.appendChild(prices);

  const rBox = document.createElement('div');
  rBox.className = 'tc-r';
  if (trade.r_multiple !== null && trade.r_multiple !== undefined) {
    const r = Number(trade.r_multiple);
    const pos = r >= 0;
    const barWidth = Math.min(Math.abs(r) * 25, 100);
    rBox.innerHTML = `
      <span class="tc-r-value ${pos ? 'pos' : 'neg'}">${pos ? '+' : ''}${r.toFixed(2)}R</span>
      <div class="tc-r-bar"><div class="tc-r-bar-fill ${pos ? 'pos' : 'neg'}" style="width:${barWidth}%"></div></div>
    `;
  } else if (trade.status === 'closed' && trade.profit_amount != null) {
    const v = Number(trade.profit_amount);
    rBox.innerHTML = `<span class="tc-r-value ${v >= 0 ? 'pos' : 'neg'}">${v >= 0 ? '+' : '−'}${Math.abs(v).toLocaleString('de-DE', { maximumFractionDigits: 0 })} $</span>`;
  } else {
    rBox.innerHTML = `<span class="tc-r-value pending">offen</span>`;
  }
  card.appendChild(rBox);

  return card;
}

function statusLabel(status) {
  return { open: 'Offen', closed: 'Geschlossen', cancelled: 'Storniert' }[status] || status;
}

function accountTagHtml(accountId) {
  const acc = getAccounts().find(a => a.id === accountId);
  if (!acc) return '';
  return `<span class="tc-acc-tag" style="border-color:${acc.color}; color:${acc.color}">${escapeHtml(acc.name)}</span>`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showToast(msg, opts) { toast(msg, opts); }

init();

export { loadTrades };
