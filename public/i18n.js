(function () {
  const STORAGE_KEY = 'k29_language';
  const FALLBACK_LANG = 'en';

  const messages = {
    en: {
      brandTitle: 'K29 Entertainment',
      clockLabel: 'Kigali Time',
      selectTimezone: 'Select timezone',
      languageLabel: 'Language',
      selectLanguage: 'Select language',
      langEnglish: 'English',
      langKinyarwanda: 'Kinyarwanda',
      home: 'Home',
      allCategories: 'All Categories',
      adminPanel: 'Admin Panel',
      searchPlaceholder: 'Search headlines and stories...',
      searchButton: 'Search',
      categoryFeed: 'Category news feed',
      storyPage: 'Full story page',
      adminPanelTitle: 'K29 Admin Panel',
      adminPanelSubtitle: 'Publish and manage stories, images, and optional video links',
      logout: 'Logout',
      adminAccessTitle: 'K29 Admin Access',
      adminAccessSubtitle: 'Authorized access only',
      categoriesTitle: 'Categories',
      showFilters: 'Show Filters',
      hideFilters: 'Hide Filters',
      categoryAll: 'All',
      categoryEntertainment: 'Entertainment',
      categoryPolitics: 'Politics',
      categoryMusic: 'Music',
      categorySports: 'Sports',
      categoryReligion: 'Religion',
      categoryMovies: 'Movies',
      categoryDidYouKnow: 'Did You Know',
      latestNews: 'Latest News',
      mostPopular: 'Most Popular',
      noPopularNews: 'No popular stories selected yet.'
    },
    rw: {
      brandTitle: 'K29 Entertainment',
      clockLabel: 'Igihe cya Kigali',
      selectTimezone: 'Hitamo isaha yaho uri',
      languageLabel: 'Ururimi',
      selectLanguage: 'Hitamo ururimi',
      langEnglish: 'Icyongereza',
      langKinyarwanda: 'Ikinyarwanda',
      home: 'Ahabanza',
      allCategories: 'Ibyiciro byose',
      adminPanel: 'Aho Ubuyobozi',
      searchPlaceholder: 'Shakisha imitwe n\'inkuru...',
      searchButton: 'Shakisha',
      categoryFeed: 'Amakuru y\'ibyiciro',
      storyPage: 'Urupapuro rw\'inkuru yose',
      adminPanelTitle: 'K29 Ubuyobozi',
      adminPanelSubtitle: 'Tangaza kandi ucunge inkuru, amafoto n\'amahitamo ya videwo',
      logout: 'Sohoka',
      adminAccessTitle: 'K29 Kwinjira kwa Admin',
      adminAccessSubtitle: 'Abemerewe gusa',
      categoriesTitle: 'Ibyiciro',
      showFilters: 'Erekana ibyiciro',
      hideFilters: 'Hisha ibyiciro',
      categoryAll: 'Byose',
      categoryEntertainment: 'Imyidagaduro',
      categoryPolitics: 'Politiki',
      categoryMusic: 'Umuziki',
      categorySports: 'Siporo',
      categoryReligion: 'Iyobokamana',
      categoryMovies: 'Filime',
      categoryDidYouKnow: 'Wari ubizi',
      latestNews: 'Amakuru agezweho',
      mostPopular: 'Izikunzwe Cyane',
      noPopularNews: 'Nta nkuru zatoranyijwe nk\'izikunzwe cyane.'
    }
  };

  function getPreferredLanguage() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && messages[saved]) return saved;
    const browserLang = String((navigator.language || '')).toLowerCase();
    if (browserLang.startsWith('rw')) return 'rw';
    return FALLBACK_LANG;
  }

  function translate(lang) {
    const table = messages[lang] || messages[FALLBACK_LANG];

    document.querySelectorAll('[data-i18n]').forEach((node) => {
      const key = node.getAttribute('data-i18n');
      if (!key || !table[key]) return;
      node.textContent = table[key];
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach((node) => {
      const key = node.getAttribute('data-i18n-placeholder');
      if (!key || !table[key]) return;
      node.setAttribute('placeholder', table[key]);
    });

    document.querySelectorAll('[data-i18n-aria-label]').forEach((node) => {
      const key = node.getAttribute('data-i18n-aria-label');
      if (!key || !table[key]) return;
      node.setAttribute('aria-label', table[key]);
    });
  }

  function getActiveLanguage() {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved && messages[saved] ? saved : getPreferredLanguage();
  }

  function t(key, lang) {
    const active = messages[lang] ? lang : getActiveLanguage();
    return (messages[active] && messages[active][key]) || (messages[FALLBACK_LANG] && messages[FALLBACK_LANG][key]) || key;
  }

  function initLanguageSwitcher() {
    const select = document.getElementById('languageSelect');
    const language = getPreferredLanguage();

    document.documentElement.lang = language === 'rw' ? 'rw' : 'en';
    translate(language);

    if (!select) return;
    select.value = language;

    select.addEventListener('change', () => {
      const selected = messages[select.value] ? select.value : FALLBACK_LANG;
      localStorage.setItem(STORAGE_KEY, selected);
      document.documentElement.lang = selected === 'rw' ? 'rw' : 'en';
      translate(selected);
      window.dispatchEvent(new CustomEvent('k29:languagechange', { detail: { language: selected } }));
    });
  }

  window.K29I18N = {
    t,
    getLanguage: getActiveLanguage
  };

  initLanguageSwitcher();
})();
