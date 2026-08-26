import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const SUPABASE_URL = 'https://rabbtdooayruveribarq.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_CsC9Ji0H9w_Xkbgoy1QtRg_RasuZtuX';
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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
          <div class="field"><label>Propfirm</label><input type="text" id="acc_prop_firm" placeholder="z.B. FTMO" /></div>
          <div class="field"><label>Kontotyp</label>
            <select id="acc_type">
              <option value="personal">Personal</option>
              <option value="challenge">Challenge</option>
              <option value="verification">Verification</option>
              <option value="funded">Funded</option>
            </select>
          </div>
        </div>
        <div class="form-row">
          <div class="field"><label>Startkapital</label><input type="number" step="0.01" id="acc_balance" value="0" /></div>
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
  renderManagerList();
  document.getElementById('accForm').style.display = 'none';
  document.getElementById('accManagerOverlay').classList.add('visible');
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
  document.getElementById('acc_type').value = account ? account.account_type : 'personal';
  document.getElementById('acc_balance').value = account ? account.starting_balance : 0;
  document.getElementById('acc_currency').value = account ? account.currency : 'USD';
  document.getElementById('acc_status').value = account ? account.status : 'active';
  document.getElementById('acc_color').value = account ? account.color : '#6366f1';
  document.getElementById('accDeleteBtn').style.display = account ? 'block' : 'none';
}

async function handleAccSave(e) {
  e.preventDefault();
  const id = document.getElementById('acc_id').value;
  const payload = {
    name: document.getElementById('acc_name').value.trim(),
    prop_firm: document.getElementById('acc_prop_firm').value.trim() || null,
    account_type: document.getElementById('acc_type').value,
    starting_balance: parseFloat(document.getElementById('acc_balance').value) || 0,
    currency: document.getElementById('acc_currency').value.trim() || 'USD',
    status: document.getElementById('acc_status').value,
    color: document.getElementById('acc_color').value,
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
