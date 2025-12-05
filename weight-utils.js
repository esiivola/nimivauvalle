import MATCH_WEIGHT_FIELDS from './weight-fields.js';

export const WEIGHT_STORAGE_KEY = 'nv-shared-weights';
const ALLOWED_KEYS = new Set(MATCH_WEIGHT_FIELDS.map((field) => field.key));

export function computeAbsoluteWeightBudget(weights) {
  if (!weights) return 1;
  const entries = Object.entries(weights).filter(([key]) => ALLOWED_KEYS.has(key));
  const total = entries.reduce((sum, [, value]) => sum + Math.abs(Number(value) || 0), 0);
  return total > 0 ? total : 1;
}

export function normalizeWeightMap(weights) {
  if (!weights) return {};
  const allowedEntries = Object.entries(weights).filter(([key]) => ALLOWED_KEYS.has(key));
  if (!allowedEntries.length) return {};
  const budget = computeAbsoluteWeightBudget(weights);
  const normalized = {};
  allowedEntries.forEach(([key, value]) => {
    normalized[key] = (Number(value) || 0) / budget;
  });
  MATCH_WEIGHT_FIELDS.forEach((field) => {
    if (!(field.key in normalized)) {
      normalized[field.key] = 0;
    }
  });
  return normalized;
}

export function serializeWeightOverrides(overrides) {
  if (!overrides || typeof overrides !== 'object') return '';
  return Object.entries(overrides)
    .filter(([key]) => ALLOWED_KEYS.has(key))
    .map(([key, value]) => `${key}:${Number(value).toFixed(4)}`)
    .join(',');
}

export function parseWeightOverrides(value) {
  if (!value) return {};
  const result = {};
  value.split(',').forEach((pair) => {
    const [key, raw] = pair.split(':');
    if (!key || !ALLOWED_KEYS.has(key)) return;
    const num = Number(raw);
    if (!Number.isFinite(num)) return;
    result[key] = num;
  });
  return normalizeWeightMap(result);
}

export function areWeightsEqual(a = {}, b = {}, tolerance = 1e-4) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    const diff = Math.abs((a[key] ?? 0) - (b[key] ?? 0));
    if (diff > tolerance) {
      return false;
    }
  }
  return true;
}

export function weightToPercent(value, budget = 1) {
  const safeBudget = budget || 1;
  return ((value || 0) / safeBudget) * 100;
}

export function percentToWeight(percent, budget = 1) {
  const safeBudget = budget || 1;
  return ((percent || 0) / 100) * safeBudget;
}

export function formatPercentNumber(value) {
  if (!Number.isFinite(value)) return '0';
  return String(Math.round(value));
}

export function readSharedWeights(storage = typeof sessionStorage !== 'undefined' ? sessionStorage : null) {
  if (!storage) return null;
  try {
    const raw = storage.getItem(WEIGHT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = parseWeightOverrides(raw);
    return Object.keys(parsed).length ? parsed : null;
  } catch {
    return null;
  }
}

export function persistSharedWeights(
  weights,
  baseline = null,
  storage = typeof sessionStorage !== 'undefined' ? sessionStorage : null
) {
  if (!storage) return;
  try {
    const normalized = normalizeWeightMap(weights);
    const baselineNormalized = baseline ? normalizeWeightMap(baseline) : null;
    const shouldClear =
      !Object.keys(normalized).length || (baselineNormalized && areWeightsEqual(normalized, baselineNormalized));
    if (shouldClear) {
      storage.removeItem(WEIGHT_STORAGE_KEY);
      return;
    }
    storage.setItem(WEIGHT_STORAGE_KEY, serializeWeightOverrides(normalized));
  } catch {
    /* ignore persistence errors */
  }
}
