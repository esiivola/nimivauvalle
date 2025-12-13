import { loadDataset } from '../data-service.js';
import { createDetailService } from '../detail-service.js';
import { createCardShell } from '../shared-cards.js';
import { createCardDetailLoader } from '../name-detail-renderer.js';
import { buildSurnameData, findSurname } from '../surname-service.js';
import { loadMatchingModel, computePairScore as computeModelPairScore } from '../matching-model.js';
import { normalizeWeightMap } from '../weight-utils.js';

const DEFAULT_POPULATION_BASE = 5600000;
const DETAIL_T = {
  matchLabel: 'Sukunimiosuvuus',
  comboTag: (count) => `Täyskaimoja: ~${count}`,
  comboRowLabel: 'Täyskaimoja',
  comboRowNote: 'perustuu suku- ja etunimien yleisyyteen',
  detailsLoading: 'Haetaan nimen tietoja…',
  detailsError: 'Tietojen lataus epäonnistui.',
  traitsTitle: 'Ominaisuudet',
  historyTitle: 'Nimen suosio historiassa',
  historyLegendMale: 'Miehiä',
  historyLegendFemale: 'Naisia',
  historyYAxis: '%-osuus annetuista nimistä',
  historyNoData: 'Ei historiallista käyttödataa',
  ageDistributionTitle: 'Ikäjakauma (arvio)',
  ageDistributionNoData: 'Ei ikäjakaumatietoa',
  ageDistributionYAxis: 'Henkilöitä (arvio)',
  wikiTitle: 'Tietoa nimestä',
  wikiLoading: 'Haetaan Wikipedia-tiivistelmää…',
  wikiUnavailable: 'Wikipedia-artikkelia ei löytynyt',
  noGroupMembership: 'Ei ryhmäjäsenyyksiä'
};

const normalizeKey = (value) => (value || '').trim().toLowerCase();

function setStatus(text) {
  let status = document.getElementById('detail-status');
  if (!status) {
    if (!text) return;
    const container = document.getElementById('detail-content');
    if (!container) return;
    status = document.createElement('p');
    status.className = 'hint';
    status.id = 'detail-status';
    container.prepend(status);
  }
  status.textContent = text;
  status.hidden = !text;
}

async function maybeAnnotateSurname(entry, surnameEntry, populationBase, schema) {
  if (!entry || !surnameEntry) return;
  const surnameCount = Number(surnameEntry.popularity) || 0;
  const totalOwners = Number(entry.popularity?.total || 0);
  const base = Number(populationBase) || DEFAULT_POPULATION_BASE;
  const comboValue = surnameCount && totalOwners ? surnameCount * (totalOwners / base) : 0;
  entry._comboEstimate = comboValue >= 0.5 ? comboValue : null;

  try {
    const model = await loadMatchingModel();
    const weights = normalizeWeightMap(schema?.matching?.weights || {});
    const result = computeModelPairScore(entry, surnameEntry, weights, model);
    entry._match = result?.normalized ?? null;
  } catch {
    entry._match = null;
  }
}

export async function initDetailsPage() {
  const params = new URLSearchParams(window.location.search);
  const rawName = (params.get('name') || '').trim();
  const rawSurname = (params.get('surname') || '').trim();
  const titleEl = document.getElementById('detail-title');
  const subtitleEl = document.getElementById('detail-subtitle');
  const contentEl = document.getElementById('detail-content');

  if (!rawName) {
    setStatus('Lisää osoitteeseen ?name=Etunimi');
    if (subtitleEl) subtitleEl.textContent = 'Syötä nimi osoitteeseen, esim. /details/?name=Vilma';
    return;
  }

  setStatus('Ladataan tietoja…');
  try {
    const includeSurnames = Boolean(rawSurname);
    const dataset = await loadDataset({ includeSurnames });
    const populationBase = Number(dataset.populationTotal) || DEFAULT_POPULATION_BASE;
    const nameMap = new Map((dataset.names || []).map((entry) => [normalizeKey(entry.name), entry]));
    const entry = nameMap.get(normalizeKey(rawName));
    if (!entry) {
      setStatus(`Nimeä “${rawName}” ei löytynyt.`);
      if (subtitleEl) subtitleEl.textContent = 'Tarkista, että nimi on kirjoitettu oikein.';
      return;
    }

    document.title = `${entry.display || entry.name} | Nimi vauvalle`;
    if (titleEl) titleEl.textContent = entry.display || entry.name;
    if (subtitleEl) {
      subtitleEl.textContent = rawSurname
        ? `Nimitiedot ja yhteensopivuus sukunimen “${rawSurname}” kanssa`
        : 'Nimitiedot, suosiohistoria ja äännepiirteet';
    }

    const groupMeta = new Map((dataset.schema.groupFeatures || []).map((g) => [g.key, g]));
    const phoneticMeta = new Map((dataset.schema.phoneticFeatures || []).map((f) => [f.key, f]));
    const detailService = createDetailService(dataset.schema);

    let surnameEntry = null;
    if (rawSurname && includeSurnames) {
      const surnameData = buildSurnameData(dataset.surnames || []);
      surnameEntry = findSurname(surnameData.map, rawSurname);
      if (surnameEntry) {
        await maybeAnnotateSurname(entry, surnameEntry, populationBase, dataset.schema);
      }
    }

    const detailLoader = createCardDetailLoader({
      ensureEntryDetails: (nameEntry) => detailService.ensureEntryDetails(nameEntry),
      groupMeta,
      phoneticMeta,
      t: DETAIL_T,
      shouldShowAd: () => false
    });

    if (contentEl) {
      contentEl.innerHTML = '';
      const card = createCardShell(entry, { t: DETAIL_T, surnameEntry });
      card.open = true;
      const body = card.querySelector('.name-card-body');
      if (body) {
        detailLoader(card, body, entry, { surnameEntry });
      }
      contentEl.appendChild(card);
    }

    setStatus('');
  } catch (error) {
    console.error(error);
    setStatus('Tietojen lataus epäonnistui.');
  }
}
