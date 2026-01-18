const GENDER_OPTIONS = [
  { value: 'female', label: 'Tyttö' },
  { value: 'male', label: 'Poika' },
  { value: 'unisex', label: 'Unisex' }
];

const DEFAULT_GENDERS = GENDER_OPTIONS.map((option) => option.value);

const normalizeToList = (values) => {
  if (!values) return [];
  if (Array.isArray(values)) return values;
  return Array.from(values);
};

export function normalizeGenderSelection(selected, fallback = DEFAULT_GENDERS) {
  const normalized = new Set(normalizeToList(selected).filter(Boolean));
  if (!normalized.size) {
    normalizeToList(fallback).forEach((value) => normalized.add(value));
  }
  return normalized;
}

export function constrainGenderSelection(selected, allowed, fallback = allowed) {
  const allowedSet = new Set(normalizeToList(allowed));
  const constrained = new Set();
  normalizeToList(selected).forEach((value) => {
    if (allowedSet.has(value)) {
      constrained.add(value);
    }
  });
  if (!constrained.size) {
    normalizeToList(fallback).forEach((value) => constrained.add(value));
  }
  return constrained;
}

export function getGenderInputs(root = document, name = 'gender') {
  return Array.from(root.querySelectorAll(`input[name="${name}"]`));
}

export function getSelectedGenders(root = document, name = 'gender') {
  const selected = new Set();
  getGenderInputs(root, name).forEach((input) => {
    if (input.checked) {
      selected.add(input.value);
    }
  });
  return selected;
}

export function setSelectedGenders(root = document, selected, { name = 'gender', fallback } = {}) {
  const normalized = normalizeGenderSelection(selected, fallback);
  getGenderInputs(root, name).forEach((input) => {
    input.checked = normalized.has(input.value);
  });
  return normalized;
}

export function updateGenderAvailability(
  root = document,
  available,
  { name = 'gender', hideUnavailable = false } = {}
) {
  const availableSet = new Set(normalizeToList(available));
  getGenderInputs(root, name).forEach((input) => {
    const label = input.closest('label');
    const isAvailable = availableSet.has(input.value);
    input.disabled = !isAvailable;
    if (label) {
      if (hideUnavailable) {
        label.hidden = !isAvailable;
      } else {
        label.classList.toggle('is-disabled', !isAvailable);
      }
    }
  });
}

export function createGenderFieldset({ name = 'gender', legend = 'Nimen sukupuoli', selected } = {}) {
  const fieldset = document.createElement('fieldset');
  fieldset.className = 'gender-field';
  const legendEl = document.createElement('legend');
  legendEl.textContent = legend;
  fieldset.appendChild(legendEl);
  const selectedSet = normalizeGenderSelection(selected, DEFAULT_GENDERS);
  GENDER_OPTIONS.forEach((option) => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.name = name;
    input.value = option.value;
    input.checked = selectedSet.has(option.value);
    label.appendChild(input);
    label.appendChild(document.createTextNode(` ${option.label}`));
    fieldset.appendChild(label);
  });
  return fieldset;
}

export function ensureGenderFilter(container, options = {}) {
  if (!container) return null;
  const existing = container.querySelector('.gender-field');
  if (existing) return existing;
  const fieldset = createGenderFieldset(options);
  container.appendChild(fieldset);
  return fieldset;
}

export { DEFAULT_GENDERS, GENDER_OPTIONS };
