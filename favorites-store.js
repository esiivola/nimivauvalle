const DEFAULT_KEY = 'favoriteNames';

export function loadFavorites(key = DEFAULT_KEY) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter(Boolean));
  } catch {
    return new Set();
  }
}

export function saveFavorites(namesSet, key = DEFAULT_KEY) {
  const arr = Array.from(namesSet || []);
  localStorage.setItem(key, JSON.stringify(arr));
}

export function encodeFavorites(names) {
  const raw = (names || []).join('|');
  const base = btoa(unescape(encodeURIComponent(raw)));
  return base.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function decodeFavoritesParam(value) {
  if (!value) return [];
  let base = value.replace(/-/g, '+').replace(/_/g, '/');
  while (base.length % 4) base += '=';
  try {
    const decoded = decodeURIComponent(escape(atob(base)));
    return decoded.split('|').filter(Boolean);
  } catch {
    return [];
  }
}

export { DEFAULT_KEY as FAVORITES_KEY };
