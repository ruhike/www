/**
 * 标签系统 - 标签云与标签筛选页面模块
 */
const TAG_COLORS = ['#2d6a4f', '#40916c', '#e76f51', '#264653', '#e9c46a', '#4a4e69', '#6d6875', '#b5838d', '#457b9d', '#1d3557'];

function hashColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash |= 0;
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

function fontSize(count) {
  if (count >= 4) return '1.8rem';
  if (count === 3) return '1.5rem';
  if (count === 2) return '1.2rem';
  return '0.9rem';
}

function injectStyles() {
  if (document.getElementById('tag-page-styles')) return;
  const style = document.createElement('style');
  style.id = 'tag-page-styles';
  style.textContent = `
    .tag-cloud-container {
      padding: var(--space-xl) 0;
    }
    .tag-cloud-header {
      text-align: center;
      margin-bottom: var(--space-lg);
    }
    .tag-cloud-header h1 {
      font-size: 1.8rem;
      color: var(--color-text);
      margin-bottom: var(--space-sm);
    }
    .tag-cloud-header p {
      color: var(--color-text-secondary);
      font-size: 0.95rem;
    }
    .tag-sort-bar {
      display: flex;
      justify-content: center;
      gap: var(--space-sm);
      margin-bottom: var(--space-xl);
    }
    .tag-sort-btn {
      padding: var(--space-xs) var(--space-md);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      background: var(--color-card-bg);
      color: var(--color-text-secondary);
      font-size: 0.875rem;
      cursor: pointer;
      transition: background-color 0.2s, color 0.2s, border-color 0.2s;
    }
    .tag-sort-btn:hover {
      border-color: var(--color-primary);
      color: var(--color-primary);
    }
    .tag-sort-btn--active {
      background: var(--color-primary);
      color: #fff;
      border-color: var(--color-primary);
    }
    .tag-sort-btn--active:hover {
      background: var(--color-primary-light);
      color: #fff;
    }
    .tag-cloud {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      align-items: center;
      gap: var(--space-md) var(--space-lg);
      padding: var(--space-lg);
      max-width: 800px;
      margin: 0 auto;
    }
    .tag-cloud-item {
      display: inline-block;
      cursor: pointer;
      text-decoration: none;
      font-weight: 500;
      transition: color 0.2s, transform 0.2s;
      line-height: 1.4;
      white-space: nowrap;
    }
    .tag-cloud-item:hover {
      transform: scale(1.15);
    }

    /* Mode B - Filter */
    .tag-filter-container {
      padding: var(--space-lg) 0;
    }
    .tag-filter-header {
      margin-bottom: var(--space-lg);
    }
    .tag-filter-header h1 {
      font-size: 1.5rem;
      color: var(--color-text);
      margin-bottom: var(--space-xs);
    }
    .tag-filter-header p {
      color: var(--color-text-secondary);
      font-size: 0.95rem;
    }
    .tag-filter-count {
      display: inline-block;
      background: var(--color-primary);
      color: #fff;
      border-radius: 20px;
      padding: 2px 12px;
      font-size: 0.85rem;
      margin-left: var(--space-sm);
      vertical-align: middle;
    }

    /* Route cards */
    .tag-route-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: var(--space-lg);
    }
    .tag-route-card {
      background: var(--color-card-bg);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      padding: var(--space-lg);
      box-shadow: 0 2px 8px var(--color-card-shadow);
      transition: transform 0.2s, box-shadow 0.2s;
      display: flex;
      flex-direction: column;
      gap: var(--space-sm);
    }
    .tag-route-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 16px var(--color-card-shadow);
    }
    .tag-route-card h3 {
      font-size: 1.1rem;
      color: var(--color-text);
      margin: 0;
    }
    .tag-route-card h3 a {
      color: var(--color-text);
      text-decoration: none;
    }
    .tag-route-card h3 a:hover {
      color: var(--color-primary);
    }
    .tag-route-meta {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-sm);
      font-size: 0.85rem;
      color: var(--color-text-secondary);
    }
    .tag-route-meta span {
      display: inline-flex;
      align-items: center;
      gap: 2px;
    }
    .tag-route-diff {
      display: inline-block;
      padding: 1px 8px;
      border-radius: 4px;
      font-size: 0.8rem;
      font-weight: 600;
      color: #fff;
      background: var(--color-primary);
    }
    .tag-route-feature {
      font-size: 0.9rem;
      color: var(--color-text-secondary);
      line-height: 1.5;
    }
    .tag-route-tags {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-xs);
    }
    .tag-route-tag {
      display: inline-block;
      padding: 1px 8px;
      font-size: 0.75rem;
      border-radius: 12px;
      border: 1px solid var(--color-border);
      color: var(--color-text-secondary);
      background: var(--color-bg-secondary);
      text-decoration: none;
      transition: border-color 0.2s, color 0.2s;
    }
    .tag-route-tag:hover {
      border-color: var(--color-primary);
      color: var(--color-primary);
    }
    .tag-route-tag--active {
      background: var(--color-primary);
      color: #fff;
      border-color: var(--color-primary);
    }

    /* Empty state */
    .tag-empty {
      text-align: center;
      padding: var(--space-xl) var(--space-md);
      color: var(--color-text-secondary);
    }
    .tag-empty h2 {
      font-size: 1.3rem;
      margin-bottom: var(--space-sm);
      color: var(--color-text);
    }
    .tag-empty a {
      color: var(--color-primary);
    }

    @media (max-width: 768px) {
      .tag-route-grid {
        grid-template-columns: 1fr;
      }
      .tag-cloud {
        gap: var(--space-sm) var(--space-md);
        padding: var(--space-md);
      }
      .tag-cloud-header h1 {
        font-size: 1.4rem;
      }
    }
  `;
  document.head.appendChild(style);
}

function buildTagUrl(tagName, params) {
  const p = {};
  if (params.continent) p.continent = params.continent;
  if (params.country)   p.country   = params.country;
  if (params.province)  p.province  = params.province;
  if (params.city)      p.city      = params.city;
  if (params.district)  p.district  = params.district;
  p.tag = tagName;
  return '?' + Object.entries(p)
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
    .join('&');
}

function matchesGeo(route, params) {
  if (params.continent && route.continent !== params.continent) return false;
  if (params.country   && route.country   !== params.country)   return false;
  if (params.province  && route.province  !== params.province)  return false;
  if (params.city      && route.city      !== params.city)      return false;
  if (params.district  && route.district  !== params.district)  return false;
  return true;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function render(params) {
  const main = document.querySelector('.main');
  if (!main) return;

  injectStyles();

  main.innerHTML = `
    <div class="router-loading">
      <div class="router-spinner"></div>
      <p>加载中...</p>
    </div>`;

  try {
    const hs = window.HashSearch.getInstance();
    const [tagsData, routesData] = await Promise.all([
      hs.get('/data/tags.json'),
      hs.get('/data/index.json')
    ]);

    const tagParam = params.tag;

    if (!tagParam || tagParam === 'all') {
      renderTagCloud(main, tagsData, params);
    } else {
      renderTagFilter(main, tagParam, tagsData, routesData, params);
    }
  } catch (err) {
    console.error('[Tag] 数据加载失败:', err);
    main.innerHTML = `
      <div class="router-error">
        <h2>加载失败</h2>
        <p>标签数据加载失败，请稍后重试。</p>
        <a href="/">返回首页</a>
      </div>`;
  }
}

function renderTagCloud(main, tags, params) {
  if (!tags || tags.length === 0) {
    main.innerHTML = `
      <div class="tag-cloud-container container">
        <div class="tag-empty">
          <h2>暂无标签</h2>
          <p>还没有任何标签数据。</p>
        </div>
      </div>`;
    return;
  }

  let sortMode = 'count';

  function getSorted() {
    if (sortMode === 'alpha') {
      return [...tags].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    }
    return [...tags].sort((a, b) => b.count - a.count);
  }

  function render() {
    const sortedTags = getSorted();
    const itemsHtml = sortedTags.map(t => {
      const color = hashColor(t.name);
      const size = fontSize(t.count);
      return `<a class="tag-cloud-item"
        href="${escapeHtml(buildTagUrl(t.name, params))}"
        style="color:${color};font-size:${size};"
        title="${escapeHtml(t.name)}（${t.count}条路线）">${escapeHtml(t.name)}</a>`;
    }).join('');

    main.innerHTML = `
      <div class="tag-cloud-container container">
        <div class="tag-cloud-header">
          <h1>标签云</h1>
          <p>共 ${tags.length} 个标签，点击标签查看对应路线</p>
        </div>
        <div class="tag-sort-bar">
          <button class="tag-sort-btn ${sortMode === 'count' ? 'tag-sort-btn--active' : ''}" data-sort="count">按热度</button>
          <button class="tag-sort-btn ${sortMode === 'alpha' ? 'tag-sort-btn--active' : ''}" data-sort="alpha">按字母</button>
        </div>
        <div class="tag-cloud">${itemsHtml}</div>
      </div>`;
  }

  render();

  // Event delegation on main for sort buttons
  main.addEventListener('click', (e) => {
    const btn = e.target.closest('.tag-sort-btn');
    if (!btn) return;
    const mode = btn.dataset.sort;
    if (mode === sortMode) return;
    sortMode = mode;
    render();
  });
}

function renderTagFilter(main, tagName, tagsData, routesData, params) {
  // Filter routes by tag + geo params
  let filtered = routesData.filter(r =>
    r.tags && r.tags.includes(tagName) && matchesGeo(r, params)
  );

  if (!filtered || filtered.length === 0) {
    main.innerHTML = `
      <div class="tag-filter-container container">
        <div class="tag-filter-header">
          <h1>${escapeHtml(tagName)}</h1>
        </div>
        <div class="tag-empty">
          <h2>暂无路线</h2>
          <p>没有找到包含标签「${escapeHtml(tagName)}」的路线。</p>
          <p><a href="?tag=all">返回标签云</a></p>
        </div>
      </div>`;
    return;
  }

  const cardsHtml = filtered.map(r => {
    const tagsHtml = (r.tags || []).map(t => {
      const isActive = t === tagName;
      return `<a class="tag-route-tag ${isActive ? 'tag-route-tag--active' : ''}"
        href="${escapeHtml(buildTagUrl(t, params))}">${escapeHtml(t)}</a>`;
    }).join('');

    return `
      <div class="tag-route-card">
        <h3><a href="?trail=${encodeURIComponent(r.name)}">${escapeHtml(r.name)}</a></h3>
        <div class="tag-route-meta">
          <span class="tag-route-diff">难度 ${r.difficulty}/10</span>
          <span>${r.distance} km</span>
          <span>↑${r.ascent}m</span>
          <span>${escapeHtml(r.duration)}</span>
          ${r.maxAltitude ? `<span>⛰ ${r.maxAltitude}m</span>` : ''}
        </div>
        ${r.feature ? `<div class="tag-route-feature">${escapeHtml(r.feature)}</div>` : ''}
        <div class="tag-route-tags">${tagsHtml}</div>
      </div>`;
  }).join('');

  main.innerHTML = `
    <div class="tag-filter-container container">
      <div class="tag-filter-header">
        <h1>${escapeHtml(tagName)}<span class="tag-filter-count">${filtered.length} 条路线</span></h1>
        <p>
          包含标签「${escapeHtml(tagName)}」的徒步路线
          <a href="?tag=all" style="margin-left:var(--space-md);font-size:0.85rem;">← 返回标签云</a>
        </p>
      </div>
      <div class="tag-route-grid">${cardsHtml}</div>
    </div>`;
}