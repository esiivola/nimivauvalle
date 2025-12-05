import { computeBuckets } from './matching-model.js';

const COMPONENT_LABELS = {
  vowel_location: 'Vokaaliharmonia',
  vowel_openess: 'Vokaalien avoimuus',
  softness: 'Konsonanttien pehmeys',
  tone: 'Sävy (bouba/kiki)',
  rhythm: 'Rytmi',
  length: 'Pituus',
  syllables: 'Tavujen määrä',
  head_transition: 'Etunimen aloitusäänne',
  end_start_transition: 'Etunimen loppu + sukunimen alku'
};

const FINNISH_ORDER = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z', 'å', 'ä', 'ö'];
const PHONEME_MAP = {
  æ: 'ä',
  ø: 'ö',
  å: 'o',
  ɑ: 'a',
  ü: 'y',
  ï: 'i',
  í: 'i',
  è: 'e',
  é: 'e',
  ê: 'e',
  ë: 'e',
  ò: 'o',
  ó: 'o',
  ô: 'o',
  õ: 'o',
  ù: 'u',
  ú: 'u',
  ʋ: 'v',
  ŋ: 'n',
  ɱ: 'm',
  ʃ: 's',
  ç: 'k',
  ɦ: 'h',
  ķ: 'k',
  w: 'v'
};

function normalizePhonemeChar(ch) {
  if (!ch) return '';
  const mapped = PHONEME_MAP[ch] || ch;
  const lower = mapped.toLowerCase();
  return FINNISH_ORDER.includes(lower) ? lower : '';
}

function groupToLetters(groupStr) {
  if (!groupStr) return [];
  const letters = [];
  for (const ch of Array.from(groupStr)) {
    const norm = normalizePhonemeChar(ch);
    if (!norm) continue;
    if (!letters.includes(norm)) {
      letters.push(norm);
    }
  }
  return letters.sort((a, b) => FINNISH_ORDER.indexOf(a) - FINNISH_ORDER.indexOf(b));
}

function formatLetters(groupStr) {
  const letters = groupToLetters(groupStr);
  if (!letters.length && groupStr) return groupStr;
  return letters.join('/');
}

const HINTS = {
  vowel_location: {
    front_dominant: { phrase: 'paljon etuvokaaleja', letters: 'ä, ö, y' },
    back_dominant: { phrase: 'paljon takavokaaleja', letters: 'a, o, u' },
    front_neutral: { phrase: 'etuvokaaleja ja neutraaleja', letters: 'ä, ö, y + e, i' },
    back_neutral: { phrase: 'takavokaaleja ja neutraaleja', letters: 'a, o, u + e, i' },
    neutral_only: { phrase: 'vain neutraaleja vokaaleja', letters: 'e, i' },
    mixed: { phrase: 'sekamuoto etu- ja takavokaaleja', letters: 'a/o/u + ä/ö/y' }
  },
  vowel_openess: {
    open_dominant: { phrase: 'väljiä vokaaleja', letters: 'a, ä' },
    close_dominant: { phrase: 'suppeat vokaalit', letters: 'i, y, u' },
    open_mid: { phrase: 'väljiä ja puoliväljiä', letters: 'a/ä + e/ö/o' },
    close_mid: { phrase: 'suppeat ja puoliväljiä', letters: 'i/y/u + e/ö/o' },
    neutral_only: { phrase: 'vain keskivokaaleja', letters: 'e, ö, o' },
    mixed: { phrase: 'sekamuoto avoimia ja suppeita', letters: 'a/ä + i/y/u + e/ö/o' }
  },
  softness: {
    soft_only: { phrase: 'pelkkiä pehmeitä konsonantteja', letters: 'm, n, l, r, j, v' },
    softish: { phrase: 'enimmäkseen pehmeitä konsonantteja', letters: 'm, n, l, r, j, v' },
    hardish: { phrase: 'hieman kovia konsonantteja', letters: 'k, t, p, s, f, h' },
    hard_only: { phrase: 'paljon kovia konsonantteja', letters: 'k, t, p, s, f, h' },
    balanced: { phrase: 'tasapaino pehmeiden ja kovien välillä', letters: 'm/n/l/r/j/v + k/t/p/s/f/h' }
  },
  tone: {
    very_warm: { phrase: 'pehmeä, pyöreä sävy', letters: 'm, n, o, u, a, ö' },
    warm: { phrase: 'melko pehmeä sävy', letters: 'm, n, o, u, a' },
    neutral: { phrase: 'neutraali sävy', letters: 'e, i, l' },
    bright: { phrase: 'terävä kiki-sävy', letters: 'k, t, s, p' },
    very_bright: { phrase: 'erittäin terävä kiki-sävy', letters: 'k, t, s, f' }
  },
  rhythm: {
    default: { phrase: 'alkurytmi R/K-tavuina', letters: '' }
  }
};

export function friendlyBucket(component, bucket, role) {
  if (!bucket) return { phrase: '', letters: '' };
  const hint = HINTS[component]?.[bucket] || HINTS[component]?.default;
  if (hint) return hint;
  if (component === 'length') return { phrase: `${bucket} merkkiä`, letters: '' };
  if (component === 'syllables') return { phrase: `${bucket} tavua`, letters: '' };
  if (component === 'rhythm') {
    const words = bucket
      .split('')
      .map((c) => (c === 'R' ? 'pitkän kuuloinen tavu' : 'lyhyen kuuloinen tavu'))
      .join(' – ');
    return { phrase: words ? `tavut etenevät: ${words}` : '', letters: '' };
  }
  if (component === 'head_transition') {
    const letters = formatLetters(bucket);
    return { phrase: `alkaa kirjaimilla ${letters}`, letters };
  }
  if (component === 'end_start_transition') {
    const letters = formatLetters(bucket);
    return { phrase: `päättyy kirjaimiin ${letters}`, letters };
  }
  return { phrase: bucket.replace('_', ' '), letters: '' };
}

function probToScore(prob, base) {
  const eps = 1e-9;
  const ratio = (prob + eps) / (base + eps);
  const score = Math.tanh(Math.log(ratio));
  return Math.max(-1, Math.min(1, score));
}

const MIN_PROB_FOR_EXPLAIN = 0.01;

function bestAndWorstForObs(component, obsValue, model) {
  const table = model?.tables?.[component] || {};
  const baseline = model?.baselines?.[component] || {};
  const baseProb = baseline[obsValue] ?? 1e-6;
  const rows = Object.entries(table).filter(([k]) => k !== '_default');
  const scored = rows
    .map(([cond, row]) => {
      const p = row?.[obsValue] ?? 0;
      return {
        cond,
        score: probToScore(p || baseProb, baseProb),
        prob: p
      };
    })
    .filter((item) => item.prob >= MIN_PROB_FOR_EXPLAIN);
  scored.sort((a, b) => b.score - a.score);
  return {
    best: scored[0] || null,
    worst: scored[scored.length - 1] || null
  };
}

function bestAndWorstForCond(component, condValue, model) {
  const table = model?.tables?.[component]?.[condValue];
  const baseline = model?.baselines?.[component] || {};
  if (!table) return { best: null, worst: null };
  const scored = Object.entries(table)
    .map(([obs, prob]) => ({
      obs,
      score: probToScore(prob, baseline[obs] ?? 1e-6),
      prob
    }))
    .filter((item) => item.prob >= MIN_PROB_FOR_EXPLAIN);
  scored.sort((a, b) => b.score - a.score);
  return {
    best: scored[0] || null,
    worst: scored[scored.length - 1] || null
  };
}

function topCondForObs(component, obsValue, model, tolerance = 0.1, maxItems = 3) {
  const table = model?.tables?.[component] || {};
  const rows = Object.entries(table).filter(([k]) => k !== '_default');
  if (!rows.length) return [];
  const scored = rows
    .map(([cond, row]) => {
      const prob = row?.[obsValue] ?? 0;
      return { cond, prob };
    })
    .filter((item) => item.prob >= MIN_PROB_FOR_EXPLAIN);
  scored.sort((a, b) => b.prob - a.prob);
  const bestProb = scored[0]?.prob ?? 0;
  return scored.filter((item) => item.prob >= bestProb * (1 - tolerance)).slice(0, maxItems);
}

function topObsForCond(component, condValue, model, tolerance = 0.1, maxItems = 3) {
  const table = model?.tables?.[component]?.[condValue];
  if (!table) return [];
  const scored = Object.entries(table)
    .map(([obs, prob]) => ({ obs, prob }))
    .filter((item) => item.prob >= MIN_PROB_FOR_EXPLAIN);
  scored.sort((a, b) => b.prob - a.prob);
  const bestProb = scored[0]?.prob ?? 0;
  return scored.filter((item) => item.prob >= bestProb * (1 - tolerance)).slice(0, maxItems);
}

function formatOptions(list) {
  if (!list.length) return '';
  const parts = list.map((item) => formatLetters(item));
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} tai ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')} tai ${parts.slice(-1)}`;
}

export function buildExplanation(entry, role, model) {
  if (!entry || !model) return [];
  const buckets = computeBuckets(entry, entry);
  const components = [
    'vowel_location',
    'vowel_openess',
    'softness',
    'tone',
    'rhythm',
    // length omitted to avoid conflicting guidance; syllables covers it
    'syllables',
    'head_transition',
    'end_start_transition'
  ];
  const surnameStart = (entry.display || entry.name || '').trim().charAt(0).toLowerCase();
  return components.map((component) => {
    const obsKey = `${component}_obs`;
    const condKey = `${component}_cond`;
    const obsVal = buckets[obsKey];
    const condVal = buckets[condKey];
    const label = COMPONENT_LABELS[component] || component;
    const isTransition = component === 'head_transition' || component === 'end_start_transition';
    if (role === 'first') {
      const picks = bestAndWorstForObs(component, obsVal, model);
      const bestCond = picks.best?.cond || condVal || '';
      const own = friendlyBucket(component, obsVal, role);
      const target = friendlyBucket(component, bestCond, 'last');
      const targetPhrase = target.phrase || 'ovat samantyyppisiä';
      if (isTransition) {
        const topConds = topCondForObs(component, obsVal, model);
        const options = formatOptions(topConds.map((item) => item.cond));
        const action =
          component === 'head_transition'
            ? `Sukunimet jotka alkavat ${options || formatLetters(bestCond)}`
            : `Sukunimet jotka alkavat ${options || formatLetters(bestCond)}`;
        return {
          label,
          text: `Etunimi on ${own.phrase}. Se sopii parhaiten sukunimien kanssa, jotka ${action}.`
        };
      }
      return {
        label,
        text: `Etunimi on ${own.phrase}. Se toimii parhaiten sukunimien kanssa, jotka ${targetPhrase}${target.letters ? ` (esim. ${target.letters})` : ''}.`
      };
    }
    const picks = bestAndWorstForCond(component, condVal, model);
    const bestObs = picks.best?.obs || obsVal || '';
    const own = friendlyBucket(component, condVal, role);
    if (isTransition) {
      const topObs = topObsForCond(component, condVal, model);
      const options = formatOptions(topObs.map((item) => item.obs)) || formatLetters(bestObs);
      const startLetter = surnameStart || '';
      if (component === 'head_transition') {
        return {
          label,
          text: `Sukunimi alkaa kirjaimella "${startLetter}". Etunimi toimii parhaiten, jos se alkaa äänteellä ${options}.`
        };
      }
      return {
        label,
        text: `Sukunimi alkaa kirjaimella "${startLetter}". Etunimi toimii parhaiten, jos se päättyy äänteeseen ${options}, jolloin siirtymä sukunimeen on luonteva.`
      };
    }
    if (component === 'rhythm') {
      const topObs = topObsForCond(component, condVal, model);
      const describePattern = (pat) =>
        pat
          ? pat
              .split('')
              .map((c) => (c === 'R' ? 'pitkän kuuloinen tavu' : 'lyhyen kuuloinen tavu'))
              .join(' – ')
          : '';
      const options = topObs
        .map((item) => describePattern(item.obs))
        .filter(Boolean)
        .slice(0, 3)
        .join('; ');
      const own = describePattern(condVal);
      return {
        label,
        text: `Sukunimen tavurytmi on ${own || 'tasainen'}. Valitse etunimi, jossa tavujen pituudet (pitkä/lyhyt) ovat samankaltaisessa suhteessa ja pituus lähellä tätä – esimerkiksi ${options || 'pitkä–lyhyt tai lyhyt–pitkä vuorottelu'}. Tämä tekee nimestä luonnollisen.`
      };
    }
    const target = friendlyBucket(component, bestObs, 'first');
    const targetPhrase = target.phrase || 'kuulostavat samantyyppisiltä';
    return {
      label,
      text: `Sukunimi on ${own.phrase}. Malli suosii etunimiä, joissa ${targetPhrase}${target.letters ? ` (esim. ${target.letters})` : ''}.`
    };
  });
}
