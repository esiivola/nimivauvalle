import { loadDataset, loadSurnames } from './data-service.js';
import { createDetailService } from './detail-service.js';
import { createAdTracker } from './detail-utils.js';
import { FAVORITES_KEY, loadFavorites, saveFavorites } from './favorites-store.js';
import { loadMatchingModel } from './matching-model.js';
import { registerAdSlots, setAdSlotsEnabled } from './ad-service.js';
import {
  buildSurnameData,
  buildSurnameMatchContext,
  computeWeightedMatchScore,
  resolveSurnameEntry,
  formatSurnameUsage
} from './surname-service.js';
import { createCardDetailLoader } from './name-detail-renderer.js';
import {
  areWeightsEqual,
  computeAbsoluteWeightBudget,
  normalizeWeightMap,
  parseWeightOverrides,
  persistSharedWeights,
  readSharedWeights,
  serializeWeightOverrides
} from './weight-utils.js';
import {
  DEFAULT_GENDERS,
  ensureGenderFilter,
  getGenderInputs,
  getSelectedGenders,
  normalizeGenderSelection,
  setSelectedGenders
} from './gender-filter.js';
import {
  readFilterQuery,
  writeFilterQuery
} from './state-store.js';
import { buildPeriodRanks, createSortComparator } from './sort-service.js';
import { buildSurnameTraitSentences } from './surname-analysis.js';
import { createWeightEditor } from './weight-editor.js';
import {
  PAGE_SIZE,
  WEIGHT_SUM_TOLERANCE,
  DETAIL_AD_FREQUENCY,
  SCROLL_FLAG_KEY,
  sortDescriptions
} from './search/constants.js';
import { translations } from './search/strings.js';
import {
  normalizeGroupKey,
  parseTriToken,
  normalizeLetterFilter,
  parseLetterTokens,
  normalizeRangeValues
} from './search/filter-tokens.js';
import { createFilters } from './search/filters.js';
import { createResults } from './search/results.js';
import { createFilterUI } from './search/filter-ui.js';

const state = {
  genders: new Set(DEFAULT_GENDERS),
  surname: '',
  includeLettersInput: '',
  excludeLettersInput: '',
  letterRange: { min: 1, max: 20 },
  populationRange: { min: 0, max: 45000 },
  popularityFilters: [],
  phoneticFilters: [],
  groupFilters: [],
  sortKey: 'match',
  sortDir: 'desc',
  visibleCount: PAGE_SIZE,
  showFiltered: true,
  matchInfo: { surnameEntry: null, missingSurname: false },
  weightOverrides: null
};

let filterId = 0;
let groupFilterId = 0;
let data = null;
let surnameMap = new Map();
let surnameRankMap = new Map();
let surnamesReady = false;
let surnamesPromise = null;
let phoneticMeta = new Map();
let groupMeta = new Map();
let groupFilterKeys = [];
let gradeMeta = [];
let currentResults = [];
let filteredOutResults = [];
let orderedResults = [];
let matchingModel = null;
let detailService = null;
let cardDetailLoader = null;
let filters = null;
let results = null;
let filterUi = null;
const LETTER_LIMITS = { min: 1, max: 20 };
const POPULATION_LIMITS = { min: 0, max: 45000 };
let populationBaseEstimate = 5600000;
let lettersRangeControl = null;
let favorites = new Set();
let surnameInputTimer = null;
let autoApplyTimer = null;
let weightPercentBudget = 1;
let weightEditor = null;
let defaultMatchingWeights = null;
const getFilteredCount = () => (Array.isArray(currentResults) ? currentResults.length : 0);

const detailAds = createAdTracker(DETAIL_AD_FREQUENCY);
let filterFeatureMeta = [];
const expandedFilteredBlocks = new Set();
let surnameExplainModal = null;
let hasScrolledToResults = false;
let pendingResultsScroll = false;
let resultsScrollRetryTimer = null;
let resultsScrollCleanupTimer = null;

const $ = (sel) => document.querySelector(sel);

function getTypedSurname() {
  return (state.surname || '').trim();
}

function preserveScroll(element, { edgePadding = 120 } = {}) {
  if (!element || !element.isConnected) return () => {};
  const rect = element.getBoundingClientRect();
  if (element.hidden || (!rect.width && !rect.height)) return () => {};
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  const isNearViewport = rect.bottom >= -edgePadding && rect.top <= viewportHeight + edgePadding;
  if (!isNearViewport) return () => {};
  const prevTop = rect.top;
  return () => {
    requestAnimationFrame(() => {
      if (!element.isConnected || element.hidden) return;
      const newRect = element.getBoundingClientRect();
      if (!newRect.width && !newRect.height) return;
      window.scrollBy({ top: newRect.top - prevTop });
    });
  };
}

function isRangeFilterActive() {
  const includeActive = parseLetterTokens(state.includeLettersInput).length > 0;
  const excludeActive = parseLetterTokens(state.excludeLettersInput).length > 0;
  const letterRangeActive =
    state.letterRange.min > LETTER_LIMITS.min || state.letterRange.max < LETTER_LIMITS.max;
  return includeActive || excludeActive || letterRangeActive;
}

function setPanelOpen(panelId, shouldOpen) {
  const panel = document.getElementById(panelId);
  if (!panel) return;
  if (shouldOpen) {
    panel.setAttribute('open', '');
  } else {
    panel.removeAttribute('open');
  }
}

function clearResultsScrollTimers() {
  if (resultsScrollRetryTimer) {
    clearTimeout(resultsScrollRetryTimer);
    resultsScrollRetryTimer = null;
  }
  if (resultsScrollCleanupTimer) {
    clearTimeout(resultsScrollCleanupTimer);
    resultsScrollCleanupTimer = null;
  }
}

function updateFilterPanels() {
  const hasTraitFilters = state.groupFilters.length > 0 || state.phoneticFilters.length > 0;
  const hasRangeFilters = isRangeFilterActive();
  const hasPopularity = state.popularityFilters.length > 0;
  setPanelOpen('extra-filter-panel', hasTraitFilters || hasRangeFilters || hasPopularity);
}

async function loadData() {
  const [dataset, model] = await Promise.all([
    loadDataset({ includeSurnames: false }),
    loadMatchingModel()
  ]);
  const totalPop = Number(dataset?.populationTotal || 0);
  if (Number.isFinite(totalPop) && totalPop > 0) {
    populationBaseEstimate = totalPop;
  }
  matchingModel = model;
  if (!state.weightOverrides) {
    const shared = readSharedWeights();
    if (shared) state.weightOverrides = shared;
  }
  return dataset;
}

// last-names.json (~1 MB gzip / ~9 MB parsed) powers only the surname-match
// feature, so it is loaded on demand — on idle after first paint and when the
// surname field is used — instead of blocking the initial render. Until it
// arrives, surnameMap is empty and surname matching simply degrades gracefully.
function ensureSurnames() {
  if (surnamesReady) return Promise.resolve();
  if (surnamesPromise) return surnamesPromise;
  surnamesPromise = loadSurnames()
    .then((surnames) => {
      data.surnames = surnames;
      const surnameData = buildSurnameData(surnames);
      surnameMap = surnameData.map;
      surnameRankMap = surnameData.rankMap;
      surnamesReady = true;
      // A surname may already be typed or restored from a shared link —
      // recompute its analysis and the match scores now that data is present.
      if (getTypedSurname()) {
        updateSurnameAnalysis(resolveSurnameEntry(surnameMap, getTypedSurname()));
        applyFilters();
      }
    })
    .catch(() => {
      surnamesPromise = null;
    });
  return surnamesPromise;
}

function prefetchSurnames() {
  const start = () => ensureSurnames();
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(start, { timeout: 3000 });
  } else {
    setTimeout(start, 1200);
  }
}

function initSelects() {
  const sortSelect = $('#sort-key');
  sortSelect.innerHTML = '';
  (data.schema.sorting || []).forEach((opt) => {
    const option = document.createElement('option');
    option.value = opt.key;
    option.textContent = opt.label;
    option.dataset.sortKey = opt.key;
    if (opt.description) {
      option.dataset.descriptionFi = opt.description;
    }
    sortSelect.appendChild(option);
  });
  if (!state.sortKey && sortSelect.options.length) {
    state.sortKey = sortSelect.options[0].value;
  }
  updateSortOptionTooltips();
}

function updateSortOptionTooltips() {
  const sortSelect = $('#sort-key');
  if (!sortSelect) return;
  const descriptions = sortDescriptions || {};
  Array.from(sortSelect.options).forEach((option) => {
    const datasetDescription = option.dataset.descriptionFi;
    option.title = datasetDescription || descriptions[option.value] || '';
  });
  const selected = sortSelect.selectedOptions[0];
  if (selected) {
    sortSelect.title = selected.title;
  }
}

function buildMetaMaps() {
  phoneticMeta = new Map(data.schema.phoneticFeatures.map((f) => [f.key, f]));
  const filteredGroups = data.schema.groupFeatures || [];
  groupMeta = new Map(filteredGroups.map((g) => [g.key, g]));
  groupFilterKeys = filteredGroups
    .filter(
      (group) =>
        !String(group.key || '').startsWith('popular_') &&
        !String(group.key || '').startsWith('trend_')
    )
    .map((g) => g.key);
  gradeMeta = data.schema.intensityGrades || [];
  const surnameData = buildSurnameData(data.surnames || []);
  surnameMap = surnameData.map;
  surnameRankMap = surnameData.rankMap;
  detailService = createDetailService(data.schema);
  cardDetailLoader = createCardDetailLoader({
    ensureEntryDetails: (entry) => detailService.ensureEntryDetails(entry),
    groupMeta,
    phoneticMeta,
    t: translations.fi,
    shouldShowAd: shouldShowDetailAd,
    buildHistoryLabel: (entry) => createHistoryLabel(entry, translations.fi)
  });
  filterFeatureMeta = data.schema.filterFeatures || [];
  filters = createFilters({
    state,
    $,
    limits: { letter: LETTER_LIMITS, population: POPULATION_LIMITS },
    applyFilters,
    updatePopulationInputs,
    setLetterRangeValues: (min, max) => lettersRangeControl?.setValues(min, max),
    getGroupMeta: () => groupMeta,
    getPhoneticMeta: () => phoneticMeta,
    getGroupLabel,
    getFeatureLabel,
    formatPopularityLabel
  });
  results = createResults({
    state,
    $,
    getOrderedResults: () => orderedResults,
    getCurrentResults: () => currentResults,
    expandedFilteredBlocks,
    getCardDetailLoader: () => cardDetailLoader,
    isFavorite: isFavoriteName,
    toggleFavorite: toggleFavoriteName,
    renderActiveFilters,
    getTypedSurname
  });
  filterUi = createFilterUI({
    $,
    state,
    preserveScroll,
    updateFilterPanels,
    scheduleApplyFilters,
    getFilterFeatureMeta: () => filterFeatureMeta,
    getGroupMeta: () => groupMeta,
    getPhoneticMeta: () => phoneticMeta,
    getGroupFilterKeys: () => groupFilterKeys,
    getFirstPhoneticKey: () => data.schema.phoneticFeatures[0]?.key,
    getGroupLabel,
    getFeatureLabel,
    getGroupDescription,
    getFeatureDescriptionByMeta,
    getPopularityKeys,
    getPopularityOptions,
    getPeriodLabel,
    nextFilterId,
    nextGroupFilterId
  });
}

function isFavoriteName(name) {
  return favorites.has(name);
}







function showFavoriteTip(anchor) {
  const anchorEl = anchor instanceof Element ? anchor : document.querySelector('.favorite-nav');
  const host = document.body;
  if (!host) return;
  if (anchorEl && anchorEl.closest('.favorite-tip')) return;
  if (document.querySelector('.favorite-tip')) return;

  const tip = document.createElement('div');
  tip.className = 'favorite-tip';
  tip.setAttribute('role', 'status');
  tip.setAttribute('aria-live', 'polite');
  tip.setAttribute('aria-atomic', 'true');

  const text = document.createElement('span');
  text.className = 'favorite-tip-text';
  text.textContent =
    'Sydän-ikoni lisää nimen omiin suosikkeihin. Näet kaikki suosikkisi ja voit luoda jaettavan linkin suosikkilistallesi sivuston oikean ylälaidan linkistä.';

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'favorite-tip-close';
  closeBtn.setAttribute('aria-label', 'Sulje');
  closeBtn.textContent = '×';

  tip.appendChild(text);
  tip.appendChild(closeBtn);
  tip.style.visibility = 'hidden';
  host.appendChild(tip);

  const positionTip = () => {
    const margin = 12;
    const anchorRect = anchorEl ? anchorEl.getBoundingClientRect() : null;
    const tipRect = tip.getBoundingClientRect();
    if (!anchorRect) {
      tip.style.left = '50%';
      tip.style.top = `${margin}px`;
      tip.style.transform = 'translateX(-50%)';
      tip.style.setProperty('--tip-arrow-left', '50%');
      return;
    }
    let left = anchorRect.left;
    left = Math.max(margin, Math.min(left, window.innerWidth - tipRect.width - margin));
    let top = anchorRect.bottom + 10;
    if (top + tipRect.height > window.innerHeight - margin) {
      top = anchorRect.top - tipRect.height - 10;
    }
    top = Math.max(margin, Math.min(top, window.innerHeight - tipRect.height - margin));
    const arrowLeft = Math.min(
      Math.max(anchorRect.left + anchorRect.width / 2 - left, 12),
      tipRect.width - 12
    );
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
    tip.style.transform = '';
    tip.style.setProperty('--tip-arrow-left', `${arrowLeft}px`);
  };

  positionTip();
  tip.style.visibility = 'visible';

  const closeTip = () => {
    tip.remove();
    window.removeEventListener('resize', positionTip);
    window.removeEventListener('scroll', positionTip, true);
    document.removeEventListener('click', handleOutsideClick, true);
  };

  const handleOutsideClick = (event) => {
    if (!tip.contains(event.target)) {
      closeTip();
    }
  };

  closeBtn.addEventListener('click', (event) => {
    event.preventDefault();
    closeTip();
  });

  window.addEventListener('resize', positionTip);
  window.addEventListener('scroll', positionTip, true);
  setTimeout(() => {
    document.addEventListener('click', handleOutsideClick, true);
  }, 0);
}



function toggleFavoriteName(entry, event) {
  if (!entry?.name) return;
  const key = entry.name;
  const wasFavorite = favorites.has(key);
  if (wasFavorite) {
    favorites.delete(key);
  } else {
    favorites.add(key);
  }
  saveFavorites(favorites, FAVORITES_KEY);
  if (!wasFavorite && favorites.size === 1) {
    const anchor = event?.currentTarget instanceof Element ? event.currentTarget : null;
    showFavoriteTip(anchor);
  }
}

function initDualSliderControl({ sliderId, labelId, limits, start }) {
  const sliderEl = $(sliderId);
  const labelEl = $(labelId);
  if (!sliderEl || typeof noUiSlider === 'undefined') return null;
  const formatter =
    typeof wNumb !== 'undefined'
      ? wNumb({ decimals: 0, thousand: ' ', prefix: '' })
      : {
          to: (value) => Math.round(value),
          from: (value) => Number(value)
        };
  const initial =
    Array.isArray(start) && start.length === 2
      ? [Math.max(limits.min, start[0]), Math.min(limits.max, start[1])]
      : [limits.min, limits.max];

  if (sliderEl.noUiSlider) {
    sliderEl.noUiSlider.destroy();
  }
  noUiSlider.create(sliderEl, {
    start: initial,
    connect: true,
    step: 1,
    range: {
      min: limits.min,
      max: limits.max
    },
    format: formatter,
    tooltips: false
  });

  const updateLabel = (values) => {
    if (!labelEl) return;
    labelEl.textContent = `${values[0]} - ${values[1]}`;
  };
  sliderEl.noUiSlider.on('update', (values) => updateLabel(values));
  sliderEl.noUiSlider.on('change', () => scheduleApplyFilters());
  updateLabel(initial);

  return {
    setValues: (minValue, maxValue) => {
      sliderEl.noUiSlider.set([minValue, maxValue]);
    },
    values: () => {
      const [minValue, maxValue] = sliderEl.noUiSlider.get().map((val) => Number(val));
      return { min: minValue, max: maxValue };
    }
  };
}

function nextFilterId() {
  filterId += 1;
  return `pf-${filterId}`;
}

function nextGroupFilterId() {
  groupFilterId += 1;
  return `gf-${groupFilterId}`;
}

function resetFilterIds() {
  filterId = 0;
  groupFilterId = 0;
}

function resetFilterState() {
  state.genders = new Set(DEFAULT_GENDERS);
  state.surname = '';
  state.includeLettersInput = '';
  state.excludeLettersInput = '';
  state.letterRange = { min: LETTER_LIMITS.min, max: LETTER_LIMITS.max };
  state.populationRange = { min: POPULATION_LIMITS.min, max: POPULATION_LIMITS.max };
  state.popularityFilters = [];
  state.phoneticFilters = [];
  state.groupFilters = [];
  state.sortKey = 'match';
  state.sortDir = 'desc';
}

function restoreFromParams(params) {
  resetFilterState();
  resetFilterIds();
  if (params.has('gender')) {
    state.genders = new Set(params.get('gender').split(',').filter(Boolean));
  }
  if (params.has('surname')) {
    state.surname = params.get('surname');
  }
  if (params.has('sort')) {
    state.sortKey = params.get('sort');
  }
  if (params.has('dir')) {
    state.sortDir = params.get('dir');
  }
  if (params.has('letters')) {
    state.includeLettersInput = normalizeLetterFilter(params.get('letters'));
  }
  if (params.has('exclude')) {
    state.excludeLettersInput = normalizeLetterFilter(params.get('exclude'));
  }
  if (params.has('len')) {
    const [minStr, maxStr] = params.get('len').split('-');
    state.letterRange = normalizeRangeValues(minStr, maxStr, LETTER_LIMITS);
  }
  if (params.has('pop')) {
    const [minStr, maxStr] = params.get('pop').split('-');
    state.populationRange = normalizeRangeValues(minStr, maxStr, POPULATION_LIMITS);
  }
  state.popularityFilters = params.getAll('popf').map((token) => {
    const [group, mode] = token.split('.');
    const normalizedMode = mode && mode !== 'undefined' ? mode : 'include';
    return {
      id: nextGroupFilterId(),
      group: group || '',
      mode: normalizedMode
    };
  });
  state.phoneticFilters = params.getAll('pf').map((token) => {
    const [feature, mode, grade] = token.split('.');
    return {
      id: nextFilterId(),
      feature: feature || (data.schema.phoneticFeatures[0]?.key ?? ''),
      mode: mode || 'include',
      grade: grade ? Number(grade) : 1
    };
  });
  state.groupFilters = params
    .getAll('gf')
    .map((token) => {
      const { key: group, mode } = parseTriToken(token);
      const normalizedMode = mode && mode !== 'undefined' ? mode : 'include';
      const norm = normalizeGroupKey(group);
      const resolvedGroup =
        groupFilterKeys.find((key) => normalizeGroupKey(key) === norm) || groupFilterKeys[0] || '';
      if (!resolvedGroup) return null;
      return {
        id: nextGroupFilterId(),
        group: resolvedGroup,
        mode: normalizedMode
      };
    })
    .filter(Boolean);

  if (params.has('w')) {
    const parsedWeights = parseWeightOverrides(params.get('w'));
    if (Object.keys(parsedWeights).length) {
      state.weightOverrides = parsedWeights;
      weightPercentBudget = computeAbsoluteWeightBudget(parsedWeights) || weightPercentBudget;
      persistSharedWeights(parsedWeights, defaultMatchingWeights);
    }
  }
}

function restoreFilters() {
  const storedQuery = readFilterQuery();
  if (storedQuery) {
    restoreFromParams(new URLSearchParams(storedQuery));
  }
}

function updateFavoriteNavHref() {
  const link = document.querySelector('.favorite-nav');
  if (!link) return;
  link.href = 'favorites/';
  setAdSlotsEnabled('results', getFilteredCount() > 0);
}

function applySchemaLimits() {
  const metrics = data?.schema?.metrics || [];
  const lengthMetric = metrics.find((metric) => metric.key === 'length');
  if (lengthMetric) {
    LETTER_LIMITS.min = Math.max(1, Math.floor(lengthMetric.min || 1));
    LETTER_LIMITS.max = Math.max(LETTER_LIMITS.min, Math.ceil(lengthMetric.max || 20));
    state.letterRange = normalizeRangeValues(state.letterRange.min, state.letterRange.max, LETTER_LIMITS);
  }
}

function initRangeControls() {
  lettersRangeControl = initDualSliderControl({
    sliderId: '#letters-slider',
    labelId: '#letters-range-label',
    limits: LETTER_LIMITS,
    start: [state.letterRange.min, state.letterRange.max]
  });
  updatePopulationInputs();
}

function updatePopulationLabel() {
  const label = $('#population-range-label');
  if (!label) return;
  label.textContent = `${formatNumberWithSpaces(state.populationRange.min)} - ${formatNumberWithSpaces(
    state.populationRange.max
  )}`;
}

function updatePopulationInputs() {
  const minInput = $('#population-min');
  const maxInput = $('#population-max');
  if (minInput) {
    minInput.value = formatNumberWithSpaces(state.populationRange.min);
  }
  if (maxInput) {
    maxInput.value = formatNumberWithSpaces(state.populationRange.max);
  }
  updatePopulationLabel();
}

function mountGenderFilter() {
  const container = document.querySelector('#gender-filter');
  if (!container) return;
  ensureGenderFilter(container, { selected: state.genders });
}

function updateSortDirToggle() {
  const toggle = $('#toggle-sort');
  if (!toggle) return;
  const isAsc = state.sortDir === 'asc';
  const label = isAsc ? 'Järjestys: nouseva' : 'Järjestys: laskeva';
  toggle.textContent = isAsc ? '↑' : '↓';
  toggle.setAttribute('aria-label', label);
  toggle.setAttribute('aria-pressed', isAsc ? 'false' : 'true');
  toggle.title = label;
}

function attachPopulationInputEvents() {
  const minInput = $('#population-min');
  const maxInput = $('#population-max');
  const formatHandler = (event) => {
    const target = event.target;
    const raw = sanitizeNumericInput(target.value);
    if (!raw) {
      target.value = '';
      return;
    }
    let numeric = Number(raw);
    if (!Number.isFinite(numeric)) numeric = 0;
    numeric = Math.max(POPULATION_LIMITS.min, Math.min(POPULATION_LIMITS.max, numeric));
    target.value = formatNumberWithSpaces(numeric);
    if (event.type === 'blur') {
      scheduleApplyFilters();
    }
  };
  if (minInput) {
    minInput.addEventListener('input', formatHandler);
    minInput.addEventListener('blur', formatHandler);
  }
  if (maxInput) {
    maxInput.addEventListener('input', formatHandler);
    maxInput.addEventListener('blur', formatHandler);
  }
}

function syncFormWithState() {
  setSelectedGenders(document, state.genders);
  $('#surname-input').value = state.surname;
  $('#letters-include').value = state.includeLettersInput;
  $('#letters-exclude').value = state.excludeLettersInput;
  lettersRangeControl?.setValues(state.letterRange.min, state.letterRange.max);
  updatePopulationInputs();
  $('#sort-key').value = state.sortKey;
  updateSortDirToggle();
  updateSortOptionTooltips();
  filterUi.renderFeatureFilters();
  filterUi.renderPopularityFilters();
  updateFilterPanels();
}

function scheduleApplyFilters(skipFormSync = false, delay = 250) {
  clearTimeout(autoApplyTimer);
  autoApplyTimer = setTimeout(() => applyFilters(skipFormSync), delay);
}

function getPopularityOptions(prefix) {
  const options = [];
  groupMeta.forEach((meta, key) => {
    if (key.startsWith(prefix)) {
      options.push(key);
    }
  });
  options.sort((a, b) => parsePeriodKey(b) - parsePeriodKey(a));
  return options;
}

function updateStateFromForm() {
  state.genders = normalizeGenderSelection(getSelectedGenders(document));
  state.surname = $('#surname-input').value.trim();
  state.includeLettersInput = normalizeLetterFilter($('#letters-include').value);
  state.excludeLettersInput = normalizeLetterFilter($('#letters-exclude').value);
  if (lettersRangeControl) {
    const { min, max } = lettersRangeControl.values();
    state.letterRange = normalizeRangeValues(min, max, LETTER_LIMITS);
    lettersRangeControl.setValues(state.letterRange.min, state.letterRange.max);
  }
  const popMinRaw = sanitizeNumericInput($('#population-min').value);
  const popMaxRaw = sanitizeNumericInput($('#population-max').value);
  const popMin = popMinRaw ? Number(popMinRaw) : POPULATION_LIMITS.min;
  const popMax = popMaxRaw ? Number(popMaxRaw) : POPULATION_LIMITS.max;
  state.populationRange = normalizeRangeValues(popMin, popMax, POPULATION_LIMITS);
  updatePopulationInputs();
  state.sortKey = $('#sort-key').value;
  updateFilterPanels();
}

function applyFilters(skipFormSync = false) {
  if (!skipFormSync) {
    updateStateFromForm();
  }
  const restoreResultsScroll = preserveScroll(document.getElementById('results'));
  state.visibleCount = PAGE_SIZE;
  const matchContext = buildSurnameMatchContext(data.surnames || [], surnameMap, state.surname);
  const surnameResolution = matchContext.resolution;
  const { dataEntry: dataSurnameEntry, matchEntry: matchSurnameEntry } = surnameResolution;
  const missingSurname = Boolean(state.surname && !matchSurnameEntry);
  const surnameCount = dataSurnameEntry ? Number(dataSurnameEntry.popularity) || 0 : 0;
  const activeWeights = getActiveWeights();
  const filtered = [];
  filteredOutResults = [];

  data.names.forEach((entry) => {
    const reasons = filters.collectFilterFailures(entry);
    entry._match = matchSurnameEntry
      ? computeMatchScore(entry, matchContext, activeWeights)
      : null;
    const totalOwners = Number(entry.popularity?.total || 0);
    if (surnameCount && totalOwners) {
      const base = populationBaseEstimate || POPULATION_LIMITS.max || 1;
      const comboValue = surnameCount * (totalOwners / base);
      entry._comboEstimate = comboValue >= 0.5 ? comboValue : null;
    } else {
      entry._comboEstimate = null;
    }
    entry._filteredReasons = reasons;
    if (!reasons.length) {
      filtered.push(entry);
    } else {
      filteredOutResults.push(entry);
    }
  });

  sortResults(filtered);
  sortResults(filteredOutResults);
  orderedResults = [...filtered, ...filteredOutResults];
  sortResults(orderedResults);
  currentResults = filtered;
  state.matchInfo = { surnameEntry: matchSurnameEntry, missingSurname };
  updateSurnameAnalysis(surnameResolution);
  results.renderResults(restoreResultsScroll);
  persistFilterState();
}

function getActiveFilterChips() {
  const tSummary = translations.fi?.filterSummary;
  if (!tSummary) return [];
  const chips = [];
  state.popularityFilters.forEach((filter) => {
    const label = formatPopularityLabel(filter.group);
    const modeText = filter.mode === 'include' ? tSummary.groupInclude : tSummary.groupExclude;
    chips.push({
      text: `${label} (${modeText})`,
      remove: () => {
        state.popularityFilters = state.popularityFilters.filter((f) => f.id !== filter.id);
        filterUi.renderPopularityFilters();
        applyFilters(true);
      }
    });
  });
  state.groupFilters.forEach((filter) => {
    const meta = groupMeta.get(filter.group);
    if (!meta) return;
    const label = getGroupLabel(meta);
    const modeText = filter.mode === 'include' ? tSummary.groupInclude : tSummary.groupExclude;
    chips.push({
      text: `${label} (${modeText})`,
      remove: () => {
        state.groupFilters = state.groupFilters.filter((f) => f.id !== filter.id);
        filterUi.renderFeatureFilters();
        applyFilters(true);
      }
    });
  });
  state.phoneticFilters.forEach((filter) => {
    const meta = phoneticMeta.get(filter.feature);
    if (!meta) return;
    const label = getFeatureLabel(meta) || filter.feature;
    const descriptor = filter.mode === 'include' ? tSummary.featureInclude : tSummary.featureExclude;
    chips.push({
      text: `${label} (${descriptor})`,
      remove: () => {
        state.phoneticFilters = state.phoneticFilters.filter((f) => f.id !== filter.id);
        filterUi.renderFeatureFilters();
        applyFilters(true);
      }
    });
  });
  const includeTokens = parseLetterTokens(state.includeLettersInput);
  if (includeTokens.length) {
    chips.push({
      text: `${tSummary.lettersInclude}: ${includeTokens.join(' / ')}`,
      remove: () => {
        state.includeLettersInput = '';
        const includeInput = $('#letters-include');
        if (includeInput) includeInput.value = '';
        applyFilters(true);
      }
    });
  }
  const excludeTokens = parseLetterTokens(state.excludeLettersInput);
  if (excludeTokens.length) {
    chips.push({
      text: `${tSummary.lettersExclude}: ${excludeTokens.join(' / ')}`,
      remove: () => {
        state.excludeLettersInput = '';
        const excludeInput = $('#letters-exclude');
        if (excludeInput) excludeInput.value = '';
        applyFilters(true);
      }
    });
  }
  if (
    state.letterRange.min !== LETTER_LIMITS.min ||
    state.letterRange.max !== LETTER_LIMITS.max
  ) {
    chips.push({
      text: `Pituus ${state.letterRange.min}–${state.letterRange.max}`,
      remove: () => {
        state.letterRange = { ...LETTER_LIMITS };
        lettersRangeControl?.setValues(LETTER_LIMITS.min, LETTER_LIMITS.max);
        applyFilters(true);
      }
    });
  }
  if (
    state.populationRange.min !== POPULATION_LIMITS.min ||
    state.populationRange.max !== POPULATION_LIMITS.max
  ) {
    chips.push({
      text: `${tSummary.population}: ${formatNumberWithSpaces(state.populationRange.min)} - ${formatNumberWithSpaces(
        state.populationRange.max
      )}`,
      remove: () => {
        state.populationRange = { ...POPULATION_LIMITS };
        updatePopulationInputs();
        applyFilters(true);
      }
    });
  }
  return chips;
}

function sortResults(list) {
  const dir = state.sortDir === 'asc' ? 1 : -1;
  const metricKeys = new Set((data.schema.metrics || []).map((m) => m.key));
  const periodRanks = buildPeriodRanks(data.schema);
  const missingSurname =
    state.matchInfo?.missingSurname
    ?? Boolean(state.surname && !surnameMap.get(state.surname.toLowerCase()));
  const activeSortKey =
    state.sortKey === 'match' && (!state.surname || missingSurname) ? 'popularity' : state.sortKey;
  list.sort(createSortComparator({ activeSortKey, dir, periodRanks, metricKeys }));
}

function getActiveWeights() {
  if (state.weightOverrides) {
    return state.weightOverrides;
  }
  if (defaultMatchingWeights) {
    return defaultMatchingWeights;
  }
  return data?.schema?.matching?.weights || {};
}

function prepareMatchingWeights() {
  if (!data?.schema?.matching?.weights) {
    defaultMatchingWeights = null;
    weightPercentBudget = 1;
    return;
  }
  const baseWeights = { ...data.schema.matching.weights };
  if (baseWeights.junction_transition != null && baseWeights.end_start_transition == null) {
    baseWeights.end_start_transition = baseWeights.junction_transition;
  }
  delete baseWeights.junction_transition;
  delete baseWeights.junction;
  const normalized = normalizeWeightMap(baseWeights);
  data.schema.matching.weights = normalized;
  defaultMatchingWeights = { ...normalized };
  weightPercentBudget = computeAbsoluteWeightBudget(normalized) || 1;
}

function computeMatchScore(first, matchContext, weights) {
  const score = computeWeightedMatchScore(first, matchContext, weights, matchingModel);
  if (!Number.isFinite(score)) return null;
  return Math.round(score * 1000) / 1000;
}

function initWeightEditor() {
  if (weightEditor || !document) return;
  const trigger = $('#edit-weight-button');
  const modal = $('#weight-editor');
  if (!trigger || !modal) return;
  const explainModal = $('#surname-explain-modal');
  if (explainModal) {
    const closeBtn = explainModal.querySelector('[data-action="close-surname-explain"]');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        explainModal.hidden = true;
        document.body.classList.remove('modal-open');
      });
    }
  }
  const refs = {
    modal,
    list: $('#weight-editor-list'),
    total: $('#weight-editor-total'),
    remaining: $('#weight-editor-remaining'),
    error: $('#weight-editor-error'),
    save: $('#weight-editor-save')
  };
  const textRefs = {
    eyebrow: $('#weight-editor-eyebrow'),
    title: $('#weight-editor-title'),
    description: $('#weight-editor-description'),
    reset: modal.querySelector('[data-action="reset-weight-editor"]'),
    cancel: modal.querySelector('[data-action="cancel-weight-editor"]')
  };
  const locale = translations.fi.weightEditor;
  weightEditor = createWeightEditor({
    refs,
    tolerance: WEIGHT_SUM_TOLERANCE,
    getWeights: getActiveWeights,
    getBudget: () => weightPercentBudget,
    toggleNoteOnInput: true,
    strings: {
      totalText: (total) => locale.total(total),
      balanceText: (balance) => locale.balance(balance),
      invalidText: locale.invalid,
      absRequirementText: locale.absRequirement,
      penaltyNote: locale.penaltyNote
    },
    traitProvider: () => {
      const surnameEntry = state.matchInfo?.surnameEntry;
      const typedSurname = getTypedSurname();
      const resolvedSurname =
        !surnameEntry && typedSurname ? resolveSurnameEntry(surnameMap, typedSurname) : null;
      const traitEntries = buildSurnameTraitSentences(
        surnameEntry || resolvedSurname?.matchEntry,
        'stats',
        'surname',
        typedSurname
      );
      return new Map(traitEntries.map((item) => [item.key, item.text]));
    },
    syncTexts: () => {
      if (locale.eyebrow && textRefs.eyebrow) textRefs.eyebrow.textContent = locale.eyebrow;
      if (locale.title && textRefs.title) textRefs.title.textContent = locale.title;
      if (locale.description && textRefs.description) textRefs.description.textContent = locale.description;
      if (locale.resetLabel && textRefs.reset) textRefs.reset.textContent = locale.resetLabel;
      if (locale.cancelLabel && textRefs.cancel) textRefs.cancel.textContent = locale.cancelLabel;
      if (locale.confirmLabel && refs.save) refs.save.textContent = locale.confirmLabel;
    },
    onClose: updateModalOpenState,
    getApplyBase: () => ({ ...(defaultMatchingWeights || data?.schema?.matching?.weights || {}) }),
    onApply: (normalized, base) => {
      const isSame = areWeightsEqual(normalized, base);
      state.weightOverrides = isSame ? null : normalized;
      weightPercentBudget = computeAbsoluteWeightBudget(getActiveWeights()) || 1;
      persistSharedWeights(state.weightOverrides, defaultMatchingWeights);
      weightEditor.close();
      applyFilters();
    }
  });
  trigger.addEventListener('click', () => weightEditor.open());
  modal.querySelectorAll('[data-action="dismiss-weight-editor"]').forEach((el) => {
    el.addEventListener('click', () => weightEditor.close());
  });
  textRefs.cancel?.addEventListener('click', () => weightEditor.close());
  textRefs.reset?.addEventListener('click', () => weightEditor.render(null, defaultMatchingWeights));
  refs.save?.addEventListener('click', () => weightEditor.applyChanges());
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && weightEditor.isOpen()) {
      event.preventDefault();
      weightEditor.close();
    }
  });
}

function updateModalOpenState() {
  const anyOpen = Boolean(document.querySelector('.modal[data-app-modal="true"]:not([hidden])'));
  document.body.classList.toggle('modal-open', anyOpen);
}

function openStoryModal() {
  const modal = $('#story-modal');
  if (!modal) return;
  modal.hidden = false;
  document.body.classList.add('modal-open');
}

function closeStoryModal() {
  const modal = $('#story-modal');
  if (!modal) return;
  modal.hidden = true;
  updateModalOpenState();
}

function openRecommendationHintModal() {
  const modal = $('#recommendation-hint-modal');
  if (!modal) return;
  modal.hidden = false;
  document.body.classList.add('modal-open');
}

function closeRecommendationHintModal() {
  const modal = $('#recommendation-hint-modal');
  if (!modal) return;
  modal.hidden = true;
  updateModalOpenState();
}

function updateRecommendationHintVisibility(chips) {
  const hint = $('#recommendation-hint');
  if (!hint) return;
  const hasFilters = Array.isArray(chips) && chips.length > 0;
  hint.hidden = hasFilters;
}

function renderActiveFilters() {
  const chips = getActiveFilterChips();
  updateRecommendationHintVisibility(chips);
  const container = $('#active-filters');
  if (!container) return;
  const restore = preserveScroll(container);
  container.innerHTML = '';
  if (!chips.length) {
    container.hidden = true;
    restore();
    return;
  }
  container.hidden = false;
  chips.forEach((chip) => {
    const tag = document.createElement('span');
    tag.className = 'filter-chip';
    tag.textContent = chip.text;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip-remove';
    btn.textContent = '×';
    btn.title = 'Poista rajaus';
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      chip.remove();
    });
    tag.appendChild(btn);
    container.appendChild(tag);
  });
  restore();
}

function shouldShowDetailAd() {
  return detailAds.shouldShow();
}

function formatNumberWithSpaces(value) {
  if (value == null || Number.isNaN(value)) {
    return '';
  }
  const rounded = Math.round(value);
  return rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function getSurnameUsageText(entry) {
  return formatSurnameUsage(entry, surnameRankMap, translations.fi?.surnameUsage);
}

function sanitizeNumericInput(value) {
  if (value == null) return '';
  return String(value).replace(/\s+/g, '');
}

function getFeatureLabel(meta) {
  if (!meta) return '';
  return meta.label || '';
}

function getGroupLabel(meta) {
  if (!meta) return '';
  return meta.label || '';
}

function getGroupDescription(key) {
  const meta = groupMeta.get(key);
  return meta?.description || '';
}

function getPopularityKeys() {
  const popular = [];
  const trend = [];
  const growth = [];
  const evergreen = [];
  const parsePeriod = parsePeriodKey;
  groupMeta.forEach((_, key) => {
    if (key.startsWith('popular_')) popular.push(key);
    else if (key.startsWith('trend_')) trend.push(key);
    else if (key.startsWith('growth_')) growth.push(key);
    else if (key === 'evergreen') evergreen.push(key);
  });
  popular.sort((a, b) => parsePeriod(b) - parsePeriod(a));
  trend.sort((a, b) => parsePeriod(b) - parsePeriod(a));
  growth.sort((a, b) => parsePeriod(b) - parsePeriod(a));
  return [...popular, ...trend, ...growth, ...evergreen];
}

function formatPopularityLabel(key) {
  if (!key) return '';
  if (key.startsWith('popular_')) {
    const suffix = key.replace('popular_', '');
    return `Suosittu ${suffix}`;
  }
  if (key.startsWith('trend_')) {
    const suffix = key.replace('trend_', '');
    return `Suosion huipulla ${suffix}`;
  }
  if (key.startsWith('growth_')) {
    const suffix = key.replace('growth_', '');
    return `Kasvattanut suosiota ${suffix}`;
  }
  if (key === 'evergreen') return 'Aina suositut';
  const meta = groupMeta.get(key);
  return meta ? getGroupLabel(meta) : key;
}

function getPeriodLabel(key) {
  if (!key) return '';
  const parts = key.split('_');
  return parts.length > 1 ? parts.slice(1).join('_') : key;
}

function parsePeriodKey(key) {
  const match = key.match(/_(\d{4}-\d{4}|-?\d{3,4})$/);
  if (!match) return -Infinity;
  const startStr = match[1].split('-')[0];
  const start = parseInt(startStr, 10);
  return Number.isFinite(start) ? start : -Infinity;
}

function getFeatureDescriptionByMeta(meta) {
  if (!meta) return '';
  return meta.description || '';
}

function appendSurnameAnalysisLine(container, text, className) {
  if (!container || !text) return;
  const span = document.createElement('span');
  if (className) span.className = className;
  span.textContent = text;
  container.appendChild(span);
}

function updateSurnameAnalysis(resolution = null) {
  const container = $('#surname-analysis');
  if (!container) return;
  const surname = state.surname.trim();
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
  if (isProxy) {
    appendSurnameAnalysisLine(container, 'Sukunimeä käyttää alle 20 henkilöä.', 'surname-usage');
    return;
  }
  const usageText = getSurnameUsageText(dataEntry);
  if (!usageText) {
    container.textContent = '';
    return;
  }
  appendSurnameAnalysisLine(container, usageText, 'surname-usage');
  container.title = '';
}

function createHistoryLabel(entry, t) {
  const base = t.historyTitle || 'Nimen suosio historiassa';
  const name = entry?.display || entry?.name || '';
  if (!name) return base;
  const linkText = t.historyLinkText || 'linkki';
  const url = `https://nimipalvelu.dvv.fi/etunimihaku?nimi=${encodeURIComponent(name)}`;
  return `${base} (<a href="${url}" target="_blank" rel="noopener">${linkText}</a>)`;
}

function resetDetailAdCounter() {
  detailAds.reset();
}

function persistFilterState() {
  const params = new URLSearchParams();
  state.popularityFilters.forEach((filter) => {
    const modeValue = filter.mode === 'exclude' ? 'exclude' : 'include';
    params.append('popf', `${filter.group}.${modeValue}`);
  });
  if (state.genders.size && state.genders.size < 3) {
    params.set('gender', Array.from(state.genders).join(','));
  }
  if (state.surname) params.set('surname', state.surname);
  if (state.includeLettersInput) params.set('letters', state.includeLettersInput);
  if (state.excludeLettersInput) params.set('exclude', state.excludeLettersInput);
  if (
    state.letterRange.min !== LETTER_LIMITS.min ||
    state.letterRange.max !== LETTER_LIMITS.max
  ) {
    params.set('len', `${state.letterRange.min}-${state.letterRange.max}`);
  }
  if (
    state.populationRange.min !== POPULATION_LIMITS.min ||
    state.populationRange.max !== POPULATION_LIMITS.max
  ) {
    params.set('pop', `${state.populationRange.min}-${state.populationRange.max}`);
  }
  params.set('sort', state.sortKey);
  params.set('dir', state.sortDir);
  state.phoneticFilters.forEach((filter) => {
    params.append('pf', `${filter.feature}.${filter.mode}.${filter.grade ?? 1}`);
  });
  state.groupFilters.forEach((filter) => {
    const modeValue = filter.mode === 'exclude' ? 'exclude' : 'include';
    params.append('gf', `${filter.group}.${modeValue}`);
  });
  if (state.weightOverrides) {
    params.set('w', serializeWeightOverrides(state.weightOverrides));
  }
  const query = params.toString();
  writeFilterQuery(query);
  updateFavoriteNavHref();
  setAdSlotsEnabled('results', false);
}

function bindEvents() {
  $('#sort-key').addEventListener('change', () => {
    updateSortOptionTooltips();
    applyFilters();
  });
  const surnameInput = $('#surname-input');
  if (surnameInput) {
    surnameInput.addEventListener('focus', () => ensureSurnames(), { once: true });
    surnameInput.addEventListener('input', () => {
      const currentValue = surnameInput.value.trim();
      state.surname = currentValue;
      if (currentValue) ensureSurnames();
      const resolution = resolveSurnameEntry(surnameMap, currentValue);
      updateSurnameAnalysis(resolution);
       updateFavoriteNavHref();
      clearTimeout(surnameInputTimer);
      surnameInputTimer = setTimeout(() => {
        applyFilters();
      }, 400);
    });
  }
  ['#letters-include', '#letters-exclude'].forEach((id) => {
    const el = document.querySelector(id);
    if (el) {
      el.addEventListener('input', () => scheduleApplyFilters());
    }
  });
  document.querySelectorAll('.hint-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      if (!targetId) return;
      const target = document.getElementById(targetId);
      if (!target) return;
      const isHidden = target.hasAttribute('hidden');
      if (isHidden) {
        target.removeAttribute('hidden');
        btn.setAttribute('aria-expanded', 'true');
        btn.textContent = 'Piilota lisäohjeet';
      } else {
        target.setAttribute('hidden', '');
        btn.setAttribute('aria-expanded', 'false');
        btn.textContent = 'Näytä lisäohjeita';
      }
    });
  });
  $('#toggle-sort').addEventListener('click', () => {
    state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    updateSortDirToggle();
    applyFilters();
  });
  const addPhoneticBtn = $('[data-action="add-phonetic"]');
  if (addPhoneticBtn) addPhoneticBtn.addEventListener('click', () => filterUi.addPhoneticFilter());
  const addGroupBtn = $('[data-action="add-group"]');
  if (addGroupBtn) addGroupBtn.addEventListener('click', () => filterUi.addGroupFilter());
  const addPopBtn = $('[data-action="add-popularity"]');
  if (addPopBtn) addPopBtn.addEventListener('click', () => filterUi.addPopularityFilter());
  document.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-filter-href]');
    if (!btn) return;
    const href = btn.getAttribute('data-filter-href');
    if (!href) return;
    const url = new URL(href, window.location.origin);
    const isSamePage =
      url.origin === window.location.origin &&
      (url.pathname === window.location.pathname || url.pathname === '/' || /\/index\.html$/i.test(url.pathname));
    if (!isSamePage) {
      window.location.href = url.toString();
      return;
    }
    event.preventDefault();
    const surnameValue = (state.surname || '').trim();
    const params = new URLSearchParams(url.search);
    if (surnameValue && !params.has('surname')) {
      params.set('surname', surnameValue);
    }
    if (state.genders.size && state.genders.size < 3 && !params.has('gender')) {
      params.set('gender', Array.from(state.genders).join(','));
    }
    restoreFromParams(params);
    syncFormWithState();
    applyFilters(true);
    sessionStorage.setItem(SCROLL_FLAG_KEY, '1');
    scrollToResultsIfNeeded();
  });
  document.addEventListener('blog-strip-ready', () => {
    if (hasScrolledToResults || sessionStorage.getItem(SCROLL_FLAG_KEY) === '1') {
      pendingResultsScroll = true;
      scrollToResultsIfNeeded();
    }
  });
  getGenderInputs(document).forEach((checkbox) => {
    checkbox.addEventListener('change', () => applyFilters());
  });
  const loadMoreBtn = $('#load-more');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      const totalAvailable = results.getDisplayableCount();
      state.visibleCount = Math.min(state.visibleCount + PAGE_SIZE, totalAvailable);
      results.renderResults();
    });
  }
  document.querySelectorAll('[data-action="open-story"]').forEach((el) => {
    el.addEventListener('click', openStoryModal);
  });
  document.querySelectorAll('[data-action="dismiss-story"]').forEach((el) => {
    el.addEventListener('click', closeStoryModal);
  });
  document.querySelectorAll('[data-action="open-recommendation-hint"]').forEach((el) => {
    el.addEventListener('click', openRecommendationHintModal);
  });
  document.querySelectorAll('[data-action="dismiss-recommendation-hint"]').forEach((el) => {
    el.addEventListener('click', closeRecommendationHintModal);
  });
  document.querySelectorAll('[data-action="go-to-articles-strip"]').forEach((el) => {
    el.addEventListener('click', () => {
      closeRecommendationHintModal();
      scrollToArticlesStrip();
    });
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeStoryModal();
      closeRecommendationHintModal();
      if (surnameExplainModal && !surnameExplainModal.hidden) {
        closeSurnameExplain();
      }
    }
  });
  surnameExplainModal = $('#surname-explain-modal');
  if (surnameExplainModal) {
    surnameExplainModal.hidden = true;
  }
  document.querySelectorAll('[data-action="dismiss-surname-explain"]').forEach((el) => {
    el.addEventListener('click', closeSurnameExplain);
  });
}

function closeSurnameExplain() {
  if (!surnameExplainModal) return;
  surnameExplainModal.hidden = true;
  updateModalOpenState();
}

function scrollToArticlesStrip() {
  clearResultsScrollTimers();
  pendingResultsScroll = false;
  sessionStorage.removeItem(SCROLL_FLAG_KEY);
  const panel = document.getElementById('articles-strip-panel');
  if (panel) {
    panel.open = true;
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }
  const fallback = document.querySelector('[data-include="content/articles-strip.html"]');
  if (fallback) {
    fallback.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function scrollToResultsIfNeeded() {
  clearResultsScrollTimers();
  const shouldScroll =
    window.location.hash === '#results' || sessionStorage.getItem(SCROLL_FLAG_KEY) === '1' || pendingResultsScroll;
  if (!shouldScroll) return;
  const target = document.getElementById('results');
  if (!target) return;
  hasScrolledToResults = true;
  pendingResultsScroll = true;
  sessionStorage.removeItem(SCROLL_FLAG_KEY);
  const scrollToTarget = () => {
    const rect = target.getBoundingClientRect();
    const top = rect.top + window.scrollY - 8;
    window.scrollTo({ top, behavior: 'smooth' });
  };
  requestAnimationFrame(() => {
    scrollToTarget();
    resultsScrollRetryTimer = setTimeout(scrollToTarget, 220);
  });
  resultsScrollCleanupTimer = setTimeout(() => {
    pendingResultsScroll = false;
    clearResultsScrollTimers();
  }, 500);
}

async function init() {
  mountGenderFilter();
  data = await loadData();
  favorites = loadFavorites(FAVORITES_KEY);
  prepareMatchingWeights();
  buildMetaMaps();
  applySchemaLimits();
  initSelects();
  restoreFilters();
  updateFavoriteNavHref();
  registerAdSlots('results', ['.ad-inline-top', '.ad-rail']);
  registerAdSlots('affiliate', ['.affiliate-link']);
  setAdSlotsEnabled('results', false);
  setAdSlotsEnabled('affiliate', false);
  initRangeControls();
  attachPopulationInputEvents();
  syncFormWithState();
  initWeightEditor();
  bindEvents();
  resetDetailAdCounter();
  applyFilters();
  scrollToResultsIfNeeded();
  // Surname data is deferred: fetch it right away if a surname was restored
  // (so its match appears), otherwise prefetch it once the browser is idle.
  if (getTypedSurname()) {
    ensureSurnames();
  } else {
    prefetchSurnames();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  init().catch((error) => {
    console.error('Failed to initialise app', error);
    $('#results-list').innerHTML = '<p class="hint">Datan lataus epäonnistui.</p>';
  });
});
