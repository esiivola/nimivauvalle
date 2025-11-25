import { createCardShell } from './shared-cards.js';
import { loadDataset } from './data-service.js';
import { createDetailService } from './detail-service.js';
import {
  createAdTracker,
  renderGroupChips,
  renderPhoneticSummary,
  renderUsageChart,
  renderAgeDistributionChart,
  fetchWikiSummary
} from './detail-utils.js';
import {
  FAVORITES_KEY,
  decodeFavoritesParam,
  encodeFavorites,
  loadFavorites,
  saveFavorites
} from './favorites-store.js';

let favorites = new Set();
let activeNames = new Set();
let nameMap = new Map();
let pendingRemovals = new Set();
let schema = null;
let groupMeta = new Map();
let phoneticMeta = new Map();
const DETAIL_AD_FREQUENCY = 3;
let detailService = null;
const detailAds = createAdTracker(DETAIL_AD_FREQUENCY);

async function loadData() {
  const { names, schema: loadedSchema } = await loadDataset();
  schema = loadedSchema;
  nameMap = new Map(names.map((entry) => [entry.name, entry]));
  detailService = createDetailService(schema);
  groupMeta = new Map((schema.groupFeatures || []).map((g) => [g.key, g]));
  phoneticMeta = new Map((schema.phoneticFeatures || []).map((f) => [f.key, f]));
}

function renderFavorites() {
  const list = document.querySelector('#favorites-list');
  const count = document.querySelector('#favorites-count');
  const context = document.querySelector('#favorites-context');
  list.innerHTML = '';
  if (!activeNames.size) {
    count.textContent = 'Ei suosikkeja';
    context.textContent = '';
    list.innerHTML = '<p class="hint">Lisää nimiä suosikeiksi hakusivulta.</p>';
    return;
  }
  const sorted = Array.from(activeNames).sort((a, b) => a.localeCompare(b, 'fi'));
  sorted.forEach((name) => {
    const entry = nameMap.get(name) || { name, display: name, popularity: { total: 0 }, groups: [], phonetic: {} };
    let favBtnRef = null;
    const card = createCardShell(entry, {
      filtered: false,
      isFavorite: () => !pendingRemovals.has(name),
      toggleFavorite: () => {
        if (favBtnRef) togglePendingRemoval(name, card, favBtnRef);
      },
      onFavoriteButton: (btn) => {
        favBtnRef = btn;
      },
      onOpen: (detailsEl, bodyEl) => loadCardDetails(detailsEl, bodyEl, entry)
    });
    if (pendingRemovals.has(name)) {
      card.classList.add('marked-remove');
      if (favBtnRef) {
        favBtnRef.classList.remove('active');
        favBtnRef.textContent = '☆';
        favBtnRef.title = 'Palauta suosikiksi';
      }
    }
    list.appendChild(card);
  });
  count.textContent = `${activeNames.size} suosikkia`;
  context.textContent = pendingRemovals.size
    ? 'Poista punaiseksi muuttuneet tähdet tallentamalla muutokset.'
    : '';
}

function togglePendingRemoval(name, card, btn) {
  if (pendingRemovals.has(name)) {
    pendingRemovals.delete(name);
    card.classList.remove('marked-remove');
    btn.classList.add('active');
    btn.textContent = '★';
    btn.title = 'Poista suosikeista';
  } else {
    pendingRemovals.add(name);
    card.classList.add('marked-remove');
    btn.classList.remove('active');
    btn.textContent = '☆';
    btn.title = 'Palauta suosikiksi';
  }
  updateSaveVisibility();
}

function updateSaveVisibility() {
  const btn = document.querySelector('#save-favorites');
  btn.hidden = pendingRemovals.size === 0;
}

function saveChanges() {
  if (!pendingRemovals.size) return;
  pendingRemovals.forEach((name) => activeNames.delete(name));
  pendingRemovals.clear();
  favorites = new Set(activeNames);
  saveFavorites(favorites, FAVORITES_KEY);
  updateSaveVisibility();
  renderFavorites();
}

function ensureEntryDetails(entry) {
  if (!detailService) return Promise.resolve(entry);
  return detailService.ensureEntryDetails(entry);
}

function createDetailRow(label, content) {
  if (!content) return null;
  const row = document.createElement('div');
  row.className = 'detail-row';
  const labelEl = document.createElement('div');
  labelEl.className = 'detail-label';
  labelEl.textContent = label;
  const contentEl = document.createElement('div');
  contentEl.className = 'detail-content';
  if (typeof content === 'string') {
    contentEl.innerHTML = content;
  } else if (Array.isArray(content)) {
    content.forEach((node) => contentEl.appendChild(node));
  } else if (content instanceof Node) {
    contentEl.appendChild(content);
  }
  row.appendChild(labelEl);
  row.appendChild(contentEl);
  return row;
}

async function loadCardDetails(card, body, entry) {
  body.innerHTML = '<p class="hint">Haetaan nimen tietoja…</p>';
  await ensureEntryDetails(entry);
  body.innerHTML = '';
  const wikiBlock = document.createElement('div');
  wikiBlock.className = 'wiki-summary';
  wikiBlock.dataset.status = 'idle';
  body.appendChild(wikiBlock);

  const details = document.createElement('div');
  details.className = 'details-section';

  const groupsHtml = renderGroupChips(entry, groupMeta, {
    emptyLabel: 'Ei ryhmäjäsenyyksiä',
    labelFor: (meta) => meta?.label || meta?.key,
    describe: (meta) => meta?.description || ''
  });
  const groupRow = createDetailRow('Ryhmäjäsenyydet', groupsHtml);
  if (groupRow) details.appendChild(groupRow);

  const phoneticSummary = renderPhoneticSummary(entry, phoneticMeta, {
    noHighlightsLabel: 'Ei erityisiä piirteitä',
    labelFor: (meta) => meta?.label || meta?.key,
    describe: (meta) => meta?.description || ''
  });
  const phoneticRow = createDetailRow('Äännepiirteet', phoneticSummary);
  if (phoneticRow) details.appendChild(phoneticRow);

  if (shouldShowDetailAd()) {
    const ad = document.createElement('div');
    ad.className = 'ad-slot detail-ad';
    ad.textContent = 'Mainospaikka';
    details.appendChild(ad);
  }

  const historyContent = document.createElement('div');
  historyContent.className = 'chart-shell';
  const historyChart = document.createElement('div');
  historyChart.className = 'plotly-chart';
  historyContent.appendChild(historyChart);
  const historyRow = createDetailRow('Nimen käyttö historiassa', historyContent);
  if (historyRow) {
    historyRow.classList.add('chart-row');
    details.appendChild(historyRow);
  }

  const ageContent = document.createElement('div');
  ageContent.className = 'chart-shell';
  const ageChart = document.createElement('div');
  ageChart.className = 'plotly-chart';
  ageContent.appendChild(ageChart);
  const ageRow = createDetailRow('Ikäjakauma (arvio)', ageContent);
  if (ageRow) {
    ageRow.classList.add('chart-row');
    details.appendChild(ageRow);
  }

  body.appendChild(details);

  const descriptionText = entry.description_fi || '';
  if (descriptionText) {
    const desc = document.createElement('div');
    desc.className = 'description';
    desc.textContent = descriptionText;
    body.appendChild(desc);
  }

  renderUsageChart(historyChart, entry.history, {
    noData: 'Ei historiallista käyttödataa',
    legendMale: 'Miehiä',
    legendFemale: 'Naisia',
    yAxis: 'Nimen käyttö historiassa'
  });
  renderAgeDistributionChart(ageChart, entry.population, entry.popularity?.total, {
    noData: 'Ei ikäjakaumatietoa',
    yAxis: 'Ikäjakauma (arvio)'
  });
  if (wikiBlock) {
    fetchWikiSummary(entry, wikiBlock, {
      loadingText: 'Haetaan Wikipedia-tiivistelmää…',
      unavailableText: 'Wikipedia-artikkelia ei löytynyt',
      title: 'Tietoa Wikipediasta'
    });
  }
}

function shouldShowDetailAd() {
  return detailAds.shouldShow();
}
function decodeActiveNames() {
  const params = new URLSearchParams(window.location.search);
  const shared = decodeFavoritesParam(params.get('f'));
  favorites = loadFavorites(FAVORITES_KEY);
  if (shared.length) {
    activeNames = new Set(shared);
    document.querySelector('#favorites-context').textContent = 'Näytetään jaettu suosikkilista.';
  } else {
    activeNames = new Set(favorites);
  }
}

function shareFavorites() {
  const names = Array.from(activeNames);
  if (!names.length) return;
  const encoded = encodeFavorites(names);
  const url = `${window.location.origin}${window.location.pathname}?f=${encoded}`;
  const input = document.querySelector('#share-url');
  input.value = url;
  input.select();
  document.execCommand('copy');
}

function bindActions() {
  document.querySelector('#save-favorites')?.addEventListener('click', saveChanges);
  document.querySelector('#share-favorites')?.addEventListener('click', shareFavorites);
}

async function init() {
  updateBackLinkFromReferrer();
  decodeActiveNames();
  await loadData();
  bindActions();
  updateSaveVisibility();
  renderFavorites();
}

document.addEventListener('DOMContentLoaded', () => {
  init().catch(() => {
    const list = document.querySelector('#favorites-list');
    if (list) list.innerHTML = '<p class="hint">Suosikkien lataus epäonnistui.</p>';
  });
});

function updateBackLinkFromReferrer() {
  const link = document.querySelector('.favorite-nav');
  if (!link || !document.referrer) return;
  try {
    const refUrl = new URL(document.referrer);
    const sameOrigin = refUrl.origin === window.location.origin;
    const isIndex =
      refUrl.pathname.endsWith('/index.html') ||
      refUrl.pathname === '/' ||
      refUrl.pathname === '';
    if (sameOrigin && isIndex) {
      link.href = `index.html${refUrl.search}`;
    }
  } catch {
    /* ignore malformed referrer */
  }
}
