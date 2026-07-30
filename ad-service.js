/**
 * Kevyt mainos-slot hallinta: näytä slotit vain kun on sisältöä, ja renderöi
 * AdSense-mainokset varattuihin paikkoihin VASTA kun:
 *   1) käyttäjä on antanut mainossuostumuksen (evästebanneri), JA
 *   2) oikea slot-tunnus on asetettu ADSENSE_SLOTS-objektiin (alla).
 * Ennen näitä paikat pysyvät tyhjinä eikä sivuston ulkoasu muutu.
 */

// Julkaisijatunnus — sama kuin ads.txt. Loader on lisätty jokaisen sivun <head>iin.
export const ADSENSE_CLIENT = 'ca-pub-2294859495292133';

// TÄYTÄ nämä AdSensen hallintapaneelin mainosyksiköiden slot-tunnuksilla, kun
// sivusto on hyväksytty (Mainokset → Mainosyksiköt → luo yksikkö → "data-ad-slot").
// Niin kauan kuin arvo on tyhjä, kyseiseen paikkaan ei renderöidä mainosta.
export const ADSENSE_SLOTS = {
  rail: '',   // työpöytänäkymän oikean palstan mainos (.ad-rail)
  inline: '', // hakutulosten seassa oleva mainos (.ad-inline)
  detail: '', // nimisivun mainos (.detail-ad)
};

const AD_SELECTORS = '.ad-rail, .ad-inline, .detail-ad';

const registeredSlots = new Map();
let adsConsent = false;

export function registerAdSlots(key, selectors) {
  registeredSlots.set(key, selectors);
}

export function setAdSlotsEnabled(key, enabled) {
  const selectors = registeredSlots.get(key);
  if (!selectors) return;
  selectors.forEach((sel) => {
    document.querySelectorAll(sel).forEach((el) => {
      el.hidden = !enabled;
    });
  });
  if (enabled) renderAds();
}

function slotIdFor(el) {
  if (el.matches('.detail-ad')) return ADSENSE_SLOTS.detail;
  if (el.matches('.ad-rail')) return ADSENSE_SLOTS.rail;
  if (el.matches('.ad-inline, .ad-inline-top')) return ADSENSE_SLOTS.inline;
  return '';
}

function renderAds() {
  if (!adsConsent) return;
  if (typeof document === 'undefined') return;
  document.querySelectorAll(AD_SELECTORS).forEach((el) => {
    // Only fill slots the layout is actually showing (skips display:none rail on
    // mobile and any slot hidden by setAdSlotsEnabled) — no reflow of content.
    if (el.hidden || el.offsetParent === null) return;
    if (el.querySelector('ins.adsbygoogle')) return; // already rendered
    const slot = slotIdFor(el);
    if (!slot) return; // no real slot id configured yet → leave empty
    const ins = document.createElement('ins');
    ins.className = 'adsbygoogle';
    ins.style.display = 'block';
    ins.setAttribute('data-ad-client', ADSENSE_CLIENT);
    ins.setAttribute('data-ad-slot', slot);
    ins.setAttribute('data-ad-format', 'auto');
    ins.setAttribute('data-full-width-responsive', 'true');
    el.appendChild(ins);
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (err) {
      /* AdSense not loaded / blocked — leave the slot empty, no error. */
    }
  });
}

/** Called by the consent manager when advertising consent changes. */
export function setAdsConsent(granted) {
  adsConsent = !!granted;
  if (adsConsent) renderAds();
}

// Bridge to the (non-module) consent manager in cookie-banner/consent-config.js.
// Works regardless of which script initialises first.
if (typeof window !== 'undefined') {
  window.__nvAdsConsent = setAdsConsent;
  if (window.__nvAdsConsentGranted) setAdsConsent(true);
}
