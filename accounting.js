import { supabase, initAccountSwitcher, getAccounts } from './accounts.js';

const $ = (id) => document.getElementById(id);

const CATEGORY_LABELS = {
  propfirm_fees: 'Propfirm-Gebühren',
  software_tools: 'Software/Tools',
  hardware: 'Hardware',
  education: 'Fortbildung',
  office_home: 'Büro/Home-Office',
  other: 'Sonstiges',
};

let allTrades = [];
let allExpenses = [];
let currentYear = new Date().getFullYear();
let currentPeriod = 'year'; // year | q1..q4 | month
let currentMonth = new Date().getMonth() + 1;

async function init() {
  await initAccountSwitcher();
  buildYearSelect();
  buildMonthSelect();
  bindEvents();
  await loadData();
}

function buildYearSelect() {
  const sel = $('yearSelect');
  const nowYear = new Date().getFullYear();
  const years = [];
  for (let y = nowYear; y >= nowYear - 5; y--) years.push(y);
  sel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
  sel.value = currentYear;
  sel.onchange = () => { currentYear = parseInt(sel.value, 10); render(); };
}

function buildMonthSelect() {
  const sel = $('monthSelect');
  const names = ['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
  sel.innerHTML = names.map((n, i) => `<option value="${i + 1}">${n}</option>`).join('');
  sel.value = currentMonth;
  sel.onchange = () => { currentMonth = parseInt(sel.value, 10); render(); };
}

function bindEvents() {
  document.querySelectorAll('#periodChips .chip').forEach(chip => {
    chip.onclick = () => {
      currentPeriod = chip.dataset.period;
      document.querySelectorAll('#periodChips .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      $('monthSelect').style.display = currentPeriod === 'month' ? 'inline-block' : 'none';
      render();
    };
  });

  $('addExpenseBtn').onclick = () => openExpenseModal();
  $('expenseModalClose').onclick = closeExpenseModal;
  $('exp_cancelBtn').onclick = closeExpenseModal;
  $('expenseOverlay').onclick = (e) => { if (e.target.id === 'expenseOverlay') closeExpenseModal(); };
  $('expenseForm').onsubmit = handleExpenseSave;
  $('exp_deleteBtn').onclick = handleExpenseDelete;
  $('exp_receipt').onchange = (e) => previewFile(e.target.files[0]);

  $('exportCsvBtn').onclick = exportCsv;

  window.addEventListener('account-changed', loadData);
}

function previewFile(file) {
  const target = $('expReceiptPreview');
  target.innerHTML = '';
  if (!file || !file.type.startsWith('image/')) return;
  const img = document.createElement('img');
  img.src = URL.createObjectURL(file);
  target.appendChild(img);
}

async function loadData() {
  const { data: trades } = await supabase.from('trades').select('account_id, entry_date, status, profit_amount').eq('status', 'closed');
  allTrades = trades || [];

  const { data: expenses } = await supabase.from('business_expenses').select('*').order('expense_date', { ascending: false });
  allExpenses = expenses || [];

  render();
}

function getPeriodRange() {
  let startMonth, endMonth;
  if (currentPeriod === 'year') { startMonth = 1; endMonth = 12; }
  else if (currentPeriod === 'q1') { startMonth = 1; endMonth = 3; }
  else if (currentPeriod === 'q2') { startMonth = 4; endMonth = 6; }
  else if (currentPeriod === 'q3') { startMonth = 7; endMonth = 9; }
  else if (currentPeriod === 'q4') { startMonth = 10; endMonth = 12; }
  else { startMonth = currentMonth; endMonth = currentMonth; }

  const start = new Date(currentYear, startMonth - 1, 1);
  const end = new Date(currentYear, endMonth, 1); // exclusive
  return { start, end };
}

function render() {
  const { start, end } = getPeriodRange();

  const periodTrades = allTrades.filter(t => {
    const d = new Date(t.entry_date);
    return d >= start && d < end;
  });
  const periodExpenses = allExpenses.filter(e => {
    const d = new Date(e.expense_date + 'T00:00:00');
    return d >= start && d < end;
  });

  renderIncome(periodTrades);
  renderExpenseCategories(periodExpenses);
  renderExpenseList(periodExpenses);
  renderResult(periodTrades, periodExpenses);
}

function renderIncome(periodTrades) {
  const accounts = getAccounts();
  const tbody = document.querySelector('#incomeTable tbody');
  tbody.innerHTML = '';

  let grandTotal = 0;
  const rows = accounts.map(acc => {
    const accTrades = periodTrades.filter(t => t.account_id === acc.id);
    const sum = accTrades.reduce((s, t) => s + (Number(t.profit_amount) || 0), 0);
    grandTotal += sum;
    return { acc, sum };
  }).filter(r => r.sum !== 0 || getAccounts().length <= 6);

  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="font-family:var(--font-body); color:var(--text-faint); text-align:center; padding:16px 0;">Keine Konten</td></tr>`;
  }

  rows.forEach(r => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><span class="acc-dot-inline" style="background:${r.acc.color}"></span>${escapeHtml(r.acc.name)}</td>
      <td>${accountTypeLabel(r.acc.account_type)}</td>
      <td class="${r.sum >= 0 ? 'pos' : 'neg'}">${r.sum >= 0 ? '+' : ''}${r.sum.toFixed(2)} €</td>
    `;
    tbody.appendChild(tr);
  });

  $('sumIncome').textContent = `${grandTotal >= 0 ? '+' : ''}${grandTotal.toFixed(2)} €`;
  return grandTotal;
}

function accountTypeLabel(type) {
  return { personal: 'Personal', challenge: 'Challenge', verification: 'Verification', funded: 'Funded' }[type] || type;
}

function renderExpenseCategories(periodExpenses) {
  const tbody = document.querySelector('#expenseCategoryTable tbody');
  tbody.innerHTML = '';

  const groups = {};
  periodExpenses.forEach(e => {
    groups[e.category] = (groups[e.category] || 0) + Number(e.amount);
  });

  const rows = Object.entries(groups).sort((a, b) => b[1] - a[1]);
  if (rows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="2" style="font-family:var(--font-body); color:var(--text-faint); text-align:center; padding:16px 0;">Keine Ausgaben im Zeitraum</td></tr>`;
    return;
  }

  rows.forEach(([cat, sum]) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${CATEGORY_LABELS[cat] || cat}</td><td class="neg">${sum.toFixed(2)} €</td>`;
    tbody.appendChild(tr);
  });
}

function renderExpenseList(periodExpenses) {
  const tbody = document.querySelector('#expenseListTable tbody');
  tbody.innerHTML = '';

  if (periodExpenses.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="font-family:var(--font-body); color:var(--text-faint); text-align:center; padding:16px 0;">Keine Ausgaben im Zeitraum</td></tr>`;
    return;
  }

  periodExpenses.forEach(e => {
    const tr = document.createElement('tr');
    const dateStr = new Date(e.expense_date + 'T00:00:00').toLocaleDateString('de-DE');
    tr.innerHTML = `
      <td>${dateStr}</td>
      <td>${CATEGORY_LABELS[e.category] || e.category}</td>
      <td>${escapeHtml(e.description)}</td>
      <td class="neg">${Number(e.amount).toFixed(2)} €</td>
      <td class="expense-row-actions">
        <button class="icon-btn" data-action="edit" data-id="${e.id}">✎</button>
        ${e.receipt_url ? `<a class="icon-btn" href="${e.receipt_url}" target="_blank" rel="noopener">📎</a>` : ''}
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.onclick = () => openExpenseModal(allExpenses.find(e => e.id === btn.dataset.id));
  });
}

function renderResult(periodTrades, periodExpenses) {
  const income = periodTrades.reduce((s, t) => s + (Number(t.profit_amount) || 0), 0);
  const expenses = periodExpenses.reduce((s, e) => s + Number(e.amount), 0);
  const result = income - expenses;

  $('sumExpenses').textContent = `-${expenses.toFixed(2)} €`;
  $('sumResult').textContent = `${result >= 0 ? '+' : ''}${result.toFixed(2)} €`;
  $('sumResult').className = `kpi-value ${result >= 0 ? 'pos' : 'neg'}`;
}

// ---------- Expense modal ----------
function openExpenseModal(expense = null) {
  $('expenseForm').reset();
  $('expReceiptPreview').innerHTML = '';
  $('exp_id').value = expense ? expense.id : '';
  $('expenseModalTitle').textContent = expense ? 'Ausgabe bearbeiten' : 'Ausgabe erfassen';
  $('exp_deleteBtn').style.display = expense ? 'block' : 'none';

  if (expense) {
    $('exp_date').value = expense.expense_date;
    $('exp_category').value = expense.category;
    $('exp_description').value = expense.description;
    $('exp_amount').value = expense.amount;
    $('exp_notes').value = expense.notes || '';
    if (expense.receipt_url) {
      const img = document.createElement('img');
      img.src = expense.receipt_url;
      $('expReceiptPreview').appendChild(img);
    }
  } else {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    $('exp_date').value = d.toISOString().slice(0, 10);
  }

  $('expenseOverlay').classList.add('visible');
}

function closeExpenseModal() {
  $('expenseOverlay').classList.remove('visible');
}

async function handleExpenseSave(e) {
  e.preventDefault();
  const id = $('exp_id').value;

  let receiptUrl = null;
  const file = $('exp_receipt').files[0];
  if (file) {
    const ext = file.name.split('.').pop();
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('business-receipts').upload(path, file);
    if (!upErr) {
      const { data } = supabase.storage.from('business-receipts').getPublicUrl(path);
      receiptUrl = data.publicUrl;
    }
  }

  const payload = {
    expense_date: $('exp_date').value,
    category: $('exp_category').value,
    description: $('exp_description').value.trim(),
    amount: parseFloat($('exp_amount').value),
    notes: $('exp_notes').value || null,
  };
  if (receiptUrl) payload.receipt_url = receiptUrl;

  if (id) {
    await supabase.from('business_expenses').update(payload).eq('id', id);
  } else {
    await supabase.from('business_expenses').insert(payload);
  }

  closeExpenseModal();
  await loadData();
}

async function handleExpenseDelete() {
  const id = $('exp_id').value;
  if (!id) return;
  if (!confirm('Diese Ausgabe wirklich löschen?')) return;
  await supabase.from('business_expenses').delete().eq('id', id);
  closeExpenseModal();
  await loadData();
}

// ---------- CSV export ----------
function exportCsv() {
  const { start, end } = getPeriodRange();
  const periodTrades = allTrades.filter(t => { const d = new Date(t.entry_date); return d >= start && d < end; });
  const periodExpenses = allExpenses.filter(e => { const d = new Date(e.expense_date + 'T00:00:00'); return d >= start && d < end; });
  const accounts = getAccounts();

  const lines = [];
  lines.push('Typ;Datum;Kategorie/Account;Beschreibung;Betrag(EUR)');

  periodTrades.forEach(t => {
    const acc = accounts.find(a => a.id === t.account_id);
    lines.push(`Einnahme;${t.entry_date.slice(0,10)};${acc ? acc.name : '—'};Trading-Ergebnis;${(Number(t.profit_amount)||0).toFixed(2)}`);
  });
  periodExpenses.forEach(e => {
    lines.push(`Ausgabe;${e.expense_date};${CATEGORY_LABELS[e.category] || e.category};${e.description.replace(/;/g, ',')};-${Number(e.amount).toFixed(2)}`);
  });

  const csv = lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Buchhaltung_${currentYear}_${currentPeriod}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

init();
