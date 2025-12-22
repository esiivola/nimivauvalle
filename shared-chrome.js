function injectHeaderChrome() {
  const header = document.querySelector('.page-header');
  if (!header) return;
  if (header.querySelector('.page-nav')) return;

  const navHref = document.body.dataset.navHref || 'favorites.html';
  const navLabel = document.body.dataset.navLabel || 'Avaa suosikit';

  const nav = document.createElement('nav');
  nav.className = 'page-nav';
  nav.setAttribute('aria-label', 'Sivunavigaatio');

  const navLink = document.createElement('a');
  navLink.className = 'favorite-nav';
  navLink.href = navHref;
  navLink.textContent = navLabel;
  nav.appendChild(navLink);

  header.appendChild(nav);
}

injectHeaderChrome();
