/**
 * 地理分类页面模块
 * 支持大洲/国家/省/市/区县所有层级的地理分类展示
 * 逐级下钻：大洲 → 国家 → 省 → 市 → 区县 → 路线
 */

import geoHierarchyData from './geo-hierarchy.js';
import { escapeHtml, matchesGeo, loadAllTrails } from './core.js';

// ===== 模块级数据缓存 =====
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟
let cachedData = null;
let cacheTimestamp = 0;

// ===== 工具函数 =====

/** 从 slug 生成渐变色 */
function slugToColors(slug) {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = slug.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = ((hash % 360) + 360) % 360;
  return [
    `hsl(${hue}, 55%, 48%)`,
    `hsl(${(hue + 35) % 360}, 65%, 32%)`
  ];
}

/** 难度徽章信息 */
function difficultyInfo(level) {
  if (level <= 3) return { color: '#2d6a4f', bg: '#d8f3dc' };
  if (level <= 6) return { color: '#e76f51', bg: '#fde2d3' };
  if (level <= 8) return { color: '#c1121f', bg: '#ffd6d6' };
  return { color: '#7b2d8b', bg: '#f0d6f5' };
}

/** 根据路由参数确定地理层级 */
function determineLevel(params) {
  if (params.district) return 'district';
  if (params.city)     return 'city';
  if (params.province) return 'province';
  if (params.country)  return 'country';
  if (params.continent) return 'continent';
  return null;
}

/** 从路由参数构建地理路径片段 */
function resolveGeoPath(params, trails) {
  const parts = [];
  if (params.continent && params.continent !== 'world') {
    parts.push(params.continent);
  } else if (params.continent === 'world') {
    parts.push('世界');
  }
  if (params.country) parts.push(params.country);
  if (params.province) parts.push(params.province);
  if (params.city) parts.push(params.city);
  if (params.district) parts.push(params.district);
  return parts;
}

/** 按地理层级筛选路线 */
function filterTrails(trails, params) {
  return trails.filter(t => matchesGeo(t, params));
}

// ===== 路线卡片图标 =====
const TRAIL_ICONS = ['🥾', '⛰️', '🏔️', '🌲', '🌿', '🗻', '🏕️', '🧗', '🚶', '🎒', '🦯', '🏞️'];

/** 根据 slug 哈希取图标，确保同一条路线图标固定且不同路线尽量不同 */
function getTrailIcon(slug) {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = slug.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TRAIL_ICONS[Math.abs(hash) % TRAIL_ICONS.length];
}

/** 渲染单张路线卡片 HTML */
function renderCard(trail) {
  const [c1] = slugToColors(trail.slug);
  const diff = difficultyInfo(trail.difficulty);
  const icon = getTrailIcon(trail.slug);
  const tagsHtml = trail.tags
    .map(t => `<span class="geo-tag">${escapeHtml(t)}</span>`)
    .join('');

  return `
    <a href="?trail=${escapeHtml(trail.name)}" class="geo-card">
      <div class="geo-card__accent" style="background:${c1};"></div>
      <div class="geo-card__body">
        <h3 class="geo-card__name"><span class="geo-card__icon">${icon}</span>${escapeHtml(trail.name)}</h3>
        <div class="geo-card__meta">
          <span class="geo-card__badge" style="background:${diff.bg};color:${diff.color};">${trail.difficulty}</span>
          <span class="geo-card__stats">${trail.distance}km &middot; ${escapeHtml(trail.duration)}</span>
        </div>
        <p class="geo-card__feature">${escapeHtml(trail.feature)}</p>
        <div class="geo-card__tags">${tagsHtml}</div>
      </div>
    </a>`;
}

// ===== 骨架屏 =====

function skeletonCard() {
  return `
    <div class="geo-card geo-card--skeleton">
      <div class="geo-card__accent geo-skel-accent"></div>
      <div class="geo-card__body">
        <div class="geo-skel geo-skel--title"></div>
        <div class="geo-skel geo-skel--meta"></div>
        <div class="geo-skel geo-skel--text"></div>
        <div class="geo-skel geo-skel--tags"></div>
      </div>
    </div>`;
}

function renderSkeleton(main, count) {
  const cards = Array.from({ length: count || 4 }, () => skeletonCard()).join('');
  main.innerHTML = `
    <div class="geo-page container">
      <div class="geo-skel geo-skel--heading"></div>
      <div class="geo-cards">${cards}</div>
    </div>`;
}

// ===== 空状态 =====

function renderEmpty(main) {
  main.innerHTML = `
    <div class="geo-page container">
      <div class="geo-empty">
        <div class="geo-empty__icon">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/>
          </svg>
        </div>
        <p>该地区暂无路线</p>
      </div>
    </div>`;
}

// ===== 区县级：完整网格 + 排序 =====

function renderDistrictGrid(main, trails, pathParts) {
  const cardsHtml = trails.map(renderCard).join('');

  main.innerHTML = `
    <div class="geo-page container" data-level="district">
      <div class="geo-head">
        <div class="geo-head__count">共 ${trails.length} 条路线</div>
        <div class="geo-sort">
          <button class="geo-sort__btn geo-sort__btn--active" data-sort="name">按名称排序</button>
          <button class="geo-sort__btn" data-sort="heat">按热度排序</button>
        </div>
      </div>
      <div class="geo-cards" id="geoCards">${cardsHtml}</div>
    </div>`;

  bindSortButtons(trails, pathParts);
}

function bindSortButtons(trails, pathParts) {
  const sortName = document.querySelector('.geo-sort__btn[data-sort="name"]');
  const sortHeat = document.querySelector('.geo-sort__btn[data-sort="heat"]');
  const container = document.getElementById('geoCards');
  if (!sortName || !sortHeat || !container) return;

  sortName.addEventListener('click', () => {
    sortName.classList.add('geo-sort__btn--active');
    sortHeat.classList.remove('geo-sort__btn--active');
    const sorted = [...trails].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
    container.innerHTML = sorted.map(renderCard).join('');
  });

  sortHeat.addEventListener('click', () => {
    sortHeat.classList.add('geo-sort__btn--active');
    sortName.classList.remove('geo-sort__btn--active');
    const sorted = [...trails].sort((a, b) => (b.heat || 0) - (a.heat || 0));
    container.innerHTML = sorted.map(renderCard).join('');
  });
}

// ===== 地理层级卡片（大洲/国家/省/市/区县） =====

/** 从 geo-hierarchy 树中提取当前层级下的子节点 */
function getChildNodes(geoHierarchy, params, level) {
  const tree = geoHierarchy.tree;
  const children = [];

  if (level === 'continent') {
    if (params.continent === 'world') {
      for (const [slug, data] of Object.entries(tree)) {
        children.push({
          slug,
          name: data.name,
          trailCount: data.trailCount || 0,
          childCount: Object.keys(data.children || {}).length,
          childType: '国家',
        });
      }
    } else {
      const cont = tree[params.continent];
      if (cont && cont.children) {
        for (const [slug, data] of Object.entries(cont.children)) {
          children.push({
            slug,
            name: data.name,
            trailCount: data.trailCount || 0,
            childCount: Object.keys(data.children || {}).length,
            childType: '省份',
          });
        }
      }
    }
  } else if (level === 'country') {
    const cont = tree[params.continent || 'asia'];
    const country = cont?.children?.[params.country];
    if (country && country.children) {
      for (const [slug, data] of Object.entries(country.children)) {
        children.push({
          slug,
          name: data.name,
          trailCount: data.trailCount || 0,
          childCount: Object.keys(data.children || {}).length,
          childType: '城市',
        });
      }
    }
  } else if (level === 'province') {
    const cont = tree[params.continent || 'asia'];
    const prov = cont?.children?.[params.country]?.children?.[params.province];
    if (prov && prov.children) {
      for (const [slug, data] of Object.entries(prov.children)) {
        children.push({
          slug,
          name: data.name,
          trailCount: data.trailCount || 0,
          childCount: Object.keys(data.children || {}).length,
          childType: '区县',
        });
      }
    }
  } else if (level === 'city') {
    const cont = tree[params.continent || 'asia'];
    const city = cont?.children?.[params.country]?.children?.[params.province]?.children?.[params.city];
    if (city && city.children) {
      for (const [slug, data] of Object.entries(city.children)) {
        children.push({
          slug,
          name: data.name,
          trailCount: data.trailCount || 0,
          childCount: 0,
          childType: '路线',
        });
      }
    }
  }

  children.sort((a, b) => b.trailCount - a.trailCount);
  return children;
}

/** 构建下一级地理页面的 URL */
function buildGeoUrl(params, level, childSlug) {
  const p = {};
  if (params.continent && params.continent !== 'world') p.continent = params.continent;
  if (params.country) p.country = params.country;
  if (params.province) p.province = params.province;
  if (params.city) p.city = params.city;

  if (level === 'continent' && params.continent === 'world') {
    p.continent = childSlug;
  } else if (level === 'continent') {
    p.country = childSlug;
  } else if (level === 'country') {
    p.province = childSlug;
  } else if (level === 'province') {
    p.city = childSlug;
  } else if (level === 'city') {
    p.district = childSlug;
  }

  const parts = [];
  if (p.continent) parts.push(`continent=${encodeURIComponent(p.continent)}`);
  if (p.country) parts.push(`country=${encodeURIComponent(p.country)}`);
  if (p.province) parts.push(`province=${encodeURIComponent(p.province)}`);
  if (p.city) parts.push(`city=${encodeURIComponent(p.city)}`);
  if (p.district) parts.push(`district=${encodeURIComponent(p.district)}`);
  return '?' + parts.join('&');
}

/** 地理层级图标（每个层级不同） */
const REGION_ICONS = {
  world:    ['🌍', '🌎', '🌏'],
  continent: ['🏛️', '🏰', '🗼', '🕌', '⛩️', '🕍'],
  country:  ['🗺️', '🏴', '🏳️', '🚩'],
  province: ['🏔️', '⛰️', '🌋', '🗻'],
  city:     ['🏙️', '🏘️', '🏗️', '🌆'],
  district: ['📍', '📌', '🧭', '🏷️'],
};

function getRegionIcon(level, params, idx) {
  let key = level;
  if (level === 'continent' && params?.continent === 'world') key = 'world';
  const pool = REGION_ICONS[key] || REGION_ICONS.district;
  return pool[idx % pool.length];
}

/** 渲染地理层级卡片 */
function renderGeoCard(item, params, level, idx) {
  const [c1] = slugToColors(item.slug + idx);
  const url = buildGeoUrl(params, level, item.slug);
  const icon = getRegionIcon(level, params, idx);

  return `
    <a href="${url}" class="geo-region-card">
      <div class="geo-region-card__accent" style="background:${c1};"></div>
      <div class="geo-region-card__body">
        <h3 class="geo-region-card__name"><span class="geo-region-card__icon">${icon}</span>${escapeHtml(item.name)}</h3>
        <div class="geo-region-card__stats">
          <span class="geo-region-card__count">${item.trailCount} 条路线</span>
          ${item.childCount > 0 ? `<span class="geo-region-card__sub">${item.childCount} 个${item.childType}</span>` : ''}
        </div>
      </div>
    </a>`;
}

/** 渲染地理层级网格 */
function renderGeoGrid(main, children, params, level) {
  const cardsHtml = children.map((item, i) => renderGeoCard(item, params, level, i)).join('');
  const label = getLevelLabel(level, params);

  main.innerHTML = `
    <div class="geo-page container" data-level="${level}">
      <div class="geo-head">
        <div class="geo-head__count">共 ${children.length} 个${label}</div>
      </div>
      <div class="geo-cards">${cardsHtml}</div>
    </div>`;
}

function getLevelLabel(level, params) {
  if (level === 'continent' && params?.continent === 'world') return '大洲';
  const labels = {
    continent: '国家',
    country: '省份',
    province: '城市',
    city: '区县',
    district: '路线',
  };
  return labels[level] || '地区';
}

// ===== 主渲染入口 =====

export async function render(params) {
  const main = document.querySelector('.main');
  if (!main) return;

  const level = determineLevel(params);
  if (!level) {
    renderEmpty(main);
    return;
  }

  renderSkeleton(main, 4);

  try {

    let trails, geoHierarchy;
    const now = Date.now();
    if (cachedData && (now - cacheTimestamp) < CACHE_TTL) {
      trails = cachedData.trails;
      geoHierarchy = cachedData.geoHierarchy;
    } else {
      geoHierarchy = geoHierarchyData;
      trails = await loadAllTrails();
      cachedData = { trails, geoHierarchy };
      cacheTimestamp = now;
    }

    const pathParts = resolveGeoPath(params, trails);

    if (level === 'district') {
      const filtered = filterTrails(trails, params);
      if (filtered.length === 0) {
        renderEmpty(main);
        return;
      }
      renderDistrictGrid(main, filtered, pathParts);
      return;
    }

    const children = getChildNodes(geoHierarchy, params, level);

    if (children.length === 0) {
      const filtered = filterTrails(trails, params);
      if (filtered.length === 0) {
        renderEmpty(main);
        return;
      }
      renderDistrictGrid(main, filtered, pathParts);
      return;
    }

    renderGeoGrid(main, children, params, level);

  } catch (err) {
    console.error('[geo] 加载失败:', err);
    main.innerHTML = `
      <div class="geo-page container">
        <div class="geo-empty">
          <p>数据加载失败，请稍后重试</p>
        </div>
      </div>`;
  }
}

