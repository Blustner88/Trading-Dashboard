import { supabase } from './accounts.js';
import { toast } from './nav.js';

// Trade-Ideen: Planung vor dem Trade. Liste + Editor (Sheet) für Cockpit und Tagesplan.
// Status: idea → order → taken (verknüpft mit dem Journal-Trade) oder discarded.

export const PAIRS = [
  'EURUSD', 'GBPUSD', 'AUDUSD', 'NZDUSD', 'USDJPY', 'USDCHF', 'USDCAD', 'USDNOK', 'USDSEK',
  'EURJPY', 'EURGBP', 'EURAUD', 'EURCAD', 'EURCHF', 'EURNZD', 'EURNOK', 'EURSEK',
  'GBPJPY', 'GBPAUD', 'GBPCAD', 'GBPCHF', 'GBPNZD', 'GBPNOK',
  'AUDJPY', 'AUDCAD', 'AUDCHF', 'AUDNZD', 'NZDJPY', 'NZDCAD', 'NZDCHF', 'CADJPY', 'CADCHF', 'CHFJPY',
  'XAUUSD', 'XAGUSD', 'NDX100', 'SPX500', 'GER30', 'EUSTX50', 'USOUSD',
];
export const IDEA_STATUS = [['idea', 'Idee'], ['order', 'Order gesetzt'], ['taken', 'Genommen'], ['discarded', 'Verworfen']];
const STATUS_CLS = { idea: 'accent', order: 'warn', taken: 'pos', discarded: '' };
const BUCKET = 'trade-screenshots';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const num = (v) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
const fmt = (v) => (v == null ? '–' : String(Number(v)));
export const localDate = (d = new Date()) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 10); };

// Chance-Risiko-Verhältnis zu TP1 (oder TP2, wenn kein TP1)
export function crv(i) {
  const e = num(i.entry_price), sl = num(i.stop_loss), tp = num(i.tp1) ?? num(i.tp2);
  if (e == null || sl == null || tp == null || e === sl) return null;
  const risk = i.direction === 'long' ? e - sl : sl - e;
  const reward = i.direction === 'long' ? tp - e : e - tp;
  return risk > 0 ? reward / risk : null;
}

// Plausibilität: SL und TP auf der richtigen Seite des Entrys?
function levelProblem(i) {
  const e = num(i.entry_price), sl = num(i.stop_loss), tp = num(i.tp1);
  if (e == null) return null;
  if (sl != null && (i.direction === 'long' ? sl >= e : sl <= e)) return `SL liegt bei ${i.direction === 'long' ? 'Long' : 'Short'} auf der falschen Seite`;
  if (tp != null && (i.direction === 'long' ? tp <= e : tp >= e)) return `TP1 liegt bei ${i.direction === 'long' ? 'Long' : 'Short'} auf der falschen Seite`;
  return null;
}

let biasCache = null;
export async function biasMap() {
  if (biasCache) return biasCache;
  const { data } = await supabase.from('fb_latest_pair_bias').select('pair, bias, score');
  biasCache = Object.fromEntries((data || []).map(b => [b.pair, b]));
  return biasCache;
}
function biasFit(i, bias) {
  const b = bias?.[i.pair];
  if (!b) return null;
  const d = b.bias.endsWith('long') ? 'long' : b.bias.endsWith('short') ? 'short' : 'neutral';
  if (d === 'neutral') return ['Bias neutral', ''];
  return d === i.direction ? ['mit Bias', 'pos'] : ['gegen Bias', 'neg'];
}

export async function loadIdeas({ date = null, openOnly = false, sinceDays = 14 } = {}) {
  let q = supabase.from('trade_ideas').select('*').order('created_at', { ascending: false });
  if (date) q = q.eq('idea_date', date);
  else q = q.gte('idea_date', localDate(new Date(Date.now() - sinceDays * 864e5)));
  if (openOnly) q = q.in('status', ['idea', 'order']);
  const { data, error } = await q;
  if (error) { console.error(error); return []; }
  return data || [];
}

// ---------------------------------------------------------------------------
// Liste
// ---------------------------------------------------------------------------
export function ideaCard(i, bias) {
  const r = crv(i);
  const fit = biasFit(i, bias);
  const st = IDEA_STATUS.find(s => s[0] === i.status)?.[1] || i.status;
  const shot = i.screenshot_url ? `<img class="idea-thumb" src="${esc(i.screenshot_url)}" alt="" loading="lazy">` : '<span class="idea-thumb empty" aria-hidden="true">◳</span>';
  return `<button class="idea-card ${i.direction}${['taken', 'discarded'].includes(i.status) ? ' done' : ''}" data-idea="${esc(i.id)}">
    ${shot}
    <span class="idea-main">
      <span class="idea-top"><b>${esc(i.pair)}</b><span class="badge ${i.direction === 'long' ? 'pos' : 'neg'}">${i.direction === 'long' ? 'Long' : 'Short'}</span><span class="badge ${STATUS_CLS[i.status]}">${st}</span>${fit ? `<span class="badge ${fit[1]}">${fit[0]}</span>` : ''}</span>
      <span class="idea-lv mono">E ${fmt(i.entry_price)} · SL ${fmt(i.stop_loss)} · TP ${fmt(i.tp1)}${i.tp2 != null ? ` / ${fmt(i.tp2)}` : ''}</span>
      ${i.reasoning || i.setup_type ? `<span class="idea-why">${esc([i.setup_type, i.reasoning].filter(Boolean).join(' – '))}</span>` : ''}
    </span>
    <span class="idea-crv mono ${r == null ? '' : r >= 2 ? 'pos' : r >= 1 ? 'warn' : 'neg'}">${r == null ? '–' : r.toFixed(1)}<small>CRV</small></span>
  </button>`;
}

export async function renderIdeas(container, ideas, { empty = 'Noch keine Ideen.', onChange } = {}) {
  const bias = await biasMap();
  container.innerHTML = ideas.length ? ideas.map(i => ideaCard(i, bias)).join('') : `<p class="empty">${empty}</p>`;
  container.querySelectorAll('.idea-card').forEach(c => {
    c.onclick = () => openIdeaEditor(ideas.find(x => x.id === c.dataset.idea), {}, onChange);
  });
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------
let open = null;
function close() {
  if (!open) return;
  open.forEach(el => el.remove());
  open = null;
  document.body.style.overflow = '';
  document.removeEventListener('keydown', onKey);
}
function onKey(e) { if (e.key === 'Escape') close(); }

export async function openIdeaEditor(idea = null, defaults = {}, onChange = () => {}) {
  close();
  const i = idea || { pair: '', direction: 'long', status: 'idea', idea_date: localDate(), ...defaults };
  const bias = await biasMap();
  let direction = i.direction, status = i.status, file = null, shotUrl = i.screenshot_url || null;

  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  const sheet = document.createElement('div');
  sheet.className = 'sheet idea-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', idea ? 'Trade-Idee bearbeiten' : 'Neue Trade-Idee');
  sheet.innerHTML = `
    <button class="sheet-handle" aria-label="Schließen"></button>
    <div class="modal-header"><h2>${idea ? 'Trade-Idee' : 'Neue Trade-Idee'}</h2><button class="modal-close" aria-label="Schließen">✕</button></div>
    <form class="trade-form idea-form" novalidate>
      <div class="idea-col">
      <div class="form-row">
        <div class="field"><label for="iPair">Pair / Symbol</label>
          <input id="iPair" list="iPairs" autocomplete="off" autocapitalize="characters" placeholder="EURUSD" value="${esc(i.pair)}">
          <datalist id="iPairs">${PAIRS.map(p => `<option value="${p}"></option>`).join('')}</datalist>
          <span class="hint" id="iBias"></span>
        </div>
        <div class="field"><label>Richtung</label>
          <div class="segmented" id="iDir"><button type="button" class="seg-btn" data-value="long">Long</button><button type="button" class="seg-btn" data-value="short">Short</button></div>
        </div>
      </div>
      <div class="form-row three">
        <div class="field"><label for="iEntry">Entry</label><input id="iEntry" type="number" inputmode="decimal" step="any" value="${i.entry_price ?? ''}"></div>
        <div class="field"><label for="iSl">Stop Loss</label><input id="iSl" type="number" inputmode="decimal" step="any" value="${i.stop_loss ?? ''}"></div>
        <div class="field"><label for="iTp1">TP1</label><input id="iTp1" type="number" inputmode="decimal" step="any" value="${i.tp1 ?? ''}"></div>
      </div>
      <div class="form-row">
        <div class="field"><label for="iTp2">TP2 (optional)</label><input id="iTp2" type="number" inputmode="decimal" step="any" value="${i.tp2 ?? ''}"></div>
        <div class="field"><label>Chance-Risiko</label><div class="idea-crv-big mono" id="iCrv">–</div></div>
      </div>
      <p class="hint warn" id="iWarn" hidden></p>
      <div class="field"><label for="iSetup">Setup</label>
        <input id="iSetup" list="iSetups" value="${esc(i.setup_type || '')}" placeholder="BITR, ORB, Sweep …">
        <datalist id="iSetups"><option>BITR</option><option>ORB</option><option>BITR-Sweep</option><option>Liquidity Grab</option><option>OB Retest</option></datalist>
      </div>
      <div class="field"><label>Status</label>
        <div class="segmented idea-status" id="iStatus">${IDEA_STATUS.map(([v, l]) => `<button type="button" class="seg-btn" data-value="${v}">${l}</button>`).join('')}</div>
      </div>
      <div class="field"><label for="iDate">Für den Tag</label><input id="iDate" type="date" value="${esc(i.idea_date || localDate())}"></div>
      </div>
      <div class="idea-col">
      <div class="field"><label for="iWhy">Begründung</label><textarea id="iWhy" rows="5" placeholder="Warum dieser Trade? Bias, Struktur, Zone, Trigger, Einwände …">${esc(i.reasoning || '')}</textarea></div>
      <div class="field"><label for="iShot">Screenshot</label>
        <input id="iShot" type="file" accept="image/*">
        <div class="idea-shot" id="iShotPrev">${shotUrl ? `<a href="${esc(shotUrl)}" target="_blank" rel="noopener"><img src="${esc(shotUrl)}" alt="Chart-Screenshot"></a>` : '<span class="idea-shot-empty">Noch kein Screenshot</span>'}</div>
      </div>
      </div>
      <div class="modal-actions">
        ${idea ? '<button type="button" class="btn-ghost" data-act="delete">Löschen</button>' : ''}
        <div class="modal-actions-right">
          ${idea && !i.trade_id ? '<button type="button" class="btn-ghost" data-act="journal">Als Trade erfassen</button>' : ''}
          ${i.trade_id ? '<a class="btn-ghost" href="index.html">Im Journal</a>' : ''}
          <button type="submit" class="btn-primary">Speichern</button>
        </div>
      </div>
    </form>`;
  document.body.append(backdrop, sheet);
  open = [backdrop, sheet];
  document.body.style.overflow = 'hidden';
  document.addEventListener('keydown', onKey);
  backdrop.onclick = close;
  sheet.querySelectorAll('.sheet-handle, .modal-close').forEach(x => { x.onclick = close; });

  const $ = (id) => sheet.querySelector('#' + id);
  const values = () => ({
    pair: $('iPair').value.trim().toUpperCase(), direction,
    entry_price: num($('iEntry').value), stop_loss: num($('iSl').value), tp1: num($('iTp1').value), tp2: num($('iTp2').value),
    setup_type: $('iSetup').value.trim() || null, reasoning: $('iWhy').value.trim() || null,
    status, idea_date: $('iDate').value || localDate(),
  });
  const refresh = () => {
    sheet.querySelectorAll('#iDir .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.value === direction));
    sheet.querySelectorAll('#iStatus .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.value === status));
    const v = values();
    const r = crv(v);
    $('iCrv').textContent = r == null ? '–' : `1 : ${r.toFixed(2)}`;
    $('iCrv').className = `idea-crv-big mono ${r == null ? '' : r >= 2 ? 'pos' : r >= 1 ? 'warn' : 'neg'}`;
    const p = levelProblem(v);
    $('iWarn').hidden = !p;
    $('iWarn').textContent = p ? '⚠ ' + p : '';
    const fit = biasFit(v, bias), b = bias[v.pair];
    $('iBias').innerHTML = b ? `Bias: <span class="${fit?.[1] || ''}">${esc(b.bias.replace('_', ' '))} (${b.score > 0 ? '+' : ''}${b.score})${fit && fit[1] ? ' · ' + fit[0] : ''}</span>` : '';
  };
  sheet.querySelector('#iDir').onclick = (e) => { const b = e.target.closest('.seg-btn'); if (b) { direction = b.dataset.value; refresh(); } };
  sheet.querySelector('#iStatus').onclick = (e) => { const b = e.target.closest('.seg-btn'); if (b) { status = b.dataset.value; refresh(); } };
  sheet.querySelector('form').oninput = refresh;
  $('iPair').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase(); });
  $('iShot').onchange = (e) => {
    file = e.target.files[0] || null;
    if (file) $('iShotPrev').innerHTML = `<img src="${URL.createObjectURL(file)}" alt="Chart-Screenshot">`;
  };
  refresh();
  (idea ? sheet.querySelector('.modal-close') : $('iPair')).focus();

  const save = async () => {
    const v = values();
    if (!v.pair) { toast('Bitte ein Pair angeben.'); $('iPair').focus(); return null; }
    const btn = sheet.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      if (file) {
        const path = `idea-${crypto.randomUUID()}.${(file.name.split('.').pop() || 'png').toLowerCase()}`;
        const { error } = await supabase.storage.from(BUCKET).upload(path, file);
        if (error) throw error;
        shotUrl = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
        file = null;
      }
      const row = { ...v, screenshot_url: shotUrl };
      const res = idea?.id
        ? await supabase.from('trade_ideas').update(row).eq('id', idea.id).select().single()
        : await supabase.from('trade_ideas').insert(row).select().single();
      if (res.error) throw res.error;
      return res.data;
    } catch (err) {
      console.error(err);
      toast('Speichern fehlgeschlagen: ' + (err.message || err));
      return null;
    } finally {
      btn.disabled = false;
    }
  };

  sheet.querySelector('form').onsubmit = async (e) => {
    e.preventDefault();
    const saved = await save();
    if (!saved) return;
    toast(idea ? 'Idee gespeichert.' : 'Idee angelegt.');
    close();
    onChange(saved);
  };
  sheet.querySelector('[data-act=journal]')?.addEventListener('click', async () => {
    const saved = await save();
    if (saved) location.href = `index.html#idee=${saved.id}`;
  });
  sheet.querySelector('[data-act=delete]')?.addEventListener('click', async () => {
    if (!confirm('Diese Idee löschen?')) return;
    const { error } = await supabase.from('trade_ideas').delete().eq('id', idea.id);
    if (error) { toast('Löschen fehlgeschlagen: ' + error.message); return; }
    toast('Idee gelöscht.');
    close();
    onChange(null);
  });
}
