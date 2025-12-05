import { createCardShell } from './shared-cards.js';
import { loadDataset } from './data-service.js';
import { createDetailService } from './detail-service.js';
import {
  createAdTracker,
  formatCount,
  renderAgeDistributionChart,
  renderGroupChips,
  renderPhoneticSummary,
  renderUsageChart,
  fetchWikiSummary
} from './detail-utils.js';
import { FAVORITES_KEY, loadFavorites, saveFavorites } from './favorites-store.js';
import { loadMatchingModel, computePairScore as computeModelPairScore, computeBuckets } from './matching-model.js';
import { buildExplanation, friendlyBucket } from './explain-utils.js';
import { registerAdSlots, setAdSlotsEnabled } from './ad-service.js';
import { buildSurnameData, formatSurnameUsage } from './surname-service.js';
import MATCH_WEIGHT_FIELDS from './weight-fields.js';
import {
  areWeightsEqual,
  computeAbsoluteWeightBudget,
  formatPercentNumber,
  normalizeWeightMap,
  parseWeightOverrides,
  percentToWeight,
  persistSharedWeights,
  readSharedWeights,
  serializeWeightOverrides,
  weightToPercent
} from './weight-utils.js';

const PAGE_SIZE = 50;

const translations = {
  fi: {
    genders: {
      female: 'Nainen',
      male: 'Mies',
      unisex: 'Unisex',
      unknown: 'Tuntematon'
    },
    results: (start, end, total) => `Näytetään ${start}-${end} / ${total} nimeä`,
    noResults: 'Valituilla rajauksilla ei löytynyt yhtään nimeä.',
    match: (surname) => surname ? `Vauvan sukunimi on “${surname}”` : 'Sukunimiyhteensopivuus pois käytöstä',
    missingSurname: (surname) => `Sukunimeä “${surname}” ei löytynyt aineistosta - vertailu ohitettiin.`,
    matchLabel: 'Sukunimi-osuvuus',
    grade: (label) => `Taso: ${label}`,
    historyTitle: 'Nimen käyttö historiassa',
    historyLinkText: 'linkki',
    historyLegendMale: 'Miehiä',
    historyLegendFemale: 'Naisia',
    historyYAxis: '%-osuus annetuista nimistä',
    historyNoData: 'Ei historiallista käyttödataa',
    populationTag: (count) => `Arvio: ~${count} hlöä`,
    comboTag: (count) => {
      const rounded = Math.round(count);
      return rounded >= 1 ? `Täyskaimoja: ~${rounded} hlöä` : '';
    },
    comboLabel: 'Arvio valitun sukunimen kanssa',
    populationTitle: 'Arvioitu määrä Suomessa',
    populationTotalLabel: 'Yhteensä',
    populationShareLabel: 'Osuus väestöstä',
    populationNoData: 'Ei arviota',
    ageDistributionTitle: 'Ikäjakauma (arvio)',
    ageDistributionYAxis: 'Henkilöitä (arvio)',
    ageDistributionNoData: 'Ei ikäjakaumatietoa',
    surnameAnalysisTitle: 'Sukunimen äänneprofiili',
    surnameAnalysisNote: 'Perustuu samoihin vokaali-, sävy- ja rytmiparametreihin kuin sukunimi-osuvuus.',
    surnameAnalysisMissing: 'Sukunimeä ei löytynyt tilastoista. Käytä vertailua harkiten.',
    surnameUsage: (count, rank) => `Sukunimeä käyttää ${count} henkilöä ja se on ${rank}:s yleisin.`,
    firstNameAnalysisTitle: 'Etunimen äänneprofiili',
    nameDayLabel: 'Nimipäivä',
    wikiTitle: 'Tietoa nimestä',
    wikiLoading: 'Haetaan Wikipedia-tiivistelmää…',
    wikiUnavailable: 'Wikipedia-artikkelia ei löytynyt',
    detailsLoading: 'Haetaan nimen tarkempia tietoja…',
    detailsError: 'Tietojen lataus epäonnistui.',
    pronunciationTitle: 'Ääntäminen',
    comboRowLabel: 'Täyskaimoja',
    comboRowNote: 'perustuu suku- ja etunimien yleisyyteen',
    groupTitle: 'Ryhmäjäsenyydet',
    phoneticTitle: 'Äännepiirteet',
    noGroupMembership: 'Ei ryhmäjäsenyyksiä',
    noPhoneticHighlights: 'Ei erityisiä piirteitä'
    ,
    filterSummary: {
      groupInclude: 'Vain tällaiset nimet',
      groupExclude: 'Poista tällaiset nimet',
      featureInclude: 'Nimessä oltava',
      featureExclude: 'Poistettava',
      featureMin: 'Vähintään taso',
      featureMax: 'Enintään taso',
      lettersInclude: 'Nimen tulee sisältää',
      lettersExclude: 'Nimessä ei saa olla',
      population: 'Nimenhaltijat'
    },
    weightEditor: {
      eyebrow: 'Tekoälyn käyttämät painotukset',
      title: 'Muokkaa tekoälyn painotuksia',
      description:
        'Kerro tekoälylle, minkälaisia nimiä haluat sen suosittelevan. Korkeammat positiiviset prosentit kertovat tekoälylle, että tämä asia on sinulle tärkeä. Negatiiviset prosentit saavat sen välttelemään sellaisia nimiä, joissa kuvailtu asia on voimakas. Voit tarkistaa sivun alalaidasta, kuinka paljon prosentteja sinun pitää vielä lisätä tai vähentää.',
      total: (value) => `Käytössä ${value.toFixed(1)} % / 100 %`,
      balance: (value) =>
        value > 0
          ? `Vapaana ${value.toFixed(1)} %`
          : value < 0
            ? `Ylittää ${Math.abs(value).toFixed(1)} %`
            : 'Täsmälleen 100 % käytetty',
      absRequirement: 'Painot on käytettävä tasan 100 %:iin asti.',
      invalid: 'Täytä kaikki prosenttikentät numeroin.',
      penaltyNote: 'Negatiiviset prosentit saavat tekoälyn välttelemään tällaisia nimiä',
      resetLabel: 'Palauta oletukset',
      cancelLabel: 'Peruuta',
      confirmLabel: 'OK'
    }
  }
};

const state = {
  genders: new Set(['female', 'male', 'unisex']),
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
let phoneticMeta = new Map();
let groupMeta = new Map();
let groupFilterKeys = [];
let gradeMeta = [];
let currentResults = [];
let filteredOutResults = [];
let orderedResults = [];
let transitionConfig = null;
let matchingModel = null;
let detailService = null;
const LETTER_LIMITS = { min: 1, max: 20 };
const POPULATION_LIMITS = { min: 0, max: 45000 };
let lettersRangeControl = null;
let favorites = new Set();
let surnameInputTimer = null;
let autoApplyTimer = null;
let weightPercentBudget = 1;
let weightEditorControls = null;
let weightEditorInputs = [];
let defaultMatchingWeights = null;
const WEIGHT_SUM_TOLERANCE = 0.05;
const DETAIL_AD_FREQUENCY = 3;
const normalizeGroupKey = (key) => String(key || '').toLowerCase().replace(/\.txt$/, '');
const getFilteredCount = () => (Array.isArray(currentResults) ? currentResults.length : 0);

function parseTriToken(token) {
  const parts = (token || '').split('.');
  if (parts.length <= 1) {
    return { key: token || '', mode: 'include' };
  }
  const mode = parts.pop() || 'include';
  const key = parts.join('.');
  return { key, mode };
}
const detailAds = createAdTracker(DETAIL_AD_FREQUENCY);
let filterFeatureMeta = [];
const expandedFilteredBlocks = new Set();
let surnameExplainLink = null;
let surnameExplainModal = null;
let hasScrolledToResults = false;
const SCROLL_FLAG_KEY = 'scrollToResults';

const $ = (sel) => document.querySelector(sel);

function getDisplayableCount() {
  return orderedResults.reduce((acc, entry) => {
    const hasGenderBlock = entry._filteredReasons?.some((r) => r.key === 'gender');
    return hasGenderBlock ? acc : acc + 1;
  }, 0);
}

function getTypedSurname() {
  return (state.surname || '').trim();
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

function updateFilterPanels() {
  const hasTraitFilters = state.groupFilters.length > 0 || state.phoneticFilters.length > 0;
  setPanelOpen('desired-filter-panel', hasTraitFilters);
  setPanelOpen('range-filter-panel', isRangeFilterActive());
  setPanelOpen('popularity-filter-panel', state.popularityFilters.length > 0);
}

const sortDescriptions = {
  alpha: 'Aakkosjärjestys A-Ö.',
  popularity: 'Järjestää eniten annetuista nimistä vähiten annettuihin.',
  match:
    'Painottaa vokaalien sijaintia ja avaruutta, sointisävyä, konsonanttien pehmeyttä sekä kirjainryhmien todennäköisiä siirtymiä nimien alussa ja välissä.',
  valence: 'Korkeampi arvo tarkoittaa kirkkaampaa sointia, matalampi tummempaa sävyä.',
  nasal_intensity: 'Korostaa m-, n- ja ng-äänteiden määrää nimessä.',
  r_intensity: 'Lajittelee r-äänteiden määrästä voimakkaimpaan.'
};

async function loadData() {
  const [dataset, model] = await Promise.all([
    loadDataset({ includeSurnames: true }),
    loadMatchingModel()
  ]);
  matchingModel = model;
  if (!state.weightOverrides) {
    const shared = readSharedWeights();
    if (shared) state.weightOverrides = shared;
  }
  return dataset;
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
        !String(group.key || '').startsWith('trend_') &&
        group.key !== 'evergreen'
    )
    .map((g) => g.key);
  gradeMeta = data.schema.intensityGrades || [];
  const surnameData = buildSurnameData(data.surnames || []);
  surnameMap = surnameData.map;
  surnameRankMap = surnameData.rankMap;
  transitionConfig = data.schema.matching?.transitions || null;
  detailService = createDetailService(data.schema);
  filterFeatureMeta = data.schema.filterFeatures || [];
}

function getTransitionProbability(fromGroup, toGroup) {
  if (!transitionConfig || !fromGroup || !toGroup) {
    return transitionConfig?.default || 0;
  }
  const index = transitionConfig.groupIndex || {};
  const fromIdx = index[fromGroup];
  const toIdx = index[toGroup];
  if (fromIdx == null || toIdx == null) {
    return transitionConfig.default || 0;
  }
  const matrix = transitionConfig.matrix || [];
  const row = matrix[fromIdx];
  if (!row) {
    return transitionConfig.default || 0;
  }
  const value = row[toIdx];
  return typeof value === 'number' ? value : transitionConfig.default || 0;
}

function normalizeTransitionProbability(probability) {
  if (!transitionConfig) return 0;
  const baseline = transitionConfig.baseline ?? 0;
  let normalized = 0;
  if (probability >= baseline) {
    const denom = 1 - baseline;
    normalized = denom ? (probability - baseline) / denom : 0;
  } else if (baseline) {
    normalized = (probability - baseline) / baseline;
  }
  return clampSigned(normalized);
}

function ensureEntryDetails(entry) {
  if (!detailService) return Promise.resolve(entry);
  return detailService.ensureEntryDetails(entry);
}

function normalizeLetterFilter(value) {
  if (!value) return '';
  return value
    .toLowerCase()
    .replace(/[^a-zåäöæøœšžß\u00c0-\u017f,\s\-\^\$\*]/g, '');
}

function parseLetterTokens(value) {
  return (value || '')
    .split(/[,\s]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function buildCharCounts(str) {
  const counts = new Map();
  for (const ch of str.toLowerCase()) {
    const current = counts.get(ch) || 0;
    counts.set(ch, current + 1);
  }
  return counts;
}

function tokenSatisfied(nameCounts, token) {
  if (!token) return true;
  const need = buildCharCounts(token);
  for (const [char, required] of need.entries()) {
    if ((nameCounts.get(char) || 0) < required) return false;
  }
  return true;
}

function isPatternToken(token) {
  return /[\^\*$]/.test(token);
}

function tokenMatchesPattern(name, token) {
  let pattern = '';
  for (const ch of token) {
    if (ch === '*') {
      pattern += '.*';
    } else if (ch === '^' || ch === '$') {
      pattern += ch;
    } else {
      pattern += ch.replace(/[-/\\^$+?.()|[\]{}]/g, '\\$&');
    }
  }
  try {
    const re = new RegExp(pattern, 'i');
    return re.test(name);
  } catch {
    return false;
  }
}

function tokenPasses(name, nameCounts, token) {
  if (isPatternToken(token)) {
    return tokenMatchesPattern(name, token);
  }
  return tokenSatisfied(nameCounts, token);
}

function isFavoriteName(name) {
  return favorites.has(name);
}

function toggleFavoriteName(entry) {
  if (!entry?.name) return;
  const key = entry.name;
  if (favorites.has(key)) {
    favorites.delete(key);
  } else {
    favorites.add(key);
  }
  saveFavorites(favorites, FAVORITES_KEY);
}

function normalizeRangeValues(minValue, maxValue, limits) {
  let min = Number(minValue);
  let max = Number(maxValue);
  if (!Number.isFinite(min)) min = limits.min;
  if (!Number.isFinite(max)) max = limits.max;
  min = Math.max(limits.min, Math.min(min, limits.max));
  max = Math.max(limits.min, Math.min(max, limits.max));
  if (min > max) min = max;
  return { min, max };
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

function estimateSyllables(entry) {
  if (entry.metrics?.syllables != null) {
    return Number(entry.metrics.syllables);
  }
  const syllableString = entry.ipa?.syllables;
  if (syllableString) {
    const parts = splitSyllableMarkers(syllableString);
    if (parts.length) return parts.length;
  }
  return entry.display ? Math.max(1, Math.round(entry.display.length / 3)) : 1;
}

function nextFilterId() {
  filterId += 1;
  return `pf-${filterId}`;
}

function nextGroupFilterId() {
  groupFilterId += 1;
  return `gf-${groupFilterId}`;
}

function restoreFromQuery() {
  const params = new URLSearchParams(window.location.search);
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
    }
  }
}

function updateFavoriteNavHref() {
  const link = document.querySelector('.favorite-nav');
  if (!link) return;
  const params = new URLSearchParams();
  const surname = (state.surname || '').trim();
  if (surname) params.set('surname', surname);
  link.href = params.toString() ? `favorites.html?${params.toString()}` : 'favorites.html';
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
  document.querySelectorAll('input[name="gender"]').forEach((checkbox) => {
    checkbox.checked = state.genders.has(checkbox.value);
  });
  $('#surname-input').value = state.surname;
  $('#letters-include').value = state.includeLettersInput;
  $('#letters-exclude').value = state.excludeLettersInput;
  lettersRangeControl?.setValues(state.letterRange.min, state.letterRange.max);
  updatePopulationInputs();
  $('#sort-key').value = state.sortKey;
  $('#toggle-sort').textContent = state.sortDir === 'asc' ? '↑' : '↓';
  updateSortOptionTooltips();
  renderFeatureFilters();
  renderPopularityFilters();
  updateFilterPanels();
}

function scheduleApplyFilters(skipFormSync = false, delay = 250) {
  clearTimeout(autoApplyTimer);
  autoApplyTimer = setTimeout(() => applyFilters(skipFormSync), delay);
}

function renderFeatureFilters() {
  const container = $('#feature-filters');
  if (!container) return;
  container.innerHTML = '';
  if (!filterFeatureMeta.length) {
    container.innerHTML = '<p class="hint">Ei rajattavia ominaisuuksia.</p>';
    updateFilterPanels();
    return;
  }
  const toggleStates = (current) => {
    const order = ['none', 'include', 'exclude'];
    const idx = order.indexOf(current);
    return order[(idx + 1) % order.length];
  };
  const grid = document.createElement('div');
  grid.className = 'filter-columns';
  filterFeatureMeta.forEach((meta) => {
    const key = meta.key;
    const type = meta.filterType;
    let existing =
      type === 'group'
        ? state.groupFilters.find((f) => f.group === key)
        : state.phoneticFilters.find((f) => f.feature === key);
    const currentMode = existing?.mode || 'none';
    const row = document.createElement('div');
    row.className = 'filter-row';
    const label = document.createElement('div');
    label.textContent =
      type === 'group'
        ? getGroupLabel(groupMeta.get(key)) || meta.label
        : getFeatureLabel(phoneticMeta.get(key)) || meta.label;
    label.className = 'filter-label-text';
    row.appendChild(label);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ghost small tri-toggle';
    const setState = (mode) => {
      button.dataset.state = mode;
      button.textContent = mode === 'include' ? '+' : mode === 'exclude' ? '–' : '○';
    };
    setState(currentMode);
    button.title =
      type === 'group'
        ? getGroupDescription(key) || meta.description
        : getFeatureDescriptionByMeta(phoneticMeta.get(key)) || meta.description;
    button.addEventListener('click', () => {
      const next = toggleStates(button.dataset.state || 'none');
      if (next === 'none') {
        if (type === 'group') {
          state.groupFilters = state.groupFilters.filter((f) => f.group !== key);
          existing = null;
        } else {
          state.phoneticFilters = state.phoneticFilters.filter((f) => f.feature !== key);
          existing = null;
        }
      } else if (existing) {
        existing.mode = next;
      } else if (type === 'group') {
        existing = { id: nextGroupFilterId(), group: key, mode: next };
        state.groupFilters.push(existing);
      } else {
        existing = { id: nextFilterId(), feature: key, mode: next, grade: 1 };
        state.phoneticFilters.push(existing);
      }
      setState(next);
      scheduleApplyFilters(true);
    });
    row.appendChild(button);
    const desc = document.createElement('p');
    desc.className = 'filter-desc';
    desc.textContent =
      type === 'group'
        ? getGroupDescription(key) || meta.description || ''
        : getFeatureDescriptionByMeta(phoneticMeta.get(key)) || meta.description || '';
    row.appendChild(desc);
    grid.appendChild(row);
  });
  container.appendChild(grid);
  updateFilterPanels();
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

function findPopularityByPrefix(prefix) {
  return state.popularityFilters.find((f) => f.group.startsWith(prefix));
}

function setPopularitySelection(prefix, groupKey, mode) {
  state.popularityFilters = state.popularityFilters.filter((f) => !f.group.startsWith(prefix));
  if (!groupKey || mode === 'none') {
    return;
  }
  state.popularityFilters.push({ id: nextGroupFilterId(), group: groupKey, mode });
}

function cycleTriState(current) {
  const order = ['none', 'include', 'exclude'];
  const idx = order.indexOf(current);
  return order[(idx + 1) % order.length];
}

function renderPhoneticFilters() {
  renderFeatureFilters();
}

function renderGroupFilters() {
  renderFeatureFilters();
}

function renderPopularityFilters() {
  const container = $('#popularity-filters');
  if (!container) return;
  container.innerHTML = '';
  const rows = [
    {
      label: 'Suosion huipulla',
      prefix: 'trend_',
      desc: 'Nimet, joiden suosio on ollut huipussaan kyseisellä vuosikymmenellä.'
    },
    {
      label: 'Kasvattanut suosiota',
      prefix: 'growth_',
      desc: 'Nimet, joiden suosio on kasvanut edelliseltä vuosikymmeneltä.'
    },
    {
      label: 'Suosittu',
      prefix: 'popular_',
      desc: 'Kunkin vuosikymmenen 500 suosituinta nimeä'
    }
  ];
  const createSelect = (prefix, options) => {
    const select = document.createElement('select');
    if (!options.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Ei valintoja';
      select.appendChild(opt);
      return select;
    }
    options.forEach((key) => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = getPeriodLabel(key);
      select.appendChild(option);
    });
    return select;
  };
  rows.forEach((rowConfig) => {
    const options = getPopularityOptions(rowConfig.prefix);
    if (!options.length) return;
    const row = document.createElement('div');
    row.className = 'popularity-row';
    const labelEl = document.createElement('div');
    labelEl.textContent = rowConfig.label;
    labelEl.className = 'filter-label-text';
    row.appendChild(labelEl);
    const select = createSelect(rowConfig.prefix, options);
    row.appendChild(select);
    const tri = document.createElement('button');
    tri.type = 'button';
    tri.className = 'ghost small tri-toggle';
    const current = findPopularityByPrefix(rowConfig.prefix);
    if (current) {
      select.value = current.group;
    }
    const setState = (mode) => {
      tri.dataset.state = mode;
      tri.textContent = mode === 'include' ? '+' : mode === 'exclude' ? '–' : '○';
    };
    setState(current ? current.mode : 'none');
    tri.addEventListener('click', () => {
      const next = cycleTriState(tri.dataset.state || 'none');
      setPopularitySelection(rowConfig.prefix, select.value, next);
      setState(next);
      scheduleApplyFilters(true);
    });
    select.addEventListener('change', () => {
      const mode = tri.dataset.state || 'none';
      setPopularitySelection(rowConfig.prefix, select.value, mode);
      scheduleApplyFilters(true);
    });
    row.appendChild(tri);
    container.appendChild(row);
    const desc = document.createElement('p');
    desc.className = 'filter-desc';
    desc.textContent = rowConfig.desc;
    const descWrap = document.createElement('div');
    descWrap.className = 'popularity-row-desc';
    descWrap.appendChild(desc);
    container.appendChild(descWrap);
  });
  updateFilterPanels();
}

function addPopularityFilter() {
  const keys = getPopularityKeys();
  if (!keys.length) return;
  const firstKey = keys[0];
  state.popularityFilters.push({ id: nextGroupFilterId(), group: firstKey, mode: 'include' });
  renderPopularityFilters();
  scheduleApplyFilters(true);
}

function addPhoneticFilter() {
  const firstKey = data.schema.phoneticFeatures[0]?.key;
  if (!firstKey) return;
  state.phoneticFilters.push({ id: nextFilterId(), feature: firstKey, mode: 'include', grade: 1 });
  renderPhoneticFilters();
  scheduleApplyFilters(true);
}

function addGroupFilter() {
  const firstKey = groupFilterKeys[0];
  if (!firstKey) return;
  state.groupFilters.push({ id: nextGroupFilterId(), group: firstKey, mode: 'include' });
  renderGroupFilters();
  scheduleApplyFilters(true);
}

function updateStateFromForm() {
  const selectedGenders = new Set();
  document.querySelectorAll('input[name="gender"]:checked').forEach((checkbox) => {
    selectedGenders.add(checkbox.value);
  });
  state.genders = selectedGenders.size ? selectedGenders : new Set(['female', 'male', 'unisex']);
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
  state.visibleCount = PAGE_SIZE;
  const surnameKey = state.surname.toLowerCase();
  const surnameEntry = surnameKey ? surnameMap.get(surnameKey) : null;
  const missingSurname = Boolean(state.surname && !surnameEntry);
  const surnameCount = surnameEntry ? Number(surnameEntry.popularity) || 0 : 0;
  const filtered = [];
  filteredOutResults = [];

  data.names.forEach((entry) => {
    const reasons = collectFilterFailures(entry);
    entry._match = surnameEntry ? computeMatchScore(entry, surnameEntry) : null;
    if (surnameCount && entry.populationShare) {
      const comboValue = surnameCount * entry.populationShare;
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
  state.matchInfo = { surnameEntry, missingSurname };
  updateSurnameAnalysis(surnameEntry, missingSurname);
  renderResults();
  updateUrl();
}

function passesGroupFilters(entry) {
  return getGroupFilterReasons(entry).length === 0;
}

function passesPopularityFilters(entry) {
  return getPopularityFilterReasons(entry).length === 0;
}

function passesLetterFilters(entry) {
  const name = (entry.name || entry.display || '').toLowerCase();
  const nameCounts = buildCharCounts(name);
  const includeTokens = parseLetterTokens(state.includeLettersInput);
  const excludeTokens = parseLetterTokens(state.excludeLettersInput);
  if (includeTokens.length && !includeTokens.some((token) => tokenPasses(name, nameCounts, token))) return false;
  if (excludeTokens.length && excludeTokens.some((token) => tokenPasses(name, nameCounts, token))) return false;
  return true;
}

function passesLengthFilters(entry) {
  const length = Number(entry.metrics?.length ?? entry.display?.length ?? 0);
  if (length < state.letterRange.min || length > state.letterRange.max) {
    return false;
  }
  return true;
}

function passesPopulationFilter(entry) {
  const total = Number(entry.popularity?.total ?? 0);
  if (Number.isNaN(total)) return false;
  if (total < state.populationRange.min) return false;
  if (total > state.populationRange.max) return false;
  return true;
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
        renderPopularityFilters();
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

function collectFilterFailures(entry) {
  const reasons = [];
  if (!state.genders.has(entry.gender) && entry.gender !== 'unknown') {
    reasons.push({
      key: 'gender',
      text: 'Sukupuolirajaus',
      remove: null
    });
  }
  const name = (entry.name || entry.display || '').toLowerCase();
  const includeTokens = parseLetterTokens(state.includeLettersInput);
  if (includeTokens.length) {
    const nameCounts = buildCharCounts(name);
    const satisfied = includeTokens.some((token) => tokenPasses(name, nameCounts, token));
    if (!satisfied) {
      reasons.push({
        text: `Ei täytä: ${includeTokens.join(', ')}`,
        remove: () => {
          state.includeLettersInput = '';
          const includeInput = $('#letters-include');
          if (includeInput) includeInput.value = '';
          applyFilters(true);
        }
      });
    }
  }
  const excludeTokens = parseLetterTokens(state.excludeLettersInput);
  if (excludeTokens.length) {
    const nameCounts = buildCharCounts(name);
    const present = excludeTokens.filter((token) => token && tokenPasses(name, nameCounts, token));
    if (present.length) {
      reasons.push({
        text: `Kielletyt jaksot: ${present.join(', ')}`,
        remove: () => {
          state.excludeLettersInput = '';
          const excludeInput = $('#letters-exclude');
          if (excludeInput) excludeInput.value = '';
          applyFilters(true);
        }
      });
    }
  }
  const lengthValue = Number(entry.metrics?.length ?? entry.display?.length ?? 0);
  if (lengthValue < state.letterRange.min || lengthValue > state.letterRange.max) {
    reasons.push({
      text: `Pituusraja ${state.letterRange.min}-${state.letterRange.max}`,
      remove: () => {
        state.letterRange = { ...LETTER_LIMITS };
        lettersRangeControl?.setValues(LETTER_LIMITS.min, LETTER_LIMITS.max);
        applyFilters(true);
      }
    });
  }
  const total = Number(entry.popularity?.total ?? 0);
  if (Number.isNaN(total) || total < state.populationRange.min || total > state.populationRange.max) {
    reasons.push({
      text: 'Nimenhaltijoiden määrä rajattu',
      remove: () => {
        state.populationRange = { ...POPULATION_LIMITS };
        updatePopulationInputs();
        applyFilters(true);
      }
    });
  }
  reasons.push(...getGroupFilterReasons(entry));
  reasons.push(...getPopularityFilterReasons(entry));
  reasons.push(...getPhoneticFilterReasons(entry));
  return reasons;
}

function getGroupFilterReasons(entry) {
  if (!state.groupFilters.length) return [];
  const reasons = [];
  const groups = Array.isArray(entry.groups) ? entry.groups : [];
  state.groupFilters.forEach((filter) => {
    const hasGroup = groups.includes(filter.group);
    const label = getGroupLabel(groupMeta.get(filter.group)) || filter.group;
    if (filter.mode === 'include' && !hasGroup) {
      reasons.push({
        text: `Puuttuu ryhmä: ${label}`,
        remove: () => {
          state.groupFilters = state.groupFilters.filter((f) => f.id !== filter.id);
          applyFilters(true);
        }
      });
    }
    if (filter.mode === 'exclude' && hasGroup) {
      reasons.push({
        text: `Poistettu ryhmän vuoksi: ${label}`,
        remove: () => {
          state.groupFilters = state.groupFilters.filter((f) => f.id !== filter.id);
          applyFilters(true);
        }
      });
    }
  });
  return reasons;
}

function getPopularityFilterReasons(entry) {
  if (!state.popularityFilters.length) return [];
  const reasons = [];
  const groups = Array.isArray(entry.groups) ? entry.groups : [];
  state.popularityFilters.forEach((filter) => {
    const hasGroup = groups.includes(filter.group);
    const label = formatPopularityLabel(filter.group);
    if (filter.mode === 'include' && !hasGroup) {
      reasons.push({
        text: `Ei kuulu joukkoon: ${label}`,
        remove: () => {
          state.popularityFilters = state.popularityFilters.filter((f) => f.id !== filter.id);
          applyFilters(true);
        }
      });
    }
    if (filter.mode === 'exclude' && hasGroup) {
      reasons.push({
        text: `Poistettu suosion vuoksi: ${label}`,
        remove: () => {
          state.popularityFilters = state.popularityFilters.filter((f) => f.id !== filter.id);
          applyFilters(true);
        }
      });
    }
  });
  return reasons;
}

function getPhoneticFilterReasons(entry) {
  if (!state.phoneticFilters.length) return [];
  const reasons = [];
  state.phoneticFilters.forEach((filter) => {
    const feature = entry.phonetic[filter.feature];
    const label = getFeatureLabel(phoneticMeta.get(filter.feature)) || filter.feature;
    const mode = filter.mode;
    if (!feature) {
        reasons.push({
          text: `Ei tietoa: ${label}`,
          remove: () => {
            state.phoneticFilters = state.phoneticFilters.filter((f) => f.id !== filter.id);
            applyFilters(true);
          }
        });
      return;
    }
    if (mode === 'include') {
      if (!feature.value) {
        reasons.push({
          text: `Puuttuu piirre: ${label}`,
          remove: () => {
            state.phoneticFilters = state.phoneticFilters.filter((f) => f.id !== filter.id);
            applyFilters(true);
          }
        });
      }
    } else if (mode === 'exclude') {
      if (feature.value) {
        reasons.push({
          text: `Suodatettu piirteen vuoksi: ${label}`,
          remove: () => {
            state.phoneticFilters = state.phoneticFilters.filter((f) => f.id !== filter.id);
            applyFilters(true);
          }
        });
      }
    }
  });
  return reasons;
}

function passesPhoneticFilters(entry) {
  return getPhoneticFilterReasons(entry).length === 0;
}

function sortResults(list) {
  const dir = state.sortDir === 'asc' ? 1 : -1;
  const metricKeys = new Set((data.schema.metrics || []).map((m) => m.key));
  const periodRanks = new Map();
  (data.schema.sorting || [])
    .filter((option) => option.period)
    .forEach((option) => {
      periodRanks.set(option.key, option.period);
    });
  const activeSortKey =
    !state.surname && state.sortKey === 'match' ? 'popularity' : state.sortKey;
  list.sort((a, b) => {
    const aVal = getSortValue(a);
    const bVal = getSortValue(b);
    if (aVal === bVal) {
      return a.display.localeCompare(b.display, 'fi');
    }
    return aVal > bVal ? dir : -dir;
  });

  function getSortValue(entry) {
    if (activeSortKey === 'alpha') {
      return entry.display;
    }
    if (activeSortKey === 'popularity') {
      return entry.popularity.total;
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
      return entry.metrics[activeSortKey];
    }
    if (activeSortKey.endsWith('_intensity')) {
      const base = activeSortKey.replace('_intensity', '');
      return entry.phonetic[base]?.intensity ?? 0;
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clampSigned(value) {
  if (!Number.isFinite(value)) return 0;
  return clamp(value, -1, 1);
}

function mapZeroOneToSigned(value) {
  if (!Number.isFinite(value)) return 0;
  return clamp(value * 2 - 1, -1, 1);
}

const SYLLABLE_SPLIT_REGEX = /[+-]+/;

function splitSyllableMarkers(value = '') {
  if (!value) return [];
  return value.split(SYLLABLE_SPLIT_REGEX).filter(Boolean);
}

const NEUTRAL_VOWEL_GAP = 0.08;
const CLOSE_VOWEL_PENALTY = { threshold: 0.65, strength: 0.6, exponent: 1.4 };

function levenshteinDistance(a = '', b = '') {
  const lenA = a.length;
  const lenB = b.length;
  if (!lenA) return lenB;
  if (!lenB) return lenA;
  const prev = new Array(lenB + 1);
  const curr = new Array(lenB + 1);
  for (let j = 0; j <= lenB; j += 1) {
    prev[j] = j;
  }
  for (let i = 1; i <= lenA; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= lenB; j += 1) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1];
      } else {
        curr[j] = Math.min(prev[j - 1], prev[j], curr[j - 1]) + 1;
      }
    }
    for (let j = 0; j <= lenB; j += 1) {
      prev[j] = curr[j];
    }
  }
  return prev[lenB];
}

function computeRhythmSimilarity(codeA, codeB) {
  if (!codeA || !codeB) return 0;
  const distance = levenshteinDistance(codeA, codeB);
  const maxLen = Math.max(codeA.length, codeB.length) || 1;
  const similarity = 1 - distance / maxLen;
  return clamp(similarity, 0, 1);
}

function applyCloseVowelPenalty(score, metricsFirst, metricsLast) {
  if (score <= 0) return score;
  const closeFirst = metricsFirst.close_ratio ?? 0;
  const closeLast = metricsLast.close_ratio ?? 0;
  const avgClose = (closeFirst + closeLast) / 2;
  const { threshold, strength, exponent } = CLOSE_VOWEL_PENALTY;
  if (avgClose <= threshold) return score;
  const intensity = Math.min(1, (avgClose - threshold) / Math.max(1e-6, 1 - threshold));
  const penalty = Math.min(1, strength * Math.pow(intensity, exponent));
  return clampSigned(score - penalty);
}

function computeCvSequencingScore(firstSimple, lastSimple) {
  const firstProfile = buildCvTransitionProfile(firstSimple);
  const lastProfile = buildCvTransitionProfile(lastSimple);
  if (!firstProfile || !lastProfile) {
    return 0;
  }
  const keys = ['cv', 'vc', 'cc', 'vv'];
  let diff = 0;
  keys.forEach((key) => {
    diff += Math.abs((firstProfile[key] ?? 0) - (lastProfile[key] ?? 0));
  });
  const similarity = clamp(1 - diff / 2, 0, 1);
  return mapZeroOneToSigned(similarity);
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

function computeLengthBias(firstLength, lastLength) {
  if (!Number.isFinite(firstLength) || !Number.isFinite(lastLength)) {
    return 0;
  }
  const SHORT_LAST = 4;
  const LONG_LAST = 8;
  const MAX_BIAS = 0.15;

  if (lastLength >= LONG_LAST) {
    const diff = lastLength - firstLength; // positive when first is shorter
    return clamp((diff / Math.max(lastLength, 1)) * 0.6, -MAX_BIAS, MAX_BIAS);
  }
  if (lastLength <= SHORT_LAST) {
    const diff = firstLength - lastLength; // positive when first longer
    return clamp((diff / Math.max(firstLength, 1)) * 0.6, -MAX_BIAS, MAX_BIAS);
  }
  return 0;
}

function endStartMatch(first, last, depth = 1) {
  if (!first || !last) return 0;
  const firstTail = first.slice(-depth);
  const lastHead = last.slice(0, depth);
  let score = 0;
  const limit = Math.min(firstTail.length, lastHead.length);
  for (let i = 0; i < limit; i += 1) {
    if (firstTail[i] === lastHead[i]) {
      score += 1;
    }
  }
  return score / (depth || 1);
}

function evaluateMatchComponents(first, last) {
  if (!matchingModel) {
    return {
      components: {},
      weightedSum: 0,
      normalized: 0
    };
  }
  const weights = getActiveWeights();
  const result = computeModelPairScore(first, last, weights, matchingModel);
  if (!result) {
    return { components: {}, weightedSum: 0, normalized: 0 };
  }
  return {
    components: result.components || {},
    weightedSum: result.weightedSum ?? 0,
    normalized: Math.round((result.normalized ?? 0) * 1000) / 1000
  };
}

function computeMatchScore(first, last) {
  const result = evaluateMatchComponents(first, last);
  return result.normalized;
}

function describeLetters(group) {
  if (!group) return '';
  return group
    .split('')
    .filter((c, idx, arr) => arr.indexOf(c) === idx)
    .join('/');
}

function describeRhythmPattern(pat) {
  if (!pat) return '';
  return pat
    .split('')
    .map((c) => (c === 'R' ? 'pitkän kuuloinen tavu' : 'lyhyen kuuloinen tavu'))
    .join(' – ');
}

function describeComponentForName(component, buckets, weights) {
  const firstDesc = (key) => friendlyBucket(component, buckets[`${component}_${key}`], key).phrase;
  switch (component) {
    case 'vowel_location':
    case 'vowel_openess':
      return `Etunimen ja sukunimen vokaalit ovat samantyyppisiä (${firstDesc('obs')} / ${firstDesc('cond')}), joten nimi soljuu luontevasti.`;
    case 'softness':
      return `Etunimen ja sukunimen konsonantit ovat samassa pehmeysskaalassa (${firstDesc('obs')} / ${firstDesc('cond')}), mikä kuulostaa miellyttävältä.`;
    case 'tone':
      return `Nimessä on samansävyinen sointi (${firstDesc('obs')} / ${firstDesc('cond')}), joten kokonaisuus ei riitele.`;
    case 'syllables': {
      const fo = buckets.syllables_obs;
      const so = buckets.syllables_cond;
      return `Etunimessä on ${fo} tavua ja sukunimessä ${so} tavua – pituudet tukevat toisiaan.`;
    }
    case 'length': {
      const fo = buckets.length_obs;
      const so = buckets.length_cond;
      return `Etunimen (${fo}) ja sukunimen (${so}) kirjainmäärä on tasapainossa.`;
    }
    case 'rhythm': {
      const fo = describeRhythmPattern(buckets.rhythm_obs);
      const so = describeRhythmPattern(buckets.rhythm_cond);
      return `Etunimen ja sukunimen tavurytmi muistuttavat toisiaan (${fo || 'tasainen'} / ${so || 'tasainen'}), mikä tekee nimestä sujuvan.`;
    }
    case 'head_transition': {
      const cond = describeLetters(buckets.head_transition_cond);
      return `Sukunimi alkaa äänteellä ${cond}. Etunimen aloitus sopii luontevasti samaan alkusointiin.`;
    }
    case 'end_start_transition': {
      const cond = describeLetters(buckets.end_start_transition_cond);
      return `Etunimen loppu ja sukunimen alku kohtaavat pehmeästi (sukunimi alkaa ${cond}).`;
    }
    default:
      return '';
  }
}

function buildMatchHighlights(entry, surnameEntry) {
  if (!surnameEntry || !matchingModel) return [];
  const weights = getActiveWeights();
  const result = computeModelPairScore(entry, surnameEntry, weights, matchingModel);
  if (!result) return [];
  const buckets = computeBuckets(entry, surnameEntry);
  const items = [];
  Object.entries(result.components || {}).forEach(([key, value]) => {
    const weight = weights[key];
    if (weight == null) return;
    const signed = key === 'alliteration' || key === 'oddness' ? value : mapZeroOneToSigned(value);
    const contrib = signed * weight;
    if (contrib <= 0) return;
    const text = describeComponentForName(key, buckets, weights);
    if (text) {
      items.push({ key, contrib, text });
    }
  });
  items.sort((a, b) => Math.abs(b.contrib) - Math.abs(a.contrib));
  return items.slice(0, 5).map((item) => item.text);
}
function renderSurnameExplainLink(entry) {
  let link = document.getElementById('surname-explain-link');
  if (!entry) {
    if (link) link.remove();
    return;
  }
  const container = document.getElementById('surname-analysis');
  if (!container) return;
  if (!link) {
    return;
  } else {
    link.remove();
  }
}

function openSurnameExplain(entry) {
  if (!surnameExplainModal || !entry) return;
  const content = document.getElementById('surname-explain-content');
  if (!content || !matchingModel) return;
  content.innerHTML = '';
  const explanations = buildExplanation(entry, 'last', matchingModel);
  explanations.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'card';
    const h = document.createElement('h3');
    h.textContent = item.label;
    const p = document.createElement('p');
    p.textContent = item.text;
    card.appendChild(h);
    card.appendChild(p);
    content.appendChild(card);
  });
  surnameExplainModal.hidden = false;
  document.body.classList.add('modal-open');
}


function initWeightEditor() {
  if (weightEditorControls || !document) return;
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
  weightEditorControls = {
    trigger,
    modal,
    list: $('#weight-editor-list'),
    total: $('#weight-editor-total'),
    remaining: $('#weight-editor-remaining'),
    error: $('#weight-editor-error'),
    save: $('#weight-editor-save'),
    description: $('#weight-editor-description'),
    title: $('#weight-editor-title'),
    eyebrow: $('#weight-editor-eyebrow'),
    reset: modal.querySelector('[data-action="reset-weight-editor"]'),
    cancel: modal.querySelector('[data-action="cancel-weight-editor"]')
  };
  trigger.addEventListener('click', () => openWeightEditor());
  modal.querySelectorAll('[data-action="dismiss-weight-editor"]').forEach((el) => {
    el.addEventListener('click', () => closeWeightEditor());
  });
  weightEditorControls.cancel?.addEventListener('click', () => closeWeightEditor());
  weightEditorControls.reset?.addEventListener('click', () =>
    renderWeightEditorRows(null, defaultMatchingWeights)
  );
  weightEditorControls.save?.addEventListener('click', applyWeightEditorChanges);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isWeightEditorOpen()) {
      event.preventDefault();
      closeWeightEditor();
    }
  });
  syncWeightEditorTexts();
}

function isWeightEditorOpen() {
  return Boolean(weightEditorControls && weightEditorControls.modal && !weightEditorControls.modal.hidden);
}

function openWeightEditor(prefillMap) {
  if (!weightEditorControls) return;
  renderWeightEditorRows(prefillMap);
  syncWeightEditorTexts();
  weightEditorControls.modal.hidden = false;
  document.body.classList.add('modal-open');
}

function closeWeightEditor() {
  if (!weightEditorControls) return;
  weightEditorControls.modal.hidden = true;
  document.body.classList.remove('modal-open');
  weightEditorInputs = [];
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
  if (!isWeightEditorOpen()) {
    document.body.classList.remove('modal-open');
  }
}

function renderWeightEditorRows(prefillValues, sourceWeights) {
  if (!weightEditorControls?.list) return;
  const weights = sourceWeights || getActiveWeights();
  const localeLabels = translations.fi?.weightEditor;
  const surnameEntry = state.matchInfo?.surnameEntry;
  const typedSurname = getTypedSurname();
  const traitEntries = buildSurnameTraitSentences(surnameEntry, 'stats', 'surname', typedSurname);
  const traitMap = new Map(traitEntries.map((item) => [item.key, item.text]));
  weightEditorControls.list.innerHTML = '';
  weightEditorInputs = [];
  MATCH_WEIGHT_FIELDS.forEach((meta) => {
    const row = document.createElement('div');
    row.className = 'weight-row';
    const header = document.createElement('div');
    header.className = 'weight-row-header';

    const legendWrap = document.createElement('div');
    const labelEl = document.createElement('div');
    labelEl.className = 'weight-row-label';
    labelEl.textContent = meta.label;
    legendWrap.appendChild(labelEl);
    const descEl = document.createElement('p');
    descEl.className = 'weight-row-description';
    descEl.textContent = meta.description;
    legendWrap.appendChild(descEl);
    if (traitMap.has(meta.key)) {
      const traitEl = document.createElement('p');
      traitEl.className = 'weight-row-trait';
      traitEl.textContent = traitMap.get(meta.key);
      legendWrap.appendChild(traitEl);
    }
    header.appendChild(legendWrap);

    const inputWrap = document.createElement('div');
    inputWrap.className = 'weight-row-input';
    const inputEl = document.createElement('input');
    inputEl.type = 'number';
    inputEl.min = '-100';
    inputEl.max = '100';
    inputEl.step = '5';
    inputEl.inputMode = 'numeric';
    inputEl.dataset.key = meta.key;
    const valueString =
      prefillValues && prefillValues.has(meta.key)
        ? prefillValues.get(meta.key)
        : formatPercentNumber(weightToPercent(weights[meta.key] ?? 0, weightPercentBudget));
    inputEl.value = valueString;
    inputEl.addEventListener('input', handleWeightInputChange);
    inputWrap.appendChild(inputEl);
    const suffix = document.createElement('span');
    suffix.textContent = '%';
    inputWrap.appendChild(suffix);
    header.appendChild(inputWrap);
    row.appendChild(header);
    weightEditorControls.list.appendChild(row);
    weightEditorInputs.push({ key: meta.key, input: inputEl, row });

    const numericValue = Number.parseFloat(valueString);
    if (localeLabels?.penaltyNote && Number.isFinite(numericValue) && numericValue < 0) {
      const note = document.createElement('p');
      note.className = 'weight-row-note';
      note.textContent = localeLabels.penaltyNote;
      row.appendChild(note);
    }
  });
  updateWeightEditorTotals();
}

function handleWeightInputChange(event) {
  const target = event.target;
  updateWeightEditorTotals();
  const entry = weightEditorInputs.find((item) => item.input === target);
  if (!entry) return;
  const value = Number.parseFloat(target.value);
  const note = entry.row.querySelector('.weight-row-note');
  const editorStrings = translations.fi?.weightEditor;
  if (Number.isFinite(value) && value < 0) {
    if (!note && editorStrings?.penaltyNote) {
      const noteEl = document.createElement('p');
      noteEl.className = 'weight-row-note';
      noteEl.textContent = editorStrings.penaltyNote;
      entry.row.appendChild(noteEl);
    }
  } else if (note) {
    note.remove();
  }
}

function updateWeightEditorTotals() {
  if (!weightEditorControls) return;
  const locale = translations.fi?.weightEditor;
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
  if (weightEditorControls.total) {
    weightEditorControls.total.textContent = locale?.total
      ? locale.total(total)
      : `Yhteensä ${total.toFixed(1)}% / 100%`;
  }
  if (weightEditorControls.remaining) {
    if (locale?.balance) {
      weightEditorControls.remaining.textContent = locale.balance(balance);
    } else {
      weightEditorControls.remaining.textContent =
        balance > 0
          ? `${balance.toFixed(1)}% jäljellä`
          : balance < 0
            ? `${Math.abs(balance).toFixed(1)}% yli`
            : 'Tasapainossa';
    }
  }
  const needsAdjustment = Math.abs(balance) > WEIGHT_SUM_TOLERANCE;
  let error = '';
  if (hasInvalid) {
    error = locale?.invalid || 'Täytä jokainen kenttä.';
  } else if (needsAdjustment) {
    error = locale?.absRequirement || 'Painojen itseisarvojen summan tulee olla 100 %.';
  }
  if (weightEditorControls.error) {
    weightEditorControls.error.textContent = error;
  }
  if (weightEditorControls.save) {
    weightEditorControls.save.disabled = hasInvalid || needsAdjustment;
  }
}

function applyWeightEditorChanges() {
  if (!weightEditorControls?.save || weightEditorControls.save.disabled) return;
  const baseWeights = { ...(defaultMatchingWeights || data?.schema?.matching?.weights || {}) };
  const updated = { ...baseWeights };
  weightEditorInputs.forEach((item) => {
    const value = Number.parseFloat(item.input.value);
    if (!Number.isFinite(value)) {
      return;
    }
    updated[item.key] = percentToWeight(value, weightPercentBudget);
  });
  const normalizedUpdate = normalizeWeightMap(updated);
  const isSame = areWeightsEqual(normalizedUpdate, baseWeights);
  state.weightOverrides = isSame ? null : normalizedUpdate;
  weightPercentBudget = computeAbsoluteWeightBudget(getActiveWeights()) || 1;
  persistSharedWeights(state.weightOverrides, defaultMatchingWeights);
  closeWeightEditor();
  applyFilters();
}

function syncWeightEditorTexts() {
  if (!weightEditorControls) return;
  const locale = translations.fi?.weightEditor;
  if (locale?.eyebrow && weightEditorControls.eyebrow) {
    weightEditorControls.eyebrow.textContent = locale.eyebrow;
  }
  if (locale?.title && weightEditorControls.title) {
    weightEditorControls.title.textContent = locale.title;
  }
  if (locale?.description && weightEditorControls.description) {
    weightEditorControls.description.textContent = locale.description;
  }
  if (locale?.resetLabel && weightEditorControls.reset) {
    weightEditorControls.reset.textContent = locale.resetLabel;
  }
  if (locale?.cancelLabel && weightEditorControls.cancel) {
    weightEditorControls.cancel.textContent = locale.cancelLabel;
  }
  if (locale?.confirmLabel && weightEditorControls.save) {
    weightEditorControls.save.textContent = locale.confirmLabel;
  }
  if (isWeightEditorOpen()) {
    const existingValues = new Map(weightEditorInputs.map((entry) => [entry.key, entry.input.value]));
    renderWeightEditorRows(existingValues);
  }
}

function renderActiveFilters() {
  const container = $('#active-filters');
  if (!container) return;
  container.innerHTML = '';
  const chips = getActiveFilterChips();
  if (!chips.length) {
    container.hidden = true;
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
}

function createNameCard(entry, t, surnameEntry, { filtered = false } = {}) {
  return createCardShell(entry, {
    t,
    surnameEntry,
    filtered,
    isFavorite: () => isFavoriteName(entry.name),
    toggleFavorite: toggleFavoriteName,
    onOpen: (detailsEl, bodyEl) => loadCardDetails(detailsEl, bodyEl, entry, t, surnameEntry)
  });
}

function shouldShowDetailAd() {
  return detailAds.shouldShow();
}

function createFilteredGroupPlaceholder(filteredEntries, t, surnameEntry, blockId) {
  const wrapper = document.createElement('div');
  wrapper.className = 'filtered-divider';
  if (!filteredEntries.length) {
    const top = document.createElement('div');
    top.className = 'filtered-line';
    wrapper.appendChild(top);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ghost small filtered-toggle';
    button.textContent = 'Suodatetut nimet on piilotettu';
    wrapper.appendChild(button);
    const bottom = document.createElement('div');
    bottom.className = 'filtered-line';
    wrapper.appendChild(bottom);
    return wrapper;
  }
  const line = document.createElement('div');
  line.className = 'filtered-line';
  wrapper.appendChild(line);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ghost small filtered-toggle';
  button.textContent = `${filteredEntries.length} nimeä suodatettu, klikkaa näyttääksesi`;
  button.addEventListener('click', () => {
    expandedFilteredBlocks.add(blockId);
    renderResults();
  });
  wrapper.appendChild(button);
  const bottomLine = document.createElement('div');
  bottomLine.className = 'filtered-line';
  wrapper.appendChild(bottomLine);
  return wrapper;
}

function createExpandedFilteredGroup(filteredEntries, t, surnameEntry, blockId) {
  const expanded = document.createElement('div');
  expanded.className = 'filtered-expanded';
  const makeCollapse = () => {
    const collapse = document.createElement('button');
    collapse.type = 'button';
    collapse.className = 'ghost small filtered-toggle';
    collapse.textContent = 'Piilota suodatetut nimet';
    collapse.addEventListener('click', () => {
      expandedFilteredBlocks.delete(blockId);
      renderResults();
    });
    return collapse;
  };
  expanded.appendChild(makeCollapse());

  const listContainer = document.createElement('div');
  listContainer.className = 'filtered-chunk';
  expanded.appendChild(listContainer);
  expanded.appendChild(makeCollapse());

  return { expanded, listContainer };
}

function renderResults() {
  const t = translations.fi;
  const list = $('#results-list');
  const { surnameEntry, missingSurname } = state.matchInfo;
  const totalAvailable = getFilteredCount();
  setAdSlotsEnabled('results', totalAvailable > 0);
  list.innerHTML = '';
  let renderedCount = 0;
  let usedSlots = 0;
  let filteredBlockCounter = 0;
  const activeBlockIds = new Set();
  let hitVisibleLimit = false;
  if (!totalAvailable) {
    list.innerHTML = `<p class="hint">${t.noResults}</p>`;
  } else {
    let filteredBuffer = [];
    let bufferStartIndex = null;
    const flushFilteredBuffer = () => {
      if (!filteredBuffer.length) return;
      const blockId = `filtered-${bufferStartIndex ?? filteredBlockCounter}`;
      filteredBlockCounter += 1;
      activeBlockIds.add(blockId);
      const isExpanded = expandedFilteredBlocks.has(blockId);
      if (isExpanded) {
        const { expanded, listContainer } = createExpandedFilteredGroup(
          filteredBuffer,
          t,
          surnameEntry,
          blockId
        );
        list.appendChild(expanded);
        for (const entry of filteredBuffer) {
          if (usedSlots >= state.visibleCount) {
            hitVisibleLimit = true;
            break;
          }
          const card = createNameCard(entry, t, surnameEntry, { filtered: true });
          listContainer.appendChild(card);
          usedSlots += 1;
          renderedCount += 1;
        }
      } else {
        const placeholder = createFilteredGroupPlaceholder(filteredBuffer, t, surnameEntry, blockId);
        list.appendChild(placeholder);
      }
      filteredBuffer = [];
      bufferStartIndex = null;
    };
    for (let idx = 0; idx < orderedResults.length; idx += 1) {
      if ((usedSlots >= state.visibleCount && filteredBuffer.length === 0) || hitVisibleLimit) {
        break;
      }
      const entry = orderedResults[idx];
      const isFiltered = entry._filteredReasons?.length;
      const hasGenderBlock = entry._filteredReasons?.some((r) => r.key === 'gender');
      if (isFiltered) {
        if (hasGenderBlock) {
          continue;
        }
        if (!filteredBuffer.length) {
          bufferStartIndex = idx;
        }
        filteredBuffer.push(entry);
        continue;
      }
      flushFilteredBuffer();
      if (hitVisibleLimit || usedSlots >= state.visibleCount) {
        break;
      }
      const card = createNameCard(entry, t, surnameEntry, { filtered: false });
      list.appendChild(card);
      usedSlots += 1;
      renderedCount += 1;
    }
    if (!hitVisibleLimit) {
      flushFilteredBuffer();
    }
  }
  Array.from(expandedFilteredBlocks).forEach((id) => {
    if (!activeBlockIds.has(id)) {
      expandedFilteredBlocks.delete(id);
    }
  });
  const shownCount = Math.min(usedSlots, totalAvailable);
  $('#result-count').textContent = totalAvailable
    ? t.results(1, shownCount, totalAvailable)
    : t.noResults;
  const typedSurname = getTypedSurname();
  const surnameLabel = typedSurname || state.surname || '';
  $('#match-context').textContent = missingSurname
    ? translations.fi.missingSurname(surnameLabel)
    : translations.fi.match(surnameLabel || (surnameEntry?.display ?? ''));
  renderActiveFilters();
  const loadMoreBtn = $('#load-more');
  if (loadMoreBtn) {
    const hasMore = shownCount < totalAvailable;
    loadMoreBtn.disabled = !hasMore;
    loadMoreBtn.hidden = totalAvailable === 0;
    loadMoreBtn.textContent = hasMore ? 'Näytä lisää nimiä' : 'Ei enempää nimiä';
  }
}

function loadCardDetails(card, bodyContainer, entry, t, surnameEntry) {
  if (card.dataset.hydrated === 'true') {
    if (card._detailRefs?.wikiBlock) {
      fetchWikiSummary(entry, card._detailRefs.wikiBlock, {
        loadingText: t.wikiLoading,
        unavailableText: t.wikiUnavailable,
        title: t.wikiTitle,
        includeLink: true,
        linkLabel: 'Wikipedia'
      });
    }
    return;
  }
  if (card.dataset.loading === 'true') {
    return;
  }
  card.dataset.loading = 'true';
  bodyContainer.innerHTML = `<p class="hint">${t.detailsLoading}</p>`;
  ensureEntryDetails(entry)
    .then(() => {
      card.dataset.loading = 'false';
      const refs = hydrateCardBody(card, bodyContainer, entry, t, surnameEntry);
      if (refs?.wikiBlock) {
        fetchWikiSummary(entry, refs.wikiBlock, {
          loadingText: t.wikiLoading,
          unavailableText: t.wikiUnavailable,
          title: t.wikiTitle,
          includeLink: true,
          linkLabel: 'Wikipedia'
        });
      }
    })
    .catch(() => {
      card.dataset.loading = 'false';
      bodyContainer.innerHTML = `<p class="hint">${t.detailsError}</p>`;
    });
}

function hydrateCardBody(card, container, entry, t, surnameEntry) {
  container.innerHTML = '';
  const wikiBlock = document.createElement('div');
  wikiBlock.className = 'wiki-summary';
  wikiBlock.dataset.status = 'idle';
  container.appendChild(wikiBlock);

  const details = document.createElement('div');
  details.className = 'details-section';
  const groupsHtml = renderCombinedTraits(entry, t);
  if (groupsHtml) {
    const groupRow = createDetailRow('Ominaisuudet', groupsHtml);
    if (groupRow) details.appendChild(groupRow);
  }

  if (surnameEntry) {
    const comboContent = renderComboEstimate(entry, t, surnameEntry);
    if (comboContent) {
      const comboRow = createDetailRow(t.comboRowLabel, comboContent);
      if (comboRow) details.appendChild(comboRow);
    }
  }

  if (surnameEntry && shouldShowDetailAd()) {
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
  const historyLabel = createHistoryLabel(entry, t);
  const historyRow = createDetailRow(historyLabel, historyContent, { asHtml: true });
  if (historyRow) {
    historyRow.classList.add('chart-row');
    details.appendChild(historyRow);
  }

  const ageContent = document.createElement('div');
  ageContent.className = 'chart-shell';
  const ageChart = document.createElement('div');
  ageChart.className = 'plotly-chart';
  ageContent.appendChild(ageChart);
  const ageRow = createDetailRow(t.ageDistributionTitle, ageContent);
  if (ageRow) {
    ageRow.classList.add('chart-row');
    details.appendChild(ageRow);
  }

  container.appendChild(details);

  const descriptionText = entry.description_fi || '';
  if (descriptionText) {
    const desc = document.createElement('div');
    desc.className = 'description';
    desc.textContent = descriptionText;
    container.appendChild(desc);
  }
  const affiliateLink = document.createElement('a');
  affiliateLink.className = 'affiliate-link';
  affiliateLink.href = '#';
  affiliateLink.textContent = 'Tilaa vauvan nimellä varustettu body';
  affiliateLink.target = '_blank';
  affiliateLink.rel = 'noopener';
  affiliateLink.hidden = true;
  container.appendChild(affiliateLink);

  const historyContainer = historyChart;
  renderUsageChart(historyContainer, entry.history, {
    noData: t.historyNoData,
    legendMale: t.historyLegendMale,
    legendFemale: t.historyLegendFemale,
    yAxis: t.historyYAxis
  });
  const ageContainer = ageChart;
  renderAgeDistributionChart(ageContainer, entry.population, entry.popularity.total, {
    noData: t.ageDistributionNoData,
    yAxis: t.ageDistributionYAxis
  });

  card.dataset.hydrated = 'true';
  const refs = { wikiBlock, historyContainer, ageContainer };
  card._detailRefs = refs;
  return refs;
}

function formatPercent(value) {
  if (!value) {
    return '0%';
  }
  const percent = value * 100;
  if (percent >= 0.01) {
    return `${percent.toFixed(2)}%`;
  }
  return `${percent.toFixed(4)}%`;
}

function formatNumberWithSpaces(value) {
  if (value == null || Number.isNaN(value)) {
    return '';
  }
  const rounded = Math.round(value);
  return rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

function formatPercentShort(value) {
  if (!Number.isFinite(value)) {
    return '0%';
  }
  return `${Math.round(value * 100)}%`;
}

function formatSurnameQuote(name) {
  if (!name) return '';
  return `“${name}”`;
}

function buildSurnameTraitSentences(entry, mode = 'analysis', role = 'surname', overrideName = null) {
  if (!entry) return [];
  const metrics = entry.metrics || {};
  const simple = entry.ipa?.simple || entry.display || entry.name || '';
  const context = {
    entry,
    metrics,
    name: overrideName || entry.display || entry.name || '',
    mode,
    simple,
    role
  };
  const results = [];
  const builders = [
    { key: 'vowel_location', fn: describeVowelLocationTrait },
    { key: 'vowel_openess', fn: describeVowelOpennessTrait },
    { key: 'softness', fn: describeSoftnessTrait },
    { key: 'tone', fn: describeToneTrait },
    { key: 'rhythm', fn: describeRhythmicPatternTrait },
    { key: 'length', fn: describeLengthTrait }
  ];
  builders.forEach(({ key, fn }) => {
    const text = fn(context);
    if (text) {
      results.push({ key, text });
    }
  });
  return results;
}

function describeVowelLocationTrait({ metrics, name, mode, role }) {
  const front = metrics.front_ratio ?? 0;
  const back = metrics.back_ratio ?? 0;
  if (front <= 0 && back <= 0) return '';
  const frontPct = formatPercentShort(front);
  const backPct = formatPercentShort(back);
  const quoted = formatSurnameQuote(name);
  const hasName = Boolean(quoted);
  const roleName = role === 'first' ? 'Etunimi' : 'Sukunimi';
  const partnerName = role === 'first' ? 'sukunimet' : 'etunimet';
  if (mode === 'analysis') {
    if (front > back + 0.08) {
      return `${roleName} on etuvokaalinen (ä/ö/y), joten etuvokaalipainotteiset ${partnerName} kuulostavat luontevammilta.`;
    }
    if (back > front + 0.08) {
      return `${roleName} on takavokaalinen (a/o/u), joten takavokaalipainotteiset ${partnerName} kuulostavat luontevammilta.`;
    }
    return '';
  }
  if (front > back + 0.08) {
    return hasName
      ? `Sukunimessä ${quoted} korostuvat etuvokaalit (ä/ö/y) ${frontPct}.`
      : `Etuvokaalit (ä/ö/y) korostuvat ${frontPct}.`;
  }
  if (back > front + 0.08) {
    return hasName
      ? `Sukunimessä ${quoted} painottuvat takavokaalit (a/o/u) ${backPct}.`
      : `Takavokaalit (a/o/u) painottuvat ${backPct}.`;
  }
  return '';
}

function describeVowelOpennessTrait({ metrics, name, mode, role }) {
  const open = metrics.open_ratio ?? 0;
  const close = metrics.close_ratio ?? 0;
  if (open <= 0 && close <= 0) return '';
  const openPct = formatPercentShort(open);
  const closePct = formatPercentShort(close);
  const quoted = formatSurnameQuote(name);
  const hasName = Boolean(quoted);
  const roleName = role === 'first' ? 'Etunimessä' : 'Sukunimessä';
  const partnerName = role === 'first' ? 'sukunimessä' : 'etunimessä';
  if (mode === 'analysis') {
    if (open > close + NEUTRAL_VOWEL_GAP) {
      return `${roleName} on väljiä vokaaleja (a/e/o), joten nämä vokaalit kuulostavat hyviltä myös ${partnerName}.`;
    }
    if (close > open + NEUTRAL_VOWEL_GAP) {
      return `${roleName} on suppeita vokaaleja (i/u/y), joten nämä vokaalit kuulostavat hyviltä myös ${partnerName}.`;
    }
    return '';
  }
  if (open > close + NEUTRAL_VOWEL_GAP) {
    return hasName
      ? `Sukunimessä ${quoted} väljät vokaalit (a/e/o) hallitsevat ${openPct}.`
      : `Väljät vokaalit (a/e/o) hallitsevat ${openPct}.`;
  }
  if (close > open + NEUTRAL_VOWEL_GAP) {
    return hasName
      ? `Sukunimessä ${quoted} suppeat vokaalit (i/u/y) hallitsevat ${closePct}.`
      : `Suppeat vokaalit (i/u/y) hallitsevat ${closePct}.`;
  }
  return hasName
    ? `Sukunimessä ${quoted} vokaalien avaruus on tasainen (väljiä ${openPct}, suppeita ${closePct}).`
    : `Vokaalien avaruus on tasainen (väljiä ${openPct}, suppeita ${closePct}).`;
}

function describeSoftnessTrait({ metrics, name, mode, role }) {
  const soft = metrics.soft_ratio ?? 0;
  if (soft <= 0) return '';
  const softPct = formatPercentShort(soft);
  const hardPct = formatPercentShort(Math.max(0, 1 - soft));
  const quoted = formatSurnameQuote(name);
  const hasName = Boolean(quoted);
  if (mode === 'analysis') {
    const roleName = role === 'first' ? 'Etunimi' : 'Sukunimi';
    const partnerName = role === 'first' ? 'sukunimessä' : 'etunimessä';
    if (soft > 0.6) {
      return `Pehmeät konsonantit (m/n/l/r/j) hallitsevat, joten suosi samoja konsonantteja myös ${partnerName}.`;
    }
    if (soft < 0.4) {
      return `Kovat konsonantit (p/t/k/b/d) hallitsevat, joten suosi samoja konsonatteja myös ${partnerName}.`;
    }
    return '';
  }
  return hasName
    ? `Sukunimessä ${quoted} on pehmeitä konsonanttiäänteitä (m/n/l/r/j) on ${softPct} ja kovia ${hardPct}.`
    : `Pehmeitä konsonanttiäänteitä (m/n/l/r/j) on ${softPct} ja kovia ${hardPct}.`;
}

function describeToneTrait({ metrics, name, mode, role }) {
  if (metrics.valence == null) return '';
  const tone = clampSigned(metrics.valence);
  const pct = `${Math.round(Math.abs(tone) * 100)} %`;
  const quoted = formatSurnameQuote(name);
  const hasName = Boolean(quoted);
  if (mode === 'analysis') {
    const roleName = role === 'first' ? 'Etunimessä' : 'Sukunimessä';
    const partnerName = role === 'first' ? 'sukunimessä' : 'etunimessä';
    if (Math.abs(tone) < 0.1) {
      return '';
    }
    if (tone > 0) {
      return `${roleName} on terävän kuuloisia kirjaimia (k/t/s/p/i), joten suosi samoja kirjaimia ${partnerName}.`;
    }
    return `${roleName} on lämpimän kuuloisia kirjaimia (u/o/m/a/n), joten suosi samoja kirjaimia ${partnerName}.`;
  }
  if (Math.abs(tone) < 0.1) {
    return hasName
      ? `Sukunimen ${quoted} sävy pysyy neutraalina.`
      : 'Sävy pysyy neutraalina.';
  }
  if (tone > 0) {
    return hasName
      ? `Sukunimen ${quoted} sävy on ${pct} kirkas ja sähäkkä.`
      : `Sävy on ${pct} kirkas ja sähäkkä.`;
  }
  return hasName
    ? `Sukunimen ${quoted} sävy on ${pct} rauhallinen ja lämmin.`
    : `Sävy on ${pct} rauhallinen ja lämmin.`;
}

const MATCH_COMPONENT_ORDER = [
  'vowel_location',
  'vowel_openess',
  'softness',
  'tone',
  'rhythm',
  'length',
  'alliteration',
  'head_transition',
  'end_start_transition',
  'oddness'
];

function convertRhythmPatternToRK(pattern = '') {
  if (!pattern) return '';
  return pattern.replace(/H/g, 'R').replace(/L/g, 'K');
}

function describeRhythmicPatternTrait({ entry, name, mode, role }) {
  const pattern = entry?.rhythm_sequence;
  if (!pattern) return '';
  const roleName = role === 'first' ? 'Etunimi' : 'Sukunimi';
  const partnerName = role === 'first' ? 'sukunimessä' : 'etunimessä';
  const rkPattern = convertRhythmPatternToRK(pattern);
  const preview = rkPattern.length > 12 ? `${rkPattern.slice(0, 12)}…` : rkPattern;
  if (mode === 'analysis') {
    return `${roleName} on rytmikuvioltaan ${preview}.`;
  }
  const quoted = formatSurnameQuote(name);
  if (quoted) {
    return `${quoted} rytmikuvio on ${preview}`;
  }
  return `Rytmikuvio: ${preview}`;
}

function describeLengthTrait({ metrics, entry, name, mode, role }) {
  const fallbackLetters = (entry.display || '').replace(/[^A-Za-zÅÄÖåäöA-Za-zÀ-ÿ]/g, '').length || 0;
  const letters = Math.round((metrics.length ?? fallbackLetters) || 0);
  const syllableCount = Math.round(
    metrics.syllables ?? (entry.ipa?.syllables ? splitSyllableMarkers(entry.ipa.syllables).length : 0)
  );
  if (!letters && !syllableCount) return '';
  const quoted = formatSurnameQuote(name);
  const hasName = Boolean(quoted);
  if (mode === 'analysis') {
    const roleName = role === 'first' ? 'Etunimi' : 'Sukunimi';
    const partnerName = role === 'first' ? 'sukunimet' : 'etunimet';
    if (syllableCount >= 4 || letters >= 9) {
      return `${roleName} on pitkä, joten lyhyemmät ${partnerName}  tasapainottavat kokonaisuutta.`;
    }
    if (syllableCount <= 2 || letters <= 5) {
      return `${roleName} on lyhyt, joten pidemmät ${partnerName} tasapainottavat kokonaisuutta.`;
    }
    return `${roleName} on keskipitkä, joten kaikenpituiset ${partnerName} sopivat.`;
  }
  const baseText = `${letters} kirjainta / ${syllableCount || '-'} tavua`;
  if (syllableCount >= 4 || letters >= 9) {
    return hasName
      ? `Sukunimi ${quoted} on pitkä (${baseText}), joten lyhyempi etunimi voi tasapainottaa.`
      : `Sukunimi on pitkä (${baseText}), joten lyhyempi etunimi voi tasapainottaa.`;
  }
  if (syllableCount <= 2 || letters <= 5) {
    return hasName
      ? `Sukunimi ${quoted} on lyhyt (${baseText}), joten pidempi etunimi voi tasapainottaa.`
      : `Sukunimi on lyhyt (${baseText}), joten pitkä etunimi voi tasapainottaa.`;
  }
  return hasName
    ? `Sukunimi ${quoted} on keskimitainen (${baseText}).`
    : `Sukunimi on keskimitainen (${baseText}).`;
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

function getGradeLabelByValue(value) {
  if (!gradeMeta || !gradeMeta.length) return value;
  const match = gradeMeta.find((grade) => Number(grade.value) === Number(value));
  if (!match) return value;
  return match.fi || value;
}

function getFeatureDescription(featureKey) {
  const meta = phoneticMeta.get(featureKey);
  return getFeatureDescriptionByMeta(meta);
}

function getFeatureDescriptionByMeta(meta) {
  if (!meta) return '';
  return meta.description || '';
}

function updateSurnameAnalysis(entry, missingSurname) {
  const container = $('#surname-analysis');
  if (!container) return;
  const surname = state.surname.trim();
  if (!surname) {
    container.textContent = '';
    return;
  }
  let resolvedEntry = entry;
  if (!resolvedEntry && surnameMap.size) {
    resolvedEntry = surnameMap.get(surname.toLowerCase()) || null;
    missingSurname = !resolvedEntry;
  }
  if (missingSurname || !resolvedEntry) {
    container.textContent = 'Sukunimeä ei löytynyt.';
    return;
  }
  const usageText = getSurnameUsageText(resolvedEntry);
  container.innerHTML = usageText
    ? `${usageText}`
    : 'Sukunimen käyttöä ei löytynyt.';
  container.title = '';
  renderSurnameExplainLink(resolvedEntry);
}

function buildSurnameAnalysis(entry) {
  const typedSurname = getTypedSurname();
  const sentences = buildSurnameTraitSentences(entry, 'analysis', 'surname', typedSurname);
  return sentences.map((item) => item.text).join(' ');
}

function formatComponentBreakdown(componentScores) {
  if (!componentScores) return '';
  const weights = getActiveWeights();
  const labelMap = new Map(MATCH_WEIGHT_FIELDS.map((field) => [field.key, field]));
  const orderedKeys = [...MATCH_COMPONENT_ORDER];
  Object.keys(componentScores).forEach((key) => {
    if (!orderedKeys.includes(key)) {
      orderedKeys.push(key);
    }
  });
  const parts = orderedKeys
    .map((key) => {
      const score = componentScores[key];
      if (score == null) return null;
      const field = labelMap.get(key);
      const label = field ? field.label || key : key;
      const weightValue = weights[key] ?? 0;
      const weightPercent = Math.round(weightValue * 100);
      return `${label}: ${score.toFixed(2)} (${weightPercent}%)`;
    })
    .filter(Boolean);
  return parts.join(', ');
}

function buildFirstNameAnalysis(entry, surnameEntry) {
  if (!entry) return null;
  const container = document.createElement('div');
  container.className = 'analysis-block';
  const traitSentences = buildSurnameTraitSentences(entry, 'analysis', 'first')
    .map((item) => item.text)
    .filter(Boolean);
  const analysisText = traitSentences.join(' ');
  if (analysisText) {
    const analysisP = document.createElement('p');
    analysisP.className = 'analysis-text';
    analysisP.textContent = analysisText;
    container.appendChild(analysisP);
  }
  return container.childNodes.length ? container : null;
}

function createHistoryLabel(entry, t) {
  const base = t.historyTitle || 'Nimen käyttö historiassa';
  const name = entry?.display || entry?.name || '';
  if (!name) return base;
  const linkText = t.historyLinkText || 'linkki';
  const url = `https://nimipalvelu.dvv.fi/etunimihaku?nimi=${encodeURIComponent(name)}`;
  return `${base} (<a href="${url}" target="_blank" rel="noopener">${linkText}</a>)`;
}

function createDetailRow(label, content, options = {}) {
  if (!content) return null;
  const row = document.createElement('div');
  row.className = 'detail-row';
  const labelEl = document.createElement('div');
  labelEl.className = 'detail-label';
  if (options.asHtml) {
    labelEl.innerHTML = label;
  } else {
    labelEl.textContent = label;
  }
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

function resetDetailAdCounter() {
  detailAds.reset();
}

function renderComboEstimate(entry, t, surnameEntry) {
  if (!entry._comboEstimate || !surnameEntry) {
    return '';
  }
  const countText = formatCount(entry._comboEstimate);
  return `~${countText} (${t.comboRowNote})`;
}

function renderCombinedTraits(entry, t) {
  const groupHtml = renderGroupChips(entry, groupMeta, {
    emptyLabel: t.noGroupMembership,
    labelFor: (meta) => getGroupLabel(meta) || meta?.key,
    describe: (meta) => meta?.description || meta?.label || ''
  });
  const phoneticHtml = renderPhoneticSummary(entry, phoneticMeta, {
    labelFor: (meta) => getFeatureLabel(meta) || meta?.key,
    describe: (meta) => getFeatureDescription(meta?.key || '')
  });
  return [groupHtml, phoneticHtml].filter(Boolean).join(' ');
}

function updateUrl() {
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
  const newUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
  history.replaceState(null, '', newUrl);
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
    surnameInput.addEventListener('input', () => {
      const currentValue = surnameInput.value.trim();
      state.surname = currentValue;
      const entry = currentValue ? surnameMap.get(currentValue.toLowerCase()) : null;
      const missing = Boolean(currentValue && !entry);
      updateSurnameAnalysis(entry, missing);
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
    $('#toggle-sort').textContent = state.sortDir === 'asc' ? '↑' : '↓';
    applyFilters();
  });
  const addPhoneticBtn = $('[data-action="add-phonetic"]');
  if (addPhoneticBtn) addPhoneticBtn.addEventListener('click', addPhoneticFilter);
  const addGroupBtn = $('[data-action="add-group"]');
  if (addGroupBtn) addGroupBtn.addEventListener('click', addGroupFilter);
  const addPopBtn = $('[data-action="add-popularity"]');
  if (addPopBtn) addPopBtn.addEventListener('click', addPopularityFilter);
  document.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-filter-href]');
    if (!btn) return;
    const href = btn.getAttribute('data-filter-href');
    if (!href) return;
    event.preventDefault();
    const url = new URL(href, window.location.origin);
    const surnameValue = (state.surname || '').trim();
    if (surnameValue) {
      url.searchParams.set('surname', surnameValue);
    }
    if (state.genders.size && state.genders.size < 3) {
      url.searchParams.set('gender', Array.from(state.genders).join(','));
    }
    url.searchParams.set('openArticles', '1');
    url.hash = 'results';
    sessionStorage.setItem(SCROLL_FLAG_KEY, '1');
    const target = document.getElementById('results');
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    window.location.href = url.toString();
  });
  document.querySelectorAll('input[name="gender"]').forEach((checkbox) => {
    checkbox.addEventListener('change', () => applyFilters());
  });
  const loadMoreBtn = $('#load-more');
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      const totalAvailable = getFilteredCount();
      state.visibleCount = Math.min(state.visibleCount + PAGE_SIZE, totalAvailable);
      renderResults();
    });
  }
  document.querySelectorAll('[data-action="open-story"]').forEach((el) => {
    el.addEventListener('click', openStoryModal);
  });
  document.querySelectorAll('[data-action="dismiss-story"]').forEach((el) => {
    el.addEventListener('click', closeStoryModal);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeStoryModal();
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
  document.body.classList.remove('modal-open');
}

function scrollToResultsIfNeeded() {
  if (hasScrolledToResults) return;
  const shouldScroll =
    window.location.hash === '#results' || sessionStorage.getItem(SCROLL_FLAG_KEY) === '1';
  if (!shouldScroll) return;
  const target = document.getElementById('results');
  if (!target) return;
  hasScrolledToResults = true;
  sessionStorage.removeItem(SCROLL_FLAG_KEY);
  requestAnimationFrame(() => {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

async function init() {
  data = await loadData();
  favorites = loadFavorites(FAVORITES_KEY);
  prepareMatchingWeights();
  buildMetaMaps();
  applySchemaLimits();
  initSelects();
  restoreFromQuery();
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
}

document.addEventListener('DOMContentLoaded', () => {
  init().catch((error) => {
    console.error('Failed to initialise app', error);
    $('#results-list').innerHTML = '<p class="hint">Datan lataus epäonnistui.</p>';
  });
});
