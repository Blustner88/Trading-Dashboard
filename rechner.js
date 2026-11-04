import { supabase } from './accounts.js';
import { toast } from './nav.js';
import { PAIRS } from './ideas.js';
import { instrument, calcLots } from './lotcalc.js';

// Lot-Rechner: Kontostand aus Startwert + Journal, Kurse für die Umrechnung aus fb_fx_rates (EZB, täglich).
// Felder lassen sich per ?pair=&entry=&sl=&tp= vorbelegen (Trade-Idee → „Lots berechnen“).

const $ = (id) => document.getElementById(id);
const ACCOUNT_KEY = 'td_lot_account', CONTRACT_KEY = 'td_lot_contract_';
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* privat-Modus */ } },
};
const num = (v) => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const money = (v, c) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: c }).format(v);
const de = (v, d = 2) => Number(v).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });

let accounts = [], rates = null, ratesDate = null, mode = 'levels';

async function load() {
  const [acc, tr, fx, risk] = await Promise.all([
    supabase.from('accounts').select('id, name, currency, starting_balance, daily_loss_limit_pct').eq('status', 'active').order('sort_order'),
    supabase.from('trades').select('account_id, profit_amount'),
    supabase.from('fb_fx_rates').select('date, currency, per_eur').order('date', { ascending: false }).limit(40),
    supabase.from('user_settings').select('value').eq('key', 'default_risk_pct').maybeSingle(),
  ]);
  if (fx.error || !fx.data?.length) toast('Umrechnungskurse konnten nicht geladen werden.', { error: true });
  ratesDate = fx.data?.[0]?.date || null;
  rates = Object.fromEntries((fx.data || []).filter(r => r.date === ratesDate).map(r => [r.currency, Number(r.per_eur)]));
  const profit = {};
  for (const t of tr.data || []) profit[t.account_id] = (profit[t.account_id] || 0) + (Number(t.profit_amount) || 0);
  accounts = (acc.data || []).map(a => ({ ...a, balance: Number(a.starting_balance) + (profit[a.id] || 0) }));

  $('lcAccount').innerHTML = accounts.map(a => `<option value="${a.id}"></option>`).join('') + '<option value="">Eigener Wert</option>';
  accounts.forEach((a, i) => { $('lcAccount').options[i].textContent = a.name; });
  const saved = store.get(ACCOUNT_KEY);
  if (saved != null && [...$('lcAccount').options].some(o => o.value === saved)) $('lcAccount').value = saved;
  $('lcRisk').value = risk.data && Number(risk.data.value) > 0 ? Number(risk.data.value) : 0.8;
  applyAccount();
}

function applyAccount() {
  const a = accounts.find(x => x.id === $('lcAccount').value);
  store.set(ACCOUNT_KEY, $('lcAccount').value);
  if (a) {
    $('lcBalance').value = a.balance.toFixed(2);
    $('lcCurrency').value = a.currency;
    $('lcBalanceHint').textContent = 'Startwert plus Trades aus dem Journal. Bitte mit MT5 vergleichen, du kannst den Wert hier ändern.';
  } else {
    $('lcBalanceHint').textContent = 'Trage deinen Kontostand selbst ein.';
  }
  $('lcCurrency').disabled = !!a;
  render();
}

function applyPair() {
  const inst = instrument($('lcPair').value);
  $('lcContractWrap').hidden = !inst || inst.fx;
  if (inst && !inst.fx) $('lcContract').value = num(store.get(CONTRACT_KEY + inst.pair)) || inst.contract;
  render();
}

function render() {
  const inst = instrument($('lcPair').value);
  const entry = num($('lcEntry').value), sl = num($('lcSl').value), tp = num($('lcTp').value);
  const currency = $('lcCurrency').value;
  const riskPct = num($('lcRisk').value);
  document.querySelectorAll('#lcMode .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.value === mode));
  $('lcLevels').hidden = mode !== 'levels';
  $('lcPipsWrap').hidden = mode !== 'pips';
  $('lcPipsLabel').textContent = `Stop Loss in ${inst?.unit || 'Pips'}`;
  $('lcRatesInfo').textContent = ratesDate ? `Umrechnung mit dem EZB-Kurs vom ${new Date(ratesDate).toLocaleDateString('de-DE')}.` : '';

  const distance = mode === 'levels'
    ? (entry != null && sl != null ? Math.abs(entry - sl) : null)
    : (num($('lcPips').value) != null && inst ? num($('lcPips').value) * inst.pip : null);
  const res = inst && calcLots({
    balance: num($('lcBalance').value), riskPct, currency, inst, distance, rates,
    contract: inst.fx ? inst.contract : num($('lcContract').value),
  });

  const warn = [];
  if ($('lcPair').value.trim() && !inst) warn.push('Dieses Symbol kenne ich nicht.');
  const long = entry != null && sl != null ? entry > sl : null;
  if (mode === 'levels' && tp != null && long != null && (long ? tp <= entry : tp >= entry)) warn.push('Der Take Profit liegt auf der falschen Seite des Entry.');
  const limit = Number(accounts.find(a => a.id === $('lcAccount').value)?.daily_loss_limit_pct);
  if (limit > 0 && riskPct >= limit) warn.push(`Das Risiko erreicht das Tageslimit des Kontos (${de(limit, 1)} %).`);
  if (res && res.lots === 0) warn.push('Das Risiko reicht nicht für die kleinste Lotgröße von 0,01.');
  $('lcWarn').hidden = !warn.length;
  $('lcWarn').textContent = warn.map(w => '⚠ ' + w).join(' ');

  if (!res) {
    $('lcLots').textContent = '–';
    $('lcDetails').innerHTML = '<p class="lc-empty">Pair, Risiko und Stop Loss eintragen.</p>';
    $('lcCopy').hidden = true;
    return;
  }
  $('lcLots').textContent = de(res.lots);
  $('lcCopy').hidden = res.lots === 0;
  const reward = mode === 'levels' && tp != null && long != null && (long ? tp > entry : tp < entry) ? Math.abs(tp - entry) : null;
  const rows = [
    ['Risiko', `${money(res.riskActual, currency)} <small>Ziel ${money(res.riskTarget, currency)}</small>`],
    ['Stop Loss', `${de(res.pips, 1)} ${inst.unit}${long == null || mode !== 'levels' ? '' : ` · ${long ? 'Long' : 'Short'}`}`],
    [`Wert je ${inst.unit === 'Punkte' ? 'Punkt' : 'Pip'} bei 1 Lot`, money(res.pipValue, currency)],
  ];
  if (reward != null) {
    rows.push(['Bei Take Profit', `<span class="pos">+${money(res.lots * reward / distance * res.lossPerLot, currency)}</span> <small>${de(reward / distance)}R</small>`]);
  }
  $('lcDetails').innerHTML = rows.map(([k, v]) => `<div class="lc-row"><span>${k}</span><b>${v}</b></div>`).join('');
}

$('lcDatalist').innerHTML = PAIRS.map(p => `<option value="${p}"></option>`).join('');
$('lcMode').onclick = (e) => { const b = e.target.closest('.seg-btn'); if (b) { mode = b.dataset.value; render(); } };
$('lcAccount').onchange = applyAccount;
$('lcPair').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase(); applyPair(); });
$('lcContract').addEventListener('input', (e) => {
  const inst = instrument($('lcPair').value);
  if (inst && num(e.target.value) > 0) store.set(CONTRACT_KEY + inst.pair, e.target.value);
});
$('lcForm').addEventListener('input', render);
$('lcForm').addEventListener('change', render);
$('lcForm').onsubmit = (e) => e.preventDefault();
$('lcCopy').onclick = async () => {
  try {
    await navigator.clipboard.writeText(String(num($('lcLots').textContent.replace(',', '.'))));
    toast('Lotgröße kopiert.');
  } catch {
    toast('Kopieren hat nicht geklappt.');
  }
};

const q = new URLSearchParams(location.search);
for (const [param, id] of [['pair', 'lcPair'], ['entry', 'lcEntry'], ['sl', 'lcSl'], ['tp', 'lcTp']]) {
  if (q.get(param)) $(id).value = q.get(param);
}
await load();
applyPair();
