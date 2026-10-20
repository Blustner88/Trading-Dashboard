import { supabase, initAccountSwitcher } from './accounts.js';

// Business-Überblick: Geschäftsbilanz je Jahr und Monat, Challenges mit Gebühren
// und Payouts, EÜR-Übersicht mit Prüfhinweisen und CSV/Druck.
// Einnahmen = Payouts beim Zufluss (Status erhalten/umgetauscht), keine Buchgewinne.

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = (v) => `${Number(v).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const signedEur = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${eur(Math.abs(v))}`;
const dmy = (d) => d ? new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('de-DE') : '–';
const yearOf = (d) => Number(String(d).slice(0, 4));

const COUNTED = ['received', 'converted_to_eur'];           // Zufluss
const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const TYPE = { challenge: 'Challenge', verification: 'Verifizierung', funded: 'Funded', personal: 'Privat' };
const STATUS = { active: 'Aktiv', passed: 'Bestanden', breached: 'Verloren', closed: 'Geschlossen' };
// Ausgaben-Kategorie -> Bereich der Anlage EÜR (Bezeichnung, Hinweis)
const EUR_EXPENSE = {
  propfirm_fees: ['Übrige unbeschränkt abziehbare Betriebsausgaben', 'Propfirm-Gebühren (Challenges)'],
  software_tools: ['Laufende EDV-Kosten', 'Software, Abos, Datenfeeds'],
  hardware: ['Geringwertige Wirtschaftsgüter / AfA', 'Hardware — Computer-Hardware seit 2021 mit 1 Jahr Nutzungsdauer'],
  education: ['Fortbildungskosten', 'Kurse, Bücher, Coaching'],
  office_home: ['Arbeitszimmer / Homeoffice-Pauschale', 'Raumkosten oder Tagespauschale'],
  other: ['Übrige unbeschränkt abziehbare Betriebsausgaben', 'Sonstiges'],
};

let accounts = [], payouts = [], expenses = [], invoices = [], trades = [];
let year = new Date().getFullYear();

async function loadAll() {
  const [a, p, e, i, t] = await Promise.all([
    supabase.from('accounts').select('*').order('created_at'),
    supabase.from('payouts').select('*').order('payout_date'),
    supabase.from('business_expenses').select('*').order('expense_date'),
    supabase.from('invoices').select('*').order('invoice_date'),
    supabase.from('trades').select('account_id, profit_amount').eq('status', 'closed'),
  ]);
  accounts = a.data || []; payouts = p.data || []; expenses = e.data || []; invoices = i.data || []; trades = t.data || [];
  buildYears();
  render();
}

function buildYears() {
  const now = new Date().getFullYear();
  const ys = [...payouts.map(p => yearOf(p.payout_date)), ...expenses.map(e => yearOf(e.expense_date)), ...accounts.map(a => yearOf(a.created_at))];
  const min = Math.min(now - 1, ...ys.filter(Boolean));
  const sel = $('yearSelect');
  sel.innerHTML = Array.from({ length: now - min + 1 }, (_, k) => now - k).map(y => `<option${y === year ? ' selected' : ''}>${y}</option>`).join('');
}

const inYear = (d) => yearOf(d) === year;
const income = (rows) => rows.filter(p => COUNTED.includes(p.status)).reduce((s, p) => s + Number(p.amount_eur), 0);
const sum = (rows) => rows.reduce((s, e) => s + Number(e.amount), 0);

function render() {
  const yp = payouts.filter(p => inYear(p.payout_date));
  const ye = expenses.filter(e => inYear(e.expense_date));
  const inc = income(yp), fees = sum(ye.filter(e => e.category === 'propfirm_fees')), other = sum(ye.filter(e => e.category !== 'propfirm_fees'));
  const res = inc - fees - other;
  $('kIncome').textContent = eur(inc);
  $('kFees').textContent = eur(fees);
  $('kOther').textContent = eur(other);
  $('kResult').textContent = signedEur(res);
  $('kResult').className = `kpi-value ${res >= 0 ? 'pos' : 'neg'}`;
  const total = income(payouts) - sum(expenses);
  $('kTotal').textContent = `seit Beginn ${signedEur(total)}`;
  renderMonths(yp, ye);
  renderAccounts();
  renderEur(yp, ye, inc);
}

function renderMonths(yp, ye) {
  let cum = 0;
  const rows = MONTHS.map((m, k) => {
    const mp = yp.filter(p => new Date(p.payout_date).getMonth() === k);
    const me = ye.filter(e => new Date(e.expense_date).getMonth() === k);
    const inc = income(mp), fee = sum(me.filter(e => e.category === 'propfirm_fees')), oth = sum(me.filter(e => e.category !== 'propfirm_fees'));
    const r = inc - fee - oth;
    cum += r;
    const empty = !mp.length && !me.length;
    return `<tr class="${empty ? 'dim' : ''}"><td>${m}</td><td class="n pos">${inc ? eur(inc) : '–'}</td><td class="n neg">${fee ? eur(fee) : '–'}</td>
      <td class="n neg">${oth ? eur(oth) : '–'}</td><td class="n ${r > 0 ? 'pos' : r < 0 ? 'neg' : ''}">${empty ? '–' : signedEur(r)}</td>
      <td class="n ${cum > 0 ? 'pos' : cum < 0 ? 'neg' : ''}">${signedEur(cum)}</td></tr>`;
  }).join('');
  $('monthTable').innerHTML = `<thead><tr><th>Monat</th><th>Einnahmen</th><th>Gebühren</th><th>Sonstige</th><th>Ergebnis</th><th>Kumuliert</th></tr></thead><tbody>${rows}</tbody>`;
}

function renderAccounts() {
  const feesFor = (id) => sum(expenses.filter(e => e.account_id === id));
  const payFor = (id) => income(payouts.filter(p => p.account_id === id));
  const unassigned = sum(expenses.filter(e => e.category === 'propfirm_fees' && !e.account_id));
  const funded = accounts.filter(a => a.account_type === 'funded' || a.status === 'passed').length;
  const lost = accounts.filter(a => a.status === 'breached').length;
  const allFees = sum(expenses.filter(e => e.category === 'propfirm_fees'));
  const allPay = income(payouts);
  $('challengeStats').innerHTML = [
    ['Konten', accounts.length], ['davon Funded/bestanden', funded], ['verloren', lost],
    ['Gebühren gesamt', eur(allFees)], ['Payouts gesamt', eur(allPay)],
    ['Payouts je 1 € Gebühr', allFees ? (allPay / allFees).toFixed(2).replace('.', ',') : '–'],
  ].map(([l, v]) => `<div><span class="kpi-label">${l}</span><b>${v}</b></div>`).join('');

  const rows = accounts.map(a => {
    const f = feesFor(a.id), p = payFor(a.id), net = p - f;
    const tr = trades.filter(t => t.account_id === a.id).reduce((s, t) => s + (Number(t.profit_amount) || 0), 0);
    return `<tr><td><span class="dot" style="background:${esc(a.color)}"></span>${esc(a.name)}<span class="s">${esc(a.prop_firm || '')} · seit ${dmy(a.created_at)}</span></td>
      <td>${esc(TYPE[a.account_type] || a.account_type)}</td><td><span class="st ${esc(a.status)}">${esc(STATUS[a.status] || a.status)}</span></td>
      <td class="n">${Number(a.starting_balance).toLocaleString('de-DE')} ${esc(a.currency)}</td>
      <td class="n neg">${f ? eur(f) : '<span class="miss">fehlt</span>'}</td><td class="n pos">${p ? eur(p) : '–'}</td>
      <td class="n ${net > 0 ? 'pos' : net < 0 ? 'neg' : ''}">${signedEur(net)}</td>
      <td class="n s2">${tr ? `${tr > 0 ? '+' : ''}${tr.toLocaleString('de-DE', { maximumFractionDigits: 0 })} ${esc(a.currency)}` : '–'}</td>
      <td><button class="btn-ghost sm" data-fee="${esc(a.id)}">+ Gebühr</button></td></tr>`;
  }).join('');
  $('accountTable').innerHTML = `<thead><tr><th>Konto</th><th>Typ</th><th>Status</th><th>Größe</th><th>Gebühren</th><th>Payouts</th><th>Netto</th><th>Trading (Buchgewinn)</th><th></th></tr></thead>
    <tbody>${rows || '<tr><td colspan="9" class="dim">Noch keine Konten — oben rechts unter „Konten verwalten“ anlegen.</td></tr>'}
    ${unassigned ? `<tr class="dim"><td colspan="4">Propfirm-Gebühren ohne Konto</td><td class="n neg">${eur(unassigned)}</td><td colspan="4"></td></tr>` : ''}</tbody>`;
}

$('accountTable').addEventListener('click', (e) => {
  const b = e.target.closest('[data-fee]');
  if (!b) return;
  const acc = accounts.find(a => a.id === b.dataset.fee);
  const f = $('feeForm');
  f.hidden = false;
  f.dataset.account = acc.id;
  $('feeTitle').textContent = `Gebühr für ${acc.name}`;
  f.date.value = String(acc.created_at).slice(0, 10);
  f.amount.value = '';
  f.description.value = `${acc.prop_firm || 'Propfirm'} ${TYPE[acc.account_type] || ''} ${Number(acc.starting_balance).toLocaleString('de-DE')} ${acc.currency}`.replace(/\s+/g, ' ').trim();
  f.amount.focus();
});
$('feeCancel').onclick = () => { $('feeForm').hidden = true; };
$('feeForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const { error } = await supabase.from('business_expenses').insert({
    expense_date: f.date.value, category: 'propfirm_fees', description: f.description.value.trim(),
    amount: Number(f.amount.value), account_id: f.dataset.account,
  });
  if (error) { alert('Speichern fehlgeschlagen: ' + error.message); return; }
  f.hidden = true;
  await loadAll();
});

// ---------------------------------------------------------------------------
// EÜR
// ---------------------------------------------------------------------------
function eurGroups(ye) {
  const groups = new Map();
  for (const e of ye) {
    const [area, hint] = EUR_EXPENSE[e.category] || EUR_EXPENSE.other;
    const g = groups.get(area) || { area, hints: new Set(), rows: [] };
    g.hints.add(hint); g.rows.push(e);
    groups.set(area, g);
  }
  return [...groups.values()];
}

function checks(yp, ye) {
  const out = [];
  const pending = yp.filter(p => !COUNTED.includes(p.status));
  if (pending.length) out.push(`${pending.length} Payout(s) noch nicht als erhalten markiert — zählen erst beim Zufluss.`);
  const noReceipt = ye.filter(e => !e.receipt_url && !e.recurring_expense_id);
  if (noReceipt.length) out.push(`${noReceipt.length} Ausgabe(n) ohne hinterlegten Beleg.`);
  for (const inv of invoices.filter(i => inYear(i.invoice_date) || payouts.some(p => p.id === i.payout_id && inYear(p.payout_date)))) {
    const amount = Number(inv.unit_price) * Number(inv.quantity);
    const p = payouts.find(x => x.id === inv.payout_id) || payouts.find(x => Math.abs(Number(x.crypto_amount) - amount) < 0.01);
    if (p && Math.abs(new Date(inv.invoice_date) - new Date(p.payout_date)) > 31 * 86400000) {
      out.push(`Rechnung ${esc(inv.invoice_number)} ist auf den ${dmy(inv.invoice_date)} datiert, der passende Payout kam am ${dmy(p.payout_date)} — Datum prüfen.`);
    }
  }
  for (const p of yp.filter(p => COUNTED.includes(p.status))) {
    const amount = Number(p.crypto_amount);
    if (!invoices.some(i => i.payout_id === p.id || Math.abs(Number(i.unit_price) * Number(i.quantity) - amount) < 0.01)) {
      out.push(`Payout vom ${dmy(p.payout_date)} (${eur(p.amount_eur)}) hat keine Rechnung.`);
    }
  }
  if (!yp.length && !ye.length) out.push(`Für ${year} sind weder Payouts noch Ausgaben erfasst.`);
  if (!ye.some(e => e.category === 'propfirm_fees') && yp.length) out.push('Keine Propfirm-Gebühren erfasst — Challenges in diesem Jahr gekauft? Unter „Challenges & Konten“ nachtragen.');
  return out;
}

function renderEur(yp, ye, inc) {
  $('eurYear').textContent = year;
  const c = checks(yp, ye);
  $('eurChecks').innerHTML = c.length ? `<div class="bz-checks"><b>Prüfhinweise vor dem Export</b><ul>${c.map(x => `<li>${x}</li>`).join('')}</ul></div>` : '';
  const groups = eurGroups(ye);
  const totalExp = sum(ye);
  $('eurTable').innerHTML = `
    <thead><tr><th>Bereich (Anlage EÜR)</th><th>Inhalt</th><th>Posten</th><th>Betrag</th></tr></thead>
    <tbody>
      <tr class="sec"><td colspan="4">Betriebseinnahmen</td></tr>
      <tr><td>Betriebseinnahmen als umsatzsteuerlicher Kleinunternehmer</td><td class="s2">Payouts der Propfirms, EUR-Wert bei Zufluss</td><td class="n">${yp.filter(p => COUNTED.includes(p.status)).length}</td><td class="n pos">${eur(inc)}</td></tr>
      <tr class="sec"><td colspan="4">Betriebsausgaben</td></tr>
      ${groups.length ? groups.map(g => `<tr><td>${esc(g.area)}</td><td class="s2">${esc([...g.hints].join(' · '))}</td><td class="n">${g.rows.length}</td><td class="n neg">${eur(sum(g.rows))}</td></tr>`).join('')
        : '<tr class="dim"><td colspan="4">keine Ausgaben erfasst</td></tr>'}
      <tr class="tot"><td colspan="3">Summe Betriebsausgaben</td><td class="n neg">${eur(totalExp)}</td></tr>
      <tr class="tot big"><td colspan="3">Gewinn / Verlust ${year}</td><td class="n ${inc - totalExp >= 0 ? 'pos' : 'neg'}">${signedEur(inc - totalExp)}</td></tr>
    </tbody>`;
}

function csvCell(v) { return /[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v); }
const num = (v) => Number(v).toFixed(2).replace('.', ',');

$('eurCsv').onclick = () => {
  const yp = payouts.filter(p => inYear(p.payout_date) && COUNTED.includes(p.status));
  const ye = expenses.filter(e => inYear(e.expense_date));
  const lines = [['EÜR ' + year, '', '', '', '', ''], ['Bereich', 'Datum', 'Art', 'Beschreibung', 'Betrag EUR', 'Beleg']];
  for (const p of yp) {
    const acc = accounts.find(a => a.id === p.account_id);
    const de = (v) => String(v).replace('.', ',');
    lines.push(['Betriebseinnahmen als umsatzsteuerlicher Kleinunternehmer', dmy(p.payout_date), 'Payout',
      `${acc?.name || 'Konto'} · ${de(p.crypto_amount)} ${p.crypto_currency} × ${de(p.eur_rate)}`, num(p.amount_eur), p.receipt_url ? 'ja' : 'nein']);
  }
  for (const e of ye) {
    const [area] = EUR_EXPENSE[e.category] || EUR_EXPENSE.other;
    lines.push([area, dmy(e.expense_date), 'Ausgabe', e.description, num(-e.amount), e.receipt_url ? 'ja' : (e.recurring_expense_id ? 'Abo' : 'nein')]);
  }
  const inc = yp.reduce((s, p) => s + Number(p.amount_eur), 0), exp = sum(ye);
  lines.push([], ['Summe Betriebseinnahmen', '', '', '', num(inc), ''], ['Summe Betriebsausgaben', '', '', '', num(-exp), ''], ['Gewinn/Verlust', '', '', '', num(inc - exp), '']);
  const blob = new Blob(['﻿' + lines.map(r => r.map(csvCell).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `EUER_${year}.csv` });
  a.click();
  URL.revokeObjectURL(a.href);
};

$('eurPrint').onclick = () => {
  document.body.classList.add('print-eur');
  window.print();
  setTimeout(() => document.body.classList.remove('print-eur'), 500);
};

$('yearSelect').onchange = (e) => { year = Number(e.target.value); render(); };
window.addEventListener('account-changed', loadAll);

await initAccountSwitcher();
await loadAll();
