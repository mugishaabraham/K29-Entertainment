const state = {
  query: '',
  categories: [],
  articles: [],
  popularArticles: []
};

const categoryNav = document.getElementById('categoryNav');
const newsGrid = document.getElementById('newsGrid');
const featured = document.getElementById('featured');
const listTitle = document.getElementById('listTitle');
const resultsMeta = document.getElementById('resultsMeta');
const searchForm = document.getElementById('searchForm');
const searchInput = document.getElementById('searchInput');
const categoryPanel = document.getElementById('categoryPanel');
const categoryToggle = document.getElementById('categoryToggle');
const mostPopularList = document.getElementById('mostPopularList');
const mostPopularPanel = document.getElementById('mostPopularPanel');
const contentSection = document.querySelector('.content');
const sidebarAdPanel = document.querySelector('.sidebar-ad');
const socialPanel = document.querySelector('.social-panel');
const inlineAdPanel = document.querySelector('.inline-ad');
const liveAudioBtn = document.getElementById('liveAudioBtn');
const liveAudioHost = document.getElementById('liveAudioHost');
const DEFAULT_LIVE_AUDIO_URL = 'https://youtu.be/NADT8L-R1Jo?si=XNEOHwZq3reAtd10';
const mobileMostPopularQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(max-width: 720px)') : null;
const mostPopularPlaceholder =
  mostPopularPanel && mostPopularPanel.parentNode ? document.createComment('k29-most-popular-slot') : null;
const sidebarAdPlaceholder =
  sidebarAdPanel && sidebarAdPanel.parentNode ? document.createComment('k29-sidebar-ad-slot') : null;
const socialPanelPlaceholder =
  socialPanel && socialPanel.parentNode ? document.createComment('k29-social-panel-slot') : null;
let popularCarouselTimer = null;

if (mostPopularPlaceholder && mostPopularPanel.parentNode) {
  mostPopularPanel.parentNode.insertBefore(mostPopularPlaceholder, mostPopularPanel);
}
if (sidebarAdPlaceholder && sidebarAdPanel.parentNode) {
  sidebarAdPanel.parentNode.insertBefore(sidebarAdPlaceholder, sidebarAdPanel);
}
if (socialPanelPlaceholder && socialPanel.parentNode) {
  socialPanel.parentNode.insertBefore(socialPanelPlaceholder, socialPanel);
}
const preferredCategoryOrder = ['all', 'entertainment', 'politics', 'music', 'sports', 'religion', 'movies', 'did-you-know'];
const fallbackCategoryMarkup = categoryNav ? categoryNav.innerHTML : '';
const categoryLabelKey = {
  all: 'categoryAll',
  entertainment: 'categoryEntertainment',
  politics: 'categoryPolitics',
  music: 'categoryMusic',
  sports: 'categorySports',
  religion: 'categoryReligion',
  movies: 'categoryMovies',
  'did-you-know': 'categoryDidYouKnow'
};

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

function extractYouTubeVideoId(url) {
  const raw = String(url || '').trim();
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');

    if (host === 'youtu.be') {
      return parsed.pathname.replace(/^\/+/, '').split('/')[0] || '';
    }

    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (parsed.pathname === '/watch') {
        return parsed.searchParams.get('v') || '';
      }
      if (parsed.pathname.startsWith('/shorts/')) {
        return parsed.pathname.split('/')[2] || '';
      }
      if (parsed.pathname.startsWith('/embed/')) {
        return parsed.pathname.split('/')[2] || '';
      }
    }
  } catch {
    return '';
  }

  return '';
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
      // User canceled or share is unavailable for current platform.
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

async function fetchJson(url, options) {
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
      throw new Error('API route not found (404). Deploy with Cloudflare Pages Functions enabled.');
    }
    throw new Error(message);
  }
  return res.json();
}

function getCurrentLanguage() {
  if (window.K29I18N && typeof window.K29I18N.getLanguage === 'function') {
    return window.K29I18N.getLanguage();
  }
  return 'en';
}

function t(key) {
  if (window.K29I18N && typeof window.K29I18N.t === 'function') {
    return window.K29I18N.t(key);
  }
  return key;
}

function getCategoryLabel(category) {
  const key = categoryLabelKey[String(category || '').toLowerCase()];
  if (!key) return category.charAt(0).toUpperCase() + category.slice(1);
  return t(key);
}

function localizeCategoryPanel() {
  const categoriesTitle = document.querySelector('.category-panel-head h2');
  const popularTitle = document.querySelector('.popular-panel h2');
  if (categoriesTitle) categoriesTitle.textContent = t('categoriesTitle');
  if (popularTitle) popularTitle.textContent = t('mostPopular');
  if (listTitle) listTitle.textContent = t('latestNews');
  if (!categoryNav) return;

  categoryNav.querySelectorAll('a.category-link').forEach((link) => {
    let category = '';
    try {
      category = (new URL(link.href, window.location.origin).searchParams.get('category') || '').toLowerCase();
    } catch {
      category = '';
    }
    if (!category) return;
    link.textContent = getCategoryLabel(category);
  });
}

function stopPopularCarousel() {
  if (popularCarouselTimer) {
    window.clearInterval(popularCarouselTimer);
    popularCarouselTimer = null;
  }
}

function renderMostPopular() {
  if (!mostPopularList) return;
  stopPopularCarousel();

  mostPopularList.innerHTML = '';

  if (!state.popularArticles.length) {
    mostPopularList.innerHTML = `<p class="popular-empty">${t('noPopularNews')}</p>`;
    return;
  }

  if (mobileMostPopularQuery && mobileMostPopularQuery.matches) {
    const carousel = document.createElement('div');
    carousel.className = 'popular-carousel';

    const prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'popular-carousel-btn popular-carousel-prev';
    prevBtn.setAttribute('aria-label', 'Previous popular story');
    prevBtn.textContent = '‹';

    const nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'popular-carousel-btn popular-carousel-next';
    nextBtn.setAttribute('aria-label', 'Next popular story');
    nextBtn.textContent = '›';

    const viewport = document.createElement('div');
    viewport.className = 'popular-carousel-viewport';
    const track = document.createElement('div');
    track.className = 'popular-carousel-track';
    viewport.appendChild(track);

    state.popularArticles.forEach((article) => {
      const item = document.createElement('a');
      item.className = 'popular-item popular-slide';
      item.href = `/article.html?id=${article.id}`;
      item.innerHTML = `
        ${article.image ? `<img class="popular-thumb" src="${normalizeImageUrl(article.image)}" alt="${article.title}" loading="lazy" />` : ''}
        <div class="popular-item-body">
          <strong>${article.title}</strong>
          <span>${formatDate(article.date)}</span>
        </div>
      `;
      track.appendChild(item);
    });

    let activeIndex = 0;
    const total = state.popularArticles.length;

    function setSlide(nextIndex) {
      if (!total) return;
      activeIndex = (nextIndex + total) % total;
      track.style.transform = `translateX(-${activeIndex * 100}%)`;
    }

    function startAutoSlide() {
      stopPopularCarousel();
      if (total <= 1) return;
      popularCarouselTimer = window.setInterval(() => {
        setSlide(activeIndex + 1);
      }, 2000);
    }

    prevBtn.addEventListener('click', () => {
      setSlide(activeIndex - 1);
      startAutoSlide();
    });

    nextBtn.addEventListener('click', () => {
      setSlide(activeIndex + 1);
      startAutoSlide();
    });

    let touchStartX = 0;
    viewport.addEventListener('touchstart', (event) => {
      touchStartX = event.changedTouches && event.changedTouches[0] ? event.changedTouches[0].clientX : 0;
    }, { passive: true });
    viewport.addEventListener('touchend', (event) => {
      const touchEndX = event.changedTouches && event.changedTouches[0] ? event.changedTouches[0].clientX : 0;
      const delta = touchStartX - touchEndX;
      if (Math.abs(delta) < 35) return;
      if (delta > 0) {
        setSlide(activeIndex + 1);
      } else {
        setSlide(activeIndex - 1);
      }
      startAutoSlide();
    }, { passive: true });

    carousel.appendChild(prevBtn);
    carousel.appendChild(viewport);
    carousel.appendChild(nextBtn);
    mostPopularList.appendChild(carousel);
    setSlide(0);
    startAutoSlide();
    return;
  }

  state.popularArticles.forEach((article) => {
    const item = document.createElement('a');
    item.className = 'popular-item';
    item.href = `/article.html?id=${article.id}`;
    item.innerHTML = `
      ${article.image ? `<img class="popular-thumb" src="${normalizeImageUrl(article.image)}" alt="${article.title}" loading="lazy" />` : ''}
      <div class="popular-item-body">
        <strong>${article.title}</strong>
        <span>${formatDate(article.date)}</span>
      </div>
    `;
    mostPopularList.appendChild(item);
  });
}

function renderCategories() {
  if (!categoryNav || !state.categories.length) return;
  const existing = new Set(
    [...categoryNav.querySelectorAll('a.category-link')]
      .map((link) => {
        try {
          return (new URL(link.href, window.location.origin).searchParams.get('category') || '').toLowerCase();
        } catch {
          return '';
        }
      })
      .filter(Boolean)
  );

  const sorted = [...state.categories].sort((a, b) => {
    const indexA = preferredCategoryOrder.indexOf(a);
    const indexB = preferredCategoryOrder.indexOf(b);
    const hasA = indexA !== -1;
    const hasB = indexB !== -1;
    if (hasA && hasB) return indexA - indexB;
    if (hasA) return -1;
    if (hasB) return 1;
    return a.localeCompare(b);
  });

  sorted.forEach((category) => {
    if (existing.has(category)) return;
    const link = document.createElement('a');
    link.className = 'category-btn category-link';
    link.href = `/category.html?category=${encodeURIComponent(category)}`;
    link.textContent = getCategoryLabel(category);
    categoryNav.appendChild(link);
  });
}

function renderFeatured(article) {
  if (!article) {
    featured.innerHTML = '<div class="featured-body"><h2>No story found</h2><p>Try another search term.</p></div>';
    return;
  }

  featured.innerHTML = `
    ${article.image ? `<img src="${normalizeImageUrl(article.image)}" alt="${article.title}" loading="lazy" />` : ''}
    <div class="featured-body">
      <p class="kicker">Featured • ${getCategoryLabel(article.category)}</p>
      <h2><a href="/article.html?id=${article.id}">${article.title}</a></h2>
      <p class="meta">${formatDate(article.date)} • ${article.author || 'K29 Desk'}</p>
      <p>${article.summary || ''}</p>
      <div class="card-actions">
        <a class="read-link" href="/article.html?id=${article.id}">Read Full Story</a>
        <button type="button" class="story-action-btn" data-share-story-id="${article.id}" aria-label="Share story" title="Share story">Share</button>
        <a class="story-action-btn" href="/article.html?id=${article.id}#comments" aria-label="Comment on story" title="Comment on story">Comment</a>
      </div>
    </div>
  `;
}

function renderNews() {
  const [first, ...rest] = state.articles;
  renderFeatured(first);

  newsGrid.innerHTML = '';

  if (!rest.length) {
    newsGrid.innerHTML = '<article class="panel card"><div class="card-body"><h3>No additional stories</h3><p>There are no extra stories for this filter yet.</p></div></article>';
    return;
  }

  rest.forEach((article) => {
    const card = document.createElement('article');
    card.className = 'panel card';
    card.innerHTML = `
      ${article.image ? `<img src="${normalizeImageUrl(article.image)}" alt="${article.title}" loading="lazy" />` : ''}
      <div class="card-body">
        <p class="kicker">${getCategoryLabel(article.category)}</p>
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
    newsGrid.appendChild(card);
  });
}

function setupStoryCardActions() {
  function onActionClick(event) {
    const shareBtn = event.target.closest('[data-share-story-id]');
    if (!shareBtn) return;
    event.preventDefault();

    const id = Number(shareBtn.getAttribute('data-share-story-id'));
    if (!id) return;
    const article = state.articles.find((item) => Number(item.id) === id) || state.popularArticles.find((item) => Number(item.id) === id);
    if (!article) return;
    shareStory(article);
  }

  if (featured) featured.addEventListener('click', onActionClick);
  if (newsGrid) newsGrid.addEventListener('click', onActionClick);
}

function setupCategoryToggle() {
  if (!categoryPanel || !categoryToggle || !categoryNav || typeof window.matchMedia !== 'function') return;

  const mobileQuery = window.matchMedia('(max-width: 720px)');

  function updateToggleState() {
    const collapsed = categoryPanel.classList.contains('collapsed');
    categoryToggle.setAttribute('aria-expanded', String(!collapsed));
    categoryToggle.textContent = collapsed ? t('showFilters') : t('hideFilters');
  }

  function syncToViewport() {
    if (mobileQuery.matches) {
      categoryPanel.classList.add('collapsed');
    } else {
      categoryPanel.classList.remove('collapsed');
    }
    updateToggleState();
  }

  categoryToggle.addEventListener('click', () => {
    if (!mobileQuery.matches) return;
    categoryPanel.classList.toggle('collapsed');
    updateToggleState();
  });

  if (typeof mobileQuery.addEventListener === 'function') {
    mobileQuery.addEventListener('change', syncToViewport);
  } else if (typeof mobileQuery.addListener === 'function') {
    mobileQuery.addListener(syncToViewport);
  }

  syncToViewport();
}

function setupMostPopularPlacement() {
  if (!mostPopularPanel || !featured || !contentSection || !mobileMostPopularQuery || !mostPopularPlaceholder) return;

  function syncMostPopularPlacement() {
    if (mobileMostPopularQuery.matches) {
      featured.insertAdjacentElement('afterend', mostPopularPanel);
      if (sidebarAdPanel) {
        mostPopularPanel.insertAdjacentElement('afterend', sidebarAdPanel);
      }
      if (socialPanel && inlineAdPanel) {
        inlineAdPanel.insertAdjacentElement('afterend', socialPanel);
      }
      return;
    }
    if (!mostPopularPlaceholder.parentNode) return;
    mostPopularPlaceholder.parentNode.insertBefore(mostPopularPanel, mostPopularPlaceholder.nextSibling);
    if (sidebarAdPanel && sidebarAdPlaceholder && sidebarAdPlaceholder.parentNode) {
      sidebarAdPlaceholder.parentNode.insertBefore(sidebarAdPanel, sidebarAdPlaceholder.nextSibling);
    }
    if (socialPanel && socialPanelPlaceholder && socialPanelPlaceholder.parentNode) {
      socialPanelPlaceholder.parentNode.insertBefore(socialPanel, socialPanelPlaceholder.nextSibling);
    }
  }

  function handleViewportChange() {
    syncMostPopularPlacement();
    renderMostPopular();
  }

  if (typeof mobileMostPopularQuery.addEventListener === 'function') {
    mobileMostPopularQuery.addEventListener('change', handleViewportChange);
  } else if (typeof mobileMostPopularQuery.addListener === 'function') {
    mobileMostPopularQuery.addListener(handleViewportChange);
  }

  syncMostPopularPlacement();
}

async function loadCategories() {
  try {
    const data = await fetchJson('/api/categories');
    state.categories = Array.isArray(data.categories) ? data.categories : [];
    renderCategories();
  } catch (error) {
    if (categoryNav && !categoryNav.children.length && fallbackCategoryMarkup) {
      categoryNav.innerHTML = fallbackCategoryMarkup;
    }
  }
}

async function loadNews() {
  const params = new URLSearchParams({
    category: 'all',
    q: state.query
  });

  const data = await fetchJson(`/api/news?${params}`);
  state.articles = data.articles;
  listTitle.textContent = t('latestNews');
  resultsMeta.textContent = `${data.count} result${data.count === 1 ? '' : 's'}${state.query ? ` for "${state.query}"` : ''}`;
  renderNews();
}

async function loadMostPopular() {
  const data = await fetchJson('/api/news?category=all&popular=true');
  state.popularArticles = Array.isArray(data.articles) ? data.articles : [];
  renderMostPopular();
}

async function loadSettings() {
  try {
    const data = await fetchJson('/api/settings');
    return {
      liveAudioUrl: String((data && data.liveAudioUrl) || '').trim() || DEFAULT_LIVE_AUDIO_URL
    };
  } catch {
    return { liveAudioUrl: DEFAULT_LIVE_AUDIO_URL };
  }
}

function setupLiveAudio(liveAudioUrl) {
  if (!liveAudioBtn || !liveAudioHost) return;
  const videoId = extractYouTubeVideoId(liveAudioUrl);
  let playing = false;
  let playerIframe = null;

  function sendYouTubeCommand(func, args = []) {
    if (!playerIframe || !playerIframe.contentWindow) return;
    playerIframe.contentWindow.postMessage(
      JSON.stringify({
        event: 'command',
        func,
        args
      }),
      'https://www.youtube.com'
    );
  }

  function stopAudio() {
    // Keep the same player alive so stream time continues; only mute for "off".
    sendYouTubeCommand('mute');
    sendYouTubeCommand('setVolume', [0]);
    playing = false;
    liveAudioBtn.setAttribute('aria-pressed', 'false');
    liveAudioBtn.classList.remove('active');
  }

  function ensurePlayer() {
    if (!videoId || playerIframe) return;
    playerIframe = document.createElement('iframe');
    playerIframe.className = 'live-audio-frame';
    playerIframe.allow = 'autoplay';
    playerIframe.src = `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?autoplay=1&enablejsapi=1&playsinline=1&controls=0&rel=0&modestbranding=1`;
    playerIframe.title = 'Live audio stream';
    liveAudioHost.innerHTML = '';
    liveAudioHost.appendChild(playerIframe);
  }

  function playAudio() {
    if (!videoId) return;
    ensurePlayer();
    sendYouTubeCommand('unMute');
    sendYouTubeCommand('setVolume', [100]);
    sendYouTubeCommand('playVideo');
    playing = true;
    liveAudioBtn.setAttribute('aria-pressed', 'true');
    liveAudioBtn.classList.add('active');
  }

  if (!videoId) {
    liveAudioBtn.disabled = true;
    liveAudioBtn.title = 'No live audio link configured';
    return;
  }

  liveAudioBtn.disabled = false;
  liveAudioBtn.setAttribute('aria-pressed', 'false');
  liveAudioBtn.classList.remove('active');
  liveAudioBtn.title = 'Toggle live audio';
  liveAudioBtn.addEventListener('click', () => {
    if (playing) {
      stopAudio();
    } else {
      playAudio();
    }
  });
}

if (searchForm && searchInput) {
  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    state.query = searchInput.value.trim();
    loadNews();
  });
}

async function init() {
  try {
    setupStoryCardActions();
    setupCategoryToggle();
    setupMostPopularPlacement();
    localizeCategoryPanel();
    const settings = await loadSettings();
    setupLiveAudio(settings.liveAudioUrl);
    await loadCategories();
    localizeCategoryPanel();
    await loadNews();
    await loadMostPopular();
    window.addEventListener('k29:languagechange', () => {
      localizeCategoryPanel();
      renderMostPopular();
      if (categoryToggle && categoryPanel && window.matchMedia('(max-width: 720px)').matches) {
        const collapsed = categoryPanel.classList.contains('collapsed');
        categoryToggle.textContent = collapsed ? t('showFilters') : t('hideFilters');
      }
      if (listTitle) listTitle.textContent = t('latestNews');
    });
  } catch (error) {
    newsGrid.innerHTML = `<article class="panel card"><div class="card-body"><h3>Unable to load news</h3><p>${error.message}</p></div></article>`;
  }
}

init();
