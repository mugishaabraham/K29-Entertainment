function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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

function summarizeArticle(article) {
  const summary = String((article && article.summary) || '').trim();
  if (summary) return summary.slice(0, 220);
  const content = String((article && article.content) || '').replace(/\s+/g, ' ').trim();
  return content ? content.slice(0, 220) : 'Latest stories from K29 Entertainment.';
}

function buildMeta(url, article, id) {
  const pageUrl = new URL(`/article.html?id=${encodeURIComponent(String(id))}`, url.origin).toString();
  const imageCandidate = normalizeArticleImageUrl(article.image || '');
  const imageUrl = new URL(imageCandidate || '/logo.jpeg', url.origin).toString();
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

function injectMeta(html, meta) {
  const safeTitle = `<title>${escapeHtml(meta.title)}</title>`;
  let output = html.replace(/<title>[\s\S]*?<\/title>/i, safeTitle);
  if (output === html) {
    output = output.replace(/<head[^>]*>/i, (match) => `${match}\n    ${safeTitle}`);
  }
  return output.replace(/<\/head>/i, `    ${meta.tags}\n  </head>`);
}

async function loadBaseArticleHtml(context, url) {
  if (!context.env || !context.env.ASSETS) return null;
  const req = new Request(new URL('/article.html', url.origin).toString(), {
    method: 'GET',
    headers: context.request.headers
  });
  return context.env.ASSETS.fetch(req);
}

async function fetchArticle(context, url, id) {
  const apiUrl = new URL(`/api/news/${encodeURIComponent(String(id))}`, url.origin).toString();
  const response = await fetch(apiUrl, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'K29-Meta-Builder/1.0'
    }
  });
  if (!response.ok) return null;
  return response.json();
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const id = Number(url.searchParams.get('id'));

  const assetResponse = await loadBaseArticleHtml(context, url);
  if (!assetResponse) {
    return new Response('Static asset binding is not available.', { status: 500 });
  }

  if (!Number.isFinite(id) || id <= 0) {
    return assetResponse;
  }

  let article = null;
  try {
    article = await fetchArticle(context, url, id);
  } catch {
    article = null;
  }

  if (!article || !article.title) {
    return assetResponse;
  }

  const html = await assetResponse.text();
  const meta = buildMeta(url, article, id);
  const output = injectMeta(html, meta);

  const headers = new Headers(assetResponse.headers);
  headers.set('Content-Type', 'text/html; charset=utf-8');
  headers.set('Cache-Control', 'no-store, max-age=0');
  return new Response(output, {
    status: assetResponse.status,
    headers
  });
}
