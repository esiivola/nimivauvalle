// Pure helpers for parsing and matching the letter/range/group filter inputs.
// No shared state — safe to unit-test in isolation.

export const normalizeGroupKey = (key) => String(key || '').toLowerCase().replace(/\.txt$/, '');

export function parseTriToken(token) {
  const parts = (token || '').split('.');
  if (parts.length <= 1) {
    return { key: token || '', mode: 'include' };
  }
  const mode = parts.pop() || 'include';
  const key = parts.join('.');
  return { key, mode };
}

export function normalizeLetterFilter(value) {
  if (!value) return '';
  return value
    .toLowerCase()
    .replace(/[^a-zåäöæøœšžß\u00c0-\u017f,\s\-\^\$\*]/g, '');
}

export function parseLetterTokens(value) {
  return (value || '')
    .split(/[,\s]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

export function buildCharCounts(str) {
  const counts = new Map();
  for (const ch of str.toLowerCase()) {
    const current = counts.get(ch) || 0;
    counts.set(ch, current + 1);
  }
  return counts;
}

export function tokenSatisfied(nameCounts, token) {
  if (!token) return true;
  const need = buildCharCounts(token);
  for (const [char, required] of need.entries()) {
    if ((nameCounts.get(char) || 0) < required) return false;
  }
  return true;
}

export function isPatternToken(token) {
  return /[\^\*$]/.test(token);
}

export function tokenMatchesPattern(name, token) {
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

export function tokenPasses(name, nameCounts, token) {
  if (isPatternToken(token)) {
    return tokenMatchesPattern(name, token);
  }
  return tokenSatisfied(nameCounts, token);
}

export function normalizeRangeValues(minValue, maxValue, limits) {
  let min = Number(minValue);
  let max = Number(maxValue);
  if (!Number.isFinite(min)) min = limits.min;
  if (!Number.isFinite(max)) max = limits.max;
  min = Math.max(limits.min, Math.min(min, limits.max));
  max = Math.max(limits.min, Math.min(max, limits.max));
  if (min > max) min = max;
  return { min, max };
}
