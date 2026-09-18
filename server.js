const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

loadDotEnv(path.join(__dirname, '.env'));

const port = Number(process.env.PORT || 3000);
const root = __dirname;
const dataFile = path.join(root, 'data.json');
const sessions = new Map();
const users = loadData();
const allowedContactHosts = ['discord.gg', 'discord.com', 'instagram.com', 'x.com', 'twitter.com', 'tiktok.com', 'youtube.com', 'youtu.be'];
const partnerUsername = 'ONYX';
const partnerPasswordSalt = 'xplaw-onyx-partner-salt-v1';
const partnerPasswordHash = 'fb707e3c2acc08c617c997242980200f5af9c24343b93950b7ed5c2d6f1f4c8ea2cd2c342b21044b5bd6cdbb1a987b63e0c8d2805bc4994a7d913c083d83bc26';

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const separatorIndex = trimmed.indexOf('=');
    const key = trimmed.slice(0, separatorIndex).trim();
    let value = trimmed.slice(separatorIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function loadData() {
  try {
    const saved = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    return { users: saved.users || [], reports: saved.reports || [], listings: saved.listings || [], banned: saved.banned || [] };
  } catch { return { users: [], reports: [], listings: [], banned: [] }; }
}

function saveData() {
  fs.writeFileSync(dataFile, JSON.stringify(users, null, 2));
}

function json(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; if (body.length > 100000) request.destroy(); });
    request.on('end', () => { try { resolve(JSON.parse(body || '{}')); } catch { reject(new Error('Invalid JSON')); } });
    request.on('error', reject);
  });
}

function clean(value, limit = 1000) {
  return String(value || '').trim().slice(0, limit);
}

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function passwordMatches(password) {
  const salt = process.env.ADMIN_PASSWORD_SALT;
  const expected = process.env.ADMIN_PASSWORD_HASH;
  if (!expected) return false;
  if (expected.length === 64) {
    const actual = crypto.createHash('sha256').update(password).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
  }
  if (!salt) return false;
  const actual = Buffer.from(hashPassword(password, salt), 'hex');
  const target = Buffer.from(expected, 'hex');
  return actual.length === target.length && crypto.timingSafeEqual(actual, target);
}

function userPasswordMatches(password, user) {
  const actual = Buffer.from(hashPassword(password, user.salt), 'hex');
  const expected = Buffer.from(user.passwordHash, 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function sessionUser(request) {
  const token = request.headers.authorization?.replace('Bearer ', '');
  return token ? sessions.get(token) : null;
}

function adminUser(request) {
  const account = sessionUser(request);
  return account?.admin ? account : null;
}

async function sendReport(report) {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) throw new Error('DISCORD_WEBHOOK_URL is not configured');
  const response = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: 'XPLAW Reports',
      content: '@here New scam report received. Review evidence before taking action.',
      embeds: [{ title: 'Scam report', color: 0xd8674d, fields: [
        { name: 'Reporter', value: report.username || 'Not provided' },
        { name: 'Account', value: report.account || 'Not provided' },
        { name: 'Details', value: report.details || 'Not provided' },
        { name: 'Evidence', value: report.evidence || 'Not provided' }
      ], timestamp: new Date().toISOString() }]
    })
  });
  if (!response.ok) throw new Error(`Discord returned ${response.status}`);
}

async function handleApi(request, response, pathname) {
  if (request.method === 'GET' && pathname === '/api/listings') {
    return json(response, 200, { listings: users.listings });
  }

  if (request.method === 'POST' && pathname === '/api/login') {
    const body = await readBody(request);
    const username = clean(body.username, 64);
    const password = String(body.password || '');
    const adminUsername = process.env.ADMIN_USERNAME || '';
    const registeredUser = users.users.find((user) => user.username === username);
    const isAdmin = username === adminUsername && passwordMatches(password);
    const isPartner = username.toUpperCase() === partnerUsername && hashPassword(password, partnerPasswordSalt) === partnerPasswordHash;
    if (users.banned.includes(username)) return json(response, 403, { error: 'This account is banned.' });
    if (!isAdmin && !isPartner && (!registeredUser || !userPasswordMatches(password, registeredUser))) return json(response, 401, { error: 'Invalid login details.' });
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { username: isPartner ? partnerUsername : username, admin: isAdmin, partner: isPartner, createdAt: Date.now() });
    return json(response, 200, { ok: true, token, admin: isAdmin, partner: isPartner });
  }

  if (request.method === 'GET' && pathname === '/api/reports') {
    if (!adminUser(request)) return json(response, 403, { error: 'Admin access required.' });
    return json(response, 200, { reports: users.reports });
  }

  if (request.method === 'PATCH' && pathname.startsWith('/api/reports/')) {
    if (!adminUser(request)) return json(response, 403, { error: 'Admin access required.' });
    const reportId = pathname.slice('/api/reports/'.length);
    const report = users.reports.find((entry) => entry.id === reportId);
    if (!report) return json(response, 404, { error: 'Report not found.' });
    const body = await readBody(request);
    if (body.action === 'review') report.status = 'reviewed';
    else if (body.action === 'ban') {
      const username = clean(body.username, 64);
      if (!username) return json(response, 400, { error: 'A username is required to ban.' });
      if (!users.banned.includes(username)) users.banned.push(username);
      report.status = 'banned';
      report.bannedUsername = username;
      users.listings = users.listings.filter((listing) => listing.owner !== username);
    } else return json(response, 400, { error: 'Unknown report action.' });
    saveData();
    return json(response, 200, { ok: true, report });
  }

  if (request.method === 'POST' && pathname === '/api/register') {
    const body = await readBody(request);
    const username = clean(body.username, 64);
    const password = String(body.password || '');
    if (!/^[A-Za-z0-9_]{3,64}$/.test(username) || password.length < 8) return json(response, 400, { error: 'Use 3-64 letters, numbers, or underscores and a password of 8+ characters.' });
    if (username === process.env.ADMIN_USERNAME || username.toUpperCase() === partnerUsername || users.users.some((user) => user.username === username)) return json(response, 409, { error: 'That username is already in use.' });
    const salt = crypto.randomBytes(16).toString('hex');
    users.users.push({ username, salt, passwordHash: hashPassword(password, salt), createdAt: new Date().toISOString() });
    saveData();
    return json(response, 201, { ok: true, message: 'Account created. You can now log in.' });
  }

  if (request.method === 'POST' && pathname === '/api/report') {
    const body = await readBody(request);
    const report = { id: crypto.randomUUID(), username: clean(body.username, 64), account: clean(body.account, 64), details: clean(body.details, 2000), evidence: clean(body.evidence, 500), createdAt: new Date().toISOString(), deliveryStatus: 'pending' };
    if (!report.username || !report.details) return json(response, 400, { error: 'Username and details are required.' });
    if (report.evidence) {
      try { const evidenceUrl = new URL(report.evidence); if (!['http:', 'https:'].includes(evidenceUrl.protocol)) throw new Error('Invalid evidence URL'); }
      catch { return json(response, 400, { error: 'Evidence must be a valid HTTP or HTTPS link.' }); }
    }
    users.reports.push(report); saveData();
    try {
      await sendReport(report);
      report.deliveryStatus = 'delivered';
      saveData();
      return json(response, 201, { ok: true, message: 'Report sent to moderation.' });
    } catch (error) {
      report.deliveryStatus = 'queued';
      saveData();
      console.error(error.message);
      return json(response, 202, { ok: true, message: 'Report saved. Moderation delivery is temporarily delayed.' });
    }
  }

  if (request.method === 'POST' && pathname === '/api/listings') {
    const account = sessionUser(request);
    if (!account) return json(response, 401, { error: 'Log in before uploading a listing.' });
    if (users.banned.includes(account.username)) return json(response, 403, { error: 'This account is banned.' });
    const body = await readBody(request);
    const listing = { id: crypto.randomUUID(), owner: account.username, partner: account.partner === true, account: clean(body.account, 64), game: clean(body.game, 80), listingType: clean(body.listingType, 30), description: clean(body.description), contactPlatform: clean(body.contactPlatform, 40), contactLink: clean(body.contactLink, 500), createdAt: new Date().toISOString() };
    if (!listing.account || !listing.description) return json(response, 400, { error: 'Account name and description are required.' });
    try {
      const contactUrl = new URL(listing.contactLink);
      const safeHost = allowedContactHosts.some((host) => contactUrl.hostname === host || contactUrl.hostname.endsWith(`.${host}`));
      if (contactUrl.protocol !== 'https:' || !safeHost) throw new Error('Invalid contact link');
    } catch { return json(response, 400, { error: 'Only HTTPS Discord or approved social-media links are allowed.' }); }
    users.listings.push(listing); saveData();
    return json(response, 201, { ok: true, message: 'Listing submitted for review.' });
  }

  return json(response, 404, { error: 'Not found.' });
}

const server = http.createServer(async (request, response) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
  try {
    if (pathname.startsWith('/api/')) return await handleApi(request, response, pathname);
    const requested = pathname === '/' ? '/index.html' : pathname;
    const file = path.resolve(root, `.${requested}`);
    const relative = path.relative(root, file);
    if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return json(response, 404, { error: 'Not found.' });
    const type = file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/html';
    response.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
    fs.createReadStream(file).pipe(response);
  } catch (error) { console.error(error); json(response, 500, { error: 'Server error.' }); }
});

server.listen(port, () => console.log(`XPLAW running at http://localhost:${port}`));
