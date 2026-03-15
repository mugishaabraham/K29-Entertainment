const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PBKDF2_ITERATIONS = 100000;
const LEGACY_PBKDF2_ITERATIONS = 120000;
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'articles.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'k29';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'gisenyi@12';
const SESSION_COOKIE_NAME = 'k29_admin_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;
const sessions = new Map();
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const IS_VERCEL = process.env.VERCEL === '1';

const baseCategories = ['all', 'politics', 'music', 'entertainment', 'sports', 'religion', 'movies', 'did-you-know'];

const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
};

const uploadExtensionsByMime = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp'
};

function extractDriveFileId(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();

    if (host === 'drive.google.com' || host === 'docs.google.com') {
      const fileMatch = parsed.pathname.match(/^\/file\/d\/([^/]+)/);
      return (fileMatch && fileMatch[1]) || parsed.searchParams.get('id') || '';
    }

    if (host === 'drive.usercontent.google.com') {
      return parsed.searchParams.get('id') || '';
    }

    if (host === 'lh3.googleusercontent.com') {
      const fileMatch = parsed.pathname.match(/^\/d\/([^/]+)/);
      return (fileMatch && fileMatch[1]) || '';
    }
  } catch {
    return '';
  }

  return '';
}

async function fetchDriveImageById(fileId) {
  const cleanId = String(fileId || '').trim();
  if (!cleanId) return null;

  const candidates = [
    `https://lh3.googleusercontent.com/d/${encodeURIComponent(cleanId)}`,
    `https://drive.google.com/uc?export=view&id=${encodeURIComponent(cleanId)}`,
    `https://drive.google.com/thumbnail?id=${encodeURIComponent(cleanId)}&sz=w2000`
  ];

  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, {
        method: 'GET',
        redirect: 'follow',
        headers: { 'User-Agent': 'K29-Image-Proxy/1.0' }
      });
      if (!response.ok) continue;

      const contentType = String(response.headers.get('content-type') || '').toLowerCase();
      if (!contentType.startsWith('image/')) continue;

      const bytes = Buffer.from(await response.arrayBuffer());
      return {
        bytes,
        contentType
      };
    } catch {
      // Try next candidate.
    }
  }

  return null;
}

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, '[]', 'utf8');
  }
  if (!fs.existsSync(SETTINGS_FILE)) {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify({ liveAudioUrl: '' }, null, 2), 'utf8');
  }
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, '[]', 'utf8');
  }
}

function readArticles() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Failed to read articles:', error.message);
    return [];
  }
}

function writeArticles(articles) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(articles, null, 2), 'utf8');
}

function readSettings() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      liveAudioUrl: String((parsed && parsed.liveAudioUrl) || '').trim()
    };
  } catch (error) {
    console.error('Failed to read settings:', error.message);
    return { liveAudioUrl: '' };
  }
}

function writeSettings(settings) {
  const normalized = {
    liveAudioUrl: String((settings && settings.liveAudioUrl) || '').trim()
  };
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(normalized, null, 2), 'utf8');
}

function readUsers() {
  ensureDataFile();
  try {
    const raw = fs.readFileSync(USERS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Failed to read users:', error.message);
    return [];
  }
}

function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
}

function normalizeUsername(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '');
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(String(password), salt, PBKDF2_ITERATIONS, 64, 'sha512').toString('hex');
  return `${salt}:${PBKDF2_ITERATIONS}:${hash}`;
}

function verifyPassword(password, stored) {
  const raw = String(stored || '');
  const parts = raw.split(':');
  if (parts.length === 3) {
    const [salt, iterationsRaw, savedHash] = parts;
    const iterations = Number(iterationsRaw);
    if (!salt || !savedHash || !Number.isFinite(iterations) || iterations <= 0) return false;
    const hash = crypto.pbkdf2Sync(String(password), salt, iterations, 64, 'sha512').toString('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(savedHash, 'hex'));
    } catch {
      return false;
    }
  }
  if (parts.length === 2) {
    const [salt, savedHash] = parts;
    if (!salt || !savedHash) return false;
    const currentHash = crypto.pbkdf2Sync(String(password), salt, PBKDF2_ITERATIONS, 64, 'sha512').toString('hex');
    try {
      if (crypto.timingSafeEqual(Buffer.from(currentHash, 'hex'), Buffer.from(savedHash, 'hex'))) return true;
    } catch {
      return false;
    }
    const legacyHash = crypto.pbkdf2Sync(String(password), salt, LEGACY_PBKDF2_ITERATIONS, 64, 'sha512').toString('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(legacyHash, 'hex'), Buffer.from(savedHash, 'hex'));
    } catch {
      return false;
    }
  }
  return false;
}

function getCategories(articles) {
  const dynamic = new Set(articles.map((a) => String(a.category || '').toLowerCase()).filter(Boolean));
  baseCategories.forEach((category) => dynamic.add(category));
  dynamic.delete('all');
  return ['all', ...Array.from(dynamic).sort()];
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(payload));
}

function vercelWriteBlocked(res) {
  return sendJson(res, 501, {
    error: 'Write operations are disabled on Vercel for this build. Deploy this app on a persistent Node host to use admin create/edit/delete and uploads.'
  });
}

function sendText(res, statusCode, message) {
  res.writeHead(statusCode, { 'Content-Type': 'text/plain' });
  res.end(message);
}

function sendRedirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

function notFound(res) {
  sendJson(res, 404, { error: 'Not Found' });
}

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  return raw
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, item) => {
      const index = item.indexOf('=');
      if (index < 0) return acc;
      const key = item.slice(0, index);
      const value = item.slice(index + 1);
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
}

function cleanupSessions() {
  const now = Date.now();
  sessions.forEach((session, token) => {
    if (!session || Number(session.expiresAt) <= now) {
      sessions.delete(token);
    }
  });
}

function createSession(user) {
  cleanupSessions();
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, {
    expiresAt: Date.now() + SESSION_TTL_MS,
    username: String((user && user.username) || '').trim().toLowerCase(),
    role: String((user && user.role) || 'contributor').trim().toLowerCase(),
    isMain: Boolean(user && user.isMain)
  });
  return token;
}

function setSessionCookie(res, token) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  const secure = IS_PRODUCTION ? '; Secure' : '';
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`
  );
}

function clearSessionCookie(res) {
  const secure = IS_PRODUCTION ? '; Secure' : '';
  res.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`);
}

function getSessionFromRequest(req) {
  cleanupSessions();
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return null;
  const session = sessions.get(token);
  if (!session || Number(session.expiresAt) <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return { token, ...session };
}

function isAuthenticated(req) {
  return Boolean(getSessionFromRequest(req));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 12 * 1024 * 1024) {
        reject(new Error('Payload too large'));
      }
    });

    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });

    req.on('error', reject);
  });
}

function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }
}

function parseBase64ImagePayload(payload) {
  const mimeType = String(payload.mimeType || '').trim().toLowerCase();
  const dataUrl = String(payload.dataUrl || '').trim();
  const ext = uploadExtensionsByMime[mimeType];
  if (!ext) {
    return { error: 'Unsupported image type. Use PNG, JPG, GIF, or WEBP.' };
  }

  let base64 = '';
  if (dataUrl.startsWith('data:')) {
    const parts = dataUrl.split(',', 2);
    if (parts.length < 2 || !parts[0].includes(';base64')) {
      return { error: 'Invalid image encoding.' };
    }
    base64 = parts[1];
  } else {
    base64 = String(payload.base64 || '').trim();
  }

  if (!base64) {
    return { error: 'Missing image data.' };
  }

  let bytes;
  try {
    bytes = Buffer.from(base64, 'base64');
  } catch {
    return { error: 'Invalid base64 image.' };
  }

  if (!bytes.length) {
    return { error: 'Empty image payload.' };
  }

  const maxBytes = 8 * 1024 * 1024;
  if (bytes.length > maxBytes) {
    return { error: 'Image too large. Max size is 8MB.' };
  }

  return { bytes, ext };
}

function normalizeInlineImages(raw) {
  if (typeof raw === 'undefined') {
    return { value: [] };
  }

  if (!Array.isArray(raw)) {
    return { error: 'inlineImages must be an array.' };
  }

  const value = raw
    .map((item) => {
      const url = String((item && item.url) || '').trim();
      const locationValue = Number.parseInt((item && item.location) || 1, 10);
      const location = Number.isFinite(locationValue) && locationValue > 0 ? locationValue : 1;
      return { url, location };
    })
    .filter((item) => item.url);

  return { value };
}

function normalizeIsPopular(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
  }
  return false;
}

function normalizeArticlePayload(payload, isUpdate = false) {
  const title = String(payload.title || '').trim();
  const category = String(payload.category || '').trim().toLowerCase();
  const summary = String(payload.summary || '').trim();
  const content = String(payload.content || '').trim();
  const isPopular = normalizeIsPopular(payload.isPopular);
  const normalizedInlineImages = normalizeInlineImages(payload.inlineImages);

  if (normalizedInlineImages.error) {
    return { error: normalizedInlineImages.error };
  }

  if (!isUpdate && (!title || !category || !summary || !content)) {
    return { error: 'title, category, summary, and content are required.' };
  }

  if (!isUpdate) {
    return {
      title,
      category,
      author: String(payload.author || '').trim() || 'K29 Desk',
      date: String(payload.date || '').trim() || new Date().toISOString().slice(0, 10),
      image: String(payload.image || '').trim(),
      video: String(payload.video || '').trim(),
      summary,
      content,
      isPopular,
      inlineImages: normalizedInlineImages.value
    };
  }

  const updatedFields = {};
  const keys = ['title', 'category', 'author', 'date', 'image', 'video', 'summary', 'content', 'isPopular', 'inlineImages'];

  keys.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(payload, key)) return;
    if (key === 'inlineImages') {
      updatedFields.inlineImages = normalizedInlineImages.value;
      return;
    }
    if (key === 'isPopular') {
      updatedFields.isPopular = normalizeIsPopular(payload.isPopular);
      return;
    }
    const raw = String(payload[key] || '').trim();
    updatedFields[key] = key === 'category' ? raw.toLowerCase() : raw;
  });

  if (Object.prototype.hasOwnProperty.call(updatedFields, 'title') && !updatedFields.title) {
    return { error: 'title cannot be empty.' };
  }
  if (Object.prototype.hasOwnProperty.call(updatedFields, 'category') && !updatedFields.category) {
    return { error: 'category cannot be empty.' };
  }
  if (Object.prototype.hasOwnProperty.call(updatedFields, 'summary') && !updatedFields.summary) {
    return { error: 'summary cannot be empty.' };
  }
  if (Object.prototype.hasOwnProperty.call(updatedFields, 'content') && !updatedFields.content) {
    return { error: 'content cannot be empty.' };
  }

  return updatedFields;
}

function toClientImageUrl(rawUrl) {
  const url = String(rawUrl || '').trim().replace(/^['"\s]+|['"\s]+$/g, '');
  if (!url) return '';

  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      if (parsed.hostname.toLowerCase() === 'uploads') {
        return `/uploads${parsed.pathname.startsWith('/') ? parsed.pathname : `/${parsed.pathname}`}`;
      }
      const fileId = extractDriveFileId(url);
      if (!fileId) return url;
      return `/api/drive-image/${encodeURIComponent(fileId)}`;
    }
  } catch {
    // Handle malformed and relative URLs below.
  }

  if (url.startsWith('/uploads/')) return url;
  if (url.startsWith('uploads/')) return `/${url}`;
  if (url.startsWith('./uploads/')) return `/${url.slice(2)}`;

  const uploadMatch = url.match(/(?:^|\/)(uploads\/[^\s?#]+)/i);
  if (uploadMatch) {
    return `/${uploadMatch[1].replace(/^\/+/, '')}`;
  }

  const fileId = extractDriveFileId(url);
  if (!fileId) return url;
  return `/api/drive-image/${encodeURIComponent(fileId)}`;
}

function toClientArticle(article) {
  const base = { ...article };
  base.isPopular = Boolean(base.isPopular);
  base.status = String(base.status || 'published');
  base.image = toClientImageUrl(base.image);
  if (Array.isArray(base.inlineImages)) {
    base.inlineImages = base.inlineImages.map((item) => ({
      ...item,
      url: toClientImageUrl(item && item.url)
    }));
  }
  return base;
}

function getArticleStatus(article) {
  return String((article && article.status) || 'published').toLowerCase();
}

function isPublishedArticle(article) {
  return getArticleStatus(article) === 'published';
}

function articleSortTimestamp(article) {
  const createdAt = Date.parse(String((article && article.createdAt) || '').trim());
  if (Number.isFinite(createdAt)) return createdAt;
  const publishedAt = Date.parse(String((article && article.date) || '').trim());
  if (Number.isFinite(publishedAt)) return publishedAt;
  return Number(article && article.id) || 0;
}

function canViewArticle(article, session) {
  if (!article) return false;
  if (isPublishedArticle(article)) return true;
  if (!session) return false;
  if (session.isMain) return true;
  return String(article.createdBy || '').toLowerCase() === String(session.username || '').toLowerCase();
}

function canMutateArticle(article, session) {
  if (!article || !session) return false;
  if (session.isMain) return true;
  const owner = String(article.createdBy || '').toLowerCase();
  const sameOwner = owner && owner === String(session.username || '').toLowerCase();
  const status = getArticleStatus(article);
  return sameOwner && (status === 'pending' || status === 'rejected');
}

function canDeleteArticle(article, session) {
  return canMutateArticle(article, session);
}

function clearUserSessions(username) {
  const target = normalizeUsername(username);
  if (!target) return;
  sessions.forEach((sessionData, token) => {
    if (normalizeUsername(sessionData && sessionData.username) === target) {
      sessions.delete(token);
    }
  });
}

async function handleApi(req, res, url) {
  const articles = readArticles();
  const settings = readSettings();
  const session = getSessionFromRequest(req);

  if (req.method === 'OPTIONS') {
    return sendJson(res, 204, {});
  }

  if (url.pathname === '/api/categories' && req.method === 'GET') {
    return sendJson(res, 200, { categories: getCategories(articles) });
  }

  if (url.pathname === '/api/settings' && req.method === 'GET') {
    return sendJson(res, 200, settings);
  }

  const driveImageMatch = url.pathname.match(/^\/api\/drive-image\/([^/]+)$/);
  if (driveImageMatch && (req.method === 'GET' || req.method === 'HEAD')) {
    const pathId = decodeURIComponent(driveImageMatch[1] || '');
    const queryId = String(url.searchParams.get('id') || '').trim();
    const source = String(url.searchParams.get('url') || '').trim();
    const fileId = queryId || pathId || extractDriveFileId(source);

    if (!fileId) {
      return sendJson(res, 400, { error: 'Missing Google Drive file id.' });
    }

    const image = await fetchDriveImageById(fileId);
    if (!image) {
      return sendJson(res, 404, { error: 'Unable to fetch image from Google Drive.' });
    }

    res.writeHead(200, {
      'Content-Type': image.contentType,
      'Cache-Control': 'public, max-age=3600'
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    res.end(image.bytes);
    return;
  }

  if (url.pathname === '/api/admin/session' && req.method === 'GET') {
    if (!session) {
      return sendJson(res, 200, { authenticated: false });
    }
    return sendJson(res, 200, {
      authenticated: true,
      user: {
        username: session.username,
        role: session.role,
        isMain: session.isMain
      }
    });
  }

  if (url.pathname === '/api/admin/login' && req.method === 'POST') {
    try {
      const payload = await parseJsonBody(req);
      const username = normalizeUsername(payload.username);
      const password = String(payload.password || '');
      const mainUsername = normalizeUsername(ADMIN_USERNAME);

      if (username === mainUsername && password === ADMIN_PASSWORD) {
        const token = createSession({
          username: mainUsername,
          role: 'main',
          isMain: true
        });
        setSessionCookie(res, token);
        return sendJson(res, 200, { ok: true });
      }

      const users = readUsers();
      const matched = users.find((item) => normalizeUsername(item && item.username) === username);
      if (!matched || matched.active === false || !verifyPassword(password, matched.passwordHash)) {
        return sendJson(res, 401, { error: 'Invalid username or password.' });
      }

      const token = createSession({
        username,
        role: 'contributor',
        isMain: false
      });
      setSessionCookie(res, token);
      return sendJson(res, 200, { ok: true });
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  if (url.pathname === '/api/admin/logout' && req.method === 'POST') {
    if (session && session.token) {
      sessions.delete(session.token);
    }
    clearSessionCookie(res);
    return sendJson(res, 200, { ok: true });
  }

  if (url.pathname === '/api/admin/users' && req.method === 'GET') {
    if (!session || !session.isMain) {
      return sendJson(res, 401, { error: 'Unauthorized' });
    }
    const users = readUsers()
      .map((item) => ({
        username: normalizeUsername(item && item.username),
        active: item && item.active !== false,
        createdAt: String((item && item.createdAt) || ''),
        createdBy: String((item && item.createdBy) || '')
      }))
      .filter((item) => item.username)
      .sort((a, b) => a.username.localeCompare(b.username));
    return sendJson(res, 200, { users });
  }

  if (url.pathname === '/api/admin/users' && req.method === 'POST') {
    if (!session || !session.isMain) {
      return sendJson(res, 401, { error: 'Unauthorized' });
    }
    if (IS_VERCEL) {
      return vercelWriteBlocked(res);
    }

    try {
      const payload = await parseJsonBody(req);
      const username = normalizeUsername(payload.username);
      const password = String(payload.password || '').trim();

      if (!username || username.length < 3) {
        return sendJson(res, 400, { error: 'Username must be at least 3 characters.' });
      }
      if (password.length < 4) {
        return sendJson(res, 400, { error: 'Password must be at least 4 characters.' });
      }
      if (username === normalizeUsername(ADMIN_USERNAME)) {
        return sendJson(res, 400, { error: 'That username is reserved.' });
      }

      const users = readUsers();
      const exists = users.some((item) => normalizeUsername(item && item.username) === username);
      if (exists) {
        return sendJson(res, 409, { error: 'Username already exists.' });
      }

      const created = {
        username,
        role: 'contributor',
        passwordHash: hashPassword(password),
        active: true,
        createdAt: new Date().toISOString(),
        createdBy: session.username
      };
      users.push(created);
      writeUsers(users);

      return sendJson(res, 201, {
        user: {
          username: created.username,
          active: created.active,
          createdAt: created.createdAt,
          createdBy: created.createdBy
        }
      });
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  const userPathMatch = url.pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (userPathMatch && req.method === 'DELETE') {
    if (!session || !session.isMain) {
      return sendJson(res, 401, { error: 'Unauthorized' });
    }
    if (IS_VERCEL) {
      return vercelWriteBlocked(res);
    }

    const targetUsername = normalizeUsername(decodeURIComponent(userPathMatch[1] || ''));
    if (!targetUsername) {
      return sendJson(res, 400, { error: 'Invalid username.' });
    }
    if (targetUsername === normalizeUsername(ADMIN_USERNAME)) {
      return sendJson(res, 400, { error: 'Main admin account cannot be deleted.' });
    }

    const users = readUsers();
    const index = users.findIndex((item) => normalizeUsername(item && item.username) === targetUsername);
    if (index < 0) {
      return notFound(res);
    }

    const deleted = users.splice(index, 1)[0];
    writeUsers(users);
    clearUserSessions(targetUsername);
    return sendJson(res, 200, {
      deleted: {
        username: normalizeUsername(deleted && deleted.username),
        createdAt: String((deleted && deleted.createdAt) || ''),
        createdBy: String((deleted && deleted.createdBy) || '')
      }
    });
  }

  if (url.pathname === '/api/admin/settings' && req.method === 'PUT') {
    if (!session) {
      return sendJson(res, 401, { error: 'Unauthorized' });
    }
    if (IS_VERCEL) {
      return vercelWriteBlocked(res);
    }

    try {
      const payload = await parseJsonBody(req);
      const nextSettings = {
        ...settings,
        liveAudioUrl: String(payload.liveAudioUrl || '').trim()
      };
      writeSettings(nextSettings);
      return sendJson(res, 200, nextSettings);
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  if (url.pathname === '/api/admin/upload-image' && req.method === 'POST') {
    if (!session) {
      return sendJson(res, 401, { error: 'Unauthorized' });
    }
    if (IS_VERCEL) {
      return vercelWriteBlocked(res);
    }

    try {
      const payload = await parseJsonBody(req);
      const parsed = parseBase64ImagePayload(payload);
      if (parsed.error) {
        return sendJson(res, 400, { error: parsed.error });
      }

      ensureUploadsDir();
      const stamp = Date.now();
      const random = crypto.randomBytes(6).toString('hex');
      const fileName = `${stamp}-${random}${parsed.ext}`;
      const destination = path.join(UPLOADS_DIR, fileName);
      fs.writeFileSync(destination, parsed.bytes);

      return sendJson(res, 201, { url: `/uploads/${fileName}` });
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  const moderationMatch = url.pathname.match(/^\/api\/admin\/news\/(\d+)\/(approve|cancel)$/);
  if (moderationMatch && req.method === 'POST') {
    if (!session || !session.isMain) {
      return sendJson(res, 401, { error: 'Unauthorized' });
    }
    if (IS_VERCEL) {
      return vercelWriteBlocked(res);
    }

    const id = Number(moderationMatch[1]);
    const action = moderationMatch[2];
    const index = articles.findIndex((item) => Number(item.id) === id);
    if (index < 0) {
      return notFound(res);
    }

    const existing = articles[index];
    const now = new Date().toISOString();

    const updated =
      action === 'approve'
        ? {
            ...existing,
            status: 'published',
            approvedAt: now,
            approvedBy: session.username,
            rejectedAt: '',
            rejectedBy: ''
          }
        : {
            ...existing,
            status: 'rejected',
            isPopular: false,
            rejectedAt: now,
            rejectedBy: session.username
          };

    articles[index] = updated;
    writeArticles(articles);
    return sendJson(res, 200, toClientArticle(updated));
  }

  if (url.pathname === '/api/news' && req.method === 'GET') {
    const category = (url.searchParams.get('category') || 'all').toLowerCase();
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const popular = ['1', 'true', 'yes', 'on'].includes(String(url.searchParams.get('popular') || '').trim().toLowerCase());
    const includeUnpublished =
      ['1', 'true', 'yes', 'on'].includes(String(url.searchParams.get('includeUnpublished') || '').trim().toLowerCase()) &&
      Boolean(session);

    let visible = includeUnpublished
      ? session.isMain
        ? articles
        : articles.filter((article) => normalizeUsername(article.createdBy) === session.username)
      : articles.filter(isPublishedArticle);

    visible = category === 'all' ? visible : visible.filter((article) => String(article.category).toLowerCase() === category);
    if (popular) {
      visible = visible.filter((article) => Boolean(article.isPopular));
    }
    if (q) {
      visible = visible.filter((article) => {
        const blob = `${article.title || ''} ${article.summary || ''} ${article.content || ''}`.toLowerCase();
        return blob.includes(q);
      });
    }

    visible.sort((a, b) => {
      if (Boolean(a && a.isPopular) !== Boolean(b && b.isPopular)) {
        return Boolean(b && b.isPopular) - Boolean(a && a.isPopular);
      }
      if (!includeUnpublished) {
        return articleSortTimestamp(b) - articleSortTimestamp(a);
      }
      const order = { pending: 0, rejected: 1, published: 2 };
      const statusA = getArticleStatus(a);
      const statusB = getArticleStatus(b);
      const rankA = Object.prototype.hasOwnProperty.call(order, statusA) ? order[statusA] : 9;
      const rankB = Object.prototype.hasOwnProperty.call(order, statusB) ? order[statusB] : 9;
      if (rankA !== rankB) return rankA - rankB;
      return articleSortTimestamp(b) - articleSortTimestamp(a);
    });

    return sendJson(res, 200, {
      count: visible.length,
      category,
      query: q,
      articles: visible.map(toClientArticle)
    });
  }

  if (url.pathname === '/api/news' && req.method === 'POST') {
    if (!session) {
      return sendJson(res, 401, { error: 'Unauthorized' });
    }
    if (IS_VERCEL) {
      return vercelWriteBlocked(res);
    }

    try {
      const payload = await parseJsonBody(req);
      const normalized = normalizeArticlePayload(payload);
      if (normalized.error) {
        return sendJson(res, 400, { error: normalized.error });
      }

      const now = new Date().toISOString();
      const nextId = articles.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
      const article = {
        id: nextId,
        ...normalized,
        status: session.isMain ? 'published' : 'pending',
        createdBy: session.username,
        createdAt: now,
        updatedAt: now,
        approvedAt: '',
        approvedBy: '',
        rejectedAt: '',
        rejectedBy: '',
        isPopular: session.isMain ? Boolean(normalized.isPopular) : false
      };

      articles.push(article);
      writeArticles(articles);
      return sendJson(res, 201, toClientArticle(article));
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  const articleMatch = url.pathname.match(/^\/api\/news\/(\d+)$/);
  if (!articleMatch) {
    return notFound(res);
  }

  const id = Number(articleMatch[1]);
  const index = articles.findIndex((item) => Number(item.id) === id);

  if (req.method === 'GET') {
    if (index < 0) {
      return notFound(res);
    }
    const article = articles[index];
    if (!canViewArticle(article, session)) {
      return notFound(res);
    }
    return sendJson(res, 200, toClientArticle(article));
  }

  if (req.method === 'PUT') {
    if (!session) {
      return sendJson(res, 401, { error: 'Unauthorized' });
    }
    if (IS_VERCEL) {
      return vercelWriteBlocked(res);
    }

    if (index < 0) {
      return notFound(res);
    }

    const existing = articles[index];
    if (!canMutateArticle(existing, session)) {
      return sendJson(res, 403, { error: 'You are not allowed to edit this story.' });
    }

    try {
      const payload = await parseJsonBody(req);
      const normalized = normalizeArticlePayload(payload, true);
      if (normalized.error) {
        return sendJson(res, 400, { error: normalized.error });
      }

      if (!session.isMain && Object.prototype.hasOwnProperty.call(normalized, 'isPopular')) {
        delete normalized.isPopular;
      }

      const updated = {
        ...existing,
        ...normalized,
        updatedAt: new Date().toISOString(),
        updatedBy: session.username
      };

      if (!session.isMain) {
        updated.status = 'pending';
        updated.isPopular = false;
        updated.approvedAt = '';
        updated.approvedBy = '';
        updated.rejectedAt = '';
        updated.rejectedBy = '';
      }

      articles[index] = updated;
      writeArticles(articles);
      return sendJson(res, 200, toClientArticle(updated));
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  if (req.method === 'DELETE') {
    if (!session) {
      return sendJson(res, 401, { error: 'Unauthorized' });
    }
    if (IS_VERCEL) {
      return vercelWriteBlocked(res);
    }

    if (index < 0) {
      return notFound(res);
    }

    const existing = articles[index];
    if (!canDeleteArticle(existing, session)) {
      return sendJson(res, 403, { error: 'You are not allowed to delete this story.' });
    }

    const deleted = articles.splice(index, 1)[0];
    writeArticles(articles);
    return sendJson(res, 200, { deleted: toClientArticle(deleted) });
  }

  return notFound(res);
}

function safeJoin(base, target) {
  const targetPath = path.normalize(path.join(base, target));
  if (!targetPath.startsWith(base)) {
    return null;
  }
  return targetPath;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function getSiteOrigin(req) {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const proto = forwardedProto || (IS_PRODUCTION ? 'https' : 'http');
  const host = String(req.headers.host || '').trim();
  return host ? `${proto}://${host}` : '';
}

function normalizeArticleImageUrl(rawImage) {
  const raw = String(rawImage || '').trim().replace(/^['"\s]+|['"\s]+$/g, '');
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && host === 'uploads') {
      const p = parsed.pathname.startsWith('/') ? parsed.pathname : `/${parsed.pathname}`;
      return `/uploads${p}`;
    }
    return raw;
  } catch {
    if (raw.startsWith('/uploads/')) return raw;
    if (raw.startsWith('uploads/')) return `/${raw}`;
    if (raw.startsWith('./uploads/')) return `/${raw.slice(2)}`;
    const uploadMatch = raw.match(/(?:^|\/)(uploads\/[^\s?#]+)/i);
    if (uploadMatch) {
      return `/${uploadMatch[1].replace(/^\/+/, '')}`;
    }
    return raw;
  }
}

function toAbsoluteUrl(origin, rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) return '';
  try {
    return new URL(value, origin || undefined).toString();
  } catch {
    return value;
  }
}

function summarizeArticle(article) {
  const summary = String((article && article.summary) || '').trim();
  if (summary) return summary.slice(0, 220);
  const content = String((article && article.content) || '').replace(/\s+/g, ' ').trim();
  return content ? content.slice(0, 220) : 'Latest stories from K29 Entertainment.';
}

function buildArticleMeta(req, article, id) {
  const origin = getSiteOrigin(req);
  const pageUrl = toAbsoluteUrl(origin, `/article.html?id=${encodeURIComponent(String(id))}`);
  const imageCandidate = normalizeArticleImageUrl(article.image || '');
  const imageUrl = toAbsoluteUrl(origin, imageCandidate || '/logo.jpeg');
  const title = String((article && article.title) || 'K29 Entertainment - Story').trim() || 'K29 Entertainment - Story';
  const description = summarizeArticle(article);
  const publishedTime = String((article && article.date) || '').trim();

  const tags = [
    `<meta name="description" content="${escapeAttr(description)}" />`,
    `<meta property="og:type" content="article" />`,
    `<meta property="og:site_name" content="K29 Entertainment" />`,
    `<meta property="og:title" content="${escapeAttr(title)}" />`,
    `<meta property="og:description" content="${escapeAttr(description)}" />`,
    `<meta property="og:url" content="${escapeAttr(pageUrl)}" />`,
    `<meta property="og:image" content="${escapeAttr(imageUrl)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeAttr(title)}" />`,
    `<meta name="twitter:description" content="${escapeAttr(description)}" />`,
    `<meta name="twitter:image" content="${escapeAttr(imageUrl)}" />`
  ];

  if (publishedTime) {
    tags.push(`<meta property="article:published_time" content="${escapeAttr(publishedTime)}" />`);
  }

  return {
    title: `${title} - K29 Entertainment`,
    tags: tags.join('\n    ')
  };
}

function injectArticleMeta(html, meta) {
  const safeTitle = `<title>${escapeHtml(meta.title)}</title>`;
  let out = html.replace(/<title>[\s\S]*?<\/title>/i, safeTitle);
  if (out === html) {
    out = out.replace(/<head[^>]*>/i, (match) => `${match}\n    ${safeTitle}`);
  }
  return out.replace(/<\/head>/i, `    ${meta.tags}\n  </head>`);
}

function serveArticleHtml(req, res, parsedUrl) {
  const id = Number(parsedUrl.searchParams.get('id'));
  if (!id) {
    return serveStatic(req, res, parsedUrl.pathname);
  }

  const articles = readArticles();
  const article = articles.find((item) => Number(item.id) === id && isPublishedArticle(item));
  if (!article) {
    return serveStatic(req, res, parsedUrl.pathname);
  }

  const articlePath = safeJoin(PUBLIC_DIR, '/article.html');
  if (!articlePath) {
    return sendText(res, 500, 'Server error');
  }

  fs.readFile(articlePath, 'utf8', (err, html) => {
    if (err) {
      return sendText(res, err.code === 'ENOENT' ? 404 : 500, err.code === 'ENOENT' ? 'File not found' : 'Server error');
    }
    const meta = buildArticleMeta(req, article, id);
    const output = injectArticleMeta(html, meta);
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end(output);
  });
}

function serveStatic(req, res, urlPath) {
  const requested = urlPath === '/' ? '/index.html' : urlPath;
  let decodedRequested;

  try {
    decodedRequested = decodeURIComponent(requested);
  } catch {
    return sendText(res, 400, 'Bad Request');
  }

  if ((decodedRequested === '/admin.html' || decodedRequested === '/admin.js') && !isAuthenticated(req)) {
    if (decodedRequested === '/admin.html') {
      return sendRedirect(res, '/admin-login.html');
    }
    return sendJson(res, 401, { error: 'Unauthorized' });
  }

  const filePath = safeJoin(PUBLIC_DIR, decodedRequested);

  if (!filePath) {
    return sendText(res, 400, 'Bad Request');
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        sendText(res, 404, 'File not found');
        return;
      }
      sendText(res, 500, 'Server error');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

async function requestHandler(req, res) {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host}`);

    if (parsedUrl.pathname.startsWith('/api/')) {
      return await handleApi(req, res, parsedUrl);
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/article.html') {
      return serveArticleHtml(req, res, parsedUrl);
    }

    return serveStatic(req, res, parsedUrl.pathname);
  } catch (error) {
    console.error('Unexpected server error:', error.message);
    return sendJson(res, 500, { error: 'Internal server error' });
  }
}

function createServer() {
  return http.createServer(requestHandler);
}

if (require.main === module) {
  const server = createServer();
  server.listen(PORT, () => {
    if (IS_PRODUCTION && (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD)) {
      console.warn('WARNING: Using default admin credentials in production. Set ADMIN_USERNAME and ADMIN_PASSWORD.');
    }
    console.log(`K29 Entertainment running on http://localhost:${PORT}`);
  });
}

module.exports = {
  createServer,
  requestHandler
};
