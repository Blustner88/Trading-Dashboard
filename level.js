import { supabase } from './accounts.js';
import { toastError } from './nav.js';
import { computeLevel, XP_PER_LEVEL } from './level-core.js';

const $ = (id) => document.getElementById(id);

async function init() {
  const [tr, pay, notes, ideas, rs] = await Promise.all([
    supabase.from('trades').select('*').eq('status', 'closed'),
    supabase.from('payouts').select('id'),
    supabase.from('daily_plans').select('plan_date'),
    supabase.from('trade_ideas').select('id, trade_id'),
    supabase.from('user_settings').select('value').eq('key', 'default_risk_pct').maybeSingle(),
  ]);
  const failed = [tr, pay, notes, ideas].find(r => r.error);
  if (failed) toastError('Daten unvollständig geladen', failed.error);
  render(computeLevel({
    closed: tr.data || [],
    payouts: (pay.data || []).length,
    noteDates: (notes.data || []).map(p => p.plan_date),
    ideas: (ideas.data || []).length,
    fromIdea: (ideas.data || []).filter(i => i.trade_id).length,
    riskTarget: Number(rs.data?.value) > 0 ? Number(rs.data.value) : 0.8,
  }));
}

function render(L) {
  $('levelBadgeCircle').textContent = L.level;
  $('levelTierBadge').textContent = L.tier + '-Trader';
  $('levelXpLabel').textContent = `${L.xpIntoLevel} / ${XP_PER_LEVEL} XP`;
  $('levelNextLabel').textContent = `noch ${XP_PER_LEVEL - L.xpIntoLevel} XP bis Level ${L.level + 1}`;
  $('levelBarFill').style.width = `${L.progressPct}%`;
  $('levelBar').setAttribute('aria-valuenow', Math.round(L.progressPct));

  $('xpSourceList').innerHTML = L.sources.map(s => `
    <div class="xp-source-row${s.count ? '' : ' zero'}">
      <span class="label">${s.label}<span class="count">${s.count} × ${s.xpEach} XP</span></span>
      <span class="value ${s.xp ? 'pos' : ''}">+${s.xp}</span>
    </div>`).join('');

  $('penaltyPanel').hidden = !L.penalties.length;
  $('penaltyList').innerHTML = L.penalties.map(p => `
    <div class="xp-source-row">
      <span class="label">${p.label}<span class="count">${p.detail}</span></span>
      <span class="value neg">${p.xp}</span>
    </div>`).join('');

  const S = L.stats;
  $('statDocumented').textContent = `${S.documented} / ${S.closed}`;
  $('statPlanned').textContent = `${S.planned} / ${S.closed}`;
  $('statRiskDisc').textContent = S.ownRisk ? `${S.riskOk} / ${S.ownRisk}` : '–';
  $('statNotes').textContent = `${S.notes30} / 30`;
  $('statIdeas').textContent = S.fromIdea ? `${S.ideas} · ${S.fromIdea} umgesetzt` : S.ideas;
  $('statPayoutCount').textContent = S.payouts;

  $('badgeGrid').innerHTML = L.badges.map(b => `
    <div class="badge-item ${b.earned ? 'earned' : ''}">
      <span class="badge-icon" aria-hidden="true">${b.icon}</span>
      <span class="badge-label">${b.label}</span>
      <span class="sr-only">${b.earned ? 'erreicht' : 'noch nicht erreicht'}</span>
    </div>`).join('');
}

init();
