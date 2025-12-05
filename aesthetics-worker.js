/* eslint-disable no-restricted-globals */
import { loadMatchingModel, computePairScore, selectTopEntries } from './matching-model.js';
import { DEFAULT_DATA_PATHS, loadDataset } from './data-service.js';

let model = null;
let firstEntries = [];
let lastEntries = [];
let currentTopFirst = 0;
let currentTopLast = 0;

async function ensureData(topFirst = 3000, topLast = 3000) {
  if (!model) {
    model = await loadMatchingModel();
  }
  if (firstEntries.length && lastEntries.length && currentTopFirst === topFirst && currentTopLast === topLast) {
    return;
  }
  const dataset = await loadDataset({ includeSurnames: true, paths: DEFAULT_DATA_PATHS });
  const { names, surnames } = dataset;
  currentTopFirst = topFirst;
  currentTopLast = topLast;
  firstEntries = selectTopEntries(names, topFirst, (entry) => entry?.popularity?.total || 0);
  lastEntries = selectTopEntries(surnames, topLast, (entry) => entry?.popularity || 0);
}

function normalizeWeights(weights) {
  const result = {};
  let total = 0;
  Object.entries(weights || {}).forEach(([key, value]) => {
    const num = Number(value) || 0;
    result[key] = num;
    total += Math.abs(num);
  });
  if (total > 0) {
    Object.keys(result).forEach((key) => {
      result[key] = result[key] / total;
    });
  }
  return result;
}

function pushTop(heap, item, limit) {
  heap.push(item);
  let idx = heap.length - 1;
  while (idx > 0) {
    const parent = Math.floor((idx - 1) / 2);
    if (heap[parent].score <= heap[idx].score) break;
    [heap[parent], heap[idx]] = [heap[idx], heap[parent]];
    idx = parent;
  }
  if (heap.length > limit) {
    heap[0] = heap.pop();
    // heapify down
    let i = 0;
    while (true) {
      const l = 2 * i + 1;
      const r = l + 1;
      let smallest = i;
      if (l < heap.length && heap[l].score < heap[smallest].score) smallest = l;
      if (r < heap.length && heap[r].score < heap[smallest].score) smallest = r;
      if (smallest === i) break;
      [heap[i], heap[smallest]] = [heap[smallest], heap[i]];
      i = smallest;
    }
  }
}

function heapToSortedDesc(heap) {
  return heap.sort((a, b) => b.score - a.score);
}

async function computeBestPairs(weightsIn, topK, topFirst, topLast) {
  await ensureData(topFirst, topLast);
  const weights = normalizeWeights(weightsIn || {});
  const heap = [];
  for (let firstId = 0; firstId < firstEntries.length; firstId += 1) {
    const first = firstEntries[firstId];
    for (let lastId = 0; lastId < lastEntries.length; lastId += 1) {
      const last = lastEntries[lastId];
      const result = computePairScore(first, last, weights, model);
      const score = result ? result.normalized : 0;
      pushTop(heap, { firstId, lastId, score }, topK);
    }
    if (firstId % 50 === 0) {
      postMessage({ type: 'progress', value: firstId + 1, total: firstEntries.length });
    }
  }
  return heapToSortedDesc(heap);
}

async function computeBestForFirst(weightsIn, firstName, topK) {
  await ensureData(currentTopFirst, currentTopLast);
  const targetId = firstEntries.findIndex((entry) => entry.name === firstName.toLowerCase());
  const target = targetId >= 0 ? firstEntries[targetId] : null;
  if (!target) {
    throw new Error('First name not found in precomputed set');
  }
  const weights = normalizeWeights(weightsIn || {});
  const pairs = lastEntries
    .map((last, lastId) => {
      const result = computePairScore(target, last, weights, model);
      return { firstId: targetId, lastId, score: result ? result.normalized : 0 };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
  return pairs;
}

self.onmessage = async (event) => {
  const { type, weights, topK = 5000, firstName, topFirst = 3000, topLast = 3000 } = event.data || {};
  try {
    await ensureData(topFirst, topLast);
    if (type === 'compute-best') {
      const pairs = await computeBestPairs(weights, topK, topFirst, topLast);
      postMessage({ type: 'result', pairs });
    } else if (type === 'compute-first') {
      const pairs = await computeBestForFirst(weights, firstName, Math.min(topK, 300));
      postMessage({ type: 'result', pairs });
    }
  } catch (err) {
    postMessage({ type: 'error', message: err?.message || String(err) });
  }
};
