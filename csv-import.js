import { supabase, getSelectedAccountId, getAccounts } from './accounts.js';
import { loadTrades } from './app.js';

const $ = (id) => document.getElementById(id);

// Journal-Felder, denen CSV-Spalten zugeordnet werden können
const FIELDS = [
  { key: 'ticket', label: 'Ticket / Position-ID', required: false, hint: 'für Dubletten-Erkennung' },
  { key: 'pair', label: 'Symbol / Pair', required: true },
  { key: 'direction', label: 'Typ (buy/sell)', required: true },
  { key: 'entry_date', label: 'Open Time', required: true },
  { key: 'entry_price', label: 'Open Price', required: true },
  { key: 'stop_loss', label: 'S/L', required: false },
  { key: 'tp1', label: 'T/P', required: false },
  { key: 'exit_date', label: 'Close Time', required: false },
  { key: 'exit_price', label: 'Close Price', required: false },
  { key: 'profit', label: 'Profit ($)', required: false, hint: 'wird als profit_amount gespeichert' },
];

let csvHeaders = [];
let csvRows = [];
let mapping = {};
let parsedTrades = [];
let existingTickets = new Set();

window.addEventListener('open-csv-import', () => {
  resetWizard();
  populateImportAccountSelect();
});

function populateImportAccountSelect() {
  const sel = $('importAccountSelect');
  const accounts = getAccounts();
  if (accounts.length === 0) {
    sel.innerHTML = '<option value="">— erst ein Konto anlegen —</option>';
    return;
  }
  sel.innerHTML = accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
  const current = getSelectedAccountId();
  if (current !== 'all' && accounts.find(a => a.id === current)) sel.value = current;
}

function resetWizard() {
  showStep('Upload');
  $('csvFileInput').value = '';
  csvHeaders = [];
  csvRows = [];
  mapping = {};
}

function showStep(name) {
  ['Upload', 'Mapping', 'Confirm'].forEach(s => {
    $(`importStep${s}`).style.display = s === name ? 'block' : 'none';
  });
}

$('importModalClose').onclick = closeImport;
$('importCancelStep1').onclick = closeImport;
$('importBackStep2').onclick = () => showStep('Upload');
$('importBackStep3').onclick = () => showStep('Mapping');
document.getElementById('importOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'importOverlay') closeImport();
});

function closeImport() {
  document.getElementById('importOverlay').classList.remove('visible');
}

$('csvFileInput').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();

  const mt5Result = tryParseMt5Report(text);
  if (mt5Result) {
    const targetAccountId = $('importAccountSelect').value;
    if (!targetAccountId) { alert('Bitte ein Konto für den Import auswählen.'); return; }
    await finalizeMt5Import(mt5Result, targetAccountId);
    return;
  }

  parseCsv(text);
  if (csvHeaders.length === 0) {
    alert('Konnte keine Spalten in der Datei erkennen.');
    return;
  }
  buildMappingUI();
  renderPreviewTable();
  showStep('Mapping');
};

// ---------- MT5 "Bericht der Kontohistorie" Auto-Erkennung ----------
function parseGermanNum(str) {
  if (str === undefined || str === null) return null;
  let s = str.trim();
  if (s === '') return null;
  s = s.replace(/^-\s+/, '-'); // "- 185,04" -> "-185,04"
  s = s.replace(/\s+/g, '');   // Tausender-Leerzeichen entfernen: "24 275,83" -> "24275,83"
  s = s.replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function parseMt5DateStr(str) {
  if (!str) return null;
  const m = str.trim().match(/^(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  const [, y, mo, d, h, mi, se] = m;
  return new Date(`${y}-${mo}-${d}T${h}:${mi}:${se}`).toISOString();
}

function tryParseMt5Report(text) {
  const lines = text.split(/\r\n|\n/);
  if (!lines[0] || !lines[0].toLowerCase().includes('bericht der kontohistorie')) return null;

  const posStart = lines.findIndex(l => l.trim().startsWith('Positionen'));
  if (posStart === -1) return null;
  const nextSection = lines.findIndex((l, i) => i > posStart + 1 && l.trim().startsWith('Orders'));
  const dataLines = lines.slice(posStart + 2, nextSection === -1 ? undefined : nextSection).filter(l => l.trim().length > 0);

  const rows = [];
  dataLines.forEach(line => {
    const cols = line.split(';');
    if (cols.length < 13) return;
    const [openTime, ticket, symbol, type, volume, openPrice, sl, tp, closeTime, closePrice, commission, swap, profit] = cols;
    if (!openTime || !symbol) return;

    const direction = type.trim().toLowerCase().includes('buy') ? 'long' : 'short';
    const entryDate = parseMt5DateStr(openTime);
    const entryPrice = parseGermanNum(openPrice);
    if (!entryDate || entryPrice === null) return;

    const stopLoss = parseGermanNum(sl);
    const tp1 = parseGermanNum(tp);
    const exitDate = parseMt5DateStr(closeTime);
    const exitPrice = parseGermanNum(closePrice);
    const profitAmount = parseGermanNum(profit);
    const commissionAmount = parseGermanNum(commission) || 0;
    const swapAmount = parseGermanNum(swap) || 0;
    const netProfit = profitAmount !== null ? Math.round((profitAmount + commissionAmount + swapAmount) * 100) / 100 : null;
    const volumeClean = parseFloat((volume || '').split('/')[0].trim()) || null;

    let rMultiple = null;
    if (stopLoss && exitPrice !== null) {
      const riskDist = Math.abs(entryPrice - stopLoss);
      if (riskDist > 0) {
        const move = direction === 'long' ? (exitPrice - entryPrice) : (entryPrice - exitPrice);
        rMultiple = Math.round((move / riskDist) * 100) / 100;
      }
    }

    rows.push({
      pair: symbol.trim().toUpperCase(),
      direction,
      entry_date: entryDate,
      entry_price: entryPrice,
      stop_loss: stopLoss,
      tp1: tp1,
      exit_date: exitDate,
      exit_price: exitPrice,
      profit_amount: netProfit,
      r_multiple: rMultiple,
      status: exitPrice !== null ? 'closed' : 'open',
      source: 'mt5_import',
      mt5_ticket_id: ticket.trim(),
      notes: volumeClean ? `MT5 Volumen: ${volumeClean}` : null,
    });
  });

  return rows.length > 0 ? rows : null;
}

async function finalizeMt5Import(rows, targetAccountId) {
  const { data: existing } = await supabase.from('trades').select('mt5_ticket_id').not('mt5_ticket_id', 'is', null);
  const existingTickets = new Set((existing || []).map(t => t.mt5_ticket_id));

  let skippedDupe = 0;
  let noSl = 0;
  parsedTrades = [];

  rows.forEach(r => {
    if (existingTickets.has(r.mt5_ticket_id)) { skippedDupe++; return; }
    if (!r.stop_loss) noSl++;
    parsedTrades.push({ ...r, account_id: targetAccountId });
  });

  $('importSummary').innerHTML = `
    <div class="summary-line"><span>Erkannt: MT5-Kontohistorie-Report</span><strong class="pos">${rows.length} Positionen</strong></div>
    <div class="summary-line"><span>Zu importieren</span><strong class="pos">${parsedTrades.length}</strong></div>
    <div class="summary-line"><span>Übersprungen (bereits importiert)</span><strong>${skippedDupe}</strong></div>
    ${noSl > 0 ? `<div class="summary-line warn"><span>Ohne S/L (R-Multiple manuell nachtragen)</span><strong>${noSl}</strong></div>` : ''}
  `;
  showStep('Confirm');
}

// ---------- CSV Parsing ----------
function parseCsv(text) {
  const lines = text.split(/\r\n|\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return;

  const delimiter = detectDelimiter(lines[0]);
  const parsedLines = lines.map(l => parseCsvLine(l, delimiter));

  csvHeaders = parsedLines[0].map(h => h.trim());
  csvRows = parsedLines.slice(1).filter(r => r.length === csvHeaders.length);
}

function detectDelimiter(headerLine) {
  const counts = { ',': (headerLine.match(/,/g) || []).length, ';': (headerLine.match(/;/g) || []).length, '\t': (headerLine.match(/\t/g) || []).length };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

function parseCsvLine(line, delimiter) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === delimiter && !inQuotes) {
      result.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur);
  return result;
}

// ---------- Mapping UI ----------
function buildMappingUI() {
  const grid = $('mappingGrid');
  grid.innerHTML = '';

  FIELDS.forEach(field => {
    const row = document.createElement('div');
    row.className = 'mapping-row';

    const label = document.createElement('label');
    label.textContent = field.label + (field.required ? ' *' : '') + (field.hint ? ` (${field.hint})` : '');

    const select = document.createElement('select');
    select.dataset.field = field.key;
    const emptyOpt = document.createElement('option');
    emptyOpt.value = '';
    emptyOpt.textContent = '— ignorieren —';
    select.appendChild(emptyOpt);

    csvHeaders.forEach((h, idx) => {
      const opt = document.createElement('option');
      opt.value = idx;
      opt.textContent = h;
      select.appendChild(opt);
    });

    // Auto-guess based on header name
    const guessIdx = guessColumn(field.key);
    if (guessIdx !== -1) select.value = guessIdx;

    select.onchange = () => renderPreviewTable();

    row.appendChild(label);
    row.appendChild(select);
    grid.appendChild(row);
  });

  $('importAnalyzeBtn').onclick = analyzeAndGoToConfirm;
}

function guessColumn(fieldKey) {
  const patterns = {
    ticket: ['ticket', 'position', 'deal', '#'],
    pair: ['symbol', 'pair', 'instrument'],
    direction: ['type', 'direction', 'side'],
    entry_date: ['open time', 'opentime', 'time', 'entry'],
    entry_price: ['open price', 'price open', 'price', 'entry price'],
    stop_loss: ['s/l', 'sl', 'stop loss'],
    tp1: ['t/p', 'tp', 'take profit'],
    exit_date: ['close time', 'closetime'],
    exit_price: ['close price', 'price close'],
    profit: ['profit', 'p/l', 'pnl'],
  };
  const candidates = patterns[fieldKey] || [];
  for (let i = 0; i < csvHeaders.length; i++) {
    const h = csvHeaders[i].toLowerCase();
    if (candidates.some(c => h.includes(c))) return i;
  }
  return -1;
}

function getMapping() {
  const m = {};
  document.querySelectorAll('#mappingGrid select').forEach(sel => {
    m[sel.dataset.field] = sel.value === '' ? null : parseInt(sel.value, 10);
  });
  return m;
}

function renderPreviewTable() {
  const m = getMapping();
  const table = $('previewTable');
  const activeFields = FIELDS.filter(f => m[f.key] !== null && m[f.key] !== undefined);

  let html = '<thead><tr>' + activeFields.map(f => `<th>${f.label}</th>`).join('') + '</tr></thead><tbody>';
  csvRows.slice(0, 3).forEach(row => {
    html += '<tr>' + activeFields.map(f => `<td>${escapeHtml(row[m[f.key]] || '')}</td>`).join('') + '</tr>';
  });
  html += '</tbody>';
  table.innerHTML = html;
}

// ---------- Analyze & confirm ----------
async function analyzeAndGoToConfirm() {
  mapping = getMapping();

  const targetAccountId = $('importAccountSelect').value;
  if (!targetAccountId) {
    alert('Bitte ein Konto für den Import auswählen.');
    return;
  }

  const missingRequired = FIELDS.filter(f => f.required && (mapping[f.key] === null || mapping[f.key] === undefined));
  if (missingRequired.length > 0) {
    alert('Bitte Pflichtfelder zuordnen: ' + missingRequired.map(f => f.label).join(', '));
    return;
  }

  // Load existing mt5_ticket_ids for dedup
  const { data: existing } = await supabase.from('trades').select('mt5_ticket_id').not('mt5_ticket_id', 'is', null);
  existingTickets = new Set((existing || []).map(t => t.mt5_ticket_id));

  parsedTrades = [];
  let skippedDupe = 0;
  let skippedInvalid = 0;
  let noSl = 0;

  csvRows.forEach(row => {
    const ticket = mapping.ticket !== null ? row[mapping.ticket]?.trim() : null;
    if (ticket && existingTickets.has(ticket)) { skippedDupe++; return; }

    const pairRaw = row[mapping.pair]?.trim();
    const dirRaw = (row[mapping.direction] || '').trim().toLowerCase();
    const entryDate = parseMt5Date(row[mapping.entry_date]);
    const entryPrice = parseNum(row[mapping.entry_price]);

    if (!pairRaw || !entryDate || entryPrice === null) { skippedInvalid++; return; }
    if (!dirRaw.includes('buy') && !dirRaw.includes('sell') && !dirRaw.includes('long') && !dirRaw.includes('short')) { skippedInvalid++; return; }

    const direction = (dirRaw.includes('buy') || dirRaw.includes('long')) ? 'long' : 'short';
    const stopLoss = mapping.stop_loss !== null ? parseNum(row[mapping.stop_loss]) : null;
    const tp1 = mapping.tp1 !== null ? parseNum(row[mapping.tp1]) : null;
    const exitDate = mapping.exit_date !== null ? parseMt5Date(row[mapping.exit_date]) : null;
    const exitPrice = mapping.exit_price !== null ? parseNum(row[mapping.exit_price]) : null;
    const profitAmount = mapping.profit !== null ? parseNum(row[mapping.profit]) : null;

    let rMultiple = null;
    if (stopLoss && exitPrice !== null) {
      const riskDist = Math.abs(entryPrice - stopLoss);
      if (riskDist > 0) {
        const move = direction === 'long' ? (exitPrice - entryPrice) : (entryPrice - exitPrice);
        rMultiple = Math.round((move / riskDist) * 100) / 100;
      }
    }
    if (!stopLoss) noSl++;

    parsedTrades.push({
      account_id: targetAccountId,
      pair: pairRaw.toUpperCase(),
      direction,
      entry_date: entryDate,
      entry_price: entryPrice,
      stop_loss: stopLoss || null,
      tp1: tp1 || null,
      exit_date: exitDate,
      exit_price: exitPrice,
      r_multiple: rMultiple,
      profit_amount: profitAmount,
      status: exitPrice !== null ? 'closed' : 'open',
      source: 'mt5_import',
      mt5_ticket_id: ticket || null,
    });
  });

  $('importSummary').innerHTML = `
    <div class="summary-line"><span>Zu importieren</span><strong class="pos">${parsedTrades.length}</strong></div>
    <div class="summary-line"><span>Übersprungen (bereits importiert)</span><strong>${skippedDupe}</strong></div>
    <div class="summary-line"><span>Übersprungen (ungültige Zeile)</span><strong>${skippedInvalid}</strong></div>
    ${noSl > 0 ? `<div class="summary-line warn"><span>Ohne S/L (R-Multiple manuell nachtragen)</span><strong>${noSl}</strong></div>` : ''}
  `;
  showStep('Confirm');
}

$('importConfirmBtn').onclick = async () => {
  if (parsedTrades.length === 0) { closeImport(); return; }
  const btn = $('importConfirmBtn');
  btn.disabled = true;
  btn.textContent = 'Importiere…';

  const { error } = await supabase.from('trades').insert(parsedTrades);

  btn.disabled = false;
  btn.textContent = 'Trades importieren';

  if (error) {
    alert('Fehler beim Import: ' + error.message);
    return;
  }
  closeImport();
  await loadTrades();
};

// ---------- Helpers ----------
function parseNum(str) {
  if (str === undefined || str === null || str.trim() === '') return null;
  const cleaned = str.replace(/\s/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function parseMt5Date(str) {
  if (!str) return null;
  const s = str.trim();
  // MT5 format: 2026.08.20 14:35:12
  const mt5Match = s.match(/^(\d{4})\.(\d{2})\.(\d{2})\s+(\d{2}):(\d{2})(:(\d{2}))?/);
  if (mt5Match) {
    const [, y, mo, d, h, mi, , se] = mt5Match;
    return new Date(`${y}-${mo}-${d}T${h}:${mi}:${se || '00'}`).toISOString();
  }
  const parsed = new Date(s);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
