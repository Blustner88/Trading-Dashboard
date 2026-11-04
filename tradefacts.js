// Kennzahlen eines geschlossenen Trades. Reine Rechnung ohne Seite, damit sie sich testen lässt.
import { instrument } from './lotcalc.js';

const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));

// Import-Notizen enthalten technische Angaben: Volumen wird zur eigenen Zeile, der Rest bleibt Notiz
function parseNotes(notes) {
  const text = String(notes || '');
  const lots = text.match(/MT5 Volumen:\s*([\d.]+)/);
  const rest = text
    .replace('FundedNext-Import', '')
    .replace(/MT5 Volumen:\s*[\d.]+/, '')
    .replace(/^[\s·]+|[\s·]+$/g, '');
  return { lots: lots ? Number(lots[1]) : null, note: rest || null };
}

// Wo wurde geschlossen? Etwas Spielraum für Slippage: 3 % des Stop-Abstands, ohne SL zwei Pips
function exitReason({ exit, sl, trail, tp1, tp2, riskDist, inst }) {
  if (exit === null || (sl === null && trail === null && tp1 === null && tp2 === null)) return null;
  const tol = riskDist > 0 ? riskDist * 0.03 : (inst ? inst.pip * 2 : 0);
  const near = (level) => level !== null && Math.abs(exit - level) <= tol;
  if (near(tp2)) return 'Am Take Profit 2';
  if (near(tp1)) return 'Am Take Profit 1';
  if (near(trail)) return 'Am nachgezogenen Stop';
  if (near(sl)) return 'Am Stop Loss';
  return 'Nicht an SL oder TP';
}

export function tradeFacts(t, startingBalance = null) {
  const entry = num(t.entry_price), sl = num(t.stop_loss), trail = num(t.trailed_stop_loss);
  const tp1 = num(t.tp1), tp2 = num(t.tp2), exit = num(t.exit_price);
  const r = num(t.r_multiple), profit = num(t.profit_amount);
  const sign = t.direction === 'short' ? -1 : 1;
  const inst = instrument(t.pair);
  const riskDist = entry !== null && sl !== null ? Math.abs(entry - sl) : null;

  const move = entry !== null && exit !== null ? (exit - entry) * sign : null;
  const reward = riskDist > 0 && tp1 !== null ? (tp1 - entry) * sign / riskDist : null;
  const start = t.entry_date ? new Date(t.entry_date).getTime() : NaN;
  const end = t.exit_date ? new Date(t.exit_date).getTime() : NaN;
  const durationMs = Number.isFinite(start) && Number.isFinite(end) ? end - start : null;
  const result = profit !== null ? profit : r;
  const balance = num(startingBalance);

  return {
    ...parseNotes(t.notes),
    entry, sl, trail, tp1, tp2, exit, r, profit,
    pips: inst && move !== null ? move / inst.pip : null,
    unit: inst?.unit || 'Pips',
    plannedR: reward > 0 ? reward : null,
    durationMs,
    timesWrong: durationMs !== null && durationMs < 0,
    exitReason: exitReason({ exit, sl, trail, tp1, tp2, riskDist, inst }),
    // Betrag je 1R nur als Näherung: Kosten und Teilschließungen stecken im Ergebnis
    riskAmount: profit !== null && r !== null && Math.abs(r) >= 0.1 ? Math.abs(profit / r) : null,
    pctOfStart: profit !== null && balance > 0 ? profit / balance * 100 : null,
    outcome: result === null ? 'none' : result > 0 ? 'win' : result < 0 ? 'loss' : 'flat',
  };
}

export function formatDuration(ms) {
  if (ms === null || ms === undefined || ms < 0) return null;
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} Min.`;
  if (min < 1440) {
    const m = min % 60;
    return `${Math.floor(min / 60)} Std.${m ? ` ${m} Min.` : ''}`;
  }
  const days = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60);
  return `${days} ${days === 1 ? 'Tag' : 'Tage'}${h ? ` ${h} Std.` : ''}`;
}
