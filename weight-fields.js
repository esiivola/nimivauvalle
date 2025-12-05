export const MATCH_WEIGHT_FIELDS = [
  {
    key: 'vowel_location',
    label: 'Vokaaliharmonia nimien välillä',
    description:
      'Tekoäly ei yhdistä etu- (ä/ö/y) ja takavokaalipainotteisia (a/o/u) nimiä. Kieli on vokaaliäänteissä suun etu- tai takaosassa ja nopea kielen siirtymä on vaikea, esim. Heta Äijälä on esimerkki nimestä, jossa kieli joutuu liikkumaan nopeasti suun etuosasta suun takaosaan.'
  },
  {
    key: 'vowel_openess',
    label: 'Vokaalien avaruuden erot',
    description:
      'Tekoäly ei yhdistä väljiä (e/o/a) ja suppeita (i/u/y) vokaaleja sisältäviä nimiä. Kieli on vokaaliäänteissä suun ylä- tai alaosassa ja tämä vaikuttaa erityisesti sanojen korkeuteen, esim. Ninni ja Anne lausutaan eri korkeuksilta.'
  },
  {
    key: 'softness',
    label: 'Konsonanttien pehmeys',
    description:
      'Tekoäly ei yhdistä pehmeitä (m/n/l/r/j) ja kovia (p/t/k/b/d) konsonanttiäänteitä sisältäviä nimiä. Nimet, joissa on paljon pehmeitä konsonantteja, voivat kuulostaa lempeämmiltä verrattuna nimiin, joissa on enemmän kovia konsonantteja ja ristiriita voi kuulostaa oudolta. Esim. nimen Tapio Luoma etunimi kuulostaa kovalta, mutta sukunimi pehmeältä.'
  },
  {
    key: 'tone',
    label: 'Sävy (bouba/kiki -efekti)',
    description:
      'Nimen sävy voi kuulostaa rauhalliselta ja lämpimältä (u/o/m/a/n) tai terävältä ja kovalta (k/t/s/p/i). Esim. nimen Mauno Sipilä etunimi kuulostaa rauhalliselta, mutta sukunimi on terävämpi. Tekoäly ei yhdistä nimiä, joista toinen on rauhallinen ja lämmin, ja toinen terävä ja kova'
  },
  {
    key: 'rhythm',
    label: 'Rytmi',
    description:
      'Tekoäly vertaa etu- ja sukunimien tavujen rytmiä. Tavut jaetaan raskaisiin (R = raskas, jos tavussa on kaksi peräkkäistä vokaalia tai se päättyy konsonattiin, esim. "Aa"(-va) tai "Kris"(-ti-an)) ja kevyisiin (K = kevyt, muussa tapauksessa). Mitä samankaltaisempi R/K-kuvio, sitä luontevampi yhdistelmä on. Esim. nimessä Kris-ti-an Vir-ta-nen sekä etu- että sukunimi ovat rytmiltään RKR.'
  },
  {
    key: 'length',
    label: 'Pituusero',
    description:
      'Tekoäly vertailee etu- ja sukunimen pituuksia. Pitkä sukunimi ja lyhyt etunimi tasapainottavat toisiaan. Vastaavasti lyhyt sukunimi ja pitkä etunimi toimivat hyvin yhdessä. Liian pitkä pituusero voi kuitenkin kuulostaa epätasapainoiselta.'
  },
  {
    key: 'alliteration',
    label: 'Allitteraatio',
    description:
      'Tekoäly suosittelee helpommin nimiä, jotka päättyvät samaan kirjaimeen kuin millä sukunimi alkaa. Ville Virtanen on esimerkki tällaisesta nimestä. Tekoäly kutsuu tätä ilmiötä nimellä "allitteraatio"'
  },
  {
    key: 'head_transition',
    label: 'Etu- ja sukunimen alkujen vertailu',
    description:
      'Tekoäly vertaa etunimen ja sukunimen ensimmäisiä äänteitä. Se on opetellut suomalaisista nimistä, minkälaiset alkuäänteet kuulostavat luonnollisilta ja suosii mahdollisimman normaaleja nimiä.'
  },
  {
    key: 'end_start_transition',
    label: 'Etunimen lopun ja sukunimen alun vertailu',
    description:
      'Tekoäly vertaa etunimen viimeistä ja sukunimen ensimmäistä äännettä. Se on opetellut suomalaisista nimistä, minkälaiset äänteet kuulostavat luonnollisilta, ja suosii mahdollisimman normaaleja nimiä.'
  },
  {
    key: 'oddness',
    label: 'Harvinaisuus',
    description:
      'Harvinaisia etunimiä (alle 500 nimenkantajaa) suositellaan helpommin kuin yleisiä nimiä.'
  }
];

if (typeof window !== 'undefined') {
  window.MATCH_WEIGHT_FIELDS_DATA = MATCH_WEIGHT_FIELDS;
}

export default MATCH_WEIGHT_FIELDS;
