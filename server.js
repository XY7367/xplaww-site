const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const port = Number(process.env.PORT || 3000);
const root = __dirname;
const dataFile = path.join(root, 'data.json');
const sessions = new Map();
const users = loadData();

function loadData() {
  try {
    const saved = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    return { users: saved.users || [], reports: saved.reports || [], listings: saved.listings || [] };
  } catch { return { users: [], reports: [], listings: [] }; }
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
    if (!isAdmin && (!registeredUser || !userPasswordMatches(password, registeredUser))) return json(response, 401, { error: 'Invalid login details.' });
    const token = crypto.randomBytes(32).toString('hex');
    sessions.set(token, { username, admin: isAdmin, createdAt: Date.now() });
    return json(response, 200, { ok: true, token, admin: isAdmin });
  }

  if (request.method === 'POST' && pathname === '/api/register') {
    const body = await readBody(request);
    const username = clean(body.username, 64);
    const password = String(body.password || '');
    if (!/^[A-Za-z0-9_]{3,64}$/.test(username) || password.length < 8) return json(response, 400, { error: 'Use 3-64 letters, numbers, or underscores and a password of 8+ characters.' });
    if (username === process.env.ADMIN_USERNAME || users.users.some((user) => user.username === username)) return json(response, 409, { error: 'That username is already in use.' });
    const salt = crypto.randomBytes(16).toString('hex');
    users.users.push({ username, salt, passwordHash: hashPassword(password, salt), createdAt: new Date().toISOString() });
    saveData();
    return json(response, 201, { ok: true, message: 'Account created. You can now log in.' });
  }

  if (request.method === 'POST' && pathname === '/api/report') {
    const body = await readBody(request);
    const report = { id: crypto.randomUUID(), username: clean(body.username, 64), details: clean(body.details), evidence: clean(body.evidence, 500), createdAt: new Date().toISOString() };
    if (!report.username || !report.details) return json(response, 400, { error: 'Username and details are required.' });
    try { await sendReport(report); } catch (error) { console.error(error.message); return json(response, 503, { error: 'Report delivery is temporarily unavailable. Try again later.' }); }
    users.reports.push(report); saveData();
    return json(response, 201, { ok: true, message: 'Report sent to moderation.' });
  }

  if (request.method === 'POST' && pathname === '/api/listings') {
    const account = sessionUser(request);
    if (!account) return json(response, 401, { error: 'Log in before uploading a listing.' });
    const body = await readBody(request);
    const listing = { id: crypto.randomUUID(), owner: account.username, account: clean(body.account, 64), game: clean(body.game, 80), description: clean(body.description), contactPlatform: clean(body.contactPlatform, 40), contactLink: clean(body.contactLink, 500), createdAt: new Date().toISOString() };
    if (!listing.account || !listing.description) return json(response, 400, { error: 'Account name and description are required.' });
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
    const file = path.join(root, requested);
    if (!file.startsWith(root) || !fs.existsSync(file)) return json(response, 404, { error: 'Not found.' });
    const type = file.endsWith('.css') ? 'text/css' : file.endsWith('.js') ? 'text/javascript' : 'text/html';
    response.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` });
    fs.createReadStream(file).pipe(response);
  } catch (error) { console.error(error); json(response, 500, { error: 'Server error.' }); }
});

server.listen(port, () => console.log(`XPLAW running at http://localhost:${port}`));
