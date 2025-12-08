import { loadContentBlocks } from './content-loader.js';

const GA_MEASUREMENT_ID = 'G-88PNGZ7WGM';
const FAVICON_DATA_URL =
  'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🐣</text></svg>';

function ensureFavicon() {
  const head = document.head;
  if (!head) return;
  const existing =
    head.querySelector('link[rel="icon"]') || head.querySelector('link[rel="shortcut icon"]');
  const link = existing || document.createElement('link');
  link.rel = 'icon';
  link.type = 'image/svg+xml';
  link.href = FAVICON_DATA_URL;
  if (!existing) {
    head.appendChild(link);
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

injectAnalyticsTag();

export async function initPageChrome(options = {}) {
  const {
    loadContent = true,
    enhanceArticles = false,
    openArticlesFromQuery = false,
    scrollToHash = false
  } = options;

  ensureFavicon();
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
