/**
 * 地理分类页面模块
 * 支持大洲/国家/省/市/区县所有层级的地理分类展示
 */

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

/** 从 geo-index 解析友好的地理名称路径 */
function resolveGeoPath(params, geoIndex) {
  const parts = [];
  if (params.continent) {
    const c = geoIndex.continents.find(c => c.slug === params.continent);
    parts.push(c ? c.name : params.continent);
  }
  if (params.country) {
    const entry = geoIndex.countries[params.country];
    parts.push(entry ? entry.name : params.country);
  }
  if (params.province) {
    const entry = geoIndex.provinces[params.province];
    parts.push(entry ? entry.name : params.province);
  }
  if (params.city) {
    const entry = geoIndex.cities[params.city];
    parts.push(entry ? entry.name : params.city);
  }
  if (params.district) {
    const entry = geoIndex.districts[params.district];
    parts.push(entry ? entry.name : params.district);
  }
  return parts;
}

/** 按地理层级筛选路线 */
function filterTrails(trails, params) {
  return trails.filter(t => {
    if (params.continent && t.continent !== params.continent) return false;
    if (params.country   && t.country   !== params.country)   return false;
    if (params.province  && t.province  !== params.province)  return false;
    if (params.city      && t.city      !== params.city)      return false;
    if (params.district  && t.district  !== params.district)  return false;
    return true;
  });
}

/** HTML 转义 */
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** 渲染单张路线卡片 HTML */
function renderCard(trail) {
  const [c1, c2] = slugToColors(trail.slug);
  const diff = difficultyInfo(trail.difficulty);
  const tagsHtml = trail.tags
    .map(t => `<span class="geo-tag">${esc(t)}</span>`)
    .join('');

  return `
    <a href="?trail=${esc(trail.name)}" class="geo-card">
      <div class="geo-card__img" style="background: linear-gradient(135deg, ${c1}, ${c2});"></div>
      <div class="geo-card__body">
        <h3 class="geo-card__name">${esc(trail.name)}</h3>
        <div class="geo-card__meta">
          <span class="geo-card__badge" style="background:${diff.bg};color:${diff.color};">${trail.difficulty}</span>
          <span class="geo-card__stats">${trail.distance}km &middot; ${esc(trail.duration)}</span>
        </div>
        <p class="geo-card__feature">${esc(trail.feature)}</p>
        <div class="geo-card__tags">${tagsHtml}</div>
      </div>
    </a>`;
}

// ===== 骨架屏 =====

function skeletonCard() {
  return `
    <div class="geo-card geo-card--skeleton">
      <div class="geo-card__img geo-skel-img"></div>
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
    </div>
    <style id="geo-style">${getStyles()}</style>`;
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
    </div>
    <style id="geo-style">${getStyles()}</style>`;
}

// ===== 区县级：完整网格 + 排序 =====

function renderDistrictGrid(main, trails, pathParts) {
  const heading = pathParts.join(' › ') + ' · 徒步路线';
  const cardsHtml = trails.map(renderCard).join('');

  main.innerHTML = `
    <div class="geo-page container" data-level="district">
      <div class="geo-head">
        <h1 class="geo-head__title">${esc(heading)}</h1>
        <div class="geo-head__count">共 ${trails.length} 条路线</div>
        <div class="geo-sort">
          <button class="geo-sort__btn geo-sort__btn--active" data-sort="name">按名称排序</button>
          <button class="geo-sort__btn" data-sort="heat">按热度排序</button>
        </div>
      </div>
      <div class="geo-cards" id="geoCards">${cardsHtml}</div>
    </div>
    <style id="geo-style">${getStyles()}</style>`;

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

// ===== 大洲/国家/省/市级：瀑布流 + 无限滚动 =====

function renderMasonry(main, trails, pathParts) {
  const heading = pathParts.join(' › ') + ' · 徒步路线';
  const BATCH = 10;
  let offset = 0;
  let allLoaded = trails.length <= BATCH;

  function renderBatch() {
    const batch = trails.slice(offset, offset + BATCH);
    offset += BATCH;
    if (offset >= trails.length) allLoaded = true;
    return batch.map(renderCard).join('');
  }

  const initialCards = renderBatch();

  main.innerHTML = `
    <div class="geo-page container">
      <div class="geo-head">
        <h1 class="geo-head__title">${esc(heading)}</h1>
        <div class="geo-head__count">共 ${trails.length} 条路线</div>
      </div>
      <div class="geo-cards" id="geoCards">${initialCards}</div>
      <div class="geo-loadmore" id="geoLoadmore">
        ${allLoaded ? '' : '<div class="geo-spinner"></div>'}
      </div>
    </div>
    <style id="geo-style">${getStyles()}</style>`;

  if (allLoaded) return;

  // Intersection Observer 无限滚动
  const sentinel = document.getElementById('geoLoadmore');
  const cardsContainer = document.getElementById('geoCards');
  if (!sentinel || !cardsContainer) return;

  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting && !allLoaded) {
        // 模拟加载延迟
        sentinel.innerHTML = '<div class="geo-spinner"></div>';
        setTimeout(() => {
          const html = renderBatch();
          cardsContainer.insertAdjacentHTML('beforeend', html);
          if (allLoaded) {
            sentinel.innerHTML = '';
            observer.unobserve(sentinel);
          } else {
            sentinel.innerHTML = '<div class="geo-spinner"></div>';
          }
        }, 300);
      }
    }
  }, { rootMargin: '200px' });

  observer.observe(sentinel);
}

// ===== 主渲染入口 =====

export async function render(params) {
  const main = document.querySelector('.main');
  if (!main) return;

  const level = determineLevel(params);
  if (!level) {
    // 无有效地理参数 → 降级到空状态
    renderEmpty(main);
    return;
  }

  // 骨架屏
  renderSkeleton(main, 4);

  try {
    const hs = window.HashSearch.getInstance();

    // 使用缓存或重新加载
    let geoIndex, trails;
    const now = Date.now();
    if (cachedData && (now - cacheTimestamp) < CACHE_TTL) {
      geoIndex = cachedData.geoIndex;
      trails = cachedData.trails;
    } else {
      [geoIndex, trails] = await Promise.all([
        hs.get('/data/geo-index.json'),
        hs.get('/data/index.json')
      ]);
      cachedData = { geoIndex, trails };
      cacheTimestamp = now;
    }

    const pathParts = resolveGeoPath(params, geoIndex);
    const filtered = filterTrails(trails, params);

    if (filtered.length === 0) {
      renderEmpty(main);
      return;
    }

    if (level === 'district') {
      renderDistrictGrid(main, filtered, pathParts);
    } else {
      renderMasonry(main, filtered, pathParts);
    }
  } catch (err) {
    console.error('[geo] 加载失败:', err);
    main.innerHTML = `
      <div class="geo-page container">
        <div class="geo-empty">
          <p>数据加载失败，请稍后重试</p>
        </div>
      </div>
      <style id="geo-style">${getStyles()}</style>`;
  }
}

// ===== 内联样式 =====

function getStyles() {
  return `
    /* ===== Geo Page Layout ===== */
    .geo-page {
      padding-top: var(--space-lg);
      padding-bottom: var(--space-xl);
    }

    .geo-head {
      margin-bottom: var(--space-xl);
    }

    .geo-head__title {
      font-size: 1.75rem;
      font-weight: 700;
      color: var(--color-text);
      margin-bottom: var(--space-xs);
    }

    .geo-head__count {
      font-size: 0.9rem;
      color: var(--color-text-secondary);
      margin-bottom: var(--space-md);
    }

    /* ===== Sort Buttons (district) ===== */
    .geo-sort {
      display: flex;
      gap: var(--space-sm);
    }

    .geo-sort__btn {
      padding: 6px 16px;
      font-size: 0.875rem;
      border: 1px solid var(--color-border);
      border-radius: 20px;
      background: var(--color-card-bg);
      color: var(--color-text-secondary);
      cursor: pointer;
      transition: all 0.2s;
    }

    .geo-sort__btn:hover {
      border-color: var(--color-primary);
      color: var(--color-primary);
    }

    .geo-sort__btn--active {
      background: var(--color-primary);
      color: #fff;
      border-color: var(--color-primary);
    }

    .geo-sort__btn--active:hover {
      color: #fff;
    }

    /* ===== Card Grid ===== */
    .geo-cards {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--space-lg);
    }

    @media (max-width: 1024px) {
      .geo-cards {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media (max-width: 640px) {
      .geo-cards {
        grid-template-columns: 1fr;
      }

      .geo-head__title {
        font-size: 1.35rem;
      }
    }

    /* ===== Card ===== */
    .geo-card {
      display: block;
      text-decoration: none;
      color: inherit;
      background: var(--color-card-bg);
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 1px 3px var(--color-card-shadow);
      transition: transform 0.2s, box-shadow 0.2s;
      break-inside: avoid;
    }

    .geo-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 6px 20px var(--color-card-shadow);
    }

    .geo-card__img {
      height: 160px;
      display: flex;
      align-items: flex-end;
      justify-content: flex-start;
      padding: var(--space-md);
    }

    .geo-card__img::before {
      content: '🥾';
      font-size: 2rem;
      opacity: 0.5;
      filter: grayscale(0.3);
    }

    .geo-card__body {
      padding: var(--space-md);
    }

    .geo-card__name {
      font-size: 1.15rem;
      font-weight: 700;
      margin-bottom: var(--space-sm);
      color: var(--color-text);
      line-height: 1.4;
    }

    .geo-card__meta {
      display: flex;
      align-items: center;
      gap: var(--space-sm);
      margin-bottom: var(--space-sm);
    }

    .geo-card__badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      font-size: 0.8rem;
      font-weight: 700;
      flex-shrink: 0;
    }

    .geo-card__stats {
      font-size: 0.85rem;
      color: var(--color-text-secondary);
    }

    .geo-card__feature {
      font-size: 0.9rem;
      color: var(--color-text-secondary);
      margin-bottom: var(--space-sm);
      line-height: 1.5;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .geo-card__tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .geo-tag {
      display: inline-block;
      padding: 2px 10px;
      font-size: 0.75rem;
      border-radius: 12px;
      background: var(--color-bg-secondary);
      color: var(--color-text-secondary);
      border: 1px solid var(--color-border);
      white-space: nowrap;
    }

    /* ===== Skeleton ===== */
    .geo-skel {
      border-radius: 8px;
      background: linear-gradient(90deg, #e0e0e0 25%, #f0f0f0 50%, #e0e0e0 75%);
      background-size: 200% 100%;
      animation: geo-shimmer 1.5s ease-in-out infinite;
    }

    [data-theme="dark"] .geo-skel {
      background: linear-gradient(90deg, #2a3a4a 25%, #354f66 50%, #2a3a4a 75%);
      background-size: 200% 100%;
    }

    @keyframes geo-shimmer {
      0%   { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }

    .geo-card--skeleton {
      pointer-events: none;
    }

    .geo-card--skeleton .geo-card__img::before {
      content: none;
    }

    .geo-skel-img {
      border-radius: 8px;
      background: linear-gradient(90deg, #e0e0e0 25%, #f0f0f0 50%, #e0e0e0 75%);
      background-size: 200% 100%;
      animation: geo-shimmer 1.5s ease-in-out infinite;
    }

    [data-theme="dark"] .geo-skel-img {
      background: linear-gradient(90deg, #2a3a4a 25%, #354f66 50%, #2a3a4a 75%);
      background-size: 200% 100%;
    }

    .geo-skel--heading {
      height: 36px;
      width: 50%;
      margin-bottom: var(--space-xl);
    }

    .geo-skel--title {
      height: 22px;
      width: 70%;
      margin-bottom: 10px;
    }

    .geo-skel--meta {
      height: 28px;
      width: 50%;
      margin-bottom: 10px;
    }

    .geo-skel--text {
      height: 16px;
      width: 90%;
      margin-bottom: 10px;
    }

    .geo-skel--tags {
      height: 22px;
      width: 80%;
    }

    /* ===== Load More ===== */
    .geo-loadmore {
      display: flex;
      justify-content: center;
      padding: var(--space-xl) 0;
    }

    .geo-spinner {
      width: 32px;
      height: 32px;
      border: 3px solid var(--color-border);
      border-top-color: var(--color-primary);
      border-radius: 50%;
      animation: router-spin 0.8s linear infinite;
    }

    /* ===== Empty State ===== */
    .geo-empty {
      text-align: center;
      padding: 96px var(--space-md);
      color: var(--color-text-secondary);
    }

    .geo-empty__icon {
      margin-bottom: var(--space-md);
      color: var(--color-border);
    }

    .geo-empty p {
      font-size: 1.1rem;
    }
  `;
}