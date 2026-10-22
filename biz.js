import { supabase } from './accounts.js';

// Gemeinsame Bausteine für Business: Überblick (business.js) und Steuer & EÜR (tax.js).
// Einnahmen = Payouts beim Zufluss (Status erhalten/umgetauscht), keine Buchgewinne.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const eur = (v) => `${Number(v).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
export const signedEur = (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${eur(Math.abs(v))}`;
export const dmy = (d) => d ? new Date(d + (String(d).length === 10 ? 'T00:00:00' : '')).toLocaleDateString('de-DE') : '–';
export const yearOf = (d) => Number(String(d).slice(0, 4));

export const COUNTED = ['received', 'converted_to_eur'];
export const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
export const TYPE = { challenge: 'Challenge', verification: 'Verifizierung', funded: 'Funded', personal: 'Privat' };
export const STATUS = { active: 'Aktiv', passed: 'Bestanden', breached: 'Verloren', closed: 'Geschlossen' };
// Ausgaben-Kategorie -> Bereich der Anlage EÜR (Bezeichnung, Hinweis)
export const EUR_EXPENSE = {
  propfirm_fees: ['Übrige unbeschränkt abziehbare Betriebsausgaben', 'Propfirm-Gebühren (Challenges)'],
  software_tools: ['Laufende EDV-Kosten', 'Software, Abos, Datenfeeds'],
  hardware: ['Geringwertige Wirtschaftsgüter / AfA', 'Hardware — Computer-Hardware seit 2021 mit 1 Jahr Nutzungsdauer'],
  education: ['Fortbildungskosten', 'Kurse, Bücher, Coaching'],
  office_home: ['Arbeitszimmer / Homeoffice-Pauschale', 'Raumkosten oder Tagespauschale'],
  other: ['Übrige unbeschränkt abziehbare Betriebsausgaben', 'Sonstiges'],
};

export const income = (rows) => rows.filter(p => COUNTED.includes(p.status)).reduce((s, p) => s + Number(p.amount_eur), 0);
export const sum = (rows) => rows.reduce((s, e) => s + Number(e.amount), 0);

export async function loadBiz() {
  const [a, p, e, i, t] = await Promise.all([
    supabase.from('accounts').select('*').order('created_at'),
    supabase.from('payouts').select('*').order('payout_date'),
    supabase.from('business_expenses').select('*').order('expense_date'),
    supabase.from('invoices').select('*').order('invoice_date'),
    supabase.from('trades').select('account_id, profit_amount').eq('status', 'closed'),
  ]);
  return { accounts: a.data || [], payouts: p.data || [], expenses: e.data || [], invoices: i.data || [], trades: t.data || [] };
}

export function yearOptions(d, year) {
  const now = new Date().getFullYear();
  const ys = [...d.payouts.map(p => yearOf(p.payout_date)), ...d.expenses.map(e => yearOf(e.expense_date)), ...d.accounts.map(a => yearOf(a.created_at))];
  const min = Math.min(now - 1, ...ys.filter(Boolean));
  return Array.from({ length: now - min + 1 }, (_, k) => now - k).map(y => `<option${y === year ? ' selected' : ''}>${y}</option>`).join('');
}

export function eurGroups(ye) {
  const groups = new Map();
  for (const e of ye) {
    const [area, hint] = EUR_EXPENSE[e.category] || EUR_EXPENSE.other;
    const g = groups.get(area) || { area, hints: new Set(), rows: [] };
    g.hints.add(hint); g.rows.push(e);
    groups.set(area, g);
  }
  return [...groups.values()];
}

// Offene Aufgaben des Jahres: [{ level: 'warn'|'info', text, href, owner }]
// owner = nur für den Inhaber relevant (z. B. eigene Rechnungen), in der Produkt-Ansicht ausgeblendet
export function todos(d, year) {
  const inYear = (x) => yearOf(x) === year;
  const yp = d.payouts.filter(p => inYear(p.payout_date));
  const ye = d.expenses.filter(e => inYear(e.expense_date));
  const out = [];
  const book = `accounting.html?jahr=${year}`;

  const pending = yp.filter(p => !COUNTED.includes(p.status));
  if (pending.length) out.push({ level: 'warn', text: `${pending.length} Auszahlung(en) noch nicht als erhalten markiert – zählen erst beim Zufluss.`, href: book });

  const noReceipt = [...ye.filter(e => !e.receipt_url), ...yp.filter(p => !p.receipt_url)];
  if (noReceipt.length) out.push({ level: 'warn', text: `${noReceipt.length} Buchung(en) ohne Beleg.`, href: `${book}#ohne-beleg` });

  // Challenge-Konten ohne erfasste Gebühr (nur Konten, die in diesem Jahr angelegt wurden)
  for (const a of d.accounts.filter(a => inYear(a.created_at) && a.account_type === 'challenge')) {
    if (!d.expenses.some(e => e.account_id === a.id)) out.push({ level: 'info', text: `Keine Gebühr für „${a.name}“ erfasst.`, href: 'business.html#konten' });
  }

  // Monatliche Abos, deren letzte Abbuchung über 35 Tage her ist (nur laufendes Jahr)
  if (year === new Date().getFullYear()) {
    const byKey = new Map();
    for (const e of d.expenses.filter(e => e.category === 'software_tools')) {
      const key = e.description.split(/,| – /)[0].replace(/\s*\(.*$/, '').trim();
      byKey.set(key, [...(byKey.get(key) || []), e]);
    }
    for (const [key, rows] of byKey) {
      if (rows.length < 3) continue;
      const last = rows.map(r => r.expense_date).sort().pop();
      const days = (Date.now() - new Date(last + 'T00:00:00')) / 864e5;
      const recentMonths = rows.filter(r => (Date.now() - new Date(r.expense_date + 'T00:00:00')) / 864e5 < 200).length;
      if (days > 35 && days < 75 && recentMonths >= 3) out.push({ level: 'info', text: `${key}: letzte Abbuchung am ${dmy(last)} – fehlt ein Monat oder wurde gekündigt?`, href: book });
    }
  }

  // Eigene Rechnungen an Propfirms (nur Inhaber)
  for (const p of yp.filter(p => COUNTED.includes(p.status))) {
    const amount = Number(p.crypto_amount);
    if (!d.invoices.some(i => i.payout_id === p.id || Math.abs(Number(i.unit_price) * Number(i.quantity) - amount) < 0.01)) {
      out.push({ level: 'info', text: `Auszahlung vom ${dmy(p.payout_date)} (${eur(p.amount_eur)}) hat keine Rechnung.`, href: 'invoices.html', owner: true });
    }
  }
  if (!yp.length && !ye.length) out.push({ level: 'info', text: `Für ${year} sind weder Einnahmen noch Ausgaben erfasst.`, href: book });
  return out;
}

export function todoList(items) {
  return items.length
    ? `<ul class="bz-todo">${items.map(t => `<li class="${t.level}"${t.owner ? ' data-owner' : ''}><a href="${esc(t.href)}">${esc(t.text)}</a></li>`).join('')}</ul>`
    : '<p class="bz-done">Alles erledigt – keine offenen Aufgaben.</p>';
}
