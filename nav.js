// Navigation und App-Rahmen für alle Seiten: vier Bereiche oben (Handy: Leiste
// unten mit "+" in der Mitte), Unter-Tabs, Glocke (Push), Hell/Dunkel, Einstellungen,
// Umschalter "Meine Ansicht / Produkt-Ansicht" mit Paketen und der Service Worker.
// Neue Seite eintragen = eine Zeile in AREAS (tier = ab welchem Paket, owner = nie im Produkt).

const ICON = {
  cockpit: '<path d="M4 15a8 8 0 1 1 16 0"/><path d="M12 15l4-5"/><circle cx="12" cy="15" r="1.3"/><path d="M4 19h16"/>',
  desk: '<circle cx="12" cy="12" r="2"/><path d="M8.5 15.5a5 5 0 0 1 0-7M15.5 8.5a5 5 0 0 1 0 7M5.6 18.4a9 9 0 0 1 0-12.8M18.4 5.6a9 9 0 0 1 0 12.8"/>',
  auswertung: '<path d="M5 19v-7M11 19V5M17 19v-10M3 21h18"/>',
  business: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  bell: '<path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
};
export const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name] || ''}</svg>`;

const AREAS = [
  { key: 'cockpit', label: 'Cockpit', tier: 'bias', pages: [
    { href: 'cockpit.html', label: 'Überblick' },
  ] },
  { key: 'desk', label: 'Desk', owner: true, pages: [
    { href: 'desk.html', label: 'Live' },
  ] },
  { key: 'auswertung', label: 'Auswertung', tier: 'pro', pages: [
    { href: 'dashboard.html', label: 'Übersicht' },
    { href: 'index.html', label: 'Journal' },
    { href: 'backtest.html', label: 'Backtest' },
    { href: 'level.html', label: 'Level' },
  ] },
  { key: 'business', label: 'Business', tier: 'prop', pages: [
    { href: 'business.html', label: 'Überblick' },
    { href: 'accounting.html', label: 'Buchungen' },
    { href: 'tax.html', label: 'Steuer & EÜR' },
    { href: 'invoices.html', label: 'Rechnungen', hidden: true, owner: true },
  ] },
  { key: 'settings', label: 'Einstellungen', hidden: true, pages: [
    { href: 'settings.html', label: 'Einstellungen' },
  ] },
];

// Pakete der Produkt-Ansicht (Preise nur als Platzhalter für die Vorschau)
export const PLANS = [
  { key: 'bias', label: 'Bias', price: '19 €', text: 'Cockpit: Tagesstatus, Währungsstärke, Pair-Bias, Termine, News, Push' },
  { key: 'pro', label: 'Pro', price: '29 €', text: 'dazu Trade-Ideen, Journal, Auswertung, Backtest, Level' },
  { key: 'prop', label: 'Prop-Trader', price: '39 €', text: 'dazu Konten-Limits, Business, Buchungen, Steuer & EÜR' },
];
const RANK = { bias: 1, pro: 2, prop: 3 };
const planOf = (k) => PLANS.find(p => p.key === k) || PLANS[2];

const START_PAGE = 'cockpit.html';
const VAPID_PUBLIC = 'BKpnibHWFcbXYYxh_emK2NTxBXRpiv8lVGqqLw_qrDtcTHohFlRFmiSY27vhPO1FwlWhrHYEF_XDqEJ75nHQS6Y';
const THEME_KEY = 'td_theme', VIEW_KEY = 'td_view', PLAN_KEY = 'td_plan';
const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* privat */ } } };

function currentPage() {
  return location.pathname.split('/').pop() || 'index.html';
}

// ---------------------------------------------------------------------------
// Kurze Meldung unten (für Seiten ohne eigenes #toast)
// ---------------------------------------------------------------------------
// opts: { error: true } rot und länger sichtbar; { action: 'Rückgängig', onAction } mit Knopf
export function toast(msg, opts = {}) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.toggle('error', !!opts.error);
  el.setAttribute('role', opts.error ? 'alert' : 'status');
  if (opts.action) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'toast-action';
    b.textContent = opts.action;
    b.onclick = () => { el.classList.remove('visible'); opts.onAction?.(); };
    el.append(b);
  }
  el.classList.toggle('has-action', !!opts.action);
  el.classList.add('visible');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('visible'), opts.ms || (opts.error || opts.action ? 6500 : 3600));
}

// Fehler aus Supabase o. ä. verständlich melden statt alert()
export function toastError(prefix, error) {
  const detail = !navigator.onLine ? 'keine Internetverbindung' : (error?.message || String(error || 'unbekannter Fehler'));
  toast(`${prefix}: ${detail}`, { error: true });
}

// ---------------------------------------------------------------------------
// Rückfrage im App-Design statt confirm(); liefert true/false
// ---------------------------------------------------------------------------
export function confirmDialog({ title, text = '', ok = 'Löschen', cancel = 'Abbrechen', danger = true } = {}) {
  return new Promise((resolve) => {
    const dlg = document.createElement('dialog');
    dlg.className = 'app-dialog';
    dlg.innerHTML = `
      <h2></h2>${text ? '<p></p>' : ''}
      <div class="app-dialog-actions">
        <button type="button" class="btn-ghost" data-r="0"></button>
        <button type="button" class="${danger ? 'btn-danger' : 'btn-primary'}" data-r="1"></button>
      </div>`;
    dlg.querySelector('h2').textContent = title;
    if (text) dlg.querySelector('p').textContent = text;
    dlg.querySelector('[data-r="0"]').textContent = cancel;
    dlg.querySelector('[data-r="1"]').textContent = ok;
    let result = false;
    dlg.addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]');
      if (b) { result = b.dataset.r === '1'; dlg.close(); }
      else if (e.target === dlg) dlg.close();   // Klick neben das Fenster = abbrechen
    });
    dlg.addEventListener('close', () => { dlg.remove(); resolve(result); });
    document.body.append(dlg);
    dlg.showModal();
    dlg.querySelector('[data-r="0"]').focus();   // sicherer Standard: Abbrechen
  });
}

// ---------------------------------------------------------------------------
// Löschen mit "Rückgängig": Eintrag sofort ausblenden, erst nach ein paar
// Sekunden wirklich löschen. Verlässt man die Seite vorher, wird sofort gelöscht.
// hide() blendet aus, restore() zeigt wieder an, commit() löscht (Promise mit { error }).
// ---------------------------------------------------------------------------
export function deleteWithUndo({ label, hide, restore, commit, onDone }) {
  let done = false;
  const run = async () => {
    if (done) return;
    done = true;
    window.removeEventListener('pagehide', run);
    const res = await commit();
    if (res?.error) { restore?.(); toastError('Löschen fehlgeschlagen', res.error); return; }
    onDone?.();
  };
  hide?.();
  window.addEventListener('pagehide', run);
  const timer = setTimeout(run, 6000);
  toast(`${label} gelöscht`, {
    action: 'Rückgängig', ms: 6000,
    onAction: () => { if (done) return; done = true; clearTimeout(timer); window.removeEventListener('pagehide', run); restore?.(); },
  });
}

// Knopf während einer Aktion sperren (kein doppeltes Speichern)
export async function busy(btn, fn) {
  if (!btn) return fn();
  if (btn.disabled) return;
  btn.disabled = true;
  btn.setAttribute('aria-busy', 'true');
  try { return await fn(); }
  finally { btn.disabled = false; btn.removeAttribute('aria-busy'); }
}

// ---------------------------------------------------------------------------
// Verlässlichkeit: Netz weg -> Hinweisleiste; unerwartete Fehler -> Meldung
// ---------------------------------------------------------------------------
function netBanner() {
  let el = document.getElementById('netBanner');
  if (navigator.onLine) { el?.remove(); return; }
  if (el) return;
  el = document.createElement('div');
  el.id = 'netBanner';
  el.className = 'net-banner';
  el.setAttribute('role', 'status');
  el.textContent = 'Offline – Änderungen werden erst mit Verbindung gespeichert.';
  document.body.prepend(el);
}
window.addEventListener('online', () => { netBanner(); toast('Wieder online'); });
window.addEventListener('offline', netBanner);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', netBanner); else netBanner();

let lastErr = 0;
function reportUnexpected(err) {
  const msg = String(err?.message || err || '');
  if (/ResizeObserver|AbortError/i.test(msg)) return;
  console.error(err);
  if (Date.now() - lastErr < 5000) return;
  lastErr = Date.now();
  toast(navigator.onLine ? 'Etwas ist schiefgelaufen. Falls etwas fehlt, Seite neu laden.' : 'Keine Internetverbindung.', { error: true });
}
window.addEventListener('unhandledrejection', (e) => reportUnexpected(e.reason));
window.addEventListener('error', (e) => { if (e.error) reportUnexpected(e.error); });

// ---------------------------------------------------------------------------
// Hell / Dunkel: ohne Wahl gilt die Systemeinstellung
// ---------------------------------------------------------------------------
export function themeChoice() { return ls.get(THEME_KEY) || 'system'; }
export function effectiveTheme() {
  const t = document.documentElement.dataset.theme;
  if (t) return t;
  return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}
export function applyTheme(choice) {
  if (choice === 'system') { delete document.documentElement.dataset.theme; ls.set(THEME_KEY, null); }
  else { document.documentElement.dataset.theme = choice; ls.set(THEME_KEY, choice); }
  const light = effectiveTheme() === 'light';
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', light ? '#f5f6fa' : '#0b0d12'));
  document.querySelectorAll('.theme-btn').forEach(paintThemeBtn);
}
function paintThemeBtn(b) {
  const light = effectiveTheme() === 'light';
  b.innerHTML = icon(light ? 'moon' : 'sun');
  b.title = light ? 'Dunkles Design' : 'Helles Design';
  b.setAttribute('aria-label', b.title);
}
function themeButton() {
  const b = document.createElement('button');
  b.className = 'icon-btn theme-btn';
  b.onclick = () => applyTheme(effectiveTheme() === 'light' ? 'dark' : 'light');
  paintThemeBtn(b);
  return b;
}

// ---------------------------------------------------------------------------
// Push-Benachrichtigungen (Bias kippt, Termin in 30 min, Systemfehler)
// ---------------------------------------------------------------------------
export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const b64ToBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4)), c => c.charCodeAt(0));

export async function pushSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}
export async function pushEnable() {
  const { supabase } = await import('./accounts.js');
  const reg = await navigator.serviceWorker.ready;
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Benachrichtigungen wurden nicht erlaubt (Browser-Einstellungen).');
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID_PUBLIC) });
  const j = sub.toJSON();
  const { error } = await supabase.from('push_subscriptions').upsert(
    { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent.slice(0, 200) },
    { onConflict: 'endpoint' });
  if (error) throw error;
  await supabase.functions.invoke('push-notify', { body: { test: true, endpoint: j.endpoint } });
  return sub;
}
export async function pushDisable() {
  const { supabase } = await import('./accounts.js');
  const sub = await pushSubscription();
  if (!sub) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe();
}

function bellButton() {
  const b = document.createElement('button');
  b.className = 'icon-btn';
  b.innerHTML = icon('bell');
  const set = (on) => {
    b.classList.toggle('on', on);
    b.title = on ? 'Benachrichtigungen an (tippen zum Ausschalten)' : 'Benachrichtigungen einschalten';
    b.setAttribute('aria-label', b.title);
    b.setAttribute('aria-pressed', String(on));
  };
  set(false);
  if (pushSupported()) pushSubscription().then(s => set(!!s)).catch(() => {});

  b.onclick = async () => {
    if (!pushSupported()) {
      toast(isIOS() && !standalone()
        ? 'Auf dem iPhone: erst „Teilen → Zum Home-Bildschirm“, dann in der App die Glocke antippen.'
        : 'Dieser Browser unterstützt keine Benachrichtigungen.');
      return;
    }
    b.disabled = true;
    try {
      if (await pushSubscription()) { await pushDisable(); set(false); toast('Benachrichtigungen aus.'); }
      else { await pushEnable(); set(true); toast('Benachrichtigungen an – eine Testnachricht ist unterwegs.'); }
    } catch (err) {
      console.error(err);
      toast('Konnte Benachrichtigungen nicht umschalten: ' + (err.message || err));
    } finally {
      b.disabled = false;
    }
  };
  return b;
}

// ---------------------------------------------------------------------------
// Meine Ansicht / Produkt-Ansicht mit Paketen
// ---------------------------------------------------------------------------
export function viewState() {
  return { product: ls.get(VIEW_KEY) === 'product', plan: planOf(ls.get(PLAN_KEY)).key };
}
export function setView(product, plan) {
  ls.set(VIEW_KEY, product ? 'product' : null);
  if (plan) ls.set(PLAN_KEY, plan);
  applyView();
  window.dispatchEvent(new CustomEvent('view-changed', { detail: viewState() }));
}

// Seite und Elemente nach Ansicht/Paket ein- oder ausblenden
export function applyView() {
  const { product, plan } = viewState();
  const html = document.documentElement;
  html.classList.toggle('view-product', product);
  html.dataset.plan = plan;
  document.querySelectorAll('[data-tier]').forEach(el => {
    const locked = product && RANK[el.dataset.tier] > RANK[plan];
    el.classList.toggle('tier-locked', locked);
    if (locked) el.dataset.lockLabel = `Im Paket ${planOf(el.dataset.tier).label}`;
  });
  renderBanner();
  renderPageLock();
  document.querySelectorAll('.area-nav .tab-link').forEach(a => {
    const area = AREAS.find(x => x.key === a.dataset.area);
    a.hidden = product && !!area?.owner;
    a.classList.toggle('locked', product && !!area?.tier && RANK[area.tier] > RANK[plan]);
  });
  document.querySelectorAll('.subnav .sub-link').forEach(a => {
    const page = AREAS.flatMap(x => x.pages).find(p => p.href === a.getAttribute('href'));
    a.hidden = product && !!page?.owner;
  });
  document.querySelectorAll('.view-btn').forEach(b => {
    b.classList.toggle('on', product);
    b.title = product ? 'Produkt-Ansicht aktiv – zurück zu meiner Ansicht' : 'Produkt-Ansicht: so sähe ein zahlender Nutzer die App';
    b.setAttribute('aria-label', b.title);
    b.setAttribute('aria-pressed', String(product));
  });
}

function renderBanner() {
  const { product, plan } = viewState();
  let bar = document.querySelector('.view-banner');
  if (!product) { bar?.remove(); return; }
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'view-banner';
    (document.querySelector('.subnav') || document.querySelector('.topbar'))?.insertAdjacentElement('afterend', bar);
  }
  bar.innerHTML = `<span class="vb-title">${icon('eye')} Produkt-Vorschau</span>
    <div class="vb-plans" role="group" aria-label="Paket">${PLANS.map(p => `<button class="chip${p.key === plan ? ' active' : ''}" data-plan="${p.key}" title="${p.text}">${p.label} <span class="n">${p.price}</span></button>`).join('')}</div>
    <button class="btn-ghost sm vb-exit">Meine Ansicht</button>`;
  bar.querySelectorAll('[data-plan]').forEach(c => { c.onclick = () => setView(true, c.dataset.plan); });
  bar.querySelector('.vb-exit').onclick = () => setView(false);
}

function renderPageLock() {
  document.querySelector('.page-lock')?.remove();
  const { product, plan } = viewState();
  if (!product) return;
  const page = currentPage();
  const area = AREAS.find(a => a.pages.some(p => p.href === page));
  const pg = area?.pages.find(p => p.href === page);
  const owner = area?.owner || pg?.owner;
  const need = !owner && area?.tier && RANK[area.tier] > RANK[plan] ? planOf(area.tier) : null;
  if (!owner && !need) return;
  const box = document.createElement('div');
  box.className = 'page-lock';
  box.innerHTML = `<div class="pl-card">
    <span class="pl-ico">${icon(owner ? 'eye' : 'lock')}</span>
    <h2>${owner ? 'Nicht Teil des Produkts' : `Im Paket ${need.label}`}</h2>
    <p>${owner ? 'Dieser Bereich gehört zu deinem eigenen Setup (Bot, Abgleich, eigene Rechnungen) und wäre für Kunden nicht sichtbar.'
      : `${need.text}. Ab ${need.price} im Monat.`}</p>
    <div class="pl-actions">${owner ? '' : `<button class="btn-primary" data-plan="${need.key}">Vorschau mit ${need.label}</button>`}
      <a class="btn-ghost" href="${START_PAGE}">Zum Cockpit</a><button class="btn-ghost" data-exit>Meine Ansicht</button></div></div>`;
  box.querySelector('[data-plan]')?.addEventListener('click', (e) => setView(true, e.target.dataset.plan));
  box.querySelector('[data-exit]').onclick = () => setView(false);
  document.querySelector('main')?.prepend(box);
}

function viewButton() {
  const b = document.createElement('button');
  b.className = 'icon-btn view-btn';
  b.innerHTML = icon('eye');
  b.onclick = () => setView(!viewState().product);
  return b;
}

// ---------------------------------------------------------------------------
// "+": Auswahl zwischen Trade-Idee und Trade erfassen
// ---------------------------------------------------------------------------
function plusMenu(e) {
  e?.preventDefault();
  const backdrop = document.createElement('div');
  backdrop.className = 'sheet-backdrop';
  const sheet = document.createElement('div');
  sheet.className = 'sheet sheet-small';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-label', 'Neu anlegen');
  const { product, plan } = viewState();
  const lockedPro = product && RANK[plan] < RANK.pro;
  sheet.innerHTML = `<button class="sheet-handle" aria-label="Schließen"></button>
    <div class="modal-header"><h2>Neu</h2><button class="modal-close" aria-label="Schließen">✕</button></div>
    <div class="plus-menu">
      <a href="cockpit.html#idee"${lockedPro ? ' class="locked"' : ''}><span class="ico">${icon('cockpit')}</span><span>Trade-Idee planen<small>${lockedPro ? 'im Paket Pro' : 'Entry, SL, TP, Begründung und Screenshot'}</small></span></a>
      <a href="index.html#neu"${lockedPro ? ' class="locked"' : ''}><span class="ico">${icon('plus')}</span><span>Trade erfassen<small>${lockedPro ? 'im Paket Pro' : 'direkt ins Journal'}</small></span></a>
    </div>`;
  const close = () => { backdrop.remove(); sheet.remove(); document.removeEventListener('keydown', esc); };
  const esc = (ev) => { if (ev.key === 'Escape') close(); };
  backdrop.onclick = close;
  sheet.querySelectorAll('.sheet-handle, .modal-close, .plus-menu a').forEach(x => x.addEventListener('click', close));
  document.addEventListener('keydown', esc);
  document.body.append(backdrop, sheet);
  sheet.querySelector('.plus-menu a').focus();
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------
export function renderNav() {
  // Startadresse ohne Dateinamen -> Cockpit (index.html ist das Journal)
  if (!location.pathname.split('/').pop() && !location.hash) {
    location.replace(START_PAGE);
    return;
  }
  const page = currentPage();
  const area = AREAS.find(a => a.pages.some(p => p.href === page)) || AREAS[0];

  const header = document.querySelector('.topbar');
  const brand = header?.querySelector('.brand');
  if (brand && brand.tagName !== 'A') {
    const a = document.createElement('a');
    a.className = 'brand';
    a.href = START_PAGE;
    a.innerHTML = '<span class="brand-mark" aria-hidden="true">◈</span><span class="brand-text">Trading Journal</span>';
    brand.replaceWith(a);
  }

  const nav = header?.querySelector('.tabnav');
  if (nav) {
    nav.classList.add('area-nav');
    nav.setAttribute('aria-label', 'Bereiche');
    const link = (a) => `
      <a href="${a.pages[0].href}" data-area="${a.key}" class="tab-link${a === area ? ' active' : ''}"${a === area ? ' aria-current="page"' : ''}>
        <span class="tab-icon">${icon(a.key)}</span><span class="tab-label">${a.label}</span><span class="tab-lock" aria-hidden="true">${icon('lock')}</span>
      </a>`;
    const [c, d, au, bu] = AREAS;
    nav.innerHTML = link(c) + link(d)
      + `<a href="index.html#neu" class="nav-add-mid" aria-label="Neu: Trade-Idee oder Trade" title="Neu">${icon('plus')}</a>`
      + link(au) + link(bu);
    nav.querySelector('.nav-add-mid').addEventListener('click', plusMenu);
  }

  const visiblePages = area.pages.filter(p => !p.hidden || p.href === page);
  if (header && visiblePages.length > 1 && !document.querySelector('.subnav')) {
    const sub = document.createElement('nav');
    sub.className = 'subnav';
    sub.setAttribute('aria-label', area.label);
    sub.innerHTML = visiblePages.map(p =>
      `<a href="${p.href}" class="sub-link${p.href === page ? ' active' : ''}"${p.href === page ? ' aria-current="page"' : ''}>${p.label}</a>`).join('');
    header.insertAdjacentElement('afterend', sub);
  }

  if (header && !header.querySelector('.topbar-tools')) {
    const tools = document.createElement('div');
    tools.className = 'topbar-tools';
    const gear = document.createElement('a');
    gear.className = `icon-btn${page === 'settings.html' ? ' on' : ''}`;
    gear.href = 'settings.html';
    gear.title = 'Einstellungen';
    gear.setAttribute('aria-label', 'Einstellungen');
    gear.innerHTML = icon('gear');
    tools.append(viewButton(), bellButton(), themeButton(), gear);
    // "+ Neu" am Desktop; im Journal gibt es den eigenen Knopf
    if (!document.getElementById('openAddTrade')) {
      const add = document.createElement('a');
      add.href = 'index.html#neu';
      add.className = 'btn-primary sm nav-add';
      add.innerHTML = `<span style="display:inline-flex;width:16px">${icon('plus')}</span> Neu`;
      add.title = 'Trade-Idee oder Trade anlegen';
      add.addEventListener('click', plusMenu);
      tools.appendChild(add);
    }
    header.appendChild(tools);
  }

  const pageLabel = area.pages.find(p => p.href === page)?.label;
  document.title = `${area.label}${pageLabel && area.pages.length > 1 ? ' · ' + pageLabel : ''} — Trading Journal`;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyView);
  else applyView();
}

export const LOGOUT_ICON = icon('logout');

// Service Worker: Offline-Start, App-Installation, Push. Bei neuer Version sofort übernehmen.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service Worker', err));
}
