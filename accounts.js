import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const SUPABASE_URL = 'https://rabbtdooayruveribarq.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_CsC9Ji0H9w_Xkbgoy1QtRg_RasuZtuX';
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ---------------------------------------------------------------------------
// Login: alle Seiten importieren dieses Modul, das top-level await unten hält
// sie an, bis eine Sitzung besteht. Die Datenbank lässt ohne Login nichts zu
// (RLS: nur das Konto in app_owners). Sitzung bleibt im Browser gespeichert.
// ---------------------------------------------------------------------------
const LOGIN_EMAIL_KEY = 'td_login_email';
const loginEsc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function injectLoginStyles() {
  if (document.getElementById('td-login-styles')) return;
  const st = document.createElement('style');
  st.id = 'td-login-styles';
  st.textContent = `
    .td-login { position: fixed; inset: 0; z-index: 9999; display: grid; place-items: center; padding: 16px;
      background: radial-gradient(1200px 600px at 20% 0%, rgba(99,102,241,.18), transparent 60%), var(--bg, #0b0d14); }
    .td-login form { width: min(380px, 100%); background: var(--surface, #12151f); border: 1px solid var(--border-soft, #232838);
      border-radius: 14px; padding: 26px 24px; display: flex; flex-direction: column; gap: 12px; box-shadow: 0 30px 80px -30px rgba(0,0,0,.8); }
    .td-login h1 { margin: 0 0 4px; font: 600 20px var(--font-display, system-ui); color: var(--text, #e7e9ee); display: flex; gap: 8px; align-items: center; }
    .td-login p { margin: 0; font-size: 13px; color: var(--text-muted, #9aa3b5); line-height: 1.45; }
    .td-login label { font-size: 12px; color: var(--text-muted, #9aa3b5); display: flex; flex-direction: column; gap: 5px; }
    .td-login input { font: 14px var(--font-body, system-ui); padding: 10px 12px; border-radius: 8px; color: var(--text, #e7e9ee);
      background: var(--surface-2, #171b27); border: 1px solid var(--border, #2c3346); }
    .td-login input:focus { outline: 2px solid var(--indigo-bright, #818cf8); outline-offset: 1px; }
    .td-login button { font: 600 14px var(--font-body, system-ui); padding: 10px 12px; border-radius: 8px; border: 0; cursor: pointer;
      background: var(--indigo, #6366f1); color: #fff; }
    .td-login button:disabled { opacity: .6; cursor: wait; }
    .td-login .td-link { background: none; color: var(--text-muted, #9aa3b5); padding: 0; font-weight: 500; font-size: 12.5px; text-decoration: underline; align-self: flex-start; }
    .td-login .td-msg { font-size: 12.5px; min-height: 1em; }
    .td-login .td-msg.err { color: var(--loss, #fb7185); } .td-login .td-msg.ok { color: var(--profit, #4ade80); }
    .td-logout { margin-left: 10px; font: 500 12px var(--font-body, system-ui); padding: 6px 10px; border-radius: 8px; cursor: pointer;
      background: transparent; color: var(--text-muted, #9aa3b5); border: 1px solid var(--border-soft, #232838); }
    .td-logout:hover { color: var(--text, #e7e9ee); }`;
  document.head.appendChild(st);
}

function loginForm(mode) {
  const email = loginEsc(localStorage.getItem(LOGIN_EMAIL_KEY) || '');
  if (mode === 'recovery') {
    return `<form autocomplete="on">
      <h1><span>◈</span> Neues Passwort</h1>
      <p>Lege ein neues Passwort für dein Trading Journal fest.</p>
      <label>Neues Passwort<input name="password" type="password" autocomplete="new-password" minlength="10" required></label>
      <button type="submit">Passwort speichern</button>
      <div class="td-msg" role="status"></div>
    </form>`;
  }
  return `<form autocomplete="on">
    <h1><span>◈</span> Trading Journal</h1>
    <p>Bitte anmelden. Ohne Login sind keine Daten sichtbar.</p>
    <label>E-Mail<input name="email" type="email" autocomplete="username" value="${email}" required></label>
    <label>Passwort<input name="password" type="password" autocomplete="current-password" required></label>
    <button type="submit">Anmelden</button>
    <button type="button" class="td-link" data-act="reset">Passwort vergessen?</button>
    <div class="td-msg" role="status"></div>
  </form>`;
}

function showLogin(mode = 'login') {
  injectLoginStyles();
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.className = 'td-login';
    box.innerHTML = loginForm(mode);
    document.body.appendChild(box);
    const form = box.querySelector('form');
    const msg = box.querySelector('.td-msg');
    const btn = form.querySelector('button[type=submit]');
    const say = (text, cls = 'err') => { msg.textContent = text; msg.className = `td-msg ${cls}`; };
    (form.email && !form.email.value ? form.email : form.password).focus();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      btn.disabled = true;
      say('');
      if (mode === 'recovery') {
        const { error } = await supabase.auth.updateUser({ password: form.password.value });
        btn.disabled = false;
        if (error) return say(error.message);
        history.replaceState(null, '', location.pathname);
        box.remove();
        return resolve();
      }
      const email = form.email.value.trim();
      const { error } = await supabase.auth.signInWithPassword({ email, password: form.password.value });
      btn.disabled = false;
      if (error) return say(error.message === 'Invalid login credentials' ? 'E-Mail oder Passwort falsch.' : error.message);
      localStorage.setItem(LOGIN_EMAIL_KEY, email);
      box.remove();
      resolve();
    });

    box.querySelector('[data-act=reset]')?.addEventListener('click', async () => {
      const email = form.email.value.trim();
      if (!email) return say('Bitte erst die E-Mail eintragen.');
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
      if (error) return say(error.message);
      say('Link zum Zurücksetzen ist unterwegs — bitte Postfach prüfen.', 'ok');
    });
  });
}

function addLogoutButton() {
  const bar = document.querySelector('.topbar');
  if (!bar || bar.querySelector('.td-logout')) return;
  const b = document.createElement('button');
  b.className = 'td-logout';
  b.textContent = 'Abmelden';
  b.onclick = async () => { await supabase.auth.signOut(); location.reload(); };
  bar.appendChild(b);
}

async function requireLogin() {
  // Rückkehr aus der "Passwort vergessen"-Mail: supabase-js liest das Token aus der URL
  const recovery = /type=recovery/.test(location.hash);
  const { data: { session } } = await supabase.auth.getSession();
  if (recovery && session) await showLogin('recovery');
  else if (!session) await showLogin('login');
  injectLoginStyles();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addLogoutButton);
  else addLogoutButton();
}

await requireLogin();

// ---------------------------------------------------------------------------
// Private Buckets: gespeicherte Adressen ".../object/public/<bucket>/<pfad>"
// werden beim Anzeigen gegen einen signierten Link (1 h) getauscht — für jedes
// <img src> und <a href> auf allen Seiten, ohne dass die Seiten das wissen müssen.
// ---------------------------------------------------------------------------
const PRIVATE_BUCKETS = ['business-receipts', 'trade-screenshots'];
const PUBLIC_MARK = '/storage/v1/object/public/';

function storageRef(url) {
  const i = (url || '').indexOf(PUBLIC_MARK);
  if (i < 0) return null;
  const [bucket, ...rest] = url.slice(i + PUBLIC_MARK.length).split('?')[0].split('/');
  return PRIVATE_BUCKETS.includes(bucket) ? { bucket, path: decodeURIComponent(rest.join('/')) } : null;
}

export async function signedStorageUrl(url) {
  const ref = storageRef(url);
  if (!ref) return url;
  const { data, error } = await supabase.storage.from(ref.bucket).createSignedUrl(ref.path, 3600);
  return error ? url : data.signedUrl;
}

function signMedia(el) {
  const attr = el.tagName === 'IMG' ? 'src' : 'href';
  const url = el.getAttribute(attr);
  if (!storageRef(url)) return;
  signedStorageUrl(url).then(s => { if (s !== url) el.setAttribute(attr, s); });
}

function scanMedia(root) {
  if (root.nodeType !== 1) return;
  if (root.matches?.('img[src], a[href]')) signMedia(root);
  root.querySelectorAll?.('img[src], a[href]').forEach(signMedia);
}

new MutationObserver((muts) => {
  for (const m of muts) {
    if (m.type === 'attributes') signMedia(m.target);
    else m.addedNodes.forEach(scanMedia);
  }
}).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['src', 'href'] });
scanMedia(document.body);   // was beim Laden schon im HTML steht

let clientsCache = [];
async function fetchClientsCache() {
  const { data } = await supabase.from('clients').select('id, name').order('name');
  clientsCache = data || [];
}

const STORAGE_KEY = 'td_selected_account';
let accounts = [];
let selectedId = localStorage.getItem(STORAGE_KEY) || 'all';

export function getSelectedAccountId() {
  return selectedId;
}

export function getAccounts() {
  return accounts;
}

export function getAccountById(id) {
  return accounts.find(a => a.id === id);
}

async function fetchAccounts() {
  const { data, error } = await supabase.from('accounts').select('*').order('sort_order').order('created_at');
  if (error) { console.error(error); return; }
  accounts = data || [];
}

function setSelected(id) {
  selectedId = id;
  localStorage.setItem(STORAGE_KEY, id);
  window.dispatchEvent(new CustomEvent('account-changed', { detail: { id } }));
  renderSwitcher();
}

export async function initAccountSwitcher() {
  injectStyles();
  await fetchAccounts();

  if (accounts.length > 0 && !accounts.find(a => a.id === selectedId) && selectedId !== 'all') {
    selectedId = 'all';
    localStorage.setItem(STORAGE_KEY, 'all');
  }

  renderSwitcher();
  buildManagerModal();

  return { accounts, selectedId };
}

function renderSwitcher() {
  const el = document.getElementById('accountSwitcher');
  if (!el) return;

  if (accounts.length === 0) {
    el.innerHTML = `<button class="btn-primary sm" id="createFirstAccountBtn">+ Konto anlegen</button>`;
    document.getElementById('createFirstAccountBtn').onclick = () => openManager();
    return;
  }

  const current = selectedId === 'all' ? null : getAccountById(selectedId);

  el.innerHTML = `
    <button class="acc-pill" id="accPillBtn">
      <span class="acc-dot" style="background:${current ? current.color : '#6366f1'}"></span>
      <span>${current ? escapeHtml(current.name) : 'Alle Accounts'}</span>
      <span class="acc-caret">▾</span>
    </button>
    <div class="acc-dropdown" id="accDropdown">
      <div class="acc-option ${selectedId === 'all' ? 'active' : ''}" data-id="all">
        <span class="acc-dot" style="background:#6366f1"></span> Alle Accounts
      </div>
      ${accounts.map(a => `
        <div class="acc-option ${selectedId === a.id ? 'active' : ''}" data-id="${a.id}">
          <span class="acc-dot" style="background:${a.color}"></span> ${escapeHtml(a.name)}
          ${a.status !== 'active' ? `<span class="acc-status-badge">${statusLabel(a.status)}</span>` : ''}
        </div>
      `).join('')}
      <div class="acc-divider"></div>
      <div class="acc-option acc-manage" id="accManageBtn">⚙ Konten verwalten</div>
    </div>
  `;

  document.getElementById('accPillBtn').onclick = (e) => {
    e.stopPropagation();
    document.getElementById('accDropdown').classList.toggle('open');
  };
  el.querySelectorAll('.acc-option[data-id]').forEach(opt => {
    opt.onclick = () => { setSelected(opt.dataset.id); document.getElementById('accDropdown').classList.remove('open'); };
  });
  document.getElementById('accManageBtn').onclick = () => { openManager(); document.getElementById('accDropdown').classList.remove('open'); };

  document.addEventListener('click', () => document.getElementById('accDropdown')?.classList.remove('open'));
}

function statusLabel(status) {
  return { active: 'Aktiv', passed: 'Bestanden', breached: 'Breached', closed: 'Geschlossen' }[status] || status;
}

// ---------- Account manager modal ----------
function buildManagerModal() {
  if (document.getElementById('accManagerOverlay')) return;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'accManagerOverlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <h2>Konten verwalten</h2>
        <button class="modal-close" id="accManagerClose">✕</button>
      </div>
      <div class="acc-list" id="accManagerList"></div>
      <button class="btn-ghost" id="accAddNewBtn" style="width:100%; margin-top:12px;">+ Neues Konto</button>

      <form id="accForm" class="trade-form" style="display:none; margin-top:16px;">
        <input type="hidden" id="acc_id" />
        <div class="field"><label>Name</label><input type="text" id="acc_name" required placeholder="z.B. FTMO 100k #1" /></div>
        <div class="form-row">
          <div class="field"><label>Propfirm (Freitext)</label><input type="text" id="acc_prop_firm" placeholder="z.B. FTMO" /></div>
          <div class="field"><label>Kunde für Rechnungen</label><select id="acc_client"><option value="">— keiner —</option></select></div>
        </div>
        <div class="form-row">
          <div class="field"><label>Kontotyp</label>
            <select id="acc_type">
              <option value="personal">Personal</option>
              <option value="challenge">Challenge</option>
              <option value="verification">Verification</option>
              <option value="funded">Funded</option>
            </select>
          </div>
          <div class="field"><label>Startkapital</label><input type="number" step="0.01" id="acc_balance" value="0" /></div>
        </div>
        <div class="form-row">
          <div class="field"><label>Währung</label><input type="text" id="acc_currency" value="USD" /></div>
        </div>
        <div class="form-row">
          <div class="field"><label>Status</label>
            <select id="acc_status">
              <option value="active">Aktiv</option>
              <option value="passed">Bestanden</option>
              <option value="breached">Breached</option>
              <option value="closed">Geschlossen</option>
            </select>
          </div>
          <div class="field"><label>Farbe</label><input type="color" id="acc_color" value="#6366f1" style="padding:2px; height:38px;" /></div>
        </div>
        <hr class="form-divider" />
        <p class="section-label">Propfirm-Regeln (optional, für Drawdown-Tracker & Challenge-Fortschritt)</p>
        <div class="form-row three">
          <div class="field"><label>Daily Loss Limit (%)</label><input type="number" step="0.1" id="acc_daily_loss" placeholder="z.B. 5" /></div>
          <div class="field"><label>Max Drawdown (%)</label><input type="number" step="0.1" id="acc_max_dd" placeholder="z.B. 10" /></div>
          <div class="field"><label>Profit Target (%)</label><input type="number" step="0.1" id="acc_profit_target" placeholder="z.B. 8" /></div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn-ghost" id="accDeleteBtn" style="display:none;">Löschen</button>
          <div class="modal-actions-right">
            <button type="button" class="btn-ghost" id="accFormCancel">Abbrechen</button>
            <button type="submit" class="btn-primary">Speichern</button>
          </div>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.onclick = (e) => { if (e.target.id === 'accManagerOverlay') closeManager(); };
  document.getElementById('accManagerClose').onclick = closeManager;
  document.getElementById('accAddNewBtn').onclick = () => showAccForm(null);
  document.getElementById('accFormCancel').onclick = () => showAccForm(null, true);
  document.getElementById('accForm').onsubmit = handleAccSave;
  document.getElementById('accDeleteBtn').onclick = handleAccDelete;
}

function openManager() {
  fetchClientsCache().then(populateClientSelect);
  renderManagerList();
  document.getElementById('accForm').style.display = 'none';
  document.getElementById('accManagerOverlay').classList.add('visible');
}

function populateClientSelect() {
  const sel = document.getElementById('acc_client');
  if (!sel) return;
  sel.innerHTML = '<option value="">— keiner —</option>' + clientsCache.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}
function closeManager() {
  document.getElementById('accManagerOverlay').classList.remove('visible');
}

function renderManagerList() {
  const list = document.getElementById('accManagerList');
  if (accounts.length === 0) {
    list.innerHTML = `<p style="color:var(--text-faint); font-size:13px;">Noch keine Konten angelegt.</p>`;
    return;
  }
  list.innerHTML = accounts.map(a => `
    <div class="acc-manage-row" data-id="${a.id}">
      <span class="acc-dot" style="background:${a.color}"></span>
      <div class="acc-manage-info">
        <span class="acc-manage-name">${escapeHtml(a.name)}</span>
        <span class="acc-manage-meta">${a.prop_firm ? escapeHtml(a.prop_firm) + ' · ' : ''}${statusLabel(a.status)}</span>
      </div>
      <button class="btn-ghost sm">Bearbeiten</button>
    </div>
  `).join('');
  list.querySelectorAll('.acc-manage-row').forEach(row => {
    row.onclick = () => showAccForm(getAccountById(row.dataset.id));
  });
}

function showAccForm(account, hide = false) {
  const form = document.getElementById('accForm');
  if (hide) { form.style.display = 'none'; return; }
  form.style.display = 'flex';
  form.reset();
  document.getElementById('acc_id').value = account ? account.id : '';
  document.getElementById('acc_name').value = account ? account.name : '';
  document.getElementById('acc_prop_firm').value = account ? (account.prop_firm || '') : '';
  document.getElementById('acc_client').value = account && account.client_id ? account.client_id : '';
  document.getElementById('acc_type').value = account ? account.account_type : 'personal';
  document.getElementById('acc_balance').value = account ? account.starting_balance : 0;
  document.getElementById('acc_currency').value = account ? account.currency : 'USD';
  document.getElementById('acc_status').value = account ? account.status : 'active';
  document.getElementById('acc_color').value = account ? account.color : '#6366f1';
  document.getElementById('acc_daily_loss').value = account && account.daily_loss_limit_pct !== null ? account.daily_loss_limit_pct : '';
  document.getElementById('acc_max_dd').value = account && account.max_drawdown_pct !== null ? account.max_drawdown_pct : '';
  document.getElementById('acc_profit_target').value = account && account.profit_target_pct !== null ? account.profit_target_pct : '';
  document.getElementById('accDeleteBtn').style.display = account ? 'block' : 'none';
}

async function handleAccSave(e) {
  e.preventDefault();
  const id = document.getElementById('acc_id').value;
  const payload = {
    name: document.getElementById('acc_name').value.trim(),
    prop_firm: document.getElementById('acc_prop_firm').value.trim() || null,
    client_id: document.getElementById('acc_client').value || null,
    account_type: document.getElementById('acc_type').value,
    starting_balance: parseFloat(document.getElementById('acc_balance').value) || 0,
    currency: document.getElementById('acc_currency').value.trim() || 'USD',
    status: document.getElementById('acc_status').value,
    color: document.getElementById('acc_color').value,
    daily_loss_limit_pct: document.getElementById('acc_daily_loss').value ? parseFloat(document.getElementById('acc_daily_loss').value) : null,
    max_drawdown_pct: document.getElementById('acc_max_dd').value ? parseFloat(document.getElementById('acc_max_dd').value) : null,
    profit_target_pct: document.getElementById('acc_profit_target').value ? parseFloat(document.getElementById('acc_profit_target').value) : null,
  };

  if (id) {
    await supabase.from('accounts').update(payload).eq('id', id);
  } else {
    await supabase.from('accounts').insert(payload);
  }
  await fetchAccounts();
  if (selectedId === 'all' && accounts.length === 1) setSelected(accounts[0].id);
  renderManagerList();
  showAccForm(null, true);
  renderSwitcher();
  window.dispatchEvent(new CustomEvent('account-changed', { detail: { id: selectedId } }));
}

async function handleAccDelete() {
  const id = document.getElementById('acc_id').value;
  if (!id) return;
  if (!confirm('Konto löschen? Alle zugehörigen Trades werden ebenfalls gelöscht.')) return;
  await supabase.from('accounts').delete().eq('id', id);
  await fetchAccounts();
  if (selectedId === id) setSelected('all');
  renderManagerList();
  showAccForm(null, true);
  renderSwitcher();
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function injectStyles() {
  if (document.getElementById('accSwitcherStyles')) return;
  const style = document.createElement('style');
  style.id = 'accSwitcherStyles';
  style.textContent = `
    .account-switcher { position: relative; }
    .btn-primary.sm { padding: 7px 14px; font-size: 12.5px; }
    .acc-pill {
      display: flex; align-items: center; gap: 8px;
      background: var(--surface-2); border: 1px solid var(--border);
      color: var(--text); padding: 7px 12px; border-radius: 8px;
      font-size: 13px; cursor: pointer; font-family: var(--font-body);
    }
    .acc-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .acc-caret { color: var(--text-faint); font-size: 10px; }
    .acc-dropdown {
      display: none; position: absolute; top: calc(100% + 6px); right: 0;
      background: var(--surface); border: 1px solid var(--border);
      border-radius: 10px; min-width: 220px; padding: 6px; z-index: 60;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
    }
    .acc-dropdown.open { display: block; }
    .acc-option {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 10px; border-radius: 7px; font-size: 13px;
      cursor: pointer; color: var(--text-muted);
    }
    .acc-option:hover { background: var(--surface-2); color: var(--text); }
    .acc-option.active { color: var(--indigo-bright); background: rgba(99,102,241,0.1); }
    .acc-status-badge { margin-left: auto; font-size: 10px; color: var(--text-faint); background: var(--surface-2); padding: 1px 6px; border-radius: 100px; }
    .acc-divider { height: 1px; background: var(--border-soft); margin: 6px 4px; }
    .acc-manage { color: var(--text-faint); font-size: 12.5px; }
    .acc-list { display: flex; flex-direction: column; gap: 8px; max-height: 240px; overflow-y: auto; }
    .acc-manage-row { display: flex; align-items: center; gap: 10px; padding: 10px; background: var(--surface-2); border-radius: 8px; cursor: pointer; }
    .acc-manage-info { display: flex; flex-direction: column; flex: 1; }
    .acc-manage-name { font-size: 13.5px; font-weight: 600; }
    .acc-manage-meta { font-size: 11.5px; color: var(--text-faint); }
    .btn-ghost.sm { padding: 5px 10px; font-size: 11.5px; }
  `;
  document.head.appendChild(style);
}
