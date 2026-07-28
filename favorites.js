import { createCardShell } from './shared-cards.js';
import { loadDataset } from './data-service.js';
import { createDetailService } from './detail-service.js';
import { loadMatchingModel } from './matching-model.js';
import { createAdTracker } from './detail-utils.js';
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
  buildSurnameMatchContext,
  formatSurnameUsage,
  resolveSurnameEntry
} from './surname-service.js';
import { registerAdSlots, setAdSlotsEnabled } from './ad-service.js';
import {
  computeAbsoluteWeightBudget,
  normalizeWeightMap,
  persistSharedWeights,
  readSharedWeights
} from './weight-utils.js';
import { createCardDetailLoader } from './name-detail-renderer.js';
import { readFilterQuery, writeFilterQuery } from './state-store.js';
import {
  DEFAULT_GENDERS,
  createGenderFieldset,
  getSelectedGenders,
  normalizeGenderSelection
} from './gender-filter.js';
import { buildPeriodRanks, createSortComparator } from './sort-service.js';
import { createWeightEditor } from './weight-editor.js';

let favorites = new Set();
let activeNames = new Set();
let nameMap = new Map();
let surnameMap = new Map();
let surnameEntries = [];
let surnameRankMap = new Map();
let pendingRemovals = new Set();
let schema = null;
let groupMeta = new Map();
let phoneticMeta = new Map();
const DETAIL_AD_FREQUENCY = 3;
let detailService = null;
const detailAds = createAdTracker(DETAIL_AD_FREQUENCY);
let detailLoader = null;
let sortKey = 'match';
let sortDir = 'desc';
let periodRanks = new Map();
let metricKeys = new Set();
let surnameValue = '';
let matchingModel = null;
let defaultMatchWeights = {};
let currentMatchWeights = {};
let weightEditor = null;
let weightPercentBudget = 1;
const WEIGHT_SUM_TOLERANCE = 0.05;
let genderFilterContainer = null;
let selectedGenders = new Set(DEFAULT_GENDERS);
let showGenderFilter = false;
const FAVORITES_T = {
  matchLabel: 'Sukunimiosuvuus',
  comboTag: (count) => `Täyskaimoja: ~${count}`,
  surnameMissing: (label) => `Sukunimeä “${label}” ei löytynyt aineistosta - vertailu ohitetaan.`,
  surnameMatch: (label) => (label ? `Sukunimi on “${label}”` : '')
};
const FAVORITES_DETAIL_T = {
  detailsLoading: 'Haetaan nimen tietoja…',
  detailsError: 'Tietojen lataus epäonnistui.',
  traitsTitle: 'Ominaisuudet',
  historyTitle: 'Nimen suosio historiassa',
  historyLegendMale: 'Miehiä',
  historyLegendFemale: 'Naisia',
  historyYAxis: 'Nimen suosio historiassa',
  historyNoData: 'Ei historiallista käyttödataa',
  ageDistributionTitle: 'Ikäjakauma (arvio)',
  ageDistributionNoData: 'Ei ikäjakaumatietoa',
  ageDistributionYAxis: 'Ikäjakauma (arvio)',
  wikiTitle: 'Tietoa nimestä',
  wikiLoading: 'Haetaan Wikipedia-tiivistelmää…',
  wikiUnavailable: 'Wikipedia-artikkelia ei löytynyt'
};
const surnameUsageBuilder = (count, rank) => `Sukunimeä käyttää ${count} henkilöä ja se on ${rank}:s yleisin.`;

async function loadData() {
  const { names, surnames, schema: loadedSchema } = await loadDataset({
    includeSurnames: true,
    paths: {
      firstNames: '/data/first-names.json',
      lastNames: '/data/last-names.json',
      schema: '/data/schema.json'
    }
  });
  schema = loadedSchema;
  nameMap = new Map(names.map((entry) => [entry.name, entry]));
  const surnameData = buildSurnameData(surnames);
  surnameMap = surnameData.map;
  surnameRankMap = surnameData.rankMap;
  surnameEntries = surnames || [];
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
  periodRanks = buildPeriodRanks(schema);
  detailLoader = createCardDetailLoader({
    ensureEntryDetails: (entry) => detailService.ensureEntryDetails(entry),
    groupMeta,
    phoneticMeta,
    t: FAVORITES_DETAIL_T,
    shouldShowAd: () => detailAds.shouldShow()
  });
  buildSortOptions();
}

function initGenderFilter() {
  const container = document.querySelector('#favorites-gender-filter');
  if (!container) return;
  container.innerHTML = '';
  const fieldset = createGenderFieldset({ selected: selectedGenders });
  fieldset.addEventListener('change', () => {
    selectedGenders = normalizeGenderSelection(getSelectedGenders(fieldset));
    renderFavorites();
  });
  container.appendChild(fieldset);
  genderFilterContainer = container;
}

function getGenderCategories(entries) {
  const categories = new Set();
  entries.forEach((entry) => {
    const gender = String(entry?.gender || '').toLowerCase();
    if (DEFAULT_GENDERS.includes(gender)) {
      categories.add(gender);
    }
  });
  return categories;
}

function updateGenderFilter(entries) {
  if (!genderFilterContainer) {
    showGenderFilter = false;
    return;
  }
  const categories = getGenderCategories(entries);
  showGenderFilter = categories.size > 1;
  genderFilterContainer.hidden = !showGenderFilter;
  genderFilterContainer.setAttribute('aria-hidden', showGenderFilter ? 'false' : 'true');
  selectedGenders = normalizeGenderSelection(selectedGenders);
}

function matchesGenderFilter(entry) {
  const gender = String(entry?.gender || '').toLowerCase();
  if (!gender || gender === 'unknown') return true;
  return selectedGenders.has(gender);
}

function renderFavorites() {
  const list = document.querySelector('#favorites-list');
  const count = document.querySelector('#favorites-count');
  const context = document.querySelector('#favorites-context');
  setAdSlotsEnabled('favorites', activeNames.size > 0);
  list.innerHTML = '';
  const hasFavorites = activeNames.size > 0;
  if (!hasFavorites) {
    const shareInput = document.querySelector('#share-url');
    if (shareInput) shareInput.value = '';
  }
  const entries = hasFavorites
    ? Array.from(activeNames).map(
        (name) =>
          nameMap.get(name) || {
            name,
            display: name,
            popularity: { total: 0 },
            groups: [],
            phonetic: {},
            metrics: {}
          }
      )
    : [];
  updateGenderFilter(entries);
  const visibleEntries = entries.filter(matchesGenderFilter);
  const matchContext = getSurnameMatchContext();
  const surnameResolution = matchContext.resolution;
  const matchSurnameEntry = hasFavorites ? annotateMatches(visibleEntries, matchContext) : surnameResolution.matchEntry;
  const missingSurname = Boolean(surnameValue && !matchSurnameEntry);
  updateSurnameAnalysis(surnameResolution);
  updateMatchContext(matchSurnameEntry, missingSurname);
  if (!hasFavorites) {
    count.textContent = 'Ei suosikkeja';
    context.textContent = '';
    list.innerHTML = '<p class="hint">Lisää nimiä suosikeiksi hakusivulta.</p>';
    return;
  }
  const sorted = sortEntries(visibleEntries);
  sorted.forEach((entry) => {
    const name = entry.name;
    const fullEntry = nameMap.get(name) || entry;
    let favBtnRef = null;
    const card = createCardShell(fullEntry, {
      filtered: false,
      t: FAVORITES_T,
      surnameEntry: matchSurnameEntry,
      isFavorite: () => !pendingRemovals.has(name),
      toggleFavorite: () => {
        if (favBtnRef) togglePendingRemoval(name, card, favBtnRef);
      },
      onFavoriteButton: (btn) => {
        favBtnRef = btn;
      },
      onOpen: (detailsEl, bodyEl) => detailLoader?.(detailsEl, bodyEl, fullEntry)
    });
    if (pendingRemovals.has(name)) {
      card.classList.add('marked-remove');
      if (favBtnRef) {
        favBtnRef.classList.remove('active');
        favBtnRef.textContent = '♥';
        const label = 'Palauta suosikiksi';
        favBtnRef.title = label;
        favBtnRef.setAttribute('aria-label', label);
        favBtnRef.setAttribute('aria-pressed', 'false');
      }
    }
    list.appendChild(card);
  });
  const totalLabel = `${entries.length} suosikkia`;
  count.textContent =
    visibleEntries.length !== entries.length
      ? `${visibleEntries.length} / ${entries.length} suosikkia`
      : totalLabel;
  context.textContent = pendingRemovals.size
    ? 'Poista punaiseksi muuttuneet sydämet tallentamalla muutokset.'
    : '';
}

function togglePendingRemoval(name, card, btn) {
  if (pendingRemovals.has(name)) {
    pendingRemovals.delete(name);
    card.classList.remove('marked-remove');
    btn.classList.add('active');
    btn.textContent = '♥';
    const label = 'Poista suosikeista';
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.setAttribute('aria-pressed', 'true');
  } else {
    pendingRemovals.add(name);
    card.classList.add('marked-remove');
    btn.classList.remove('active');
    btn.textContent = '♥';
    const label = 'Palauta suosikiksi';
    btn.title = label;
    btn.setAttribute('aria-label', label);
    btn.setAttribute('aria-pressed', 'false');
  }
  updateSaveVisibility();
}

function updateSaveVisibility() {
  const btn = document.querySelector('#save-favorites');
  btn.hidden = pendingRemovals.size === 0;
}

function initWeightEditor() {
  const modal = document.querySelector('#favorites-weight-editor');
  if (!modal) return;
  weightEditor = createWeightEditor({
    refs: {
      modal,
      list: document.querySelector('#favorites-weight-list'),
      total: document.querySelector('#favorites-weight-total'),
      remaining: document.querySelector('#favorites-weight-remaining'),
      error: document.querySelector('#favorites-weight-error'),
      save: document.querySelector('#favorites-weight-save')
    },
    tolerance: WEIGHT_SUM_TOLERANCE,
    getWeights: () => ({ ...defaultMatchWeights, ...currentMatchWeights }),
    getBudget: () => weightPercentBudget,
    strings: {
      totalText: (total) => `Yhteensä ${total.toFixed(1)}% / 100%`,
      balanceText: (balance) =>
        balance > 0
          ? `${balance.toFixed(1)}% jäljellä`
          : balance < 0
            ? `${Math.abs(balance).toFixed(1)}% yli`
            : 'Tasapainossa',
      invalidText: 'Täytä jokainen kenttä.',
      absRequirementText: 'Painojen itseisarvojen summan tulee olla 100 %.',
      penaltyNote: 'Negatiivinen paino vähentää pisteitä.'
    },
    beforeOpen: () => {
      if (!Object.keys(currentMatchWeights || {}).length) {
        currentMatchWeights = { ...defaultMatchWeights };
      }
    },
    getOpenPrefill: () => new Map(weightEditor.getInputs().map((item) => [item.key, item.input.value])),
    onClose: () => document.body.classList.remove('modal-open'),
    getApplyBase: () => ({ ...defaultMatchWeights }),
    onApply: (normalized) => {
      currentMatchWeights = normalized;
      weightPercentBudget = computeAbsoluteWeightBudget(normalized) || 1;
      persistSharedWeights(currentMatchWeights, defaultMatchWeights);
      weightEditor.close();
      renderFavorites();
    }
  });
  document.querySelector('#favorites-open-weight')?.addEventListener('click', () => weightEditor.open());
  document.querySelectorAll('[data-action="dismiss-fav-weight"]').forEach((el) =>
    el.addEventListener('click', () => weightEditor.close())
  );
  document.querySelector('#favorites-weight-save')?.addEventListener('click', () => weightEditor.applyChanges());
  document.querySelector('[data-action="favorites-reset-weight"]')?.addEventListener('click', () => {
    weightPercentBudget = computeAbsoluteWeightBudget(defaultMatchWeights);
    currentMatchWeights = { ...defaultMatchWeights };
    weightEditor.render();
  });
  document.querySelector('#favorites-weight-editor .modal-backdrop')?.addEventListener('click', () => weightEditor.close());
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

function persistSurnameToFilterQuery() {
  const params = new URLSearchParams(readFilterQuery());
  const surname = (surnameValue || '').trim();
  if (surname) {
    params.set('surname', surname);
  } else {
    params.delete('surname');
  }
  writeFilterQuery(params.toString());
}

function decodeActiveNames() {
  const params = new URLSearchParams(window.location.search);
  const shared = decodeFavoritesParam(params.get('f'));
  let surnameParam = params.get('surname');
  if (!surnameParam) {
    const storedQuery = readFilterQuery();
    if (storedQuery) {
      surnameParam = new URLSearchParams(storedQuery).get('surname');
    }
  }
  if (surnameParam) {
    surnameValue = surnameParam.trim();
    const input = document.querySelector('#favorites-surname');
    if (input) input.value = surnameValue;
  }
  persistSurnameToFilterQuery();
  favorites = loadFavorites(FAVORITES_KEY);
  if (shared.length) {
    activeNames = new Set(shared);
    document.querySelector('#favorites-context').textContent = 'Näytetään jaettu suosikkilista.';
  } else {
    activeNames = new Set(favorites);
  }
}


function shareFavorites() {
  const input = document.querySelector('#share-url');
  if (!input) return;
  const names = Array.from(activeNames);
  if (!names.length) {
    input.value = '';
    return;
  }
  const encoded = encodeFavorites(names);
  const surnameInput = document.querySelector('#favorites-surname');
  const surname = (surnameInput?.value || '').trim();
  const params = new URLSearchParams();
  params.set('f', encoded);
  if (surname) {
    params.set('surname', surname);
  }
  const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
  input.value = url;
  input.select();
  document.execCommand('copy');
}

function updateSortToggleButton(toggle) {
  if (!toggle) return;
  const isAsc = sortDir === 'asc';
  const label = isAsc ? 'Järjestys: nouseva' : 'Järjestys: laskeva';
  toggle.textContent = isAsc ? '↑' : '↓';
  toggle.setAttribute('aria-label', label);
  toggle.setAttribute('aria-pressed', isAsc ? 'false' : 'true');
  toggle.title = label;
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
    updateSortToggleButton(toggle);
    renderFavorites();
  });
  updateSortToggleButton(toggle);
}

function getSurnameMatchContext() {
  return buildSurnameMatchContext(surnameEntries, surnameMap, surnameValue);
}

function annotateMatches(entries, matchContext) {
  annotateSurnameMatches(entries, matchContext, currentMatchWeights, matchingModel);
  return matchContext?.resolution?.matchEntry || null;
}

function updateSurnameAnalysis(resolution = null) {
  const container = document.querySelector('#favorites-surname-analysis');
  if (!container) return;
  const surname = (surnameValue || '').trim();
  if (!surname) {
    container.textContent = '';
    return;
  }
  const resolved = resolution || resolveSurnameEntry(surnameMap, surname);
  const { dataEntry, matchEntry, isProxy } = resolved || {};
  if (!matchEntry) {
    container.textContent = '';
    return;
  }
  container.innerHTML = '';
  const span = document.createElement('span');
  span.className = 'surname-usage';
  if (isProxy) {
    span.textContent = 'Sukunimeä käyttää alle 20 henkilöä.';
  } else {
    const usageText = formatSurnameUsage(dataEntry, surnameRankMap, surnameUsageBuilder);
    if (!usageText) {
      container.textContent = '';
      return;
    }
    span.textContent = usageText;
  }
  container.appendChild(span);
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
  copy.sort(createSortComparator({ activeSortKey, dir, periodRanks, metricKeys }));
  return copy;
}

function bindActions() {
  document.querySelector('#save-favorites')?.addEventListener('click', saveChanges);
  document.querySelector('#share-favorites')?.addEventListener('click', shareFavorites);
  const surnameInput = document.querySelector('#favorites-surname');
  surnameInput?.addEventListener('input', (e) => {
    surnameValue = (e.target.value || '').trim();
    const matchContext = getSurnameMatchContext();
    const resolution = matchContext.resolution;
    const missing = Boolean(surnameValue && !resolution.matchEntry);
    updateSurnameAnalysis(resolution);
    updateMatchContext(resolution.matchEntry, missing);
    persistSurnameToFilterQuery();
    renderFavorites();
  });
  initWeightEditor();
}

async function init() {
  decodeActiveNames();
  await loadData();
  initGenderFilter();
  const initialContext = getSurnameMatchContext();
  const initialResolution = initialContext.resolution;
  const initialMissing = Boolean(surnameValue && !initialResolution.matchEntry);
  updateSurnameAnalysis(initialResolution);
  updateMatchContext(initialResolution.matchEntry, initialMissing);
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
    if (trigger && weightEditor) {
      event.preventDefault();
      weightEditor.open();
    }
  });
});
