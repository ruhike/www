/**
 * 首页模块 - 每日随机推荐 + 核心入口模块
 */

import { escapeHtml, loadAllTrails, DIFFICULTIES } from './core.js';

// ===== 模块级数据缓存 =====
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟
let cachedData = null;
let cacheTimestamp = 0;

export async function render(params) {
  const main = document.querySelector('.main');
  if (!main) return;

  main.innerHTML = `
    <div class="router-loading">
      <div class="router-spinner"></div>
      <p>加载中...</p>
    </div>`;

  const hashSearch = window.HashSearch.getInstance();

  try {
    let trails, difficulties;
    const now = Date.now();
    if (cachedData && (now - cacheTimestamp) < CACHE_TTL) {
      trails = cachedData.trails;
      difficulties = cachedData.difficulties;
    } else {
      trails = await loadAllTrails();
      difficulties = DIFFICULTIES;
      cachedData = { trails, difficulties };
      cacheTimestamp = now;
    }

    if (!trails || trails.length === 0) {
      throw new Error('路线数据为空');
    }

    const today = getTodayDate();
    const entry = getDailyRandom(trails, today);
    const difficulty = findDifficulty(difficulties, entry.difficulty);

    // 加载推荐路线的完整数据（含途经点和轨迹）
    let trail;
    if (entry.hasTrack) {
      const trailPath = `/zh/${entry.country}/${entry.slug}.json`;
      trail = await hashSearch.get(trailPath);
    } else {
      const provincePath = `/zh/${entry.country}/${entry.province}.json`;
      const provinceTrails = await hashSearch.get(provincePath);
      trail = provinceTrails.find(t => t.slug === entry.slug);
    }

    // 提取精华景点（名称≠描述的重要地标）
    const highlights = pickHighlights(trail.waypoints || []);

    // 从途经点获取起终点展示名（去掉前缀）
    const wps = trail.waypoints || [];
    const startName = wps.length ? wps[0].name.replace(/^(起点·|进入·|终点·)/, '') : '';
    const endName = wps.length ? wps[wps.length - 1].name.replace(/^(起点·|进入·|终点·)/, '') : '';

    main.innerHTML = `
    <div class="page-home container">
      ${heroSection(trail, difficulty, highlights, entry, startName, endName)}
    </div>`;
  } catch (err) {
    console.error('[Home] 加载失败:', err);
    main.innerHTML = `
      <div class="router-error">
        <h2>加载失败</h2>
        <p>首页数据暂时无法加载，请稍后重试。</p>
        <a href="/">重新加载</a>
      </div>`;
  }
}

/* ===== 工具函数 ===== */

function getTodayDate() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getDailyRandom(trails, dateStr) {
  let hash = 0;
  for (let i = 0; i < dateStr.length; i++) {
    hash = ((hash << 5) - hash) + dateStr.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % trails.length;
  return trails[index];
}

function findDifficulty(difficulties, level) {
  if (!difficulties || !Array.isArray(difficulties)) return null;
  return difficulties.find(d => d.level === level) || null;
}

/**
 * 从途经点中提取精华景点（纯动态，不依赖路线特定名称）
 * 取起点、终点和中间均匀分布的 3 个路点，共最多 5 个
 */
function pickHighlights(waypoints) {
  if (!waypoints || !waypoints.length) return [];
  if (waypoints.length <= 5) return waypoints;
  // 起点 + 终点 + 3 个均匀分布的中间点
  const n = waypoints.length;
  const picked = [waypoints[0]];
  const step = (n - 2) / 4;
  for (let i = 1; i <= 3; i++) {
    picked.push(waypoints[Math.round(i * step)]);
  }
  picked.push(waypoints[n - 1]);
  return picked;
}

/**
 * 构建迷你轨迹 SVG（从 overview 坐标抽稀到约 40 个点）
 * 自动适配纵横比（经度按 cos(lat) 缩放），使南北向路线不会被横向拉伸
 */
function buildMiniTrailSVG(overview, highlights) {
  if (!overview || !overview.length) return null;
  const step = Math.max(1, Math.floor(overview.length / 40));
  const pts = [];
  let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;
  for (let i = 0; i < overview.length; i += step) {
    const [lat, lng] = overview[i];
    pts.push([lat, lng]);
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  if (pts.length < 2) return null;

  // 按地理距离计算正确的纵横比（纬度处 cos 缩放经度）
  const centerLat = (minLat + maxLat) / 2;
  const cosLat = Math.cos(centerLat * Math.PI / 180);
  const geoW = (maxLng - minLng) * cosLat;
  const geoH = maxLat - minLat;
  const aspect = Math.max(geoW / (geoH || 0.001), 0.4); // 最低纵横比 0.4

  const H = 200;
  const W = Math.max(Math.round(H * aspect), 200);
  const pad = 16;

  const lngR = maxLng - minLng || 0.01;
  const latR = maxLat - minLat || 0.01;
  const sx = (lng) => pad + (lng - minLng) / lngR * (W - pad * 2);
  const sy = (lat) => H - pad - (lat - minLat) / latR * (H - pad * 2);

  const pathD = pts.map(([lat, lng], i) =>
    `${i === 0 ? 'M' : 'L'}${sx(lng).toFixed(1)} ${sy(lat).toFixed(1)}`
  ).join(' ');

  const startPt = [sx(pts[0][1]), sy(pts[0][0])];
  const endPt = [sx(pts[pts.length-1][1]), sy(pts[pts.length-1][0])];

  // 沿途景点标记（在轨迹 SVG 上打点）
  let spotDots = '';
  if (highlights && highlights.length) {
    spotDots = highlights.map((h, i) => {
      const sc = SPOT_CONFIG[i] || SPOT_CONFIG[0];
      const x = sx(h.lng).toFixed(1);
      const y = sy(h.lat).toFixed(1);
      return `<circle cx="${x}" cy="${y}" r="4" fill="${sc.color}" stroke="#fff" stroke-width="1.5" opacity="0.9">
        <title>${escapeHtml(h.name)}</title>
      </circle>`;
    }).join('');
  }

  const svg = `
    <svg viewBox="0 0 ${W} ${H}" class="home-hero__trail-svg" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="trailGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#4caf50"/>
          <stop offset="30%" stop-color="#2d7d46"/>
          <stop offset="60%" stop-color="#f9a825"/>
          <stop offset="85%" stop-color="#e65100"/>
          <stop offset="100%" stop-color="#0277bd"/>
        </linearGradient>
        <filter id="trailGlow">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.5"/>
        </filter>
      </defs>
      <!-- 发光底层 -->
      <path d="${pathD}" fill="none" stroke="url(#trailGrad)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity="0.3" filter="url(#trailGlow)"/>
      <!-- 主轨迹 -->
      <path d="${pathD}" fill="none" stroke="url(#trailGrad)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <!-- 沿途景点 -->
      ${spotDots}
      <!-- 起点 -->
      <circle cx="${startPt[0].toFixed(1)}" cy="${startPt[1].toFixed(1)}" r="5" fill="#fff" stroke="#4caf50" stroke-width="2"/>
      <circle cx="${startPt[0].toFixed(1)}" cy="${startPt[1].toFixed(1)}" r="2.5" fill="#4caf50"/>
      <!-- 终点 -->
      <circle cx="${endPt[0].toFixed(1)}" cy="${endPt[1].toFixed(1)}" r="5" fill="#fff" stroke="#0277bd" stroke-width="2"/>
      <circle cx="${endPt[0].toFixed(1)}" cy="${endPt[1].toFixed(1)}" r="2.5" fill="#0277bd"/>
    </svg>`;

  // 返回 SVG 和边界（用于卫星图）
  return { svg, bounds: { minLng, maxLng, minLat, maxLat } };
}

/* ===== Hero 区域 ===== */

// 统计项颜色配置
const STAT_COLORS = [
  { color: '#e65100', bg: 'rgba(230,81,0,0.08)' },      // 距离
  { color: '#2d7d46', bg: 'rgba(45,125,70,0.08)' },  // 爬升
  { color: '#0277bd', bg: 'rgba(2,119,189,0.08)' },     // 时间
  { color: '#6a1b9a', bg: 'rgba(106,27,154,0.08)' },     // 最高海拔
];

// 精华景点图标/颜色配置
const SPOT_CONFIG = [
  { color: '#e65100', icon: '🏯' },
  { color: '#2d7d46', icon: '🍃' },
  { color: '#f9a825', icon: '🌳' },
  { color: '#6a1b9a', icon: '🏛️' },
  { color: '#0277bd', icon: '🏁' },
];

function heroSection(trail, difficulty, highlights, entry, startName, endName) {
  const trailUrl = `?trail=${encodeURIComponent(entry.name)}`;
  const trailData = buildMiniTrailSVG(trail.track?.overview, highlights);
  const miniTrail = trailData ? trailData.svg : '';

  // 卫星图背景 URL（ArcGIS World Imagery export）
  let satelliteBg = '';
  if (trailData && trailData.bounds) {
    const b = trailData.bounds;
    const padLng = 0.005;
    const padLat = 0.003;
    satelliteBg = `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?bbox=${(b.minLng-padLng).toFixed(4)},${(b.minLat-padLat).toFixed(4)},${(b.maxLng+padLng).toFixed(4)},${(b.maxLat+padLat).toFixed(4)}&bboxSR=4326&size=800,220&format=png&f=image`;
  }

  const highlightsHTML = highlights.length
    ? `<div class="home-hero__spots-label">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f9a825" stroke-width="2"><polygon points="12,2 15,9 22,9 16,14 18,22 12,17 6,22 8,14 2,9 9,9"/></svg>
        <span>沿途精华</span>
      </div>
      <div class="home-hero__spots">${highlights.map((h, i) => {
        const sc = SPOT_CONFIG[i] || SPOT_CONFIG[0];
        // 从数据库路点名称去掉前缀得到展示名
        const displayName = h.name.replace(/^(起点·|进入·|终点·)/, '');
        const alt = h.altitude != null ? Math.round(h.altitude) + 'm' : '';
        const dist = h.distanceFromStart != null ? h.distanceFromStart.toFixed(1) + 'km' : '';
        const meta = [alt, dist].filter(Boolean).join(' · ');
        // 描述优先用路点的 description（如果与名称不同）
        const desc = (h.description && h.description !== h.name) ? h.description : '';
        return `<div class="home-hero__spot" style="border-left: 3px solid ${sc.color}">
          <div class="home-hero__spot-head">
            <span class="home-hero__spot-icon">${sc.icon}</span>
            <div class="home-hero__spot-info">
              <span class="home-hero__spot-name" style="color:${sc.color}">${escapeHtml(displayName)}</span>
              ${meta ? `<span class="home-hero__spot-meta">${meta}</span>` : ''}
            </div>
          </div>
          ${desc ? `<p class="home-hero__spot-desc">${escapeHtml(desc)}</p>` : ''}
        </div>`;
      }).join('')}</div>`
    : '';

  const maxAlt = trail.maxAltitude ? `<span class="home-hero__stat" style="color:${STAT_COLORS[3].color};background:${STAT_COLORS[3].bg}">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12,2 22,22 2,22"/></svg>
    ${trail.maxAltitude} m
  </span>` : '';

  return `
    <a href="${trailUrl}" class="home-hero">
      <div class="home-hero__inner">
        <p class="home-hero__label">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#f9a825"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>
          <span>今日推荐</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="#f9a825"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z"/></svg>
        </p>

        <h1 class="home-hero__title">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#2d7d46" stroke-width="1.8"><path d="M12 2l3 6 6.5 1-4.5 4.5 1 6.5-6-3-6 3 1-6.5L2.5 9l6.5-1z" fill="#2d7d46" fill-opacity="0.15"/></svg>
          ${escapeHtml(trail.name)}
        </h1>

        ${difficulty
          ? `<span class="home-hero__badge" style="background:${badgeColor(difficulty.level)};color:#fff">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="4,17 12,7 20,17"/></svg>
              ${escapeHtml(difficulty.name)}
            </span>`
          : ''}

        <div class="home-hero__meta">
          <span class="home-hero__stat" style="color:${STAT_COLORS[0].color};background:${STAT_COLORS[0].bg}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 2 11 13 7 7"/></svg>
            ${trail.distance ?? '-'} km
          </span>
          <span class="home-hero__stat" style="color:${STAT_COLORS[1].color};background:${STAT_COLORS[1].bg}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            ${trail.ascent ?? '-'} m
          </span>
          <span class="home-hero__stat" style="color:${STAT_COLORS[2].color};background:${STAT_COLORS[2].bg}">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            ${escapeHtml(trail.duration || '-')}
          </span>
          ${maxAlt}
        </div>

        ${miniTrail ? `<div class="home-hero__trail-wrap"${satelliteBg ? ` style="background-image:url('${satelliteBg}')"` : ''}>${miniTrail}
          <div class="home-hero__trail-labels">
            <span class="home-hero__trail-start">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="#4caf50"><circle cx="12" cy="12" r="10"/></svg>
              ${escapeHtml(startName)}
            </span>
            <span class="home-hero__trail-arrow">
              <svg width="60" height="12" viewBox="0 0 60 12"><line x1="0" y1="6" x2="50" y2="6" stroke="#c0c0c0" stroke-width="1" stroke-dasharray="3,3"/><polygon points="52,2 60,6 52,10" fill="#c0c0c0"/></svg>
            </span>
            <span class="home-hero__trail-end">
              ${escapeHtml(endName)}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="#ff8a65"><circle cx="12" cy="12" r="10"/></svg>
            </span>
          </div>
        </div>` : ''}

        ${highlightsHTML}

      </div>
    </a>`;
}

// 难度徽章颜色
function badgeColor(level) {
  const colors = ['#4caf50','#8bc34a','#cddc39','#ffc107','#ff9800','#f57c00','#ff7043','#e64a19','#f44336','#e91e63','#9c27b0','#7b1fa2','#4a148c'];
  return colors[Math.min(level - 1, colors.length - 1)] || '#4caf50';
}

