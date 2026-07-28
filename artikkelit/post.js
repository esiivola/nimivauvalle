const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?/;

function parseFrontmatter(raw) {
  const match = raw.match(FRONTMATTER_RE);
  if (!match) return { meta: {}, body: raw };
  const meta = {};
  match[1]
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const [key, ...rest] = line.split(':');
      if (!key || !rest.length) return;
      meta[key.trim()] = rest.join(':').trim();
    });
  const body = raw.slice(match[0].length);
  return { meta, body };
}

function escapeHtml(text = '') {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function replaceInline(text = '') {
  let out = text;
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');
  return out;
}

function markdownToHtml(md) {
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  const html = [];
  let listBuffer = [];

  const flushList = () => {
    if (!listBuffer.length) return;
    html.push('<ul>');
    listBuffer.forEach((item) => html.push(`<li>${replaceInline(item)}</li>`));
    html.push('</ul>');
    listBuffer = [];
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      return;
    }
    if (/^---$/.test(trimmed)) {
      flushList();
      html.push('<hr />');
      return;
    }
    if (/^###\s+/.test(trimmed)) {
      flushList();
      html.push(`<h3>${replaceInline(trimmed.replace(/^###\s+/, ''))}</h3>`);
      return;
    }
    if (/^##\s+/.test(trimmed)) {
      flushList();
      html.push(`<h2>${replaceInline(trimmed.replace(/^##\s+/, ''))}</h2>`);
      return;
    }
    if (/^#\s+/.test(trimmed)) {
      flushList();
      html.push(`<h1>${replaceInline(trimmed.replace(/^#\s+/, ''))}</h1>`);
      return;
    }
    const listMatch = trimmed.match(/^-\s+(.*)/);
    if (listMatch) {
      listBuffer.push(listMatch[1]);
      return;
    }
    if (/^>\s+/.test(trimmed)) {
      flushList();
      html.push(`<p class="hint">${replaceInline(trimmed.replace(/^>\s+/, ''))}</p>`);
      return;
    }
    flushList();
    html.push(`<p>${replaceInline(trimmed)}</p>`);
  });
  flushList();
  return html.join('\n');
}

function deriveSlug() {
  const attrSlug = document.body.dataset.postSlug;
  if (attrSlug) return attrSlug;
  const querySlug = new URLSearchParams(window.location.search).get('slug');
  if (querySlug) return querySlug;
  const path = window.location.pathname || '';
  const match = path.match(/\/([^/]+)\.html?$/i);
  const pathSlug = match ? match[1] : null;
  return pathSlug === 'post' ? null : pathSlug;
}

function applyMeta(meta = {}, slug = '') {
  const siteTitle = document.getElementById('post-title');
  if (siteTitle) siteTitle.textContent = 'Nimi vauvalle';

  const subEl = document.getElementById('post-subtitle');
  if (subEl) subEl.textContent = meta.subtitle || 'Artikkeli';

  if (meta.title) {
    document.title = `${meta.title} | Nimi vauvalle`;
  }
  if (meta.description) {
    const desc = document.querySelector('meta[name="description"]');
    if (desc) {
      desc.setAttribute('content', meta.description);
    } else {
      const el = document.createElement('meta');
      el.name = 'description';
      el.content = meta.description;
      document.head.appendChild(el);
    }
  }
  if (slug) {
    const canonicalUrl = `https://nimivauvalle.fi/artikkelit/${encodeURIComponent(slug)}.html`;
    const canonical = document.querySelector('link[rel="canonical"]');
    if (canonical) canonical.href = canonicalUrl;
    const ogUrl = document.querySelector('meta[property="og:url"]');
    if (ogUrl) ogUrl.setAttribute('content', canonicalUrl);
  }
}

async function loadPost() {
  const slug = deriveSlug();
  const content = document.getElementById('post-content');
  if (!content) return;
  if (!slug) {
    content.innerHTML = '<p class="hint">Valitse kirjoitus blogista.</p>';
    return;
  }
  content.innerHTML = '<p class="hint">Ladataan…</p>';
  try {
    const res = await fetch(`./${slug}.md`);
    if (!res.ok) throw new Error('not found');
    const raw = await res.text();
    const { meta, body } = parseFrontmatter(raw);
    applyMeta(meta, slug);

    content.innerHTML = '';
    const header = document.createElement('header');
    header.className = 'post-header';
    if (meta.title) {
      const h1 = document.createElement('h1');
      h1.textContent = meta.title;
      header.appendChild(h1);
    }
    if (meta.subtitle) {
      const h2 = document.createElement('h2');
      h2.textContent = meta.subtitle;
      header.appendChild(h2);
    }
    content.appendChild(header);

    // remove leading H1 from markdown to avoid duplicates
    const bodyStripped = body.replace(/^\s*#\s+.*\n/, '').trim();
    const html = markdownToHtml(bodyStripped);
    const article = document.createElement('div');
    article.className = 'post-body';
    article.innerHTML = html;
    content.appendChild(article);
  } catch (err) {
    content.innerHTML = '<p class="hint">Kirjoitusta ei voitu ladata.</p>';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadPost();
});
