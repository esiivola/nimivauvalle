import { loadContentBlocks } from './content-loader.js';
import { extractFilterQuery, hasFilterQuery, writeFilterQuery } from './state-store.js';

const GA_MEASUREMENT_ID = 'G-88PNGZ7WGM';
const FAVICON_URL = '/favicon.ico';
const SAFARI_MASK_ICON = '/safari-pinned-tab.svg';
const SAFARI_MASK_COLOR = '#ff7d6e';
const APPLE_TOUCH_ICON = '/apple-touch-icon.png';
const THEME_COLOR = '#ff7d6e';
const WEB_MANIFEST = '/site.webmanifest';
const SITE_ORIGIN = 'https://nimivauvalle.fi';

// The full cross-platform icon set. Injected on every page (including the
// generated blog posts) so browsers, iOS/Android home-screen and PWA install
// all resolve an icon. Static copies also live in the page <head>s.
const ICON_LINKS = [
  { rel: 'icon', href: FAVICON_URL, type: 'image/x-icon', sizes: 'any' },
  { rel: 'icon', href: '/favicon-32x32.png', type: 'image/png', sizes: '32x32' },
  { rel: 'icon', href: '/favicon-16x16.png', type: 'image/png', sizes: '16x16' },
  { rel: 'apple-touch-icon', href: APPLE_TOUCH_ICON, sizes: '180x180' },
  { rel: 'mask-icon', href: SAFARI_MASK_ICON, color: SAFARI_MASK_COLOR }
];

function ensureFavicon() {
  const head = document.head;
  if (!head) return;
  ICON_LINKS.forEach((spec) => {
    const selector = spec.sizes
      ? `link[rel="${spec.rel}"][sizes="${spec.sizes}"]`
      : `link[rel="${spec.rel}"]`;
    let link = head.querySelector(selector);
    if (!link) {
      link = document.createElement('link');
      head.appendChild(link);
    }
    link.rel = spec.rel;
    link.href = spec.href;
    if (spec.type) link.type = spec.type;
    if (spec.sizes) link.setAttribute('sizes', spec.sizes);
    if (spec.color) link.setAttribute('color', spec.color);
  });
  if (!head.querySelector('link[rel="manifest"]')) {
    const manifest = document.createElement('link');
    manifest.rel = 'manifest';
    manifest.href = WEB_MANIFEST;
    head.appendChild(manifest);
  }
  if (!head.querySelector('meta[name="theme-color"]')) {
    const theme = document.createElement('meta');
    theme.name = 'theme-color';
    theme.content = THEME_COLOR;
    head.appendChild(theme);
  }
}

function injectAnalyticsTag() {
  if (!GA_MEASUREMENT_ID) return;
  if (!window.dataLayer) {
    window.dataLayer = [];
  }
  if (typeof window.gtag !== 'function') {
    window.gtag = function gtag() {
      window.dataLayer.push(arguments);
    };
    const scriptId = 'ga-measurement-script';
    if (!document.getElementById(scriptId)) {
      const gaScript = document.createElement('script');
      gaScript.async = true;
      gaScript.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
      gaScript.id = scriptId;
      document.head.appendChild(gaScript);
    }
    window.gtag('js', new Date());
  }
  window.gtag('config', GA_MEASUREMENT_ID);
}

function injectSeoMeta() {
  const head = document.head;
  if (!head) return;
  const pageTitle = document.title || 'Nimi vauvalle';
  const pageDesc =
    document
      .querySelector('meta[name="description"]')
      ?.getAttribute('content') ||
    'Älykäs nimikone ja nimilista: etsi vauvalle sopivin nimi.';
  const path = window.location?.pathname || '/';
  const existingCanonical = head.querySelector('link[rel="canonical"]')?.getAttribute('href')?.trim();
  const canonicalUrl = existingCanonical || `${SITE_ORIGIN}${path === '/' ? '/' : path}`;

  const ensureTag = (selector, create) => {
    let el = head.querySelector(selector);
    if (!el) {
      el = create();
      head.appendChild(el);
    }
    return el;
  };

  const canonical = ensureTag('link[rel="canonical"]', () => {
    const link = document.createElement('link');
    link.rel = 'canonical';
    return link;
  });
  canonical.href = canonicalUrl;

  const ogTitle = ensureTag('meta[property="og:title"]', () => {
    const m = document.createElement('meta');
    m.setAttribute('property', 'og:title');
    return m;
  });
  ogTitle.setAttribute('content', pageTitle);

  const ogDesc = ensureTag('meta[property="og:description"]', () => {
    const m = document.createElement('meta');
    m.setAttribute('property', 'og:description');
    return m;
  });
  ogDesc.setAttribute('content', pageDesc);

  const ogType = ensureTag('meta[property="og:type"]', () => {
    const m = document.createElement('meta');
    m.setAttribute('property', 'og:type');
    return m;
  });
  ogType.setAttribute('content', 'website');

  const ogUrl = ensureTag('meta[property="og:url"]', () => {
    const m = document.createElement('meta');
    m.setAttribute('property', 'og:url');
    return m;
  });
  ogUrl.setAttribute('content', canonicalUrl);

  const ogImage = ensureTag('meta[property="og:image"]', () => {
    const m = document.createElement('meta');
    m.setAttribute('property', 'og:image');
    return m;
  });
  ogImage.setAttribute('content', `${SITE_ORIGIN}/assets/og-image.png`);

  [
    ['og:image:width', '1200'],
    ['og:image:height', '630'],
    ['og:image:type', 'image/png'],
    ['og:image:alt', 'Nimi vauvalle']
  ].forEach(([property, content]) => {
    const el = ensureTag(`meta[property="${property}"]`, () => {
      const m = document.createElement('meta');
      m.setAttribute('property', property);
      return m;
    });
    el.setAttribute('content', content);
  });

  const twCard = ensureTag('meta[name="twitter:card"]', () => {
    const m = document.createElement('meta');
    m.setAttribute('name', 'twitter:card');
    return m;
  });
  twCard.setAttribute('content', 'summary_large_image');

  const twTitle = ensureTag('meta[name="twitter:title"]', () => {
    const m = document.createElement('meta');
    m.setAttribute('name', 'twitter:title');
    return m;
  });
  twTitle.setAttribute('content', pageTitle);

  const twDesc = ensureTag('meta[name="twitter:description"]', () => {
    const m = document.createElement('meta');
    m.setAttribute('name', 'twitter:description');
    return m;
  });
  twDesc.setAttribute('content', pageDesc);

  const twImage = ensureTag('meta[name="twitter:image"]', () => {
    const m = document.createElement('meta');
    m.setAttribute('name', 'twitter:image');
    return m;
  });
  twImage.setAttribute('content', `${SITE_ORIGIN}/assets/og-image.png`);

  const twImageAlt = ensureTag('meta[name="twitter:image:alt"]', () => {
    const m = document.createElement('meta');
    m.setAttribute('name', 'twitter:image:alt');
    return m;
  });
  twImageAlt.setAttribute('content', 'Nimi vauvalle');
}

function injectSearchLdJson() {
  const head = document.head;
  if (!head || !window.location) return;
  const scriptId = 'ldjson-website';
  if (head.querySelector(`#${scriptId}`)) return;
  const urlBase = `${SITE_ORIGIN}/`;
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    url: urlBase,
    name: 'Nimi vauvalle',
    potentialAction: {
      '@type': 'SearchAction',
      target: `${SITE_ORIGIN}/?surname={search_term_string}`,
      'query-input': 'required name=search_term_string'
    }
  };
  const script = document.createElement('script');
  script.type = 'application/ld+json';
  script.id = scriptId;
  script.textContent = JSON.stringify(ld);
  head.appendChild(script);
}

injectAnalyticsTag();
ensureFavicon();

let filterLinkBound = false;

function bindFilterQueryLinks() {
  if (filterLinkBound) return;
  filterLinkBound = true;
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target.closest('a[href]');
    if (!link) return;
    if (link.target && link.target !== '_self') return;
    if (link.hasAttribute('download')) return;
    const href = link.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
    let url = null;
    try {
      url = new URL(href, window.location.origin);
    } catch {
      return;
    }
    if (url.origin !== window.location.origin) return;
    const isIndex = url.pathname === '/' || /\/index\.html$/i.test(url.pathname);
    if (!isIndex) return;
    const params = url.searchParams;
    if (!hasFilterQuery(params)) return;
    const filteredQuery = extractFilterQuery(params);
    if (!filteredQuery) return;
    event.preventDefault();
    writeFilterQuery(filteredQuery);
    const targetPath = '/';
    window.location.href = `${targetPath}${url.hash || ''}`;
  });
}

export async function initPageChrome(options = {}) {
  const {
    loadContent = true,
    enhanceArticles = false,
    scrollToHash = false,
    enhanceBlogs = false
  } = options;

  ensureFavicon();
  injectSeoMeta();
  injectSearchLdJson();
  if (loadContent) {
    await loadContentBlocks();
  }

  injectHeaderNav();
  attachSilktideAttribution();
  bindFilterQueryLinks();

  if (enhanceArticles) {
    initArticleStrips();
  }

  if (scrollToHash) {
    scrollToHashTarget();
  }

  if (enhanceBlogs) {
    initBlogStrip();
  }
}

export function injectHeaderNav() {
  const header = document.querySelector('.page-header');
  if (!header) return;
  const navLabel = document.body.dataset.navLabel || 'Etusivulle';
  const navHref = document.body.dataset.navHref || '/';
  let nav = header.querySelector('.page-nav');
  if (!nav) {
    nav = document.createElement('nav');
    nav.className = 'page-nav';
    nav.setAttribute('aria-label', 'Sivunavigaatio');
    header.prepend(nav);
  }
  let navLink = header.querySelector('.favorite-nav');
  if (!navLink) {
    navLink = document.createElement('a');
    navLink.className = 'favorite-nav';
  }
  if (!nav.contains(navLink)) {
    nav.appendChild(navLink);
  }
  navLink.textContent = navLabel;
  navLink.href = navHref;
}

function patchConsentAccessibility(modal) {
  // The third-party consent widget renders its toggle checkboxes without an
  // associated <label>, and its "save" button's aria-label omits the visible
  // text. Supply the missing accessible names here (site-side) rather than
  // editing the vendored library. No-ops if the elements are absent.
  const toggleLabels = {
    'cookies-necessary': 'Välttämättömät evästeet',
    'cookies-analytics': 'Analytiikkaevästeet',
    'cookies-advertising': 'Mainosevästeet',
    'cookies-marketing': 'Markkinointievästeet'
  };
  Object.entries(toggleLabels).forEach(([id, label]) => {
    const input = modal.querySelector(`#${id}`);
    if (input && !input.getAttribute('aria-label')) {
      input.setAttribute('aria-label', label);
    }
  });
  // WCAG "Label in Name": let the visible button text be the accessible name.
  const saveBtn = modal.querySelector('.preferences-save');
  if (saveBtn) saveBtn.removeAttribute('aria-label');
}

export function attachSilktideAttribution() {
  let attempts = 0;
  const timer = setInterval(() => {
    attempts += 1;
    const modal = document.getElementById('silktide-modal');
    if (!modal) {
      if (attempts > 40) {
        clearInterval(timer);
      }
      return;
    }
    patchConsentAccessibility(modal);
    const existing = modal.querySelector('.silktide-attribution');
    if (existing) {
      clearInterval(timer);
      return;
    }
    const privacyLink = modal.querySelector('a[href="/privacy.html"]');
    const targetPara = privacyLink ? privacyLink.closest('p') : modal.querySelector('p');
    if (!targetPara) {
      clearInterval(timer);
      return;
    }
    const link = document.createElement('a');
    link.className = 'silktide-attribution';
    link.href = 'https://silktide.com/consent-manager/';
    link.target = '_blank';
    link.rel = 'noreferrer';
    link.textContent = 'Evästetyökalu: Silktide';
    targetPara.appendChild(document.createTextNode(' '));
    targetPara.appendChild(link);
    clearInterval(timer);
  }, 250);
}

export function initArticleStrips() {
  document.querySelectorAll('.content-block').forEach((block) => {
    const strip = block.querySelector('.article-strip');
    if (!strip) return;
    const prev = block.querySelector('.strip-prev');
    const next = block.querySelector('.strip-next');
    const minScroll = 5;
    const minHoldStep = 5;
    const getScrollAmount = () => {
      const firstCard = strip.querySelector('.article-card');
      const styles = getComputedStyle(strip);
      const gap = parseFloat(styles.columnGap || styles.gap || '0') || 0;
      const stripWidth = strip.getBoundingClientRect().width || 0;
      const cardWidth = firstCard ? firstCard.getBoundingClientRect().width + gap : stripWidth || minScroll;
      const base = Math.max(cardWidth * 0.65, stripWidth * 0.45);
      const capped = stripWidth ? Math.min(base, stripWidth * 0.75) : base;
      return Math.max(minScroll, Math.round(capped));
    };
    const getHoldStep = () => Math.max(minHoldStep, Math.round(getScrollAmount() / 10));
    let holdFrame = null;
    let holdTimer = null;

    const scrollBy = (dir) => {
      strip.scrollLeft = Math.max(0, strip.scrollLeft + dir * getScrollAmount());
    };
    const stepScroll = (dir) => {
      strip.scrollLeft = Math.max(0, strip.scrollLeft + dir * getHoldStep());
      holdFrame = requestAnimationFrame(() => stepScroll(dir));
    };
    const stopHold = () => {
      if (holdFrame) {
        cancelAnimationFrame(holdFrame);
        holdFrame = null;
      }
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
    };
    const startHold = (dir) => {
      stopHold();
      holdTimer = setTimeout(() => {
        holdTimer = null;
        stepScroll(dir);
      }, 140);
    };
    const attachHold = (btn, dir) => {
      if (!btn) return;
      btn.addEventListener('click', () => scrollBy(dir));
      btn.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        stopHold();
        startHold(dir);
      });
      ['pointerup', 'pointerleave', 'pointercancel', 'blur'].forEach((ev) => {
        btn.addEventListener(ev, stopHold);
      });
    };

    attachHold(prev, -1);
    attachHold(next, 1);
  });
}

async function initBlogStrip() {
  const panel = document.getElementById('blog-strip-panel');
  if (panel) {
    panel.open = true;
    panel.addEventListener('toggle', () => {
      if (!panel.open) {
        panel.open = true;
      }
    });
  }
  const strip = document.getElementById('blog-strip-list');
  if (!strip) return;
  strip.innerHTML = '<p class="hint">Ladataan artikkeleja…</p>';
  try {
    const res = await fetch('/artikkelit/index.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('index missing');
    const posts = await res.json();
    strip.innerHTML = '';
    posts.forEach((post) => {
      const card = document.createElement('article');
      card.className = 'article-card';
      card.setAttribute('role', 'listitem');
      const h3 = document.createElement('h3');
      h3.textContent = post.title || post.slug;
      const p = document.createElement('p');
      const desc = post.description || '';
      p.innerHTML = `${desc ? `${desc} ` : ''}<a class="article-cta inline" href="/artikkelit/${post.slug}.html">Lue artikkeli</a>`;
      card.appendChild(h3);
      card.appendChild(p);
      strip.appendChild(card);
    });
    document.dispatchEvent(new CustomEvent('blog-strip-ready'));
  } catch {
    strip.innerHTML = '<p class="hint">Artikkelilistaa ei voitu ladata.</p>';
    document.dispatchEvent(new CustomEvent('blog-strip-ready'));
  }
}

export function scrollToHashTarget() {
  const hash = window.location.hash ? window.location.hash.slice(1) : '';
  if (!hash) return;
  const target = document.getElementById(hash);
  if (!target) return;
  requestAnimationFrame(() => {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}
