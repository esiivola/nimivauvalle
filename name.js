import { createCardShell } from './shared-cards.js';
import { loadDataset } from './data-service.js';
import { createDetailService } from './detail-service.js';
import { createCardDetailLoader } from './name-detail-renderer.js';

const SITE_ORIGIN = 'https://nimivauvalle.fi';
const OG_IMAGE = `${SITE_ORIGIN}/assets/og-image.png`;

const DETAIL_T = {
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
  wikiUnavailable: 'Wikipedia-artikkelia ei löytynyt'
};

function getParamName() {
  const params = new URLSearchParams(window.location.search);
  return (params.get('name') || '').trim();
}

function genderWord(gender) {
  if (gender === 'female') return 'naisten';
  if (gender === 'male') return 'miesten';
  return 'henkilöiden';
}

function upsertMeta(selector, create) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  return el;
}

function setNamedMeta(name, content) {
  const el = upsertMeta(`meta[name="${name}"]`, () => {
    const m = document.createElement('meta');
    m.setAttribute('name', name);
    return m;
  });
  el.setAttribute('content', content);
}

function setPropMeta(property, content) {
  const el = upsertMeta(`meta[property="${property}"]`, () => {
    const m = document.createElement('meta');
    m.setAttribute('property', property);
    return m;
  });
  el.setAttribute('content', content);
}

function setCanonical(url) {
  const el = upsertMeta('link[rel="canonical"]', () => {
    const l = document.createElement('link');
    l.setAttribute('rel', 'canonical');
    return l;
  });
  el.setAttribute('href', url);
}

function applySeo(entry) {
  const display = entry.display || entry.name;
  const total = entry.popularity?.total;
  const canonical = `${SITE_ORIGIN}/name?name=${encodeURIComponent(display)}`;
  const countSentence =
    total != null ? ` Suomessa nimellä on noin ${total.toLocaleString('fi-FI')} kantajaa.` : '';
  const description =
    `${display} ${genderWord(entry.gender)} etunimenä: yleisyys, ikäjakauma, nimipäivä, ` +
    `ääntäminen ja suosion historia.${countSentence}`;
  const pageTitle = `${display} – etunimen tiedot ja yleisyys | Nimi vauvalle`;
  const ogTitle = `${display} – etunimen tiedot | Nimi vauvalle`;

  document.title = pageTitle;
  setNamedMeta('robots', 'index, follow');
  setNamedMeta('description', description);
  setCanonical(canonical);
  setPropMeta('og:title', ogTitle);
  setPropMeta('og:description', description);
  setPropMeta('og:url', canonical);
  setPropMeta('og:type', 'article');
  setPropMeta('og:image', OG_IMAGE);
  setNamedMeta('twitter:card', 'summary_large_image');
  setNamedMeta('twitter:title', ogTitle);
  setNamedMeta('twitter:description', description);
  setNamedMeta('twitter:image', OG_IMAGE);

  // Structured data: a WebPage about the given name + breadcrumb trail.
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebPage',
        '@id': canonical,
        url: canonical,
        name: pageTitle,
        description,
        inLanguage: 'fi-FI',
        isPartOf: { '@type': 'WebSite', name: 'Nimi vauvalle', url: `${SITE_ORIGIN}/` },
        about: { '@type': 'Thing', name: display, description: `${display} on etunimi.` }
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Etusivu', item: `${SITE_ORIGIN}/` },
          { '@type': 'ListItem', position: 2, name: display, item: canonical }
        ]
      }
    ]
  };
  let script = document.getElementById('name-jsonld');
  if (!script) {
    script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'name-jsonld';
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(ld);
}

function showStatus(container, message, withSearchLink) {
  container.innerHTML = '';
  const p = document.createElement('p');
  p.className = 'hint';
  p.textContent = message;
  container.appendChild(p);
  if (withSearchLink) {
    const link = document.createElement('p');
    link.innerHTML = '<a class="link-button" href="/">Siirry nimihakuun</a>';
    container.appendChild(link);
  }
}

async function init() {
  const container = document.getElementById('name-card-container');
  const heroTitle = document.getElementById('name-hero-title');
  const heroSubtitle = document.getElementById('name-hero-subtitle');
  const nameParam = getParamName();

  if (!nameParam) {
    showStatus(container, 'Nimeä ei annettu. Lisää osoitteeseen ?name=Nimi.', true);
    return;
  }

  let data;
  try {
    data = await loadDataset({
      includeSurnames: false,
      paths: {
        firstNames: '/data/first-names.json',
        lastNames: '/data/last-names.json',
        schema: '/data/schema.json'
      }
    });
  } catch (error) {
    showStatus(container, 'Nimitietojen lataus epäonnistui. Yritä myöhemmin uudelleen.', true);
    return;
  }

  const { names, schema } = data;
  const slug = nameParam.toLowerCase();
  const nameMap = new Map(names.map((entry) => [entry.name, entry]));
  let entry = nameMap.get(slug);
  if (!entry) {
    entry = names.find((item) => (item.display || '').toLowerCase() === slug) || null;
  }

  if (!entry) {
    heroTitle.textContent = nameParam;
    document.title = `${nameParam} – etunimeä ei löytynyt | Nimi vauvalle`;
    showStatus(
      container,
      `Nimeä “${nameParam}” ei löytynyt aineistosta. Tarkista kirjoitusasu tai etsi nimihaulla.`,
      true
    );
    return;
  }

  const display = entry.display || entry.name;
  heroTitle.textContent = display;
  if (heroSubtitle) {
    heroSubtitle.textContent =
      'Etunimen yleisyys, ikäjakauma, nimipäivä, ääntäminen ja suosion historia.';
  }

  const groupMeta = new Map((schema.groupFeatures || []).map((g) => [g.key, g]));
  const phoneticMeta = new Map((schema.phoneticFeatures || []).map((f) => [f.key, f]));
  const detailService = createDetailService(schema);
  const detailLoader = createCardDetailLoader({
    ensureEntryDetails: (item) => detailService.ensureEntryDetails(item),
    groupMeta,
    phoneticMeta,
    t: DETAIL_T,
    shouldShowAd: () => false
  });

  const card = createCardShell(entry, {
    t: {},
    onOpen: (cardEl, body, item) => detailLoader(cardEl, body, item, {})
  });
  // A standalone page has no surname context, so drop the empty match/combo pills.
  card.querySelectorAll('.summary-tags .tag-empty').forEach((el) => el.remove());

  container.innerHTML = '';
  container.appendChild(card);
  card.open = true;
  const body = card.querySelector('.name-card-body');
  detailLoader(card, body, entry, {});

  applySeo(entry);
}

init();
