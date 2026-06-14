/**
 * 搜索页面模块
 */

// ===== 模块级数据缓存 =====
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟
let cachedData = null;
let cacheTimestamp = 0;

export async function render(params) {
  const main = document.querySelector('.main');
  if (!main) return;

  const hs = window.HashSearch.getInstance();

  // 使用缓存或重新加载
  let indexData = [];
  let geoIndex = null;
  try {
    const now = Date.now();
    if (cachedData && (now - cacheTimestamp) < CACHE_TTL) {
      indexData = cachedData.indexData;
      geoIndex = cachedData.geoIndex;
    } else {
      [indexData, geoIndex] = await Promise.all([
        hs.get('/data/index.json'),
        hs.get('/data/geo-index.json'),
      ]);
      cachedData = { indexData, geoIndex };
      cacheTimestamp = now;
    }
  } catch {
    main.innerHTML = '<div class="router-error"><h2>数据加载失败</h2><p>请稍后重试</p></div>';
    return;
  }

  // 构建地理位置查找表
  const geoLookup = buildGeoLookup(geoIndex);

  // URL 传入的初始搜索词
  const initialQuery = (params.search || '').trim();

  // 渲染页面结构
  renderPage(main, indexData, geoLookup, initialQuery);
}

// ===== 地理位置查找表 =====

function buildGeoLookup(geoIndex) {
  const lookup = [];

  if (geoIndex.continents) {
    for (const item of geoIndex.continents) {
      lookup.push({
        type: 'region',
        level: 'continent',
        slug: item.slug,
        name: item.name,
        nameEn: item.nameEn || '',
        href: '?continent=' + encodeURIComponent(item.slug),
      });
    }
  }

  for (const level of ['countries', 'provinces', 'cities', 'districts']) {
    const map = geoIndex[level];
    if (!map) continue;
    const levelSingular = level.replace(/ies$/, 'y').replace(/s$/, '');
    for (const [slug, info] of Object.entries(map)) {
      const href = buildGeoHref(levelSingular, slug, info);
      lookup.push({
        type: 'region',
        level: levelSingular,
        slug,
        name: info.name,
        nameEn: info.nameEn || '',
        href,
      });
    }
  }

  return lookup;
}

function buildGeoHref(level, slug, info) {
  const params = [];
  if (info.continent) params.push('continent=' + encodeURIComponent(info.continent));
  if (info.country || (level === 'country')) {
    params.push('country=' + encodeURIComponent(level === 'country' ? slug : info.country));
  }
  if (info.province || level === 'province') {
    params.push('province=' + encodeURIComponent(level === 'province' ? slug : info.province));
  }
  if (info.city || level === 'city') {
    params.push('city=' + encodeURIComponent(level === 'city' ? slug : info.city));
  }
  if (level === 'district') {
    params.push('district=' + encodeURIComponent(slug));
  }
  return '?' + params.join('&');
}

// ===== SVG 图标 =====

const ICON_SEARCH = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
const ICON_CLOSE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
const ICON_TRAIL = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 10l-5-5-5 5"/><path d="M12 5v14"/><circle cx="12" cy="19" r="2"/></svg>';
const ICON_REGION = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
const ICON_TAG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>';

// ===== 渲染页面 =====

function renderPage(main, indexData, geoLookup, initialQuery) {
  // 注入样式
  injectStyles();

  // 收集所有标签
  const allTags = collectAllTags(indexData);

  main.innerHTML = `
    <div class="search-page">
      <div class="search-hero">
        <div class="search-box-wrapper">
          <span class="search-box-icon">${ICON_SEARCH}</span>
          <input
            type="text"
            class="search-box-input"
            placeholder="搜索路线名称、地区、标签..."
            autocomplete="off"
            value="${escapeAttr(initialQuery)}"
          />
          <button class="search-box-clear" type="button" aria-label="清除搜索"${initialQuery ? '' : ' hidden'}>
            ${ICON_CLOSE}
          </button>
        </div>
        <div class="search-suggestions" hidden></div>
      </div>
      <div class="search-results"></div>
    </div>
  `;

  // DOM 引用
  const input = main.querySelector('.search-box-input');
  const clearBtn = main.querySelector('.search-box-clear');
  const suggestionsEl = main.querySelector('.search-suggestions');
  const resultsEl = main.querySelector('.search-results');

  // 状态
  let currentQuery = initialQuery;
  let suggestionVisible = false;
  let debounceTimer = null;

  // 自动聚焦
  requestAnimationFrame(() => {
    input.focus();
    // 将光标移到末尾
    if (initialQuery) {
      input.setSelectionRange(initialQuery.length, initialQuery.length);
    }
  });

  // 如果有初始搜索词，直接显示结果
  if (initialQuery) {
    resultsEl.innerHTML = buildSearchResults(indexData, initialQuery, geoLookup);
  } else {
    resultsEl.innerHTML = buildInitialState();
  }

  // ===== 事件处理 =====

  // 输入事件 → 建议
  input.addEventListener('input', () => {
    const q = input.value.trim();
    updateClearButton(clearBtn, q);
    currentQuery = q;

    clearTimeout(debounceTimer);

    if (!q) {
      suggestionsEl.hidden = true;
      suggestionVisible = false;
      return;
    }

    debounceTimer = setTimeout(() => {
      const suggestions = buildSuggestions(q, indexData, geoLookup, allTags);
      if (suggestions.length > 0) {
        suggestionsEl.innerHTML = suggestions;
        suggestionsEl.hidden = false;
        suggestionVisible = true;
      } else {
        suggestionsEl.hidden = true;
        suggestionVisible = false;
      }
    }, 300);
  });

  // Enter 键 → 立即搜索
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(debounceTimer);
      suggestionsEl.hidden = true;
      suggestionVisible = false;
      const q = input.value.trim();
      currentQuery = q;
      if (q) {
        resultsEl.innerHTML = buildSearchResults(indexData, q, geoLookup);
        updateURL(q);
      } else {
        resultsEl.innerHTML = buildInitialState();
        updateURL('');
      }
    }
  });

  // 清除按钮
  clearBtn.addEventListener('click', () => {
    input.value = '';
    currentQuery = '';
    clearBtn.hidden = true;
    suggestionsEl.hidden = true;
    suggestionVisible = false;
    resultsEl.innerHTML = buildInitialState();
    updateURL('');
    input.focus();
  });

  // 点击建议项（事件委托）→ 跳转到对应页面
  suggestionsEl.addEventListener('click', (e) => {
    const item = e.target.closest('.search-suggestion-item');
    if (!item) return;

    const href = item.getAttribute('data-href');
    if (href) {
      window.location.href = href;
    }
  });

  // 点击外部关闭建议面板
  document.addEventListener('click', (e) => {
    if (suggestionVisible) {
      const hero = main.querySelector('.search-hero');
      if (hero && !hero.contains(e.target)) {
        suggestionsEl.hidden = true;
        suggestionVisible = false;
      }
    }
  });

  // 输入框获得焦点时，如果有内容则重新显示建议
  input.addEventListener('focus', () => {
    const q = input.value.trim();
    if (q) {
      const suggestions = buildSuggestions(q, indexData, geoLookup, allTags);
      if (suggestions.length > 0) {
        suggestionsEl.innerHTML = suggestions;
        suggestionsEl.hidden = false;
        suggestionVisible = true;
      }
    }
  });
}

// ===== 样式注入 =====

let stylesInjected = false;

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;

  const style = document.createElement('style');
  style.textContent = `
    /* ===== 搜索页面 ===== */
    .search-page {
      padding-bottom: var(--space-xl);
    }

    .search-hero {
      max-width: 640px;
      margin: 0 auto var(--space-xl);
      position: relative;
    }

    /* 搜索框容器 */
    .search-box-wrapper {
      display: flex;
      align-items: center;
      background: var(--color-card-bg);
      border: 2px solid var(--color-border);
      border-radius: 12px;
      padding: 0 var(--space-md);
      box-shadow: 0 4px 24px var(--color-card-shadow);
      transition: border-color 0.2s, box-shadow 0.2s;
      gap: var(--space-sm);
    }

    .search-box-wrapper:focus-within {
      border-color: var(--color-primary);
      box-shadow: 0 4px 24px var(--color-card-shadow), 0 0 0 3px rgba(45, 106, 79, 0.15);
    }

    .search-box-icon {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      color: var(--color-text-secondary);
    }

    .search-box-input {
      flex: 1;
      border: none;
      outline: none;
      background: transparent;
      font-size: 1.125rem;
      padding: 14px 0;
      color: var(--color-text);
      font-family: var(--font-sans);
      min-width: 0;
    }

    .search-box-input::placeholder {
      color: var(--color-text-secondary);
      opacity: 0.6;
    }

    .search-box-clear {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: none;
      border: none;
      cursor: pointer;
      color: var(--color-text-secondary);
      padding: 4px;
      border-radius: 50%;
      transition: color 0.2s, background-color 0.2s;
      line-height: 0;
    }

    .search-box-clear:hover {
      color: var(--color-accent);
      background-color: var(--color-bg-secondary);
    }

    /* 建议下拉面板 */
    .search-suggestions {
      position: absolute;
      top: calc(100% + 6px);
      left: 0;
      right: 0;
      background: var(--color-card-bg);
      border: 1px solid var(--color-border);
      border-radius: 12px;
      box-shadow: 0 8px 32px var(--color-card-shadow);
      overflow: hidden;
      z-index: 100;
    }

    .search-suggestion-item {
      display: flex;
      align-items: center;
      gap: var(--space-sm);
      padding: 10px var(--space-md);
      cursor: pointer;
      transition: background-color 0.15s;
      border: none;
      background: none;
      width: 100%;
      text-align: left;
      font-size: 0.9375rem;
      color: var(--color-text);
      font-family: var(--font-sans);
    }

    .search-suggestion-item:hover,
    .search-suggestion-item:focus {
      background-color: var(--color-bg-secondary);
    }

    .search-suggestion-item:not(:last-child) {
      border-bottom: 1px solid var(--color-bg-secondary);
    }

    .suggestion-icon {
      flex-shrink: 0;
      display: flex;
      align-items: center;
      color: var(--color-text-secondary);
    }

    .suggestion-icon--trail { color: var(--color-primary); }
    .suggestion-icon--region { color: var(--color-accent); }
    .suggestion-icon--tag { color: #7c6f64; }

    .suggestion-text {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .suggestion-type {
      flex-shrink: 0;
      font-size: 0.75rem;
      color: var(--color-text-secondary);
      background: var(--color-bg-secondary);
      padding: 2px 8px;
      border-radius: 4px;
    }

    /* 搜索结果区域 */
    .search-results {
      max-width: var(--max-width);
      margin: 0 auto;
      padding: 0 var(--space-md);
    }

    .search-results-summary {
      margin-bottom: var(--space-lg);
      font-size: 0.9375rem;
      color: var(--color-text-secondary);
    }

    .search-results-summary strong {
      color: var(--color-primary);
    }

    .search-filter-tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: var(--color-primary);
      color: #fff;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 0.8125rem;
      margin-left: var(--space-sm);
    }

    .search-filter-tag button {
      background: none;
      border: none;
      color: inherit;
      cursor: pointer;
      padding: 0;
      font-size: 1rem;
      line-height: 1;
      opacity: 0.8;
    }

    .search-filter-tag button:hover { opacity: 1; }

    /* 路线卡片 */
    .trail-cards {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: var(--space-lg);
    }

    .trail-card {
      background: var(--color-card-bg);
      border: 1px solid var(--color-border);
      border-radius: 10px;
      padding: var(--space-lg);
      box-shadow: 0 2px 8px var(--color-card-shadow);
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .trail-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 20px var(--color-card-shadow);
    }

    .trail-card-name {
      font-size: 1.125rem;
      font-weight: 600;
      margin-bottom: var(--space-xs);
      line-height: 1.4;
    }

    .trail-card-name a {
      color: var(--color-text);
      text-decoration: none;
    }

    .trail-card-name a:hover { color: var(--color-primary); }

    .trail-card-name-en {
      font-size: 0.8125rem;
      color: var(--color-text-secondary);
      margin-bottom: var(--space-sm);
      font-weight: 400;
    }

    .trail-card-feature {
      font-size: 0.875rem;
      color: var(--color-text-secondary);
      margin-bottom: var(--space-md);
      line-height: 1.5;
    }

    .trail-card-meta {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--space-sm);
    }

    .trail-card-difficulty {
      font-size: 0.8125rem;
      font-weight: 600;
      padding: 2px 10px;
      border-radius: 12px;
      background-color: var(--color-bg-secondary);
      color: var(--color-text);
    }

    .trail-card-distance {
      font-size: 0.8125rem;
      color: var(--color-text-secondary);
    }

    .trail-card-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: var(--space-sm);
    }

    .trail-card-tag {
      font-size: 0.75rem;
      padding: 1px 8px;
      border-radius: 10px;
      background: var(--color-bg-secondary);
      color: var(--color-text-secondary);
    }

    /* 高亮 */
    mark {
      background-color: #fde68a;
      color: inherit;
      padding: 1px 2px;
      border-radius: 2px;
    }

    [data-theme="dark"] mark {
      background-color: #854d0e;
      color: #fef3c7;
    }

    /* 空状态 */
    .search-empty {
      text-align: center;
      padding: var(--space-xl) var(--space-md);
      color: var(--color-text-secondary);
    }

    .search-empty-icon {
      font-size: 3rem;
      margin-bottom: var(--space-md);
      opacity: 0.5;
    }

    .search-empty h3 {
      font-size: 1.25rem;
      color: var(--color-text);
      margin-bottom: var(--space-sm);
    }

    .search-empty p {
      font-size: 0.9375rem;
    }

    .search-initial {
      text-align: center;
      padding: var(--space-xxl, 48px) var(--space-md);
      color: var(--color-text-secondary);
    }

    .search-initial-icon {
      font-size: 3rem;
      margin-bottom: var(--space-md);
      opacity: 0.4;
    }

    .search-initial p {
      font-size: 1.0625rem;
    }

    /* 响应式 */
    @media (max-width: 768px) {
      .search-box-input {
        font-size: 1rem;
        padding: 12px 0;
      }

      .search-box-wrapper {
        padding: 0 var(--space-sm);
        border-radius: 10px;
      }

      .trail-cards {
        grid-template-columns: 1fr;
        gap: var(--space-md);
      }

      .search-hero {
        margin-bottom: var(--space-lg);
      }
    }
  `;
  document.head.appendChild(style);
}

// ===== 收集所有标签 =====

function collectAllTags(indexData) {
  const tagSet = new Set();
  for (const trail of indexData) {
    if (Array.isArray(trail.tags)) {
      for (const tag of trail.tags) {
        tagSet.add(tag);
      }
    }
  }
  return [...tagSet].sort();
}

// ===== 构建建议列表 =====

function buildSuggestions(query, indexData, geoLookup, allTags) {
  const q = query.toLowerCase().trim();
  if (!q) return '';

  const results = [];

  // 匹配路线名称
  for (const trail of indexData) {
    if (results.length >= 8) break;
    if (trail.name.toLowerCase().includes(q) || (trail.nameEn || '').toLowerCase().includes(q)) {
      results.push({
        type: 'trail',
        slug: trail.slug,
        name: trail.name,
        nameEn: trail.nameEn || '',
        href: '?trail=' + encodeURIComponent(trail.name),
      });
    }
  }

  // 匹配地区
  for (const geo of geoLookup) {
    if (results.length >= 8) break;
    if (geo.name.toLowerCase().includes(q) || geo.nameEn.toLowerCase().includes(q)) {
      // 去重（同一地区只显示一次）
      if (!results.some(r => r.type === 'region' && r.name === geo.name)) {
        results.push(geo);
      }
    }
  }

  // 匹配标签
  for (const tag of allTags) {
    if (results.length >= 8) break;
    if (tag.toLowerCase().includes(q)) {
      results.push({
        type: 'tag',
        name: tag,
        href: '?tag=' + encodeURIComponent(tag),
      });
    }
  }

  // 渲染 HTML
  return results.slice(0, 8).map(item => {
    let icon, iconClass;
    switch (item.type) {
      case 'trail':
        icon = ICON_TRAIL;
        iconClass = 'suggestion-icon--trail';
        break;
      case 'region':
        icon = ICON_REGION;
        iconClass = 'suggestion-icon--region';
        break;
      case 'tag':
        icon = ICON_TAG;
        iconClass = 'suggestion-icon--tag';
        break;
      default:
        icon = '';
        iconClass = '';
    }

    const typeLabel = item.type === 'trail' ? '路线' : item.type === 'region' ? '地区' : '标签';

    return `
      <div class="search-suggestion-item" data-href="${escapeAttr(item.href)}" role="option" tabindex="0">
        <span class="suggestion-icon ${iconClass}">${icon}</span>
        <span class="suggestion-text">${escapeHtml(item.name)}</span>
        <span class="suggestion-type">${typeLabel}</span>
      </div>`;
  }).join('');
}

// ===== 搜索逻辑 =====

function buildSearchResults(indexData, query, geoLookup) {
  const q = query.toLowerCase().trim();
  if (!q) return buildInitialState();

  // 构建地区关键词→slug 的映射（用于地区匹配）
  const geoNameToSlug = {};
  const geoSlugToLevel = {};
  for (const geo of geoLookup) {
    const key = geo.name.toLowerCase();
    if (!geoNameToSlug[key]) {
      geoNameToSlug[key] = { slug: geo.slug, level: geo.level };
    }
  }

  // 多维度匹配
  const matched = indexData.filter(trail => {
    // 名称模糊匹配
    if (trail.name.toLowerCase().includes(q)) return true;
    if ((trail.nameEn || '').toLowerCase().includes(q)) return true;

    // 标签精确匹配
    if (Array.isArray(trail.tags)) {
      if (trail.tags.some(tag => tag.toLowerCase() === q)) return true;
    }

    // 地区名模糊匹配
    const geoFields = ['continent', 'country', 'province', 'city', 'district'];
    for (const field of geoFields) {
      const val = trail[field];
      if (!val) continue;
      const geoInfo = geoNameToSlug[q];
      if (geoInfo && val === geoInfo.slug) return true;
      // 也检查 geo-index 中的中文名
      const geoEntry = findGeoEntry(geoLookup, val);
      if (geoEntry && geoEntry.name.toLowerCase().includes(q)) return true;
    }

    return false;
  });

  // 排序：名称匹配优先，然后热度降序
  matched.sort((a, b) => {
    const aName = a.name.toLowerCase().includes(q);
    const bName = b.name.toLowerCase().includes(q);
    if (aName && !bName) return -1;
    if (!aName && bName) return 1;
    return (b.heat || 0) - (a.heat || 0);
  });

  if (matched.length === 0) {
    return buildEmptyState();
  }

  return buildResultCards(matched, query);
}

function findGeoEntry(geoLookup, slug) {
  return geoLookup.find(g => g.slug === slug) || null;
}

// ===== 渲染结果卡片 =====

function buildResultCards(trails, query) {
  const q = query.toLowerCase();

  const cards = trails.map(trail => {
    const nameHighlighted = highlightText(trail.name, q);
    const featureHighlighted = highlightText(trail.feature || '', q);

    const tagsHtml = (trail.tags || []).map(tag => {
      const tagHighlighted = tag.toLowerCase() === q ? `<mark>${escapeHtml(tag)}</mark>` : escapeHtml(tag);
      return `<span class="trail-card-tag">${tagHighlighted}</span>`;
    }).join('');

    return `
      <div class="trail-card">
        <div class="trail-card-name">
          <a href="?trail=${encodeURIComponent(trail.name)}">${nameHighlighted}</a>
        </div>
        ${trail.nameEn ? `<div class="trail-card-name-en">${escapeHtml(trail.nameEn)}</div>` : ''}
        <div class="trail-card-feature">${featureHighlighted}</div>
        <div class="trail-card-meta">
          <span class="trail-card-difficulty">难度 ${trail.difficulty || '?'}/10</span>
          <span class="trail-card-distance">${trail.distance != null ? trail.distance + ' km' : ''}</span>
          <span class="trail-card-distance">${trail.duration || ''}</span>
        </div>
        ${tagsHtml ? `<div class="trail-card-tags">${tagsHtml}</div>` : ''}
      </div>`;
  }).join('');

  return `
    <div class="search-results-summary">
      找到 <strong>${trails.length}</strong> 条相关路线
      <span class="search-filter-tag">
        ${escapeHtml(query)}
      </span>
    </div>
    <div class="trail-cards">
      ${cards}
    </div>`;
}

// ===== 空状态 =====

function buildEmptyState() {
  return `
    <div class="search-empty">
      <div class="search-empty-icon">🔍</div>
      <h3>未找到相关路线</h3>
      <p>试试其他关键词</p>
    </div>`;
}

function buildInitialState() {
  return `
    <div class="search-initial">
      <div class="search-initial-icon">🌍</div>
      <p>输入关键词搜索全球徒步路线</p>
    </div>`;
}

// ===== 工具函数 =====

function highlightText(text, query) {
  if (!query || !text) return escapeHtml(text);
  const escaped = escapeHtml(text);
  // 不区分大小写替换
  const regex = new RegExp('(' + escapeRegExp(query) + ')', 'gi');
  return escaped.replace(regex, '<mark>$1</mark>');
}

function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function updateClearButton(btn, query) {
  btn.hidden = !query;
}

function updateURL(query) {
  const url = query ? '?search=' + encodeURIComponent(query) : window.location.pathname;
  history.replaceState({ search: query }, '', url);
}