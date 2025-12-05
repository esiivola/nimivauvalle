/**
 * Kevyt mainos-slot hallinta: näytä slotit vain kun on sisältöä.
 */

const registeredSlots = new Map();

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
}

