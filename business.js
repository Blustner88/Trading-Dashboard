import { supabase, initAccountSwitcher } from './accounts.js';
import { toastError } from './nav.js';
import { esc, eur, signedEur, dmy, yearOf, COUNTED, MONTHS, TYPE, STATUS, income, sum, loadBiz, yearOptions, todos, todoList } from './biz.js';

// Business-Überblick: Jahresbilanz, offene Aufgaben, Monate (Diagramm + Tabelle),
// Challenges & Konten mit Gebühren gegen Auszahlungen. EÜR steht unter „Steuer & EÜR“.

const $ = (id) => document.getElementById(id);
let d = { accounts: [], payouts: [], expenses: [], invoices: [], trades: [] };
let year = new Date().getFullYear();

async function loadAll() {
  d = await loadBiz();
  $('yearSelect').innerHTML = yearOptions(d, year);
  render();
}

const inYear = (x) => yearOf(x) === year;

function render() {
  const yp = d.payouts.filter(p => inYear(p.payout_date));
  const ye = d.expenses.filter(e => inYear(e.expense_date));
  const inc = income(yp), exp = sum(ye), fees = sum(ye.filter(e => e.category === 'propfirm_fees'));
  const res = inc - exp;
  $('kIncome').textContent = eur(inc);
  $('kExpenses').textContent = eur(exp);
  $('kExpSub').textContent = `davon Challenges ${eur(fees)}`;
  $('kResult').textContent = signedEur(res);
  $('kResult').className = `kpi-value ${res >= 0 ? 'pos' : 'neg'}`;
  $('kTotal').textContent = `seit Beginn ${signedEur(income(d.payouts) - sum(d.expenses))}`;

  const owner = !document.documentElement.classList.contains('view-product');
  const t = todos(d, year).filter(x => owner || !x.owner);
  $('kTodo').textContent = t.length || '✓';
  $('kTodo').className = `kpi-value ${t.some(x => x.level === 'warn') ? 'warn' : t.length ? '' : 'pos'}`;
  $('todoYear').textContent = `für ${year}`;
  $('todoList').innerHTML = todoList(t);

  renderMonths(yp, ye);
  renderAccounts();
}

function renderMonths(yp, ye) {
  let cum = 0;
  const data = MONTHS.map((m, k) => {
    const mp = yp.filter(p => new Date(p.payout_date).getMonth() === k);
    const me = ye.filter(e => new Date(e.expense_date).getMonth() === k);
    const inc = income(mp), fee = sum(me.filter(e => e.category === 'propfirm_fees')), oth = sum(me.filter(e => e.category !== 'propfirm_fees'));
    cum += inc - fee - oth;
    return { m, inc, fee, oth, out: fee + oth, res: inc - fee - oth, cum, empty: !mp.length && !me.length };
  });

  // Diagramm: Balken je Monat (oben Einnahmen, unten Ausgaben), Linie = kumuliertes Ergebnis
  const W = 720, H = 220, padL = 48, padR = 10, top = 14, bottom = 26;
  const maxBar = Math.max(1, ...data.map(x => Math.max(x.inc, x.out)));
  const maxCum = Math.max(1, ...data.map(x => Math.abs(x.cum)));
  const scale = Math.max(maxBar, maxCum);
  const mid = top + (H - top - bottom) / 2, half = (H - top - bottom) / 2;
  const y = (v) => mid - (v / scale) * half;
  const slot = (W - padL - padR) / 12, bw = Math.min(22, slot * 0.36);
  const bars = data.map((x, k) => {
    const cx = padL + slot * k + slot / 2;
    return `<rect x="${(cx - bw - 1).toFixed(1)}" y="${y(x.inc).toFixed(1)}" width="${bw}" height="${(mid - y(x.inc)).toFixed(1)}" rx="3" style="fill:var(--profit)"><title>${x.m}: Einnahmen ${eur(x.inc)}</title></rect>
      <rect x="${(cx + 1).toFixed(1)}" y="${mid}" width="${bw}" height="${(y(-x.out) - mid).toFixed(1)}" rx="3" style="fill:var(--loss)"><title>${x.m}: Ausgaben ${eur(x.out)}</title></rect>
      <text x="${cx.toFixed(1)}" y="${H - 8}" text-anchor="middle" font-size="10.5" style="fill:var(--text-faint)">${x.m}</text>`;
  }).join('');
  const line = data.map((x, k) => `${k ? 'L' : 'M'}${(padL + slot * k + slot / 2).toFixed(1)},${y(x.cum).toFixed(1)}`).join(' ');
  const ticks = [scale, scale / 2, 0, -scale / 2, -scale].map(v =>
    `<line x1="${padL}" x2="${W - padR}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" style="stroke:var(--border-soft)" ${v === 0 ? '' : 'stroke-dasharray="3,4"'} />
     <text x="${padL - 6}" y="${(y(v) + 3).toFixed(1)}" text-anchor="end" font-size="10" style="fill:var(--text-faint)">${Math.round(v).toLocaleString('de-DE')}</text>`).join('');
  $('monthChart').innerHTML = data.every(x => x.empty)
    ? `<p class="empty">Für ${year} gibt es noch keine Buchungen.</p>`
    : `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Einnahmen und Ausgaben je Monat ${year}">${ticks}${bars}
        <path d="${line}" fill="none" style="stroke:var(--indigo-bright)" stroke-width="2" stroke-linejoin="round" />
        ${data.map((x, k) => `<circle cx="${(padL + slot * k + slot / 2).toFixed(1)}" cy="${y(x.cum).toFixed(1)}" r="2.5" style="fill:var(--indigo-bright)"><title>kumuliert ${signedEur(x.cum)}</title></circle>`).join('')}
      </svg>`;

  $('monthTable').innerHTML = `<thead><tr><th>Monat</th><th>Einnahmen</th><th>Gebühren</th><th>Sonstige</th><th>Ergebnis</th><th>Kumuliert</th></tr></thead><tbody>${data.map(x => `
    <tr class="${x.empty ? 'dim' : ''}"><td>${x.m}</td><td class="n pos">${x.inc ? eur(x.inc) : '–'}</td><td class="n neg">${x.fee ? eur(x.fee) : '–'}</td>
      <td class="n neg">${x.oth ? eur(x.oth) : '–'}</td><td class="n ${x.res > 0 ? 'pos' : x.res < 0 ? 'neg' : ''}">${x.empty ? '–' : signedEur(x.res)}</td>
      <td class="n ${x.cum > 0 ? 'pos' : x.cum < 0 ? 'neg' : ''}">${signedEur(x.cum)}</td></tr>`).join('')}</tbody>`;
}

function renderAccounts() {
  const feesFor = (id) => sum(d.expenses.filter(e => e.account_id === id));
  const payFor = (id) => income(d.payouts.filter(p => p.account_id === id));
  const unassigned = sum(d.expenses.filter(e => e.category === 'propfirm_fees' && !e.account_id));
  const funded = d.accounts.filter(a => a.account_type === 'funded' || a.status === 'passed').length;
  const lost = d.accounts.filter(a => a.status === 'breached').length;
  const allFees = sum(d.expenses.filter(e => e.category === 'propfirm_fees'));
  const allPay = income(d.payouts);
  $('challengeStats').innerHTML = [
    ['Konten', d.accounts.length], ['bestanden / Funded', funded], ['verloren', lost],
    ['Gebühren gesamt', eur(allFees)], ['Auszahlungen gesamt', eur(allPay)],
    ['Auszahlung je 1 € Gebühr', allFees ? (allPay / allFees).toFixed(2).replace('.', ',') : '–'],
  ].map(([l, v]) => `<div><span class="kpi-label">${l}</span><b>${v}</b></div>`).join('');

  const rows = d.accounts.map(a => {
    const f = feesFor(a.id), p = payFor(a.id), net = p - f;
    const tr = d.trades.filter(t => t.account_id === a.id).reduce((s, t) => s + (Number(t.profit_amount) || 0), 0);
    const needsFee = a.account_type === 'challenge';
    return `<tr><td><span class="dot" style="background:${esc(a.color)}"></span>${esc(a.name)}<span class="s">${esc(a.prop_firm || '')} · seit ${dmy(a.created_at)}</span></td>
      <td>${esc(TYPE[a.account_type] || a.account_type)}</td><td><span class="st ${esc(a.status)}">${esc(STATUS[a.status] || a.status)}</span></td>
      <td class="n neg">${f ? eur(f) : needsFee ? '<span class="miss">fehlt</span>' : '–'}</td><td class="n pos">${p ? eur(p) : '–'}</td>
      <td class="n ${net > 0 ? 'pos' : net < 0 ? 'neg' : ''}">${f || p ? signedEur(net) : '–'}</td>
      <td class="n s2">${tr ? `${tr > 0 ? '+' : ''}${tr.toLocaleString('de-DE', { maximumFractionDigits: 0 })} ${esc(a.currency)}` : '–'}</td>
      <td><button class="btn-ghost sm" data-fee="${esc(a.id)}">+ Gebühr</button></td></tr>`;
  }).join('');
  $('accountTable').innerHTML = `<thead><tr><th>Konto</th><th>Typ</th><th>Status</th><th>Gebühren</th><th>Auszahlungen</th><th>Netto</th><th>Trading (Buchgewinn)</th><th></th></tr></thead>
    <tbody>${rows || '<tr><td colspan="8" class="dim">Noch keine Konten – unter „Einstellungen → Konten“ anlegen.</td></tr>'}
    ${unassigned ? `<tr class="dim"><td colspan="3">Propfirm-Gebühren ohne Konto</td><td class="n neg">${eur(unassigned)}</td><td colspan="4"></td></tr>` : ''}</tbody>`;
}

$('accountTable').addEventListener('click', (e) => {
  const b = e.target.closest('[data-fee]');
  if (!b) return;
  const acc = d.accounts.find(a => a.id === b.dataset.fee);
  const f = $('feeForm');
  f.hidden = false;
  f.dataset.account = acc.id;
  $('feeTitle').textContent = `Gebühr für ${acc.name}`;
  f.date.value = String(acc.created_at).slice(0, 10);
  f.amount.value = '';
  f.description.value = `${acc.prop_firm || 'Propfirm'} – Challenge-Gebühr ${TYPE[acc.account_type] || ''} (${acc.name})`.replace(/\s+/g, ' ').trim();
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
  if (error) { toastError('Speichern fehlgeschlagen', error); return; }
  f.hidden = true;
  await loadAll();
});

$('yearSelect').onchange = (e) => { year = Number(e.target.value); render(); };
window.addEventListener('account-changed', loadAll);
window.addEventListener('view-changed', render);

await initAccountSwitcher();
await loadAll();
