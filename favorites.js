import { createCardShell } from './shared-cards.js';
import { loadDataset } from './data-service.js';
import { createDetailService } from './detail-service.js';
import { loadMatchingModel, computePairScore as computeModelPairScore } from './matching-model.js';
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
import {
  buildSurnameData,
  annotateMatches as annotateSurnameMatches,
  findSurname,
  formatSurnameUsage
} from './surname-service.js';
import { registerAdSlots, setAdSlotsEnabled } from './ad-service.js';
import MATCH_WEIGHT_FIELDS from './weight-fields.js';
import {
  computeAbsoluteWeightBudget,
  formatPercentNumber,
  normalizeWeightMap,
  percentToWeight,
  persistSharedWeights,
  readSharedWeights,
  weightToPercent
} from './weight-utils.js';

let favorites = new Set();
let activeNames = new Set();
let nameMap = new Map();
let surnameMap = new Map();
let surnameRankMap = new Map();
let pendingRemovals = new Set();
let schema = null;
let groupMeta = new Map();
let phoneticMeta = new Map();
const DETAIL_AD_FREQUENCY = 3;
let detailService = null;
const detailAds = createAdTracker(DETAIL_AD_FREQUENCY);
let sortKey = 'match';
let sortDir = 'desc';
let periodRanks = new Map();
let metricKeys = new Set();
let surnameValue = '';
let matchingModel = null;
let defaultMatchWeights = {};
let currentMatchWeights = {};
let weightModal = null;
let weightEditorInputs = [];
let weightPercentBudget = 1;
const WEIGHT_SUM_TOLERANCE = 0.05;
const FAVORITES_T = {
  matchLabel: 'Sukunimi-osuvuus',
  comboTag: (count) => `Täyskaimoja: ~${count}`,
  surnameMissing: (label) => `Sukunimeä “${label}” ei löytynyt aineistosta - vertailu ohitetaan.`,
  surnameMatch: (label) => (label ? `Sukunimi on “${label}”` : '')
};
const surnameUsageBuilder = (count, rank) => `Sukunimeä käyttää ${count} henkilöä ja se on ${rank}:s yleisin.`;

async function loadData() {
  const { names, surnames, schema: loadedSchema } = await loadDataset({ includeSurnames: true });
  schema = loadedSchema;
  nameMap = new Map(names.map((entry) => [entry.name, entry]));
  const surnameData = buildSurnameData(surnames);
  surnameMap = surnameData.map;
  surnameRankMap = surnameData.rankMap;
  detailService = createDetailService(schema);
  groupMeta = new Map((schema.groupFeatures || []).map((g) => [g.key, g]));
  phoneticMeta = new Map((schema.phoneticFeatures || []).map((f) => [f.key, f]));
  metricKeys = new Set((schema.metrics || []).map((m) => m.key));
  defaultMatchWeights = normalizeWeightMap((schema.matching && schema.matching.weights) || {});
  weightPercentBudget = computeAbsoluteWeightBudget(defaultMatchWeights);
  currentMatchWeights = { ...defaultMatchWeights };
  const shared = readSharedWeights();
  if (shared) {
    currentMatchWeights = { ...shared };
  }
  weightPercentBudget = computeAbsoluteWeightBudget(currentMatchWeights) || weightPercentBudget;
  matchingModel = await loadMatchingModel();
  periodRanks = new Map();
  (schema.sorting || [])
    .filter((option) => option.period)
    .forEach((option) => {
      periodRanks.set(option.key, option.period);
    });
  buildSortOptions();
}

function renderFavorites() {
  const list = document.querySelector('#favorites-list');
  const count = document.querySelector('#favorites-count');
  const context = document.querySelector('#favorites-context');
  setAdSlotsEnabled('favorites', activeNames.size > 0);
  list.innerHTML = '';
  if (!activeNames.size) {
    count.textContent = 'Ei suosikkeja';
    context.textContent = '';
    list.innerHTML = '<p class="hint">Lisää nimiä suosikeiksi hakusivulta.</p>';
    return;
  }
  const entries = Array.from(activeNames).map(
    (name) =>
      nameMap.get(name) || { name, display: name, popularity: { total: 0 }, groups: [], phonetic: {}, metrics: {} }
  );
  const surnameEntry = annotateMatches(entries);
  const missingSurname = Boolean(surnameValue && !surnameEntry);
  updateSurnameAnalysis(surnameEntry, missingSurname);
  updateMatchContext(surnameEntry, missingSurname);
  const sorted = sortEntries(entries);
  sorted.forEach((entry) => {
    const name = entry.name;
    const fullEntry = nameMap.get(name) || entry;
    let favBtnRef = null;
    const card = createCardShell(fullEntry, {
      filtered: false,
      t: FAVORITES_T,
      surnameEntry,
      isFavorite: () => !pendingRemovals.has(name),
      toggleFavorite: () => {
        if (favBtnRef) togglePendingRemoval(name, card, favBtnRef);
      },
      onFavoriteButton: (btn) => {
        favBtnRef = btn;
      },
      onOpen: (detailsEl, bodyEl) => loadCardDetails(detailsEl, bodyEl, fullEntry)
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

function formatNumber(value) {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function renderWeightList(prefillMap) {
  const container = document.querySelector('#favorites-weight-list');
  if (!container) return;
  container.innerHTML = '';
  weightEditorInputs = [];
  MATCH_WEIGHT_FIELDS.forEach((meta) => {
    const key = meta.key;
    const row = document.createElement('div');
    row.className = 'weight-row';
    const header = document.createElement('div');
    header.className = 'weight-row-header';

    const legend = document.createElement('div');
    const labelEl = document.createElement('div');
    labelEl.className = 'weight-row-label';
    labelEl.textContent = meta?.label || key.replace(/_/g, ' ');
    legend.appendChild(labelEl);
    const descEl = document.createElement('p');
    descEl.className = 'weight-row-description';
    descEl.textContent = meta?.description || '';
    legend.appendChild(descEl);
    header.appendChild(legend);

    const inputWrap = document.createElement('div');
    inputWrap.className = 'weight-row-input';
    const inputEl = document.createElement('input');
    inputEl.type = 'number';
    inputEl.min = '-100';
    inputEl.max = '100';
    inputEl.step = '5';
    inputEl.inputMode = 'numeric';
    inputEl.dataset.key = key;
    const valueString =
      prefillMap && prefillMap.has(key)
        ? prefillMap.get(key)
        : formatPercentNumber(weightToPercent(currentMatchWeights[key] ?? defaultMatchWeights[key] ?? 0, weightPercentBudget));
    inputEl.value = valueString;
    inputEl.addEventListener('input', updateWeightStatus);
    inputWrap.appendChild(inputEl);
    const suffix = document.createElement('span');
    suffix.textContent = '%';
    inputWrap.appendChild(suffix);
    header.appendChild(inputWrap);
    row.appendChild(header);
    container.appendChild(row);
    weightEditorInputs.push({ key, input: inputEl, row });
    const numeric = Number.parseFloat(valueString);
    if (Number.isFinite(numeric) && numeric < 0) {
      const note = document.createElement('p');
      note.className = 'weight-row-note';
      note.textContent = 'Negatiivinen paino vähentää pisteitä.';
      row.appendChild(note);
    }
  });
  updateWeightStatus();
}

function updateWeightStatus() {
  let total = 0;
  let hasInvalid = false;
  weightEditorInputs.forEach((item) => {
    const value = Number.parseFloat(item.input.value);
    if (!Number.isFinite(value)) {
      hasInvalid = true;
      item.input.classList.add('invalid');
      return;
    }
    item.input.classList.remove('invalid');
    total += Math.abs(value);
  });
  total = Math.round(total * 10) / 10;
  const balance = Math.round((100 - total) * 10) / 10;
  const totalEl = document.querySelector('#favorites-weight-total');
  const remainingEl = document.querySelector('#favorites-weight-remaining');
  const errEl = document.querySelector('#favorites-weight-error');
  if (totalEl) totalEl.textContent = `Yhteensä ${total.toFixed(1)}% / 100%`;
  if (remainingEl) {
    remainingEl.textContent =
      balance > 0 ? `${balance.toFixed(1)}% jäljellä` : balance < 0 ? `${Math.abs(balance).toFixed(1)}% yli` : 'Tasapainossa';
  }
  let error = '';
  const needsAdjustment = Math.abs(balance) > WEIGHT_SUM_TOLERANCE;
  if (hasInvalid) {
    error = 'Täytä jokainen kenttä.';
  } else if (needsAdjustment) {
    error = 'Painojen itseisarvojen summan tulee olla 100 %.';
  }
  if (errEl) errEl.textContent = error;
  const saveBtn = document.querySelector('#favorites-weight-save');
  if (saveBtn) saveBtn.disabled = hasInvalid || needsAdjustment;
}

function openWeightModal() {
  weightModal = document.querySelector('#favorites-weight-editor');
  if (!weightModal) return;
  // ensure we have a usable base set before rendering
  if (!Object.keys(currentMatchWeights || {}).length) {
    currentMatchWeights = { ...defaultMatchWeights };
  }
  const prefill = new Map(weightEditorInputs.map((item) => [item.key, item.input.value]));
  renderWeightList(prefill);
  weightModal.hidden = false;
  document.body.classList.add('modal-open');
}

function closeWeightModal() {
  if (!weightModal) return;
  weightModal.hidden = true;
  document.body.classList.remove('modal-open');
}

function saveWeights() {
  if (!weightModal) return;
  const updated = { ...defaultMatchWeights };
  weightEditorInputs.forEach((item) => {
    const value = Number.parseFloat(item.input.value);
    if (!Number.isFinite(value)) return;
    updated[item.key] = percentToWeight(value, weightPercentBudget);
  });
  const normalized = normalizeWeightMap(updated);
  currentMatchWeights = normalized;
  weightPercentBudget = computeAbsoluteWeightBudget(normalized) || 1;
  persistSharedWeights(currentMatchWeights, defaultMatchWeights);
  closeWeightModal();
  renderFavorites();
}

function resetWeights() {
  weightPercentBudget = computeAbsoluteWeightBudget(defaultMatchWeights);
  currentMatchWeights = { ...defaultMatchWeights };
  renderWeightList();
  updateWeightStatus();
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
  if (phoneticSummary) {
    const phoneticRow = createDetailRow('Äännepiirteet', phoneticSummary);
    if (phoneticRow) details.appendChild(phoneticRow);
  }

  if (shouldShowDetailAd()) {
    const ad = document.createElement('div');
    ad.className = 'ad-slot detail-ad';
    ad.textContent = 'Mainospaikka';
    ad.hidden = true;
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
  // Affiliate link piilotettuna oletuksena; näytettävissä vain kun kumppani on käytössä
  const affiliateLink = document.createElement('a');
  affiliateLink.className = 'affiliate-link';
  affiliateLink.href = '#';
  affiliateLink.textContent = 'Tilaa vauvan nimellä varustettu body';
  affiliateLink.target = '_blank';
  affiliateLink.rel = 'noopener';
  affiliateLink.hidden = true;
  body.appendChild(affiliateLink);

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
  const surnameParam = params.get('surname');
  if (surnameParam) {
    surnameValue = surnameParam.trim();
    const input = document.querySelector('#favorites-surname');
    if (input) input.value = surnameValue;
  }
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
  const surnameInput = document.querySelector('#favorites-surname');
  const surname = (surnameInput?.value || '').trim();
  const params = new URLSearchParams();
  params.set('f', encoded);
  if (surname) {
    params.set('surname', surname);
  }
  const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
  const input = document.querySelector('#share-url');
  input.value = url;
  input.select();
  document.execCommand('copy');
}

function buildSortOptions() {
  const select = document.querySelector('#favorites-sort-key');
  const toggle = document.querySelector('#favorites-toggle-sort');
  if (!select || !toggle) return;
  select.innerHTML = '';
  const options = schema?.sorting || [];
  options.forEach((opt) => {
    const option = document.createElement('option');
    option.value = opt.key;
    option.textContent = opt.label || opt.key;
    select.appendChild(option);
  });
  if (!sortKey && options.length) {
    sortKey = options[0].key;
  }
  select.value = sortKey;
  select.addEventListener('change', () => {
    sortKey = select.value;
    renderFavorites();
  });
  toggle.addEventListener('click', () => {
    sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    toggle.textContent = sortDir === 'asc' ? '↑' : '↓';
    renderFavorites();
  });
  toggle.textContent = sortDir === 'asc' ? '↑' : '↓';
}

function getSurnameEntry() {
  return findSurname(surnameMap, surnameValue);
}

function annotateMatches(entries) {
  const surnameEntry = getSurnameEntry();
  annotateSurnameMatches(entries, surnameEntry, currentMatchWeights, matchingModel);
  return surnameEntry;
}

function updateSurnameAnalysis(entry, missingSurname) {
  const container = document.querySelector('#favorites-surname-analysis');
  if (!container) return;
  const surname = (surnameValue || '').trim();
  if (!surname) {
    container.textContent = '';
    return;
  }
  if (missingSurname || !entry) {
    container.textContent = 'Sukunimeä ei löytynyt.';
    return;
  }
  const usageText = formatSurnameUsage(entry, surnameRankMap, surnameUsageBuilder);
  container.textContent = usageText || '';
}

function updateMatchContext(entry, missingSurname) {
  const contextEl = document.querySelector('#favorites-match-context');
  if (!contextEl) return;
  const surname = (surnameValue || '').trim();
  if (!surname) {
    contextEl.textContent = '';
    return;
  }
  const label = surname || entry?.display || entry?.name || '';
  contextEl.textContent = missingSurname
    ? FAVORITES_T.surnameMissing(label)
    : FAVORITES_T.surnameMatch(label);
}

function sortEntries(entries) {
  const dir = sortDir === 'asc' ? 1 : -1;
  const useMatch = Boolean(surnameValue && surnameValue.trim()) && sortKey === 'match';
  const activeSortKey = useMatch ? 'match' : sortKey === 'match' ? 'popularity' : sortKey;
  const copy = [...entries];
  copy.sort((a, b) => {
    const aVal = getSortValue(a);
    const bVal = getSortValue(b);
    if (aVal === bVal) {
      return (a.display || a.name || '').localeCompare(b.display || b.name || '', 'fi');
    }
    return aVal > bVal ? dir : -dir;
  });
  return copy;

  function getSortValue(entry) {
    if (activeSortKey === 'alpha') {
      return entry.display || entry.name || '';
    }
    if (activeSortKey === 'popularity') {
      return entry.popularity?.total ?? 0;
    }
    if (activeSortKey === 'match') {
      return entry._match ?? 0;
    }
    if (periodRanks.has(activeSortKey)) {
      const period = periodRanks.get(activeSortKey);
      const countValue = getPeriodCountValue(entry, period);
      if (countValue != null) {
        return countValue;
      }
      return getPeriodRankValue(entry, period);
    }
    if (metricKeys.has(activeSortKey)) {
      return entry.metrics?.[activeSortKey] ?? 0;
    }
    if (activeSortKey.endsWith('_intensity')) {
      const base = activeSortKey.replace('_intensity', '');
      return entry.phonetic?.[base]?.intensity ?? 0;
    }
    return 0;
  }
}

function getPeriodRankValue(entry, period) {
  const ranks = entry.historyRanks;
  if (!ranks) return 0;
  const value = ranks[period];
  if (!Number.isFinite(value) || value <= 0) return 0;
  return -value;
}

function getPeriodCountValue(entry, period) {
  const countsMap = entry.historyCounts;
  if (!countsMap) return null;
  const value = countsMap[period];
  if (value == null || Number.isNaN(value)) return null;
  return Number(value);
}

function bindActions() {
  document.querySelector('#save-favorites')?.addEventListener('click', saveChanges);
  document.querySelector('#share-favorites')?.addEventListener('click', shareFavorites);
  const surnameInput = document.querySelector('#favorites-surname');
  surnameInput?.addEventListener('input', (e) => {
    surnameValue = (e.target.value || '').trim();
    const entry = getSurnameEntry();
    const missing = Boolean(surnameValue && !entry);
    updateSurnameAnalysis(entry, missing);
    updateMatchContext(entry, missing);
    renderFavorites();
  });
  document.querySelector('#favorites-open-weight')?.addEventListener('click', openWeightModal);
  document.querySelectorAll('[data-action="dismiss-fav-weight"]').forEach((el) =>
    el.addEventListener('click', closeWeightModal)
  );
  document.querySelector('#favorites-weight-save')?.addEventListener('click', saveWeights);
  document.querySelector('[data-action="favorites-reset-weight"]')?.addEventListener('click', resetWeights);
  document.querySelector('#favorites-weight-editor .modal-backdrop')?.addEventListener('click', closeWeightModal);
}

async function init() {
  updateBackLinkFromReferrer();
  decodeActiveNames();
  await loadData();
  registerAdSlots('favorites', ['.ad-rail']);
  setAdSlotsEnabled('favorites', false);
  bindActions();
  updateSaveVisibility();
  renderFavorites();
}

document.addEventListener('DOMContentLoaded', () => {
  init().catch(() => {
    const list = document.querySelector('#favorites-list');
    if (list) list.innerHTML = '<p class="hint">Suosikkien lataus epäonnistui.</p>';
    setAdSlotsEnabled('favorites', false);
  });

  // Fallback: ensure weight editor opens even if earlier binding fails
  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('#favorites-open-weight');
    if (trigger) {
      event.preventDefault();
      openWeightModal();
    }
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
