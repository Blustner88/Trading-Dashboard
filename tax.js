import { initAccountSwitcher } from './accounts.js';
import { esc, eur, signedEur, dmy, yearOf, COUNTED, EUR_EXPENSE, income, sum, loadBiz, yearOptions, eurGroups, todos, todoList } from './biz.js';

// Steuer & EÜR: Prüfhinweise, EÜR gruppiert nach Anlage EÜR, Belegliste, CSV/Druck,
// Links auf Jahresabschluss-Bericht und Rechnungen (nur Inhaber).

const $ = (id) => document.getElementById(id);
let d = { accounts: [], payouts: [], expenses: [], invoices: [], trades: [] };
let year = new Date().getFullYear() - 1;   // die EÜR macht man meist fürs Vorjahr

async function loadAll() {
  d = await loadBiz();
  $('yearSelect').innerHTML = yearOptions(d, year);
  render();
}

const inYear = (x) => yearOf(x) === year;

function render() {
  const yp = d.payouts.filter(p => inYear(p.payout_date));
  const ye = d.expenses.filter(e => inYear(e.expense_date));
  const inc = income(yp);
  const owner = !document.documentElement.classList.contains('view-product');

  $('todoYear').textContent = `für ${year}`;
  $('todoList').innerHTML = todoList(todos(d, year).filter(x => owner || !x.owner));

  // EÜR
  $('eurYear').textContent = year;
  const groups = eurGroups(ye);
  const totalExp = sum(ye);
  $('eurTable').innerHTML = `
    <thead><tr><th>Bereich (Anlage EÜR)</th><th>Inhalt</th><th>Posten</th><th>Betrag</th></tr></thead>
    <tbody>
      <tr class="sec"><td colspan="4">Betriebseinnahmen</td></tr>
      <tr><td>Betriebseinnahmen als umsatzsteuerlicher Kleinunternehmer</td><td class="s2">Auszahlungen der Propfirms, Euro-Wert bei Zufluss</td><td class="n">${yp.filter(p => COUNTED.includes(p.status)).length}</td><td class="n pos">${eur(inc)}</td></tr>
      <tr class="sec"><td colspan="4">Betriebsausgaben</td></tr>
      ${groups.length ? groups.map(g => `<tr><td>${esc(g.area)}</td><td class="s2">${esc([...g.hints].join(' · '))}</td><td class="n">${g.rows.length}</td><td class="n neg">${eur(sum(g.rows))}</td></tr>`).join('')
        : '<tr class="dim"><td colspan="4">keine Ausgaben erfasst</td></tr>'}
      <tr class="tot"><td colspan="3">Summe Betriebsausgaben</td><td class="n neg">${eur(totalExp)}</td></tr>
      <tr class="tot big"><td colspan="3">Gewinn / Verlust ${year}</td><td class="n ${inc - totalExp >= 0 ? 'pos' : 'neg'}">${signedEur(inc - totalExp)}</td></tr>
    </tbody>`;

  // Belegliste
  const rows = [
    ...yp.map(p => ({ date: p.payout_date, title: `Auszahlung ${d.accounts.find(a => a.id === p.account_id)?.name || ''}`, amount: Number(p.amount_eur), ok: !!p.receipt_url, url: p.receipt_url, inc: true })),
    ...ye.map(e => ({ date: e.expense_date, title: e.description, amount: -Number(e.amount), ok: !!e.receipt_url, url: e.receipt_url })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const missing = rows.filter(r => !r.ok).length;
  $('receiptSum').textContent = rows.length ? `${rows.length - missing} von ${rows.length} mit Beleg` : '';
  $('toBookings').href = `accounting.html?jahr=${year}${missing ? '#ohne-beleg' : ''}`;
  $('yearEndLink').href = `accounting.html?jahr=${year}#jahresabschluss`;
  $('receiptList').innerHTML = rows.length ? rows.map(r => `
    <div class="row"><span class="mono">${dmy(r.date)}</span><span class="t">${esc(r.title)}</span>
      <span class="b">${r.ok ? `<a class="badge pos" href="${esc(r.url)}" target="_blank" rel="noopener">Beleg ✓</a>` : '<span class="badge warn">fehlt</span>'}</span>
      <span class="a ${r.inc ? 'pos' : 'neg'}">${signedEur(r.amount)}</span></div>`).join('')
    : `<p class="empty">Keine Buchungen in ${year}.</p>`;
}

function csvCell(v) { return /[;"\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v); }
const num = (v) => Number(v).toFixed(2).replace('.', ',');

$('eurCsv').onclick = () => {
  const yp = d.payouts.filter(p => inYear(p.payout_date) && COUNTED.includes(p.status));
  const ye = d.expenses.filter(e => inYear(e.expense_date));
  const lines = [['EÜR ' + year, '', '', '', '', ''], ['Bereich', 'Datum', 'Art', 'Beschreibung', 'Betrag EUR', 'Beleg']];
  for (const p of yp) {
    const acc = d.accounts.find(a => a.id === p.account_id);
    const de = (v) => String(v).replace('.', ',');
    lines.push(['Betriebseinnahmen als umsatzsteuerlicher Kleinunternehmer', dmy(p.payout_date), 'Auszahlung',
      `${acc?.name || 'Konto'} · ${de(p.crypto_amount)} ${p.crypto_currency} × ${de(p.eur_rate)}`, num(p.amount_eur), p.receipt_url ? 'ja' : 'nein']);
  }
  for (const e of ye) {
    const [area] = EUR_EXPENSE[e.category] || EUR_EXPENSE.other;
    lines.push([area, dmy(e.expense_date), 'Ausgabe', e.description, num(-e.amount), e.receipt_url ? 'ja' : 'nein']);
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
window.addEventListener('view-changed', render);

await initAccountSwitcher();
await loadAll();
