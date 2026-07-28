const LANGUAGES = [
  { key: 'fi', label: 'fi' },
  { key: 'sv', label: 'sv' },
  { key: 'en', label: 'en' }
];
const WIKI_API_BASE = 'https://fi.wikipedia.org/w/api.php?origin=*';
const WIKI_INFOBOX_LABELS = ['Muunnelmia', 'Vastineita eri kielissä', 'Nimen alkuperä'];
const EMPTY_FIELD_PATTERN = /^[-–—]+$/;

const PLOTLY_SRC = 'https://cdn.plot.ly/plotly-2.26.0.min.js';
let plotlyPromise = null;

// Load Plotly (~1 MB) from the CDN on demand — only when a chart is actually
// about to render — instead of eagerly on every page. Resolves to window.Plotly,
// or null if the script fails to load (callers then show the no-data fallback).
export function ensurePlotly() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (window.Plotly) return Promise.resolve(window.Plotly);
  if (plotlyPromise) return plotlyPromise;
  plotlyPromise = new Promise((resolve) => {
    const done = () => resolve(window.Plotly || null);
    const existing = document.querySelector('script[data-plotly]');
    if (existing) {
      existing.addEventListener('load', done);
      existing.addEventListener('error', () => resolve(null));
      return;
    }
    const script = document.createElement('script');
    script.src = PLOTLY_SRC;
    script.async = true;
    script.dataset.plotly = 'true';
    script.onload = done;
    script.onerror = () => {
      plotlyPromise = null;
      resolve(null);
    };
    document.head.appendChild(script);
  });
  return plotlyPromise;
}

export function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

export function formatCount(value) {
  if (value == null || Number.isNaN(value)) {
    return '-';
  }
  const rounded = Math.round(value);
  return rounded.toLocaleString('fi-FI');
}

export function renderPronunciation(entry) {
  if (!entry?.ipa) return '';
  const spans = LANGUAGES.map(({ key, label }) => {
    const value = entry.ipa[key] || '-';
    return `<span>${label}: ${escapeHtml(String(value))}</span>`;
  }).join('');
  return `<div class="pronunciation-values">${spans}</div>`;
}

export function renderGroupChips(entry, groupMeta, options = {}) {
  const { emptyLabel = 'Ei ryhmäjäsenyyksiä', labelFor = (meta) => meta?.label || meta?.key, describe = (meta) => meta?.description || '' } = options;
  if (!entry?.groups || !entry.groups.length) {
    return `<span class="chip">${emptyLabel}</span>`;
  }
  const visibleGroups = entry.groups.filter((key) => groupMeta?.has(key));
  if (!visibleGroups.length) {
    return `<span class="chip">${emptyLabel}</span>`;
  }
  return visibleGroups
    .map((key) => {
      const meta = groupMeta.get(key);
      const label = labelFor(meta) || key;
      const desc = escapeHtml(describe(meta) || label);
      return `<span class="chip" title="${desc}">${escapeHtml(label)}</span>`;
    })
    .join('');
}

export function renderPhoneticSummary(entry, phoneticMeta, options = {}) {
  const { labelFor = (meta) => meta?.label || meta?.key, describe = (meta) => meta?.description || '' } = options;
  const features = [];
  const seen = new Set();
  Object.entries(entry?.phonetic || {}).forEach(([key, data]) => {
    if (!phoneticMeta?.has(key) || seen.has(key)) return;
    const include = data.value || (data.grade ?? 0) >= 2;
    if (!include) return;
    seen.add(key);
    const meta = phoneticMeta.get(key);
    features.push({
      key,
      label: labelFor(meta) || key,
      desc: describe(meta) || ''
    });
  });
  if (!features.length) return '';
  return features
    .slice(0, 8)
    .map(
      (feature) =>
        `<span class="chip" title="${escapeHtml(feature.desc)}">${escapeHtml(feature.label)}</span>`
    )
    .join('');
}

export async function renderUsageChart(container, history, labels = {}) {
  if (!container) return;
  const {
    noData = 'Ei historiallista käyttödataa',
    legendMale = 'Miehiä',
    legendFemale = 'Naisia',
    yAxis = '%-osuus annetuista nimistä'
  } = labels;
  const periods = history?.periods || [];
  if (!periods.length) {
    container.textContent = noData;
    return;
  }
  const datasets = [
    { label: legendMale, color: '#0b57d0', data: history?.male || {} },
    { label: legendFemale, color: '#c2185b', data: history?.female || {} }
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
    container.textContent = noData;
    return;
  }
  const plotly = await ensurePlotly();
  if (!plotly) {
    container.textContent = noData;
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
      title: { text: yAxis, standoff: 20 },
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
    modeBarButtonsToRemove: [
      'zoom2d',
      'pan2d',
      'select2d',
      'lasso2d',
      'zoomIn2d',
      'zoomOut2d',
      'autoScale2d',
      'hoverClosestCartesian',
      'hoverCompareCartesian'
    ]
  });
}

export async function renderAgeDistributionChart(container, population, targetTotal, labels = {}) {
  if (!container) return;
  const { noData = 'Ei ikäjakaumatietoa', yAxis = 'Henkilöitä (arvio)' } = labels;
  const rawData = population?.ageDistribution || [];
  if (!rawData.length) {
    container.textContent = noData;
    return;
  }
  const plotly = await ensurePlotly();
  if (!plotly) {
    container.textContent = noData;
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
  let maleTotal = 0;
  let femaleTotal = 0;
  rawData.forEach((row) => {
    const baseLabel = row.ageRange || row.period || '';
    const bucket = resolveBucket(baseLabel);
    if (!bucketMap.has(bucket)) {
      bucketMap.set(bucket, { label: bucket, total: 0 });
      bucketOrder.push(bucket);
    }
    const male = typeof row.maleCount === 'number' ? row.maleCount : 0;
    const female = typeof row.femaleCount === 'number' ? row.femaleCount : 0;
    const totalRow = typeof row.totalCount === 'number' ? row.totalCount : male + female;
    maleTotal += male;
    femaleTotal += female;
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
  const maleColor = '#e0f0ff';
  const femaleColor = '#ffe2eb';
  const defaultColor = '#4a67ff';
  let barColor = defaultColor;
  if (maleTotal > femaleTotal) {
    barColor = maleColor;
  } else if (femaleTotal > maleTotal) {
    barColor = femaleColor;
  }

  const trace = {
    type: 'bar',
    x,
    y: scaledTotals,
    hovertext: hoverTexts,
    hoverinfo: 'text',
    marker: { color: barColor },
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
      title: { text: yAxis, standoff: 20 },
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

// --- Small HTML sanitizer for Wikipedia snippets ---
function sanitizeWikiHtml(html) {
  const tmp = document.createElement('div');
  tmp.innerHTML = html;

  // Remove unsafe tags
  tmp.querySelectorAll('script, style').forEach(el => el.remove());

  tmp.querySelectorAll('*').forEach(el => {
    // Strip inline event handlers
    [...el.attributes].forEach(attr => {
      if (attr.name.toLowerCase().startsWith('on')) {
        el.removeAttribute(attr.name);
      }
    });

    // Fix anchors
    if (el.tagName === 'A') {
      const href = el.getAttribute('href') || '';
      if (href.startsWith('/wiki/')) {
        el.setAttribute('href', 'https://fi.wikipedia.org' + href);
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener');
      } else if (!href.startsWith('http')) {
        // Drop weird protocols
        el.removeAttribute('href');
      } else {
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener');
      }
    }
  });

  return tmp.innerHTML.trim();
}

function hasMeaningfulHtml(html) {
  if (!html) return false;
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const text = (tmp.textContent || '').replace(/\s+/g, ' ').trim();
  const compact = text.replace(/\s+/g, '');
  if (!text || EMPTY_FIELD_PATTERN.test(compact)) {
    return false;
  }
  return true;
}

// --- Infobox: Muunnelmia / Vastineita eri kielissä / Nimen alkuperä (with links) ---
async function fetchInfoboxFields(pageTitle) {
  const url =
    `${WIKI_API_BASE}` +
    `&action=parse&page=${encodeURIComponent(pageTitle)}` +
    '&prop=text&format=json&redirects=1';

  const res = await fetch(url);
  if (!res.ok) return {};
  const data = await res.json();
  const html = data.parse?.text?.['*'];
  if (!html) return {};

  const tmp = document.createElement('div');
  tmp.innerHTML = html;

  const infobox =
    tmp.querySelector('table.infobox') ||
    tmp.querySelector('table.infobox.suomi') ||
    tmp.querySelector('table.infobox.etunimi') ||
    tmp.querySelector('table[class*="infobox"]');

  if (!infobox) return {};

  const result = {};

  infobox.querySelectorAll('tr').forEach(tr => {
    const cells = tr.querySelectorAll('th, td');
    if (cells.length < 2) return;

    const labelNode = cells[0];
    const valueNode = cells[1];

    let label = labelNode.textContent || '';
    label = label.replace(/\u00A0/g, ' ');   // nbsp -> space
    label = label.replace(/\s+/g, ' ').trim();

    const matched = WIKI_INFOBOX_LABELS.find((w) => w === label);
    if (!matched) return;

    const sanitized = sanitizeWikiHtml(valueNode.innerHTML);
    if (!hasMeaningfulHtml(sanitized)) return;

    result[matched] = sanitized;
  });

  return result;
}

// --- Known people: "Tunnettuja Antteja / Mikkoja..." on one line with toggle ---
async function fetchKnownPeople(pageTitle) {
  const base = WIKI_API_BASE;

  const sectionsUrl =
    `${base}&action=parse&page=${encodeURIComponent(pageTitle)}` +
    '&prop=sections&format=json&redirects=1';

  const secRes = await fetch(sectionsUrl);
  if (!secRes.ok) return null;
  const secData = await secRes.json();
  const sections = secData.parse?.sections || [];

  // Generic: "Tunnettuja Antteja", "Tunnettuja Mikkoja", ...
  let section = sections.find(s => s.line && s.line.startsWith('Tunnettuja '));
  if (!section) return null;

  const sectionUrl =
    `${base}&action=parse&page=${encodeURIComponent(pageTitle)}` +
    `&prop=text&section=${section.index}&format=json&redirects=1`;

  const sectionRes = await fetch(sectionUrl);
  if (!sectionRes.ok) return null;
  const sectionData = await sectionRes.json();
  const html = sectionData.parse?.text?.['*'];
  if (!html) return null;

  const tmp = document.createElement('div');
  tmp.innerHTML = html;

  const peopleHtml = [];

  tmp.querySelectorAll('li').forEach(li => {
    const a = li.querySelector('a[href^="/wiki/"]');
    if (!a) return;

    const name = a.textContent.trim();
    const href = a.getAttribute('href') || '';

    // Full list item text
    let fullText = li.textContent.trim();

    // Remove the name at the beginning to get description
    if (fullText.toLowerCase().startsWith(name.toLowerCase())) {
      fullText = fullText.slice(name.length).trim();
    }

    // Trim leading punctuation
    fullText = fullText.replace(/^[-,:–—\s]+/, '').trim();

    const linkHtml = `<a href="https://fi.wikipedia.org${href}" target="_blank" rel="noopener">${escapeHtml(name)}</a>`;
    const itemHtml = fullText
      ? `${linkHtml} (${escapeHtml(fullText)})`
      : linkHtml;

    peopleHtml.push(itemHtml);
  });

  if (!peopleHtml.length) return null;

  return {
    title: section.line,     // e.g. "Tunnettuja Antteja"
    peopleHtml
  };
}

function buildWikiCandidates(entry) {
  const display = entry?.display ? entry.display.trim() : '';
  return [`${display}_(etunimi)`, `${display}_(nimi)`, display].filter(Boolean);
}

function setWikiStatus(container, status, text) {
  container.dataset.status = status;
  if (typeof text === 'string') {
    container.textContent = text;
  }
}

async function fetchWikiExtract(pageTitle) {
  const url =
    `${WIKI_API_BASE}` +
    `&action=query&prop=extracts&exintro&explaintext&titles=${encodeURIComponent(pageTitle)}` +
    '&format=json';
  const response = await fetch(url);
  if (!response.ok) throw new Error('Wikipedia extract failed');
  const data = await response.json();
  const extract = extractWikiText(data);
  if (!extract) return null;
  return { pageTitle, extract };
}

async function appendInfoboxFields(container, pageTitle) {
  const fields = await fetchInfoboxFields(pageTitle);
  Object.entries(fields || {}).forEach(([label, html]) => {
    if (!hasMeaningfulHtml(html)) return;
    container.insertAdjacentHTML('beforeend', `<br><em>${escapeHtml(label)}:</em> ${html}`);
  });
}

async function appendKnownPeople(container, pageTitle, options) {
  const { maxVisible, fullToggleLabel, lessToggleLabel, toggleClass } = options;
  const known = await fetchKnownPeople(pageTitle);
  if (!known || !known.peopleHtml?.length) return;

  const visibleCount =
    Number.isFinite(maxVisible) && maxVisible > 0 ? maxVisible : known.peopleHtml.length;
  const isLong = known.peopleHtml.length > visibleCount;
  const visible = isLong ? known.peopleHtml.slice(0, visibleCount) : known.peopleHtml;

  container.insertAdjacentHTML('beforeend', '<br>');

  const labelSpan = document.createElement('span');
  labelSpan.innerHTML = `<em>${escapeHtml(known.title)}:</em> `;
  container.appendChild(labelSpan);

  const shortSpan = document.createElement('span');
  const fullSpan = document.createElement('span');
  fullSpan.style.display = 'none';

  shortSpan.innerHTML = visible.join(', ') + (isLong ? ', …' : '');
  fullSpan.innerHTML = known.peopleHtml.join(', ');

  container.appendChild(shortSpan);
  container.appendChild(fullSpan);

  if (!isLong) return;

  container.appendChild(document.createTextNode(' '));

  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.textContent = fullToggleLabel;
  const classNames = ['wiki-toggle', toggleClass].filter(Boolean).join(' ');
  if (classNames) {
    toggleBtn.className = classNames;
  }

  toggleBtn.addEventListener('click', () => {
    const isShowingFull = fullSpan.style.display !== 'none';
    if (isShowingFull) {
      fullSpan.style.display = 'none';
      shortSpan.style.display = '';
      toggleBtn.textContent = fullToggleLabel;
    } else {
      fullSpan.style.display = '';
      shortSpan.style.display = 'none';
      toggleBtn.textContent = lessToggleLabel;
    }
  });

  container.appendChild(toggleBtn);
}

export async function fetchWikiSummary(entry, container, options = {}) {
  const {
    loadingText = 'Haetaan Wikipedia-tiivistelmää…',
    unavailableText = 'Wikipedia-artikkelia ei löytynyt',
    title = 'Tietoa Wikipediasta',
    includeLink = false,
    linkLabel = 'Wikipedia',
    fullToggleLabel = 'Näytä koko yhteenveto',
    lessToggleLabel = 'Näytä vähemmän',
    maxKnownPeopleVisible = 8,
    summaryToggleClass = ''
  } = options;

  if (!container || container.dataset.status === 'loading' || container.dataset.status === 'done') {
    return;
  }

  setWikiStatus(container, 'loading', loadingText);

  const candidates = buildWikiCandidates(entry);
  let summary = null;

  for (const candidate of candidates) {
    try {
      const result = await fetchWikiExtract(candidate);
      if (result) {
        summary = result;
        break;
      }
    } catch (err) {
      // Try next candidate
    }
  }

  if (!summary) {
    setWikiStatus(container, 'done', unavailableText);
    return;
  }

  const wikiUrl = `https://fi.wikipedia.org/wiki/${summary.pageTitle}`;
  const prefix = includeLink
    ? `${title} (<a href="${wikiUrl}" target="_blank" rel="noopener">${linkLabel}</a>)`
    : title;

  container.innerHTML = `<strong>${prefix}:</strong> ${escapeHtml(summary.extract)}`;
  container.dataset.status = 'done';

  const tasks = [
    appendInfoboxFields(container, summary.pageTitle),
    appendKnownPeople(container, summary.pageTitle, {
      maxVisible: maxKnownPeopleVisible,
      fullToggleLabel,
      lessToggleLabel,
      toggleClass: summaryToggleClass
    })
  ];

  tasks.forEach((task) => task?.catch?.(() => {}));
}


export function createAdTracker(frequency = 0) {
  let counter = 0;
  return {
    shouldShow: () => {
      counter += 1;
      return frequency > 0 && counter % frequency === 0;
    },
    reset: () => {
      counter = 0;
    }
  };
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
