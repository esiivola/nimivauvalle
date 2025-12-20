const FILTER_QUERY_KEY = 'nv-filter-query';
const FILTER_QUERY_KEYS = [
  'gender',
  'surname',
  'sort',
  'dir',
  'letters',
  'exclude',
  'len',
  'pop',
  'popf',
  'pf',
  'gf',
  'w'
];

function getStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

const storage = getStorage();

export function hasFilterQuery(params) {
  return FILTER_QUERY_KEYS.some((key) => params.has(key));
}

export function extractFilterQuery(params) {
  const filtered = new URLSearchParams();
  FILTER_QUERY_KEYS.forEach((key) => {
    params.getAll(key).forEach((value) => filtered.append(key, value));
  });
  return filtered.toString();
}

export function readFilterQuery() {
  if (!storage) return '';
  try {
    return storage.getItem(FILTER_QUERY_KEY) || '';
  } catch {
    return '';
  }
}

export function writeFilterQuery(query) {
  if (!storage) return;
  try {
    if (!query) {
      storage.removeItem(FILTER_QUERY_KEY);
    } else {
      storage.setItem(FILTER_QUERY_KEY, query);
    }
  } catch {
    /* ignore storage errors */
  }
}
