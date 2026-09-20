import { supabase } from './accounts.js';

const $ = (id) => document.getElementById(id);

const XP_PER_LEVEL = 150;
const TIERS = [
  { min: 1, max: 2, name: 'Bronze' },
  { min: 3, max: 5, name: 'Silber' },
  { min: 6, max: 9, name: 'Gold' },
  { min: 10, max: 14, name: 'Platin' },
  { min: 15, max: Infinity, name: 'Diamant' },
];

function tierName(level) {
  return (TIERS.find(t => level >= t.min && level <= t.max) || TIERS[0]).name;
}

async function init() {
  const { data: trades } = await supabase.from('trades').select('*').eq('status', 'closed');
  const closedTrades = trades || [];

  const { data: payouts } = await supabase.from('payouts').select('id');
  const allPayouts = payouts || [];

  const { data: plans } = await supabase.from('daily_plans').select('plan_date').order('plan_date', { ascending: false });
  const allPlanDates = (plans || []).map(p => p.plan_date);

  render(closedTrades, allPayouts, allPlanDates);
}

function render(closedTrades, allPayouts, allPlanDates) {
  const documented = closedTrades.filter(t => t.notes && t.notes.trim().length > 0);
  const splitTp = closedTrades.filter(t => t.tp1 !== null && t.tp1 !== undefined && t.tp2 !== null && t.tp2 !== undefined);
  const riskDisciplined = closedTrades.filter(t => t.risk_percent !== null && Math.abs(Number(t.risk_percent) - 0.8) <= 0.1);
  const withScreenshot = closedTrades.filter(t => t.chart_entry_url);

  const cutoff30 = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const planDaysLast30 = new Set(allPlanDates.filter(d => new Date(d + 'T00:00:00').getTime() >= cutoff30)).size;

  const recentTrades = closedTrades.filter(t => new Date(t.entry_date).getTime() >= cutoff30);
  const recentDocumented = recentTrades.filter(t => t.notes && t.notes.trim().length > 0);

  const sources = [
    { label: 'Dokumentierte Trades', count: documented.length, xpEach: 10, xp: documented.length * 10 },
    { label: 'Split-TP genutzt', count: splitTp.length, xpEach: 15, xp: splitTp.length * 15 },
    { label: 'Risk-diszipliniert (0.8% ±0.1)', count: riskDisciplined.length, xpEach: 10, xp: riskDisciplined.length * 10 },
    { label: 'Screenshot beim Entry', count: withScreenshot.length, xpEach: 5, xp: withScreenshot.length * 5 },
    { label: 'Tagespläne erstellt', count: allPlanDates.length, xpEach: 20, xp: allPlanDates.length * 20 },
    { label: 'Payouts erhalten', count: allPayouts.length, xpEach: 50, xp: allPayouts.length * 50 },
  ];
  const positiveXp = sources.reduce((s, x) => s + x.xp, 0);

  const penalties = [];

  let daysSincePlan = null;
  if (allPlanDates.length > 0) {
    const lastPlan = new Date(allPlanDates[0] + 'T00:00:00');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    daysSincePlan = Math.floor((today - lastPlan) / (24 * 60 * 60 * 1000));
    const gracePeriod = 3;
    if (daysSincePlan > gracePeriod) {
      const overDays = daysSincePlan - gracePeriod;
      const penaltyXp = Math.min(overDays * 10, 150);
      penalties.push({
        label: `Kein Tagesplan seit ${daysSincePlan} Tagen`,
        detail: `${overDays} Tage über ${gracePeriod}-Tage-Karenz × -10 XP`,
        xp: -penaltyXp,
      });
    }
  }

  if (recentTrades.length >= 3) {
    const docRate = recentDocumented.length / recentTrades.length;
    if (docRate < 0.5) {
      penalties.push({
        label: 'Dokumentations-Lücke (letzte 30 Tage)',
        detail: `Nur ${Math.round(docRate * 100)}% der letzten Trades dokumentiert`,
        xp: -30,
      });
    }
  }

  const totalPenaltyXp = penalties.reduce((s, p) => s + p.xp, 0);
  const xp = Math.max(0, positiveXp + totalPenaltyXp);

  const level = Math.floor(xp / XP_PER_LEVEL) + 1;
  const xpIntoLevel = xp % XP_PER_LEVEL;
  const progressPct = (xpIntoLevel / XP_PER_LEVEL) * 100;
  const tier = tierName(level);

  $('levelBadgeCircle').textContent = level;
  $('levelTierBadge').textContent = tier + '-Trader';
  $('levelXpLabel').textContent = `${xpIntoLevel} / ${XP_PER_LEVEL} XP`;
  $('levelNextLabel').textContent = `bis Level ${level + 1}`;
  $('levelBarFill').style.width = `${progressPct}%`;

  $('xpSourceList').innerHTML = sources.map(s => `
    <div class="xp-source-row">
      <span class="label">${s.label}<span class="count">${s.count} × ${s.xpEach} XP</span></span>
      <span class="value pos">+${s.xp}</span>
    </div>
  `).join('');

  $('penaltyList').innerHTML = penalties.length > 0
    ? penalties.map(p => `
        <div class="xp-source-row">
          <span class="label">${p.label}<span class="count">${p.detail}</span></span>
          <span class="value neg">${p.xp}</span>
        </div>
      `).join('')
    : `<p class="penalty-empty">Keine Abzüge — Kontinuität passt.</p>`;

  $('statDocumented').textContent = `${documented.length} / ${closedTrades.length}`;
  $('statSplitTp').textContent = `${splitTp.length} / ${closedTrades.length}`;
  $('statRiskDisc').textContent = `${riskDisciplined.length} / ${closedTrades.length}`;
  $('statPlanDays').textContent = `${planDaysLast30} / 30`;
  $('statDaysSincePlan').textContent = daysSincePlan !== null ? daysSincePlan : '–';
  $('statPayoutCount').textContent = allPayouts.length;

  const badges = [
    { icon: '🌱', label: 'Erster Trade', earned: closedTrades.length >= 1 },
    { icon: '📝', label: 'Dokus-Profi (20)', earned: documented.length >= 20 },
    { icon: '🎯', label: 'Split-TP-Meister (10)', earned: splitTp.length >= 10 },
    { icon: '🛡️', label: 'Risk-Diszipliniert (15)', earned: riskDisciplined.length >= 15 },
    { icon: '📅', label: 'Planer (5 Tage)', earned: allPlanDates.length >= 5 },
    { icon: '📆', label: 'Planungs-Serie (10/30T)', earned: planDaysLast30 >= 10 },
    { icon: '💰', label: 'Erster Payout', earned: allPayouts.length >= 1 },
    { icon: '🏆', label: '10 Trades geschlossen', earned: closedTrades.length >= 10 },
  ];

  $('badgeGrid').innerHTML = badges.map(b => `
    <div class="badge-item ${b.earned ? 'earned' : ''}">
      <span class="badge-icon">${b.icon}</span>
      <span class="badge-label">${b.label}</span>
    </div>
  `).join('');
}

init();
