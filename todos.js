import { supabase } from './accounts.js';
import { toast, toastError } from './nav.js';

// Gemeinsame To-do-Liste (Tabelle todos): Claude pflegt die Einträge, du hakst ab
// und kannst unter "Bei dir" eigene Punkte ergänzen.

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const SECTIONS = [
  ['du', 'Bei dir', 'Das kannst nur du erledigen.'],
  ['claude', 'Bei Claude', 'Erledigt Claude, teils sobald du deinen Teil gemacht hast.'],
  ['beobachten', 'Beobachten', 'Braucht Zeit oder Daten, kein Handgriff nötig.'],
  ['verkauf', 'Vor einem Verkauf', 'Größere Pakete, bevor die App an Kunden geht.'],
];
const dmy = (ts) => new Date(ts).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });

let todos = [];

// Zeilen mit "- " als Liste, sonst Absatz
function detailsHtml(text) {
  if (!text) return '';
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const items = lines.filter(l => l.startsWith('- '));
  if (items.length === lines.length) return `<ul>${items.map(l => `<li>${esc(l.slice(2))}</li>`).join('')}</ul>`;
  return lines.map(l => `<p>${esc(l.replace(/^- /, '• '))}</p>`).join('');
}

function itemHtml(t) {
  const body = detailsHtml(t.details);
  const title = `<span class="td-title">${esc(t.title)}</span>${t.done && t.done_at ? `<span class="td-when">erledigt ${dmy(t.done_at)}</span>` : ''}`;
  return `<li class="td-item${t.done ? ' done' : ''}" data-id="${t.id}">
    <label class="td-check"><input type="checkbox" ${t.done ? 'checked' : ''} aria-label="${esc(t.title)} erledigt"></label>
    ${body ? `<details><summary>${title}</summary><div class="td-details">${body}</div></details>` : `<div class="td-plain">${title}</div>`}
  </li>`;
}

function render() {
  const open = todos.filter(t => !t.done);
  const mine = open.filter(t => t.section === 'du').length;
  $('todoSummary').textContent = `${open.length} offen · davon ${mine} bei dir. Claude trägt ein, du hakst ab.`;
  $('todoSections').innerHTML = SECTIONS.map(([key, label, hint]) => {
    const all = todos.filter(t => t.section === key);
    const openItems = all.filter(t => !t.done);
    const done = all.filter(t => t.done);
    let list = '';
    let topic = null;
    for (const t of openItems) {
      if (t.topic && t.topic !== topic) { topic = t.topic; list += `<li class="td-topic">${esc(topic)}</li>`; }
      list += itemHtml(t);
    }
    return `<section class="panel td-sec" data-section="${key}">
      <div class="panel-header"><h3>${label} <span class="td-count">${openItems.length}</span></h3><span class="st-hint">${hint}</span></div>
      ${openItems.length ? `<ul class="td-list">${list}</ul>` : '<p class="td-empty">Alles erledigt.</p>'}
      ${key === 'du' ? `<form class="td-add" id="addForm"><input name="text" placeholder="Eigenen Punkt ergänzen …" maxlength="200" aria-label="Neuer Punkt"><button class="btn-ghost sm" type="submit">Hinzufügen</button></form>` : ''}
      ${done.length ? `<details class="td-done"><summary>Erledigt (${done.length})</summary><ul class="td-list">${done.map(itemHtml).join('')}</ul></details>` : ''}
    </section>`;
  }).join('');
}

async function load() {
  const { data, error } = await supabase.from('todos').select('*').order('sort_order').order('created_at');
  if (error) { toastError('To-dos nicht geladen', error); return; }
  todos = data || [];
  render();
}

$('todoSections').addEventListener('change', async (e) => {
  const box = e.target.closest('.td-check input');
  if (!box) return;
  const id = Number(box.closest('.td-item').dataset.id);
  const t = todos.find(x => x.id === id);
  const done = box.checked;
  const before = { done: t.done, done_at: t.done_at };
  Object.assign(t, { done, done_at: done ? new Date().toISOString() : null });
  render();
  const { error } = await supabase.from('todos').update({ done, done_at: t.done_at, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) { Object.assign(t, before); render(); toastError('Nicht gespeichert', error); return; }
  if (done) toast('Erledigt ✓');
});

$('todoSections').addEventListener('submit', async (e) => {
  if (e.target.id !== 'addForm') return;
  e.preventDefault();
  const input = e.target.elements.text;   // nicht .title: das ist das title-Attribut des Formulars
  const title = input.value.trim();
  if (!title) return;
  const btn = e.target.querySelector('button');
  btn.disabled = true;
  const { data, error } = await supabase.from('todos')
    .insert({ section: 'du', title, created_by: 'nutzer', sort_order: 200 }).select().single();
  btn.disabled = false;
  if (error) { toastError('Nicht gespeichert', error); return; }
  todos.push(data);
  render();
  $('addForm').elements.text.focus();
});

load();
