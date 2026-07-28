// Static configuration for the search page.

export const PAGE_SIZE = 50;
export const WEIGHT_SUM_TOLERANCE = 0.05;
export const DETAIL_AD_FREQUENCY = 3;
export const SCROLL_FLAG_KEY = 'scrollToResults';

// Fallback sort descriptions (tooltips) for sort keys that have no schema-provided
// description. Schema `description` fields take precedence.
export const sortDescriptions = {
  alpha: 'Aakkosjärjestys A-Ö.',
  popularity: 'Järjestää eniten annetuista nimistä vähiten annettuihin.',
  match:
    'Painottaa vokaalien sijaintia ja avaruutta, sointisävyä, konsonanttien pehmeyttä sekä kirjainryhmien todennäköisiä siirtymiä nimien alussa ja välissä.',
  valence: 'Korkeampi arvo tarkoittaa kirkkaampaa sointia, matalampi tummempaa sävyä.',
  nasal_intensity: 'Korostaa m-, n- ja ng-äänteiden määrää nimessä.',
  r_intensity: 'Lajittelee r-äänteiden määrästä voimakkaimpaan.'
};
