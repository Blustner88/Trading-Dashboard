// Trader-Level: eine Rechnung für die Level-Seite und die Kurzübersicht in der Auswertung.
// XP gibt es für Disziplin (planen, dokumentieren, Risiko einhalten), nicht für Gewinn.
// Importierte Trades (MT5/FundedNext) bringen nur echte Angaben ein: ihre automatische
// Notiz und das beim Import gesetzte Standard-Risiko zählen nicht.

export const XP_PER_LEVEL = 150;
const TIERS = [
  { min: 1, max: 2, name: 'Bronze' },
  { min: 3, max: 5, name: 'Silber' },
  { min: 6, max: 9, name: 'Gold' },
  { min: 10, max: 14, name: 'Platin' },
  { min: 15, max: Infinity, name: 'Diamant' },
];
export const tierName = (level) => (TIERS.find(t => level >= t.min && level <= t.max) || TIERS[0]).name;

const AUTO_NOTE = /^(FundedNext-Import|MT5 Volumen:)/i;
const set = (v) => v !== null && v !== undefined && v !== '';

// Selbst geschriebene Notiz (nicht der Text des Imports)
export const isDocumented = (t) => !!t.notes && t.notes.trim().length > 0 && !AUTO_NOTE.test(t.notes.trim());
// Risiko selbst angegeben (bei Importen steht nur der Standardwert)
export const hasOwnRisk = (t) => set(t.risk_percent) && t.source !== 'mt5_import';
export const riskOnTarget = (t, target) => hasOwnRisk(t) && Math.abs(Number(t.risk_percent) - target) <= 0.1;
// Vor dem Einstieg geplant: Stop und Ziel eingetragen
export const isPlanned = (t) => set(t.stop_loss) && set(t.tp1);

const DAY = 86400000;

/**
 * closed: geschlossene Trades · payouts: Anzahl · noteDates: Tage mit Notiz zum Tag
 * ideas: Anzahl Trade-Ideen · fromIdea: Anzahl Trades, die aus einer Idee entstanden
 */
export function computeLevel({ closed, payouts = 0, noteDates = [], ideas = 0, fromIdea = 0, riskTarget = 0.8 }) {
  const documented = closed.filter(isDocumented);
  const planned = closed.filter(isPlanned);
  const riskOk = closed.filter(t => riskOnTarget(t, riskTarget));
  const withShot = closed.filter(t => t.chart_entry_url);
  const notes = [...new Set(noteDates)];

  const sources = [
    { label: 'Trades mit eigener Notiz', count: documented.length, xpEach: 10 },
    { label: 'Stop und Ziel vorab geplant', count: planned.length, xpEach: 10 },
    { label: `Risiko eingehalten (${riskTarget.toLocaleString('de-DE')} % ± 0,1)`, count: riskOk.length, xpEach: 10 },
    { label: 'Screenshot beim Entry', count: withShot.length, xpEach: 5 },
    { label: 'Trade-Ideen geplant', count: ideas, xpEach: 5 },
    { label: 'Trades aus einer Idee', count: fromIdea, xpEach: 15 },
    { label: 'Notiz zum Tag', count: notes.length, xpEach: 10 },
    { label: 'Auszahlungen erhalten', count: payouts, xpEach: 50 },
  ].map(s => ({ ...s, xp: s.count * s.xpEach }));

  // Abzug nur, wenn zuletzt gehandelt, aber kaum etwas festgehalten wurde
  const penalties = [];
  const recent = closed.filter(t => Date.now() - new Date(t.exit_date || t.entry_date).getTime() <= 30 * DAY);
  if (recent.length >= 3) {
    const rate = recent.filter(isDocumented).length / recent.length;
    if (rate < 0.5) penalties.push({
      label: 'Dokumentations-Lücke (letzte 30 Tage)',
      detail: `nur ${Math.round(rate * 100)} % von ${recent.length} Trades mit eigener Notiz`,
      xp: -30,
    });
  }

  const xp = Math.max(0, sources.reduce((s, x) => s + x.xp, 0) + penalties.reduce((s, p) => s + p.xp, 0));
  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const xpIntoLevel = xp % XP_PER_LEVEL;
  const notes30 = notes.filter(d => Date.now() - new Date(d + 'T00:00:00').getTime() <= 30 * DAY).length;

  const badges = [
    { icon: '🌱', label: 'Erster Trade', earned: closed.length >= 1 },
    { icon: '🏆', label: '10 Trades geschlossen', earned: closed.length >= 10 },
    { icon: '📝', label: 'Dokus-Profi (20)', earned: documented.length >= 20 },
    { icon: '🎯', label: 'Planer (20 mit SL+TP)', earned: planned.length >= 20 },
    { icon: '🛡️', label: 'Risiko-Disziplin (15)', earned: riskOk.length >= 15 },
    { icon: '💡', label: 'Erste Trade-Idee', earned: ideas >= 1 },
    { icon: '📆', label: 'Notiz-Serie (10 in 30 T)', earned: notes30 >= 10 },
    { icon: '💰', label: 'Erste Auszahlung', earned: payouts >= 1 },
  ];

  return {
    xp, level, tier: tierName(level), xpIntoLevel, progressPct: (xpIntoLevel / XP_PER_LEVEL) * 100,
    sources, penalties, badges,
    stats: { closed: closed.length, documented: documented.length, planned: planned.length, riskOk: riskOk.length,
      ownRisk: closed.filter(hasOwnRisk).length, notes30, ideas, fromIdea, payouts },
  };
}
