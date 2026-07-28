// Filter evaluation for the search page. `collectFilterFailures(entry)` returns
// the list of reasons an entry is filtered out (empty array = it passes all
// active filters). Each reason carries a `remove` callback that clears that one
// filter and re-applies. Extracted from app.js; the controller injects the
// shared filter `state`, DOM helper, mutable limit objects and the callbacks
// that touch the rest of the page (applyFilters, the range/population inputs).

import { parseLetterTokens, buildCharCounts, tokenPasses } from './filter-tokens.js';

export function createFilters(ctx) {
  const {
    state,
    $,
    limits,
    applyFilters,
    updatePopulationInputs,
    setLetterRangeValues,
    getGroupMeta,
    getPhoneticMeta,
    getGroupLabel,
    getFeatureLabel,
    formatPopularityLabel
  } = ctx;

  function getGroupFilterReasons(entry) {
    if (!state.groupFilters.length) return [];
    const reasons = [];
    const groups = Array.isArray(entry.groups) ? entry.groups : [];
    state.groupFilters.forEach((filter) => {
      const hasGroup = groups.includes(filter.group);
      const label = getGroupLabel(getGroupMeta().get(filter.group)) || filter.group;
      if (filter.mode === 'include' && !hasGroup) {
        reasons.push({
          text: `Puuttuu ryhmä: ${label}`,
          remove: () => {
            state.groupFilters = state.groupFilters.filter((f) => f.id !== filter.id);
            applyFilters(true);
          }
        });
      }
      if (filter.mode === 'exclude' && hasGroup) {
        reasons.push({
          text: `Poistettu ryhmän vuoksi: ${label}`,
          remove: () => {
            state.groupFilters = state.groupFilters.filter((f) => f.id !== filter.id);
            applyFilters(true);
          }
        });
      }
    });
    return reasons;
  }

  function getPopularityFilterReasons(entry) {
    if (!state.popularityFilters.length) return [];
    const reasons = [];
    const groups = Array.isArray(entry.groups) ? entry.groups : [];
    state.popularityFilters.forEach((filter) => {
      const hasGroup = groups.includes(filter.group);
      const label = formatPopularityLabel(filter.group);
      if (filter.mode === 'include' && !hasGroup) {
        reasons.push({
          text: `Ei kuulu joukkoon: ${label}`,
          remove: () => {
            state.popularityFilters = state.popularityFilters.filter((f) => f.id !== filter.id);
            applyFilters(true);
          }
        });
      }
      if (filter.mode === 'exclude' && hasGroup) {
        reasons.push({
          text: `Poistettu suosion vuoksi: ${label}`,
          remove: () => {
            state.popularityFilters = state.popularityFilters.filter((f) => f.id !== filter.id);
            applyFilters(true);
          }
        });
      }
    });
    return reasons;
  }

  function getPhoneticFilterReasons(entry) {
    if (!state.phoneticFilters.length) return [];
    const reasons = [];
    state.phoneticFilters.forEach((filter) => {
      const feature = entry.phonetic[filter.feature];
      const label = getFeatureLabel(getPhoneticMeta().get(filter.feature)) || filter.feature;
      const mode = filter.mode;
      if (!feature) {
          reasons.push({
            text: `Ei tietoa: ${label}`,
            remove: () => {
              state.phoneticFilters = state.phoneticFilters.filter((f) => f.id !== filter.id);
              applyFilters(true);
            }
          });
        return;
      }
      if (mode === 'include') {
        if (!feature.value) {
          reasons.push({
            text: `Puuttuu piirre: ${label}`,
            remove: () => {
              state.phoneticFilters = state.phoneticFilters.filter((f) => f.id !== filter.id);
              applyFilters(true);
            }
          });
        }
      } else if (mode === 'exclude') {
        if (feature.value) {
          reasons.push({
            text: `Suodatettu piirteen vuoksi: ${label}`,
            remove: () => {
              state.phoneticFilters = state.phoneticFilters.filter((f) => f.id !== filter.id);
              applyFilters(true);
            }
          });
        }
      }
    });
    return reasons;
  }

  function collectFilterFailures(entry) {
    const reasons = [];
    if (!state.genders.has(entry.gender) && entry.gender !== 'unknown') {
      reasons.push({
        key: 'gender',
        text: 'Sukupuolirajaus',
        remove: null
      });
    }
    const name = (entry.name || entry.display || '').toLowerCase();
    const includeTokens = parseLetterTokens(state.includeLettersInput);
    if (includeTokens.length) {
      const nameCounts = buildCharCounts(name);
      const satisfied = includeTokens.some((token) => tokenPasses(name, nameCounts, token));
      if (!satisfied) {
        reasons.push({
          text: `Ei täytä: ${includeTokens.join(', ')}`,
          remove: () => {
            state.includeLettersInput = '';
            const includeInput = $('#letters-include');
            if (includeInput) includeInput.value = '';
            applyFilters(true);
          }
        });
      }
    }
    const excludeTokens = parseLetterTokens(state.excludeLettersInput);
    if (excludeTokens.length) {
      const nameCounts = buildCharCounts(name);
      const present = excludeTokens.filter((token) => token && tokenPasses(name, nameCounts, token));
      if (present.length) {
        reasons.push({
          text: `Kielletyt jaksot: ${present.join(', ')}`,
          remove: () => {
            state.excludeLettersInput = '';
            const excludeInput = $('#letters-exclude');
            if (excludeInput) excludeInput.value = '';
            applyFilters(true);
          }
        });
      }
    }
    const lengthValue = Number(entry.metrics?.length ?? entry.display?.length ?? 0);
    if (lengthValue < state.letterRange.min || lengthValue > state.letterRange.max) {
      reasons.push({
        text: `Pituusraja ${state.letterRange.min}-${state.letterRange.max}`,
        remove: () => {
          state.letterRange = { ...limits.letter };
          setLetterRangeValues(limits.letter.min, limits.letter.max);
          applyFilters(true);
        }
      });
    }
    const total = Number(entry.popularity?.total ?? 0);
    if (Number.isNaN(total) || total < state.populationRange.min || total > state.populationRange.max) {
      reasons.push({
        text: 'Nimenhaltijoiden määrä rajattu',
        remove: () => {
          state.populationRange = { ...limits.population };
          updatePopulationInputs();
          applyFilters(true);
        }
      });
    }
    reasons.push(...getGroupFilterReasons(entry));
    reasons.push(...getPopularityFilterReasons(entry));
    reasons.push(...getPhoneticFilterReasons(entry));
    return reasons;
  }

  return { collectFilterFailures };
}
