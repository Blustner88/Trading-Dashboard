import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { loadTrades } from './app.js';

const SUPABASE_URL = 'https://rabbtdooayruveribarq.supabase.co';
const SUPABASE_KEY = 'sb_publishable_CsC9Ji0H9w_Xkbgoy1QtRg_RasuZtuX';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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
  { key: 'profit', label: 'Profit', required: false, hint: 'nur informativ, nicht gespeichert' },
];

let csvHeaders = [];
let csvRows = [];
let mapping = {};
let parsedTrades = [];
let existingTickets = new Set();

window.addEventListener('open-csv-import', () => {
  resetWizard();
});

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
  parseCsv(text);
  if (csvHeaders.length === 0) {
    alert('Konnte keine Spalten in der Datei erkennen.');
    return;
  }
  buildMappingUI();
  renderPreviewTable();
  showStep('Mapping');
};

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
      pair: pairRaw.toUpperCase(),
      direction,
      entry_date: entryDate,
      entry_price: entryPrice,
      stop_loss: stopLoss || null,
      tp1: tp1 || null,
      exit_date: exitDate,
      exit_price: exitPrice,
      r_multiple: rMultiple,
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
