// Builds the Finnish "trait" sentences that describe a name's phonetic profile.
// Used by the weight editor (to explain, per weight, what the typed surname is
// like) and available for any first/last-name analysis copy. Extracted verbatim
// from app.js so the generated wording stays identical.

const NEUTRAL_VOWEL_GAP = 0.08;
const SYLLABLE_SPLIT_REGEX = /[+-]+/;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function clampSigned(value) {
  if (!Number.isFinite(value)) return 0;
  return clamp(value, -1, 1);
}

function splitSyllableMarkers(value = '') {
  if (!value) return [];
  return value.split(SYLLABLE_SPLIT_REGEX).filter(Boolean);
}

function formatPercentShort(value) {
  if (!Number.isFinite(value)) {
    return '0%';
  }
  return `${Math.round(value * 100)}%`;
}

function formatSurnameQuote(name) {
  if (!name) return '';
  return `“${name}”`;
}

function convertRhythmPatternToRK(pattern = '') {
  if (!pattern) return '';
  return pattern.replace(/H/g, 'R').replace(/L/g, 'K');
}

function describeVowelLocationTrait({ metrics, name, mode, role }) {
  const front = metrics.front_ratio ?? 0;
  const back = metrics.back_ratio ?? 0;
  if (front <= 0 && back <= 0) return '';
  const frontPct = formatPercentShort(front);
  const backPct = formatPercentShort(back);
  const quoted = formatSurnameQuote(name);
  const hasName = Boolean(quoted);
  const roleName = role === 'first' ? 'Etunimi' : 'Sukunimi';
  const partnerName = role === 'first' ? 'sukunimet' : 'etunimet';
  if (mode === 'analysis') {
    if (front > back + 0.08) {
      return `${roleName} on etuvokaalinen (ä/ö/y), joten etuvokaalipainotteiset ${partnerName} kuulostavat luontevammilta.`;
    }
    if (back > front + 0.08) {
      return `${roleName} on takavokaalinen (a/o/u), joten takavokaalipainotteiset ${partnerName} kuulostavat luontevammilta.`;
    }
    return '';
  }
  if (front > back + 0.08) {
    return hasName
      ? `Sukunimessä ${quoted} korostuvat etuvokaalit (ä/ö/y) ${frontPct}.`
      : `Etuvokaalit (ä/ö/y) korostuvat ${frontPct}.`;
  }
  if (back > front + 0.08) {
    return hasName
      ? `Sukunimessä ${quoted} painottuvat takavokaalit (a/o/u) ${backPct}.`
      : `Takavokaalit (a/o/u) painottuvat ${backPct}.`;
  }
  return '';
}

function describeVowelOpennessTrait({ metrics, name, mode, role }) {
  const open = metrics.open_ratio ?? 0;
  const close = metrics.close_ratio ?? 0;
  if (open <= 0 && close <= 0) return '';
  const openPct = formatPercentShort(open);
  const closePct = formatPercentShort(close);
  const quoted = formatSurnameQuote(name);
  const hasName = Boolean(quoted);
  const roleName = role === 'first' ? 'Etunimessä' : 'Sukunimessä';
  const partnerName = role === 'first' ? 'sukunimessä' : 'etunimessä';
  if (mode === 'analysis') {
    if (open > close + NEUTRAL_VOWEL_GAP) {
      return `${roleName} on väljiä vokaaleja (a/e/o), joten nämä vokaalit kuulostavat hyviltä myös ${partnerName}.`;
    }
    if (close > open + NEUTRAL_VOWEL_GAP) {
      return `${roleName} on suppeita vokaaleja (i/u/y), joten nämä vokaalit kuulostavat hyviltä myös ${partnerName}.`;
    }
    return '';
  }
  if (open > close + NEUTRAL_VOWEL_GAP) {
    return hasName
      ? `Sukunimessä ${quoted} väljät vokaalit (a/e/o) hallitsevat ${openPct}.`
      : `Väljät vokaalit (a/e/o) hallitsevat ${openPct}.`;
  }
  if (close > open + NEUTRAL_VOWEL_GAP) {
    return hasName
      ? `Sukunimessä ${quoted} suppeat vokaalit (i/u/y) hallitsevat ${closePct}.`
      : `Suppeat vokaalit (i/u/y) hallitsevat ${closePct}.`;
  }
  return hasName
    ? `Sukunimessä ${quoted} vokaalien avaruus on tasainen (väljiä ${openPct}, suppeita ${closePct}).`
    : `Vokaalien avaruus on tasainen (väljiä ${openPct}, suppeita ${closePct}).`;
}

function describeSoftnessTrait({ metrics, name, mode, role }) {
  const soft = metrics.soft_ratio ?? 0;
  if (soft <= 0) return '';
  const softPct = formatPercentShort(soft);
  const hardPct = formatPercentShort(Math.max(0, 1 - soft));
  const quoted = formatSurnameQuote(name);
  const hasName = Boolean(quoted);
  if (mode === 'analysis') {
    const roleName = role === 'first' ? 'Etunimi' : 'Sukunimi';
    const partnerName = role === 'first' ? 'sukunimessä' : 'etunimessä';
    if (soft > 0.6) {
      return `Pehmeät konsonantit (m/n/l/r/j) hallitsevat, joten suosi samoja konsonantteja myös ${partnerName}.`;
    }
    if (soft < 0.4) {
      return `Kovat konsonantit (p/t/k/b/d) hallitsevat, joten suosi samoja konsonatteja myös ${partnerName}.`;
    }
    return '';
  }
  return hasName
    ? `Sukunimessä ${quoted} on pehmeitä konsonanttiäänteitä (m/n/l/r/j) on ${softPct} ja kovia ${hardPct}.`
    : `Pehmeitä konsonanttiäänteitä (m/n/l/r/j) on ${softPct} ja kovia ${hardPct}.`;
}

function describeToneTrait({ metrics, name, mode, role }) {
  if (metrics.valence == null) return '';
  const tone = clampSigned(metrics.valence);
  const pct = `${Math.round(Math.abs(tone) * 100)} %`;
  const quoted = formatSurnameQuote(name);
  const hasName = Boolean(quoted);
  if (mode === 'analysis') {
    const roleName = role === 'first' ? 'Etunimessä' : 'Sukunimessä';
    const partnerName = role === 'first' ? 'sukunimessä' : 'etunimessä';
    if (Math.abs(tone) < 0.1) {
      return '';
    }
    if (tone > 0) {
      return `${roleName} on terävän kuuloisia kirjaimia (k/t/s/p/i), joten suosi samoja kirjaimia ${partnerName}.`;
    }
    return `${roleName} on lämpimän kuuloisia kirjaimia (u/o/m/a/n), joten suosi samoja kirjaimia ${partnerName}.`;
  }
  if (Math.abs(tone) < 0.1) {
    return hasName
      ? `Sukunimen ${quoted} sävy pysyy neutraalina.`
      : 'Sävy pysyy neutraalina.';
  }
  if (tone > 0) {
    return hasName
      ? `Sukunimen ${quoted} sävy on ${pct} kirkas ja sähäkkä.`
      : `Sävy on ${pct} kirkas ja sähäkkä.`;
  }
  return hasName
    ? `Sukunimen ${quoted} sävy on ${pct} rauhallinen ja lämmin.`
    : `Sävy on ${pct} rauhallinen ja lämmin.`;
}

function describeRhythmicPatternTrait({ entry, name, mode, role }) {
  const pattern = entry?.rhythm_sequence;
  if (!pattern) return '';
  const roleName = role === 'first' ? 'Etunimi' : 'Sukunimi';
  const partnerName = role === 'first' ? 'sukunimessä' : 'etunimessä';
  const rkPattern = convertRhythmPatternToRK(pattern);
  const preview = rkPattern.length > 12 ? `${rkPattern.slice(0, 12)}…` : rkPattern;
  if (mode === 'analysis') {
    return `${roleName} on rytmikuvioltaan ${preview}.`;
  }
  const quoted = formatSurnameQuote(name);
  if (quoted) {
    return `${quoted} rytmikuvio on ${preview}`;
  }
  return `Rytmikuvio: ${preview}`;
}

function describeLengthTrait({ metrics, entry, name, mode, role }) {
  const fallbackLetters = (entry.display || '').replace(/[^A-Za-zÅÄÖåäöA-Za-zÀ-ÿ]/g, '').length || 0;
  const letters = Math.round((metrics.length ?? fallbackLetters) || 0);
  const syllableCount = Math.round(
    metrics.syllables ?? (entry.ipa?.syllables ? splitSyllableMarkers(entry.ipa.syllables).length : 0)
  );
  if (!letters && !syllableCount) return '';
  const quoted = formatSurnameQuote(name);
  const hasName = Boolean(quoted);
  if (mode === 'analysis') {
    const roleName = role === 'first' ? 'Etunimi' : 'Sukunimi';
    const partnerName = role === 'first' ? 'sukunimet' : 'etunimet';
    if (syllableCount >= 4 || letters >= 9) {
      return `${roleName} on pitkä, joten lyhyemmät ${partnerName}  tasapainottavat kokonaisuutta.`;
    }
    if (syllableCount <= 2 || letters <= 5) {
      return `${roleName} on lyhyt, joten pidemmät ${partnerName} tasapainottavat kokonaisuutta.`;
    }
    return `${roleName} on keskipitkä, joten kaikenpituiset ${partnerName} sopivat.`;
  }
  const baseText = `${letters} kirjainta / ${syllableCount || '-'} tavua`;
  if (syllableCount >= 4 || letters >= 9) {
    return hasName
      ? `Sukunimi ${quoted} on pitkä (${baseText}), joten lyhyempi etunimi voi tasapainottaa.`
      : `Sukunimi on pitkä (${baseText}), joten lyhyempi etunimi voi tasapainottaa.`;
  }
  if (syllableCount <= 2 || letters <= 5) {
    return hasName
      ? `Sukunimi ${quoted} on lyhyt (${baseText}), joten pidempi etunimi voi tasapainottaa.`
      : `Sukunimi on lyhyt (${baseText}), joten pitkä etunimi voi tasapainottaa.`;
  }
  return hasName
    ? `Sukunimi ${quoted} on keskimitainen (${baseText}).`
    : `Sukunimi on keskimitainen (${baseText}).`;
}

export function buildSurnameTraitSentences(entry, mode = 'analysis', role = 'surname', overrideName = null) {
  if (!entry) return [];
  const metrics = entry.metrics || {};
  const simple = entry.ipa?.simple || entry.display || entry.name || '';
  const context = {
    entry,
    metrics,
    name: overrideName || entry.display || entry.name || '',
    mode,
    simple,
    role
  };
  const results = [];
  const builders = [
    { key: 'vowel_location', fn: describeVowelLocationTrait },
    { key: 'vowel_openess', fn: describeVowelOpennessTrait },
    { key: 'softness', fn: describeSoftnessTrait },
    { key: 'tone', fn: describeToneTrait },
    { key: 'rhythm', fn: describeRhythmicPatternTrait },
    { key: 'length', fn: describeLengthTrait }
  ];
  builders.forEach(({ key, fn }) => {
    const text = fn(context);
    if (text) {
      results.push({ key, text });
    }
  });
  return results;
}
