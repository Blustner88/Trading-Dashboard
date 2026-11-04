// Lotgröße aus Risiko und Stop-Abstand. Reine Rechnung ohne Seite, damit sie sich testen lässt.
// Lots = Risiko in Kontowährung / (Abstand × Kontraktgröße × Kurs Quote-Währung → Kontowährung)

// Keine Devisenpaare: Kontraktgröße wie bei FundedNext, je Broker verschieden und daher änderbar
const OTHER = {
  NDX100: { contract: 10, pip: 1, quote: 'USD', unit: 'Punkte' },
  SPX500: { contract: 10, pip: 1, quote: 'USD', unit: 'Punkte' },
  GER30: { contract: 10, pip: 1, quote: 'EUR', unit: 'Punkte' },
  EUSTX50: { contract: 10, pip: 1, quote: 'EUR', unit: 'Punkte' },
  XAUUSD: { contract: 100, pip: 0.1, quote: 'USD', unit: 'Pips' },
  XAGUSD: { contract: 5000, pip: 0.01, quote: 'USD', unit: 'Pips' },
  USOUSD: { contract: 100, pip: 0.01, quote: 'USD', unit: 'Pips' },
};

// null = unbekanntes Symbol
export function instrument(pair) {
  const p = String(pair || '').trim().toUpperCase();
  if (OTHER[p]) return { pair: p, fx: false, ...OTHER[p] };
  if (!/^[A-Z]{6}$/.test(p)) return null;
  const quote = p.slice(3);
  return { pair: p, fx: true, contract: 100000, pip: quote === 'JPY' ? 0.01 : 0.0001, quote, unit: 'Pips' };
}

// rates = Einheiten je 1 EUR (fb_fx_rates); null, wenn eine Währung fehlt
export function convert(rates, from, to) {
  const r = (c) => (c === 'EUR' ? 1 : Number(rates?.[c]));
  const v = r(to) / r(from);
  return Number.isFinite(v) && v > 0 ? v : null;
}

export function calcLots({ balance, riskPct, currency, inst, distance, contract, rates, step = 0.01 }) {
  const fx = convert(rates, inst.quote, currency);
  if (!fx || !(balance > 0) || !(riskPct > 0) || !(distance > 0) || !(contract > 0)) return null;
  const riskTarget = balance * riskPct / 100;
  const lossPerLot = distance * contract * fx;
  // Immer abrunden: aufrunden würde das Risiko über den Zielwert heben
  const steps = Math.floor(riskTarget / lossPerLot / step + 1e-9);
  const lots = Math.round(steps * step * 100) / 100;
  return {
    lots, riskTarget, lossPerLot,
    riskActual: lots * lossPerLot,
    pipValue: inst.pip * contract * fx,
    pips: distance / inst.pip,
  };
}
