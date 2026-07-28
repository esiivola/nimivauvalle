// All Finnish UI copy for the search page, kept in one place. Extracted verbatim
// from app.js. `translations.fi` is the only locale.

export const translations = {
  fi: {
    genders: {
      female: 'Nainen',
      male: 'Mies',
      unisex: 'Unisex',
      unknown: 'Tuntematon'
    },
    results: (start, end, total) => `Näytetään ${start}-${end} / ${total} nimeä`,
    noResults: 'Valituilla rajauksilla ei löytynyt yhtään nimeä.',
    match: (surname) => surname ? `Vauvan sukunimi on “${surname}”` : 'Sukunimiyhteensopivuus pois käytöstä',
    missingSurname: (surname) => `Sukunimeä “${surname}” ei löytynyt aineistosta - vertailu ohitettiin.`,
    matchLabel: 'Sukunimiosuvuus',
    grade: (label) => `Taso: ${label}`,
    historyTitle: 'Nimen suosio historiassa',
    historyLinkText: 'linkki',
    historyLegendMale: 'Miehiä',
    historyLegendFemale: 'Naisia',
    historyYAxis: '%-osuus annetuista nimistä',
    historyNoData: 'Ei historiallista käyttödataa',
    populationTag: (count) => `Arvio: ~${count} hlöä`,
    comboTag: (count) => {
      const rounded = Math.round(count);
      return rounded >= 1 ? `Täyskaimoja: ~${rounded} hlöä` : '';
    },
    comboLabel: 'Arvio valitun sukunimen kanssa',
    populationTitle: 'Arvioitu määrä Suomessa',
    populationTotalLabel: 'Yhteensä',
    populationShareLabel: 'Osuus väestöstä',
    populationNoData: 'Ei arviota',
    ageDistributionTitle: 'Ikäjakauma (arvio)',
    ageDistributionYAxis: 'Henkilöitä (arvio)',
    ageDistributionNoData: 'Ei ikäjakaumatietoa',
    surnameUsage: (count, rank) => `Sukunimeä käyttää ${count} henkilöä ja se on ${rank}:s yleisin.`,
    firstNameAnalysisTitle: 'Etunimen äänneprofiili',
    nameDayLabel: 'Nimipäivä',
    wikiTitle: 'Tietoa nimestä',
    wikiLoading: 'Haetaan Wikipedia-tiivistelmää…',
    wikiUnavailable: 'Wikipedia-artikkelia ei löytynyt',
    detailsLoading: 'Haetaan nimen tarkempia tietoja…',
    detailsError: 'Tietojen lataus epäonnistui.',
    pronunciationTitle: 'Ääntäminen',
    comboRowLabel: 'Täyskaimoja',
    comboRowNote: 'perustuu suku- ja etunimien yleisyyteen',
    groupTitle: 'Ryhmäjäsenyydet',
    phoneticTitle: 'Äännepiirteet',
    noGroupMembership: 'Ei ryhmäjäsenyyksiä',
    noPhoneticHighlights: 'Ei erityisiä piirteitä'
    ,
    filterSummary: {
      groupInclude: 'Vain tällaiset nimet',
      groupExclude: 'Poista tällaiset nimet',
      featureInclude: 'Nimessä oltava',
      featureExclude: 'Poistettava',
      featureMin: 'Vähintään taso',
      featureMax: 'Enintään taso',
      lettersInclude: 'Nimen tulee sisältää',
      lettersExclude: 'Nimessä ei saa olla',
      population: 'Nimenhaltijat'
    },
    weightEditor: {
      eyebrow: 'Tekoälyn käyttämät painotukset',
      title: 'Muokkaa tekoälyn painotuksia',
      description:
        'Kerro tekoälylle, minkälaisia nimiä haluat sen suosittelevan. Korkeammat positiiviset prosentit kertovat tekoälylle, että tämä asia on sinulle tärkeä. Negatiiviset prosentit saavat sen välttelemään sellaisia nimiä, joissa kuvailtu asia on voimakas. Voit tarkistaa sivun alalaidasta, kuinka paljon prosentteja sinun pitää vielä lisätä tai vähentää.',
      total: (value) => `Käytössä ${value.toFixed(1)} % / 100 %`,
      balance: (value) =>
        value > 0
          ? `Vapaana ${value.toFixed(1)} %`
          : value < 0
            ? `Ylittää ${Math.abs(value).toFixed(1)} %`
            : 'Täsmälleen 100 % käytetty',
      absRequirement: 'Painot on käytettävä tasan 100 %:iin asti.',
      invalid: 'Täytä kaikki prosenttikentät numeroin.',
      penaltyNote: 'Negatiiviset prosentit saavat tekoälyn välttelemään tällaisia nimiä',
      resetLabel: 'Palauta oletukset',
      cancelLabel: 'Peruuta',
      confirmLabel: 'OK'
    }
  }
};
