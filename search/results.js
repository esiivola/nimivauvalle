// Renders the search results list: the visible cards, the collapsible
// "filtered out" groups, the result count / surname-match context line and the
// "load more" button. Extracted from app.js as a createResults(ctx) factory;
// the controller injects the shared filter `state`, the ordered/current result
// arrays (via getters, since applyFilters reassigns them), the expanded-group
// set, the per-card detail loader, and the favorite + active-filter callbacks.

import { createCardShell } from '../shared-cards.js';
import { setAdSlotsEnabled } from '../ad-service.js';
import { translations } from './strings.js';

export function createResults(ctx) {
  const {
    state,
    $,
    getOrderedResults,
    getCurrentResults,
    expandedFilteredBlocks,
    getCardDetailLoader,
    isFavorite,
    toggleFavorite,
    renderActiveFilters,
    getTypedSurname
  } = ctx;

  function getDisplayableCount() {
    return getOrderedResults().reduce((acc, entry) => {
      const hasGenderBlock = entry._filteredReasons?.some((r) => r.key === 'gender');
      return hasGenderBlock ? acc : acc + 1;
    }, 0);
  }

  function createNameCard(entry, t, surnameEntry, { filtered = false } = {}) {
    return createCardShell(entry, {
      t,
      surnameEntry,
      filtered,
      isFavorite: () => isFavorite(entry.name),
      toggleFavorite,
      onOpen: (detailsEl, bodyEl) =>
        getCardDetailLoader()?.(detailsEl, bodyEl, entry, { surnameEntry })
    });
  }

  function createFilteredGroupPlaceholder(filteredEntries, t, surnameEntry, blockId) {
    const wrapper = document.createElement('div');
    wrapper.className = 'filtered-divider';
    if (blockId) {
      wrapper.dataset.blockId = blockId;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ghost small filtered-toggle';
    if (!filteredEntries.length) {
      button.textContent = 'Suodatetut nimet on piilotettu';
    } else {
      button.textContent = `${filteredEntries.length} nimeä suodatettu, klikkaa näyttääksesi`;
      button.addEventListener('click', () => {
        expandedFilteredBlocks.add(blockId);
        renderResults();
      });
    }
    wrapper.appendChild(button);
    return wrapper;
  }

  function scrollFilteredPlaceholderIntoView(blockId, previousTop) {
    if (!blockId || previousTop == null) return;
    requestAnimationFrame(() => {
      const placeholder = document.querySelector(
        `.filtered-divider[data-block-id="${blockId}"] .filtered-toggle`
      );
      if (!placeholder) return;
      const newTop = placeholder.getBoundingClientRect().top;
      window.scrollBy({ top: newTop - previousTop });
    });
  }

  function createExpandedFilteredGroup(filteredEntries, t, surnameEntry, blockId) {
    const expanded = document.createElement('div');
    expanded.className = 'filtered-expanded';
    if (blockId) {
      expanded.dataset.blockId = blockId;
    }
    const makeCollapse = () => {
      const collapse = document.createElement('button');
      collapse.type = 'button';
      collapse.className = 'ghost small filtered-toggle';
      collapse.textContent = 'Piilota suodatetut nimet';
      collapse.addEventListener('click', () => {
        const previousTop = collapse.getBoundingClientRect().top;
        expandedFilteredBlocks.delete(blockId);
        renderResults();
        scrollFilteredPlaceholderIntoView(blockId, previousTop);
      });
      return collapse;
    };
    expanded.appendChild(makeCollapse());

    const listContainer = document.createElement('div');
    listContainer.className = 'filtered-chunk';
    expanded.appendChild(listContainer);
    expanded.appendChild(makeCollapse());

    return { expanded, listContainer };
  }

  function renderResults(restoreResultsScroll) {
    const t = translations.fi;
    const orderedResults = getOrderedResults();
    const list = $('#results-list');
    const { surnameEntry, missingSurname } = state.matchInfo;
    const displayableTotal = getDisplayableCount();
    const totalUnfiltered = getCurrentResults().length;
    setAdSlotsEnabled('results', displayableTotal > 0);
    list.innerHTML = '';
    let renderedCount = 0;
    let renderedUnfiltered = 0;
    let expandedAvailableCount = 0;
    let usedSlots = 0;
    let filteredBlockCounter = 0;
    const activeBlockIds = new Set();
    let hitVisibleLimit = false;
    if (!displayableTotal && !totalUnfiltered) {
      list.innerHTML = `<p class="hint">${t.noResults}</p>`;
    } else {
      let filteredBuffer = [];
      let bufferStartIndex = null;
      const flushFilteredBuffer = () => {
        if (!filteredBuffer.length) return;
        const blockId = `filtered-${bufferStartIndex ?? filteredBlockCounter}`;
        filteredBlockCounter += 1;
        activeBlockIds.add(blockId);
        const isExpanded = expandedFilteredBlocks.has(blockId);
        if (isExpanded) {
          expandedAvailableCount += filteredBuffer.length;
          const { expanded, listContainer } = createExpandedFilteredGroup(
            filteredBuffer,
            t,
            surnameEntry,
            blockId
          );
          list.appendChild(expanded);
          for (const entry of filteredBuffer) {
            if (usedSlots >= state.visibleCount) {
              hitVisibleLimit = true;
              break;
            }
            const card = createNameCard(entry, t, surnameEntry, { filtered: true });
            listContainer.appendChild(card);
            usedSlots += 1;
            renderedCount += 1;
          }
        } else {
          const placeholder = createFilteredGroupPlaceholder(filteredBuffer, t, surnameEntry, blockId);
          list.appendChild(placeholder);
        }
        filteredBuffer = [];
        bufferStartIndex = null;
      };
      for (let idx = 0; idx < orderedResults.length; idx += 1) {
        if ((usedSlots >= state.visibleCount && filteredBuffer.length === 0) || hitVisibleLimit) {
          break;
        }
        const entry = orderedResults[idx];
        const isFiltered = entry._filteredReasons?.length;
        const hasGenderBlock = entry._filteredReasons?.some((r) => r.key === 'gender');
        if (isFiltered) {
          if (hasGenderBlock) {
            continue;
          }
          if (!filteredBuffer.length) {
            bufferStartIndex = idx;
          }
          filteredBuffer.push(entry);
          continue;
        }
        flushFilteredBuffer();
        if (hitVisibleLimit || usedSlots >= state.visibleCount) {
          break;
        }
        const card = createNameCard(entry, t, surnameEntry, { filtered: false });
        list.appendChild(card);
        usedSlots += 1;
        renderedCount += 1;
        renderedUnfiltered += 1;
      }
      if (!hitVisibleLimit) {
        flushFilteredBuffer();
      }
    }
    Array.from(expandedFilteredBlocks).forEach((id) => {
      if (!activeBlockIds.has(id)) {
        expandedFilteredBlocks.delete(id);
      }
    });
    const shownCount = Math.min(renderedUnfiltered, totalUnfiltered);
    $('#result-count').textContent = totalUnfiltered
      ? t.results(1, shownCount, totalUnfiltered)
      : t.noResults;
    const typedSurname = getTypedSurname();
    const surnameLabel = typedSurname || state.surname || '';
    $('#match-context').textContent = missingSurname
      ? translations.fi.missingSurname(surnameLabel)
      : translations.fi.match(surnameLabel || (surnameEntry?.display ?? ''));
    renderActiveFilters();
    const loadMoreBtn = $('#load-more');
    if (loadMoreBtn) {
      const totalRenderable = totalUnfiltered + expandedAvailableCount;
      const hasMore = usedSlots < totalRenderable;
      loadMoreBtn.disabled = !hasMore;
      loadMoreBtn.hidden = totalRenderable === 0;
      loadMoreBtn.textContent = hasMore ? 'Näytä lisää nimiä' : 'Ei enempää nimiä';
    }
    restoreResultsScroll?.();
  }

  return { renderResults, getDisplayableCount };
}
