const LANGUAGES = [
  { key: 'fi', label: 'fi' },
  { key: 'sv', label: 'sv' },
  { key: 'en', label: 'en' }
];

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

export function renderUsageChart(container, history, labels = {}) {
  if (!container) return;
  const {
    noData = 'Ei historiallista käyttödataa',
    legendMale = 'Miehiä',
    legendFemale = 'Naisia',
    yAxis = '%-osuus annetuista nimistä'
  } = labels;
  const plotly = window.Plotly;
  if (!plotly) {
    container.textContent = noData;
    return;
  }
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

export function renderAgeDistributionChart(container, population, targetTotal, labels = {}) {
  if (!container) return;
  const { noData = 'Ei ikäjakaumatietoa', yAxis = 'Henkilöitä (arvio)' } = labels;
  const plotly = window.Plotly;
  if (!plotly) {
    container.textContent = noData;
    return;
  }
  const rawData = population?.ageDistribution || [];
  if (!rawData.length) {
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

export function fetchWikiSummary(entry, container, options = {}) {
  const {
    loadingText = 'Haetaan Wikipedia-tiivistelmää…',
    unavailableText = 'Wikipedia-artikkelia ei löytynyt',
    title = 'Tietoa Wikipediasta',
    includeLink = false,
    linkLabel = 'Wikipedia'
  } = options;
  if (!container || container.dataset.status === 'loading' || container.dataset.status === 'done') {
    return;
  }
  container.dataset.status = 'loading';
  container.textContent = loadingText;
  const candidates = [`${entry.display}_(etunimi)`, `${entry.display}_(nimi)`, entry.display];

  const attempt = (idx) => {
    if (idx >= candidates.length) {
      container.textContent = unavailableText;
      container.dataset.status = 'done';
      return;
    }
    const titleValue = encodeURIComponent(candidates[idx]);
    const url = `https://fi.wikipedia.org/w/api.php?action=query&prop=extracts&exintro&explaintext&titles=${titleValue}&format=json&origin=*`;
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
        const wikiUrl = `https://fi.wikipedia.org/wiki/${candidates[idx]}`;
        const prefix = includeLink
          ? `${title} (<a href="${wikiUrl}" target="_blank" rel="noopener">${linkLabel}</a>)`
          : title;
        container.innerHTML = `<strong>${prefix}:</strong> ${escapeHtml(extract)}`;
        container.dataset.status = 'done';
      })
      .catch(() => attempt(idx + 1));
  };

  attempt(0);
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
