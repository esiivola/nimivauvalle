// Shared result sorting for the search page (app.js) and the favorites page.
//
// The two pages compute `activeSortKey` and `dir` differently (they resolve the
// "match" fallback from their own surname state), so those stay with the caller;
// what is shared here is the per-entry sort value, the period-column helpers, and
// the comparator (identical in both pages).

export function buildPeriodRanks(schema) {
  const periodRanks = new Map();
  (schema?.sorting || [])
    .filter((option) => option.period)
    .forEach((option) => {
      periodRanks.set(option.key, option.period);
    });
  return periodRanks;
}

export function getPeriodRankValue(entry, period) {
  const ranks = entry.historyRanks;
  if (!ranks) return 0;
  const value = ranks[period];
  if (!Number.isFinite(value) || value <= 0) return 0;
  return -value;
}

export function getPeriodCountValue(entry, period) {
  const countsMap = entry.historyCounts;
  if (!countsMap) return null;
  const value = countsMap[period];
  if (value == null || Number.isNaN(value)) return null;
  return Number(value);
}

export function getSortValue(entry, { activeSortKey, periodRanks, metricKeys }) {
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

export function createSortComparator({ activeSortKey, dir, periodRanks, metricKeys }) {
  const opts = { activeSortKey, periodRanks, metricKeys };
  return (a, b) => {
    const aVal = getSortValue(a, opts);
    const bVal = getSortValue(b, opts);
    if (aVal === bVal) {
      return (a.display || a.name || '').localeCompare(b.display || b.name || '', 'fi');
    }
    return aVal > bVal ? dir : -dir;
  };
}
