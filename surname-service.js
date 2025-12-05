import { computePairScore as computeModelPairScore } from './matching-model.js';

export function buildSurnameData(surnames = []) {
  const clean = (surnames || []).filter((entry) => (entry.name || '').trim().length);
  const map = new Map(clean.map((entry) => [entry.name.toLowerCase(), entry]));
  const rankMap = new Map();
  clean
    .sort((a, b) => (Number(b.popularity) || 0) - (Number(a.popularity) || 0))
    .forEach((entry, idx) => {
      rankMap.set((entry.name || '').toLowerCase(), idx + 1);
    });
  return { map, rankMap };
}

export function findSurname(entryMap, value) {
  const key = (value || '').trim().toLowerCase();
  if (!key) return null;
  return entryMap.get(key) || null;
}

export function annotateMatches(entries, surnameEntry, defaultMatchWeights, matchingModel) {
  const surnameCount = surnameEntry ? Number(surnameEntry.popularity) || 0 : 0;
  entries.forEach((entry) => {
    if (surnameEntry && matchingModel) {
      const result = computeModelPairScore(entry, surnameEntry, defaultMatchWeights, matchingModel);
      entry._match = result?.normalized ?? 0;
    } else {
      entry._match = null;
    }
    if (surnameEntry && surnameCount && entry.populationShare) {
      const comboValue = surnameCount * entry.populationShare;
      entry._comboEstimate = comboValue >= 0.5 ? comboValue : null;
    } else {
      entry._comboEstimate = null;
    }
  });
}

export function formatSurnameUsage(entry, rankMap, usageBuilder) {
  if (!entry) return '';
  const total = Number(entry.popularity);
  const rankKey = (entry.name || '').toLowerCase();
  let rank = rankMap.get(rankKey);
  if (!Number.isFinite(rank) && Number.isFinite(total) && rankMap.size) {
    const sorted = [...rankMap.entries()].sort((a, b) => a[1] - b[1]);
    const greater = sorted.filter(([_, r]) => r <= total).length;
    rank = greater || null;
  }
  if (!Number.isFinite(total)) return '';
  const formattedCount = formatNumberWithSpaces(total);
  if (typeof usageBuilder !== 'function') {
    return formattedCount ? `Sukunimeä käyttää ${formattedCount} henkilöä.` : '';
  }
  if (!Number.isFinite(rank)) {
    return `Sukunimeä käyttää ${formattedCount} henkilöä.`;
  }
  return usageBuilder(formattedCount, rank);
}

export function formatNumberWithSpaces(value) {
  if (value == null || Number.isNaN(value)) return '';
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

