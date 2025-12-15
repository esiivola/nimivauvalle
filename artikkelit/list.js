async function renderBlogList() {
  const container = document.getElementById('blog-list');
  if (!container) return;
  container.innerHTML = '<p class="hint">Ladataan artikkeleja…</p>';
  try {
    const res = await fetch('/artikkelit/index.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('index missing');
    const posts = await res.json();
    container.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'article-grid';
    posts.forEach((post) => {
      const card = document.createElement('article');
      card.className = 'article-card';
      card.setAttribute('role', 'listitem');
      const h3 = document.createElement('h3');
      h3.textContent = post.title || post.slug;
      const p = document.createElement('p');
      const desc = post.description || '';
      p.innerHTML = `${desc ? `${desc} ` : ''}<a class="article-cta inline" href="/artikkelit/${post.slug}.html">Lue artikkeli</a>`;
      card.appendChild(h3);
      card.appendChild(p);
      grid.appendChild(card);
    });
    container.appendChild(grid);
  } catch {
    container.innerHTML = '<p class="hint">Artikkelilistaa ei voitu ladata.</p>';
  }
}

document.addEventListener('DOMContentLoaded', renderBlogList);
