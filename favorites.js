const DATA_FILE = 'data/first-names.json';
const SCHEMA_FILE = 'data/schema.json';
const FAVORITES_KEY = 'favoriteNames';

let favorites = new Set();
let activeNames = new Set();
let nameMap = new Map();
let pendingRemovals = new Set();
let schema = null;
let detailBasePath = 'data/details';
let detailBucketMap = {};
const detailCache = new Map();
let groupMeta = new Map();
let phoneticMeta = new Map();
const DETAIL_AD_FREQUENCY = 3;
let detailAdCounter = 0;

function loadFavoritesFromStorage() {
  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(arr.filter(Boolean));
  } catch {
    return new Set();
  }
}

function saveFavoritesToStorage(namesSet) {
  const arr = Array.from(namesSet);
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(arr));
}

function encodeFavorites(names) {
  const raw = names.join('|');
  const base = btoa(unescape(encodeURIComponent(raw)));
  return base.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeFavoritesParam(value) {
  if (!value) return [];
  let base = value.replace(/-/g, '+').replace(/_/g, '/');
  while (base.length % 4) base += '=';
  try {
    const decoded = decodeURIComponent(escape(atob(base)));
    return decoded.split('|').filter(Boolean);
  } catch {
    return [];
  }
}

async function loadData() {
  const [namesRes, schemaRes] = await Promise.all([fetch(DATA_FILE), fetch(SCHEMA_FILE)]);
  if (!namesRes.ok || !schemaRes.ok) throw new Error('Failed to load data');
  const json = await namesRes.json();
  schema = await schemaRes.json();
  nameMap = new Map(json.names.map((entry) => [entry.name, entry]));
  detailBasePath = schema.details?.basePath || 'data/details';
  detailBucketMap = schema.details?.buckets || {};
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
    const entry = nameMap.get(name);
    const card = createNameCard(entry || { name, display: name }, name);
    list.appendChild(card);
  });
  count.textContent = `${activeNames.size} suosikkia`;
  context.textContent = pendingRemovals.size
    ? 'Poista punaiseksi muuttuneet tähdet tallentamalla muutokset.'
    : '';
}

function createTag(text) {
  const span = document.createElement('span');
  span.className = 'tag';
  span.textContent = text;
  return span;
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

function createNameCard(entry, key) {
  const card = document.createElement('details');
  card.className = 'name-card';
  const summary = document.createElement('summary');
  const title = document.createElement('span');
  title.className = 'name-title';
  const label = entry?.display || entry?.name || key || 'Nimi';
  title.textContent = label;
  summary.appendChild(title);

  const tagsWrap = document.createElement('div');
  tagsWrap.className = 'summary-tags';
  const pop = entry?.popularity?.total;
  if (pop != null) {
    tagsWrap.appendChild(createTag(`${pop.toLocaleString('fi-FI')} hlöä`));
  }
  summary.appendChild(tagsWrap);

  const favBtn = document.createElement('button');
  favBtn.type = 'button';
  favBtn.className = 'favorite-btn active';
  favBtn.textContent = '★';
  favBtn.title = 'Poista suosikeista';
  favBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    togglePendingRemoval(key, card, favBtn);
  });
  summary.appendChild(favBtn);

  if (pendingRemovals.has(key)) {
    card.classList.add('marked-remove');
    favBtn.classList.remove('active');
    favBtn.textContent = '☆';
    favBtn.title = 'Palauta suosikiksi';
  }

  const body = document.createElement('div');
  body.className = 'name-card-body';
  card.appendChild(body);

  card.addEventListener('toggle', () => {
    if (card.open) {
      loadCardDetails(card, body, entry);
    }
  });

  return card;
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
  saveFavoritesToStorage(favorites);
  updateSaveVisibility();
  renderFavorites();
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
  if (!entry || entry._detailsLoaded) return entry;
  const bucket = entry.detailBucket || (entry.name ? entry.name[0] : 'misc');
  const detailEntries = await loadDetailBucket(bucket);
  const detail = detailEntries?.[entry.name];
  if (detail) Object.assign(entry, detail);
  entry._detailsLoaded = true;
  return entry;
}

function renderPronunciation(entry) {
  if (!entry.ipa) return '';
  const languages = [
    { key: 'fi', label: 'fi' },
    { key: 'sv', label: 'sv' },
    { key: 'en', label: 'en' }
  ];
  const spans = languages
    .map(({ key, label }) => {
      const value = entry.ipa[key] || '-';
      return `<span>${label}: ${escapeHtml(String(value))}</span>`;
    })
    .join('');
  return `<div class="pronunciation-values">${spans}</div>`;
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

function renderGroupChips(entry) {
  if (!entry.groups || !entry.groups.length) {
    return `<span class="chip">Ei ryhmäjäsenyyksiä</span>`;
  }
  const visibleGroups = entry.groups.filter((key) => groupMeta.has(key));
  if (!visibleGroups.length) {
    return `<span class="chip">Ei ryhmäjäsenyyksiä</span>`;
  }
  return visibleGroups
    .map((key) => {
      const meta = groupMeta.get(key);
      const label = meta?.label || key;
      const desc = escapeHtml(meta?.description || label);
      return `<span class="chip" title="${desc}">${label}</span>`;
    })
    .join('');
}

function renderPhoneticSummary(entry) {
  const seen = new Set();
  const features = [];
  Object.entries(entry.phonetic || {}).forEach(([key, data]) => {
    if (!phoneticMeta.has(key)) return;
    const include = data.value || (data.grade ?? 0) >= 2;
    if (!include) return;
    if (seen.has(key)) return;
    seen.add(key);
    features.push({
      key,
      label: phoneticMeta.get(key)?.label || key,
      desc: phoneticMeta.get(key)?.description || ''
    });
  });
  if (!features.length) {
    return `<span>Ei erityisiä piirteitä</span>`;
  }
  return features
    .slice(0, 8)
    .map(
      (feature) =>
        `<span class="chip" title="${escapeHtml(feature.desc)}">${escapeHtml(feature.label)}</span>`
    )
    .join('');
}

function renderUsageChart(container, history) {
  if (!container) return;
  const plotly = window.Plotly;
  if (!plotly) {
    container.textContent = 'Ei historiallista käyttödataa';
    return;
  }
  const periods = history?.periods || [];
  if (!periods.length) {
    container.textContent = 'Ei historiallista käyttödataa';
    return;
  }
  const datasets = [
    { label: 'Miehiä', color: '#0b57d0', data: history.male || {} },
    { label: 'Naisia', color: '#c2185b', data: history.female || {} }
  ].map((series) => {
    const share = periods.map((_, idx) => Number(series.data.share?.[idx]) || 0);
    return { share, color: series.color, label: series.label };
  });
  const hasData = datasets.some((dataset) => dataset.share.some((value) => value > 0));
  if (!hasData) {
    container.textContent = 'Ei historiallista käyttödataa';
    return;
  }
  const traces = datasets.map((dataset) => ({
    x: periods,
    y: dataset.share.map((value) => value * 100),
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
    xaxis: {
      title: '',
      tickmode: 'array',
      tickvals: periods,
      ticktext: periods.map((period) => period.replace('-', '-')),
      tickangle: -45,
      automargin: true
    },
    yaxis: {
      title: { text: 'Nimen käyttö historiassa', standoff: 20 },
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
    staticPlot: false,
    displaylogo: false
  });
}

function renderAgeDistributionChart(container, population, targetTotal) {
  if (!container) return;
  const plotly = window.Plotly;
  if (!plotly) {
    container.textContent = 'Ei ikäjakaumatietoa';
    return;
  }
  const rawData = population?.ageDistribution || [];
  if (!rawData.length) {
    container.textContent = 'Ei ikäjakaumatietoa';
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
    const totalRow =
      typeof row.totalCount === 'number'
        ? row.totalCount
        : (row.maleCount || 0) + (row.femaleCount || 0);
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
      title: { text: 'Ikäjakauma (arvio)', standoff: 20 },
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

function fetchWikiSummary(entry, container) {
  if (!container || container.dataset.status === 'loading' || container.dataset.status === 'done') {
    return;
  }
  container.dataset.status = 'loading';
  container.textContent = 'Haetaan Wikipedia-tiivistelmää…';
  const candidates = [`${entry.display}_(etunimi)`, `${entry.display}_(nimi)`, entry.display];

  const attempt = (idx) => {
    if (idx >= candidates.length) {
      container.textContent = 'Wikipedia-artikkelia ei löytynyt';
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
        container.innerHTML = `<strong>Tietoa Wikipediasta:</strong> ${escapeHtml(extract)}`;
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

function escapeHtml(value) {
  if (!value) return '';
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function formatCount(value) {
  if (value == null || Number.isNaN(value)) {
    return '-';
  }
  const rounded = Math.round(value);
  return rounded.toLocaleString('fi-FI');
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

  const groupsHtml = renderGroupChips(entry);
  const groupRow = createDetailRow('Ryhmäjäsenyydet', groupsHtml);
  if (groupRow) details.appendChild(groupRow);

  const phoneticSummary = renderPhoneticSummary(entry);
  const phoneticRow = createDetailRow('Äännepiirteet', phoneticSummary);
  if (phoneticRow) details.appendChild(phoneticRow);

  const pronunciationRow = createDetailRow('Ääntäminen', renderPronunciation(entry));
  if (pronunciationRow) details.appendChild(pronunciationRow);

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

  renderUsageChart(historyChart, entry.history);
  renderAgeDistributionChart(ageChart, entry.population, entry.popularity?.total);
  if (wikiBlock) {
    fetchWikiSummary(entry, wikiBlock);
  }
}

function shouldShowDetailAd() {
  detailAdCounter += 1;
  if (DETAIL_AD_FREQUENCY <= 0) return false;
  return detailAdCounter % DETAIL_AD_FREQUENCY === 0;
}
function decodeActiveNames() {
  const params = new URLSearchParams(window.location.search);
  const shared = decodeFavoritesParam(params.get('f'));
  favorites = loadFavoritesFromStorage();
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
