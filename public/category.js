const categoryGrid = document.getElementById('categoryGrid');
const categoryTitle = document.getElementById('categoryTitle');
const resultsMeta = document.getElementById('resultsMeta');

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

function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function getArticleUrl(articleId, useFreshToken = false) {
  const url = new URL('/article.html', window.location.origin);
  url.searchParams.set('id', String(articleId));
  if (useFreshToken) {
    url.searchParams.set('s', `${Date.now()}`);
  }
  return url.toString();
}

async function shareStory(article) {
  const shareUrl = getArticleUrl(article.id, true);
  const shareTitle = article.title || 'K29 Entertainment';
  const shareText = article.summary || article.title || 'Read this story on K29 Entertainment';

  if (navigator.share) {
    try {
      await navigator.share({ title: shareTitle, text: shareText, url: shareUrl });
      return;
    } catch {
      // User canceled or share unavailable.
    }
  }

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(shareUrl);
      window.alert('Story link copied.');
      return;
    }
  } catch {
    // Fall through to prompt.
  }

  window.prompt('Copy story link:', shareUrl);
}

function readCategory() {
  const params = new URLSearchParams(window.location.search);
  return (params.get('category') || 'all').toLowerCase();
}

function formatCategoryLabel(category) {
  return String(category || '')
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 404 && String(url).startsWith('/api/')) {
      throw new Error('API route not found (404). Deploy with Cloudflare Pages Functions enabled.');
    }
    throw new Error(`Request failed: ${res.status}`);
  }
  return res.json();
}

function renderCards(articles) {
  if (!articles.length) {
    categoryGrid.innerHTML = '<article class="panel card"><div class="card-body"><h3>No stories yet</h3><p>Use the admin panel to add stories for this category.</p></div></article>';
    return;
  }

  categoryGrid.innerHTML = '';
  articles.forEach((article) => {
    const card = document.createElement('article');
    card.className = 'panel card';
    card.innerHTML = `
      ${article.image ? `<img src="${normalizeImageUrl(article.image)}" alt="${article.title}" loading="lazy" />` : ''}
      <div class="card-body">
        <p class="kicker">${formatCategoryLabel(article.category)}</p>
        <h3><a href="/article.html?id=${article.id}">${article.title}</a></h3>
        <p class="meta">${formatDate(article.date)} • ${article.author || 'K29 Desk'}</p>
        <p>${article.summary || ''}</p>
        <div class="card-actions">
          <a class="read-link" href="/article.html?id=${article.id}">Read Full Story</a>
          <button type="button" class="story-action-btn" data-share-story-id="${article.id}" aria-label="Share story" title="Share story">Share</button>
          <a class="story-action-btn" href="/article.html?id=${article.id}#comments" aria-label="Comment on story" title="Comment on story">Comment</a>
        </div>
      </div>
    `;
    categoryGrid.appendChild(card);
  });
}

function setupStoryCardActions(articles) {
  if (!categoryGrid) return;
  categoryGrid.addEventListener('click', (event) => {
    const shareBtn = event.target.closest('[data-share-story-id]');
    if (!shareBtn) return;
    event.preventDefault();
    const id = Number(shareBtn.getAttribute('data-share-story-id'));
    if (!id) return;
    const article = articles.find((item) => Number(item.id) === id);
    if (!article) return;
    shareStory(article);
  });
}

async function init() {
  try {
    const category = readCategory();
    categoryTitle.textContent = category === 'all' ? 'All Categories' : `${formatCategoryLabel(category)} News`;

    const data = await fetchJson(`/api/news?category=${encodeURIComponent(category)}`);
    resultsMeta.textContent = `${data.count} stor${data.count === 1 ? 'y' : 'ies'}`;
    renderCards(data.articles);
    setupStoryCardActions(Array.isArray(data.articles) ? data.articles : []);
  } catch (error) {
    categoryGrid.innerHTML = `<article class="panel card"><div class="card-body"><h3>Error</h3><p>${error.message}</p></div></article>`;
  }
}

init();
