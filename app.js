const PAGE_SIZE = 50;
const DATA_FILES = [
  'data/first-names.json',
  'data/last-names.json',
  'data/schema.json'
];

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
    match: (surname) => surname ? `Vertailu sukunimelle “${surname}”` : 'Sukunimiyhteensopivuus pois käytöstä',
    missingSurname: (surname) => `Sukunimeä “${surname}” ei löytynyt aineistosta - vertailu ohitettiin.`,
    matchLabel: 'Sukunimi-osuvuus',
    grade: (label) => `Taso: ${label}`,
    historyTitle: 'Nimen käyttö historiassa',
    historyLegendMale: 'Miehiä',
    historyLegendFemale: 'Naisia',
    historyYAxis: '%-osuus annetuista nimistä',
    historyNoData: 'Ei historiallista käyttödataa',
    populationTag: (count) => `Arvio: ~${count} hlöä`,
    comboTag: (count) => `Täyskaimoja: ~${count} hlöä`,
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
    wikiTitle: 'Tietoa Wikipediasta',
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
      eyebrow: 'Sukunimen painot',
      title: 'Muokkaa pisteytyksen painoja',
      description:
        'Jaa prosentit niin, että painojen itseisarvojen summa on aina 100 %. Negatiiviset prosentit pienentävät pisteitä. Esim. negatiivisilla prosenteilla kohdassa "Allitteraatio" algoritmi ei suosi nimiä, jotka alkavat samalla alkuikirjaimella kuin sukunimi.',
      total: (value) => `Käytössä ${value.toFixed(1)} % / 100 %`,
      balance: (value) =>
        value > 0
          ? `Vapaana ${value.toFixed(1)} %`
          : value < 0
            ? `Ylittää ${Math.abs(value).toFixed(1)} %`
            : 'Täsmälleen 100 % käytetty',
      absRequirement: 'Painojen itseisarvot on käytettävä tasan 100 %:iin asti.',
      invalid: 'Täytä kaikki prosenttikentät numeroin.',
      penaltyNote: 'Negatiivinen paino pienentää pisteitä.',
      resetLabel: 'Palauta oletukset',
      cancelLabel: 'Peruuta',
      confirmLabel: 'OK'
    }
  }
};

const state = {
  genders: new Set(['female', 'male', 'unisex']),
  surname: '',
  includeLetters: '',
  excludeLetters: '',
  letterRange: { min: 1, max: 20 },
  populationRange: { min: 0, max: 45000 },
  popularityFilters: [],
  phoneticFilters: [],
  groupFilters: [],
  sortKey: 'match',
  sortDir: 'desc',
  page: 0,
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
let gradeMeta = [];
let currentResults = [];
let transitionConfig = null;
let detailBasePath = 'data/details';
let detailBucketMap = {};
const detailCache = new Map();
const LETTER_LIMITS = { min: 1, max: 20 };
const POPULATION_LIMITS = { min: 0, max: 45000 };
let lettersRangeControl = null;
let surnameInputTimer = null;
let weightPercentBudget = 1;
let weightEditorControls = null;
let weightEditorInputs = [];
let defaultMatchingWeights = null;
const WEIGHT_SUM_TOLERANCE = 0.05;

const $ = (sel) => document.querySelector(sel);

function getTypedSurname() {
  return (state.surname || '').trim();
}

function isRangeFilterActive() {
  const includeActive = Boolean(state.includeLetters);
  const excludeActive = Boolean(state.excludeLetters);
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
  setPanelOpen('group-filter-panel', state.groupFilters.length > 0);
  setPanelOpen('phonetic-filter-panel', state.phoneticFilters.length > 0);
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

const MATCH_WEIGHT_FIELDS = [
  {
    key: 'vowel_location',
    label: 'Vokaaliharmonia nimien välillä',
    description:
      'Etu- (ä/ö/y) ja takavokaalipainotteisia (a/o/u) nimiä ei yhdistetä. Kieli on vokaaliäänteissä suun etu- tai takaosassa ja nopea kielen siirtymä on vaikea, esim. "pastöroida"'
  },
  {
    key: 'vowel_openess',
    label: 'Vokaalien avaruuden erot',
    description:
      'Väljiä (e/o/a) ja suppeita (i/u/y) vokaaleja sisältäviä nimiä ei yhdistetä. Kieli on vokaaliäänteissä suun ylä- tai alaosassa ja tämä vaikuttaa erityisesti sanojen korkeuteen, esim. "Ninni" ja "Anne". Erityisesti lyhyet, ainoastaan suppeita vokaaleja sisältävät nimiparit voivat kuulostaa liiankin korkeilta ja nopeilta.'
  },
  {
    key: 'softness',
    label: 'Konsonanttien pehmeys',
    description:
      'Pehmeitä (m/n/l/r/j) ja kovia (p/t/k/b/d) konsonanttiäänteitä sisältäviä nimiä ei yhdistetä. Nimet, joissa on paljon pehmeitä konsonantteja, voivat kuulostaa lempeämmiltä verrattuna nimiin, joissa on enemmän kovia konsonantteja ja ristiriita voi kuulostaa oudolta.'
  },
  {
    key: 'tone',
    label: 'Sävy (bouba/kiki -efekti)',
    description:
      'Nimen sävy voi kuulostaa rauhalliselta ja lämpimältä (u/o/m/a/n) tai terävältä ja kovalta (k/t/s/p/i). Nimiä, joiden sävy on erilainen, ei yhdistetä.'
  },
  {
    key: 'rhythm',
    label: 'Rytmi',
    description:
      'Vertaa tavujen raskautta (R = raskas; jos tavussa on kaksi peräkkäistä vokaalia tai se päättyy konsonattiin, esim. "Aa"(-va) tai "Kris"(-ti-an)) ja keveyttä (K = kevyt: muussa tapauksessa). Mitä samankaltaisempi R/K-kuvio, sitä luontevampi yhdistelmä on. Esim. Kris-ti-an on RKR.'
  },
  {
    key: 'length',
    label: 'Pituusero',
    description:
      'Pitkä sukunimi ja lyhyt etunimi tasapainottavat toisiaan. Vastaavasti lyhyt sukunimi ja pitkä etunimi toimivat hyvin yhdessä. Liian pitkä pituusero voi kuitenkin kuulostaa epätasapainoiselta.'
  },
  {
    key: 'alliteration',
    label: 'Allitteraatio',
    description:
      'Nimiä, jotka päättyvät samaan kirjaimeen kuin millä sukunimi alkaa, suositellaan helpommin. "Vaka vanha väinämöinen" on esimerkki allitteraatiosta.'
  },
  {
    key: 'junction',
    label: 'Etunimen lopun ja sukunimen alun vertailu',
    description:
      'Jos etunimi päättyy samankaltaisiin äänteisiin, kuin millä sukunimi alkaa, nimiä suositellaan helpommin. "Iiro Roima" on esimerkki tällaisesta yhdistelmästä.'
  },
  {
    key: 'junction_transition',
    label: 'Etunimen lopun ja sukunimen alun tilastollinen vertailu',
    description:
      'Tilastollinen malli etunimen viimeisen äänteen ja sukunimen ensimmäisen äänteen vertailuun. Malli on opetettu suomalaisilla nimillä vertailemalla nimien peräkkäisten äänteiden muodostamia pareja. Malli suosii sellaisia nimiyhdistelmiä, joiden äänteiden siirtymät ovat yleisiä myös suomalaisissa nimissä.'
  },
  {
    key: 'head_transition',
    label: 'Etu- ja sukunimen alkujen vertailu tilastollisella mallilla',
    description:
      'Tilastollinen malli etunimen ensimmäisen äänteen ja sukunimen ensimmäisen äänteen vertailuun. Malli on opetettu suomalaisilla nimillä vertailemalla peräkkäisten tavujen ensimmäisiä äänteitä. Malli suosii sellaisia nimiyhdistelmiä, joiden ensimmäisten äänteiden siirtymät ovat yleisiä myös suomalaisten nimien peräkkäisissä tavuissa.'
  },
  {
    key: 'oddness',
    label: 'Harvinaisuus',
    description:
      'Harvinaisia etunimiä (alle 500 nimenkantajaa) suositellaan helpommin kuin yleisiä nimiä.'
  }
];

async function loadData() {
  const responses = await Promise.all(DATA_FILES.map((path) => fetch(path)));
  const payloads = [];
  for (const response of responses) {
    if (!response.ok) {
      throw new Error('Failed to load data files');
    }
    payloads.push(await response.json());
  }
  return {
    names: payloads[0].names,
    surnames: payloads[1].names,
    schema: payloads[2]
  };
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
  const filteredGroups = (data.schema.groupFeatures || []).filter(
    (group) => !String(group.key || '').startsWith('nameday_calendar_')
  );
  groupMeta = new Map(filteredGroups.map((g) => [g.key, g]));
  gradeMeta = data.schema.intensityGrades || [];
  surnameMap = new Map(data.surnames.map((entry) => [entry.name.toLowerCase(), entry]));
  surnameRankMap = new Map();
  const rankedSurnames = [...data.surnames]
    .filter((entry) => Number.isFinite(Number(entry.popularity)))
    .sort((a, b) => Number(b.popularity || 0) - Number(a.popularity || 0));
  rankedSurnames.forEach((entry, index) => {
    surnameRankMap.set((entry.name || '').toLowerCase(), index + 1);
  });
  transitionConfig = data.schema.matching?.transitions || null;
  detailBasePath = data.schema.details?.basePath || 'data/details';
  detailBucketMap = data.schema.details?.buckets || {};
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

function getDetailPath(bucket) {
  if (!bucket) return null;
  if (detailBucketMap && detailBucketMap[bucket]) {
    return detailBucketMap[bucket];
  }
  const normalizedBase = detailBasePath.replace(/\/+$/, '');
  return `${normalizedBase}/${bucket}.json`;
}

function loadDetailBucket(bucket) {
  if (!bucket) return Promise.resolve({});
  if (detailCache.has(bucket)) {
    return detailCache.get(bucket);
  }
  const path = getDetailPath(bucket);
  const promise = (async () => {
    const response = await fetch(path);
    if (!response.ok) {
      throw new Error('Failed to load detail chunk');
    }
    const payload = await response.json();
    return payload.entries || {};
  })().catch((error) => {
    detailCache.delete(bucket);
    throw error;
  });
  detailCache.set(bucket, promise);
  return promise;
}

async function ensureEntryDetails(entry) {
  if (!entry || entry._detailsLoaded) {
    return entry;
  }
  const bucket = entry.detailBucket || (entry.name ? entry.name[0] : 'misc');
  const detailEntries = await loadDetailBucket(bucket);
  const detail = detailEntries?.[entry.name];
  if (detail) {
    Object.assign(entry, detail);
  }
  entry._detailsLoaded = true;
  return entry;
}

function normalizeLetterFilter(value) {
  if (!value) return '';
  return value
    .toLowerCase()
    .replace(/[^a-zåäöæøœšžẞ\u00c0-\u017f\-]/g, '');
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
    state.includeLetters = normalizeLetterFilter(params.get('letters'));
  }
  if (params.has('exclude')) {
    state.excludeLetters = normalizeLetterFilter(params.get('exclude'));
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
  state.groupFilters = params.getAll('gf').map((token) => {
    const [group, mode] = token.split('.');
    const normalizedMode = mode && mode !== 'undefined' ? mode : 'include';
    return {
      id: nextGroupFilterId(),
      group: group || (data.schema.groupFeatures[0]?.key ?? ''),
      mode: normalizedMode
    };
  });
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
  $('#letters-include').value = state.includeLetters;
  $('#letters-exclude').value = state.excludeLetters;
  lettersRangeControl?.setValues(state.letterRange.min, state.letterRange.max);
  updatePopulationInputs();
  $('#sort-key').value = state.sortKey;
  $('#toggle-sort').textContent = state.sortDir === 'asc' ? '↑' : '↓';
  updateSortOptionTooltips();
  renderPhoneticFilters();
  renderGroupFilters();
  renderPopularityFilters();
  updateFilterPanels();
}

function renderPhoneticFilters() {
  const container = $('#phonetic-filters');
  container.innerHTML = '';
  if (!state.phoneticFilters.length) {
    container.innerHTML = '<p class="hint">Ei aktiivisia rajauksia.</p>';
    updateFilterPanels();
    return;
  }
  const template = $('#phonetic-filter-template');
  state.phoneticFilters.forEach((filter) => {
    if (!phoneticMeta.has(filter.feature)) {
      filter.feature = data.schema.phoneticFeatures[0]?.key ?? '';
    }
    const fragment = template.content.cloneNode(true);
    const row = fragment.querySelector('.filter-row');
    row.dataset.id = filter.id;

    const featureSelect = fragment.querySelector('.feature-select');
    const featureDesc = document.createElement('p');
    featureDesc.className = 'filter-desc';
    phoneticMeta.forEach((meta, key) => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = getFeatureLabel(meta);
      option.title = getFeatureDescriptionByMeta(meta);
      featureSelect.appendChild(option);
    });
    featureSelect.value = filter.feature;
    featureSelect.title = getFeatureDescription(filter.feature);
    featureDesc.textContent = getFeatureDescription(filter.feature);
    featureSelect.addEventListener('change', (evt) => {
      filter.feature = evt.target.value;
      featureSelect.title = getFeatureDescription(filter.feature);
      featureDesc.textContent = getFeatureDescription(filter.feature);
    });

    const modeSelect = fragment.querySelector('.mode-select');
    modeSelect.value = filter.mode;
    modeSelect.addEventListener('change', (evt) => {
      filter.mode = evt.target.value;
      updateGradeVisibility(row, filter);
    });

    const gradeSelect = fragment.querySelector('.grade-select');
    if (gradeMeta.length) {
      gradeMeta.forEach((grade) => {
        const option = document.createElement('option');
        option.value = grade.value;
        option.textContent = grade.fi;
        gradeSelect.appendChild(option);
      });
      gradeSelect.value = filter.grade ?? 1;
      gradeSelect.addEventListener('change', (evt) => {
        filter.grade = Number(evt.target.value);
      });
    } else {
      gradeSelect.hidden = true;
      gradeSelect.disabled = true;
    }
    updateGradeVisibility(row, filter);

    fragment.querySelector('[data-action="remove"]').addEventListener('click', () => {
      state.phoneticFilters = state.phoneticFilters.filter((item) => item.id !== filter.id);
      renderPhoneticFilters();
    });

    row.appendChild(featureDesc);
    container.appendChild(fragment);
  });
  updateFilterPanels();
}

function updateGradeVisibility(row, filter) {
  const gradeSelect = row.querySelector('.grade-select');
  if (!gradeSelect || !gradeSelect.options.length) {
    if (gradeSelect) {
      gradeSelect.hidden = true;
      gradeSelect.disabled = true;
    }
    return;
  }
  if (['min', 'max'].includes(filter.mode)) {
    gradeSelect.hidden = false;
    gradeSelect.disabled = false;
  } else {
    gradeSelect.hidden = true;
    gradeSelect.disabled = true;
  }
}

function renderGroupFilters() {
  const container = $('#group-filters');
  container.innerHTML = '';
  if (!state.groupFilters.length) {
    container.innerHTML = '<p class="hint">Ei aktiivisia rajauksia.</p>';
    updateFilterPanels();
    return;
  }
  const template = $('#group-filter-template');
  state.groupFilters.forEach((filter) => {
    if (!groupMeta.has(filter.group)) {
      filter.group = data.schema.groupFeatures[0]?.key ?? '';
    }
    const fragment = template.content.cloneNode(true);
    const row = fragment.querySelector('.filter-row');
    row.dataset.id = filter.id;
    const select = fragment.querySelector('.group-select');
    const desc = document.createElement('p');
    desc.className = 'filter-desc';
    groupMeta.forEach((meta, key) => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = getGroupLabel(meta);
      select.appendChild(option);
    });
    select.value = filter.group;
    desc.textContent = getGroupDescription(filter.group);
    select.addEventListener('change', (evt) => {
      filter.group = evt.target.value;
      desc.textContent = getGroupDescription(filter.group);
    });
    const modeSelect = fragment.querySelector('.group-mode-select');
    modeSelect.value = filter.mode;
    modeSelect.addEventListener('change', (evt) => {
      filter.mode = evt.target.value;
    });
    fragment.querySelector('[data-action="remove"]').addEventListener('click', () => {
      state.groupFilters = state.groupFilters.filter((item) => item.id !== filter.id);
      renderGroupFilters();
    });
    row.appendChild(desc);
    container.appendChild(fragment);
  });
  updateFilterPanels();
}

function renderPopularityFilters() {
  const container = $('#popularity-filters');
  container.innerHTML = '';
  const popularityKeys = getPopularityKeys();
  if (!state.popularityFilters.length) {
    container.innerHTML = '<p class="hint">Ei aktiivisia rajauksia.</p>';
    updateFilterPanels();
    return;
  }
  const template = $('#popularity-filter-template');
  state.popularityFilters.forEach((filter) => {
    if (!popularityKeys.includes(filter.group)) {
      filter.group = popularityKeys[0] || '';
    }
    const fragment = template.content.cloneNode(true);
    const row = fragment.querySelector('.filter-row');
    row.dataset.id = filter.id;
    const select = fragment.querySelector('.popularity-select');
    popularityKeys.forEach((key) => {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = formatPopularityLabel(key);
      select.appendChild(option);
    });
    select.value = filter.group;
    const desc = document.createElement('p');
    desc.className = 'filter-desc';
    desc.textContent = getGroupDescription(filter.group);
    select.addEventListener('change', (evt) => {
      filter.group = evt.target.value;
      desc.textContent = getGroupDescription(filter.group);
    });
    const modeSelect = fragment.querySelector('.popularity-mode-select');
    modeSelect.value = filter.mode;
    modeSelect.addEventListener('change', (evt) => {
      filter.mode = evt.target.value;
    });
    fragment.querySelector('[data-action="remove"]').addEventListener('click', () => {
      state.popularityFilters = state.popularityFilters.filter((item) => item.id !== filter.id);
      renderPopularityFilters();
    });
    row.appendChild(desc);
    container.appendChild(fragment);
  });
  updateFilterPanels();
}

function addPopularityFilter() {
  const keys = getPopularityKeys();
  if (!keys.length) return;
  const firstKey = keys[0];
  state.popularityFilters.push({ id: nextGroupFilterId(), group: firstKey, mode: 'include' });
  renderPopularityFilters();
}

function addPhoneticFilter() {
  const firstKey = data.schema.phoneticFeatures[0]?.key;
  if (!firstKey) return;
  state.phoneticFilters.push({ id: nextFilterId(), feature: firstKey, mode: 'include', grade: 1 });
  renderPhoneticFilters();
}

function addGroupFilter() {
  const firstKey = data.schema.groupFeatures[0]?.key;
  if (!firstKey) return;
  state.groupFilters.push({ id: nextGroupFilterId(), group: firstKey, mode: 'include' });
  renderGroupFilters();
}

function updateStateFromForm() {
  const selectedGenders = new Set();
  document.querySelectorAll('input[name="gender"]:checked').forEach((checkbox) => {
    selectedGenders.add(checkbox.value);
  });
  state.genders = selectedGenders.size ? selectedGenders : new Set(['female', 'male', 'unisex']);
  state.surname = $('#surname-input').value.trim();
  state.includeLetters = normalizeLetterFilter($('#letters-include').value);
  state.excludeLetters = normalizeLetterFilter($('#letters-exclude').value);
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

function applyFilters() {
  updateStateFromForm();
  state.page = 0;
  const surnameKey = state.surname.toLowerCase();
  const surnameEntry = surnameKey ? surnameMap.get(surnameKey) : null;
  const missingSurname = Boolean(state.surname && !surnameEntry);
  const surnameCount = surnameEntry ? Number(surnameEntry.popularity) || 0 : 0;
  updateSurnameAnalysis(surnameEntry, missingSurname);
  const filtered = data.names.filter((entry) => {
    if (!state.genders.has(entry.gender) && entry.gender !== 'unknown') return false;
    if (!passesLetterFilters(entry)) return false;
    if (!passesLengthFilters(entry)) return false;
    if (!passesPopulationFilter(entry)) return false;
    if (!passesGroupFilters(entry)) return false;
    if (!passesPopularityFilters(entry)) return false;
    if (!passesPhoneticFilters(entry)) return false;
    return true;
  });

  filtered.forEach((entry) => {
    entry._match = surnameEntry ? computeMatchScore(entry, surnameEntry) : null;
    if (surnameCount && entry.populationShare) {
      const comboValue = surnameCount * entry.populationShare;
      entry._comboEstimate = comboValue >= 0.5 ? comboValue : null;
    } else {
      entry._comboEstimate = null;
    }
  });

  sortResults(filtered);
  currentResults = filtered;
  state.matchInfo = { surnameEntry, missingSurname };
  renderResults();
  updateUrl();
}

function passesGroupFilters(entry) {
  if (!state.groupFilters.length) return true;
  return state.groupFilters.every((filter) => {
    const hasGroup = entry.groups.includes(filter.group);
    if (filter.mode === 'include') {
      return hasGroup;
    }
    return !hasGroup;
  });
}

function passesPopularityFilters(entry) {
  if (!state.popularityFilters.length) return true;
  return state.popularityFilters.every((filter) => {
    const hasGroup = entry.groups.includes(filter.group);
    if (filter.mode === 'include') {
      return hasGroup;
    }
    return !hasGroup;
  });
}

function passesLetterFilters(entry) {
  const name = entry.name || entry.display || '';
  if (state.includeLetters) {
    for (const char of state.includeLetters) {
      if (char && !name.includes(char)) {
        return false;
      }
    }
  }
  if (state.excludeLetters) {
    for (const char of state.excludeLetters) {
      if (char && name.includes(char)) {
        return false;
      }
    }
  }
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

function buildActiveFilterSummary() {
  const tSummary = translations.fi?.filterSummary;
  if (!tSummary) return '';
  const parts = [];
  state.popularityFilters.forEach((filter) => {
    const label = formatPopularityLabel(filter.group);
    const modeText = filter.mode === 'include' ? tSummary.groupInclude : tSummary.groupExclude;
    parts.push(`${label} (${modeText})`);
  });
  state.groupFilters.forEach((filter) => {
    const meta = groupMeta.get(filter.group);
    if (!meta) return;
    const label = getGroupLabel(meta);
    const modeText = filter.mode === 'include' ? tSummary.groupInclude : tSummary.groupExclude;
    parts.push(`${label} (${modeText})`);
  });
  state.phoneticFilters.forEach((filter) => {
    const meta = phoneticMeta.get(filter.feature);
    if (!meta) return;
    const label = getFeatureLabel(meta) || filter.feature;
    let descriptor = '';
    if (filter.mode === 'include') {
      descriptor = tSummary.featureInclude;
    } else if (filter.mode === 'exclude') {
      descriptor = tSummary.featureExclude;
    } else if (filter.mode === 'min') {
      const gradeLabel = getGradeLabelByValue(filter.grade ?? 1);
      descriptor = `${tSummary.featureMin}: ${gradeLabel}`;
    } else if (filter.mode === 'max') {
      const gradeLabel = getGradeLabelByValue(filter.grade ?? 1);
      descriptor = `${tSummary.featureMax}: ${gradeLabel}`;
    }
    parts.push(descriptor ? `${label} (${descriptor})` : label);
  });
  if (state.includeLetters) {
    parts.push(`${tSummary.lettersInclude}: ${state.includeLetters}`);
  }
  if (state.excludeLetters) {
    parts.push(`${tSummary.lettersExclude}: ${state.excludeLetters}`);
  }
  if (
    state.populationRange.min !== POPULATION_LIMITS.min ||
    state.populationRange.max !== POPULATION_LIMITS.max
  ) {
    parts.push(
      `${tSummary.population}: ${formatNumberWithSpaces(state.populationRange.min)} - ${formatNumberWithSpaces(
        state.populationRange.max
      )}`
    );
  }
  return parts.join(', ');
}

function passesPhoneticFilters(entry) {
  if (!state.phoneticFilters.length) return true;
  return state.phoneticFilters.every((filter) => {
    const feature = entry.phonetic[filter.feature];
    if (!feature) return false;
    switch (filter.mode) {
      case 'include':
        return Boolean(feature.value);
      case 'exclude':
        return !feature.value;
      case 'min':
        return (feature.grade ?? 0) >= (filter.grade ?? 1);
      case 'max':
        return (feature.grade ?? 0) <= (filter.grade ?? 1);
      default:
        return true;
    }
  });
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

function computeAbsoluteWeightBudget(weights) {
  if (!weights) return 1;
  const entries = Object.values(weights);
  const total = entries.reduce((sum, value) => sum + Math.abs(Number(value) || 0), 0);
  return total > 0 ? total : 1;
}

function normalizeWeightMap(weights) {
  if (!weights) return {};
  const entries = Object.entries(weights);
  const total = computeAbsoluteWeightBudget(weights);
  if (!total) {
    return { ...weights };
  }
  const normalized = {};
  entries.forEach(([key, value]) => {
    normalized[key] = (Number(value) || 0) / total;
  });
  MATCH_WEIGHT_FIELDS.forEach((field) => {
    if (!(field.key in normalized)) {
      normalized[field.key] = 0;
    }
  });
  return normalized;
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

function weightToPercent(value) {
  const safeBudget = weightPercentBudget || 1;
  return ((value || 0) / safeBudget) * 100;
}

function percentToWeight(percent) {
  const safeBudget = weightPercentBudget || 1;
  return ((percent || 0) / 100) * safeBudget;
}

function formatPercentNumber(value) {
  if (!Number.isFinite(value)) {
    return '0';
  }
  return String(Math.round(value));
}

function prepareMatchingWeights() {
  if (!data?.schema?.matching?.weights) {
    defaultMatchingWeights = null;
    weightPercentBudget = 1;
    return;
  }
  const normalized = normalizeWeightMap(data.schema.matching.weights);
  data.schema.matching.weights = normalized;
  defaultMatchingWeights = { ...normalized };
  weightPercentBudget = computeAbsoluteWeightBudget(normalized) || 1;
}

function areWeightsEqual(a = {}, b = {}, tolerance = 0.0001) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const diff = Math.abs((a[key] ?? 0) - (b[key] ?? 0));
    if (diff > tolerance) {
      return false;
    }
  }
  return true;
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
  const metricsFirst = first.metrics;
  const metricsLast = last.metrics;
  const weights = getActiveWeights();
  const lengthPrefs = data.schema.matching.preferred_rhythm_diff || {};
  const firstSimple = first.ipa?.simple || '';
  const lastSimple = last.ipa?.simple || '';
  const firstTransitions = first.transitions || {};
  const lastTransitions = last.transitions || {};
  const vowelLocation =
    1 -
    Math.abs(metricsFirst.front_ratio - metricsLast.front_ratio) -
    Math.abs(metricsFirst.back_ratio - metricsLast.back_ratio);
  let locationScore = clampSigned(vowelLocation);
  if (
    (metricsFirst.front_ratio > 0 && metricsLast.back_ratio > 0) ||
    (metricsFirst.back_ratio > 0 && metricsLast.front_ratio > 0)
  ) {
    locationScore = -1;
  }
  const vowelOpenRaw =
    1 -
    Math.abs(metricsFirst.open_ratio - metricsLast.open_ratio) -
    Math.abs(metricsFirst.close_ratio - metricsLast.close_ratio);
  const vowelOpen = applyCloseVowelPenalty(
    clampSigned(vowelOpenRaw),
    metricsFirst,
    metricsLast
  );
  const softness = clampSigned(1 - Math.abs(metricsFirst.soft_ratio - metricsLast.soft_ratio));
  const tone = clampSigned(1 - Math.abs(metricsFirst.valence - metricsLast.valence));
  const lengthDiff = Math.abs(metricsFirst.syllables - metricsLast.syllables);
  let lengthPreference = lengthPrefs[String(lengthDiff)] ?? 0.5;
  const firstLength = Number(metricsFirst.length ?? first.display?.length ?? 0);
  const lastLength = Number(metricsLast.length ?? last.display?.length ?? 0);
  lengthPreference += computeLengthBias(firstLength, lastLength);
  lengthPreference = clamp(lengthPreference, 0, 1);
  const lengthScore = mapZeroOneToSigned(lengthPreference);
  let alliteration = 0;
  if (firstSimple && lastSimple) {
    alliteration = firstSimple[0] === lastSimple[0] ? 1 : -1;
  }
  const boundaryOverlap = endStartMatch(
    firstSimple,
    lastSimple,
    data.schema.matching.junction_depth || 1
  );
  const junction = clampSigned(boundaryOverlap * 2 - 1);
  const junctionTransitionProb = getTransitionProbability(firstTransitions.end, lastTransitions.start);
  const headTransitionProb = getTransitionProbability(firstTransitions.start, lastTransitions.start);
  const junctionTransitionScore = normalizeTransitionProbability(junctionTransitionProb);
  const headTransitionScore = normalizeTransitionProbability(headTransitionProb);
  const rhythmSimilarity = computeRhythmSimilarity(first.rhythm_code, last.rhythm_code);
  const rhythmScore = mapZeroOneToSigned(rhythmSimilarity);

  let total =
    weights.vowel_location * locationScore +
    weights.vowel_openess * vowelOpen +
    weights.softness * softness +
    weights.tone * tone +
    (weights.rhythm || 0) * rhythmScore +
    (weights.length || 0) * lengthScore +
    weights.alliteration * alliteration +
    weights.junction * junction +
    (weights.junction_transition || 0) * junctionTransitionScore +
    (weights.head_transition || 0) * headTransitionScore;

  const totalOwners = Number(first.popularity?.total ?? 0);
  const oddnessWeight = weights.oddness ?? 0;
  let oddnessScore = 0;
  if (oddnessWeight && Number.isFinite(totalOwners)) {
    const minThreshold = 200;
    const maxThreshold = 1000;
    let penalty = 0;
    if (totalOwners <= minThreshold) {
      penalty = 1;
    } else if (totalOwners < maxThreshold) {
      penalty = (maxThreshold - totalOwners) / (maxThreshold - minThreshold);
    }
    oddnessScore = clampSigned(penalty * 2 - 1);
    total += oddnessWeight * oddnessScore;
  }
  const clampedTotal = clampSigned(total);
  const normalizedTotal = (clampedTotal + 1) / 2;
  return {
    components: {
      vowel_location: locationScore,
      vowel_openess: vowelOpen,
      softness,
      tone,
      rhythm: rhythmScore,
      length: lengthScore,
      alliteration,
      junction,
      junction_transition: junctionTransitionScore,
      head_transition: headTransitionScore,
      oddness: oddnessWeight ? oddnessScore : 0
    },
    weightedSum: total,
    normalized: Math.round(normalizedTotal * 1000) / 1000
  };
}

function computeMatchScore(first, last) {
  const result = evaluateMatchComponents(first, last);
  return result.normalized;
}


function initWeightEditor() {
  if (weightEditorControls || !document) return;
  const trigger = $('#edit-weight-button');
  const modal = $('#weight-editor');
  if (!trigger || !modal) return;
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
        : formatPercentNumber(weightToPercent(weights[meta.key] ?? 0));
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
    updated[item.key] = percentToWeight(value);
  });
  const normalizedUpdate = normalizeWeightMap(updated);
  const isSame = areWeightsEqual(normalizedUpdate, baseWeights);
  state.weightOverrides = isSame ? null : normalizedUpdate;
  weightPercentBudget = computeAbsoluteWeightBudget(getActiveWeights()) || 1;
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

function renderResults() {
  const t = translations.fi;
  const list = $('#results-list');
  const { surnameEntry, missingSurname } = state.matchInfo;
  const total = currentResults.length;
  if (!total) {
    list.innerHTML = `<p class="hint">${t.noResults}</p>`;
  } else {
    const startIndex = state.page * PAGE_SIZE;
    const endIndex = Math.min(startIndex + PAGE_SIZE, total);
    const visible = currentResults.slice(startIndex, endIndex);
    list.innerHTML = '';
    visible.forEach((entry, idx) => {
      const card = document.createElement('details');
      card.className = 'name-card';
      const summary = document.createElement('summary');
      const popularitySuffix = 'hlöä';
      const tagsWrap = document.createElement('div');
      tagsWrap.className = 'summary-tags';

      const titleSpan = document.createElement('span');
      titleSpan.className = 'name-title';
      titleSpan.textContent = entry.display;
      summary.appendChild(titleSpan);

      const popTag = createSummaryTag(
        `${entry.popularity.total.toLocaleString('fi-FI')} ${popularitySuffix}`,
        'tag-pop'
      );
      tagsWrap.appendChild(popTag);

      if (entry.topRank && entry.topRank.rank && entry.topRank.rank <= 500) {
        const rankText = `#${entry.topRank.rank} suosituin nimi`;
        const rankClass = entry.topRank.gender === 'female' ? 'tag-rank-female' : 'tag-rank-male';
        tagsWrap.appendChild(createSummaryTag(rankText, rankClass));
      }

      const matchText =
        entry._match !== null ? `${t.matchLabel}: ${(entry._match * 100).toFixed(1)}%` : '';
      tagsWrap.appendChild(createSummaryTag(matchText, 'tag-match'));

      let comboText = '';
      if (entry._comboEstimate && surnameEntry) {
        comboText = t.comboTag(formatCount(entry._comboEstimate));
      }
      tagsWrap.appendChild(createSummaryTag(comboText, 'tag-combo'));

      summary.appendChild(tagsWrap);
      card.appendChild(summary);

      const body = document.createElement('div');
      body.className = 'name-card-body';
      card.appendChild(body);

      card.addEventListener('toggle', () => {
        if (card.open) {
          loadCardDetails(card, body, entry, t, surnameEntry);
        }
      });
      list.appendChild(card);
      const globalIndex = startIndex + idx + 1;
      if (globalIndex % 5 === 0) {
        list.appendChild(createAdPlaceholder('inline'));
      }
    });
    $('#result-count').textContent = t.results(startIndex + 1, endIndex, total);
  }
  if (!total) {
    $('#result-count').textContent = t.noResults;
  }
  const typedSurname = getTypedSurname();
  const surnameLabel = typedSurname || state.surname || '';
  $('#match-context').textContent = missingSurname
    ? translations.fi.missingSurname(surnameLabel)
    : translations.fi.match(surnameLabel || (surnameEntry?.display ?? ''));
  const summaryEl = $('#active-filters');
  if (summaryEl) {
    const summaryText = buildActiveFilterSummary();
    summaryEl.textContent = summaryText;
    summaryEl.hidden = !summaryText;
  }
  $('#prev-page').disabled = state.page === 0;
  $('#next-page').disabled = (state.page + 1) * PAGE_SIZE >= total;
  $('#prev-page-bottom').disabled = state.page === 0;
  $('#next-page-bottom').disabled = (state.page + 1) * PAGE_SIZE >= total;
}

function loadCardDetails(card, bodyContainer, entry, t, surnameEntry) {
  if (card.dataset.hydrated === 'true') {
    if (card._detailRefs?.wikiBlock) {
      fetchWikiSummary(entry, card._detailRefs.wikiBlock, t);
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
        fetchWikiSummary(entry, refs.wikiBlock, t);
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

  const pronunciationRow = createDetailRow(t.pronunciationTitle, renderPronunciation(entry));
  if (pronunciationRow) details.appendChild(pronunciationRow);

  const firstAnalysisText = buildFirstNameAnalysis(entry, surnameEntry);
  if (firstAnalysisText) {
    const firstAnalysisRow = createDetailRow(t.firstNameAnalysisTitle, firstAnalysisText);
    if (firstAnalysisRow) details.appendChild(firstAnalysisRow);
  }

  const comboContent = renderComboEstimate(entry, t, surnameEntry);
  if (comboContent) {
    const comboRow = createDetailRow(t.comboRowLabel, comboContent);
    if (comboRow) details.appendChild(comboRow);
  }

  const groupsHtml = renderGroupChips(entry, t);
  if (groupsHtml) {
    const groupRow = createDetailRow(t.groupTitle, groupsHtml);
    if (groupRow) details.appendChild(groupRow);
  }

  const phoneticSummary = renderPhoneticSummary(entry, t);
  if (phoneticSummary) {
    const phoneticRow = createDetailRow(t.phoneticTitle, phoneticSummary);
    if (phoneticRow) details.appendChild(phoneticRow);
  }

  container.appendChild(details);

  const chartsSection = document.createElement('div');
  chartsSection.className = 'charts-section';

  const historyBlock = document.createElement('div');
  historyBlock.className = 'chart-block';
  historyBlock.innerHTML = `<h4>${t.historyTitle}</h4><div class="plotly-chart"></div>`;
  chartsSection.appendChild(historyBlock);

  const ageBlock = document.createElement('div');
  ageBlock.className = 'chart-block';
  ageBlock.innerHTML = `<h4>${t.ageDistributionTitle}</h4><div class="plotly-chart"></div>`;
  chartsSection.appendChild(ageBlock);

  container.appendChild(chartsSection);

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
  container.appendChild(affiliateLink);

  const historyContainer = historyBlock.querySelector('.plotly-chart');
  renderUsageChart(historyContainer, entry.history, t);
  const ageContainer = ageBlock.querySelector('.plotly-chart');
  renderAgeDistributionChart(ageContainer, entry.population, entry.popularity.total, t);

  card.dataset.hydrated = 'true';
  const refs = { wikiBlock, historyContainer, ageContainer };
  card._detailRefs = refs;
  return refs;
}

function renderUsageChart(container, history, t) {
  if (!container) return;
  const plotly = window.Plotly;
  if (!plotly) {
    container.textContent = t.historyNoData;
    return;
  }
  const periods = history?.periods || [];
  if (!periods.length) {
    container.textContent = t.historyNoData;
    return;
  }
  const datasets = [
    { label: t.historyLegendMale, color: '#0b57d0', data: history.male || {} },
    { label: t.historyLegendFemale, color: '#c2185b', data: history.female || {} }
  ].map((series) => {
    const share = periods.map((_, idx) => Number(series.data.share?.[idx]) || 0);
    const counts = periods.map((_, idx) => Number(series.data.counts?.[idx]) || 0);
    const ranks = periods.map((_, idx) =>
      Array.isArray(series.data.rank) && Number.isFinite(series.data.rank[idx])
        ? series.data.rank[idx]
        : null
    );
    const hoverText = periods.map((period, idx) => {
      const count = formatCount(counts[idx]);
      const rank = ranks[idx] ? ` (#${ranks[idx]})` : '';
      return `${series.label} - ${period}: ${count} (${formatPercent(share[idx])})${rank}`;
    });
    return { share, counts, ranks, hoverText, color: series.color, label: series.label };
  });
  const hasData = datasets.some((dataset) => dataset.share.some((value) => value > 0));
  if (!hasData) {
    container.textContent = t.historyNoData;
    return;
  }
  const hoverEnabled = !window.matchMedia('(hover: none)').matches;
  const traces = datasets.map((dataset) => ({
    x: periods,
    y: dataset.share.map((value) => value * 100),
    text: dataset.hoverText,
    hoverinfo: hoverEnabled ? 'text' : 'skip',
    mode: 'lines+markers',
    line: { color: dataset.color, width: 2 },
    marker: { size: 6 },
    name: dataset.label
  }));
  const layout = {
    margin: { l: 50, r: 10, t: 10, b: 60 },
    height: 260,
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    dragmode: false,
    hovermode: hoverEnabled ? 'closest' : false,
    xaxis: {
      title: '',
      tickmode: 'array',
      tickvals: periods,
      ticktext: periods.map((period) => period.replace('-', '-')),
      tickangle: -45,
      automargin: true
    },
    yaxis: {
      title: { text: t.historyYAxis, standoff: 20 },
      ticksuffix: '%',
      zeroline: false,
      automargin: true
    },
    legend: { orientation: 'h', x: 0, y: 1.1, yanchor: 'bottom' },
    font: { family: 'inherit' }
  };
  plotly.react(container, traces, layout, {
    displayModeBar: false,
    responsive: true,
    scrollZoom: false,
    doubleClick: 'reset',
    editable: false,
    staticPlot: !hoverEnabled,
    displaylogo: false,
    modeBarButtonsToRemove: ['zoom2d', 'pan2d', 'select2d', 'lasso2d', 'zoomIn2d', 'zoomOut2d', 'autoScale2d', 'hoverClosestCartesian', 'hoverCompareCartesian'],
    config: {
      doubleClick: false,
      scrollZoom: false,
      responsive: true,
      editable: false,
      staticPlot: !hoverEnabled
    }
  });
}

function renderAgeDistributionChart(container, population, targetTotal, t) {
  if (!container) return;
  const plotly = window.Plotly;
  if (!plotly) {
    container.textContent = t.ageDistributionNoData;
    return;
  }
  const rawData = population?.ageDistribution || [];
  if (!rawData.length) {
    container.textContent = t.ageDistributionNoData;
    return;
  }
  const parseAgeStart = (label) => {
    if (!label) return null;
    const match = label.match(/\d+/);
    return match ? parseInt(match[0], 10) : null;
  };
  const resolveBucket = (label) => {
    const start = parseAgeStart(label);
    if (start !== null && start >= 95) {
      return '95+';
    }
    return label || '';
  };
  const bucketOrder = [];
  const bucketMap = new Map();
  rawData.forEach((row) => {
    const baseLabel = row.ageRange || row.period || '';
    const bucket = resolveBucket(baseLabel);
    if (!bucketMap.has(bucket)) {
      bucketMap.set(bucket, { label: bucket, total: 0 });
      bucketOrder.push(bucket);
    }
    const male = typeof row.maleCount === 'number' ? row.maleCount : 0;
    const female = typeof row.femaleCount === 'number' ? row.femaleCount : 0;
    const totalRow =
      typeof row.totalCount === 'number' ? row.totalCount : male + female;
    bucketMap.get(bucket).total += totalRow;
  });
  const aggregatedRows = bucketOrder.map((bucket) => bucketMap.get(bucket));
  const x = aggregatedRows.map((row) => row.label);
  const totals = aggregatedRows.map((row) => row.total);
  const sumTotals = totals.reduce((acc, value) => acc + value, 0);
  const desiredTotal = Number.isFinite(targetTotal) && targetTotal > 0 ? targetTotal : sumTotals;
  const scale = sumTotals > 0 ? desiredTotal / sumTotals : 0;
  const scaledTotals = totals.map((value) => value * scale);
  const unit = 'hlöä';
  const hoverTexts = aggregatedRows.map((row, idx) => {
    const amount = scaledTotals[idx] || 0;
    return `${row.label}: ${formatCount(amount)} ${unit}`;
  });
  const trace = {
    type: 'bar',
    x,
    y: scaledTotals,
    hovertext: hoverTexts,
    hoverinfo: 'text',
    marker: { color: '#4a67ff' },
    cliponaxis: false,
    width: 0.55
  };
  const layout = {
    margin: { l: 55, r: 10, t: 10, b: 60 },
    height: 260,
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    xaxis: { title: '', tickangle: -45, automargin: true },
    yaxis: {
      title: { text: t.ageDistributionYAxis, standoff: 20 },
      ticksuffix: '',
      separatethousands: true,
      zeroline: false,
      automargin: true
    },
    font: { family: 'inherit' }
  };
  plotly.react(container, [trace], layout, {
    displayModeBar: false,
    responsive: true,
    staticPlot: true,
    scrollZoom: false
  });
}

function formatCount(value) {
  if (value == null || Number.isNaN(value)) {
    return '-';
  }
  const rounded = Math.round(value);
  return rounded.toLocaleString('fi-FI');
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
  'junction',
  'junction_transition',
  'head_transition',
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
  if (!entry) return '';
  const total = Number(entry.popularity);
  const rankKey = (entry.name || '').toLowerCase();
  const rank = surnameRankMap.get(rankKey);
  if (!Number.isFinite(total) || !Number.isFinite(rank)) {
    return '';
  }
  const formattedCount = formatNumberWithSpaces(total);
  const usageBuilder = translations.fi?.surnameUsage;
  if (typeof usageBuilder !== 'function') {
    return '';
  }
  return usageBuilder(formattedCount, rank);
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
  const evergreen = [];
  const parsePeriod = (key) => {
    const parts = key.split('_')[1] || '';
    const start = parseInt(parts.split('-')[0], 10);
    return Number.isFinite(start) ? start : -Infinity;
  };
  groupMeta.forEach((_, key) => {
    if (key.startsWith('popular_')) popular.push(key);
    else if (key.startsWith('trend_')) trend.push(key);
    else if (key === 'evergreen') evergreen.push(key);
  });
  popular.sort((a, b) => parsePeriod(b) - parsePeriod(a));
  trend.sort((a, b) => parsePeriod(b) - parsePeriod(a));
  return [...popular, ...trend, ...evergreen];
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
  if (key === 'evergreen') return 'Aina suositut';
  const meta = groupMeta.get(key);
  return meta ? getGroupLabel(meta) : key;
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

function escapeHtml(value) {
  if (!value) return '';
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function updateSurnameAnalysis(entry, missingSurname) {
  const container = $('#surname-analysis');
  if (!container) return;
  const surname = state.surname.trim();
  if (!surname) {
    container.textContent = '';
    return;
  }
  if (missingSurname || !entry) {
    container.textContent = translations.fi.surnameAnalysisMissing;
    return;
  }
  const usageText = getSurnameUsageText(entry);
  const insight = buildSurnameAnalysis(entry);
  const title = `<strong>${translations.fi.surnameAnalysisTitle}:</strong>`;
  const usageHtml = usageText ? `<span class="surname-usage">${usageText}</span>` : '';
  container.innerHTML = `${usageHtml}${title} ${insight}`;
  container.title = '';
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
  const evaluation = surnameEntry ? evaluateMatchComponents(entry, surnameEntry) : null;
  const matchLine = evaluation
    ? `Sukunimiosuvuus: ${(evaluation.normalized * 100).toFixed(1)} %`
    : '';
  const analysisText = traitSentences.join(' ');
  if (analysisText) {
    const analysisP = document.createElement('p');
    analysisP.className = 'analysis-text';
    analysisP.textContent = analysisText;
    container.appendChild(analysisP);
  }
  if (evaluation) {
    const parts = [matchLine, formatComponentBreakdown(evaluation.components)].filter(Boolean);
    if (parts.length) {
      const compP = document.createElement('p');
      compP.className = 'analysis-components';
      compP.textContent = parts.join(' — ');
      container.appendChild(compP);
    }
  }
  return container.childNodes.length ? container : null;
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

function createSummaryTag(text, extraClass) {
  const span = document.createElement('span');
  span.className = `tag ${extraClass || ''}`.trim();
  if (!text) {
    span.classList.add('tag-empty');
    span.innerHTML = '&nbsp;';
  } else {
    span.textContent = text;
  }
  return span;
}

function createAdPlaceholder(position = 'inline') {
  const slot = document.createElement('div');
  slot.className = `ad-slot ad-${position}`;
  slot.setAttribute('aria-label', 'Mainospaikka');
  slot.textContent = 'Mainospaikka';
  return slot;
}

function renderPronunciation(entry) {
  if (!entry.ipa) return '';
  const value = `fi: ${escapeHtml(entry.ipa.fi || '-')}`;
  return `<div class="pronunciation-values"><span>${value}</span></div>`;
}

function renderComboEstimate(entry, t, surnameEntry) {
  if (!entry._comboEstimate || !surnameEntry) {
    return '';
  }
  const countText = formatCount(entry._comboEstimate);
  return `~${countText} (${t.comboRowNote})`;
}

function renderGroupChips(entry, t) {
  if (!entry.groups || !entry.groups.length) {
    return `<span class="chip">${t.noGroupMembership}</span>`;
  }
  const visibleGroups = entry.groups.filter((key) => groupMeta.has(key));
  if (!visibleGroups.length) {
    return `<span class="chip">${t.noGroupMembership}</span>`;
  }
  return visibleGroups
    .map((key) => {
      const meta = groupMeta.get(key);
      const label = getGroupLabel(meta) || key;
      const desc = escapeHtml(meta?.description || meta?.label || label);
      return `<span class="chip" title="${desc}">${label}</span>`;
    })
    .join('');
}

function renderPhoneticSummary(entry, t) {
  const seen = new Set();
  const features = [];
  Object.entries(entry.phonetic).forEach(([key, data]) => {
    if (!phoneticMeta.has(key)) return;
    const include = data.value || (data.grade ?? 0) >= 2;
    if (!include) return;
    if (seen.has(key)) return;
    seen.add(key);
    features.push({
      key,
      label: getFeatureLabel(phoneticMeta.get(key)) || key,
      desc: getFeatureDescription(key)
    });
  });
  if (!features.length) {
    return `<span>${t.noPhoneticHighlights}</span>`;
  }
  return features
    .slice(0, 8)
    .map(
      (feature) =>
        `<span class="chip" title="${escapeHtml(feature.desc)}">${escapeHtml(feature.label)}</span>`
    )
    .join('');
}

function fetchWikiSummary(entry, container, t) {
  if (!container || container.dataset.status === 'loading' || container.dataset.status === 'done') {
    return;
  }
  container.dataset.status = 'loading';
  container.textContent = t.wikiLoading;
  const candidates = [`${entry.display}_(etunimi)`,`${entry.display}_(nimi)`, entry.display];

  const attempt = (idx) => {
    if (idx >= candidates.length) {
      container.textContent = t.wikiUnavailable;
      container.dataset.status = 'done';
      return;
    }
    const title = encodeURIComponent(candidates[idx]);
    const url = `https://fi.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&titles=${title}&format=json&origin=*`;
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error('Not found');
        return response.json();
      })
      .then((data) => {
        const extract = extractWikiText(data);
        if (!extract) {
          attempt(idx + 1);
          return;
        }
        container.innerHTML = `<strong>${t.wikiTitle}:</strong> ${escapeHtml(extract)}`;
        container.dataset.status = 'done';
      })
      .catch(() => attempt(idx + 1));
  };

  attempt(0);
}

function extractWikiText(payload) {
  if (!payload || !payload.query || !payload.query.pages) {
    return '';
  }
  const pages = payload.query.pages;
  const firstKey = Object.keys(pages)[0];
  if (!firstKey) return '';
  const page = pages[firstKey];
  if (!page || page.missing) return '';
  return page.extract || '';
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
  if (state.includeLetters) params.set('letters', state.includeLetters);
  if (state.excludeLetters) params.set('exclude', state.excludeLetters);
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
  const query = params.toString();
  const newUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
  history.replaceState(null, '', newUrl);
}

function bindEvents() {
  $('#sort-key').addEventListener('change', () => {
    updateSortOptionTooltips();
    applyFilters();
  });
  const surnameInput = $('#surname-input');
  if (surnameInput) {
    surnameInput.addEventListener('input', () => {
      clearTimeout(surnameInputTimer);
      surnameInputTimer = setTimeout(() => {
        applyFilters();
      }, 400);
    });
  }
  $('#toggle-sort').addEventListener('click', () => {
    state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    $('#toggle-sort').textContent = state.sortDir === 'asc' ? '↑' : '↓';
    applyFilters();
  });
  $('[data-action="add-phonetic"]').addEventListener('click', addPhoneticFilter);
  $('[data-action="add-group"]').addEventListener('click', addGroupFilter);
  $('[data-action="add-popularity"]').addEventListener('click', addPopularityFilter);
  $('#apply-filters').addEventListener('click', applyFilters);
  $('#prev-page').addEventListener('click', () => {
    if (state.page === 0) return;
    state.page -= 1;
    renderResults();
  });
  $('#next-page').addEventListener('click', () => {
    if ((state.page + 1) * PAGE_SIZE >= currentResults.length) return;
    state.page += 1;
    renderResults();
  });
  $('#prev-page-bottom').addEventListener('click', () => {
    if (state.page === 0) return;
    state.page -= 1;
    renderResults();
  });
  $('#next-page-bottom').addEventListener('click', () => {
    if ((state.page + 1) * PAGE_SIZE >= currentResults.length) return;
    state.page += 1;
    renderResults();
  });
}

async function init() {
  data = await loadData();
  prepareMatchingWeights();
  buildMetaMaps();
  applySchemaLimits();
  initSelects();
  restoreFromQuery();
  initRangeControls();
  attachPopulationInputEvents();
  syncFormWithState();
  initWeightEditor();
  bindEvents();
  applyFilters();
}

document.addEventListener('DOMContentLoaded', () => {
  init().catch((error) => {
    console.error('Failed to initialise app', error);
    $('#results-list').innerHTML = '<p class="hint">Datan lataus epäonnistui.</p>';
  });
});
