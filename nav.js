// Navigation und App-Rahmen für alle Seiten: vier Bereiche oben (Handy: Leiste
// unten mit "+" in der Mitte), Unter-Tabs, Hell/Dunkel-Umschalter, Glocke für
// Push-Benachrichtigungen und der Service Worker (App-Installation, immer
// aktuelle Dateien). Neue Seite eintragen = eine Zeile in AREAS.

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
};
export const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name] || ''}</svg>`;

const AREAS = [
  { key: 'cockpit', label: 'Cockpit', pages: [
    { href: 'cockpit.html', label: 'Überblick' },
    { href: 'planning.html', label: 'Tagesplan' },
  ] },
  { key: 'desk', label: 'Desk', pages: [
    { href: 'desk.html', label: 'Live' },
  ] },
  { key: 'auswertung', label: 'Auswertung', pages: [
    { href: 'dashboard.html', label: 'Übersicht' },
    { href: 'index.html', label: 'Journal' },
    { href: 'backtest.html', label: 'Backtest' },
    { href: 'level.html', label: 'Level' },
  ] },
  { key: 'business', label: 'Business', pages: [
    { href: 'business.html', label: 'Überblick & EÜR' },
    { href: 'accounting.html', label: 'Buchhaltung & Steuer' },
    { href: 'invoices.html', label: 'Rechnungen' },
  ] },
];

const START_PAGE = 'cockpit.html';
const VAPID_PUBLIC = 'BKpnibHWFcbXYYxh_emK2NTxBXRpiv8lVGqqLw_qrDtcTHohFlRFmiSY27vhPO1FwlWhrHYEF_XDqEJ75nHQS6Y';
const THEME_KEY = 'td_theme';

function currentPage() {
  return location.pathname.split('/').pop() || 'index.html';
}

// ---------------------------------------------------------------------------
// Kurze Meldung unten (für Seiten ohne eigenes #toast)
// ---------------------------------------------------------------------------
export function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.className = 'toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('visible');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('visible'), 3600);
}

// ---------------------------------------------------------------------------
// Hell / Dunkel: ohne Wahl gilt die Systemeinstellung
// ---------------------------------------------------------------------------
function effectiveTheme() {
  const t = document.documentElement.dataset.theme;
  if (t) return t;
  return matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem(THEME_KEY, t); } catch { /* privater Modus */ }
  document.querySelectorAll('meta[name="theme-color"]').forEach(m => m.setAttribute('content', t === 'light' ? '#f5f6fa' : '#0b0d12'));
}

function themeButton() {
  const b = document.createElement('button');
  b.className = 'icon-btn';
  const paint = () => {
    const light = effectiveTheme() === 'light';
    b.innerHTML = icon(light ? 'moon' : 'sun');
    b.title = light ? 'Dunkles Design' : 'Helles Design';
    b.setAttribute('aria-label', b.title);
  };
  b.onclick = () => { applyTheme(effectiveTheme() === 'light' ? 'dark' : 'light'); paint(); };
  paint();
  return b;
}

// ---------------------------------------------------------------------------
// Push-Benachrichtigungen (Bias kippt, Termin in 30 min, Systemfehler)
// ---------------------------------------------------------------------------
const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const b64ToBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - s.length % 4) % 4)), c => c.charCodeAt(0));

async function pushRegistration() {
  if (!('serviceWorker' in navigator)) return null;
  return navigator.serviceWorker.ready;
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

  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (supported) pushRegistration().then(r => r?.pushManager.getSubscription()).then(s => set(!!s)).catch(() => {});

  b.onclick = async () => {
    if (!supported) {
      toast(isIOS() && !standalone()
        ? 'Auf dem iPhone: erst „Teilen → Zum Home-Bildschirm“, dann in der App die Glocke antippen.'
        : 'Dieser Browser unterstützt keine Benachrichtigungen.');
      return;
    }
    b.disabled = true;
    try {
      const { supabase } = await import('./accounts.js');
      const reg = await pushRegistration();
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', existing.endpoint);
        await existing.unsubscribe();
        set(false);
        toast('Benachrichtigungen aus.');
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { toast('Benachrichtigungen wurden nicht erlaubt (Browser-Einstellungen).'); return; }
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(VAPID_PUBLIC) });
      const j = sub.toJSON();
      const { error } = await supabase.from('push_subscriptions').upsert(
        { endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, user_agent: navigator.userAgent.slice(0, 200) },
        { onConflict: 'endpoint' });
      if (error) throw error;
      set(true);
      await supabase.functions.invoke('push-notify', { body: { test: true } });
      toast('Benachrichtigungen an — eine Testnachricht ist unterwegs.');
    } catch (err) {
      console.error(err);
      toast('Konnte Benachrichtigungen nicht einschalten: ' + (err.message || err));
    } finally {
      b.disabled = false;
    }
  };
  return b;
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
      <a href="${a.pages[0].href}" class="tab-link${a === area ? ' active' : ''}"${a === area ? ' aria-current="page"' : ''}>
        <span class="tab-icon">${icon(a.key)}</span><span class="tab-label">${a.label}</span>
      </a>`;
    nav.innerHTML = link(AREAS[0]) + link(AREAS[1])
      + `<a href="index.html#neu" class="nav-add-mid" aria-label="Trade erfassen" title="Trade erfassen">${icon('plus')}</a>`
      + link(AREAS[2]) + link(AREAS[3]);
  }

  if (header && area.pages.length > 1 && !document.querySelector('.subnav')) {
    const sub = document.createElement('nav');
    sub.className = 'subnav';
    sub.setAttribute('aria-label', area.label);
    sub.innerHTML = area.pages.map(p =>
      `<a href="${p.href}" class="sub-link${p.href === page ? ' active' : ''}"${p.href === page ? ' aria-current="page"' : ''}>${p.label}</a>`).join('');
    header.insertAdjacentElement('afterend', sub);
  }

  if (header && !header.querySelector('.topbar-tools')) {
    const tools = document.createElement('div');
    tools.className = 'topbar-tools';
    tools.append(bellButton(), themeButton());
    // "+ Trade" am Desktop; im Journal gibt es den Knopf schon
    if (!document.getElementById('openAddTrade')) {
      const add = document.createElement('a');
      add.href = 'index.html#neu';
      add.className = 'btn-primary sm nav-add';
      add.innerHTML = `<span style="display:inline-flex;width:16px">${icon('plus')}</span> Trade`;
      add.title = 'Trade erfassen';
      tools.appendChild(add);
    }
    header.appendChild(tools);
  }

  const pageLabel = area.pages.find(p => p.href === page)?.label;
  document.title = `${area.label}${pageLabel && area.pages.length > 1 ? ' · ' + pageLabel : ''} — Trading Journal`;
}

export const LOGOUT_ICON = icon('logout');

// Service Worker: Offline-Start, App-Installation, Push. Bei neuer Version sofort übernehmen.
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(err => console.warn('Service Worker', err));
}
