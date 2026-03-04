const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'articles.json');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'k29';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'gisenyi@12';
const SESSION_COOKIE_NAME = 'k29_admin_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 8;
const sessions = new Map();
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const IS_VERCEL = process.env.VERCEL === '1';

const baseCategories = ['all', 'politics', 'music', 'entertainment', 'sports', 'religion', 'movies'];

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
  sessions.forEach((expiresAt, token) => {
    if (expiresAt <= now) {
      sessions.delete(token);
    }
  });
}

function createSession() {
  cleanupSessions();
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL_MS);
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

function isAuthenticated(req) {
  cleanupSessions();
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return false;
  const expiresAt = sessions.get(token);
  if (!expiresAt || expiresAt <= Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
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
  base.image = toClientImageUrl(base.image);
  if (Array.isArray(base.inlineImages)) {
    base.inlineImages = base.inlineImages.map((item) => ({
      ...item,
      url: toClientImageUrl(item && item.url)
    }));
  }
  return base;
}

async function handleApi(req, res, url) {
  const articles = readArticles();
  const settings = readSettings();

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
    return sendJson(res, 200, { authenticated: isAuthenticated(req) });
  }

  if (url.pathname === '/api/admin/login' && req.method === 'POST') {
    try {
      const payload = await parseJsonBody(req);
      const username = String(payload.username || '').trim().toLowerCase();
      const password = String(payload.password || '').trim();

      if (username !== ADMIN_USERNAME.toLowerCase() || password !== ADMIN_PASSWORD) {
        return sendJson(res, 401, { error: 'Invalid username or password.' });
      }

      const token = createSession();
      setSessionCookie(res, token);
      return sendJson(res, 200, { ok: true });
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  if (url.pathname === '/api/admin/logout' && req.method === 'POST') {
    const cookies = parseCookies(req);
    const token = cookies[SESSION_COOKIE_NAME];
    if (token) {
      sessions.delete(token);
    }
    clearSessionCookie(res);
    return sendJson(res, 200, { ok: true });
  }

  if (url.pathname === '/api/admin/settings' && req.method === 'PUT') {
    if (!isAuthenticated(req)) {
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
    if (!isAuthenticated(req)) {
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

  if (url.pathname === '/api/news' && req.method === 'GET') {
    const category = (url.searchParams.get('category') || 'all').toLowerCase();
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    const popular = ['1', 'true', 'yes', 'on'].includes(String(url.searchParams.get('popular') || '').trim().toLowerCase());

    const filteredByCategory =
      category === 'all' ? articles : articles.filter((article) => String(article.category).toLowerCase() === category);
    const filteredByPopularity = popular ? filteredByCategory.filter((article) => Boolean(article.isPopular)) : filteredByCategory;

    const filtered = q
      ? filteredByPopularity.filter((article) => {
          const blob = `${article.title || ''} ${article.summary || ''} ${article.content || ''}`.toLowerCase();
          return blob.includes(q);
        })
      : filteredByPopularity;

    filtered.sort((a, b) => String(b.date).localeCompare(String(a.date)));

    return sendJson(res, 200, {
      count: filtered.length,
      category,
      query: q,
      articles: filtered.map(toClientArticle)
    });
  }

  if (url.pathname === '/api/news' && req.method === 'POST') {
    if (!isAuthenticated(req)) {
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

      const nextId = articles.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
      const article = { id: nextId, ...normalized };
      articles.push(article);
      writeArticles(articles);
      return sendJson(res, 201, article);
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
    return sendJson(res, 200, toClientArticle(articles[index]));
  }

  if (req.method === 'PUT') {
    if (!isAuthenticated(req)) {
      return sendJson(res, 401, { error: 'Unauthorized' });
    }
    if (IS_VERCEL) {
      return vercelWriteBlocked(res);
    }

    if (index < 0) {
      return notFound(res);
    }

    try {
      const payload = await parseJsonBody(req);
      const normalized = normalizeArticlePayload(payload, true);
      if (normalized.error) {
        return sendJson(res, 400, { error: normalized.error });
      }

      const existing = articles[index];
      const updated = { ...existing, ...normalized };

      articles[index] = updated;
      writeArticles(articles);
      return sendJson(res, 200, updated);
    } catch (error) {
      return sendJson(res, 400, { error: error.message });
    }
  }

  if (req.method === 'DELETE') {
    if (!isAuthenticated(req)) {
      return sendJson(res, 401, { error: 'Unauthorized' });
    }
    if (IS_VERCEL) {
      return vercelWriteBlocked(res);
    }

    if (index < 0) {
      return notFound(res);
    }
    const deleted = articles.splice(index, 1)[0];
    writeArticles(articles);
    return sendJson(res, 200, { deleted });
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
