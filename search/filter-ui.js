// Renders the schema-driven filter panels: the group/phonetic feature toggles
// ("+ Vain nämä" / "– Poista nämä" / "○ Ei käytössä") and the popularity rows
// (period select + tri-state toggle). Extracted from app.js as a
// createFilterUI(ctx) factory; the controller injects the shared filter `state`,
// live getters for the schema-derived meta, the label/period helpers, the
// filter-id counters and the scheduleApplyFilters / updateFilterPanels /
// preserveScroll callbacks.

export function createFilterUI(ctx) {
  const {
    $,
    state,
    preserveScroll,
    updateFilterPanels,
    scheduleApplyFilters,
    getFilterFeatureMeta,
    getGroupMeta,
    getPhoneticMeta,
    getGroupFilterKeys,
    getFirstPhoneticKey,
    getGroupLabel,
    getFeatureLabel,
    getGroupDescription,
    getFeatureDescriptionByMeta,
    getPopularityKeys,
    getPopularityOptions,
    getPeriodLabel,
    nextFilterId,
    nextGroupFilterId
  } = ctx;

  function renderFeatureFilters() {
    const container = $('#feature-filters');
    if (!container) return;
    const restore = preserveScroll(container);
    container.innerHTML = '';
    const filterFeatureMeta = getFilterFeatureMeta();
    if (!filterFeatureMeta.length) {
      container.innerHTML = '<p class="hint">Ei rajattavia ominaisuuksia.</p>';
      updateFilterPanels();
      restore();
      return;
    }
    const groupMeta = getGroupMeta();
    const phoneticMeta = getPhoneticMeta();
    const toggleStates = (current) => {
      const order = ['none', 'include', 'exclude'];
      const idx = order.indexOf(current);
      return order[(idx + 1) % order.length];
    };
    const grid = document.createElement('div');
    grid.className = 'filter-columns';
    filterFeatureMeta.forEach((meta) => {
      const key = meta.key;
      const type = meta.filterType;
      let existing =
        type === 'group'
          ? state.groupFilters.find((f) => f.group === key)
          : state.phoneticFilters.find((f) => f.feature === key);
      const currentMode = existing?.mode || 'none';
      const row = document.createElement('div');
      row.className = 'filter-row';
      const label = document.createElement('div');
      label.textContent =
        type === 'group'
          ? getGroupLabel(groupMeta.get(key)) || meta.label
          : getFeatureLabel(phoneticMeta.get(key)) || meta.label;
      label.className = 'filter-label-text';
      row.appendChild(label);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'ghost small tri-toggle';
      const setState = (mode) => {
        button.dataset.state = mode;
        button.textContent = mode === 'include' ? '+ Vain nämä' : mode === 'exclude' ? '– Poista nämä' : '○ Ei käytössä';
      };
      setState(currentMode);
      button.title =
        type === 'group'
          ? getGroupDescription(key) || meta.description
          : getFeatureDescriptionByMeta(phoneticMeta.get(key)) || meta.description;
      button.addEventListener('click', () => {
        const next = toggleStates(button.dataset.state || 'none');
        if (next === 'none') {
          if (type === 'group') {
            state.groupFilters = state.groupFilters.filter((f) => f.group !== key);
            existing = null;
          } else {
            state.phoneticFilters = state.phoneticFilters.filter((f) => f.feature !== key);
            existing = null;
          }
        } else if (existing) {
          existing.mode = next;
        } else if (type === 'group') {
          existing = { id: nextGroupFilterId(), group: key, mode: next };
          state.groupFilters.push(existing);
        } else {
          existing = { id: nextFilterId(), feature: key, mode: next, grade: 1 };
          state.phoneticFilters.push(existing);
        }
        setState(next);
        scheduleApplyFilters(true);
      });
      row.appendChild(button);
      const desc = document.createElement('p');
      desc.className = 'filter-desc';
      desc.textContent =
        type === 'group'
          ? getGroupDescription(key) || meta.description || ''
          : getFeatureDescriptionByMeta(phoneticMeta.get(key)) || meta.description || '';
      row.appendChild(desc);
      grid.appendChild(row);
    });
    container.appendChild(grid);
    updateFilterPanels();
    restore();
  }

  function findPopularityByPrefix(prefix) {
    return state.popularityFilters.find((f) => f.group.startsWith(prefix));
  }

  function setPopularitySelection(prefix, groupKey, mode) {
    state.popularityFilters = state.popularityFilters.filter((f) => !f.group.startsWith(prefix));
    if (!groupKey || mode === 'none') {
      return;
    }
    state.popularityFilters.push({ id: nextGroupFilterId(), group: groupKey, mode });
  }

  function cycleTriState(current) {
    const order = ['none', 'include', 'exclude'];
    const idx = order.indexOf(current);
    return order[(idx + 1) % order.length];
  }

  function renderPopularityFilters() {
    const container = $('#popularity-filters');
    if (!container) return;
    const restore = preserveScroll(container);
    container.innerHTML = '';
    const rows = [
      {
        label: 'Suosion huipulla',
        prefix: 'trend_',
        desc: 'Nimet, joiden suosio on ollut huipussaan kyseisellä vuosikymmenellä.'
      },
      {
        label: 'Kasvattanut suosiota',
        prefix: 'growth_',
        desc: 'Nimet, joiden suosio on kasvanut edelliseltä vuosikymmeneltä.'
      },
      {
        label: 'Suosittu',
        prefix: 'popular_',
        desc: 'Kunkin vuosikymmenen 500 suosituinta nimeä'
      }
    ];
    const createSelect = (prefix, options) => {
      const select = document.createElement('select');
      if (!options.length) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'Ei valintoja';
        select.appendChild(opt);
        return select;
      }
      options.forEach((key) => {
        const option = document.createElement('option');
        option.value = key;
        option.textContent = getPeriodLabel(key);
        select.appendChild(option);
      });
      return select;
    };
    rows.forEach((rowConfig) => {
      const options = getPopularityOptions(rowConfig.prefix);
      if (!options.length) return;
      const row = document.createElement('div');
      row.className = 'popularity-row';
      const selectId = `popularity-${rowConfig.prefix.replace(/_$/, '')}`;
      const labelEl = document.createElement('label');
      labelEl.textContent = rowConfig.label;
      labelEl.className = 'filter-label-text';
      labelEl.htmlFor = selectId;
      row.appendChild(labelEl);
      const select = createSelect(rowConfig.prefix, options);
      select.id = selectId;
      row.appendChild(select);
      const tri = document.createElement('button');
      tri.type = 'button';
      tri.className = 'ghost small tri-toggle';
      const current = findPopularityByPrefix(rowConfig.prefix);
      if (current) {
        select.value = current.group;
      }
      const setState = (mode) => {
        tri.dataset.state = mode;
        tri.textContent = mode === 'include' ? '+ Vain nämä' : mode === 'exclude' ? '– Poista nämä' : '○ Ei käytössä';
      };
      setState(current ? current.mode : 'none');
      tri.addEventListener('click', () => {
        const next = cycleTriState(tri.dataset.state || 'none');
        setPopularitySelection(rowConfig.prefix, select.value, next);
        setState(next);
        scheduleApplyFilters(true);
      });
      select.addEventListener('change', () => {
        const mode = tri.dataset.state || 'none';
        setPopularitySelection(rowConfig.prefix, select.value, mode);
        scheduleApplyFilters(true);
      });
      row.appendChild(tri);
      container.appendChild(row);
      const desc = document.createElement('p');
      desc.className = 'filter-desc';
      desc.textContent = rowConfig.desc;
      const descWrap = document.createElement('div');
      descWrap.className = 'popularity-row-desc';
      descWrap.appendChild(desc);
      container.appendChild(descWrap);
    });
    updateFilterPanels();
    restore();
  }

  function addPopularityFilter() {
    const keys = getPopularityKeys();
    if (!keys.length) return;
    const firstKey = keys[0];
    state.popularityFilters.push({ id: nextGroupFilterId(), group: firstKey, mode: 'include' });
    renderPopularityFilters();
    scheduleApplyFilters(true);
  }

  function addPhoneticFilter() {
    const firstKey = getFirstPhoneticKey();
    if (!firstKey) return;
    state.phoneticFilters.push({ id: nextFilterId(), feature: firstKey, mode: 'include', grade: 1 });
    renderFeatureFilters();
    scheduleApplyFilters(true);
  }

  function addGroupFilter() {
    const firstKey = getGroupFilterKeys()[0];
    if (!firstKey) return;
    state.groupFilters.push({ id: nextGroupFilterId(), group: firstKey, mode: 'include' });
    renderFeatureFilters();
    scheduleApplyFilters(true);
  }

  return {
    renderFeatureFilters,
    renderPopularityFilters,
    addPopularityFilter,
    addPhoneticFilter,
    addGroupFilter
  };
}
