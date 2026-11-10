// Mentoring-Plan "Weg zum Top-Trader": reine Rechnung ohne Seite, damit sie sich testen lässt.
// Alles kommt aus dem Journal — nichts wird doppelt gepflegt.
//
// R je Trade: echter R-Wert, sonst Näherung aus Gewinn / (Startkapital × Risiko %).
// Importierte Trades ohne SL bekommen so trotzdem einen Wert; sie sind als "≈" markiert.

export const BLOCK_SIZE = 100;
export const TARGETS = {
  expectancy: 0.3,      // R pro Trade
  ruleRate: 95,         // % Trades mit Prozess-Score 3
  maxDd: 8,             // % (aus R × Risiko)
  profitableMonths: 8,  // von 12
};
// Stop-Regeln gegen Tilt
export const TILT = { lossesPerDay: 2, weekLossPct: 3 };

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const DAY = 86400000;

/** R eines geschlossenen Trades: { r, approx } oder null */
export function rOf(t, acc, defaultRisk = 0.8) {
  const r = num(t.r_multiple);
  if (r !== null) return { r, approx: false };
  const profit = num(t.profit_amount), bal = num(acc?.starting_balance);
  const risk = num(t.risk_percent) || defaultRisk;
  if (profit === null || !(bal > 0) || !(risk > 0)) return null;
  return { r: profit / (bal * risk / 100), approx: true };
}

/** Ergebnis in % des Kontos: R × Risiko */
const pctOf = (t, r, defaultRisk) => r * (num(t.risk_percent) || defaultRisk);

const exitTime = (t) => new Date(t.exit_date || t.entry_date).getTime();
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

/** Kennzahlen einer Trade-Liste (bereits mit .r / .pct angereichert) */
export function stats(list) {
  const n = list.length;
  const wins = list.filter(t => t.r > 0).length;
  const sumR = list.reduce((s, t) => s + t.r, 0);
  const scored = list.filter(t => t.process_score !== null && t.process_score !== undefined);
  const perfect = scored.filter(t => Number(t.process_score) === 3).length;
  // Drawdown vom Höchststand der aufsummierten Ergebnisse in %
  let run = 0, peak = 0, maxDd = 0;
  [...list].sort((a, b) => exitTime(a) - exitTime(b)).forEach(t => { run += t.pct; peak = Math.max(peak, run); maxDd = Math.max(maxDd, peak - run); });
  return {
    n, wins,
    winrate: n ? wins / n * 100 : null,
    expectancy: n ? sumR / n : null,
    sumR, sumPct: list.reduce((s, t) => s + t.pct, 0),
    maxDd,
    scored: scored.length, perfect,
    ruleRate: scored.length ? perfect / scored.length * 100 : null,
    approx: list.filter(t => t.approx).length,
  };
}

/**
 * closed: geschlossene Trades · accounts · payouts (mit payout_date) · blockStart: ISO-Datum oder null
 */
export function computeMentoring({ closed, accounts, payouts = [], blockStart = null, defaultRisk = 0.8, now = new Date() }) {
  const accById = new Map(accounts.map(a => [a.id, a]));
  const rich = closed.map(t => {
    const x = rOf(t, accById.get(t.account_id), defaultRisk);
    return x ? { ...t, r: x.r, approx: x.approx, pct: pctOf(t, x.r, defaultRisk) } : null;
  }).filter(Boolean).sort((a, b) => exitTime(a) - exitTime(b));

  // 100-Trade-Block
  const startMs = blockStart ? new Date(blockStart + 'T00:00:00').getTime() : null;
  const block = startMs ? rich.filter(t => exitTime(t) >= startMs) : [];
  const blockStats = stats(block);

  // Letzte 12 Monate, je Monat
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: monthKey(d), label: d.toLocaleDateString('de-DE', { month: 'short', year: '2-digit' }) });
  }
  const monthRows = months.map(m => {
    const list = rich.filter(t => monthKey(new Date(exitTime(t))) === m.key);
    const pay = payouts.filter(p => p.payout_date && p.payout_date.slice(0, 7) === m.key);
    return { ...m, ...stats(list), payouts: pay.length, payoutEur: pay.reduce((s, p) => s + (Number(p.amount_eur) || 0), 0) };
  });
  const year = stats(rich.filter(t => exitTime(t) >= new Date(now.getFullYear(), now.getMonth() - 11, 1).getTime()));
  const traded = monthRows.filter(m => m.n > 0);
  const profitableMonths = traded.filter(m => m.sumR > 0).length;

  // Erwartungswert über die letzten 200 Trades (Ziel: ≥ 200 Trades Stichprobe)
  const last200 = stats(rich.slice(-200));

  // Tilt-Regeln: heute und diese Woche (Mo–So)
  const today0 = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weekday = (new Date(today0).getDay() + 6) % 7;
  const week0 = today0 - weekday * DAY;
  const lossesToday = rich.filter(t => exitTime(t) >= today0 && t.r < 0).length;
  const weekPct = rich.filter(t => exitTime(t) >= week0).reduce((s, t) => s + t.pct, 0);
  const lastBreak = [...rich].reverse().find(t => t.process_score !== null && t.process_score !== undefined && Number(t.process_score) < 3);
  const breakYesterday = lastBreak && exitTime(lastBreak) >= today0 - DAY && exitTime(lastBreak) < today0;
  const tilt = [
    { rule: `${TILT.lossesPerDay} Verluste an einem Tag → Schluss für heute`, value: `${lossesToday} heute`, stop: lossesToday >= TILT.lossesPerDay },
    { rule: `−${TILT.weekLossPct} % in einer Woche → Pause bis Montag`, value: `${fmtPct(weekPct)} diese Woche`, stop: weekPct <= -TILT.weekLossPct },
    { rule: 'Regelbruch → am nächsten Tag kein Trade, nur Review', value: breakYesterday ? 'gestern Score < 3' : 'kein Bruch gestern', stop: !!breakYesterday },
  ];

  const payouts12 = monthRows.reduce((s, m) => s + m.payouts, 0);
  const goals = [
    { label: 'Erwartungswert (letzte 200 Trades)', target: `≥ +${TARGETS.expectancy.toLocaleString('de-DE')} R`, value: last200.expectancy, text: fmtR(last200.expectancy), sub: `${last200.n} Trades${last200.approx ? `, ${last200.approx} ≈` : ''}`, ok: last200.expectancy !== null && last200.expectancy >= TARGETS.expectancy && last200.n >= 200 },
    { label: 'Regeltreue (Prozess-Score 3)', target: `≥ ${TARGETS.ruleRate} %`, value: (startMs ? blockStats : year).ruleRate, text: fmtPctPlain((startMs ? blockStats : year).ruleRate), sub: `${(startMs ? blockStats : year).scored} bewertet${startMs ? ' im Block' : ', 12 Monate'}`, ok: (startMs ? blockStats : year).ruleRate !== null && (startMs ? blockStats : year).ruleRate >= TARGETS.ruleRate },
    { label: 'Max. Drawdown (12 Monate)', target: `< ${TARGETS.maxDd} %`, value: year.maxDd, text: year.n ? `≈ ${year.maxDd.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %` : '–', sub: 'alle Konten, aus R × Risiko', ok: year.n > 0 && year.maxDd < TARGETS.maxDd },
    { label: 'Profitable Monate (12)', target: `≥ ${TARGETS.profitableMonths} von 12`, value: profitableMonths, text: `${profitableMonths} / 12`, sub: `${traded.length} Monate mit Trades`, ok: profitableMonths >= TARGETS.profitableMonths },
    { label: 'Payouts (12 Monate)', target: 'regelmäßig', value: payouts12, text: String(payouts12), sub: `${monthRows.filter(m => m.payouts).length} Monate mit Payout`, ok: monthRows.filter(m => m.payouts).length >= 6 },
  ];

  return { block, blockStats, blockStart, monthRows: monthRows.reverse(), goals, tilt, total: rich.length };
}

export const fmtR = (v) => v === null || v === undefined ? '–' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} R`;
export const fmtPct = (v) => v === null || v === undefined ? '–' : `${v >= 0 ? '+' : '−'}${Math.abs(v).toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`;
export const fmtPctPlain = (v) => v === null || v === undefined ? '–' : `${Math.round(v)} %`;
