import { supabase, initAccountSwitcher, getAccounts, openManager } from './accounts.js';
import { toast, themeChoice, applyTheme, viewState, setView, PLANS, pushSupported, pushSubscription, pushEnable, pushDisable, isIOS, standalone } from './nav.js';

// Einstellungen: Darstellung, Benachrichtigungen (je Gerät), Trading-Standards,
// Konten, Produkt-Ansicht mit Paketen, App (Installation, Neu laden, Abmelden).

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const flash = (el) => { el.classList.remove('saved-flash'); void el.offsetWidth; el.classList.add('saved-flash'); };

// ---------------------------------------------------------------------------
// Darstellung
// ---------------------------------------------------------------------------
function paintTheme() {
  const c = themeChoice();
  document.querySelectorAll('#themeSeg .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.value === c));
}
$('themeSeg').onclick = (e) => {
  const b = e.target.closest('.seg-btn');
  if (!b) return;
  applyTheme(b.dataset.value);
  paintTheme();
};

// ---------------------------------------------------------------------------
// Benachrichtigungen
// ---------------------------------------------------------------------------
let sub = null;          // aktuelles Push-Abo dieses Geräts
let subRow = null;       // passende Zeile in push_subscriptions

async function loadPush() {
  if (!pushSupported()) {
    $('pushState').textContent = 'nicht verfügbar';
    $('pushToggle').hidden = true;
    $('pushHint').textContent = isIOS() && !standalone()
      ? 'Auf dem iPhone funktionieren Benachrichtigungen nur in der installierten App: in Safari „Teilen → Zum Home-Bildschirm“, dann hier einschalten.'
      : 'Dieser Browser unterstützt keine Push-Benachrichtigungen.';
    return;
  }
  sub = await pushSubscription();
  subRow = null;
  if (sub) {
    const { data } = await supabase.from('push_subscriptions').select('*').eq('endpoint', sub.endpoint).maybeSingle();
    subRow = data;
  }
  const on = !!sub && !!subRow;
  $('pushState').textContent = on ? 'an' : 'aus';
  $('pushState').className = `st-badge${on ? ' on' : ''}`;
  $('pushToggle').textContent = on ? 'Ausschalten' : 'Einschalten';
  $('pushToggle').className = on ? 'btn-ghost sm' : 'btn-primary sm';
  $('pushTest').hidden = !on;
  $('pushPrefs').disabled = !on;
  const prefs = subRow?.prefs || { bias: true, event: true, error: true };
  document.querySelectorAll('[data-pref]').forEach(i => { i.checked = prefs[i.dataset.pref] !== false; });
  $('quietStart').value = subRow?.quiet_start || '22:00';
  $('quietEnd').value = subRow?.quiet_end || '06:30';
  const { count } = await supabase.from('push_subscriptions').select('id', { count: 'exact', head: true });
  $('pushDevice').textContent = `Push-Nachrichten auch bei geschlossener App.${count ? ` Angemeldete Geräte insgesamt: ${count}.` : ''}`;
}

$('pushToggle').onclick = async () => {
  $('pushToggle').disabled = true;
  try {
    if (sub && subRow) { await pushDisable(); toast('Benachrichtigungen auf diesem Gerät aus.'); }
    else { await pushEnable(); toast('Benachrichtigungen an – eine Testnachricht ist unterwegs.'); }
  } catch (err) {
    console.error(err);
    toast(err.message || String(err));
  } finally {
    $('pushToggle').disabled = false;
    await loadPush();
  }
};
$('pushTest').onclick = async () => {
  await supabase.functions.invoke('push-notify', { body: { test: true, endpoint: sub?.endpoint } });
  toast('Testnachricht ist unterwegs.');
};
async function savePush(el) {
  if (!subRow) return;
  const prefs = Object.fromEntries([...document.querySelectorAll('[data-pref]')].map(i => [i.dataset.pref, i.checked]));
  const { error } = await supabase.from('push_subscriptions')
    .update({ prefs, quiet_start: $('quietStart').value || '22:00', quiet_end: $('quietEnd').value || '06:30' }).eq('id', subRow.id);
  if (error) { toast('Speichern fehlgeschlagen: ' + error.message); return; }
  flash(el);
}
$('pushPrefs').addEventListener('change', (e) => savePush(e.target.closest('.st-check, .st-row') || e.target));

// ---------------------------------------------------------------------------
// Trading
// ---------------------------------------------------------------------------
async function loadTrading() {
  const { data } = await supabase.from('user_settings').select('value').eq('key', 'default_risk_pct').maybeSingle();
  $('defaultRisk').value = data ? Number(data.value) : 0.8;
}
$('defaultRisk').addEventListener('change', async (e) => {
  const v = Number(e.target.value);
  if (!(v > 0 && v <= 10)) { toast('Bitte einen Wert zwischen 0,05 und 10 % eingeben.'); return; }
  const { error } = await supabase.from('user_settings').upsert({ key: 'default_risk_pct', value: v, updated_at: new Date().toISOString() });
  if (error) { toast('Speichern fehlgeschlagen: ' + error.message); return; }
  flash(e.target.closest('.st-row'));
});

// ---------------------------------------------------------------------------
// Konten
// ---------------------------------------------------------------------------
const STATUS = { active: 'Aktiv', passed: 'Bestanden', breached: 'Verloren', closed: 'Geschlossen' };
function renderAccounts() {
  const acc = getAccounts();
  $('accountList').innerHTML = acc.length ? acc.map(a => {
    const limits = [a.daily_loss_limit_pct ? `Tag ${a.daily_loss_limit_pct} %` : '', a.max_drawdown_pct ? `Max ${a.max_drawdown_pct} % ${a.drawdown_mode === 'trailing' ? 'trailing' : 'statisch'}` : '', a.profit_target_pct ? `Ziel ${a.profit_target_pct} %` : ''].filter(Boolean).join(' · ');
    return `<div class="st-acc"><span class="dot" style="background:${esc(a.color)}"></span><span>${esc(a.name)}<small>${esc(a.prop_firm || '')}${limits ? ' · ' + esc(limits) : ''}</small></span><span class="badge ${a.status === 'active' ? 'accent' : a.status === 'breached' ? 'neg' : a.status === 'passed' ? 'pos' : ''}">${STATUS[a.status] || a.status}</span></div>`;
  }).join('') : '<p class="empty">Noch keine Konten angelegt.</p>';
}
$('manageAccounts').onclick = () => openManager();
window.addEventListener('account-changed', renderAccounts);

// ---------------------------------------------------------------------------
// Ansicht & Pakete
// ---------------------------------------------------------------------------
function paintView() {
  const { product, plan } = viewState();
  document.querySelectorAll('#viewSeg .seg-btn').forEach(b => b.classList.toggle('active', (b.dataset.value === 'product') === product));
  $('planCards').innerHTML = PLANS.map(p => `<button type="button" class="st-plan${product && p.key === plan ? ' active' : ''}" data-plan="${p.key}">
    <b>${p.label}</b><span class="p">${p.price} / Monat</span><small>${p.text}</small></button>`).join('');
}
$('viewSeg').onclick = (e) => {
  const b = e.target.closest('.seg-btn');
  if (b) setView(b.dataset.value === 'product');
};
$('planCards').onclick = (e) => {
  const b = e.target.closest('.st-plan');
  if (b) setView(true, b.dataset.plan);
};
window.addEventListener('view-changed', paintView);

// ---------------------------------------------------------------------------
// Anmeldung & Sicherheit: Zwei-Faktor (TOTP), Passwort, überall abmelden
// ---------------------------------------------------------------------------
let mfaFactor = null, pendingFactor = null;
async function loadMfa() {
  const { data } = await supabase.auth.mfa.listFactors();
  mfaFactor = data?.totp?.find(f => f.status === 'verified') || null;
  $('mfaState').textContent = mfaFactor ? 'aktiv' : 'aus';
  $('mfaState').className = `st-badge${mfaFactor ? ' on' : ''}`;
  $('mfaToggle').textContent = mfaFactor ? 'Ausschalten' : 'Einrichten';
  $('mfaToggle').className = mfaFactor ? 'btn-ghost sm' : 'btn-primary sm';
}
$('mfaToggle').onclick = async () => {
  if (mfaFactor) {
    if (!confirm('Zwei-Faktor-Anmeldung wirklich ausschalten? Dann reicht wieder das Passwort.')) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId: mfaFactor.id });
    if (error) { toast('Ausschalten fehlgeschlagen: ' + error.message); return; }
    toast('Zwei-Faktor-Anmeldung ausgeschaltet.');
    await supabase.auth.refreshSession();
    return loadMfa();
  }
  // Halb fertige frühere Versuche aufräumen, dann neu einrichten
  const { data: all } = await supabase.auth.mfa.listFactors();
  for (const f of (all?.all || []).filter(f => f.status !== 'verified')) await supabase.auth.mfa.unenroll({ factorId: f.id });
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Authenticator ${new Date().toLocaleDateString('de-DE')}` });
  if (error) { toast('Einrichten fehlgeschlagen: ' + error.message); return; }
  pendingFactor = data;
  $('mfaQr').src = data.totp.qr_code;
  $('mfaSecret').textContent = data.totp.secret;
  $('mfaSetup').hidden = false;
  $('mfaCode').value = '';
  $('mfaCode').focus();
};
$('mfaVerify').onclick = async () => {
  if (!pendingFactor) return;
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: pendingFactor.id, code: $('mfaCode').value.trim() });
  if (error) { toast('Code falsch oder abgelaufen – bitte den aktuellen Code eingeben.'); $('mfaCode').select(); return; }
  pendingFactor = null;
  $('mfaSetup').hidden = true;
  toast('Zwei-Faktor-Anmeldung ist aktiv. Beim nächsten Login fragt die App nach dem Code.');
  await loadMfa();
};
$('mfaCancel').onclick = async () => {
  if (pendingFactor) await supabase.auth.mfa.unenroll({ factorId: pendingFactor.id });
  pendingFactor = null;
  $('mfaSetup').hidden = true;
};
$('pwSave').onclick = async () => {
  const pw = $('newPw').value;
  if (pw.length < 12) { toast('Bitte mindestens 12 Zeichen verwenden.'); return; }
  const { error } = await supabase.auth.updateUser({ password: pw });
  if (error) { toast('Passwort nicht geändert: ' + error.message); return; }
  $('newPw').value = '';
  toast('Passwort geändert.');
};
$('logoutAll').onclick = async () => {
  if (!confirm('Auf allen Geräten abmelden, auch auf diesem?')) return;
  await supabase.auth.signOut({ scope: 'global' });
  location.href = 'cockpit.html';
};

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
$('installHint').textContent = standalone()
  ? 'Läuft bereits als installierte App.'
  : isIOS() ? 'iPhone/iPad: in Safari „Teilen → Zum Home-Bildschirm“.' : 'Chrome/Edge: Symbol „Installieren“ in der Adressleiste oder im Browser-Menü.';
$('hardReload').onclick = async () => {
  try {
    for (const r of await navigator.serviceWorker?.getRegistrations?.() || []) await r.unregister();
    for (const k of await caches.keys()) await caches.delete(k);
  } catch { /* egal */ }
  location.reload();
};
$('logoutBtn').onclick = async () => { await supabase.auth.signOut(); location.href = 'cockpit.html'; };
supabase.auth.getUser().then(({ data }) => { $('userMail').textContent = data?.user?.email || '–'; });

// ---------------------------------------------------------------------------
paintTheme();
paintView();
await initAccountSwitcher();
renderAccounts();
await Promise.all([loadPush(), loadTrading(), loadMfa()]);
