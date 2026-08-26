import { supabase, initAccountSwitcher, getSelectedAccountId, getAccounts } from './accounts.js';

const BUCKET = 'trade-screenshots';
const PAIRS = ['GBPAUD', 'EURUSD', 'GBPUSD', 'USDJPY', 'USDCAD', 'EURAUD'];

let trades = [];
let activeFilters = { pair: null, status: null, search: '' };
let currentDirection = null;
let editingId = null;
let pendingEntryFile = null;
let pendingExitFile = null;

const $ = (id) => document.getElementById(id);

// ---------- Init ----------
async function init() {
  await initAccountSwitcher();
  populateAccountSelect();
  buildFilterChips();
  bindEvents();
  window.addEventListener('account-changed', () => { populateAccountSelect(); loadTrades(); });
  await loadTrades();
}

function populateAccountSelect() {
  const sel = $('f_account');
  const accounts = getAccounts();
  sel.innerHTML = accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
  const current = getSelectedAccountId();
  if (current !== 'all' && accounts.find(a => a.id === current)) sel.value = current;
}

function buildFilterChips() {
  const pairGroup = $('filterPair');
  PAIRS.forEach(p => {
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
  $('cancelBtn').onclick = closeModal;
  $('modalOverlay').onclick = (e) => { if (e.target.id === 'modalOverlay') closeModal(); };

  $('f_pair').onchange = (e) => {
    $('f_pair_other').style.display = e.target.value === '__other' ? 'block' : 'none';
  };

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

// ---------- Modal ----------
function openModal(trade = null) {
  editingId = trade ? trade.id : null;
  $('modalTitle').textContent = trade ? 'Trade bearbeiten' : 'Trade erfassen';
  $('deleteTradeBtn').style.display = trade ? 'block' : 'none';
  $('tradeForm').reset();
  $('entryPreview').innerHTML = '';
  $('exitPreview').innerHTML = '';
  pendingEntryFile = null;
  pendingExitFile = null;
  currentDirection = null;
  document.querySelectorAll('#f_direction .seg-btn').forEach(b => b.classList.remove('active'));
  $('f_pair_other').style.display = 'none';

  if (trade) {
    $('f_account').value = trade.account_id;
    const pairSelect = $('f_pair');
    const isKnown = PAIRS.includes(trade.pair);
    pairSelect.value = isKnown ? trade.pair : '__other';
    if (!isKnown) { $('f_pair_other').style.display = 'block'; $('f_pair_other').value = trade.pair; }

    currentDirection = trade.direction;
    document.querySelector(`#f_direction .seg-btn[data-value="${trade.direction}"]`)?.classList.add('active');

    $('f_entry_date').value = toLocalInput(trade.entry_date);
    $('f_session').value = trade.session || '';
    $('f_setup_type').value = trade.setup_type || '';
    $('f_entry_price').value = trade.entry_price;
    $('f_stop_loss').value = trade.stop_loss;
    $('f_risk_percent').value = trade.risk_percent ?? 0.8;
    $('f_tp1').value = trade.tp1 ?? '';
    $('f_tp2').value = trade.tp2 ?? '';
    $('f_notes').value = trade.notes || '';
    $('f_exit_price').value = trade.exit_price ?? '';
    $('f_exit_date').value = trade.exit_date ? toLocalInput(trade.exit_date) : '';
    $('f_profit_amount').value = trade.profit_amount ?? '';
    $('f_mistake_tag').value = trade.mistake_tag || '';
    if (trade.chart_entry_url) previewFromUrl(trade.chart_entry_url, 'entryPreview');
    if (trade.chart_exit_url) previewFromUrl(trade.chart_exit_url, 'exitPreview');
  } else {
    const current = getSelectedAccountId();
    if (current !== 'all') $('f_account').value = current;
    $('f_risk_percent').value = 0.8;
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    $('f_entry_date').value = now.toISOString().slice(0, 16);
  }

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
}

function toLocalInput(isoString) {
  const d = new Date(isoString);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

// ---------- Save / Delete ----------
async function handleSave(e) {
  e.preventDefault();

  if (!$('f_account').value) return showToast('Bitte Account wählen.');

  let pair = $('f_pair').value;
  if (pair === '__other') pair = $('f_pair_other').value.trim().toUpperCase();
  if (!pair) return showToast('Bitte Pair angeben.');
  if (!currentDirection) return showToast('Bitte Richtung (Long/Short) wählen.');

  const saveBtn = $('saveBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Speichern…';

  try {
    let chartEntryUrl = null;
    let chartExitUrl = null;

    if (pendingEntryFile) chartEntryUrl = await uploadScreenshot(pendingEntryFile);
    if (pendingExitFile) chartExitUrl = await uploadScreenshot(pendingExitFile);

    const entryPrice = parseFloat($('f_entry_price').value);
    const stopLoss = parseFloat($('f_stop_loss').value);
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
      tp1: $('f_tp1').value ? parseFloat($('f_tp1').value) : null,
      tp2: $('f_tp2').value ? parseFloat($('f_tp2').value) : null,
      risk_percent: $('f_risk_percent').value ? parseFloat($('f_risk_percent').value) : 0.8,
      notes: $('f_notes').value || null,
      exit_price: exitPrice,
      exit_date: $('f_exit_date').value ? new Date($('f_exit_date').value).toISOString() : null,
      mistake_tag: $('f_mistake_tag').value || null,
      profit_amount: $('f_profit_amount').value ? parseFloat($('f_profit_amount').value) : null,
      status: exitPrice ? 'closed' : 'open',
    };

    if (exitPrice) {
      payload.r_multiple = calcRMultiple(currentDirection, entryPrice, stopLoss, exitPrice);
    } else {
      payload.r_multiple = null;
    }

    if (chartEntryUrl) payload.chart_entry_url = chartEntryUrl;
    if (chartExitUrl) payload.chart_exit_url = chartExitUrl;

    if (editingId) {
      const { error } = await supabase.from('trades').update(payload).eq('id', editingId);
      if (error) throw error;
      showToast('Trade aktualisiert.');
    } else {
      const { error } = await supabase.from('trades').insert(payload);
      if (error) throw error;
      showToast('Trade gespeichert.');
    }

    closeModal();
    await loadTrades();
  } catch (err) {
    console.error(err);
    showToast('Fehler beim Speichern: ' + err.message);
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Speichern';
  }
}

async function handleDelete() {
  if (!editingId) return;
  if (!confirm('Diesen Trade wirklich löschen?')) return;
  const { error } = await supabase.from('trades').delete().eq('id', editingId);
  if (error) return showToast('Fehler beim Löschen: ' + error.message);
  showToast('Trade gelöscht.');
  closeModal();
  await loadTrades();
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
    showToast('Fehler beim Laden: ' + error.message);
    return;
  }
  trades = data || [];
  renderStats();
  renderTrades();
}

function renderStats() {
  const openCount = trades.filter(t => t.status === 'open').length;
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const last30 = trades.filter(t => new Date(t.entry_date).getTime() >= cutoff);
  const closed30 = last30.filter(t => t.status === 'closed' && t.r_multiple !== null);
  const wins = closed30.filter(t => t.r_multiple > 0).length;
  const winrate = closed30.length ? Math.round((wins / closed30.length) * 100) : null;
  const avgR = closed30.length ? (closed30.reduce((s, t) => s + Number(t.r_multiple), 0) / closed30.length) : null;

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
    <div><span class="lbl">SL</span>${trade.stop_loss}</div>
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

function showToast(msg) {
  const toast = $('toast');
  toast.textContent = msg;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 3200);
}

init();

export { loadTrades };
