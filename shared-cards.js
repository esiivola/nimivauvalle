// Shared card rendering between main page and favorites.

export function createCardShell(entry, options) {
  const {
    t,
    surnameEntry = null,
    filtered = false,
    isFavorite = null,
    toggleFavorite = null,
    onOpen = null,
    onFavoriteButton = null
  } = options || {};

  const card = document.createElement('details');
  card.className = 'name-card';
  if (filtered) {
    card.classList.add('filtered-out');
  }

  const summary = document.createElement('summary');
  const titleSpan = document.createElement('span');
  titleSpan.className = 'name-title';
  titleSpan.textContent = entry.display || entry.name || '';
  summary.appendChild(titleSpan);

  const tagsWrap = document.createElement('div');
  tagsWrap.className = 'summary-tags';

  const popularitySuffix = 'hlöä';
  if (entry.popularity?.total != null) {
    tagsWrap.appendChild(
      createSummaryTag(`${entry.popularity.total.toLocaleString('fi-FI')} ${popularitySuffix}`, 'tag-pop')
    );
  } else {
    tagsWrap.appendChild(createSummaryTag('', 'tag-pop'));
  }

  if (entry.topRank && entry.topRank.rank && entry.topRank.rank <= 500) {
    const rankText = `#${entry.topRank.rank} suosituin nimi`;
    const rankClass = entry.topRank.gender === 'female' ? 'tag-rank-female' : 'tag-rank-male';
    tagsWrap.appendChild(createSummaryTag(rankText, rankClass));
  }

  const matchText =
    entry._match !== null && entry._match !== undefined && t?.matchLabel
      ? `${t.matchLabel}: ${(entry._match * 100).toFixed(1)}%`
      : '';
  tagsWrap.appendChild(createSummaryTag(matchText, 'tag-match'));

  let comboText = '';
  if (entry._comboEstimate && surnameEntry && t?.comboTag) {
    comboText = t.comboTag(entry._comboEstimate.toLocaleString('fi-FI'));
  }
  tagsWrap.appendChild(createSummaryTag(comboText, 'tag-combo'));

  if (filtered && Array.isArray(entry._filteredReasons)) {
    entry._filteredReasons.slice(0, 3).forEach((reason) => {
      tagsWrap.appendChild(createSummaryTag(reason.text || reason, 'reason'));
    });
  }

  summary.appendChild(tagsWrap);

  if (typeof toggleFavorite === 'function') {
    const favBtn = document.createElement('button');
    favBtn.type = 'button';
    favBtn.className = 'favorite-btn';
    const setState = () => {
      const fav = typeof isFavorite === 'function' ? isFavorite(entry) : false;
      favBtn.textContent = fav ? '★' : '☆';
      favBtn.classList.toggle('active', fav);
      favBtn.title = fav ? 'Poista suosikeista' : 'Lisää suosikkeihin';
    };
    setState();
    favBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleFavorite(entry);
      setState();
    });
    if (typeof onFavoriteButton === 'function') {
      onFavoriteButton(favBtn);
    }
    summary.appendChild(favBtn);
  }

  card.appendChild(summary);

  const body = document.createElement('div');
  body.className = 'name-card-body';
  card.appendChild(body);

  if (typeof onOpen === 'function') {
    card.addEventListener('toggle', () => {
      if (card.open) {
        onOpen(card, body, entry);
      }
    });
  }

  return card;
}

export function createSummaryTag(text, extraClass) {
  const span = document.createElement('span');
  span.className = `tag ${extraClass || ''}`.trim();
  if (!text) {
    span.classList.add('tag-empty');
    span.innerHTML = '&nbsp;';
  } else {
    span.textContent = text;
  }
  return span;
}
