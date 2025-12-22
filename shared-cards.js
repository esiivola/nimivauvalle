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
  const populationTitle = 'Elossa olevien henkilöiden etunimenä';
  if (entry.popularity?.total != null) {
    tagsWrap.appendChild(
      createSummaryTag(
        `${entry.popularity.total.toLocaleString('fi-FI')} ${popularitySuffix}`,
        'tag-pop',
        populationTitle
      )
    );
  } else {
    tagsWrap.appendChild(createSummaryTag('', 'tag-pop', populationTitle));
  }

  if (entry.topRank && entry.topRank.rank && entry.topRank.rank <= 500) {
    const rankText = `#${entry.topRank.rank} suosituin`;
    const rankClass = entry.topRank.gender === 'female' ? 'tag-rank-female' : 'tag-rank-male';
    const rankGender =
      entry.topRank.gender === 'male'
        ? 'miesten'
        : entry.topRank.gender === 'female'
          ? 'naisten'
          : 'henkilöiden';
    const rankTitle = `Suosio elossa olevien ${rankGender} ensimmäisenä nimenä`;
    tagsWrap.appendChild(createSummaryTag(rankText, rankClass, rankTitle));
  }

  const matchText =
    entry._match !== null && entry._match !== undefined && t?.matchLabel
      ? `${t.matchLabel}: ${(entry._match * 100).toFixed(1)}%`
      : '';
  const matchTitle = 'Tekoälyn arvio etunimen sopivuudesta sukunimelle';
  tagsWrap.appendChild(createSummaryTag(matchText, 'tag-match', matchTitle));

  let comboText = '';
  if (surnameEntry && entry._comboEstimate != null && t?.comboTag) {
    const roundedCombo = Math.round(entry._comboEstimate);
    if (roundedCombo >= 1) {
      comboText = t.comboTag(roundedCombo);
    }
  }
  const comboTitle =
    'Arvio täyskaimojen määrästä etu- ja sukunimien yleisyyden perusteella';
  tagsWrap.appendChild(createSummaryTag(comboText, 'tag-combo', comboTitle));

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
      const label = fav ? 'Poista suosikeista' : 'Lisää suosikkeihin';
      favBtn.title = label;
      favBtn.setAttribute('aria-label', label);
      favBtn.setAttribute('aria-pressed', fav ? 'true' : 'false');
    };
    setState();
    favBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleFavorite(entry);
      setState();
      favBtn.blur();
      card.querySelector('summary')?.blur();
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

let activeTagHint = null;
let tagHintDocListenerAttached = false;

function closeTagHint(tagEl) {
  if (!tagEl) return;
  const bubble = tagEl.querySelector('.tag-hint-bubble');
  if (bubble) bubble.remove();
  tagEl.classList.remove('tag-hint-open');
  if (activeTagHint === tagEl) {
    activeTagHint = null;
  }
}

function ensureTagHintDocListener() {
  if (tagHintDocListenerAttached) return;
  document.addEventListener(
    'click',
    (event) => {
      if (!activeTagHint) return;
      if (activeTagHint.contains(event.target)) return;
      closeTagHint(activeTagHint);
    },
    true
  );
  tagHintDocListenerAttached = true;
}

function openTagHintBubble(tagEl) {
  if (!tagEl?.dataset?.hint) return;
  if (activeTagHint && activeTagHint !== tagEl) {
    closeTagHint(activeTagHint);
  }
  const bubble = document.createElement('div');
  bubble.className = 'tag-hint-bubble';
  const text = document.createElement('span');
  text.className = 'tag-hint-text';
  text.textContent = tagEl.dataset.hint;
  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'tag-hint-close';
  closeBtn.setAttribute('aria-label', 'Sulje');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    closeTagHint(tagEl);
  });
  bubble.appendChild(text);
  bubble.appendChild(closeBtn);
  tagEl.appendChild(bubble);
  tagEl.classList.add('tag-hint-open');
  activeTagHint = tagEl;
}

function attachTagHintBehavior(tagEl) {
  if (!tagEl?.dataset?.hint) return;
  ensureTagHintDocListener();
  tagEl.classList.add('tag-hintable');
  tagEl.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    tagEl.closest('summary')?.blur();
    const isOpen = tagEl.classList.contains('tag-hint-open');
    if (isOpen) {
      closeTagHint(tagEl);
    } else {
      openTagHintBubble(tagEl);
    }
  });
  tagEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      tagEl.click();
    }
  });
}

export function createSummaryTag(text, extraClass, titleText) {
  const span = document.createElement('span');
  span.className = `tag ${extraClass || ''}`.trim();
  if (titleText) {
    span.dataset.hint = titleText;
    span.setAttribute('aria-label', titleText);
    span.setAttribute('role', 'note');
    span.tabIndex = 0;
  }
  if (!text) {
    span.classList.add('tag-empty');
    span.innerHTML = '&nbsp;';
  } else {
    span.textContent = text;
  }
  if (span.dataset.hint) {
    attachTagHintBehavior(span);
  }
  return span;
}
