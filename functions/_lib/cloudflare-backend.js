const ADMIN_USERNAME_DEFAULT = 'k29';
const ADMIN_PASSWORD_DEFAULT = 'gisenyi@12';
const SESSION_COOKIE_NAME = 'k29_admin_session';
const SESSION_TTL_SECONDS = 60 * 60 * 8;
const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000;

const DATA_KEYS = {
  articles: 'k29:data:articles',
  settings: 'k29:data:settings',
  users: 'k29:data:users'
};

const baseCategories = ['all', 'politics', 'music', 'entertainment', 'sports', 'religion', 'movies'];

const uploadExtensionsByMime = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp'
};

const defaultArticles = [
  {
    id: 1,
    title: 'Parliament Approves New National Budget Framework',
    category: 'politics',
    author: 'Editorial Desk',
    date: '2026-02-20',
    image: 'https://images.unsplash.com/photo-1541872705-1f73c6400ec9?auto=format&fit=crop&w=1200&q=80',
    video: '',
    summary: 'Lawmakers passed a multi-year framework focused on healthcare access, digital infrastructure, and SME tax incentives.',
    content: "The final vote followed weeks of negotiation among coalition members. Economists suggest implementation speed will define the plan's impact.",
    isPopular: true,
    status: 'published'
  },
  {
    id: 2,
    title: 'Top Afrobeats Artists Announce Global Summer Tour',
    category: 'music',
    author: 'Culture Reporter',
    date: '2026-02-18',
    image: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=1200&q=80',
    video: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
    summary: 'A joint tour will cover 22 cities across Europe, Africa, and North America, with ticket pre-sales opening this week.',
    content: 'Organizers say the collaboration marks one of the biggest multi-artist live projects in the genre this year.',
    isPopular: true,
    status: 'published'
  },
  {
    id: 3,
    title: 'Streaming Platform Invests in Local Original Series',
    category: 'entertainment',
    author: 'Media Bureau',
    date: '2026-02-16',
    image: 'http:/uploads/1772113150341-9bb5726807b7.png',
    video: '',
    summary: 'A new slate of regional productions is expected to generate jobs for writers, editors, and production crews.',
    content: 'Studio executives confirmed long-term commitments to talent development programs and post-production facilities.',
    inlineImages: [],
    isPopular: true,
    status: 'published'
  },
  {
    id: 4,
    title: 'Championship Race Tightens After Dramatic Weekend Results',
    category: 'sports',
    author: 'Sports Desk',
    date: '2026-02-21',
    image: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=1200&q=80',
    video: '',
    summary: 'Late goals and a surprise upset reshaped the title table, leaving just three points between the top teams.',
    content: 'Analysts now expect the race to be decided in the final two rounds, with injuries likely to influence outcomes.',
    inlineImages: [],
    isPopular: true,
    status: 'published'
  },
  {
    id: 5,
    title: 'the leader of M23 fighter is now deseased',
    category: 'politics',
    author: 'K29 entertainment',
    date: '2026-02-25',
    image: 'http:/uploads/1772113017005-e3a1aa54d156.png',
    video: '',
    summary: 'he was sticked by a drone attach in Rubaya mining site',
    content:
      'He was found deceased in the dead bodies that found him dead in Rubaya site where he was assasinated by FARDC( the national soldiers of the democratic republic of congo).',
    inlineImages: [],
    isPopular: true,
    status: 'published'
  }
];

const defaultSettings = {
  liveAudioUrl: 'https://youtu.be/NADT8L-R1Jo?si=XNEOHwZq3reAtd10'
};

const defaultUsers = [
  {
    username: 'reporter01',
    role: 'contributor',
    passwordHash:
      '6176e8acf6f2319e40edd2c912808c72:f034daaf988d6847c96e508d1e82ea999ea65367e6aa579ef3f143699b5d31ca178eb77a16df9e86ee33db1c9b327dc866ca85eec584d01e62f7b932ec4b9fb9',
    active: true,
    createdAt: '2026-03-13T19:45:21.673Z',
    createdBy: 'k29'
  }
];

const memoryStore = {
  data: new Map(),
  sessions: new Map(),
  uploads: new Map()
};

function jsonResponse(status, payload, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      ...extraHeaders
    }
  });
}

function normalizeUsername(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '');
}

function parseCookies(request) {
  const raw = request.headers.get('Cookie') || '';
  const out = {};
  raw
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .forEach((item) => {
      const index = item.indexOf('=');
      if (index < 0) return;
      const key = item.slice(0, index);
      const value = item.slice(index + 1);
      out[key] = decodeURIComponent(value);
    });
  return out;
}

function buildSessionCookie(token, isProduction) {
  const secure = isProduction ? '; Secure' : '';
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`;
}

function buildClearSessionCookie(isProduction) {
  const secure = isProduction ? '; Secure' : '';
  return `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

function bufferToHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToUint8Array(hex) {
  const out = new Uint8Array(Math.floor(hex.length / 2));
  for (let i = 0; i < out.length; i += 1) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function secureEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

async function deriveHash(password, saltBytes) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(String(password)), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: 120000,
      hash: 'SHA-512'
    },
    keyMaterial,
    512
  );
  return bufferToHex(bits);
}

async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await deriveHash(password, salt);
  return `${bufferToHex(salt)}:${hash}`;
}

async function verifyPassword(password, stored) {
  const raw = String(stored || '');
  const [saltHex, hashHex] = raw.split(':');
  if (!saltHex || !hashHex) return false;
  const derived = await deriveHash(password, hexToUint8Array(saltHex));
  return secureEqual(derived, hashHex);
}

function getDataNamespace(env) {
  return env.K29_DATA || null;
}

function getSessionNamespace(env) {
  return env.K29_SESSIONS || null;
}

async function readJson(env, key, fallbackValue) {
  const ns = getDataNamespace(env);
  if (ns) {
    const value = await ns.get(key, { type: 'json' });
    if (value !== null) return value;
    await ns.put(key, JSON.stringify(fallbackValue));
    return fallbackValue;
  }

  if (!memoryStore.data.has(key)) {
    memoryStore.data.set(key, fallbackValue);
  }
  return memoryStore.data.get(key);
}

async function writeJson(env, key, value) {
  const ns = getDataNamespace(env);
  if (ns) {
    await ns.put(key, JSON.stringify(value));
    return;
  }
  memoryStore.data.set(key, value);
}

async function loadArticles(env) {
  const parsed = await readJson(env, DATA_KEYS.articles, defaultArticles);
  return Array.isArray(parsed) ? parsed : [];
}

async function saveArticles(env, articles) {
  await writeJson(env, DATA_KEYS.articles, articles);
}

async function loadSettings(env) {
  const parsed = await readJson(env, DATA_KEYS.settings, defaultSettings);
  return {
    liveAudioUrl: String((parsed && parsed.liveAudioUrl) || '').trim()
  };
}

async function saveSettings(env, settings) {
  await writeJson(env, DATA_KEYS.settings, {
    liveAudioUrl: String((settings && settings.liveAudioUrl) || '').trim()
  });
}

async function loadUsers(env) {
  const parsed = await readJson(env, DATA_KEYS.users, defaultUsers);
  return Array.isArray(parsed) ? parsed : [];
}

async function saveUsers(env, users) {
  await writeJson(env, DATA_KEYS.users, users);
}

function getCategories(articles) {
  const dynamic = new Set(articles.map((a) => String(a.category || '').toLowerCase()).filter(Boolean));
  baseCategories.forEach((category) => dynamic.add(category));
  dynamic.delete('all');
  return ['all', ...Array.from(dynamic).sort()];
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

      const bytes = await response.arrayBuffer();
      return { bytes, contentType };
    } catch {
      // Try next candidate.
    }
  }

  return null;
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

async function createSession(env, user) {
  const token = bufferToHex(crypto.getRandomValues(new Uint8Array(24)));
  const payload = {
    expiresAt: Date.now() + SESSION_TTL_MS,
    username: String((user && user.username) || '').trim().toLowerCase(),
    role: String((user && user.role) || 'contributor').trim().toLowerCase(),
    isMain: Boolean(user && user.isMain)
  };

  const sessionsNs = getSessionNamespace(env);
  if (sessionsNs) {
    await sessionsNs.put(`session:${token}`, JSON.stringify(payload), { expirationTtl: SESSION_TTL_SECONDS });
  } else {
    memoryStore.sessions.set(token, payload);
  }

  return token;
}

async function getSession(request, env) {
  const cookies = parseCookies(request);
  const token = cookies[SESSION_COOKIE_NAME];
  if (!token) return null;

  const sessionsNs = getSessionNamespace(env);
  let session = null;

  if (sessionsNs) {
    session = await sessionsNs.get(`session:${token}`, { type: 'json' });
  } else {
    session = memoryStore.sessions.get(token) || null;
  }

  if (!session || Number(session.expiresAt) <= Date.now()) {
    if (sessionsNs) {
      await sessionsNs.delete(`session:${token}`);
    } else {
      memoryStore.sessions.delete(token);
    }
    return null;
  }

  return { token, ...session };
}

async function deleteSession(env, token) {
  if (!token) return;
  const sessionsNs = getSessionNamespace(env);
  if (sessionsNs) {
    await sessionsNs.delete(`session:${token}`);
  } else {
    memoryStore.sessions.delete(token);
  }
}

async function clearUserSessions(env, username) {
  const target = normalizeUsername(username);
  if (!target) return;

  // KV cannot list/delete reliably by value at scale; keep local-memory support and rely on TTL in KV.
  if (!getSessionNamespace(env)) {
    for (const [token, session] of memoryStore.sessions.entries()) {
      if (normalizeUsername(session && session.username) === target) {
        memoryStore.sessions.delete(token);
      }
    }
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
    bytes = base64ToBytes(base64);
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

  return { bytes, ext, mimeType };
}

async function saveUpload(env, fileName, mimeType, bytes) {
  const payload = {
    mimeType,
    base64: bytesToBase64(bytes)
  };

  const ns = getDataNamespace(env);
  if (ns) {
    await ns.put(`k29:upload:${fileName}`, JSON.stringify(payload));
    return;
  }

  memoryStore.uploads.set(fileName, payload);
}

async function readUpload(env, fileName) {
  const ns = getDataNamespace(env);
  if (ns) {
    return await ns.get(`k29:upload:${fileName}`, { type: 'json' });
  }
  return memoryStore.uploads.get(fileName) || null;
}

export async function handleUploadsRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const fileName = decodeURIComponent(url.pathname.replace(/^\/uploads\//, ''));
  if (!fileName) {
    return jsonResponse(404, { error: 'Not Found' });
  }

  const blob = await readUpload(env, fileName);
  if (!blob || !blob.base64 || !blob.mimeType) {
    // If image is not in KV, fall back to static asset serving.
    if (typeof context.next === 'function') {
      return context.next();
    }
    return new Response('File not found', { status: 404 });
  }

  const bytes = base64ToBytes(blob.base64);
  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': blob.mimeType,
      'Cache-Control': 'public, max-age=86400'
    }
  });
}

export async function handleApiRequest(context) {
  const { request, env } = context;
  const method = request.method.toUpperCase();
  const url = new URL(request.url);
  const pathname = url.pathname;
  const isProduction = String(env.NODE_ENV || '').toLowerCase() === 'production';
  const mainUsername = normalizeUsername(env.ADMIN_USERNAME || ADMIN_USERNAME_DEFAULT);
  const mainPassword = String(env.ADMIN_PASSWORD || ADMIN_PASSWORD_DEFAULT);

  if (method === 'OPTIONS') {
    return jsonResponse(204, {});
  }

  const [articles, settings, users, session] = await Promise.all([
    loadArticles(env),
    loadSettings(env),
    loadUsers(env),
    getSession(request, env)
  ]);

  if (pathname === '/api/health' && method === 'GET') {
    return jsonResponse(200, {
      ok: true,
      service: 'k29-api',
      hasDataKV: Boolean(getDataNamespace(env)),
      hasSessionKV: Boolean(getSessionNamespace(env)),
      hasAdminEnv: Boolean(env.ADMIN_USERNAME && env.ADMIN_PASSWORD)
    });
  }

  if (pathname === '/api/categories' && method === 'GET') {
    return jsonResponse(200, { categories: getCategories(articles) });
  }

  if (pathname === '/api/settings' && method === 'GET') {
    return jsonResponse(200, settings);
  }

  const driveImageMatch = pathname.match(/^\/api\/drive-image\/([^/]+)$/);
  if (driveImageMatch && (method === 'GET' || method === 'HEAD')) {
    const pathId = decodeURIComponent(driveImageMatch[1] || '');
    const queryId = String(url.searchParams.get('id') || '').trim();
    const source = String(url.searchParams.get('url') || '').trim();
    const fileId = queryId || pathId || extractDriveFileId(source);

    if (!fileId) {
      return jsonResponse(400, { error: 'Missing Google Drive file id.' });
    }

    const image = await fetchDriveImageById(fileId);
    if (!image) {
      return jsonResponse(404, { error: 'Unable to fetch image from Google Drive.' });
    }

    if (method === 'HEAD') {
      return new Response(null, {
        status: 200,
        headers: {
          'Content-Type': image.contentType,
          'Cache-Control': 'public, max-age=3600'
        }
      });
    }

    return new Response(image.bytes, {
      status: 200,
      headers: {
        'Content-Type': image.contentType,
        'Cache-Control': 'public, max-age=3600'
      }
    });
  }

  if (pathname === '/api/admin/session' && method === 'GET') {
    if (!session) {
      return jsonResponse(200, { authenticated: false });
    }

    return jsonResponse(200, {
      authenticated: true,
      user: {
        username: session.username,
        role: session.role,
        isMain: session.isMain
      }
    });
  }

  if (pathname === '/api/admin/login' && method === 'POST') {
    try {
      const payload = await request.json();
      const username = normalizeUsername(payload.username);
      const password = String(payload.password || '');

      if (username === mainUsername && password === mainPassword) {
        const token = await createSession(env, {
          username: mainUsername,
          role: 'main',
          isMain: true
        });
        return jsonResponse(200, { ok: true }, { 'Set-Cookie': buildSessionCookie(token, isProduction) });
      }

      const matched = users.find((item) => normalizeUsername(item && item.username) === username);
      const isValid = matched && matched.active !== false && (await verifyPassword(password, matched.passwordHash));
      if (!isValid) {
        return jsonResponse(401, { error: 'Invalid username or password.' });
      }

      const token = await createSession(env, {
        username,
        role: 'contributor',
        isMain: false
      });

      return jsonResponse(200, { ok: true }, { 'Set-Cookie': buildSessionCookie(token, isProduction) });
    } catch (error) {
      return jsonResponse(400, { error: error.message || 'Invalid JSON body' });
    }
  }

  if (pathname === '/api/admin/logout' && method === 'POST') {
    if (session && session.token) {
      await deleteSession(env, session.token);
    }
    return jsonResponse(200, { ok: true }, { 'Set-Cookie': buildClearSessionCookie(isProduction) });
  }

  if (pathname === '/api/admin/users' && method === 'GET') {
    if (!session || !session.isMain) {
      return jsonResponse(401, { error: 'Unauthorized' });
    }

    const list = users
      .map((item) => ({
        username: normalizeUsername(item && item.username),
        active: item && item.active !== false,
        createdAt: String((item && item.createdAt) || ''),
        createdBy: String((item && item.createdBy) || '')
      }))
      .filter((item) => item.username)
      .sort((a, b) => a.username.localeCompare(b.username));

    return jsonResponse(200, { users: list });
  }

  if (pathname === '/api/admin/users' && method === 'POST') {
    if (!session || !session.isMain) {
      return jsonResponse(401, { error: 'Unauthorized' });
    }

    try {
      const payload = await request.json();
      const username = normalizeUsername(payload.username);
      const password = String(payload.password || '').trim();

      if (!username || username.length < 3) {
        return jsonResponse(400, { error: 'Username must be at least 3 characters.' });
      }
      if (password.length < 4) {
        return jsonResponse(400, { error: 'Password must be at least 4 characters.' });
      }
      if (username === mainUsername) {
        return jsonResponse(400, { error: 'That username is reserved.' });
      }

      const exists = users.some((item) => normalizeUsername(item && item.username) === username);
      if (exists) {
        return jsonResponse(409, { error: 'Username already exists.' });
      }

      const created = {
        username,
        role: 'contributor',
        passwordHash: await hashPassword(password),
        active: true,
        createdAt: new Date().toISOString(),
        createdBy: session.username
      };

      users.push(created);
      await saveUsers(env, users);

      return jsonResponse(201, {
        user: {
          username: created.username,
          active: created.active,
          createdAt: created.createdAt,
          createdBy: created.createdBy
        }
      });
    } catch (error) {
      return jsonResponse(400, { error: error.message || 'Invalid JSON body' });
    }
  }

  const userPathMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (userPathMatch && method === 'DELETE') {
    if (!session || !session.isMain) {
      return jsonResponse(401, { error: 'Unauthorized' });
    }

    const targetUsername = normalizeUsername(decodeURIComponent(userPathMatch[1] || ''));
    if (!targetUsername) {
      return jsonResponse(400, { error: 'Invalid username.' });
    }
    if (targetUsername === mainUsername) {
      return jsonResponse(400, { error: 'Main admin account cannot be deleted.' });
    }

    const index = users.findIndex((item) => normalizeUsername(item && item.username) === targetUsername);
    if (index < 0) {
      return jsonResponse(404, { error: 'Not Found' });
    }

    const deleted = users.splice(index, 1)[0];
    await saveUsers(env, users);
    await clearUserSessions(env, targetUsername);

    return jsonResponse(200, {
      deleted: {
        username: normalizeUsername(deleted && deleted.username),
        createdAt: String((deleted && deleted.createdAt) || ''),
        createdBy: String((deleted && deleted.createdBy) || '')
      }
    });
  }

  if (pathname === '/api/admin/settings' && method === 'PUT') {
    if (!session) {
      return jsonResponse(401, { error: 'Unauthorized' });
    }

    try {
      const payload = await request.json();
      const nextSettings = {
        ...settings,
        liveAudioUrl: String(payload.liveAudioUrl || '').trim()
      };
      await saveSettings(env, nextSettings);
      return jsonResponse(200, nextSettings);
    } catch (error) {
      return jsonResponse(400, { error: error.message || 'Invalid JSON body' });
    }
  }

  if (pathname === '/api/admin/upload-image' && method === 'POST') {
    if (!session) {
      return jsonResponse(401, { error: 'Unauthorized' });
    }

    try {
      const payload = await request.json();
      const parsed = parseBase64ImagePayload(payload);
      if (parsed.error) {
        return jsonResponse(400, { error: parsed.error });
      }

      const stamp = Date.now();
      const random = bufferToHex(crypto.getRandomValues(new Uint8Array(6)));
      const fileName = `${stamp}-${random}${parsed.ext}`;
      await saveUpload(env, fileName, parsed.mimeType, parsed.bytes);

      return jsonResponse(201, { url: `/uploads/${fileName}` });
    } catch (error) {
      return jsonResponse(400, { error: error.message || 'Invalid JSON body' });
    }
  }

  const moderationMatch = pathname.match(/^\/api\/admin\/news\/(\d+)\/(approve|cancel)$/);
  if (moderationMatch && method === 'POST') {
    if (!session || !session.isMain) {
      return jsonResponse(401, { error: 'Unauthorized' });
    }

    const id = Number(moderationMatch[1]);
    const action = moderationMatch[2];
    const index = articles.findIndex((item) => Number(item.id) === id);
    if (index < 0) {
      return jsonResponse(404, { error: 'Not Found' });
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
    await saveArticles(env, articles);
    return jsonResponse(200, toClientArticle(updated));
  }

  if (pathname === '/api/news' && method === 'GET') {
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
      if (!includeUnpublished) {
        return String(b.date).localeCompare(String(a.date));
      }
      const order = { pending: 0, rejected: 1, published: 2 };
      const statusA = getArticleStatus(a);
      const statusB = getArticleStatus(b);
      const rankA = Object.prototype.hasOwnProperty.call(order, statusA) ? order[statusA] : 9;
      const rankB = Object.prototype.hasOwnProperty.call(order, statusB) ? order[statusB] : 9;
      if (rankA !== rankB) return rankA - rankB;
      return String(b.date).localeCompare(String(a.date));
    });

    return jsonResponse(200, {
      count: visible.length,
      category,
      query: q,
      articles: visible.map(toClientArticle)
    });
  }

  if (pathname === '/api/news' && method === 'POST') {
    if (!session) {
      return jsonResponse(401, { error: 'Unauthorized' });
    }

    try {
      const payload = await request.json();
      const normalized = normalizeArticlePayload(payload);
      if (normalized.error) {
        return jsonResponse(400, { error: normalized.error });
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
      await saveArticles(env, articles);
      return jsonResponse(201, toClientArticle(article));
    } catch (error) {
      return jsonResponse(400, { error: error.message || 'Invalid JSON body' });
    }
  }

  const articleMatch = pathname.match(/^\/api\/news\/(\d+)$/);
  if (!articleMatch) {
    return jsonResponse(404, { error: 'Not Found' });
  }

  const id = Number(articleMatch[1]);
  const index = articles.findIndex((item) => Number(item.id) === id);

  if (method === 'GET') {
    if (index < 0) {
      return jsonResponse(404, { error: 'Not Found' });
    }
    const article = articles[index];
    if (!canViewArticle(article, session)) {
      return jsonResponse(404, { error: 'Not Found' });
    }
    return jsonResponse(200, toClientArticle(article));
  }

  if (method === 'PUT') {
    if (!session) {
      return jsonResponse(401, { error: 'Unauthorized' });
    }

    if (index < 0) {
      return jsonResponse(404, { error: 'Not Found' });
    }

    const existing = articles[index];
    if (!canMutateArticle(existing, session)) {
      return jsonResponse(403, { error: 'You are not allowed to edit this story.' });
    }

    try {
      const payload = await request.json();
      const normalized = normalizeArticlePayload(payload, true);
      if (normalized.error) {
        return jsonResponse(400, { error: normalized.error });
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
      await saveArticles(env, articles);
      return jsonResponse(200, toClientArticle(updated));
    } catch (error) {
      return jsonResponse(400, { error: error.message || 'Invalid JSON body' });
    }
  }

  if (method === 'DELETE') {
    if (!session) {
      return jsonResponse(401, { error: 'Unauthorized' });
    }

    if (index < 0) {
      return jsonResponse(404, { error: 'Not Found' });
    }

    const existing = articles[index];
    if (!canMutateArticle(existing, session)) {
      return jsonResponse(403, { error: 'You are not allowed to delete this story.' });
    }

    const deleted = articles.splice(index, 1)[0];
    await saveArticles(env, articles);
    return jsonResponse(200, { deleted: toClientArticle(deleted) });
  }

  return jsonResponse(404, { error: 'Not Found' });
}
