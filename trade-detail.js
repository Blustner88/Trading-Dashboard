// Gesamtübersicht eines geschlossenen Trades (Journal → Trade anklicken)
import { supabase, getAccountById } from './accounts.js';
import { tradeFacts, formatDuration } from './tradefacts.js';

const esc = (v) => {
  const d = document.createElement('div');
  d.textContent = v ?? '';
  return d.innerHTML.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
};
const de = (v, d = 2) => Number(v).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
const signed = (v, d = 2) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${de(Math.abs(v), d)}`;
const money = (v, c) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: c, signDisplay: 'exceptZero' }).format(v).replace('-', '−');
const when = (iso) => (iso ? new Date(iso).toLocaleString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : null);
const safeUrl = (u) => {
  try { return ['https:', 'http:'].includes(new URL(u, location.href).protocol) ? u : null; } catch { return null; }
};

const rows = (list) => list.filter(([, v]) => v !== null && v !== undefined && v !== '')
  .map(([k, v]) => `<div class="tdv-row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');

const textBlock = (title, text) => (text ? `<section class="tdv-block"><h3>${esc(title)}</h3><p>${esc(text)}</p></section>` : '');

function chart(label, url) {
  const safe = safeUrl(url);
  if (!safe) return '';
  return `<a class="tdv-chart" href="${esc(safe)}" target="_blank" rel="noopener" title="${esc(label)} groß öffnen">
    <img src="${esc(safe)}" alt="${esc(label)}" loading="lazy"><span>${esc(label)}</span></a>`;
}

function html(t, acc) {
  const f = tradeFacts(t, acc?.starting_balance);
  const cur = acc?.currency || 'USD';
  const imported = t.source === 'mt5_import';
  const charts = chart('Chart beim Einstieg', t.chart_entry_url) + chart('Chart beim Ausstieg', t.chart_exit_url);
  const hero = f.r !== null ? `${signed(f.r)}R` : f.profit !== null ? money(f.profit, cur) : '–';
  const heroSub = [
    f.r !== null && f.profit !== null ? money(f.profit, cur) : null,
    f.pctOfStart !== null ? `${signed(f.pctOfStart)} % vom Startkapital` : null,
  ].filter(Boolean).join(' · ');

  return `
    <div class="modal-header">
      <h2 id="tdvTitle">${esc(t.pair)} · ${t.direction === 'short' ? 'Short' : 'Long'}</h2>
      <button type="button" class="modal-close" aria-label="Schließen">✕</button>
    </div>
    <div class="tdv-hero ${f.outcome}">
      <span class="tdv-big">${esc(hero)}</span>
      ${heroSub ? `<span class="tdv-sub">${esc(heroSub)}</span>` : ''}
      ${f.exitReason ? `<span class="tdv-reason">${esc(f.exitReason)}</span>` : ''}
    </div>
    ${f.timesWrong ? '<p class="hint warn tdv-warn">⚠ Der Ausstieg liegt vor dem Einstieg. Bitte die Zeiten über „Bearbeiten“ prüfen.</p>' : ''}
    ${f.r === null ? `<p class="tdv-hint">${f.sl === null ? 'Ohne Stop Loss lässt sich kein R-Wert berechnen.' : 'Für diesen Trade ist kein R-Wert gespeichert.'}</p>` : ''}
    <div class="tdv-grid">
      <section class="tdv-block"><h3>Ablauf</h3>${rows([
        ['Konto', acc?.name],
        ['Einstieg', when(t.entry_date)],
        ['Ausstieg', when(t.exit_date)],
        ['Dauer', formatDuration(f.durationMs)],
        ['Session', t.session],
        ['Setup', t.setup_type],
        ['Lots', f.lots !== null ? de(f.lots) : null],
        ['MT5-Ticket', t.mt5_ticket_id],
      ])}</section>
      <section class="tdv-block"><h3>Preise</h3>${rows([
        ['Entry', f.entry],
        ['Stop Loss', f.sl],
        ['Nachgezogener Stop', f.trail],
        ['Take Profit 1', f.tp1],
        ['Take Profit 2', f.tp2],
        ['Exit', f.exit],
      ])}</section>
      <section class="tdv-block"><h3>Plan und Ergebnis</h3>${rows([
        ['Geplantes Chance-Risiko', f.plannedR !== null ? `${de(f.plannedR)}R` : null],
        ['Erreicht', f.r !== null ? `${signed(f.r)}R` : null],
        ['Bewegung', f.pips !== null ? `${signed(f.pips, 1)} ${f.unit}` : null],
        ['Geplantes Risiko', !imported && t.risk_percent != null ? `${de(t.risk_percent)} %` : null],
        ['1R entspricht ca.',f.riskAmount !== null ? money(f.riskAmount, cur).replace('+', '') : null],
      ]) || '<p class="tdv-hint">Dafür fehlen Stop Loss oder Take Profit.</p>'}</section>
    </div>
    ${textBlock('Fehler', t.mistake_tag)}
    ${textBlock(imported ? 'Notiz' : 'Warum rein?', f.note)}
    <div id="tdvIdea"></div>
    ${charts ? `<section class="tdv-block"><h3>Charts</h3><div class="tdv-charts" id="tdvCharts">${charts}</div></section>` : ''}
    <div class="tdv-actions">
      <button type="button" class="btn-primary" id="tdvEdit">${imported && !t.setup_type ? 'Ergänzen' : 'Bearbeiten'}</button>
    </div>`;
}

// Die zugehörige Trade-Idee ist eine Zugabe: fehlt sie oder schlägt das Laden fehl, bleibt der Bereich leer
async function loadIdea(t, overlay) {
  const { data, error } = await supabase.from('trade_ideas')
    .select('idea_date, reasoning, decision_note, screenshot_url').eq('trade_id', t.id).limit(1);
  const idea = data?.[0];
  if (error || !idea || !overlay.isConnected) return;
  overlay.querySelector('#tdvIdea').innerHTML = textBlock(
    `Aus der Trade-Idee vom ${new Date(idea.idea_date).toLocaleDateString('de-DE')}`,
    [idea.reasoning, idea.decision_note].filter(Boolean).join('\n\n') || 'Keine Begründung eingetragen.',
  );
  // Meist wurde der Idee-Screenshot schon als Einstiegs-Chart übernommen, dann nicht doppelt zeigen
  const box = overlay.querySelector('#tdvCharts');
  if (box && idea.screenshot_url && idea.screenshot_url !== t.chart_entry_url) {
    box.insertAdjacentHTML('afterbegin', chart('Screenshot der Idee', idea.screenshot_url));
  } else if (!box && idea.screenshot_url) {
    overlay.querySelector('#tdvIdea').insertAdjacentHTML('beforeend',
      `<section class="tdv-block"><h3>Charts</h3><div class="tdv-charts">${chart('Screenshot der Idee', idea.screenshot_url)}</div></section>`);
  }
}

export function openTradeDetail(trade, { onEdit }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `<div class="modal tdv" role="dialog" aria-modal="true" aria-labelledby="tdvTitle">${html(trade, getAccountById(trade.account_id))}</div>`;
  const close = () => overlay.remove();
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.querySelector('.modal-close').onclick = close;
  overlay.querySelector('#tdvEdit').onclick = () => { close(); onEdit(trade); };
  // Erst einhängen, dann sichtbar: die Tastatursteuerung aus nav.js erkennt den Dialog am Klassenwechsel
  document.body.append(overlay);
  overlay.classList.add('visible');
  loadIdea(trade, overlay);
}
