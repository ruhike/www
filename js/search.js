/**
 * 搜索页面模块
 */

import { escapeHtml, escapeAttr, loadAllTrails } from './core.js';
import { navigate } from './router.js';

export async function render(params) {
  const main = document.querySelector('.main');
  if (!main) return;

  let indexData = [];
  try {
    indexData = await loadAllTrails();
  } catch {
    main.innerHTML = '<div class="router-error"><h2>数据加载失败</h2><p>请稍后重试</p></div>';
    return;
  }

  // 构建地理位置查找表
  const geoLookup = buildGeoLookup(indexData);

  // URL 传入的初始搜索词
  const initialQuery = (params.search || '').trim();

  // 渲染页面结构
  renderPage(main, indexData, geoLookup, initialQuery);
}

// ===== 地理位置查找表 =====

function buildGeoLookup(indexData) {
  const lookup = [];
  const seen = new Set();

  for (const trail of indexData) {
    const geoLevels = [
      { level: 'continent', slug: trail.continent, name: trail.continent },
      { level: 'country', slug: trail.country, name: trail.country },
      { level: 'province', slug: trail.province, name: trail.province },
      { level: 'city', slug: trail.city, name: trail.city },
      { level: 'district', slug: trail.district, name: trail.district },
    ];

    for (const geo of geoLevels) {
      if (!geo.slug) continue;
      const key = `${geo.level}:${geo.slug}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const params = {};
      if (trail.continent) params.continent = trail.continent;
      if (trail.country && geo.level !== 'continent') params.country = trail.country;
      if (trail.province && (geo.level === 'province' || geo.level === 'city' || geo.level === 'district')) params.province = trail.province;
      if (trail.city && (geo.level === 'city' || geo.level === 'district')) params.city = trail.city;
      if (trail.district && geo.level === 'district') params.district = trail.district;

      const qs = Object.entries(params)
        .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
        .join('&');

      lookup.push({
        type: 'region',
        level: geo.level,
        slug: geo.slug,
        name: geo.name,
        href: '?' + qs,
      });
    }
  }

  return lookup;
}

// ===== SVG 图标 =====

const ICON_SEARCH = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>';
const ICON_CLOSE = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
const ICON_TRAIL = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 10l-5-5-5 5"/><path d="M12 5v14"/><circle cx="12" cy="19" r="2"/></svg>';
const ICON_REGION = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
const ICON_TAG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>';

// ===== 渲染页面 =====

function renderPage(main, indexData, geoLookup, initialQuery) {
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
      navigate(parseHrefToParams(href));
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
  return results.map(item => {
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
  for (const geo of geoLookup) {
    const key = geo.name.toLowerCase();
    if (!geoNameToSlug[key]) {
      geoNameToSlug[key] = { slug: geo.slug, level: geo.level };
    }
  }

  // 查询词是否匹配某个地区 slug
  const geoMatch = geoNameToSlug[q];

  // 多维度匹配
  const matched = indexData.filter(trail => {
    // 名称模糊匹配
    if (trail.name.toLowerCase().includes(q)) return true;
    if ((trail.nameEn || '').toLowerCase().includes(q)) return true;

    // 标签精确匹配
    if (Array.isArray(trail.tags)) {
      if (trail.tags.some(tag => tag.toLowerCase() === q)) return true;
    }

    // 地区名匹配：查询词是否匹配 trail 的某个地理字段
    if (geoMatch) {
      const geoFields = ['continent', 'country', 'province', 'city', 'district'];
      for (const field of geoFields) {
        if (trail[field] === geoMatch.slug) return true;
      }
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
      <a href="?trail=${encodeURIComponent(trail.name)}" class="trail-card">
        <div class="trail-card-name">${nameHighlighted}</div>
        ${trail.nameEn ? `<div class="trail-card-name-en">${escapeHtml(trail.nameEn)}</div>` : ''}
        <div class="trail-card-feature">${featureHighlighted}</div>
        <div class="trail-card-meta">
          <span class="trail-card-difficulty">难度 ${trail.difficulty || '?'}/10</span>
          <span class="trail-card-distance">${trail.distance != null ? trail.distance + ' km' : ''}</span>
          <span class="trail-card-distance">${trail.duration || ''}</span>
        </div>
        ${tagsHtml ? `<div class="trail-card-tags">${tagsHtml}</div>` : ''}
      </a>`;
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

function updateClearButton(btn, query) {
  btn.hidden = !query;
}

function updateURL(query) {
  const url = query ? '?search=' + encodeURIComponent(query) : window.location.pathname;
  history.replaceState({ search: query }, '', url);
}

/** 将 href 查询字符串解析为 params 对象 */
function parseHrefToParams(href) {
  const params = {};
  const qs = href.startsWith('?') ? href.slice(1) : href;
  for (const pair of qs.split('&')) {
    const [key, value] = pair.split('=');
    if (key) {
      params[decodeURIComponent(key)] = decodeURIComponent(value || '');
    }
  }
  return params;
}