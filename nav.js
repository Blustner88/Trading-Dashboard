// Navigation für alle Seiten: vier Bereiche oben, Unter-Tabs darunter,
// auf dem Handy die Bereiche als Leiste am unteren Rand.
// Seiten behalten ihre Dateien — nur die Gruppierung ist neu. Neue Seite
// eintragen = eine Zeile in AREAS.

const AREAS = [
  { key: 'cockpit', label: 'Cockpit', icon: '◎', pages: [
    { href: 'cockpit.html', label: 'Überblick' },
    { href: 'planning.html', label: 'Tagesplan' },
  ] },
  { key: 'desk', label: 'Desk', icon: '◉', pages: [
    { href: 'desk.html', label: 'Live' },
  ] },
  { key: 'auswertung', label: 'Auswertung', icon: '◫', pages: [
    { href: 'dashboard.html', label: 'Übersicht' },
    { href: 'index.html', label: 'Journal' },
    { href: 'backtest.html', label: 'Backtest' },
    { href: 'level.html', label: 'Level' },
  ] },
  { key: 'business', label: 'Business', icon: '▣', pages: [
    { href: 'accounting.html', label: 'Buchhaltung & Steuer' },
    { href: 'invoices.html', label: 'Rechnungen' },
  ] },
];

const START_PAGE = 'cockpit.html';

function currentPage() {
  const file = location.pathname.split('/').pop();
  return file || 'index.html';
}

export function renderNav() {
  // Startadresse ohne Dateinamen -> Cockpit (index.html ist das Journal)
  if (!location.pathname.split('/').pop() && !location.hash) {
    location.replace(START_PAGE);
    return;
  }
  const page = currentPage();
  const area = AREAS.find(a => a.pages.some(p => p.href === page)) || AREAS[0];

  const nav = document.querySelector('.topbar .tabnav');
  if (nav) {
    nav.classList.add('area-nav');
    nav.setAttribute('aria-label', 'Bereiche');
    nav.innerHTML = AREAS.map(a => `
      <a href="${a.pages[0].href}" class="tab-link${a === area ? ' active' : ''}"${a === area ? ' aria-current="page"' : ''}>
        <span class="tab-icon" aria-hidden="true">${a.icon}</span><span class="tab-label">${a.label}</span>
      </a>`).join('');
  }

  const header = document.querySelector('.topbar');
  if (header && area.pages.length > 1 && !document.querySelector('.subnav')) {
    const sub = document.createElement('nav');
    sub.className = 'subnav';
    sub.setAttribute('aria-label', area.label);
    sub.innerHTML = area.pages.map(p =>
      `<a href="${p.href}" class="sub-link${p.href === page ? ' active' : ''}"${p.href === page ? ' aria-current="page"' : ''}>${p.label}</a>`).join('');
    header.insertAdjacentElement('afterend', sub);
  }

  // "+ Trade" auf jeder Seite; im Journal gibt es den Knopf schon
  if (header && !document.getElementById('openAddTrade')) {
    const add = document.createElement('a');
    add.href = 'index.html#neu';
    add.className = 'btn-primary nav-add';
    add.innerHTML = '<span aria-hidden="true">＋</span><span class="nav-add-label"> Trade</span>';
    add.title = 'Trade erfassen';
    header.appendChild(add);
  }

  const pageLabel = area.pages.find(p => p.href === page)?.label;
  document.title = `${area.label}${pageLabel && area.pages.length > 1 ? ' · ' + pageLabel : ''} — Trading Journal`;
}
