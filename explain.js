import { loadDataset } from './data-service.js';
import { loadMatchingModel } from './matching-model.js';
import { buildExplanation } from './explain-utils.js';

const ROLE_FIRST = 'first';
const ROLE_LAST = 'last';

let dataset = null;
let model = null;

const componentLabels = {
  vowel_location: 'Vokaalien sijainti',
  vowel_openess: 'Vokaalien avaruus',
  softness: 'Pehmeys',
  tone: 'Sointisävy (bouba/kiki)',
  rhythm: 'Rytmi',
  length: 'Pituus',
  syllables: 'Tavujen määrä',
  head_transition: 'Alkuäänne → alkuäänne',
  end_start_transition: 'Loppuäänne → alkuäänne'
};

function $(sel) {
  return document.querySelector(sel);
}

function ratioText(bucket) {
  if (!bucket) return '';
  const [a, b] = bucket.split('-');
  if (a == null || b == null) return bucket;
  return `${Math.round(parseFloat(a) * 100)}–${Math.round(parseFloat(b) * 100)}%`;
}

function describeBucket(component, value, role) {
  switch (component) {
    case 'vowel_location':
      if (value === 'front') return 'etuvokaalivoittoinen';
      if (value === 'back') return 'takavokaalivoittoinen';
      return 'sekoitus etu- ja takavokaaleja';
    case 'vowel_openess':
      return `vokaalien avoimuus ${ratioText(value)}`;
    case 'softness':
      return `pehmeitä konsonantteja ${ratioText(value)}`;
    case 'tone': {
      const map = { vlow: 'erittäin lämmin', low: 'lämmin', mid: 'neutraali', high: 'kirpeä', vhigh: 'erittäin kirpeä' };
      return map[value] || value;
    }
    case 'rhythm': {
      const [len, weight] = String(value || '').split(':');
      const weightMap = { light: 'kevytrakenteinen', mixed: 'vaihteleva', heavy: 'painokas' };
      return `${len || '?'} tavua, ${weightMap[weight] || weight || ''}`.trim();
    }
    case 'length':
      return `pituus ${value} merkkiä`;
    case 'syllables':
      return `${value} tavua`;
    case 'head_transition':
    case 'end_start_transition':
      return role === ROLE_FIRST ? `antaa aloitusryhmän ${value}` : `suosii aloitusryhmää ${value}`;
    default:
      return value;
  }
}

function probToScore(prob, base) {
  const eps = 1e-9;
  const ratio = (prob + eps) / (base + eps);
  const score = Math.tanh(Math.log(ratio));
  return Math.max(-1, Math.min(1, score));
}

function bestAndWorstForObs(component, obsValue) {
  const table = model?.tables?.[component] || {};
  const baseline = model?.baselines?.[component] || {};
  const baseProb = baseline[obsValue] ?? 1e-6;
  const rows = Object.entries(table).filter(([k]) => k !== '_default');
  const scored = rows.map(([cond, row]) => ({
    cond,
    score: probToScore(row?.[obsValue] ?? baseProb, baseProb)
  }));
  scored.sort((a, b) => b.score - a.score);
  return {
    best: scored[0],
    worst: scored[scored.length - 1]
  };
}

function bestAndWorstForCond(component, condValue) {
  const table = model?.tables?.[component]?.[condValue];
  const baseline = model?.baselines?.[component] || {};
  if (!table) return { best: null, worst: null };
  const scored = Object.entries(table).map(([obs, prob]) => ({
    obs,
    score: probToScore(prob, baseline[obs] ?? 1e-6)
  }));
  scored.sort((a, b) => b.score - a.score);
  return {
    best: scored[0],
    worst: scored[scored.length - 1]
  };
}

function explainComponent(component, buckets, role) {
  const label = componentLabels[component] || component;
  const obsKey = `${component}_obs`;
  const condKey = `${component}_cond`;
  const obsVal = buckets[obsKey];
  const condVal = buckets[condKey];
  if (role === ROLE_FIRST) {
    const picks = bestAndWorstForObs(component, obsVal);
    return {
      label,
      text: `Koska nimi on ${describeBucket(component, obsVal, role)}, parhaat pisteet tulee nimistä joissa on ${describeBucket(component, picks.best?.cond, ROLE_LAST)}; heikoimmat ${describeBucket(component, picks.worst?.cond, ROLE_LAST)}.`
    };
  }
  const picks = bestAndWorstForCond(component, condVal);
  return {
    label,
    text: `Koska nimi on ${describeBucket(component, condVal, role)}, parhaat pisteet antaa etunimille jotka ovat ${describeBucket(component, picks.best?.obs, ROLE_FIRST)}; heikoimmat ${describeBucket(component, picks.worst?.obs, ROLE_FIRST)}.`
  };
}

function renderExplanation(entry, role) {
  const container = $('#explanation');
  container.innerHTML = '';
  if (!entry || !model) {
    container.textContent = 'Nimiä ei löydy.';
    return;
  }
  const explanations = buildExplanation(entry, role, model);
  explanations.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'card';
    const h = document.createElement('h3');
    h.textContent = item.label;
    const p = document.createElement('p');
    p.textContent = item.text;
    card.appendChild(h);
    card.appendChild(p);
    container.appendChild(card);
  });
}

function findEntry(name, role) {
  if (!dataset) return null;
  const pool = role === ROLE_FIRST ? dataset.names : dataset.surnames;
  const lower = name.trim().toLowerCase();
  return pool.find((e) => e.name === lower);
}

async function onInputChange() {
  const nameInput = $('#name-input');
  const role = document.querySelector('input[name="role"]:checked')?.value || ROLE_FIRST;
  const name = nameInput?.value || '';
  if (!name.trim()) {
    $('#explanation').textContent = 'Syötä nimi.';
    return;
  }
  const entry = findEntry(name, role);
  if (!entry) {
    $('#explanation').textContent = 'Nimeä ei löydy valituista nimistä.';
    return;
  }
  renderExplanation(entry, role);
}

async function init() {
  dataset = await loadDataset({ includeSurnames: true });
  model = await loadMatchingModel();
  $('#name-input')?.addEventListener('input', onInputChange);
  document.querySelectorAll('input[name="role"]').forEach((el) => el.addEventListener('change', onInputChange));
  onInputChange();
}

document.addEventListener('DOMContentLoaded', init);
