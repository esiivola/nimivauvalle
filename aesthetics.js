import { loadDataset } from './data-service.js';
import { selectTopEntries } from './matching-model.js';
import MATCH_WEIGHT_FIELDS from './weight-fields.js';
import {
  computeAbsoluteWeightBudget,
  formatPercentNumber,
  normalizeWeightMap,
  percentToWeight,
  persistSharedWeights,
  readSharedWeights,
  weightToPercent
} from './weight-utils.js';

const WORKER_PATH = './aesthetics-worker.js';
const PAGE_SIZE = 100;

let worker = null;
let firstIndex = null;
let lastIndex = null;
let weights = {};
let datasetCache = null;
let currentTopFirst = 0;
let currentTopLast = 0;
let currentPairs = [];
let visiblePairs = PAGE_SIZE;
let currentMode = 'global';
let fixedFirstName = null;
let fixedFirstLookup = null;
let datasetReady = false;
let weightModal = null;
let weightEditorInputs = [];
let weightPercentBudget = 1;
let orderDir = 'desc';

const defaultWeights = {
  vowel_location: 0.1,
  vowel_openess: 0.1,
  softness: 0.1,
  tone: 0.1,
  rhythm: 0.1,
  length: 0.1,
  head_transition: 0.1,
  end_start_transition: 0.1,
  alliteration: -0.05,
  oddness: -0.1
};
let normalizedDefault = {};

function $(sel) {
  return document.querySelector(sel);
}

function formatNumber(value) {
  return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

async function loadMeta() {
  if (!datasetCache) {
    datasetCache = await loadDataset({ includeSurnames: true });
  }
  const schemaWeights = datasetCache?.schema?.matching?.weights;
  const baseWeights = schemaWeights && Object.keys(schemaWeights).length ? { ...schemaWeights } : { ...defaultWeights };
  if (baseWeights.junction_transition != null && baseWeights.end_start_transition == null) {
    baseWeights.end_start_transition = baseWeights.junction_transition;
  }
  delete baseWeights.junction_transition;
  delete baseWeights.junction;
  normalizedDefault = normalizeWeightMap(baseWeights);
  weights = { ...normalizedDefault };
  const shared = readSharedWeights();
  if (shared) {
    weights = { ...shared };
  }
  weights = normalizeWeightMap(weights);
  const baseBudget = computeAbsoluteWeightBudget(normalizedDefault) || 1;
  weightPercentBudget = computeAbsoluteWeightBudget(weights) || baseBudget;
  renderWeightList();
}

async function ensureDataset(topFirst = 3000, topLast = 3000) {
  if (!datasetCache) {
    datasetCache = await loadDataset({ includeSurnames: true });
  }
  if (firstIndex && lastIndex && currentTopFirst === topFirst && currentTopLast === topLast) {
    return;
  }
  currentTopFirst = topFirst;
  currentTopLast = topLast;
  firstIndex = selectTopEntries(datasetCache.names, topFirst, (entry) => entry?.popularity?.total || 0);
  lastIndex = selectTopEntries(datasetCache.surnames, topLast, (entry) => entry?.popularity || 0);
  datasetReady = true;
}

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(WORKER_PATH, { type: 'module' });
  worker.onmessage = handleWorkerMessage;
  return worker;
}

function setStatus(text) {
  const el = $('#status');
  if (el) el.textContent = text || '';
}

function updateOrderToggle() {
  const btn = $('#ae-toggle-order');
  if (btn) {
    btn.textContent = orderDir === 'desc' ? 'Parhaat ensin' : 'Huonoimmat ensin';
  }
}

function applyOrdering(pairs = []) {
  const list = [...pairs];
  list.sort((a, b) => (orderDir === 'desc' ? b.score - a.score : a.score - b.score));
  return list;
}

function renderResults(pairs) {
  currentPairs = applyOrdering(pairs ?? currentPairs ?? []);
  const slice = currentPairs.slice(0, visiblePairs);
  const body = $('#results-body');
  if (!body) return;
  body.innerHTML = '';
  const total = currentPairs.length;
  slice.forEach((entry, idx) => {
    const tr = document.createElement('tr');
    const first = fixedFirstName
      ? { display: fixedFirstName, name: fixedFirstLookup || fixedFirstName }
      : firstIndex?.[entry.firstId];
    const last = lastIndex?.[entry.lastId];
    const rank = orderDir === 'desc' ? idx + 1 : Math.max(1, total - idx);
    tr.innerHTML = `<td>${rank}</td><td>${first?.display ?? first?.name ?? fixedFirstName ?? '-'}</td><td>${last?.display ?? last?.name ?? '-'}</td><td>${entry.score.toFixed(3)}</td>`;
    body.appendChild(tr);
  });
  updateLoadMoreButtons();
}

function handleWorkerMessage(event) {
  const { type, pairs, message, value, total } = event.data || {};
  if (type === 'progress') {
    setStatus(`Käsitellään nimiä… ${value}/${total}`);
  } else if (type === 'result') {
    setStatus('Valmis');
    visiblePairs = PAGE_SIZE;
    renderResults(pairs || []);
  } else if (type === 'error') {
    setStatus(message || 'Virhe');
  }
}

async function onComputeGlobal() {
  setStatus('Lasketaan kaikki parit…');
  currentMode = 'global';
  fixedFirstName = null;
  fixedFirstLookup = null;
  currentPairs = [];
  visiblePairs = PAGE_SIZE;
  renderResults([]);
  const topFirst = Number.parseInt($('#top-first')?.value, 10) || 1000;
  const topLast = Number.parseInt($('#top-last')?.value, 10) || 2000;
  await ensureDataset(topFirst, topLast);
  ensureWorker().postMessage({ type: 'compute-best', weights, topFirst, topLast });
}

async function onComputeForFirst(nameParam) {
  const input = $('#first-name-input');
  if (!input) return;
  const displayName = (nameParam || input.value || '').trim();
  const lookupName = displayName.toLowerCase();
  if (!lookupName) {
    return;
  }
  setStatus(`Lasketaan parhaat sukunimet etunimelle ${displayName}…`);
  currentMode = 'first';
  fixedFirstName = displayName;
  fixedFirstLookup = lookupName;
  currentPairs = [];
  visiblePairs = PAGE_SIZE;
  renderResults([]);
  const topFirstInput = Number.parseInt($('#top-first')?.value, 10) || 1000;
  const topLastInput = Number.parseInt($('#top-last')?.value, 10) || 2000;
  const topFirstAll = Array.isArray(datasetCache?.names) ? datasetCache.names.length : topFirstInput;
  const topLastAll = Array.isArray(datasetCache?.surnames) ? datasetCache.surnames.length : topLastInput;
  const topFirst = topFirstAll || topFirstInput;
  const topLast = topLastAll || topLastInput;
  await ensureDataset(topFirst, topLast);
  if (!firstIndex.find((entry) => (entry.name || '').toLowerCase() === lookupName)) {
    setStatus('Etunimeä ei löydy valitun top-listan joukosta');
    return;
  }
  ensureWorker().postMessage({ type: 'compute-first', weights, firstName: lookupName, topFirst, topLast });
}

function updateLoadMoreButtons() {
  const btn = $('#load-more-global');
  if (btn) {
    const hasMore = visiblePairs < currentPairs.length;
    btn.disabled = !hasMore;
    btn.hidden = !hasMore;
  }
}

function onLoadMoreGlobal() {
  visiblePairs = Math.min(currentPairs.length, visiblePairs + PAGE_SIZE);
  renderResults(currentPairs);
}

function openWeightModal() {
  weightModal = $('#ae-weight-editor');
  const prefill = new Map(weightEditorInputs.map((item) => [item.key, item.input.value]));
  renderWeightList(prefill);
  updateWeightStatus();
  if (weightModal) {
    weightModal.hidden = false;
    document.body.classList.add('modal-open');
  }
}

function closeWeightModal() {
  if (weightModal) {
    weightModal.hidden = true;
    document.body.classList.remove('modal-open');
  }
}

function renderWeightList(prefillMap) {
  const container = $('#ae-weight-list');
  if (!container) return;
  container.innerHTML = '';
  weightEditorInputs = [];
  MATCH_WEIGHT_FIELDS.forEach((meta) => {
    const key = meta.key;
    const row = document.createElement('div');
    row.className = 'weight-row';

    const header = document.createElement('div');
    header.className = 'weight-row-header';

    const legend = document.createElement('div');
    const labelEl = document.createElement('div');
    labelEl.className = 'weight-row-label';
    labelEl.textContent = meta?.label || key.replace(/_/g, ' ');
    legend.appendChild(labelEl);
    const descEl = document.createElement('p');
    descEl.className = 'weight-row-description';
    descEl.textContent = meta?.description || '';
    legend.appendChild(descEl);
    header.appendChild(legend);

    const inputWrap = document.createElement('div');
    inputWrap.className = 'weight-row-input';
    const inputEl = document.createElement('input');
    inputEl.type = 'number';
    inputEl.min = '-100';
    inputEl.max = '100';
    inputEl.step = '5';
    inputEl.inputMode = 'numeric';
    inputEl.dataset.key = key;
    const valueString =
      prefillMap && prefillMap.has(key)
        ? prefillMap.get(key)
        : formatPercentNumber(weightToPercent(weights[key] ?? normalizedDefault[key] ?? 0, weightPercentBudget));
    inputEl.value = valueString;
    inputEl.addEventListener('input', updateWeightStatus);
    inputWrap.appendChild(inputEl);
    const suffix = document.createElement('span');
    suffix.textContent = '%';
    inputWrap.appendChild(suffix);
    header.appendChild(inputWrap);
    row.appendChild(header);
    container.appendChild(row);
    weightEditorInputs.push({ key, input: inputEl, row });
  });
  updateWeightStatus();
}

function updateWeightStatus() {
  let total = 0;
  let hasInvalid = false;
  weightEditorInputs.forEach((item) => {
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
  const totalEl = $('#ae-weight-total');
  const remainingEl = $('#ae-weight-remaining');
  const saveBtn = $('#ae-weight-save');
  if (totalEl) totalEl.textContent = `Yhteensä ${total.toFixed(1)}% / 100%`;
  if (remainingEl) {
    remainingEl.textContent =
      balance > 0 ? `${balance.toFixed(1)}% jäljellä` : balance < 0 ? `${Math.abs(balance).toFixed(1)}% yli` : 'Tasapainossa';
  }
  const needsAdjustment = Math.abs(balance) > 0.05;
  if (saveBtn) saveBtn.disabled = hasInvalid || needsAdjustment;
}

function saveWeights() {
  const updated = { ...normalizedDefault };
  weightEditorInputs.forEach((item) => {
    const value = Number.parseFloat(item.input.value);
    if (!Number.isFinite(value)) return;
    updated[item.key] = percentToWeight(value, weightPercentBudget);
  });
  weights = normalizeWeightMap(updated);
  weightPercentBudget = computeAbsoluteWeightBudget(weights) || 1;
  persistSharedWeights(weights, normalizedDefault);
  closeWeightModal();
}

function resetWeights() {
  weights = { ...normalizedDefault };
  weightPercentBudget = computeAbsoluteWeightBudget(weights);
  renderWeightList();
  updateWeightStatus();
}

function updateFirstNameStatus() {
  const input = $('#first-name-input');
  const status = $('#first-name-status');
  if (!input || !status) return;
  if (!datasetReady || !firstIndex) {
    status.textContent = '';
    return;
  }
  const name = input.value.trim().toLowerCase();
  if (!name) {
    status.textContent = 'Jätä tyhjäksi, jos haluat etsiä parhaat parit kaikille etunimille.';
    return;
  }
  const source = Array.isArray(datasetCache?.names) ? datasetCache.names : firstIndex;
  const match = source?.find((entry) => (entry.name || '').toLowerCase() === name);
  if (!match) {
    status.textContent = 'Etunimeä ei löydy.';
    return null;
  }
  const count = match.popularity?.total || 0;
  status.textContent = `${formatNumber(count)} nimenkantajaa.`;
  return match;
}

function wireEvents() {
  const globalBtn = $('#compute-global');
  if (globalBtn) {
    globalBtn.addEventListener('click', () => {
      const name = ($('#first-name-input')?.value || '').trim();
      if (name) {
        onComputeForFirst(name);
      } else {
        onComputeGlobal();
      }
    });
  }
  const loadMoreGlobal = $('#load-more-global');
  if (loadMoreGlobal) {
    loadMoreGlobal.addEventListener('click', onLoadMoreGlobal);
  }
  const openWeightBtn = $('#open-weight-editor');
  if (openWeightBtn) openWeightBtn.addEventListener('click', openWeightModal);
  const modal = document.getElementById('ae-weight-editor');
  if (modal) {
    modal.querySelectorAll('[data-action="dismiss-ae-weight"],[data-action="ae-cancel"]').forEach((el) =>
      el.addEventListener('click', closeWeightModal)
    );
    const saveBtn = modal.querySelector('[data-action="ae-save"]');
    if (saveBtn) saveBtn.addEventListener('click', saveWeights);
    const resetBtn = modal.querySelector('[data-action="ae-reset"]');
    if (resetBtn) resetBtn.addEventListener('click', resetWeights);
    modal.addEventListener('click', (event) => {
      if (event.target === modal.querySelector('.modal-backdrop')) {
        closeWeightModal();
      }
    });
  }
  const firstInput = $('#first-name-input');
  if (firstInput) {
    firstInput.addEventListener('input', () => {
      updateFirstNameStatus();
    });
  }
  const orderToggle = $('#ae-toggle-order');
  if (orderToggle) {
    orderToggle.addEventListener('click', () => {
      orderDir = orderDir === 'desc' ? 'asc' : 'desc';
      updateOrderToggle();
      renderResults();
    });
    updateOrderToggle();
  }
}

async function init() {
  await loadMeta();
  await ensureDataset();
  updateFirstNameStatus();
  wireEvents();
  setStatus('Valmis. Paina laskentaa aloittaaksesi.');
}

document.addEventListener('DOMContentLoaded', init);
