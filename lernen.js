// Wissen: öffentliche Lernseite ohne Anmeldung (keine Daten), nur der App-Rahmen.
// Kategorien-Filter, Suche, Direktlinks (#cpi öffnet die Karte) und Übungsfragen.
import { renderNav } from './nav.js';

renderNav();

const $ = (id) => document.getElementById(id);
const cards = [...document.querySelectorAll('#lnCards .lc')];
const big = document.querySelector('.ln-big');
let cat = 'alle';

function apply() {
  const q = $('lnSearch').value.trim().toLowerCase();
  let shown = 0;
  for (const c of cards) {
    const inCat = cat === 'alle' || c.dataset.cat === cat;
    const hit = !q || c.textContent.toLowerCase().includes(q);
    c.hidden = !(inCat && hit);
    if (!c.hidden) shown++;
    // Bei einer Suche Treffer direkt aufklappen, damit man die Stelle sieht
    const d = c.querySelector('details');
    if (d && q) d.open = hit;
  }
  big.hidden = !!q || !(cat === 'alle' || cat === 'grundlagen');
  $('lnEmpty').hidden = shown > 0;
}

$('lnCats').addEventListener('click', (e) => {
  const b = e.target.closest('[data-cat]');
  if (!b) return;
  cat = b.dataset.cat;
  $('lnCats').querySelectorAll('.chip').forEach(x => {
    x.classList.toggle('active', x === b);
    x.setAttribute('aria-pressed', String(x === b));
  });
  apply();
});
let t;
$('lnSearch').addEventListener('input', () => { clearTimeout(t); t = setTimeout(apply, 150); });

// Direktlink: lernen.html#cpi öffnet und zeigt die Karte (zum Teilen einzelner Themen)
function openFromHash() {
  const id = decodeURIComponent(location.hash.slice(1));
  const card = id ? document.getElementById(id) : null;
  if (!card || !card.classList.contains('lc')) return;
  if (card.hidden) {   // durch Filter oder Suche ausgeblendet: zurück auf "Alle"
    $('lnSearch').value = '';
    $('lnCats').querySelector('[data-cat="alle"]').click();
  }
  const d = card.querySelector('details');
  if (d) d.open = true;
  card.scrollIntoView({ block: 'start', behavior: 'smooth' });
}
window.addEventListener('hashchange', openFromHash);
openFromHash();

// ---------------------------------------------------------------------------
// Übungsfragen
// ---------------------------------------------------------------------------
const QUIZ = [
  {
    q: 'Die US-Inflation steigt auf 3,4 %. Erwartet waren 3,1 %. Was passiert wahrscheinlich mit dem US-Dollar?',
    a: ['Er steigt', 'Er fällt', 'Keine Reaktion'], ok: 0,
    why: 'Höher als erwartet → die Fed muss eher straffer bleiben → höhere Zinserwartung → Dollar stärker.',
    link: 'inflation-zins',
  },
  {
    q: 'Die EZB erhöht den Zins wie von allen erwartet, sagt aber, dies sei „vorerst der letzte Schritt“. Der Euro …',
    a: ['steigt deutlich', 'fällt eher', 'bleibt sicher unverändert'], ok: 1,
    why: 'Die Erhöhung war eingepreist. Neu ist der vorsichtige Ausblick – der Markt rechnet mit weniger Zinsen als gedacht.',
    link: 'forward-guidance',
  },
  {
    q: 'Die Inflation in einem Land steigt auf 2,8 %, erwartet waren 3,2 %. Wie reagiert die Währung eher?',
    a: ['Steigt, weil die Inflation gestiegen ist', 'Fällt, weil die Zahl unter der Erwartung liegt'], ok: 1,
    why: 'Es zählt die Überraschung: weniger als erwartet → weniger Druck auf die Notenbank → Währung eher schwächer.',
    link: 'erwartung-vs-ist',
  },
  {
    q: 'Aktienmärkte brechen weltweit ein, der VIX springt auf 35. Welche Währungen sind typischerweise gefragt?',
    a: ['AUD und NZD', 'JPY, CHF und USD', 'NOK und CAD'], ok: 1,
    why: 'Risk-off: Geld flieht in sichere Häfen, Carry Trades werden aufgelöst – Yen und Franken profitieren besonders.',
    link: 'risk-on-off',
  },
  {
    q: 'Der Ölpreis steigt kräftig. Welche Währung profitiert am ehesten?',
    a: ['Kanadischer Dollar (CAD)', 'Japanischer Yen (JPY)', 'Euro (EUR)'], ok: 0,
    why: 'Kanada exportiert viel Öl: höhere Einnahmen, mehr Nachfrage nach CAD. Japan und die Eurozone importieren Energie.',
    link: 'rohstoffe',
  },
  {
    q: 'Der Einkaufsmanagerindex fällt von 51,5 auf 49,2. Was bedeutet das?',
    a: ['Die Wirtschaft wächst schneller', 'Die Befragten melden erstmals Schrumpfung', 'Die Inflation sinkt'], ok: 1,
    why: 'Unter 50 bedeutet Schrumpfung. Ein Fall unter die Marke ist ein Warnsignal und belastet die Währung eher.',
    link: 'pmi',
  },
];

function renderQuiz() {
  $('quizBox').innerHTML = QUIZ.map((x, i) => `
    <div class="qz" data-i="${i}">
      <p class="qz-q"><b>${i + 1}.</b> ${x.q}</p>
      <div class="qz-a" role="group" aria-label="Antworten zu Frage ${i + 1}">${x.a.map((a, j) => `<button type="button" class="btn-ghost sm" data-j="${j}">${a}</button>`).join('')}</div>
      <p class="qz-why" hidden></p>
    </div>`).join('') + '<p class="qz-score" id="qzScore"></p>';
}
renderQuiz();
const answered = new Map();
$('quizBox').addEventListener('click', (e) => {
  const b = e.target.closest('[data-j]');
  if (!b) return;
  const box = b.closest('.qz');
  const i = Number(box.dataset.i), j = Number(b.dataset.j), x = QUIZ[i];
  if (answered.has(i)) return;
  answered.set(i, j === x.ok);
  box.querySelectorAll('[data-j]').forEach(btn => {
    const k = Number(btn.dataset.j);
    btn.disabled = true;
    btn.classList.toggle('right', k === x.ok);
    btn.classList.toggle('wrong', k === j && j !== x.ok);
  });
  const why = box.querySelector('.qz-why');
  why.hidden = false;
  why.innerHTML = `${j === x.ok ? '✓ Richtig.' : '✗ Nicht ganz.'} ${x.why} <a href="#${x.link}">Mehr dazu</a>`;
  if (answered.size === QUIZ.length) {
    const right = [...answered.values()].filter(Boolean).length;
    $('qzScore').innerHTML = `${right} von ${QUIZ.length} richtig. <button type="button" class="btn-ghost sm" id="qzAgain">Nochmal</button>`;
  }
});
$('quizBox').addEventListener('click', (e) => {
  if (e.target.id !== 'qzAgain') return;
  answered.clear();
  renderQuiz();
});
// "Mehr dazu" aus dem Quiz: Kategorie auf "Alle" stellen, damit die Karte sichtbar ist
$('quizBox').addEventListener('click', (e) => {
  if (!e.target.closest('.qz-why a')) return;
  $('lnCats').querySelector('[data-cat="alle"]').click();
});
