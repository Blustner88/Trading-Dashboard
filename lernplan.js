import { supabase } from './accounts.js';
import { toast, toastError } from './nav.js';
import { MODULES, ALL_LESSONS } from './lernplan-data.js';

// Lernplan: Module mit Lektionen, Aufgabe und Kontrollfragen.
// Fortschritt in user_settings.lernplan_progress = { <lektion>: { done: 'YYYY-MM-DD', quiz: richtige, of: fragen } }
// Direktlink: lernplan.html#r-multiple öffnet die Lektion.

const $ = (id) => document.getElementById(id);
const KEY = 'lernplan_progress';
const todayIso = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const dm = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });

let progress = {};
let answers = new Map();   // Frage-Index -> richtig?
let order = [];            // gemischte Antwort-Reihenfolge je Frage

const isDone = (id) => !!progress[id]?.done;
const nextLesson = () => ALL_LESSONS.find(l => !isDone(l.id));

async function load() {
  const { data, error } = await supabase.from('user_settings').select('value').eq('key', KEY).maybeSingle();
  if (error) toastError('Fortschritt nicht geladen', error);
  progress = data?.value && typeof data.value === 'object' ? data.value : {};
  route();
}

async function save() {
  const { error } = await supabase.from('user_settings').upsert({ key: KEY, value: progress, updated_at: new Date().toISOString() });
  if (error) { toastError('Fortschritt nicht gespeichert', error); return false; }
  return true;
}

// ---------------------------------------------------------------------------
// Übersicht
// ---------------------------------------------------------------------------
function renderOverview() {
  const done = ALL_LESSONS.filter(l => isDone(l.id));
  const pct = ALL_LESSONS.length ? done.length / ALL_LESSONS.length * 100 : 0;
  const quizRight = done.reduce((s, l) => s + (progress[l.id].quiz || 0), 0);
  const quizAll = done.reduce((s, l) => s + (progress[l.id].of || 0), 0);
  $('lpCount').textContent = `${done.length} von ${ALL_LESSONS.length} Lektionen`;
  $('lpQuiz').textContent = quizAll ? `Kontrollfragen: ${Math.round(quizRight / quizAll * 100)} % richtig` : '';
  $('lpBarFill').style.width = `${pct}%`;
  $('lpBar').setAttribute('aria-valuenow', Math.round(pct));
  const modDone = MODULES.filter(m => m.lessons.every(l => isDone(l.id))).length;
  $('lpBadge').textContent = `${modDone} / ${MODULES.length} Module`;

  const next = nextLesson();
  $('lpNext').innerHTML = next
    ? `<a class="lp-next" href="#${next.id}"><span class="kpi-label">Nächste Lektion · ${next.moduleTitle}</span><b>${next.title}</b><span>${next.goal}</span></a>`
    : '<p class="lp-next done">Alle Lektionen abgeschlossen. Wiederhole die Kontrollfragen vor jedem neuen 100-Trade-Block.</p>';

  $('lpModules').innerHTML = MODULES.map((m, mi) => {
    const n = m.lessons.filter(l => isDone(l.id)).length;
    return `<section class="panel">
      <div class="panel-header"><h3>${mi + 1}. ${m.title}</h3><span class="st-hint">${m.phase} · ${n} / ${m.lessons.length}</span></div>
      <p class="lp-intro">${m.intro}</p>
      <ol class="lp-list">${m.lessons.map(l => {
        const p = progress[l.id];
        return `<li class="${p?.done ? 'done' : ''}"><a href="#${l.id}">
          <span class="lp-check" aria-hidden="true">${p?.done ? '✓' : ''}</span>
          <span class="lp-title">${l.title}<small>${l.goal}</small></span>
          <span class="lp-meta">${p?.done ? `${dm(p.done)} · ${p.quiz}/${p.of}` : '25 Min'}</span></a></li>`;
      }).join('')}</ol>
    </section>`;
  }).join('');
}

// ---------------------------------------------------------------------------
// Lektion
// ---------------------------------------------------------------------------
function shuffle(n) {
  const a = [...Array(n).keys()];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function renderLesson(l) {
  answers = new Map();
  order = l.quiz.map(q => shuffle(q.a.length));
  const i = ALL_LESSONS.findIndex(x => x.id === l.id);
  const prev = ALL_LESSONS[i - 1], next = ALL_LESSONS[i + 1];
  const p = progress[l.id];
  $('lpLesson').innerHTML = `
    <a class="lp-back" href="#">← Lernplan</a>
    <span class="lc-cat">${l.moduleTitle} · Lektion ${i + 1} von ${ALL_LESSONS.length}</span>
    <h1 class="lp-h1">${l.title}</h1>
    <p class="lp-goal"><b>Ziel:</b> ${l.goal}</p>
    <div class="lp-body">${l.body}</div>
    <p class="lp-rule">${l.rule}</p>
    <section class="lp-task">
      <h3>Aufgabe</h3>
      <p>${l.task}</p>
      <div class="lp-links">${l.links.map(([href, label]) => `<a class="btn-ghost sm" href="${href}">${label}</a>`).join('')}</div>
    </section>
    <section class="lp-quiz">
      <h3>Kontrollfragen</h3>
      <div id="lpQz">${l.quiz.map((x, qi) => `
        <div class="qz" data-i="${qi}">
          <p class="qz-q"><b>${qi + 1}.</b> ${x.q}</p>
          <div class="qz-a" role="group" aria-label="Antworten zu Frage ${qi + 1}">${order[qi].map(j => `<button type="button" class="btn-ghost sm" data-j="${j}">${x.a[j]}</button>`).join('')}</div>
          <p class="qz-why" hidden></p>
        </div>`).join('')}</div>
    </section>
    <div class="lp-actions">
      ${prev ? `<a class="btn-ghost" href="#${prev.id}">← Zurück</a>` : '<span></span>'}
      <button type="button" class="btn-primary" id="lpDone">${p?.done ? `Abgeschlossen am ${dm(p.done)} · erneut speichern` : 'Lektion abschließen'}</button>
      ${next ? `<a class="btn-ghost" href="#${next.id}">Weiter →</a>` : '<span></span>'}
    </div>
    ${p?.done ? '<p class="lp-undo"><button type="button" class="btn-ghost sm" id="lpUndo">Als offen markieren</button></p>' : ''}`;
  $('lpLesson').dataset.id = l.id;
}

$('lpLesson').addEventListener('click', async (e) => {
  const l = ALL_LESSONS.find(x => x.id === $('lpLesson').dataset.id);
  if (!l) return;

  const b = e.target.closest('[data-j]');
  if (b) {
    const box = b.closest('.qz');
    const qi = Number(box.dataset.i), j = Number(b.dataset.j), x = l.quiz[qi];
    if (answers.has(qi)) return;
    answers.set(qi, j === x.ok);
    box.querySelectorAll('[data-j]').forEach(btn => {
      const k = Number(btn.dataset.j);
      btn.disabled = true;
      btn.classList.toggle('right', k === x.ok);
      btn.classList.toggle('wrong', k === j && j !== x.ok);
    });
    const why = box.querySelector('.qz-why');
    why.hidden = false;
    why.textContent = `${j === x.ok ? '✓ Richtig.' : '✗ Nicht ganz.'} ${x.why}`;
    return;
  }

  if (e.target.id === 'lpDone') {
    if (answers.size < l.quiz.length) { toast('Beantworte zuerst die Kontrollfragen.'); return; }
    const right = [...answers.values()].filter(Boolean).length;
    const before = progress[l.id];
    progress[l.id] = { done: todayIso(), quiz: right, of: l.quiz.length };
    if (!(await save())) { progress[l.id] = before; return; }
    toast(right === l.quiz.length ? 'Lektion abgeschlossen – alles richtig ✓' : `Lektion abgeschlossen · ${right} von ${l.quiz.length} richtig`);
    const nxt = nextLesson();
    location.hash = nxt ? nxt.id : '';
  }

  if (e.target.id === 'lpUndo') {
    const before = progress[l.id];
    delete progress[l.id];
    if (!(await save())) { progress[l.id] = before; return; }
    renderLesson(l);
  }
});

// ---------------------------------------------------------------------------
// Navigation über den Hash
// ---------------------------------------------------------------------------
function route() {
  const id = decodeURIComponent(location.hash.slice(1));
  const l = ALL_LESSONS.find(x => x.id === id);
  $('lpOverview').hidden = !!l;
  $('lpLesson').hidden = !l;
  if (l) renderLesson(l); else renderOverview();
  window.scrollTo({ top: 0 });
}
window.addEventListener('hashchange', route);

load();
