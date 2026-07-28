// Shared weight-editor modal used by the search page (app.js) and the favorites
// page (favorites.js). Both render the same MATCH_WEIGHT_FIELDS rows, sum the
// absolute percentages, and require them to total 100% before saving. The pages
// differ in their copy, persistence target, trait hints, and open/close chrome,
// so those are supplied via config; the DOM building, validation and
// input→weights conversion live here.
//
// config:
//   refs            { modal, list, total, remaining, error, save } — DOM elements
//   tolerance       allowed |100 - sum| slack before save is disabled
//   getWeights()    source weight map used for the default input values
//   getBudget()     current absolute-weight budget (percent basis)
//   strings         { totalText(total), balanceText(balance), invalidText,
//                     absRequirementText, penaltyNote }
//   traitProvider() optional → Map(fieldKey → hint sentence) rendered per row
//   toggleNoteOnInput  live-toggle the negative-weight note as the user types
//   getOpenPrefill()   optional → Map(key → inputValue) to seed the next open
//   beforeOpen()       optional hook run before rendering on open
//   syncTexts()        optional hook to set modal heading/label copy on open
//   onClose()          hook run after hiding the modal (body class handling)
//   getApplyBase()     base weight map that inputs are layered onto on save
//   onApply(normalized, base)  persist + refresh; also closes the editor

import MATCH_WEIGHT_FIELDS from './weight-fields.js';
import {
  formatPercentNumber,
  normalizeWeightMap,
  percentToWeight,
  weightToPercent
} from './weight-utils.js';

export function createWeightEditor(config) {
  const {
    refs,
    tolerance = 0.05,
    fields = MATCH_WEIGHT_FIELDS,
    getWeights,
    getBudget,
    strings,
    traitProvider = null,
    toggleNoteOnInput = false,
    getOpenPrefill = null,
    beforeOpen = null,
    syncTexts = null,
    onClose = null,
    getApplyBase,
    onApply
  } = config;

  let inputs = [];

  function handleInput(event) {
    updateTotals();
    if (!toggleNoteOnInput || !strings.penaltyNote) return;
    const entry = inputs.find((item) => item.input === event.target);
    if (!entry) return;
    const value = Number.parseFloat(event.target.value);
    const note = entry.row.querySelector('.weight-row-note');
    if (Number.isFinite(value) && value < 0) {
      if (!note) {
        const noteEl = document.createElement('p');
        noteEl.className = 'weight-row-note';
        noteEl.textContent = strings.penaltyNote;
        entry.row.appendChild(noteEl);
      }
    } else if (note) {
      note.remove();
    }
  }

  function render(prefillValues, sourceWeights) {
    if (!refs.list) return;
    const weights = sourceWeights || getWeights();
    const budget = getBudget();
    const traitMap = typeof traitProvider === 'function' ? traitProvider() : null;
    refs.list.innerHTML = '';
    inputs = [];
    fields.forEach((meta) => {
      const row = document.createElement('div');
      row.className = 'weight-row';
      const header = document.createElement('div');
      header.className = 'weight-row-header';

      const legendWrap = document.createElement('div');
      const labelEl = document.createElement('div');
      labelEl.className = 'weight-row-label';
      labelEl.textContent = meta.label;
      legendWrap.appendChild(labelEl);
      const descEl = document.createElement('p');
      descEl.className = 'weight-row-description';
      descEl.textContent = meta.description;
      legendWrap.appendChild(descEl);
      if (traitMap && traitMap.has(meta.key)) {
        const traitEl = document.createElement('p');
        traitEl.className = 'weight-row-trait';
        traitEl.textContent = traitMap.get(meta.key);
        legendWrap.appendChild(traitEl);
      }
      header.appendChild(legendWrap);

      const inputWrap = document.createElement('div');
      inputWrap.className = 'weight-row-input';
      const inputEl = document.createElement('input');
      inputEl.type = 'number';
      inputEl.min = '-100';
      inputEl.max = '100';
      inputEl.step = '5';
      inputEl.inputMode = 'numeric';
      inputEl.dataset.key = meta.key;
      const valueString =
        prefillValues && prefillValues.has(meta.key)
          ? prefillValues.get(meta.key)
          : formatPercentNumber(weightToPercent(weights[meta.key] ?? 0, budget));
      inputEl.value = valueString;
      inputEl.addEventListener('input', handleInput);
      inputWrap.appendChild(inputEl);
      const suffix = document.createElement('span');
      suffix.textContent = '%';
      inputWrap.appendChild(suffix);
      header.appendChild(inputWrap);
      row.appendChild(header);
      refs.list.appendChild(row);
      inputs.push({ key: meta.key, input: inputEl, row });

      const numericValue = Number.parseFloat(valueString);
      if (strings.penaltyNote && Number.isFinite(numericValue) && numericValue < 0) {
        const note = document.createElement('p');
        note.className = 'weight-row-note';
        note.textContent = strings.penaltyNote;
        row.appendChild(note);
      }
    });
    updateTotals();
  }

  function updateTotals() {
    let total = 0;
    let hasInvalid = false;
    inputs.forEach((item) => {
      const value = Number.parseFloat(item.input.value);
      if (!Number.isFinite(value)) {
        hasInvalid = true;
        item.input.classList.add('invalid');
        return;
      }
      item.input.classList.remove('invalid');
      total += Math.abs(value);
    });
    total = Math.round(total * 10) / 10;
    const balance = Math.round((100 - total) * 10) / 10;
    if (refs.total) {
      refs.total.textContent = strings.totalText(total);
    }
    if (refs.remaining) {
      refs.remaining.textContent = strings.balanceText(balance);
    }
    const needsAdjustment = Math.abs(balance) > tolerance;
    let error = '';
    if (hasInvalid) {
      error = strings.invalidText;
    } else if (needsAdjustment) {
      error = strings.absRequirementText;
    }
    if (refs.error) {
      refs.error.textContent = error;
    }
    if (refs.save) {
      refs.save.disabled = hasInvalid || needsAdjustment;
    }
  }

  function open() {
    if (typeof beforeOpen === 'function') beforeOpen();
    const prefill = typeof getOpenPrefill === 'function' ? getOpenPrefill() : undefined;
    render(prefill);
    if (typeof syncTexts === 'function') syncTexts();
    if (refs.modal) refs.modal.hidden = false;
    document.body.classList.add('modal-open');
  }

  function close() {
    if (refs.modal) refs.modal.hidden = true;
    if (typeof onClose === 'function') onClose();
  }

  function applyChanges() {
    if (refs.save && refs.save.disabled) return;
    const base = { ...getApplyBase() };
    const updated = { ...base };
    inputs.forEach((item) => {
      const value = Number.parseFloat(item.input.value);
      if (!Number.isFinite(value)) return;
      updated[item.key] = percentToWeight(value, getBudget());
    });
    const normalized = normalizeWeightMap(updated);
    onApply(normalized, base);
  }

  function isOpen() {
    return Boolean(refs.modal && !refs.modal.hidden);
  }

  return {
    open,
    close,
    render,
    updateTotals,
    applyChanges,
    isOpen,
    getInputs: () => inputs
  };
}
