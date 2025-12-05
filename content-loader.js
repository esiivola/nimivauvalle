/**
 * Small helper to inject modular HTML fragments into pages.
 * Usage: add data-include="path/to/file.html" on a container element.
 */
export async function loadContentBlocks() {
  const targets = Array.from(document.querySelectorAll('[data-include]'));
  if (!targets.length) return;
  await Promise.all(
    targets.map(async (target) => {
      const url = target.getAttribute('data-include');
      if (!url) return;
      try {
        const res = await fetch(url, { credentials: 'same-origin' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const html = await res.text();
        target.innerHTML = html;
      } catch (error) {
        target.innerHTML = `<p class="hint">Sisällön lataus epäonnistui (${String(error)}).</p>`;
      }
    })
  );
}
