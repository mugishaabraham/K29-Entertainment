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

function readCategory() {
  const params = new URLSearchParams(window.location.search);
  return (params.get('category') || 'all').toLowerCase();
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
        <p class="kicker">${article.category}</p>
        <h3><a href="/article.html?id=${article.id}">${article.title}</a></h3>
        <p class="meta">${formatDate(article.date)} • ${article.author || 'K29 Desk'}</p>
        <p>${article.summary || ''}</p>
        <a class="read-link" href="/article.html?id=${article.id}">Read Full Story</a>
      </div>
    `;
    categoryGrid.appendChild(card);
  });
}

async function init() {
  try {
    const category = readCategory();
    categoryTitle.textContent = category === 'all' ? 'All Categories' : `${category} News`;

    const data = await fetchJson(`/api/news?category=${encodeURIComponent(category)}`);
    resultsMeta.textContent = `${data.count} stor${data.count === 1 ? 'y' : 'ies'}`;
    renderCards(data.articles);
  } catch (error) {
    categoryGrid.innerHTML = `<article class="panel card"><div class="card-body"><h3>Error</h3><p>${error.message}</p></div></article>`;
  }
}

init();
