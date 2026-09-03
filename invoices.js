import { supabase } from './accounts.js';

const $ = (id) => document.getElementById(id);

let companySettings = null;
let clients = [];
let invoices = [];
let payouts = [];
let accountsCache = [];

async function init() {
  bindEvents();
  await loadAll();
}

function bindEvents() {
  $('toggleSettingsBtn').onclick = () => {
    $('settingsView').style.display = 'none';
    $('settingsForm').style.display = 'flex';
    fillSettingsForm();
  };
  $('cancelSettingsBtn').onclick = () => {
    $('settingsForm').style.display = 'none';
    $('settingsView').style.display = 'block';
  };
  $('settingsForm').onsubmit = saveSettings;

  $('addClientBtn').onclick = () => openClientModal();
  $('clientModalClose').onclick = closeClientModal;
  $('cl_cancelBtn').onclick = closeClientModal;
  $('clientOverlay').onclick = (e) => { if (e.target.id === 'clientOverlay') closeClientModal(); };
  $('clientForm').onsubmit = saveClient;
  $('cl_deleteBtn').onclick = deleteClient;
  $('cl_category').onchange = () => {
    $('cl_vat_field').style.display = $('cl_category').value === 'eu' ? 'block' : 'none';
  };

  $('addInvoiceBtn').onclick = () => openInvoiceModal();
  $('invoiceModalClose').onclick = closeInvoiceModal;
  $('inv_cancelBtn').onclick = closeInvoiceModal;
  $('invoiceOverlay').onclick = (e) => { if (e.target.id === 'invoiceOverlay') closeInvoiceModal(); };
  $('invoiceForm').onsubmit = createInvoice;
  $('inv_payout').onchange = onPayoutSelected;

  $('closePrintBtn').onclick = closePrintView;
  $('doPrintBtn').onclick = () => window.print();
}

async function loadAll() {
  const { data: settings } = await supabase.from('company_settings').select('*').maybeSingle();
  companySettings = settings;
  renderSettingsView();

  const { data: cl } = await supabase.from('clients').select('*').order('name');
  clients = cl || [];
  renderClientsTable();

  const { data: acc } = await supabase.from('accounts').select('*');
  accountsCache = acc || [];

  const { data: po } = await supabase.from('payouts').select('*').order('payout_date', { ascending: false });
  payouts = po || [];

  const { data: inv } = await supabase.from('invoices').select('*, clients(name)').order('invoice_date', { ascending: false });
  invoices = inv || [];
  renderInvoicesTable();
}

// ---------- Company settings ----------
function renderSettingsView() {
  const view = $('settingsView');
  if (!companySettings) {
    view.innerHTML = `<p class="empty-hint">Noch keine Firmendaten hinterlegt. Klick "Bearbeiten", um sie einzutragen.</p>`;
    return;
  }
  const s = companySettings;
  view.innerHTML = `
    <strong>${escapeHtml(s.company_name || '')}</strong> · Inhaber: ${escapeHtml(s.owner_name || '')}<br>
    ${escapeHtml(s.address_line1 || '')}, ${escapeHtml(s.address_line2 || '')}<br>
    ${s.phone ? 'Tel. ' + escapeHtml(s.phone) + ' · ' : ''}${s.email ? escapeHtml(s.email) : ''}<br>
    Steuernummer: ${escapeHtml(s.tax_number || '—')}${s.iban ? ' · IBAN: ' + escapeHtml(s.iban) : ''}
  `;
}

function fillSettingsForm() {
  const s = companySettings || {};
  $('cs_name').value = s.company_name || '';
  $('cs_owner').value = s.owner_name || '';
  $('cs_addr1').value = s.address_line1 || '';
  $('cs_addr2').value = s.address_line2 || '';
  $('cs_phone').value = s.phone || '';
  $('cs_email').value = s.email || '';
  $('cs_tax').value = s.tax_number || '';
  $('cs_iban').value = s.iban || '';
  $('cs_bank').value = s.bank_name || '';
}

async function saveSettings(e) {
  e.preventDefault();
  const payload = {
    company_name: $('cs_name').value.trim(),
    owner_name: $('cs_owner').value.trim(),
    address_line1: $('cs_addr1').value.trim(),
    address_line2: $('cs_addr2').value.trim(),
    phone: $('cs_phone').value.trim() || null,
    email: $('cs_email').value.trim() || null,
    tax_number: $('cs_tax').value.trim(),
    iban: $('cs_iban').value.trim() || null,
    bank_name: $('cs_bank').value.trim() || null,
  };

  if (companySettings) {
    await supabase.from('company_settings').update(payload).eq('id', companySettings.id);
  } else {
    await supabase.from('company_settings').insert(payload);
  }

  $('settingsForm').style.display = 'none';
  $('settingsView').style.display = 'block';
  await loadAll();
}

// ---------- Clients ----------
function renderClientsTable() {
  const tbody = document.querySelector('#clientsTable tbody');
  tbody.innerHTML = '';
  if (clients.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="font-family:var(--font-body); color:var(--text-faint); text-align:center; padding:16px 0;">Noch keine Kunden angelegt</td></tr>`;
    return;
  }
  clients.forEach(c => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(c.name)}</td>
      <td>${escapeHtml(c.country || '—')}</td>
      <td>${categoryLabel(c.country_category)}</td>
      <td class="client-row-actions"><button class="icon-btn" data-id="${c.id}">✎</button></td>
    `;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('[data-id]').forEach(btn => {
    btn.onclick = () => openClientModal(clients.find(c => c.id === btn.dataset.id));
  });
}

function categoryLabel(cat) {
  return { domestic: 'Inland', eu: 'EU-Ausland', third_country: 'Drittland' }[cat] || cat;
}

function openClientModal(client = null) {
  $('clientForm').reset();
  $('cl_id').value = client ? client.id : '';
  $('clientModalTitle').textContent = client ? 'Kunde bearbeiten' : 'Kunde erfassen';
  $('cl_deleteBtn').style.display = client ? 'block' : 'none';

  if (client) {
    $('cl_name').value = client.name;
    $('cl_address').value = [client.address_line1, client.address_line2].filter(Boolean).join('\n');
    $('cl_country').value = client.country || '';
    $('cl_category').value = client.country_category;
    $('cl_vat').value = client.vat_id || '';
    $('cl_description').value = client.default_description || 'Performance Fee Payout';
  } else {
    $('cl_category').value = 'third_country';
    $('cl_description').value = 'Performance Fee Payout';
  }
  $('cl_vat_field').style.display = $('cl_category').value === 'eu' ? 'block' : 'none';

  $('clientOverlay').classList.add('visible');
}

function closeClientModal() {
  $('clientOverlay').classList.remove('visible');
}

async function saveClient(e) {
  e.preventDefault();
  const id = $('cl_id').value;
  const addrLines = $('cl_address').value.split('\n').map(l => l.trim()).filter(Boolean);

  const payload = {
    name: $('cl_name').value.trim(),
    address_line1: addrLines[0] || null,
    address_line2: addrLines.slice(1).join(', ') || null,
    country: $('cl_country').value.trim(),
    country_category: $('cl_category').value,
    vat_id: $('cl_vat').value.trim() || null,
    default_description: $('cl_description').value.trim() || 'Performance Fee Payout',
  };

  if (id) {
    await supabase.from('clients').update(payload).eq('id', id);
  } else {
    await supabase.from('clients').insert(payload);
  }
  closeClientModal();
  await loadAll();
}

async function deleteClient() {
  const id = $('cl_id').value;
  if (!id) return;
  if (!confirm('Kunde löschen?')) return;
  await supabase.from('clients').delete().eq('id', id);
  closeClientModal();
  await loadAll();
}

// ---------- Invoices ----------
function renderInvoicesTable() {
  const tbody = document.querySelector('#invoicesTable tbody');
  tbody.innerHTML = '';
  if (invoices.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="font-family:var(--font-body); color:var(--text-faint); text-align:center; padding:16px 0;">Noch keine Rechnungen</td></tr>`;
    return;
  }
  invoices.forEach(inv => {
    const tr = document.createElement('tr');
    const dateStr = new Date(inv.invoice_date + 'T00:00:00').toLocaleDateString('de-DE');
    tr.innerHTML = `
      <td>${escapeHtml(inv.invoice_number)}</td>
      <td>${dateStr}</td>
      <td>${escapeHtml(inv.clients ? inv.clients.name : '—')}</td>
      <td>${(Number(inv.unit_price) * Number(inv.quantity)).toFixed(2)} ${escapeHtml(inv.currency)}</td>
      <td class="client-row-actions"><button class="icon-btn" data-id="${inv.id}">📄 Ansehen</button></td>
    `;
    tbody.appendChild(tr);
  });
  tbody.querySelectorAll('[data-id]').forEach(btn => {
    btn.onclick = () => openPrintView(invoices.find(i => i.id === btn.dataset.id));
  });
}

function computeNextInvoiceNumber() {
  if (!companySettings) return `RE-${new Date().getFullYear()}-1`;
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const n = companySettings.next_invoice_number || 1;
  return companySettings.invoice_number_format
    .replace('{YYYY}', yyyy)
    .replace('{MM}', mm)
    .replace('{N}', n);
}

function openInvoiceModal() {
  $('invoiceForm').reset();

  const payoutSel = $('inv_payout');
  const invoicedPayoutIds = new Set(invoices.filter(i => i.payout_id).map(i => i.payout_id));
  payoutSel.innerHTML = '<option value="">— kein Payout / manuell —</option>' +
    payouts.map(p => {
      const acc = accountsCache.find(a => a.id === p.account_id);
      const flag = invoicedPayoutIds.has(p.id) ? ' ✓ bereits fakturiert' : '';
      return `<option value="${p.id}">${p.payout_date} · ${acc ? acc.name : '—'} · ${p.crypto_amount} ${p.crypto_currency}${flag}</option>`;
    }).join('');

  const clientSel = $('inv_client');
  clientSel.innerHTML = clients.map(c => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');

  $('inv_number').value = computeNextInvoiceNumber();
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  $('inv_date').value = d.toISOString().slice(0, 10);
  $('inv_currency').value = 'USD';

  $('invoiceOverlay').classList.add('visible');
}

function onPayoutSelected() {
  const payoutId = $('inv_payout').value;
  if (!payoutId) return;
  const payout = payouts.find(p => p.id === payoutId);
  if (!payout) return;

  const acc = accountsCache.find(a => a.id === payout.account_id);
  if (acc && acc.client_id) {
    $('inv_client').value = acc.client_id;
  }

  const client = clients.find(c => c.id === $('inv_client').value);
  $('inv_description').value = client ? client.default_description : 'Performance Fee Payout';
  $('inv_crypto_detail').value = `Auszahlung via ${payout.crypto_currency}${payout.destination ? ' · ' + payout.destination : ''}`;
  $('inv_amount').value = payout.crypto_amount;
  $('inv_currency').value = payout.crypto_currency === 'USDT' ? 'USD' : payout.crypto_currency;
}

function closeInvoiceModal() {
  $('invoiceOverlay').classList.remove('visible');
}

async function createInvoice(e) {
  e.preventDefault();
  const clientId = $('inv_client').value;
  const client = clients.find(c => c.id === clientId);
  if (!client) { alert('Bitte einen Kunden wählen.'); return; }

  const payload = {
    invoice_number: $('inv_number').value.trim(),
    invoice_date: $('inv_date').value,
    delivery_date: $('inv_date').value,
    client_id: clientId,
    payout_id: $('inv_payout').value || null,
    description: $('inv_description').value.trim(),
    quantity: 1,
    unit_price: parseFloat($('inv_amount').value),
    currency: $('inv_currency').value.trim().toUpperCase(),
    country_category: client.country_category,
    crypto_detail: $('inv_crypto_detail').value.trim() || null,
  };

  const { data, error } = await supabase.from('invoices').insert(payload).select('*, clients(*)').single();
  if (error) { alert('Fehler: ' + error.message); return; }

  // Increment next invoice number counter
  if (companySettings) {
    await supabase.from('company_settings').update({ next_invoice_number: (companySettings.next_invoice_number || 1) + 1 }).eq('id', companySettings.id);
  }

  closeInvoiceModal();
  await loadAll();
  openPrintView(data);
}

// ---------- Print view ----------
function openPrintView(invoice) {
  const client = invoice.clients || clients.find(c => c.id === invoice.client_id);
  const s = companySettings || {};
  const total = (Number(invoice.unit_price) * Number(invoice.quantity)).toFixed(2);
  const dateStr = new Date(invoice.invoice_date + 'T00:00:00').toLocaleDateString('de-DE');
  const deliveryStr = new Date(invoice.delivery_date + 'T00:00:00').toLocaleDateString('de-DE');

  const legalText = getLegalText(invoice.country_category, client ? client.country : '');

  $('invoicePrintArea').innerHTML = `
    <div class="invoice-page">
      <div class="invoice-header">
        <div>
          <div class="invoice-sender-line">${escapeHtml(s.company_name || '')} &nbsp;·&nbsp; ${escapeHtml(s.address_line1 || '')} &nbsp;·&nbsp; ${escapeHtml(s.address_line2 || '')}</div>
          <div class="invoice-recipient">
            <strong>${escapeHtml(client ? client.name : '')}</strong><br>
            ${escapeHtml(client ? client.address_line1 || '' : '')}<br>
            ${escapeHtml(client ? client.address_line2 || '' : '')}
          </div>
        </div>
        <div>
          <img src="logo.png" class="invoice-logo" />
          <div class="invoice-meta" style="margin-top:14px;">
            <table>
              <tr><td>Rechnungs-Nr.</td><td>${escapeHtml(invoice.invoice_number)}</td></tr>
              <tr><td>Rechnungsdatum</td><td>${dateStr}</td></tr>
              <tr><td>Lieferdatum</td><td>${deliveryStr}</td></tr>
            </table>
          </div>
        </div>
      </div>

      <div class="invoice-title">Rechnung Nr. ${escapeHtml(invoice.invoice_number)}</div>
      <p>Sehr geehrte Damen und Herren,</p>
      <p>Hiermit stelle ich Ihnen die folgenden Leistungen in Rechnung:</p>

      <table class="invoice-table">
        <thead><tr><th>Pos.</th><th>Beschreibung</th><th>Menge</th><th>Einzelpreis</th><th>Gesamtpreis</th></tr></thead>
        <tbody>
          <tr>
            <td>1.</td>
            <td><strong>${escapeHtml(invoice.description)}</strong></td>
            <td>${Number(invoice.quantity).toFixed(2)}</td>
            <td>${Number(invoice.unit_price).toFixed(2)} ${escapeHtml(invoice.currency)}</td>
            <td>${total} ${escapeHtml(invoice.currency)}</td>
          </tr>
          ${invoice.crypto_detail ? `<tr><td></td><td class="item-detail" colspan="4">${escapeHtml(invoice.crypto_detail)}</td></tr>` : ''}
        </tbody>
      </table>

      <div class="invoice-totals">
        <div class="invoice-totals-row"><span>Gesamtbetrag netto</span><span>${total} ${escapeHtml(invoice.currency)}</span></div>
        <div class="invoice-totals-row"><span colspan="2">Umsatzsteuer nicht erhoben gemäß §19 UStG.</span></div>
        <div class="invoice-totals-row grand"><span>Gesamtbetrag brutto</span><span>${total} ${escapeHtml(invoice.currency)}</span></div>
      </div>

      <div class="invoice-legal">${legalText}</div>

      <div class="invoice-signoff">
        Mit freundlichen Grüßen<br>${escapeHtml(s.owner_name || '')}
      </div>

      <div class="invoice-footer">
        <div>${escapeHtml(s.company_name || '')}<br>${escapeHtml(s.address_line1 || '')}<br>${escapeHtml(s.address_line2 || '')}</div>
        <div>${s.phone ? 'Tel. ' + escapeHtml(s.phone) : ''}<br>${s.email ? 'E-Mail ' + escapeHtml(s.email) : ''}</div>
        <div>Inhaber/-in ${escapeHtml(s.owner_name || '')}</div>
      </div>
    </div>
  `;

  document.querySelector('.app').style.display = 'none';
  $('invoicePrintArea').style.display = 'block';
  $('printControls').style.display = 'flex';
}

function closePrintView() {
  document.querySelector('.app').style.display = 'block';
  $('invoicePrintArea').style.display = 'none';
  $('printControls').style.display = 'none';
}

function getLegalText(category, country) {
  if (category === 'domestic') {
    return `Gemäß §19 UStG (Kleinunternehmerregelung) wird keine Umsatzsteuer berechnet.`;
  }
  if (category === 'eu') {
    return `Nicht im Inland steuerbare Leistung. Der Leistungsort liegt gemäß § 3a Abs. 2 UStG im Land des Empfängers. Steuerschuldnerschaft des Leistungsempfängers (Reverse-Charge-Verfahren, Art. 196 MwStSystRL). Zusätzlich gilt die Kleinunternehmerregelung gemäß §19 UStG — es wird keine deutsche Umsatzsteuer erhoben.`;
  }
  return `Nicht im Inland steuerbare Leistung. Der Leistungsort liegt gemäß § 3a Abs. 2 UStG im Land des Empfängers (Drittland${country ? '/' + escapeHtml(country) : ''}). Die Steuerschuldnerschaft geht auf den Leistungsempfänger über. Umsatzsteuer nicht erhoben gemäß §19 UStG.`;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

init();
