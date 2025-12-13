import {
  renderGroupChips,
  renderPhoneticSummary,
  renderUsageChart,
  renderAgeDistributionChart,
  fetchWikiSummary,
  formatCount
} from './detail-utils.js';

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

function renderCombinedTraits(entry, groupMeta, phoneticMeta, t = {}) {
  const groupHtml = renderGroupChips(entry, groupMeta, {
    emptyLabel: t.noGroupMembership || 'Ei ryhmäjäsenyyksiä',
    labelFor: (meta) => meta?.label || meta?.key,
    describe: (meta) => meta?.description || meta?.label || ''
  });
  const phoneticHtml = renderPhoneticSummary(entry, phoneticMeta, {
    labelFor: (meta) => meta?.label || meta?.key,
    describe: (meta) => meta?.description || ''
  });
  return [groupHtml, phoneticHtml].filter(Boolean).join(' ');
}

function renderComboEstimate(entry, t, surnameEntry) {
  if (!entry || !surnameEntry || !entry._comboEstimate) return '';
  const countText = formatCount(entry._comboEstimate);
  const note = t.comboRowNote || '';
  return `~${countText}${note ? ` (${note})` : ''}`;
}

export function createCardDetailLoader(options = {}) {
  const {
    ensureEntryDetails = (entry) => Promise.resolve(entry),
    groupMeta = new Map(),
    phoneticMeta = new Map(),
    t = {},
    shouldShowAd = () => false,
    buildHistoryLabel = null
  } = options;

  const labels = {
    detailsLoading: t.detailsLoading || 'Haetaan nimen tietoja…',
    detailsError: t.detailsError || 'Tietojen lataus epäonnistui.',
    traitsTitle: t.traitsTitle || 'Ominaisuudet',
    comboRowLabel: t.comboRowLabel || 'Täyskaimoja',
    historyTitle: t.historyTitle || 'Nimen suosio historiassa',
    historyLegendMale: t.historyLegendMale || 'Miehiä',
    historyLegendFemale: t.historyLegendFemale || 'Naisia',
    historyYAxis: t.historyYAxis || '%-osuus annetuista nimistä',
    historyNoData: t.historyNoData || 'Ei historiallista käyttödataa',
    ageDistributionTitle: t.ageDistributionTitle || 'Ikäjakauma (arvio)',
    ageDistributionNoData: t.ageDistributionNoData || 'Ei ikäjakaumatietoa',
    ageDistributionYAxis: t.ageDistributionYAxis || 'Henkilöitä (arvio)',
    wikiTitle: t.wikiTitle || 'Tietoa nimestä',
    wikiLoading: t.wikiLoading || 'Haetaan Wikipedia-tiivistelmää…',
    wikiUnavailable: t.wikiUnavailable || 'Wikipedia-artikkelia ei löytynyt'
  };

  function hydrateCard(card, container, entry, surnameEntry) {
    container.innerHTML = '';
    const wikiBlock = document.createElement('div');
    wikiBlock.className = 'wiki-summary';
    wikiBlock.dataset.status = 'idle';
    container.appendChild(wikiBlock);

    const details = document.createElement('div');
    details.className = 'details-section';
    const combined = renderCombinedTraits(entry, groupMeta, phoneticMeta, t);
    if (combined) {
      const groupRow = createDetailRow(labels.traitsTitle, combined, { asHtml: true });
      if (groupRow) details.appendChild(groupRow);
    }

    const comboContent = renderComboEstimate(entry, t, surnameEntry);
    if (comboContent) {
      const comboRow = createDetailRow(labels.comboRowLabel, comboContent);
      if (comboRow) details.appendChild(comboRow);
    }

    if (shouldShowAd()) {
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
    const historyLabel =
      typeof buildHistoryLabel === 'function'
        ? buildHistoryLabel(entry)
        : labels.historyTitle;
    const historyRow = createDetailRow(historyLabel, historyContent, {
      asHtml: Boolean(buildHistoryLabel)
    });
    if (historyRow) {
      historyRow.classList.add('chart-row');
      details.appendChild(historyRow);
    }

    const ageContent = document.createElement('div');
    ageContent.className = 'chart-shell';
    const ageChart = document.createElement('div');
    ageChart.className = 'plotly-chart';
    ageContent.appendChild(ageChart);
    const ageRow = createDetailRow(labels.ageDistributionTitle, ageContent);
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

    renderUsageChart(historyChart, entry.history, {
      noData: labels.historyNoData,
      legendMale: labels.historyLegendMale,
      legendFemale: labels.historyLegendFemale,
      yAxis: labels.historyYAxis
    });
    renderAgeDistributionChart(ageChart, entry.population, entry.popularity?.total, {
      noData: labels.ageDistributionNoData,
      yAxis: labels.ageDistributionYAxis
    });
    fetchWikiSummary(entry, wikiBlock, {
      loadingText: labels.wikiLoading,
      unavailableText: labels.wikiUnavailable,
      title: labels.wikiTitle,
      includeLink: true,
      linkLabel: 'Wikipedia'
    });

    card.dataset.hydrated = 'true';
    card._detailRefs = { wikiBlock, historyContainer: historyChart, ageContainer: ageChart };
  }

  return function loadCardDetails(card, bodyContainer, entry, context = {}) {
    const { surnameEntry } = context;
    if (!card || !bodyContainer || !entry) return;
    if (card.dataset.hydrated === 'true') {
      if (card._detailRefs?.wikiBlock) {
        fetchWikiSummary(entry, card._detailRefs.wikiBlock, {
          loadingText: labels.wikiLoading,
          unavailableText: labels.wikiUnavailable,
          title: labels.wikiTitle,
          includeLink: true,
          linkLabel: 'Wikipedia'
        });
      }
      return;
    }
    if (card.dataset.loading === 'true') return;
    card.dataset.loading = 'true';
    bodyContainer.innerHTML = `<p class="hint">${labels.detailsLoading}</p>`;
    ensureEntryDetails(entry)
      .then(() => {
        card.dataset.loading = 'false';
        hydrateCard(card, bodyContainer, entry, surnameEntry);
      })
      .catch(() => {
        card.dataset.loading = 'false';
        bodyContainer.innerHTML = `<p class="hint">${labels.detailsError}</p>`;
      });
  };
}
