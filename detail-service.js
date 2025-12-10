const DEFAULT_DETAIL_BASE = 'data/details';

const normalizePath = (path) => {
  if (!path) return path;
  if (/^https?:\/\//i.test(path) || path.startsWith('//')) return path;
  return path.startsWith('/') ? path : `/${path}`;
};

export function createDetailService(schema = {}) {
  const detailBasePath = schema.details?.basePath || DEFAULT_DETAIL_BASE;
  const detailBucketMap = schema.details?.buckets || {};
  const cache = new Map();

  const getDetailPath = (bucket) => {
    if (!bucket) return null;
    if (detailBucketMap[bucket]) {
      return normalizePath(detailBucketMap[bucket]);
    }
    const normalizedBase = normalizePath(detailBasePath).replace(/\/+$/, '');
    return `${normalizedBase}/${bucket}.json`;
  };

  const loadDetailBucket = async (bucket) => {
    if (!bucket) return {};
    if (cache.has(bucket)) {
      return cache.get(bucket);
    }
    const path = getDetailPath(bucket);
    const url =
      typeof path === 'string' && !/^https?:\/\//i.test(path) && !path.startsWith('//')
        ? `${window.location.origin}${path.startsWith('/') ? '' : '/'}${path}`
        : path;
    const promise = (async () => {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to load detail chunk');
      }
      const payload = await response.json();
      return payload.entries || {};
    })().catch((error) => {
      cache.delete(bucket);
      throw error;
    });
    cache.set(bucket, promise);
    return promise;
  };

  const ensureEntryDetails = async (entry) => {
    if (!entry || entry._detailsLoaded) {
      return entry;
    }
    const bucket = entry.detailBucket || (entry.name ? entry.name[0] : 'misc');
    const detailEntries = await loadDetailBucket(bucket);
    const detail = detailEntries?.[entry.name];
    if (detail) {
      Object.assign(entry, detail);
    }
    entry._detailsLoaded = true;
    return entry;
  };

  return {
    ensureEntryDetails,
    getDetailPath,
    loadDetailBucket,
    resetCache: () => cache.clear()
  };
}

export { DEFAULT_DETAIL_BASE };
