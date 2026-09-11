const blockedUsernameWords = ['fuck', 'shit', 'bitch', 'asshole', 'cunt', 'dick', 'piss', 'porn', 'nazi'];
const adminUsername = 'cvtsforher';
const adminPasswordHash = 'd6f049f4ed8732e1ea0540aaa13e0022b5315e488b6c7dea028d60db72724ef4';
const partnerUsername = 'ONYX';
const partnerPasswordHash = '8a84256c425d64bec410a3794378fcf678ac6734dc0d61af29ca7674dd63292d';
const serverMode = window.location.protocol !== 'file:';
let sharedListings = null;

const languageText = {
  en: { language: 'Language', chooseLanguage: 'Choose the language for the board.', settings: 'XPLAW / SETTINGS', login: 'LOG IN', listing: 'MAKE A LISTING', enter: 'Enter the<br><em>board.</em>', welcome: 'Welcome', intro: 'Select the<br><em>account</em> to trade.', games: 'Supported games', partners: 'Partners', safety: 'SAFETY NOTICE', report: 'Report a scam', join: 'Join the board', community: 'Community listings', trade: 'Trade status', needHelp: 'Need help?' },
  ar: { language: 'اللغة', chooseLanguage: 'اختر لغة اللوحة.', settings: 'إكس بلاو / الإعدادات', login: 'تسجيل الدخول', listing: 'إنشاء إعلان', enter: 'ادخل إلى<br><em>اللوحة.</em>', welcome: 'مرحباً', intro: 'اختر<br><em>الحساب</em> للتداول.', games: 'الألعاب المدعومة', partners: 'الشركاء', safety: 'تنبيه الأمان', report: 'الإبلاغ عن احتيال', join: 'انضم إلى اللوحة', community: 'إعلانات المجتمع', trade: 'حالة التداول', needHelp: 'هل تحتاج مساعدة؟' },
  es: { language: 'Idioma', chooseLanguage: 'Elige el idioma del tablero.', settings: 'XPLAW / AJUSTES', login: 'INICIAR SESIÓN', listing: 'CREAR ANUNCIO', enter: 'Entra al<br><em>tablero.</em>', welcome: 'Bienvenido', intro: 'Elige la<br><em>cuenta</em> para comerciar.', games: 'Juegos compatibles', partners: 'Socios', safety: 'AVISO DE SEGURIDAD', report: 'Reportar una estafa', join: 'Unirse al tablero', community: 'Anuncios de la comunidad', trade: 'Estado del intercambio', needHelp: '¿Necesitas ayuda?' },
  ru: { language: 'Язык', chooseLanguage: 'Выберите язык доски.', settings: 'XPLAW / НАСТРОЙКИ', login: 'ВОЙТИ', listing: 'СОЗДАТЬ ОБЪЯВЛЕНИЕ', enter: 'Войти на<br><em>доску.</em>', welcome: 'Добро пожаловать', intro: 'Выберите<br><em>аккаунт</em> для обмена.', games: 'Поддерживаемые игры', partners: 'Партнёры', safety: 'УВЕДОМЛЕНИЕ О БЕЗОПАСНОСТИ', report: 'Сообщить о мошенничестве', join: 'Присоединиться к доске', community: 'Объявления сообщества', trade: 'Статус обмена', needHelp: 'Нужна помощь?' }
};

function applyLanguage(language) {
  const selected = languageText[language] ? language : 'en';
  const text = languageText[selected];
  localStorage.setItem('xplaw-language', selected);
  document.documentElement.lang = selected;
  document.documentElement.dir = selected === 'ar' ? 'rtl' : 'ltr';
  document.querySelector('#language-title').textContent = text.language;
  document.querySelector('#language-drawer > p').textContent = text.chooseLanguage;
  document.querySelector('#login-button').textContent = isAdmin() ? 'LOG OUT ADMIN' : localStorage.getItem('xplaw-session') ? 'LOG OUT' : text.login;
  updateEntryGreeting();
  document.querySelector('#enter-board').childNodes[0].textContent = `${text.listing} `;
  document.querySelector('.intro h1').innerHTML = text.intro;
  const headings = document.querySelectorAll('.games-section h2, .partners-section h2, .community-grid h2, .uploaded-section h2, .lower-grid h2, .owner-profile h2');
  [text.games, text.partners, text.report, text.join, text.community, text.trade, text.needHelp].forEach((value, index) => { if (headings[index]) headings[index].textContent = value; });
  document.querySelector('.safety-notice .tiny-label').textContent = text.safety;
  document.querySelectorAll('[data-language]').forEach((button) => button.classList.toggle('active', button.dataset.language === selected));
}

function leaveEntryScreen() {
  const entryScreen = document.querySelector('#entry-screen');
  if (!entryScreen || entryScreen.classList.contains('entry-exit')) return;
  entryScreen.classList.add('entry-exit');
  setTimeout(() => entryScreen.remove(), 850);
}

document.querySelector('#enter-board').addEventListener('click', () => {
  leaveEntryScreen();
  setTimeout(() => document.querySelector('#listing-form').scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
});

document.querySelector('#update-close').addEventListener('click', () => {
  document.querySelector('#update-panel').remove();
});

async function hashText(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function tryLocalAdminLogin(username, password) {
  if (String(username).toLowerCase() !== adminUsername || adminPasswordHash !== await hashText(String(password))) return false;
  localStorage.setItem('xplaw-session', adminUsername);
  localStorage.setItem('xplaw-admin', 'true');
  localStorage.setItem('xplaw-partner', 'false');
  return true;
}

function validUsername(username) {
  const normalized = username.toLowerCase();
  return /^[A-Za-z0-9_]{3,64}$/.test(username) && !blockedUsernameWords.some((word) => normalized.includes(word));
}

async function tryLocalPartnerLogin(username, password) {
  if (String(username).toUpperCase() !== partnerUsername || partnerPasswordHash !== await hashText(String(password))) return false;
  localStorage.setItem('xplaw-session', partnerUsername);
  localStorage.setItem('xplaw-partner', 'true');
  return true;
}

function readUsers() {
  try { return JSON.parse(localStorage.getItem('xplaw-users') || '[]'); }
  catch { return []; }
}

function readReports() {
  try {
    const reports = JSON.parse(localStorage.getItem('xplaw-reports') || '[]');
    return Array.isArray(reports) ? reports : [];
  } catch { return []; }
}

function readSharedListing() {
  const encoded = new URLSearchParams(window.location.search).get('listing');
  if (!encoded) return null;
  try { return { ...JSON.parse(decodeURIComponent(encoded)), shared: true, images: [] }; }
  catch { return null; }
}

function isAdmin() {
  return localStorage.getItem('xplaw-admin') === 'true' && localStorage.getItem('xplaw-session') === adminUsername;
}

function updateAuthButton() {
  const button = document.querySelector('#login-button');
  if (isAdmin()) button.textContent = 'LOG OUT ADMIN';
  else if (localStorage.getItem('xplaw-session')) button.textContent = 'LOG OUT';
  else button.textContent = 'LOG IN';
}

function updateEntryGreeting() {
  const title = document.querySelector('#entry-title');
  if (!title) return;
  const text = languageText[localStorage.getItem('xplaw-language') || 'en'];
  const username = localStorage.getItem('xplaw-session');
  title.replaceChildren();
  if (username) {
    title.append(`${text.welcome} `, document.createElement('br'));
    const name = document.createElement('em');
    name.textContent = username.toUpperCase() === partnerUsername ? 'Wis' : username;
    title.append(name);
    return;
  }
  const enterParts = {
    en: ['Enter the ', 'board.'],
    ar: ['ادخل إلى ', 'اللوحة.'],
    es: ['Entra al ', 'tablero.'],
    ru: ['Войти на ', 'доску.']
  }[localStorage.getItem('xplaw-language') || 'en'];
  title.append(enterParts[0], document.createElement('br'));
  const board = document.createElement('em');
  board.textContent = enterParts[1];
  title.append(board);
}

function renderCommunityListings() {
  const container = document.querySelector('#uploaded-listings');
  const savedListings = JSON.parse(localStorage.getItem('xplaw-listings') || '[]');
  const shared = readSharedListing();
  const sourceListings = serverMode && Array.isArray(sharedListings) ? sharedListings : savedListings;
  const listings = shared ? [shared, ...sourceListings] : sourceListings;
  container.replaceChildren();
  document.querySelector('#listing-count').textContent = `${listings.length} LISTING${listings.length === 1 ? '' : 'S'}`;
  if (!listings.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-listings';
    empty.textContent = 'No community listings yet. Log in to add the first one.';
    container.appendChild(empty);
    return;
  }
  listings.slice().reverse().forEach((listing) => {
    const card = document.createElement('article');
    card.className = 'uploaded-listing';
    const header = document.createElement('div');
    header.className = 'listing-card-head';
    const meta = document.createElement('span');
    meta.className = 'entry-tag';
    meta.textContent = `${listing.game} / ${listing.listingType || 'Account'}`;
    const status = document.createElement('span');
    status.className = 'listing-status';
    status.textContent = 'AVAILABLE';
    header.append(meta, status);
    const title = document.createElement('h3');
    title.textContent = listing.account;
    if (Array.isArray(listing.images) && listing.images.length) {
      const gallery = document.createElement('div');
      gallery.className = 'listing-gallery';
      listing.images.forEach((source) => {
        const image = document.createElement('img');
        image.src = source;
        image.alt = `${listing.account} account image`;
        image.loading = 'lazy';
        gallery.appendChild(image);
      });
      card.appendChild(gallery);
    }
    const description = document.createElement('p');
    description.textContent = listing.description;
    const owner = document.createElement('span');
    owner.className = 'listing-owner';
    owner.append(`LISTED BY ${listing.owner}`);
    if (listing.partner || String(listing.owner).toUpperCase() === partnerUsername) {
      const badge = document.createElement('span');
      badge.className = 'partner-listing-badge';
      badge.textContent = 'PARTNER';
      owner.appendChild(badge);
    }
    const contact = document.createElement('a');
    contact.className = 'listing-contact';
    contact.href = listing.contactLink || 'https://discord.gg/ZxeBtrTa';
    contact.target = '_blank';
    contact.rel = 'noreferrer';
    contact.textContent = `CONTACT ON ${listing.contactPlatform || 'Discord'} ↗`;
    const footer = document.createElement('div');
    footer.className = 'listing-card-footer';
    footer.append(owner, contact);
    card.append(header, title, description, footer);
    if (!listing.shared) {
      const share = document.createElement('button');
      share.className = 'listing-share';
      share.dataset.shareListing = listing.createdAt || listing.account;
      share.textContent = 'COPY SHARE LINK';
      card.appendChild(share);
    }
    if (isAdmin()) {
      const moderation = document.createElement('div');
      moderation.className = 'listing-moderation';
      const remove = document.createElement('button');
      remove.className = 'moderation-button';
      remove.dataset.removeListing = listing.createdAt;
      remove.textContent = 'REMOVE LISTING';
      const ban = document.createElement('button');
      ban.className = 'moderation-button danger';
      ban.dataset.banOwner = listing.owner;
      ban.textContent = 'BAN OWNER';
      moderation.append(remove, ban);
      card.appendChild(moderation);
    }
    container.appendChild(card);
  });
}

async function loadSharedListings() {
  if (!serverMode) return;
  try {
    const response = await fetch('/api/listings');
    const result = await response.json();
    if (response.ok) { sharedListings = result.listings || []; renderCommunityListings(); }
  } catch { sharedListings = null; }
}

function renderAdminConsole() {
  const consolePanel = document.querySelector('#admin-console');
  const adminArea = document.querySelector('#admin-area');
  if (!isAdmin()) { adminArea.hidden = true; return; }
  adminArea.hidden = false;
  const listings = JSON.parse(localStorage.getItem('xplaw-listings') || '[]');
  const users = [...readUsers(), { username: adminUsername }];
  const banned = JSON.parse(localStorage.getItem('xplaw-banned') || '[]');
  const reports = serverMode ? [] : readReports();
  document.querySelector('#admin-summary').textContent = `${users.length} REGISTERED · ${listings.length} LISTINGS · ${reports.length} REPORTS`;
  const accounts = document.querySelector('#admin-accounts');
  accounts.replaceChildren();
  [...users.map((user) => user.username), ...listings.map((listing) => listing.owner)].filter((value, index, values) => values.indexOf(value) === index).forEach((username) => {
    const row = document.createElement('div');
    row.className = 'admin-account-row';
    const name = document.createElement('strong');
    name.textContent = username;
    const label = document.createElement('span');
    label.textContent = banned.includes(username) ? 'BANNED' : listings.some((listing) => listing.owner === username) ? 'HAS LISTING' : 'REGISTERED';
    row.append(name, label);
    accounts.appendChild(row);
  });
  const reportList = document.querySelector('#admin-reports');
  if (reportList) {
    reportList.replaceChildren();
    if (!reports.length) {
      reportList.textContent = serverMode ? 'Loading reports...' : 'No reports saved on this device.';
    } else {
      reports.slice().reverse().forEach((report) => {
        const row = document.createElement('div');
        row.className = 'admin-report-row';
        row.innerHTML = `<strong></strong><span></span><p></p><div class="admin-report-actions"><button type="button" data-report-action="review" data-report-id="${report.id}">MARK REVIEWED</button><button type="button" data-report-action="ban" data-report-id="${report.id}">BAN USER</button></div>`;
        row.querySelector('strong').textContent = report.account || 'Unknown account';
        row.querySelector('span').textContent = `${report.username || 'Anonymous'} · ${new Date(report.createdAt).toLocaleDateString()}`;
        row.querySelector('p').textContent = report.details || 'No details provided.';
        reportList.appendChild(row);
      });
    }
  }
}

function renderAdminReports(reports) {
  const reportList = document.querySelector('#admin-reports');
  if (!reportList) return;
  reportList.replaceChildren();
  if (!reports.length) { reportList.textContent = 'No reports in the inbox.'; return; }
  reports.slice().reverse().forEach((report) => {
    const row = document.createElement('div');
    row.className = 'admin-report-row';
    const account = document.createElement('strong');
    account.textContent = report.account || 'Unknown account';
    const meta = document.createElement('span');
    meta.textContent = `${report.username || 'Anonymous'} · ${report.status || 'OPEN'} · ${new Date(report.createdAt).toLocaleDateString()}`;
    const details = document.createElement('p');
    details.textContent = report.details || 'No details provided.';
    const actions = document.createElement('div');
    actions.className = 'admin-report-actions';
    if (report.status !== 'reviewed' && report.status !== 'banned') actions.innerHTML = `<button type="button" data-report-action="review" data-report-id="${report.id}">MARK REVIEWED</button><button type="button" data-report-action="ban" data-report-id="${report.id}">BAN USER</button>`;
    row.append(account, meta, details, actions);
    reportList.appendChild(row);
  });
}

async function loadAdminReports() {
  if (!isAdmin() || !serverMode) { renderAdminConsole(); return; }
  const reportList = document.querySelector('#admin-reports');
  if (reportList) reportList.textContent = 'Loading reports...';
  try {
    const response = await fetch('/api/reports', { headers: { Authorization: `Bearer ${localStorage.getItem('xplaw-server-token') || ''}` } });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Reports could not be loaded.');
    renderAdminReports(result.reports || []);
  } catch (error) {
    if (reportList) reportList.textContent = error.message;
  }
}

document.querySelector('#focus-button').addEventListener('click', () => {
  document.body.classList.toggle('focus-mode');
  document.querySelector('#focus-button').textContent = document.body.classList.contains('focus-mode') ? '×' : '↗';
});

function updateClock() {
  const current = new Date();
  document.querySelector('#utc-clock').textContent = `${current.toISOString().slice(11, 19)} UTC`;
}
updateClock();
setInterval(updateClock, 1000);

let scrollFrame = 0;
window.addEventListener('scroll', () => {
  if (scrollFrame) return;
  scrollFrame = requestAnimationFrame(() => {
    document.documentElement.style.setProperty('--scroll-y', `${window.scrollY}px`);
    scrollFrame = 0;
  });
}, { passive: true });

const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) entry.target.classList.add('visible');
  });
}, { threshold: .12 });
document.querySelectorAll('.reveal').forEach((element, index) => {
  element.style.transitionDelay = `${index * 90}ms`;
  revealObserver.observe(element);
});

const loginDialog = document.querySelector('#login-dialog');
const logoutDialog = document.querySelector('#logout-dialog');
const languageDrawer = document.querySelector('#language-drawer');
document.querySelector('#settings-button').addEventListener('click', () => { languageDrawer.hidden = false; languageDrawer.classList.add('open'); });
document.querySelector('#settings-close').addEventListener('click', () => { languageDrawer.classList.remove('open'); setTimeout(() => { languageDrawer.hidden = true; }, 220); });
document.querySelectorAll('[data-language]').forEach((button) => button.addEventListener('click', () => applyLanguage(button.dataset.language)));
document.querySelector('#login-button').addEventListener('click', () => {
  if (localStorage.getItem('xplaw-session')) {
    logoutDialog.showModal();
    return;
  }
  loginDialog.showModal();
});
document.querySelector('#logout-cancel').addEventListener('click', () => logoutDialog.close());
document.querySelector('#logout-confirm').addEventListener('click', () => {
    localStorage.removeItem('xplaw-session');
    localStorage.removeItem('xplaw-admin');
    localStorage.removeItem('xplaw-server-token');
    localStorage.removeItem('xplaw-partner');
    updateAuthButton();
    updateEntryGreeting();
    renderCommunityListings();
    renderAdminConsole();
    logoutDialog.close();
});
document.querySelector('#dialog-close').addEventListener('click', () => loginDialog.close());
document.querySelector('#create-account').addEventListener('click', () => {
  document.querySelector('#login-view').hidden = true;
  document.querySelector('#register-view').hidden = false;
  document.querySelector('#register-view input').focus();
});
document.querySelector('#back-to-login').addEventListener('click', () => {
  document.querySelector('#register-view').hidden = true;
  document.querySelector('#login-view').hidden = false;
});
document.querySelector('#register-username').addEventListener('input', (event) => {
  const username = event.currentTarget.value.trim();
  const unavailable = username.toLowerCase() === adminUsername || readUsers().some((user) => user.username.toLowerCase() === username.toLowerCase());
  document.querySelector('#username-availability').textContent = unavailable ? 'Username unavailable.' : '';
});

function readReportCounts() {
  const counts = {};
  readReports().forEach((report) => {
    if (report.account) counts[report.account] = (counts[report.account] || 0) + 1;
  });
  return counts;
}

function renderReportCounts() {
  const counts = readReportCounts();
  document.querySelectorAll('[data-report-count]').forEach((element) => {
    const count = counts[element.dataset.reportCount] || 0;
    element.textContent = `${count} REPORT${count === 1 ? '' : 'S'}`;
    const listing = element.closest('.signal-layout');
    if (listing) listing.style.opacity = String(Math.max(.42, 1 - count * .08));
  });
}

document.querySelector('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = document.querySelector('#login-status');
  const formData = new FormData(form);
  const values = Object.fromEntries(formData);
  status.textContent = 'Checking credentials...';
  if (serverMode) {
    try {
      const response = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Invalid login details.');
      localStorage.setItem('xplaw-server-token', result.token);
      localStorage.setItem('xplaw-session', values.username);
      localStorage.setItem('xplaw-admin', result.admin ? 'true' : 'false');
      localStorage.setItem('xplaw-partner', result.partner ? 'true' : 'false');
      form.reset();
      updateAuthButton(); updateEntryGreeting(); renderAdminConsole(); loginDialog.close(); return;
    } catch (error) {
      if (await tryLocalAdminLogin(values.username, values.password)) {
        form.reset();
        updateAuthButton(); updateEntryGreeting(); renderCommunityListings(); renderAdminConsole(); loginDialog.close(); return;
      }
      status.textContent = error.message; return;
    }
  }
  if (await tryLocalAdminLogin(values.username, values.password) || await tryLocalPartnerLogin(values.username, values.password)) {
    document.querySelector('#login-button').textContent = 'ADMIN MODE';
    updateAuthButton();
    updateEntryGreeting();
    document.querySelector('#login-dialog').close();
    renderCommunityListings();
    renderAdminConsole();
    return;
  }
  const user = readUsers().find((entry) => entry.username.toLowerCase() === String(values.username).toLowerCase());
  if (JSON.parse(localStorage.getItem('xplaw-banned') || '[]').includes(user?.username)) { status.textContent = 'This account is banned on this device.'; return; }
  if (!user || user.passwordHash !== await hashText(String(values.password))) { status.textContent = 'Invalid username or password.'; return; }
  localStorage.setItem('xplaw-session', user.username);
  status.textContent = 'Logged in. You can now submit listings.';
  document.querySelector('#login-button').textContent = 'LOGGED IN';
  updateAuthButton();
  updateEntryGreeting();
  document.querySelector('#login-dialog').close();
  renderCommunityListings();
  renderAdminConsole();
});
document.querySelector('#register-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = document.querySelector('#register-status');
  const formData = new FormData(form);
  const values = Object.fromEntries(formData);
  if (serverMode) {
    try {
      const response = await fetch('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Account could not be created.');
      status.textContent = result.message; form.reset();
      setTimeout(() => { document.querySelector('#register-view').hidden = true; document.querySelector('#login-view').hidden = false; }, 900); return;
    } catch (error) { status.textContent = error.message; return; }
  }
  if (!validUsername(String(values.username)) || String(values.username).toLowerCase() === adminUsername || String(values.username).toUpperCase() === partnerUsername) { status.textContent = 'That username is unavailable. Use 3-64 letters, numbers, or underscores and keep it appropriate.'; return; }
  const users = readUsers();
  if (users.some((entry) => entry.username.toLowerCase() === String(values.username).toLowerCase())) { status.textContent = 'Username unavailable.'; return; }
  users.push({ username: String(values.username), passwordHash: await hashText(String(values.password)), createdAt: new Date().toISOString() });
  localStorage.setItem('xplaw-users', JSON.stringify(users));
  status.textContent = 'Account created. You can now log in.';
  form.reset();
  setTimeout(() => { document.querySelector('#register-view').hidden = true; document.querySelector('#login-view').hidden = false; }, 900);
});
document.querySelector('#report-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = document.querySelector('#report-status');
  const formData = new FormData(form);
  if (serverMode) {
    try {
      const response = await fetch('/api/report', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(formData)) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Report could not be submitted.');
      status.textContent = result.message;
      form.reset();
      renderReportCounts();
      return;
    } catch (error) {
      status.textContent = error.message;
      return;
    }
  }
  const reports = readReports();
  reports.push({ ...Object.fromEntries(formData), createdAt: new Date().toISOString() });
  localStorage.setItem('xplaw-reports', JSON.stringify(reports));
  status.textContent = 'Report saved on this device for review.';
  form.reset();
  renderReportCounts();
  renderAdminConsole();
});
function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('An image could not be read.'));
    reader.readAsDataURL(file);
  });
}

document.querySelector('#listing-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const status = document.querySelector('#listing-status');
  const formData = new FormData(form);
  const owner = localStorage.getItem('xplaw-session');
  if (!owner) { status.textContent = 'Log in before uploading a listing.'; return; }
  if (JSON.parse(localStorage.getItem('xplaw-banned') || '[]').includes(owner)) { status.textContent = 'This account is banned on this device.'; return; }
  const values = Object.fromEntries(formData);
  const allowedHosts = ['discord.gg', 'discord.com', 'instagram.com', 'x.com', 'twitter.com', 'tiktok.com', 'youtube.com', 'youtu.be'];
  let contactUrl;
  try { contactUrl = new URL(values.contactLink); } catch { status.textContent = 'Enter a valid HTTPS contact link.'; return; }
  const safeHost = allowedHosts.some((host) => contactUrl.hostname === host || contactUrl.hostname.endsWith(`.${host}`));
  if (contactUrl.protocol !== 'https:' || !safeHost) { status.textContent = 'Only HTTPS Discord or approved social-media links are allowed.'; return; }
  if (serverMode) {
    try {
      const response = await fetch('/api/listings', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('xplaw-server-token') || ''}` }, body: JSON.stringify(values) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Listing could not be submitted.');
      status.textContent = result.message; form.reset(); await loadSharedListings(); return;
    } catch (error) { status.textContent = error.message; return; }
  }
  const imageFiles = Array.from(event.currentTarget.elements.images.files);
  if (imageFiles.length > 3 || imageFiles.some((file) => file.size > 10 * 1024 * 1024) || imageFiles.reduce((total, file) => total + file.size, 0) > 10 * 1024 * 1024) { status.textContent = 'Choose up to 3 images totaling 10 MB or less.'; return; }
  let images = [];
  try { images = await Promise.all(imageFiles.map(readImage)); } catch (error) { status.textContent = error.message; return; }
  const listings = JSON.parse(localStorage.getItem('xplaw-listings') || '[]');
  try { listings.push({ ...values, images, owner, partner: owner.toUpperCase() === partnerUsername, createdAt: new Date().toISOString() }); localStorage.setItem('xplaw-listings', JSON.stringify(listings)); }
  catch { status.textContent = 'This listing is too large for browser storage. Use smaller images.'; return; }
  status.textContent = 'Listing saved on this device.';
  form.reset();
  renderCommunityListings();
  renderAdminConsole();
});

document.querySelector('#uploaded-listings').addEventListener('click', async (event) => {
  const shareButton = event.target.closest('[data-share-listing]');
  if (shareButton) {
    const listings = JSON.parse(localStorage.getItem('xplaw-listings') || '[]');
    const listing = listings.find((entry) => (entry.createdAt || entry.account) === shareButton.dataset.shareListing);
    if (!listing) return;
    const shareData = { account: listing.account, game: listing.game, listingType: listing.listingType, description: listing.description, owner: listing.owner, contactPlatform: listing.contactPlatform, contactLink: listing.contactLink };
    const link = `${window.location.href.split('?')[0]}?listing=${encodeURIComponent(JSON.stringify(shareData))}`;
    try { await navigator.clipboard.writeText(link); shareButton.textContent = 'LINK COPIED'; }
    catch { window.prompt('Copy this share link:', link); }
    setTimeout(() => { shareButton.textContent = 'COPY SHARE LINK'; }, 1800);
    return;
  }
  if (!isAdmin()) return;
  const removeButton = event.target.closest('[data-remove-listing]');
  const banButton = event.target.closest('[data-ban-owner]');
  const listings = JSON.parse(localStorage.getItem('xplaw-listings') || '[]');
  if (removeButton) localStorage.setItem('xplaw-listings', JSON.stringify(listings.filter((listing) => listing.createdAt !== removeButton.dataset.removeListing)));
  if (banButton) {
    const banned = JSON.parse(localStorage.getItem('xplaw-banned') || '[]');
    const owner = banButton.dataset.banOwner;
    if (!banned.includes(owner)) banned.push(owner);
    localStorage.setItem('xplaw-banned', JSON.stringify(banned));
    localStorage.setItem('xplaw-listings', JSON.stringify(listings.filter((listing) => listing.owner !== owner)));
  }
  renderCommunityListings();
  renderAdminConsole();
});

document.querySelector('#admin-reports').addEventListener('click', async (event) => {
  const actionButton = event.target.closest('[data-report-action]');
  if (!actionButton || !isAdmin() || !serverMode) return;
  const action = actionButton.dataset.reportAction;
  const reportId = actionButton.dataset.reportId;
  const username = action === 'ban' ? window.prompt('Username to ban:', '') : '';
  if (action === 'ban' && !username) return;
  actionButton.disabled = true;
  try {
    const response = await fetch(`/api/reports/${encodeURIComponent(reportId)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('xplaw-server-token') || ''}` }, body: JSON.stringify({ action, username }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Report action failed.');
    await loadAdminReports();
  } catch (error) { actionButton.disabled = false; window.alert(error.message); }
});
document.querySelector('#refresh-reports').addEventListener('click', loadAdminReports);

renderReportCounts();
renderCommunityListings();
renderAdminConsole();
updateAuthButton();
updateEntryGreeting();
applyLanguage(localStorage.getItem('xplaw-language') || 'en');
loadSharedListings();
loadAdminReports();
