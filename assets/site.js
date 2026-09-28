// Chtholly-Boss tutorials: language + theme switches, code highlighting.
// The <head> of every page sets data-lang / data-theme before first paint;
// this file wires the buttons and keeps them in sync.
(function () {
  const root = document.documentElement;

  function store(key, value) {
    try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch (e) { /* storage unavailable */ }
  }

  // ----- language -----
  function setLang(lang) {
    root.dataset.lang = lang;
    root.lang = lang === 'zh' ? 'zh-CN' : 'en';
    const zhTitle = root.dataset.titleZh, enTitle = root.dataset.titleEn;
    if (zhTitle && enTitle) document.title = lang === 'zh' ? zhTitle : enTitle;
    document.querySelectorAll('[data-set-lang]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.setLang === lang));
    });
    store('tut-lang', lang);
  }

  // ----- theme: auto -> light -> dark -> auto -----
  const themeOrder = ['auto', 'light', 'dark'];
  const themeLabel = {
    auto: { en: 'Theme: auto', zh: '主题：自动' },
    light: { en: 'Theme: light', zh: '主题：浅色' },
    dark: { en: 'Theme: dark', zh: '主题：深色' }
  };
  function currentTheme() { return root.dataset.theme || 'auto'; }
  function paintThemeButton() {
    const t = currentTheme();
    document.querySelectorAll('[data-theme-cycle]').forEach(function (b) {
      b.querySelectorAll('[data-l]').forEach(function (s) { s.textContent = themeLabel[t][s.dataset.l]; });
    });
  }
  function setTheme(t) {
    if (t === 'auto') delete root.dataset.theme; else root.dataset.theme = t;
    store('tut-theme', t === 'auto' ? null : t);
    paintThemeButton();
  }

  document.addEventListener('click', function (e) {
    const langBtn = e.target.closest('[data-set-lang]');
    if (langBtn) { setLang(langBtn.dataset.setLang); return; }
    const themeBtn = e.target.closest('[data-theme-cycle]');
    if (themeBtn) {
      const next = themeOrder[(themeOrder.indexOf(currentTheme()) + 1) % themeOrder.length];
      setTheme(next);
    }
  });

  setLang(root.dataset.lang || 'en');
  paintThemeButton();

  // ----- code highlighting -----
  if (window.hljs) {
    document.querySelectorAll('pre code[class*="language-"]').forEach(function (el) {
      window.hljs.highlightElement(el);
    });
  }
})();
