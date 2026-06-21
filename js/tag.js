/**
 * 标签系统 - 标签云与标签筛选页面模块
 */
import { escapeHtml, matchesGeo, loadAllTrails } from './core.js';

const TAG_COLORS = ['#2d6a4f', '#40916c', '#e76f51', '#264653', '#e9c46a', '#4a4e69', '#6d6875', '#b5838d', '#457b9d', '#1d3557'];

function hashColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash |= 0;
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

function computeTags(trails) {
  const tagMap = new Map();
  for (const trail of trails) {
    if (Array.isArray(trail.tags)) {
      for (const tag of trail.tags) {
        tagMap.set(tag, (tagMap.get(tag) || 0) + 1);
      }
    }
  }
  return Array.from(tagMap, ([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

function fontSize(count) {
  if (count >= 4) return '1.8rem';
  if (count === 3) return '1.5rem';
  if (count === 2) return '1.2rem';
  return '0.9rem';
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

export async function render(params) {
  const main = document.querySelector('.main');
  if (!main) return;

  main.innerHTML = `
    <div class="router-loading">
      <div class="router-spinner"></div>
      <p>加载中...</p>
    </div>`;

  try {
    const routesData = await loadAllTrails();
    const tagsData = computeTags(routesData);

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