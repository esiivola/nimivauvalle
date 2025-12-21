import { computePairScore as computeModelPairScore } from './matching-model.js';

const FRONT_VOWELS = new Set(['y', '\u00fc', '\u00f6', '\u00f8', '\u00e4', '\u00e6', '\u0153']);
const NEUTRAL_VOWELS = new Set(['e', 'i']);
const BACK_VOWELS = new Set(['a', 'o', 'u', '\u00e5']);
const CLOSE_VOWELS = new Set(['i', 'y', 'u', '\u00fc']);
const MID_VOWELS = new Set(['e', 'o', '\u00f6', '\u00f8', '\u0153']);
const OPEN_VOWELS = new Set(['a', '\u00e4', '\u00e5', '\u00e6']);
const VOWELS = new Set([...FRONT_VOWELS, ...NEUTRAL_VOWELS, ...BACK_VOWELS]);
const SOFT_CONSONANTS = new Set(['m', 'n', 'l', 'r', 'j', 'v']);
const HARD_CONSONANTS = new Set(['p', 't', 'k', 'b', 'd', 'g', 's', 'f', 'h', 'c', 'q', 'x', 'z']);
const PRESERVE_LETTERS = new Set([
  '\u00e4',
  '\u00f6',
  '\u00e5',
  '\u00fc',
  '\u00f8',
  '\u00e6',
  '\u0153'
]);
const SPECIAL_LETTER_MAP = {
  '\u00df': 's'
};
const VALENCE_MAP = {
  u: -1,
  o: -0.9,
  m: -0.8,
  '\u00f6': -0.75,
  a: -0.7,
  '\u00e5': -0.7,
  '\u00e4': -0.6,
  n: -0.5,
  e: -0.35,
  j: -0.3,
  v: -0.2,
  h: -0.1,
  k: 1,
  t: 0.9,
  s: 0.8,
  f: 0.7,
  p: 0.6,
  g: 0.5,
  d: 0.4,
  i: 0.35,
  b: 0.3,
  r: 0.2,
  y: 0.15,
  '\u00fc': 0.15,
  '\u00f8': -0.75,
  '\u00e6': -0.6,
  '\u0153': -0.75
};
const SURNAME_MATCH_CACHE_LIMIT = 50;
const surnameMatchCache = new WeakMap();
const fallbackSurnameMatchCache = new Map();
export const SURNAME_MATCH_BLEND = {
  enabled: false,
  neighborCount: 5,
  exactWeight: 0.5,
  proxyWeightMissing: 0.3,
  lengthWindow: 3,
  lengthScale: 12,
  syllableScale: 6,
  metricDistanceWeight: 0.4,
  editDistanceWeight: 0.6,
  editInsertCost: 1,
  editDeleteCost: 1,
  editVowelSameOpennessCost: 0.35,
  editVowelSameLocationCost: 0.45,
  editVowelOtherCost: 0.7,
  editConsonantSameGroupCost: 0.45,
  editConsonantOtherCost: 0.85,
  editVowelConsonantCost: 1.2,
  distanceEpsilon: 1e-3,
  distancePower: 1,
  metricWeights: {
    front_ratio: 1,
    back_ratio: 1,
    open_ratio: 0.8,
    close_ratio: 0.8,
    soft_ratio: 0.7,
    valence: 0.6,
    length: 0.35,
    syllables: 0.35
  }
};

function getSurnameCacheKey(value) {
  return (value || '').trim().toLowerCase();
}

function getSurnameMatchCache(surnames) {
  if (Array.isArray(surnames)) {
    let cache = surnameMatchCache.get(surnames);
    if (!cache) {
      cache = new Map();
      surnameMatchCache.set(surnames, cache);
    }
    return cache;
  }
  return fallbackSurnameMatchCache;
}

function getCachedMatchContext(cache, key) {
  if (!key) return null;
  const cached = cache.get(key);
  if (!cached) return null;
  cache.delete(key);
  cache.set(key, cached);
  return cached;
}

function setCachedMatchContext(cache, key, value) {
  if (!key) return;
  cache.set(key, value);
  if (cache.size <= SURNAME_MATCH_CACHE_LIMIT) return;
  const firstKey = cache.keys().next().value;
  if (firstKey) cache.delete(firstKey);
}

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

export function resolveSurnameEntry(entryMap, value) {
  const key = (value || '').trim().toLowerCase();
  const dataEntry = key ? entryMap.get(key) || null : null;
  const proxyEntry = !dataEntry ? buildSurnameProxyEntry(value) : null;
  return {
    dataEntry,
    proxyEntry,
    matchEntry: dataEntry || proxyEntry,
    isProxy: Boolean(proxyEntry) && !dataEntry
  };
}

export function buildSurnameMatchContext(
  surnames = [],
  entryMap,
  value,
  options = {}
) {
  const config = { ...SURNAME_MATCH_BLEND, ...(options || {}) };
  const cacheKey = getSurnameCacheKey(value);
  const cache = getSurnameMatchCache(surnames);
  const cacheEnabled = Boolean(cacheKey && (!options || Object.keys(options).length === 0));
  if (cacheEnabled) {
    const cached = getCachedMatchContext(cache, cacheKey);
    if (cached) return cached;
  }
  const resolution = resolveSurnameEntry(entryMap, value);
  const matchEntry = resolution.matchEntry;
  if (!matchEntry) {
    const result = { resolution, weightedEntries: [], config };
    if (cacheEnabled) {
      setCachedMatchContext(cache, cacheKey, result);
    }
    return result;
  }
  if (!config.enabled || config.neighborCount <= 0) {
    const result = { resolution, weightedEntries: [{ entry: matchEntry, weight: 1 }], config };
    if (cacheEnabled) {
      setCachedMatchContext(cache, cacheKey, result);
    }
    return result;
  }
  const baseWeight = resolution.isProxy ? config.proxyWeightMissing : config.exactWeight;
  const neighborWeight = Math.max(0, 1 - baseWeight);
  const neighbors =
    neighborWeight > 0 && Array.isArray(surnames)
      ? findNearestSurnames(surnames, matchEntry, config, resolution.dataEntry)
      : [];
  if (!neighbors.length) {
    const result = { resolution, weightedEntries: [{ entry: matchEntry, weight: 1 }], config };
    if (cacheEnabled) {
      setCachedMatchContext(cache, cacheKey, result);
    }
    return result;
  }
  const similaritySum = neighbors.reduce((sum, item) => sum + item.similarity, 0);
  const weightedEntries = [{ entry: matchEntry, weight: baseWeight }];
  if (similaritySum > 0) {
    neighbors.forEach((item) => {
      weightedEntries.push({
        entry: item.entry,
        weight: neighborWeight * (item.similarity / similaritySum)
      });
    });
  }
  let totalWeight = weightedEntries.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) {
    const result = { resolution, weightedEntries: [{ entry: matchEntry, weight: 1 }], config };
    if (cacheEnabled) {
      setCachedMatchContext(cache, cacheKey, result);
    }
    return result;
  }
  if (Math.abs(totalWeight - 1) > 1e-6) {
    weightedEntries.forEach((item) => {
      item.weight /= totalWeight;
    });
    totalWeight = 1;
  }
  const result = { resolution, weightedEntries, config };
  if (cacheEnabled) {
    setCachedMatchContext(cache, cacheKey, result);
  }
  return result;
}

export function computeWeightedMatchScore(entry, matchContext, weights, matchingModel) {
  if (!entry || !matchingModel) return null;
  const weightedEntries = matchContext?.weightedEntries || [];
  if (!weightedEntries.length) return null;
  let weightedSum = 0;
  let totalWeight = 0;
  weightedEntries.forEach((item) => {
    if (!item?.entry || !Number.isFinite(item.weight) || item.weight <= 0) return;
    const result = computeModelPairScore(entry, item.entry, weights, matchingModel);
    const score = result?.normalized;
    if (!Number.isFinite(score)) return;
    weightedSum += score * item.weight;
    totalWeight += item.weight;
  });
  if (!totalWeight) return null;
  return weightedSum / totalWeight;
}

export function annotateMatches(entries, matchContext, defaultMatchWeights, matchingModel) {
  const dataEntry = matchContext?.resolution?.dataEntry || null;
  const surnameCount = dataEntry ? Number(dataEntry.popularity) || 0 : 0;
  entries.forEach((entry) => {
    const score = computeWeightedMatchScore(entry, matchContext, defaultMatchWeights, matchingModel);
    entry._match = Number.isFinite(score) ? score : null;
    if (dataEntry && surnameCount && entry.populationShare) {
      const comboValue = surnameCount * entry.populationShare;
      entry._comboEstimate = comboValue >= 0.5 ? comboValue : null;
    } else {
      entry._comboEstimate = null;
    }
  });
}

function findNearestSurnames(surnames, targetEntry, config, excludeEntry) {
  const k = config.neighborCount || 0;
  if (!k || !targetEntry?.metrics) return [];
  const best = [];
  const seen = new Set();
  const targetName = targetEntry?.name || null;
  const excludeName = excludeEntry?.name || null;
  const targetLength = Number(targetEntry.metrics?.length);
  const hasLength = Number.isFinite(targetLength);
  const lengthWindow = Number.isFinite(config.lengthWindow) ? config.lengthWindow : 0;

  const consider = (entry) => {
    if (!entry?.metrics) return;
    if (entry === targetEntry || entry === excludeEntry) return;
    if (targetName && entry.name === targetName) return;
    if (excludeName && entry.name === excludeName) return;
    if (seen.has(entry)) return;
    seen.add(entry);
    const distance = computeMetricDistance(targetEntry, entry, config);
    if (!Number.isFinite(distance)) return;
    const similarity = distanceToSimilarity(distance, config);
    if (!Number.isFinite(similarity) || similarity <= 0) return;
    insertBest(best, { entry, distance, similarity }, k);
  };

  surnames.forEach((entry) => {
    if (!entry?.metrics || entry === targetEntry || entry === excludeEntry) return;
    if (hasLength && Number.isFinite(entry.metrics?.length) && lengthWindow > 0) {
      if (Math.abs(entry.metrics.length - targetLength) > lengthWindow) return;
    }
    consider(entry);
  });

  if (best.length < k) {
    surnames.forEach((entry) => {
      if (!entry?.metrics || entry === targetEntry || entry === excludeEntry) return;
      consider(entry);
    });
  }

  return best;
}

function insertBest(best, item, k) {
  if (best.length < k) {
    best.push(item);
    best.sort((a, b) => a.distance - b.distance);
    return;
  }
  if (item.distance >= best[best.length - 1].distance) return;
  best.pop();
  best.push(item);
  best.sort((a, b) => a.distance - b.distance);
}

function computeMetricDistance(a, b, config) {
  const metricsA = a?.metrics;
  const metricsB = b?.metrics;
  if (!metricsA || !metricsB) return Infinity;
  const weights = config.metricWeights || {};
  const lengthScale = Number.isFinite(config.lengthScale) ? config.lengthScale : 1;
  const syllableScale = Number.isFinite(config.syllableScale) ? config.syllableScale : 1;
  const lengthA = normalizeScaled(metricsA.length, lengthScale);
  const lengthB = normalizeScaled(metricsB.length, lengthScale);
  const syllablesA = normalizeScaled(metricsA.syllables, syllableScale);
  const syllablesB = normalizeScaled(metricsB.syllables, syllableScale);
  const parts = [
    diffWeighted(metricsA.front_ratio, metricsB.front_ratio, weights.front_ratio),
    diffWeighted(metricsA.back_ratio, metricsB.back_ratio, weights.back_ratio),
    diffWeighted(metricsA.open_ratio, metricsB.open_ratio, weights.open_ratio),
    diffWeighted(metricsA.close_ratio, metricsB.close_ratio, weights.close_ratio),
    diffWeighted(metricsA.soft_ratio, metricsB.soft_ratio, weights.soft_ratio),
    diffWeighted(metricsA.valence, metricsB.valence, weights.valence),
    diffWeighted(lengthA, lengthB, weights.length),
    diffWeighted(syllablesA, syllablesB, weights.syllables)
  ];
  const { sum, weightSum } = parts.reduce(
    (acc, item) => {
      acc.sum += item.value;
      acc.weightSum += item.weight;
      return acc;
    },
    { sum: 0, weightSum: 0 }
  );
  const metricDistance = weightSum ? sum / weightSum : sum;
  const editDistance = weightedEditDistance(a, b, config);
  const metricWeight = Number.isFinite(config.metricDistanceWeight)
    ? config.metricDistanceWeight
    : 0.5;
  const editWeight = Number.isFinite(config.editDistanceWeight)
    ? config.editDistanceWeight
    : 0.5;
  const totalWeight = metricWeight + editWeight;
  if (!totalWeight) return metricDistance;
  return (metricDistance * metricWeight + editDistance * editWeight) / totalWeight;
}

function normalizeScaled(value, scale) {
  if (!Number.isFinite(value)) return 0;
  if (!Number.isFinite(scale) || scale <= 0) return value;
  return value / scale;
}

function diffWeighted(a, b, weight = 1) {
  const av = Number.isFinite(a) ? a : 0;
  const bv = Number.isFinite(b) ? b : 0;
  const w = Number.isFinite(weight) ? weight : 1;
  return { value: Math.abs(av - bv) * w, weight: w };
}

function distanceToSimilarity(distance, config) {
  const eps = Number.isFinite(config.distanceEpsilon) ? config.distanceEpsilon : 1e-3;
  const power = Number.isFinite(config.distancePower) ? config.distancePower : 1;
  return 1 / Math.pow(distance + eps, power);
}

function weightedEditDistance(entryA, entryB, config) {
  const lettersA = normalizeSurnameLetters(entryA);
  const lettersB = normalizeSurnameLetters(entryB);
  const lenA = lettersA.length;
  const lenB = lettersB.length;
  if (!lenA) return lenB ? 1 : 0;
  if (!lenB) return 1;
  const insertCost = Number.isFinite(config.editInsertCost) ? config.editInsertCost : 1;
  const deleteCost = Number.isFinite(config.editDeleteCost) ? config.editDeleteCost : 1;
  const prev = new Array(lenB + 1);
  const curr = new Array(lenB + 1);
  for (let j = 0; j <= lenB; j += 1) {
    prev[j] = j * insertCost;
  }
  for (let i = 1; i <= lenA; i += 1) {
    curr[0] = i * deleteCost;
    const aChar = lettersA[i - 1];
    for (let j = 1; j <= lenB; j += 1) {
      const bChar = lettersB[j - 1];
      const subCost = substitutionCost(aChar, bChar, config);
      curr[j] = Math.min(
        prev[j] + deleteCost,
        curr[j - 1] + insertCost,
        prev[j - 1] + subCost
      );
    }
    for (let j = 0; j <= lenB; j += 1) {
      prev[j] = curr[j];
    }
  }
  const raw = prev[lenB];
  const normalizer = Math.max(lenA, lenB) || 1;
  return raw / normalizer;
}

function normalizeSurnameLetters(entry) {
  const value = typeof entry === 'string' ? entry : entry?.name || entry?.display || '';
  if (!value) return [];
  const tokens = tokenizeLetters(value);
  if (!tokens.length) return [];
  return tokens.reduce((acc, token) => {
    acc.push(...token);
    return acc;
  }, []);
}

function substitutionCost(a, b, config) {
  if (a === b) return 0;
  const aIsVowel = isVowel(a);
  const bIsVowel = isVowel(b);
  if (aIsVowel && bIsVowel) {
    const aOpen = vowelOpennessGroup(a);
    const bOpen = vowelOpennessGroup(b);
    if (aOpen && bOpen && aOpen === bOpen) {
      return config.editVowelSameOpennessCost ?? 0.35;
    }
    const aLoc = vowelLocationGroup(a);
    const bLoc = vowelLocationGroup(b);
    if (aLoc && bLoc && aLoc === bLoc) {
      return config.editVowelSameLocationCost ?? 0.45;
    }
    return config.editVowelOtherCost ?? 0.7;
  }
  if (!aIsVowel && !bIsVowel) {
    const aGroup = consonantGroup(a);
    const bGroup = consonantGroup(b);
    if (aGroup && bGroup && aGroup === bGroup) {
      return config.editConsonantSameGroupCost ?? 0.45;
    }
    return config.editConsonantOtherCost ?? 0.85;
  }
  return config.editVowelConsonantCost ?? 1.2;
}

function vowelLocationGroup(letter) {
  if (FRONT_VOWELS.has(letter)) return 'front';
  if (BACK_VOWELS.has(letter)) return 'back';
  if (NEUTRAL_VOWELS.has(letter)) return 'neutral';
  return '';
}

function vowelOpennessGroup(letter) {
  if (OPEN_VOWELS.has(letter)) return 'open';
  if (MID_VOWELS.has(letter)) return 'mid';
  if (CLOSE_VOWELS.has(letter)) return 'close';
  return '';
}

function consonantGroup(letter) {
  if (SOFT_CONSONANTS.has(letter)) return 'soft';
  if (HARD_CONSONANTS.has(letter)) return 'hard';
  return 'other';
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

export function buildSurnameProxyEntry(value = '') {
  const trimmed = (value || '').trim();
  if (!trimmed) return null;
  const tokens = tokenizeLetters(trimmed);
  if (!tokens.length) return null;
  const { metrics, rhythmSequence } = computeLetterMetrics(tokens);
  if (!metrics) return null;
  const name = tokens.reduce((acc, token) => acc + token.join(''), '');
  return {
    name,
    display: trimmed,
    metrics,
    rhythm_sequence: rhythmSequence
  };
}

function tokenizeLetters(value) {
  const tokens = [];
  let current = [];
  Array.from(value || '').forEach((char) => {
    const normalized = normalizeLatinLetter(char);
    if (!normalized) {
      if (current.length) {
        tokens.push(current);
        current = [];
      }
      return;
    }
    if (!isSupportedLetter(normalized)) {
      if (current.length) {
        tokens.push(current);
        current = [];
      }
      return;
    }
    current.push(normalized);
  });
  if (current.length) {
    tokens.push(current);
  }
  return tokens;
}

function normalizeLatinLetter(char) {
  if (!char) return '';
  const lower = String(char).toLowerCase();
  if (PRESERVE_LETTERS.has(lower)) return lower;
  if (SPECIAL_LETTER_MAP[lower]) return SPECIAL_LETTER_MAP[lower];
  return lower.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function isSupportedLetter(letter) {
  return /^[a-z]$/.test(letter) || PRESERVE_LETTERS.has(letter);
}

function isVowel(letter) {
  return VOWELS.has(letter);
}

function ratio(num, den, fallback = 0) {
  if (!den) return fallback;
  return num / den;
}

function roundMetric(value, digits = 4) {
  if (!Number.isFinite(value)) return 0;
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

function countVowelGroups(letters) {
  let groups = 0;
  let inVowel = false;
  letters.forEach((letter) => {
    if (isVowel(letter)) {
      if (!inVowel) groups += 1;
      inVowel = true;
    } else {
      inVowel = false;
    }
  });
  return groups;
}

function buildRhythmSequence(letters) {
  const pattern = [];
  let i = 0;
  while (i < letters.length) {
    while (i < letters.length && !isVowel(letters[i])) i += 1;
    if (i >= letters.length) break;
    const vowelStart = i;
    while (i < letters.length && isVowel(letters[i])) i += 1;
    const vowelCount = i - vowelStart;
    let consonantCount = 0;
    while (i < letters.length && !isVowel(letters[i])) {
      consonantCount += 1;
      i += 1;
    }
    const isLast = i >= letters.length;
    const heavy = vowelCount >= 2 || consonantCount >= 2 || (isLast && consonantCount >= 1);
    pattern.push(heavy ? 'H' : 'L');
  }
  return pattern.join('');
}

function computeLetterMetrics(tokens) {
  let letterCount = 0;
  let vowelCount = 0;
  let frontCount = 0;
  let neutralCount = 0;
  let backCount = 0;
  let closeCount = 0;
  let midCount = 0;
  let openCount = 0;
  let softCount = 0;
  let hardCount = 0;
  let valenceSum = 0;
  let valenceCount = 0;
  let syllableCount = 0;
  const rhythmChunks = [];

  tokens.forEach((letters) => {
    if (!letters.length) return;
    syllableCount += countVowelGroups(letters);
    rhythmChunks.push(buildRhythmSequence(letters));
    letters.forEach((letter) => {
      letterCount += 1;
      if (isVowel(letter)) {
        vowelCount += 1;
        if (FRONT_VOWELS.has(letter)) frontCount += 1;
        else if (NEUTRAL_VOWELS.has(letter)) neutralCount += 1;
        else if (BACK_VOWELS.has(letter)) backCount += 1;
        if (CLOSE_VOWELS.has(letter)) closeCount += 1;
        else if (MID_VOWELS.has(letter)) midCount += 1;
        else if (OPEN_VOWELS.has(letter)) openCount += 1;
      } else if (SOFT_CONSONANTS.has(letter)) {
        softCount += 1;
      } else if (HARD_CONSONANTS.has(letter)) {
        hardCount += 1;
      }
      const valence = VALENCE_MAP[letter];
      if (valence != null) {
        valenceSum += valence;
        valenceCount += 1;
      }
    });
  });

  if (!letterCount) return { metrics: null, rhythmSequence: '' };
  const vowelTotal = vowelCount || 0;
  const openTotal = openCount + midCount + closeCount;
  const consonantTotal = softCount + hardCount;
  const softRatio = consonantTotal ? softCount / consonantTotal : 0;

  return {
    metrics: {
      length: letterCount,
      syllables: syllableCount,
      valence: roundMetric(ratio(valenceSum, valenceCount, 0)),
      front_ratio: roundMetric(ratio(frontCount, vowelTotal, 0)),
      neutral_ratio: roundMetric(ratio(neutralCount, vowelTotal, 0)),
      back_ratio: roundMetric(ratio(backCount, vowelTotal, 0)),
      close_ratio: roundMetric(ratio(closeCount, openTotal, 0)),
      mid_ratio: roundMetric(ratio(midCount, openTotal, 0)),
      open_ratio: roundMetric(ratio(openCount, openTotal, 0)),
      soft_ratio: roundMetric(softRatio)
    },
    rhythmSequence: rhythmChunks.join('')
  };
}
