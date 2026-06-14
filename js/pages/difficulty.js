/**
 * 难度筛选页面模块
 */

import { initBreadcrumb, renderBreadcrumb } from '../core/breadcrumb.js';

// 13级难度渐变色映射
const DIFFICULTY_COLORS = [
  null,          // index 0 unused
  '#2d6a4f',     // Level 1  - 炼气期 (绿色系)
  '#40916c',     // Level 2  - 筑基期
  '#52b788',     // Level 3  - 金丹期
  '#74c69d',     // Level 4  - 元婴期
  '#e9c46a',     // Level 5  - 化神期 (黄色/橙色系)
  '#f0a850',     // Level 6  - 炼虚期
  '#f4a261',     // Level 7  - 合体期
  '#e76f51',     // Level 8  - 大乘期 (红色系)
  '#e05a3d',     // Level 9  - 渡劫期
  '#d62828',     // Level 10 - 真仙境
  '#7b2d8e',     // Level 11 - 金仙境 (紫色系)
  '#5a1a6e',     // Level 12 - 太乙境
  '#4a0e4e',     // Level 13 - 道祖境
];

function getDifficultyColor(level) {
  return DIFFICULTY_COLORS[level] || '#6b705c';
}

// ===== 样式注入 =====
let _stylesInjected = false;

function injectStyles() {
  if (_stylesInjected) return;
  _stylesInjected = true;

  const style = document.createElement('style');
  style.id = 'difficulty-styles';
  style.textContent = `
    /* ===== Difficulty Page ===== */
    .page-difficulty { padding-bottom: var(--space-xl); }

    /* Header */
    .diff-header { text-align: center; padding: var(--space-xl) 0 var(--space-lg); }
    .diff-header h1 { font-size: 2rem; margin-bottom: var(--space-sm); color: var(--color-text); }
    .diff-header .diff-desc { color: var(--color-text-secondary); font-size: 1.05rem; max-width: 600px; margin: 0 auto; }

    /* Overview Grid */
    .diff-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-lg); }

    .diff-card {
      background: var(--color-card-bg);
      border-radius: var(--radius);
      box-shadow: 0 2px 8px var(--color-card-shadow);
      padding: var(--space-lg);
      text-align: center;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
      border-top: 4px solid transparent;
      text-decoration: none;
      color: var(--color-text);
      display: block;
    }
    .diff-card:hover { transform: translateY(-4px); box-shadow: 0 6px 20px var(--color-card-shadow); }

    .diff-card__level {
      font-size: 3rem;
      font-weight: 800;
      line-height: 1;
      margin-bottom: var(--space-xs);
      background: linear-gradient(135deg, var(--diff-color), var(--diff-color-dark));
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .diff-card__name { font-size: 1.25rem; font-weight: 700; margin-bottom: var(--space-xs); }
    .diff-card__desc { font-size: 0.875rem; color: var(--color-text-secondary); margin-bottom: var(--space-sm); }
    .diff-card__range { font-size: 0.8rem; color: var(--color-text-secondary); margin-bottom: var(--space-md); }
    .diff-card__range span { display: inline-block; margin: 0 var(--space-xs); }
    .diff-card__count {
      font-size: 2rem;
      font-weight: 800;
      color: var(--diff-color);
      transition: color 0.2s;
    }
    .diff-card:hover .diff-card__count { color: var(--diff-color-dark); }
    .diff-card__count-label { font-size: 0.8rem; color: var(--color-text-secondary); }

    /* Filter Header (Mode B) */
    .diff-filter-header {
      text-align: center;
      padding: var(--space-xl) 0 var(--space-lg);
      border-bottom: 1px solid var(--color-border);
      margin-bottom: var(--space-lg);
    }
    .diff-filter-header .diff-badge {
      display: inline-block;
      padding: var(--space-xs) var(--space-md);
      border-radius: 20px;
      color: #fff;
      font-weight: 700;
      font-size: 1rem;
      margin-bottom: var(--space-sm);
    }
    .diff-filter-header h1 { font-size: 2rem; margin-bottom: var(--space-sm); }
    .diff-filter-header p { color: var(--color-text-secondary); }

    /* Sort Bar */
    .diff-sort-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: var(--space-lg);
      flex-wrap: wrap;
      gap: var(--space-sm);
    }
    .diff-sort-bar .diff-result-count { color: var(--color-text-secondary); font-size: 0.9rem; }
    .diff-sort-bar select {
      padding: var(--space-xs) var(--space-sm);
      border: 1px solid var(--color-border);
      border-radius: var(--radius);
      background: var(--color-card-bg);
      color: var(--color-text);
      font-size: 0.875rem;
      cursor: pointer;
    }

    /* Trail List */
    .diff-trail-list { display: flex; flex-direction: column; gap: var(--space-md); }

    .diff-trail-card {
      background: var(--color-card-bg);
      border-radius: var(--radius);
      box-shadow: 0 2px 8px var(--color-card-shadow);
      padding: var(--space-lg);
      display: flex;
      gap: var(--space-md);
      align-items: flex-start;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
      text-decoration: none;
      color: var(--color-text);
    }
    .diff-trail-card:hover { transform: translateY(-2px); box-shadow: 0 4px 16px var(--color-card-shadow); }

    .diff-trail-card__badge {
      flex-shrink: 0;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #fff;
      font-weight: 800;
      font-size: 1.25rem;
    }
    .diff-trail-card__body { flex: 1; min-width: 0; }
    .diff-trail-card__name { font-size: 1.1rem; font-weight: 700; margin-bottom: var(--space-xs); }
    .diff-trail-card__feature { font-size: 0.875rem; color: var(--color-text-secondary); margin-bottom: var(--space-sm); }
    .diff-trail-card__meta {
      display: flex;
      gap: var(--space-md);
      flex-wrap: wrap;
      font-size: 0.8rem;
      color: var(--color-text-secondary);
    }
    .diff-trail-card__tags {
      display: flex;
      gap: var(--space-xs);
      flex-wrap: wrap;
      margin-top: var(--space-sm);
    }
    .diff-trail-card__tag {
      font-size: 0.75rem;
      padding: 2px 8px;
      background: var(--color-bg-secondary);
      border-radius: 12px;
      color: var(--color-text-secondary);
    }

    /* Empty State */
    .diff-empty {
      text-align: center;
      padding: var(--space-xl) var(--space-md);
      color: var(--color-text-secondary);
    }
    .diff-empty h3 { font-size: 1.5rem; margin-bottom: var(--space-sm); color: var(--color-text); }
    .diff-empty p { margin-bottom: var(--space-lg); }
    .diff-empty a {
      display: inline-block;
      padding: var(--space-sm) var(--space-lg);
      background: var(--color-primary);
      color: #fff;
      border-radius: var(--radius);
      transition: background-color 0.3s;
    }
    .diff-empty a:hover { background: var(--color-primary-light); }

    /* Loading */
    .diff-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 300px;
      gap: var(--space-md);
      color: var(--color-text-secondary);
    }

    @media (max-width: 1024px) {
      .diff-grid { grid-template-columns: repeat(2, 1fr); }
    }
    @media (max-width: 640px) {
      .diff-grid { grid-template-columns: 1fr; }
      .diff-trail-card { flex-direction: column; align-items: center; text-align: center; }
      .diff-trail-card__meta { justify-content: center; }
      .diff-trail-card__tags { justify-content: center; }
      .diff-header h1, .diff-filter-header h1 { font-size: 1.5rem; }
    }
  `;
  document.head.appendChild(style);
}

// ===== 工具函数 =====

function buildGeoQS(params) {
  const parts = [];
  if (params.continent) parts.push('continent=' + encodeURIComponent(params.continent));
  if (params.country)   parts.push('country='   + encodeURIComponent(params.country));
  if (params.province)  parts.push('province='  + encodeURIComponent(params.province));
  if (params.city)      parts.push('city='      + encodeURIComponent(params.city));
  if (params.district)  parts.push('district='  + encodeURIComponent(params.district));
  return parts.length > 0 ? '&' + parts.join('&') : '';
}

function matchesGeo(trail, params) {
  if (params.continent && trail.continent !== params.continent) return false;
  if (params.country   && trail.country   !== params.country)   return false;
  if (params.province  && trail.province  !== params.province)  return false;
  if (params.city      && trail.city      !== params.city)      return false;
  if (params.district  && trail.district  !== params.district)  return false;
  return true;
}

function sortByHeat(trails) {
  return [...trails].sort((a, b) => (b.heat || 0) - (a.heat || 0));
}

function sortByDistance(trails) {
  return [...trails].sort((a, b) => (a.distance || 0) - (b.distance || 0));
}

function sortByAscent(trails) {
  return [...trails].sort((a, b) => (a.ascent || 0) - (b.ascent || 0));
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ===== HTML 构建 =====

function buildOverviewCard(diff, trailCount) {
  const color = getDifficultyColor(diff.level);
  const darkerColor = DIFFICULTY_COLORS[Math.min(diff.level + 1, 13)] || color;

  return `
    <a href="?difficulty=${diff.level}" class="diff-card" style="--diff-color:${color};--diff-color-dark:${darkerColor};border-top-color:${color}">
      <div class="diff-card__level">${diff.level}</div>
      <div class="diff-card__name">${escapeHtml(diff.name)}</div>
      <div class="diff-card__desc">${escapeHtml(diff.description)}</div>
      <div class="diff-card__range">
        <span>&#x1F4CF; ${escapeHtml(diff.distanceRange)}</span>
        <span>&#x26F0;&#xFE0F; ${escapeHtml(diff.ascentRange)}</span>
      </div>
      <div class="diff-card__count">${trailCount}</div>
      <div class="diff-card__count-label">条路线</div>
    </a>`;
}

function buildTrailCard(trail) {
  const color = getDifficultyColor(trail.difficulty);
  const tags = (trail.tags || []).slice(0, 4)
    .map(t => `<span class="diff-trail-card__tag">${escapeHtml(t)}</span>`)
    .join('');

  return `
    <a href="?trail=${encodeURIComponent(trail.name)}" class="diff-trail-card">
      <div class="diff-trail-card__badge" style="background:${color}">${trail.difficulty}</div>
      <div class="diff-trail-card__body">
        <div class="diff-trail-card__name">${escapeHtml(trail.name)}</div>
        ${trail.feature ? `<div class="diff-trail-card__feature">${escapeHtml(trail.feature)}</div>` : ''}
        <div class="diff-trail-card__meta">
          <span>&#x1F4CF; ${trail.distance}km</span>
          <span>&#x26F0;&#xFE0F; ${trail.ascent}m</span>
          ${trail.duration ? `<span>&#x1F4C5; ${escapeHtml(trail.duration)}</span>` : ''}
        </div>
        ${tags ? `<div class="diff-trail-card__tags">${tags}</div>` : ''}
      </div>
    </a>`;
}

// ===== 主渲染函数 =====

export async function render(params) {
  const main = document.querySelector('.main');
  if (!main) return;

  injectStyles();

  // 显示加载状态
  main.innerHTML = `
    <div class="diff-loading">
      <div class="router-spinner"></div>
      <p>加载难度数据...</p>
    </div>`;

  let difficulties, trails;

  try {
    const hs = window.HashSearch.getInstance();
    [difficulties, trails] = await Promise.all([
      hs.get('/data/difficulties.json'),
      hs.get('/data/index.json'),
    ]);
  } catch (err) {
    console.error('[Difficulty] 数据加载失败:', err);
    main.innerHTML = `
      <div class="page-difficulty container">
        <div class="diff-empty">
          <h3>数据加载失败</h3>
          <p>暂时无法加载难度数据，请稍后重试。</p>
          <a href="/">返回首页</a>
        </div>
      </div>`;
    return;
  }

  const difficultyParam = params.difficulty;

  // ===== 模式B：具体难度筛选页 =====
  if (difficultyParam && difficultyParam !== 'all' && /^\d+$/.test(difficultyParam)) {
    const level = parseInt(difficultyParam, 10);
    const diff = difficulties.find(d => d.level === level);

    if (!diff) {
      main.innerHTML = `
        <div class="page-difficulty container">
          <div class="diff-empty">
            <h3>未知难度等级</h3>
            <p>难度等级 "${escapeHtml(difficultyParam)}" 不存在。</p>
            <a href="?difficulty=all">查看全部难度等级</a>
          </div>
        </div>`;
      return;
    }

    // 更新面包屑：首页 > 难度 > 化神期
    await initBreadcrumb();
    const bc = document.getElementById('breadcrumbBar');
    if (bc) {
      bc.innerHTML = renderBreadcrumb([], { label: '难度', linked: true, href: '?difficulty=all' })
        + '<span class="breadcrumb-bar__sep">/</span>'
        + `<span class="breadcrumb-bar__current">${escapeHtml(diff.name)}</span>`;
    }

    // 按难度 + 地理位置筛选
    let filtered = trails.filter(t => t.difficulty === level && matchesGeo(t, params));

    // 排序
    const sortBy = params.sort || 'heat';
    if (sortBy === 'distance') {
      filtered = sortByDistance(filtered);
    } else if (sortBy === 'ascent') {
      filtered = sortByAscent(filtered);
    } else {
      filtered = sortByHeat(filtered);
    }

    const color = getDifficultyColor(level);
    const geoLabel = [];
    if (params.continent) geoLabel.push(params.continent);
    if (params.country)   geoLabel.push(params.country);
    if (params.province)  geoLabel.push(params.province);
    const geoStr = geoLabel.length > 0 ? ' \u00B7 ' + geoLabel.join(' \u203A ') : '';

    const selectedSort = params.sort || 'heat';
    const geoQS = buildGeoQS(params);
    const trailCards = filtered.map(buildTrailCard).join('');

    main.innerHTML = `
      <div class="page-difficulty container">
        <div class="diff-filter-header">
          <span class="diff-badge" style="background:${color}">Lv.${level}</span>
          <h1>${escapeHtml(diff.name)}</h1>
          <p>${escapeHtml(diff.description)}</p>
          <p style="margin-top:var(--space-xs);font-size:0.85rem;color:var(--color-text-secondary)">
            &#x1F4CF; ${escapeHtml(diff.distanceRange)} &middot; &#x26F0;&#xFE0F; ${escapeHtml(diff.ascentRange)}${geoStr}
          </p>
        </div>
        ${filtered.length > 0 ? `
          <div class="diff-sort-bar">
            <span class="diff-result-count">共 ${filtered.length} 条路线</span>
            <select id="diffSortSelect">
              <option value="heat"     ${selectedSort === 'heat'     ? 'selected' : ''}>按热度排序</option>
              <option value="distance" ${selectedSort === 'distance' ? 'selected' : ''}>按里程排序</option>
              <option value="ascent"   ${selectedSort === 'ascent'   ? 'selected' : ''}>按爬升排序</option>
            </select>
          </div>
          <div class="diff-trail-list">${trailCards}</div>
        ` : `
          <div class="diff-empty">
            <h3>该难度暂无路线</h3>
            <p>当前筛选条件下没有匹配的徒步路线。</p>
            <a href="?difficulty=all">查看全部难度等级</a>
          </div>
        `}
      </div>`;

    // 排序下拉事件
    const sortSelect = document.getElementById('diffSortSelect');
    if (sortSelect) {
      sortSelect.addEventListener('change', function () {
        const sortVal = this.value;
        let url = '?difficulty=' + level + geoQS;
        if (sortVal !== 'heat') {
          url += '&sort=' + sortVal;
        }
        window.location.href = url;
      });
    }
    return;
  }

  // ===== 模式A：难度总览页 =====
  // 更新面包屑：首页 > 难度
  await initBreadcrumb();
  const bc = document.getElementById('breadcrumbBar');
  if (bc) {
    bc.innerHTML = renderBreadcrumb([], { label: '难度', linked: false });
  }

  // 统计每个难度等级的路线数量
  const countMap = {};
  for (const t of trails) {
    const lv = t.difficulty;
    if (lv >= 1 && lv <= 13) {
      countMap[lv] = (countMap[lv] || 0) + 1;
    }
  }

  const cards = difficulties
    .sort((a, b) => a.level - b.level)
    .map(d => buildOverviewCard(d, countMap[d.level] || 0))
    .join('');

  main.innerHTML = `
    <div class="page-difficulty container">
      <div class="diff-header">
        <h1>难度分级</h1>
        <p class="diff-desc">从轻松休闲到传奇史诗，13级修仙主题难度分级，找到适合你的徒步路线。</p>
      </div>
      <div class="diff-grid">${cards}</div>
    </div>`;
}