const form = document.getElementById('articleForm');
const formTitle = document.getElementById('formTitle');
const adminMeta = document.getElementById('adminMeta');
const adminList = document.getElementById('adminList');
const resetBtn = document.getElementById('resetBtn');
const logoutBtn = document.getElementById('logoutBtn');
const inlineImagesList = document.getElementById('inlineImagesList');
const addInlineImageBtn = document.getElementById('addInlineImageBtn');
const imageUploadInput = document.getElementById('imageUpload');
const uploadImageBtn = document.getElementById('uploadImageBtn');
const uploadImageStatus = document.getElementById('uploadImageStatus');
const liveAudioUrlInput = document.getElementById('liveAudioUrl');
const saveLiveAudioBtn = document.getElementById('saveLiveAudioBtn');
const liveAudioStatus = document.getElementById('liveAudioStatus');
const sessionRoleMeta = document.getElementById('sessionRoleMeta');
const saveStoryBtn = form.querySelector('button[type="submit"]');
const userManagementBlock = document.getElementById('userManagementBlock');
const newUsernameInput = document.getElementById('newUsername');
const newPasswordInput = document.getElementById('newPassword');
const createUserBtn = document.getElementById('createUserBtn');
const createUserStatus = document.getElementById('createUserStatus');
const userList = document.getElementById('userList');
const preferredCategoryOrder = ['all', 'entertainment', 'politics', 'music', 'sports', 'religion', 'movies', 'did-you-know'];

const fields = {
  id: document.getElementById('articleId'),
  title: document.getElementById('title'),
  category: document.getElementById('category'),
  author: document.getElementById('author'),
  date: document.getElementById('date'),
  image: document.getElementById('image'),
  video: document.getElementById('video'),
  isPopular: document.getElementById('isPopular'),
  summary: document.getElementById('summary'),
  content: document.getElementById('content')
};

let currentUser = null;
let currentArticles = [];

function normalizeImageUrl(url) {
  const raw = String(url || '').trim().replace(/^['"\s]+|['"\s]+$/g, '');
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    if ((parsed.protocol === 'http:' || parsed.protocol === 'https:') && parsed.hostname.toLowerCase() === 'uploads') {
      return `/uploads${parsed.pathname.startsWith('/') ? parsed.pathname : `/${parsed.pathname}`}`;
    }
    const host = parsed.hostname.toLowerCase();
    let fileId = '';

    if (host === 'drive.google.com' || host === 'docs.google.com') {
      const fileMatch = parsed.pathname.match(/^\/file\/d\/([^/]+)/);
      fileId = (fileMatch && fileMatch[1]) || parsed.searchParams.get('id') || '';
    } else if (host === 'drive.usercontent.google.com') {
      fileId = parsed.searchParams.get('id') || '';
    } else if (host === 'lh3.googleusercontent.com') {
      const fileMatch = parsed.pathname.match(/^\/d\/([^/]+)/);
      fileId = (fileMatch && fileMatch[1]) || '';
    }

    if (fileId) {
      return `/api/drive-image/${encodeURIComponent(fileId)}`;
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

function normalizeVideoUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  if (raw.endsWith('.mp4')) return raw;

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    let videoId = '';

    if (host === 'youtu.be') {
      videoId = parsed.pathname.replace(/^\/+/, '').split('/')[0] || '';
    } else if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (parsed.pathname === '/watch') {
        videoId = parsed.searchParams.get('v') || '';
      } else if (parsed.pathname.startsWith('/shorts/')) {
        videoId = parsed.pathname.split('/')[2] || '';
      } else if (parsed.pathname.startsWith('/embed/')) {
        videoId = parsed.pathname.split('/')[2] || '';
      }
    }

    if (videoId) {
      return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}`;
    }
  } catch {
    return raw;
  }

  return raw;
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

async function uploadSelectedImage() {
  const file = imageUploadInput && imageUploadInput.files && imageUploadInput.files[0];
  if (!file) {
    uploadImageStatus.textContent = 'Choose an image first.';
    return;
  }

  uploadImageStatus.textContent = 'Uploading...';
  uploadImageBtn.disabled = true;

  try {
    const dataUrl = await fileToDataUrl(file);
    const data = await fetchJson('/api/admin/upload-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filename: file.name,
        mimeType: file.type,
        dataUrl
      })
    });
    fields.image.value = data.url || '';
    uploadImageStatus.textContent = data.url ? `Uploaded: ${data.url}` : 'Upload complete.';
  } catch (error) {
    uploadImageStatus.textContent = error.message;
  } finally {
    uploadImageBtn.disabled = false;
  }
}

function addInlineImageRow(item = {}) {
  const row = document.createElement('div');
  row.className = 'inline-image-row';
  const urlInput = document.createElement('input');
  urlInput.type = 'text';
  urlInput.dataset.field = 'url';
  urlInput.placeholder = 'Image URL (https://... or /uploads/...)';
  urlInput.value = String(item.url || '');

  const locationInput = document.createElement('input');
  locationInput.type = 'number';
  locationInput.dataset.field = 'location';
  locationInput.min = '1';
  locationInput.step = '1';
  locationInput.value = String(Math.max(1, Number(item.location) || 1));

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.className = 'btn-danger';
  removeBtn.dataset.action = 'remove-inline-image';
  removeBtn.textContent = 'Remove';

  row.append(urlInput, locationInput, removeBtn);

  removeBtn.addEventListener('click', () => {
    row.remove();
  });

  inlineImagesList.appendChild(row);
}

function collectInlineImages() {
  const rows = inlineImagesList.querySelectorAll('.inline-image-row');
  return Array.from(rows)
    .map((row) => {
      const url = normalizeImageUrl(row.querySelector('input[data-field="url"]').value);
      const location = Number(row.querySelector('input[data-field="location"]').value);
      return {
        url,
        location: Number.isFinite(location) && location > 0 ? Math.floor(location) : 1
      };
    })
    .filter((item) => item.url);
}

function setInlineImages(images = []) {
  inlineImagesList.innerHTML = '';
  images.forEach((item) => addInlineImageRow(item));
}

function formatDate(dateString) {
  if (!dateString) return 'No date';
  return new Date(dateString).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function statusLabel(status) {
  const clean = String(status || 'published').toLowerCase();
  if (clean === 'pending') return 'Pending Approval';
  if (clean === 'rejected') return 'Cancelled';
  return 'Published';
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, options);
  if (!res.ok) {
    let message = `Request failed: ${res.status}`;
    const raw = await res.text();
    try {
      const data = JSON.parse(raw);
      message = data.error || message;
    } catch {
      message = raw || message;
    }
    if (res.status === 404 && String(url).startsWith('/api/')) {
      message = 'API route not found (404). Deploy with Cloudflare Pages Functions enabled.';
    }
    throw new Error(message);
  }
  return res.json();
}

function clearForm() {
  form.reset();
  fields.id.value = '';
  setInlineImages([]);
  formTitle.textContent = currentUser && currentUser.isMain ? 'Create New Story' : 'Submit Story for Approval';
  if (uploadImageStatus) uploadImageStatus.textContent = '';
}

function sortCategories(categories) {
  return categories.sort((a, b) => {
    const indexA = preferredCategoryOrder.indexOf(a);
    const indexB = preferredCategoryOrder.indexOf(b);
    const hasA = indexA !== -1;
    const hasB = indexB !== -1;
    if (hasA && hasB) return indexA - indexB;
    if (hasA) return -1;
    if (hasB) return 1;
    return a.localeCompare(b);
  });
}

function formatCategoryLabel(category) {
  return String(category || '')
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function setCategoryOptions(categories, selected = '') {
  const existingValues = Array.from(fields.category.options)
    .map((option) => String(option.value || '').trim().toLowerCase())
    .filter(Boolean);
  const incomingValues = categories.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean);
  const unique = Array.from(new Set([...existingValues, ...incomingValues]));
  if (selected && !unique.includes(selected)) unique.push(selected);
  const sorted = sortCategories(unique);

  fields.category.innerHTML = '<option value="">Select category</option>';
  sorted.forEach((category) => {
    const option = document.createElement('option');
    option.value = category;
    option.textContent = formatCategoryLabel(category);
    fields.category.appendChild(option);
  });
  fields.category.value = selected || '';
}

function toPayload() {
  return {
    title: fields.title.value.trim(),
    category: fields.category.value.trim().toLowerCase(),
    author: fields.author.value.trim(),
    date: fields.date.value,
    image: normalizeImageUrl(fields.image.value),
    video: normalizeVideoUrl(fields.video.value),
    isPopular: Boolean(fields.isPopular.checked),
    summary: fields.summary.value.trim(),
    content: fields.content.value.trim(),
    inlineImages: collectInlineImages()
  };
}

function fillForm(article) {
  fields.id.value = article.id;
  fields.title.value = article.title || '';
  const selectedCategory = String(article.category || '').toLowerCase();
  if (selectedCategory && !Array.from(fields.category.options).some((option) => option.value === selectedCategory)) {
    const option = document.createElement('option');
    option.value = selectedCategory;
    option.textContent = formatCategoryLabel(selectedCategory);
    fields.category.appendChild(option);
  }
  fields.category.value = selectedCategory;
  fields.author.value = article.author || '';
  fields.date.value = article.date || '';
  fields.image.value = article.image || '';
  fields.video.value = article.video || '';
  fields.isPopular.checked = Boolean(article.isPopular);
  fields.summary.value = article.summary || '';
  fields.content.value = article.content || '';
  setInlineImages(Array.isArray(article.inlineImages) ? article.inlineImages : []);
  formTitle.textContent = `Edit Story #${article.id}`;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function deleteArticle(id) {
  if (!window.confirm('Delete this story?')) return;
  await fetchJson(`/api/news/${id}`, { method: 'DELETE' });
  await loadArticles();
  if (String(fields.id.value) === String(id)) {
    clearForm();
  }
}

async function togglePopular(id, nextState) {
  return fetchJson(`/api/news/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ isPopular: nextState })
  });
}

async function reviewArticle(id, action) {
  return fetchJson(`/api/admin/news/${id}/${action}`, {
    method: 'POST'
  });
}

async function deleteUser(username) {
  return fetchJson(`/api/admin/users/${encodeURIComponent(username)}`, {
    method: 'DELETE'
  });
}

function renderUserList(users) {
  if (!userList) return;
  userList.innerHTML = '';

  if (!users.length) {
    userList.innerHTML = '<p class="meta">No contributor accounts yet.</p>';
    return;
  }

  users.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'admin-row';
    const active = item.active !== false;
    row.innerHTML = `
      <div>
        <strong>${item.username}</strong>
        <p class="meta">Created ${formatDate(item.createdAt)} by ${item.createdBy || 'main admin'} • <span class="status-badge ${active ? 'status-published' : 'status-rejected'}">${active ? 'Active' : 'Inactive'}</span></p>
      </div>
      <div class="admin-row-actions">
        <button class="btn-danger" type="button" data-action="delete-user" data-username="${item.username}">Delete</button>
      </div>
    `;
    userList.appendChild(row);
  });

  userList.querySelectorAll('button[data-action="delete-user"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const username = String(btn.dataset.username || '').trim();
      if (!username) return;
      if (!window.confirm(`Delete account "${username}"?`)) return;
      try {
        btn.disabled = true;
        await deleteUser(username);
        createUserStatus.textContent = `Deleted account: ${username}`;
        await loadUsers();
      } catch (error) {
        createUserStatus.textContent = error.message;
      } finally {
        btn.disabled = false;
      }
    });
  });
}

function renderList(articles) {
  const pendingCount = articles.filter((item) => String(item.status).toLowerCase() === 'pending').length;
  const publishedCount = articles.filter((item) => String(item.status).toLowerCase() === 'published').length;
  adminMeta.textContent = `${articles.length} stor${articles.length === 1 ? 'y' : 'ies'} • ${pendingCount} pending • ${publishedCount} published`;
  adminList.innerHTML = '';

  if (!articles.length) {
    adminList.innerHTML = '<p>No stories yet. Use the form to create or submit one.</p>';
    return;
  }

  articles.forEach((article) => {
    const row = document.createElement('div');
    row.className = 'admin-row';
    const status = String(article.status || 'published').toLowerCase();
    const canEdit = currentUser && (currentUser.isMain || status !== 'published');
    const canDelete = canEdit;

    const actionButtons = [];
    if (status === 'published') {
      actionButtons.push(`<a class="btn-link" href="/article.html?id=${article.id}" target="_blank" rel="noopener noreferrer">View</a>`);
    }

    if (currentUser && currentUser.isMain && status === 'published') {
      actionButtons.push(
        `<button class="btn-secondary popular-toggle-btn ${article.isPopular ? 'is-popular' : ''}" type="button" data-action="toggle-popular" data-id="${article.id}" data-next="${article.isPopular ? 'false' : 'true'}">${article.isPopular ? 'Unmark Popular' : 'Mark Popular'}</button>`
      );
    }

    if (currentUser && currentUser.isMain && status === 'pending') {
      actionButtons.push(`<button class="btn-primary" type="button" data-action="approve" data-id="${article.id}">Approve</button>`);
      actionButtons.push(`<button class="btn-danger" type="button" data-action="cancel" data-id="${article.id}">Cancel</button>`);
    }

    if (canEdit) {
      actionButtons.push(`<button class="btn-secondary" type="button" data-action="edit" data-id="${article.id}">Edit</button>`);
    }

    if (canDelete) {
      actionButtons.push(`<button class="btn-danger" type="button" data-action="delete" data-id="${article.id}">Delete</button>`);
    }

    row.innerHTML = `
      <div>
        <strong>${article.title}</strong><span class="popular-indicator">${article.isPopular && status === 'published' ? ' <span class="popular-badge">Most Popular</span>' : ''}</span>
        <p class="meta">${article.category} • ${formatDate(article.date)} • ${article.author || 'K29 Desk'} • <span class="status-badge status-${status}">${statusLabel(status)}</span></p>
      </div>
      <div class="admin-row-actions">${actionButtons.join('')}</div>
    `;
    adminList.appendChild(row);
  });

  adminList.querySelectorAll('button[data-action="edit"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = Number(btn.dataset.id);
      const selected = currentArticles.find((a) => a.id === id);
      if (selected) fillForm(selected);
    });
  });

  adminList.querySelectorAll('button[data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.id);
      try {
        await deleteArticle(id);
      } catch (error) {
        window.alert(error.message);
      }
    });
  });

  adminList.querySelectorAll('button[data-action="toggle-popular"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.id);
      const next = btn.dataset.next === 'true';
      const row = btn.closest('.admin-row');
      try {
        btn.disabled = true;
        const updated = await togglePopular(id, next);
        const isPopular = Boolean(updated && updated.isPopular);
        btn.dataset.next = isPopular ? 'false' : 'true';
        btn.textContent = isPopular ? 'Unmark Popular' : 'Mark Popular';
        btn.classList.toggle('is-popular', isPopular);
        if (row) {
          const indicator = row.querySelector('.popular-indicator');
          if (indicator) {
            indicator.innerHTML = isPopular ? ' <span class="popular-badge">Most Popular</span>' : '';
          }
        }
        const selected = currentArticles.find((a) => Number(a.id) === id);
        if (selected) selected.isPopular = isPopular;
        if (String(fields.id.value) === String(id)) {
          fields.isPopular.checked = isPopular;
        }
      } catch (error) {
        window.alert(error.message);
      } finally {
        btn.disabled = false;
      }
    });
  });

  adminList.querySelectorAll('button[data-action="approve"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.id);
      try {
        btn.disabled = true;
        await reviewArticle(id, 'approve');
        await loadArticles();
      } catch (error) {
        window.alert(error.message);
      } finally {
        btn.disabled = false;
      }
    });
  });

  adminList.querySelectorAll('button[data-action="cancel"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.dataset.id);
      try {
        btn.disabled = true;
        await reviewArticle(id, 'cancel');
        await loadArticles();
      } catch (error) {
        window.alert(error.message);
      } finally {
        btn.disabled = false;
      }
    });
  });
}

async function loadArticles() {
  const data = await fetchJson('/api/news?category=all&includeUnpublished=1');
  currentArticles = data.articles || [];
  renderList(currentArticles);
}

async function loadSettings() {
  try {
    const data = await fetchJson('/api/settings');
    if (liveAudioUrlInput) {
      liveAudioUrlInput.value = String(data.liveAudioUrl || '');
    }
  } catch {
    if (liveAudioStatus) {
      liveAudioStatus.textContent = 'Live settings are unavailable. Restart server to enable this section.';
    }
  }
}

async function saveLiveAudioSettings() {
  if (!liveAudioUrlInput || !saveLiveAudioBtn || !liveAudioStatus) return;
  saveLiveAudioBtn.disabled = true;
  liveAudioStatus.textContent = 'Saving...';

  try {
    const payload = {
      liveAudioUrl: liveAudioUrlInput.value.trim()
    };
    const data = await fetchJson('/api/admin/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    liveAudioUrlInput.value = String(data.liveAudioUrl || '');
    liveAudioStatus.textContent = 'Live link saved.';
  } catch (error) {
    liveAudioStatus.textContent = error.message;
  } finally {
    saveLiveAudioBtn.disabled = false;
  }
}

async function loadCategoryOptions() {
  try {
    const data = await fetchJson('/api/categories');
    setCategoryOptions(data.categories || []);
  } catch {
    setCategoryOptions([]);
  }
}

function applyRoleUi() {
  if (!currentUser) return;
  if (currentUser.isMain) {
    sessionRoleMeta.textContent = `Logged in as main admin (${currentUser.username}). Stories publish immediately, and you can approve or cancel reporter submissions.`;
    formTitle.textContent = 'Create New Story';
    saveStoryBtn.textContent = 'Save Story';
    fields.isPopular.disabled = false;
    if (userManagementBlock) userManagementBlock.hidden = false;
  } else {
    sessionRoleMeta.textContent = `Logged in as contributor (${currentUser.username}). New and edited stories are submitted for approval before they appear on the website.`;
    formTitle.textContent = 'Submit Story for Approval';
    saveStoryBtn.textContent = 'Submit Story';
    fields.isPopular.checked = false;
    fields.isPopular.disabled = true;
    if (userManagementBlock) userManagementBlock.hidden = true;
  }
}

async function loadUsers() {
  if (!currentUser || !currentUser.isMain) return;
  const data = await fetchJson('/api/admin/users');
  renderUserList(data.users || []);
}

async function createUser() {
  if (!currentUser || !currentUser.isMain) return;

  const username = String(newUsernameInput.value || '').trim();
  const password = String(newPasswordInput.value || '').trim();
  if (!username || !password) {
    createUserStatus.textContent = 'Username and password are required.';
    return;
  }

  createUserBtn.disabled = true;
  createUserStatus.textContent = 'Creating user...';

  try {
    await fetchJson('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    newUsernameInput.value = '';
    newPasswordInput.value = '';
    createUserStatus.textContent = 'Contributor account created.';
    await loadUsers();
  } catch (error) {
    createUserStatus.textContent = error.message;
  } finally {
    createUserBtn.disabled = false;
  }
}

async function ensureAuthenticated() {
  const data = await fetchJson('/api/admin/session');
  if (!data.authenticated) {
    window.location.href = '/admin-login.html';
    return false;
  }
  currentUser = data.user || null;
  return true;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const id = fields.id.value;
  const payload = toPayload();
  const method = id ? 'PUT' : 'POST';
  const url = id ? `/api/news/${id}` : '/api/news';

  try {
    await fetchJson(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    clearForm();
    await loadArticles();
  } catch (error) {
    window.alert(error.message);
  }
});

resetBtn.addEventListener('click', clearForm);
addInlineImageBtn.addEventListener('click', () => addInlineImageRow());
if (uploadImageBtn) {
  uploadImageBtn.addEventListener('click', uploadSelectedImage);
}
if (saveLiveAudioBtn) {
  saveLiveAudioBtn.addEventListener('click', saveLiveAudioSettings);
}
if (createUserBtn) {
  createUserBtn.addEventListener('click', createUser);
}

logoutBtn.addEventListener('click', async () => {
  try {
    await fetchJson('/api/admin/logout', { method: 'POST' });
  } catch {
    // no-op
  }
  window.location.href = '/admin-login.html';
});

async function init() {
  try {
    const ok = await ensureAuthenticated();
    if (!ok) return;
    applyRoleUi();
    await loadSettings();
    await loadCategoryOptions();
    await loadArticles();
    if (currentUser && currentUser.isMain) {
      await loadUsers();
    }
  } catch (error) {
    adminList.innerHTML = `<p>${error.message}</p>`;
  }
}

init();
