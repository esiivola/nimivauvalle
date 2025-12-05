const AE_BASE = 'data/aesthetics/model.json';

const FRONT_VOWELS = new Set('yüöøäæ');
const NEUTRAL_VOWELS = new Set('èéêëeiíï');
const BACK_VOWELS = new Set('ɑaoòóõuú');
const CLOSE_VOWELS = new Set('iíïyüuú');
const MID_VOWELS = new Set('èéêëeöøoòóõ');
const OPEN_VOWELS = new Set('äæɑa');
const SOFT_CONS = new Set('mnlrjvʋŋɱ');
const HARD_CONS = new Set('ptkbdgsfhʃçɦx');
const VALENCE_MAP = {
  u: -1,
  o: -0.9,
  m: -0.8,
  ö: -0.75,
  a: -0.7,
  ä: -0.6,
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
  y: 0.15
};
const SYLLABLE_SPLIT_RE = /[+-]+/;
const LONG_VOWEL_MARKERS = new Set(['ː', 'ˑ']);
const SILENCE_MARKERS = new Set(["ˈ", "ˌ", "'", '', '-', '+']);

let cachedModel = null;

function clamp(val, min = -1, max = 1) {
  return Math.max(min, Math.min(max, val));
}

function mapZeroOneToSigned(value) {
  if (!Number.isFinite(value)) return 0;
  return clamp(value * 2 - 1, -1, 1);
}

const STABILITY_FACTOR = 0.7;

function stabilizeScore(score, factor = STABILITY_FACTOR) {
  if (!Number.isFinite(score)) return score;
  return 0.5 + (score - 0.5) * factor;
}

export async function loadMatchingModel(path = AE_BASE) {
  if (cachedModel) return cachedModel;
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to load matching model from ${path}`);
  cachedModel = await res.json();
  return cachedModel;
}

export function splitSyllables(value = '') {
  if (!value) return [];
  return value.split(SYLLABLE_SPLIT_RE).filter(Boolean);
}

function ratio(num, den, fallback = 0) {
  if (!den) return fallback;
  return num / den;
}

function syllableProfile(syllable) {
  const text = (syllable || '').trim();
  if (!text) {
    return {
      front_ratio: 0,
      neutral_ratio: 0,
      back_ratio: 0,
      close_ratio: 0,
      mid_ratio: 0,
      open_ratio: 0,
      soft_ratio: 0.5,
      valence: 0
    };
  }
  const vowels = Array.from(text).filter((c) => FRONT_VOWELS.has(c) || NEUTRAL_VOWELS.has(c) || BACK_VOWELS.has(c));
  const openSet = Array.from(text).filter((c) => CLOSE_VOWELS.has(c) || MID_VOWELS.has(c) || OPEN_VOWELS.has(c));
  const cons = Array.from(text).filter((c) => SOFT_CONS.has(c) || HARD_CONS.has(c));
  const vals = Array.from(text)
    .map((c) => VALENCE_MAP[c])
    .filter((v) => v !== undefined);
  return {
    front_ratio: ratio(vowels.filter((c) => FRONT_VOWELS.has(c)).length, vowels.length),
    neutral_ratio: ratio(vowels.filter((c) => NEUTRAL_VOWELS.has(c)).length, vowels.length),
    back_ratio: ratio(vowels.filter((c) => BACK_VOWELS.has(c)).length, vowels.length),
    close_ratio: ratio(openSet.filter((c) => CLOSE_VOWELS.has(c)).length, openSet.length),
    mid_ratio: ratio(openSet.filter((c) => MID_VOWELS.has(c)).length, openSet.length),
    open_ratio: ratio(openSet.filter((c) => OPEN_VOWELS.has(c)).length, openSet.length),
    soft_ratio: ratio(cons.filter((c) => SOFT_CONS.has(c)).length, cons.length, 0.5),
    valence: ratio(vals.reduce((a, b) => a + b, 0), vals.length)
  };
}

function syllableIsHeavy(syllable) {
  const text = (syllable || '').toLowerCase();
  if (!text) return false;
  if (Array.from(LONG_VOWEL_MARKERS).some((m) => text.includes(m))) return true;
  const vowelPositions = [];
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (FRONT_VOWELS.has(ch) || NEUTRAL_VOWELS.has(ch) || BACK_VOWELS.has(ch)) {
      vowelPositions.push(i);
    }
  }
  if (vowelPositions.length >= 2) return true;
  if (!vowelPositions.length) return false;
  const lastIdx = vowelPositions[vowelPositions.length - 1];
  for (let i = lastIdx + 1; i < text.length; i += 1) {
    const ch = text[i];
    if (LONG_VOWEL_MARKERS.has(ch) || SILENCE_MARKERS.has(ch) || ch === '-') continue;
    if (!FRONT_VOWELS.has(ch) && !NEUTRAL_VOWELS.has(ch) && !BACK_VOWELS.has(ch)) return true;
  }
  return false;
}

function syllableWeightSequence(ipa) {
  const syllables = splitSyllables(ipa);
  if (!syllables.length) return [];
  return syllables.map((s) => (syllableIsHeavy(s) ? 'H' : 'L'));
}

function rhythmBucket(rhythmSequence = '') {
  if (!rhythmSequence) return '';
  return rhythmSequence.split('').map((c) => (c.toUpperCase() === 'H' ? 'R' : 'K')).join('');
}

function truncatedRhythm(entry) {
  const raw = entry?.rhythm_pattern || entry?.rhythm_sequence || '';
  const mapped = (raw && raw.toLowerCase() === 'nan' ? '' : raw)
    .split('')
    .map((c) => {
      const upper = (c || '').toUpperCase();
      if (upper === 'H') return 'R';
      if (upper === 'L') return 'K';
      if (upper === 'R' || upper === 'K') return upper;
      return 'K';
    })
    .join('');
  if (!mapped) return '';
  return mapped.slice(0, 3);
}

function levenshteinDistance(a = '', b = '') {
  const lenA = a.length;
  const lenB = b.length;
  if (!lenA) return lenB;
  if (!lenB) return lenA;
  const prev = new Array(lenB + 1);
  const curr = new Array(lenB + 1);
  for (let j = 0; j <= lenB; j += 1) prev[j] = j;
  for (let i = 1; i <= lenA; i += 1) {
    curr[0] = i;
    for (let j = 1; j <= lenB; j += 1) {
      if (a[i - 1] === b[j - 1]) curr[j] = prev[j - 1];
      else curr[j] = Math.min(prev[j - 1], prev[j], curr[j - 1]) + 1;
    }
    for (let j = 0; j <= lenB; j += 1) prev[j] = curr[j];
  }
  return prev[lenB];
}

function rhythmSimilarity(codeA, codeB) {
  if (!codeA || !codeB) return 0;
  const distance = levenshteinDistance(codeA, codeB);
  const maxLen = Math.max(codeA.length, codeB.length) || 1;
  const similarity = 1 - distance / maxLen;
  return clamp(similarity, 0, 1);
}

function lengthBucket(n) {
  const val = Number.parseInt(n, 10);
  if (!Number.isFinite(val)) return 'unk';
  if (val <= 4) return '3-4';
  if (val <= 6) return '5-6';
  if (val <= 8) return '7-8';
  if (val <= 10) return '9-10';
  return '11+';
}

function syllableBucket(n) {
  const val = Number.parseInt(n, 10);
  if (!Number.isFinite(val)) return 'unk';
  if (val <= 1) return '1';
  if (val === 2) return '2';
  if (val === 3) return '3';
  if (val === 4) return '4';
  if (val === 5) return '5';
  return '6+';
}

function ratioBucket(value, steps = [0, 0.25, 0.5, 0.75, 1.01]) {
  const v = Number.isFinite(value) ? value : 0;
  for (let i = 0; i < steps.length - 1; i += 1) {
    if (v >= steps[i] && v < steps[i + 1]) {
      return `${steps[i].toFixed(2)}-${steps[i + 1].toFixed(2)}`;
    }
  }
  return '1.0';
}

function dominanceLabel(front, back, margin = 0.1) {
  if (front == null || back == null) return 'mixed';
  if (front > back + margin) return 'front';
  if (back > front + margin) return 'back';
  return 'mixed';
}

function valenceBucket(value) {
  const v = Number.isFinite(value) ? value : 0;
  if (v < -0.4) return 'very_warm';
  if (v < -0.2) return 'warm';
  if (v < 0.2) return 'neutral';
  if (v < 0.4) return 'bright';
  return 'very_bright';
}

function bucketLocation(front, back) {
  const f = Number.isFinite(front) ? front : 0;
  const b = Number.isFinite(back) ? back : 0;
  if (f < 0.05 && b < 0.05) return 'neutral_only';
  if (f >= 0.7 && b <= 0.2) return 'front_dominant';
  if (b >= 0.7 && f <= 0.2) return 'back_dominant';
  if (f >= 0.5 && b <= 0.3) return 'front_neutral';
  if (b >= 0.5 && f <= 0.3) return 'back_neutral';
  return 'mixed';
}

function bucketOpeness(openRatio, closeRatio) {
  const o = Number.isFinite(openRatio) ? openRatio : 0;
  const c = Number.isFinite(closeRatio) ? closeRatio : 0;
  if (o < 0.05 && c < 0.05) return 'neutral_only';
  if (o >= 0.6 && c <= 0.2) return 'open_dominant';
  if (c >= 0.6 && o <= 0.2) return 'close_dominant';
  if (o >= 0.45 && c <= 0.35) return 'open_mid';
  if (c >= 0.45 && o <= 0.35) return 'close_mid';
  return 'mixed';
}

function bucketSoftness(softRatio) {
  const s = Number.isFinite(softRatio) ? softRatio : 0;
  if (s >= 0.8) return 'soft_only';
  if (s >= 0.6) return 'softish';
  if (s <= 0.2) return 'hard_only';
  if (s <= 0.4) return 'hardish';
  return 'balanced';
}

function edgeProfiles(entry) {
  const ipa = entry?.ipa?.syllables || '';
  const syllables = splitSyllables(ipa);
  if (!syllables.length) {
    const empty = syllableProfile('');
    return { tail: empty, head: empty };
  }
  return { tail: syllableProfile(syllables[syllables.length - 1]), head: syllableProfile(syllables[0]) };
}

function getStartGroup(entry) {
  return entry?.transitions?.start || null;
}

function getEndGroup(entry) {
  return entry?.transitions?.end || null;
}

function probToScore(prob, base) {
  const eps = 1e-9;
  const ratioVal = (prob + eps) / (base + eps);
  const score = Math.tanh(Math.log(ratioVal));
  return Math.max(-1, Math.min(1, score));
}

function lookupScore(component, obs, cond, model) {
  const compTable = model?.tables?.[component] || {};
  const row = compTable[cond] || compTable._default || {};
  const values = Object.values(row || {});
  if (!values.length) return 0.5;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const prob = row[obs] ?? min;
  if (max === min) return 0.5;
  return clamp((prob - min) / (max - min), 0, 1);
}

export function computeBuckets(first, last) {
  const firstEdges = edgeProfiles(first);
  const lastEdges = edgeProfiles(last);
  const buckets = {
    vowel_location_obs: bucketLocation(first.metrics?.front_ratio, first.metrics?.back_ratio),
    vowel_location_cond: bucketLocation(last.metrics?.front_ratio, last.metrics?.back_ratio),
    vowel_openess_obs: bucketOpeness(first.metrics?.open_ratio, first.metrics?.close_ratio),
    vowel_openess_cond: bucketOpeness(last.metrics?.open_ratio, last.metrics?.close_ratio),
    softness_obs: bucketSoftness(first.metrics?.soft_ratio),
    softness_cond: bucketSoftness(last.metrics?.soft_ratio),
    tone_obs: valenceBucket(first.metrics?.valence),
    tone_cond: valenceBucket(last.metrics?.valence),
    rhythm_obs: truncatedRhythm(first),
    rhythm_cond: truncatedRhythm(last),
    length_obs: lengthBucket(first.metrics?.length),
    length_cond: lengthBucket(last.metrics?.length),
    syllables_obs: syllableBucket(first.metrics?.syllables),
    syllables_cond: syllableBucket(last.metrics?.syllables),
    head_transition_obs: getStartGroup(first),
    head_transition_cond: getStartGroup(last),
    end_start_transition_obs: getEndGroup(first),
    end_start_transition_cond: getStartGroup(last),
    edge_vowel_location_obs: bucketLocation(firstEdges.tail.front_ratio, firstEdges.tail.back_ratio),
    edge_vowel_location_cond: bucketLocation(lastEdges.head.front_ratio, lastEdges.head.back_ratio),
    edge_vowel_openess_obs: bucketOpeness(firstEdges.tail.open_ratio, firstEdges.tail.close_ratio),
    edge_vowel_openess_cond: bucketOpeness(lastEdges.head.open_ratio, lastEdges.head.close_ratio),
    edge_softness_obs: bucketSoftness(firstEdges.tail.soft_ratio),
    edge_softness_cond: bucketSoftness(lastEdges.head.soft_ratio),
    edge_tone_obs: valenceBucket(firstEdges.tail.valence),
    edge_tone_cond: valenceBucket(lastEdges.head.valence)
  };
  return buckets;
}

const EDGE_MAP = {
  vowel_location: 'edge_vowel_location',
  vowel_openess: 'edge_vowel_openess',
  softness: 'edge_softness',
  tone: 'edge_tone'
};

export function computeComponentScores(first, last, model) {
  if (!model) return {};
  const buckets = computeBuckets(first, last);
  const scores = {};
  Object.keys(model.tables || {}).forEach((component) => {
    const obs = buckets[`${component}_obs`] ?? null;
    const cond = buckets[`${component}_cond`] ?? null;
    if (!obs || !cond) {
      scores[component] = 0;
      return;
    }
    scores[component] = lookupScore(component, obs, cond, model);
  });
  Object.keys(scores).forEach((key) => {
    const val = scores[key];
    if (Number.isFinite(val) && val >= 0 && val <= 1) {
      scores[key] = stabilizeScore(val);
    }
  });
  // Override rhythm with sequence similarity (R/K patterns)
  const rhythmA = buckets.rhythm_obs || '';
  const rhythmB = buckets.rhythm_cond || '';
  if (rhythmA || rhythmB) {
    const sim = rhythmSimilarity(rhythmA, rhythmB);
    scores.rhythm = mapZeroOneToSigned(sim);
  }
  // Combine edge + whole where applicable
  Object.entries(EDGE_MAP).forEach(([baseKey, edgeKey]) => {
    if (scores[baseKey] == null || scores[edgeKey] == null) return;
    const combined = (2 * scores[baseKey] + scores[edgeKey]) / 3;
    scores[baseKey] = combined;
    delete scores[edgeKey];
  });
  // Heuristics for alliteration / oddness are added later by callers
  return scores;
}

export function computePairScore(first, last, weights, model) {
  if (!first || !last || !model) return null;
  const scores = computeComponentScores(first, last, model);
  const components = { ...scores };
  // Blend length and syllables to reduce double-counting; syllables dominate.
  if (components.length != null && components.syllables != null) {
    const combined = 0.7 * components.syllables + 0.3 * components.length;
    components.length = combined;
    components.syllables = combined;
  }
  // Alliteration heuristic (keep compatibility)
  if (weights?.alliteration !== undefined) {
    const firstSimple = first.ipa?.simple || '';
    const lastSimple = last.ipa?.simple || '';
    const allitScore = firstSimple && lastSimple && firstSimple[0] === lastSimple[0] ? 1 : -1;
    components.alliteration = allitScore;
  }
  if (weights?.oddness !== undefined) {
    const totalOwners = Number(first.popularity?.total ?? first.popularity ?? 0);
    let oddnessScore = 0;
    const minThreshold = 200;
    const maxThreshold = 1000;
    if (Number.isFinite(totalOwners)) {
      if (totalOwners <= minThreshold) oddnessScore = 1;
      else if (totalOwners < maxThreshold) {
        oddnessScore = (maxThreshold - totalOwners) / (maxThreshold - minThreshold);
      }
    }
    components.oddness = Math.max(-1, Math.min(1, oddnessScore * 2 - 1));
  }
  let weightedSum = 0;
  Object.entries(weights || {}).forEach(([key, value]) => {
    const compScore = components[key];
    if (compScore == null) return;
    const signed = key === 'alliteration' || key === 'oddness' ? compScore : mapZeroOneToSigned(compScore);
    weightedSum += (value || 0) * signed;
  });
  const clamped = Math.max(-1, Math.min(1, weightedSum));
  const normalized = (clamped + 1) / 2;
  return { components, weightedSum, normalized };
}

export function selectTopEntries(entries, topN, popularityGetter) {
  const sorted = [...entries].sort((a, b) => (popularityGetter(b) || 0) - (popularityGetter(a) || 0));
  return sorted.slice(0, topN);
}
