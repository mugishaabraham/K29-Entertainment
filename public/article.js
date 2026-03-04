const storyEl = document.getElementById('story');

function normalizeImageUrl(url) {
  const raw = String(url || '').trim().replace(/^['"\s]+|['"\s]+$/g, '');
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
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
  } catch {
    return raw;
  }

  return raw;
}

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function readId() {
  const params = new URLSearchParams(window.location.search);
  return Number(params.get('id'));
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Request failed: ${res.status}`);
  return res.json();
}

function renderVideo(videoUrl) {
  if (!videoUrl) return '';
  if (videoUrl.endsWith('.mp4')) {
    return `<video controls class="story-video" src="${videoUrl}"></video>`;
  }
  return `<iframe class="story-video" src="${videoUrl}" title="Story video" allowfullscreen></iframe>`;
}

function normalizeInlineImages(inlineImages) {
  if (!Array.isArray(inlineImages)) return [];
  return inlineImages
    .map((item) => ({
      url: normalizeImageUrl((item && item.url) || ''),
      location: Math.max(1, Number.parseInt((item && item.location) || 1, 10) || 1)
    }))
    .filter((item) => item.url);
}

function renderStoryContent(content, inlineImages) {
  const chunks = String(content || '')
    .split(/\n{2,}/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!chunks.length) return '';

  const imagesByLocation = new Map();
  normalizeInlineImages(inlineImages).forEach((item) => {
    if (!imagesByLocation.has(item.location)) imagesByLocation.set(item.location, []);
    imagesByLocation.get(item.location).push(item.url);
  });

  const parts = [];
  chunks.forEach((chunk, index) => {
    const paragraphNumber = index + 1;
    parts.push(`<p>${chunk.replace(/\n/g, '<br />')}</p>`);
    const urls = imagesByLocation.get(paragraphNumber) || [];
    urls.forEach((url) => {
      parts.push(`<img class="story-inline-image" src="${url}" alt="Story media" loading="lazy" />`);
    });
  });

  const trailingLocations = Array.from(imagesByLocation.keys()).filter((location) => location > chunks.length);
  trailingLocations.sort((a, b) => a - b).forEach((location) => {
    imagesByLocation.get(location).forEach((url) => {
      parts.push(`<img class="story-inline-image" src="${url}" alt="Story media" loading="lazy" />`);
    });
  });

  return parts.join('');
}

function renderStory(article) {
  document.title = `${article.title} - K29 Entertainment`;
  storyEl.innerHTML = `
    <p class="kicker">${article.category}</p>
    <h1>${article.title}</h1>
    <p class="meta">${formatDate(article.date)} • ${article.author || 'K29 Desk'}</p>
    ${article.image ? `<img class="story-image" src="${normalizeImageUrl(article.image)}" alt="${article.title}" />` : ''}
    ${renderVideo(article.video || '')}
    <p class="story-summary">${article.summary || ''}</p>
    <div class="story-content">${renderStoryContent(article.content || '', article.inlineImages || [])}</div>
  `;
}

async function init() {
  try {
    const id = readId();
    if (!id) {
      throw new Error('Missing article id in URL.');
    }

    const article = await fetchJson(`/api/news/${id}`);
    renderStory(article);
  } catch (error) {
    storyEl.innerHTML = `<h2>Unable to load story</h2><p>${error.message}</p>`;
  }
}

init();
