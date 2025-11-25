function injectHeaderChrome() {
  const header = document.querySelector('.page-header');
  if (!header) return;
  if (header.querySelector('.header-actions')) return;

  const navHref = document.body.dataset.navHref || 'favorites.html';
  const navLabel = document.body.dataset.navLabel || 'Avaa suosikit';

  const actions = document.createElement('div');
  actions.className = 'header-actions';

  const navLink = document.createElement('a');
  navLink.className = 'ghost favorite-nav';
  navLink.href = navHref;
  navLink.textContent = navLabel;
  actions.appendChild(navLink);

  header.appendChild(actions);
}

injectHeaderChrome();
