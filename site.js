import { loadContentBlocks } from './content-loader.js';

const GA_MEASUREMENT_ID = 'G-88PNGZ7WGM';
const FAVICON_URL = '/favicon.ico';
const SAFARI_MASK_ICON = '/safari-pinned-tab.svg';
const SAFARI_MASK_COLOR = '#ff7d6e';
const SITE_ORIGIN = 'https://nimivauvalle.fi';

function ensureFavicon() {
  const head = document.head;
  if (!head) return;
  const iconLink =
    head.querySelector('link[rel="icon"]') || head.querySelector('link[rel="shortcut icon"]');
  const favicon = iconLink || document.createElement('link');
  favicon.rel = 'icon';
  favicon.type = 'image/x-icon';
  favicon.href = FAVICON_URL;
  favicon.setAttribute('sizes', 'any');
  if (!iconLink) head.appendChild(favicon);

  const maskLink = head.querySelector('link[rel="mask-icon"]') || document.createElement('link');
  maskLink.rel = 'mask-icon';
  maskLink.href = SAFARI_MASK_ICON;
  maskLink.setAttribute('color', SAFARI_MASK_COLOR);
  if (!maskLink.parentNode) head.appendChild(maskLink);
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
  const canonicalUrl = `${SITE_ORIGIN}${path === '/' ? '/' : path}`;

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

export async function initPageChrome(options = {}) {
  const {
    loadContent = true,
    enhanceArticles = false,
    openArticlesFromQuery = false,
    scrollToHash = false
  } = options;

  ensureFavicon();
  injectSeoMeta();
  injectSearchLdJson();
  if (loadContent) {
    await loadContentBlocks();
  }

  injectHeaderNav();
  attachSilktideAttribution();

  if (enhanceArticles) {
    initArticleStrips();
  }

  if (openArticlesFromQuery) {
    openArticlesPanelFromQuery();
  }

  if (scrollToHash) {
    scrollToHashTarget();
  }
}

export function injectHeaderNav() {
  const header = document.querySelector('.page-header');
  if (!header) return;
  const navLabel = document.body.dataset.navLabel || 'Takaisin hakuun';
  const navHref = document.body.dataset.navHref || '/';
  let navLink = header.querySelector('.favorite-nav');
  if (!navLink) {
    navLink = document.createElement('a');
    navLink.className = 'ghost favorite-nav';
    header.prepend(navLink);
  }
  navLink.textContent = navLabel;
  navLink.href = navHref;
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
    const baseScroll = 260;
    const minHoldStep = 20;
    const getScrollAmount = () => {
      const firstCard = strip.querySelector('.article-card');
      const styles = getComputedStyle(strip);
      const gap =
        parseFloat(styles.columnGap || styles.gap || '0') || 0;
      const cardWidth = firstCard
        ? firstCard.getBoundingClientRect().width + gap
        : 0;
      const stripWidth = strip.getBoundingClientRect().width;
      if (window.matchMedia('(max-width: 640px)').matches) {
        return Math.max(cardWidth, stripWidth, baseScroll);
      }
      return Math.max(cardWidth || stripWidth, baseScroll);
    };
    const getHoldStep = () => Math.max(minHoldStep, Math.round(getScrollAmount() / 10));
    let holdFrame = null;

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
    };
    const attachHold = (btn, dir) => {
      if (!btn) return;
      btn.addEventListener('click', () => scrollBy(dir));
      btn.addEventListener('pointerdown', (event) => {
        event.preventDefault();
        stopHold();
        stepScroll(dir);
      });
      ['pointerup', 'pointerleave', 'pointercancel', 'blur'].forEach((ev) => {
        btn.addEventListener(ev, stopHold);
      });
    };

    attachHold(prev, -1);
    attachHold(next, 1);
  });
}

export function openArticlesPanelFromQuery() {
  const panel = document.getElementById('articles-strip-panel');
  if (!panel) return;
  const params = new URLSearchParams(window.location.search);
  if (!params.has('openArticles')) {
    panel.removeAttribute('open');
    return;
  }
  params.delete('openArticles');
  const query = params.toString();
  const newUrl = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
  history.replaceState(null, '', newUrl);
  panel.setAttribute('open', '');
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
