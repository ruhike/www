/**
 * 路线详情页面模块
 */

import { initBreadcrumb, buildGeoPath, renderBreadcrumb } from '../core/breadcrumb.js';

let stylesInjected = false;

export async function render(params) {
  const main = document.querySelector('.main');
  if (!main) return;

  const slug = params.trail;
  if (!slug) {
    main.innerHTML = '<div class="router-error"><h1>404</h1><p>未指定路线</p></div>';
    return;
  }

  if (!stylesInjected) {
    injectStyles();
    stylesInjected = true;
  }

  main.innerHTML = '<div class="router-loading"><div class="router-spinner"></div><p>加载路线数据...</p></div>';

  try {
    const hs = new window.HashSearch();

    const index = await hs.get('/data/index.json');
    const entry = index.find(t => t.name === slug);
    if (!entry) {
      main.innerHTML = `<div class="router-error"><h1>404</h1><p>路线「${escapeHtml(slug)}」未找到</p><a href="/">返回首页</a></div>`;
      return;
    }

    const trailPath = `/data/${entry.country}/${entry.province}/${entry.city}/${entry.district}/${entry.slug}.json`;
    const [trail, difficulties] = await Promise.all([
      hs.get(trailPath),
      hs.get('/data/difficulties.json')
    ]);

    const diffInfo = difficulties.find(d => d.level === trail.difficulty);

    // 面包屑：基于 geo-hierarchy.json 构建完整层级路径
    try {
      await initBreadcrumb();
      const crumbs = buildGeoPath(trail);
      const el = document.getElementById('breadcrumbBar');
      if (el) {
        el.innerHTML = renderBreadcrumb(crumbs, {
          label: trail.name || slug,
          linked: false
        });
      }
    } catch (e) {
      console.warn('[Trail] 面包屑更新失败:', e);
    }

    main.innerHTML = buildPage(trail, diffInfo, slug);

    document.title = `ruhike - ${trail.name}`;

    window.dispatchEvent(new CustomEvent('trail-map-ready', {
      detail: {
        slug,
        overview: trail.track?.overview || null,
        fullFile: trail.track?.fullFile || null,
        waypoints: trail.waypoints || null
      }
    }));

    window.scrollTo({ top: 0, behavior: 'instant' });

  } catch (err) {
    console.error('[Trail] 加载失败:', err);
    main.innerHTML = '<div class="router-error"><h2>加载失败</h2><p>路线数据暂时无法加载，请稍后重试。</p><a href="/">返回首页</a></div>';
  }
}

// ---- HTML 构建 ----

function buildPage(trail, diffInfo, slug) {
  return `
    <div class="page-trail">
      ${buildBasicInfo(trail, diffInfo)}
      ${buildGraduationTip(trail)}
      ${buildTrailMapSection(slug)}
      ${trail.waypoints && trail.waypoints.length >= 2 ? buildElevationSection(trail.waypoints) : ''}
      ${trail.waypoints && trail.waypoints.length ? buildWaypointsSection(trail) : ''}
      ${buildDeepContent(trail)}
      ${buildDisclaimer()}
    </div>`;
}

function buildBasicInfo(trail, diffInfo) {
  const level = trail.difficulty;
  const hue = 120 - (level - 1) * 10;
  const badgeColor = `hsl(${hue}, 65%, 42%)`;

  const tagsHtml = (trail.tags || []).map(t =>
    `<a href="?tag=${encodeURIComponent(t)}" class="trail-tag">${escapeHtml(t)}</a>`
  ).join('');

  return `
    <section class="trail-hero">
      <h1 class="trail-title">${escapeHtml(trail.name)}</h1>
      ${trail.nameEn ? `<p class="trail-subtitle">${escapeHtml(trail.nameEn)}</p>` : ''}
      <div class="trail-difficulty">
        <span class="trail-badge" style="background:${badgeColor}">
          ${diffInfo ? escapeHtml(diffInfo.name) : '难度'} <small>Lv.${level}</small>
        </span>
      </div>
      <div class="trail-stats">
        ${trail.distance ? `<span class="trail-stat"><strong>${trail.distance.toFixed(1)} km</strong><small>里程</small></span>` : ''}
        ${trail.ascent ? `<span class="trail-stat"><strong>${trail.ascent.toLocaleString()} m</strong><small>累计爬升</small></span>` : ''}
        ${trail.descent ? `<span class="trail-stat"><strong>${trail.descent.toLocaleString()} m</strong><small>累计下降</small></span>` : ''}
        ${trail.duration ? `<span class="trail-stat"><strong>${escapeHtml(trail.duration)}</strong><small>预计时长</small></span>` : ''}
        ${trail.maxAltitude ? `<span class="trail-stat"><strong>${trail.maxAltitude.toLocaleString()} m</strong><small>最高海拔</small></span>` : ''}
        ${trail.minAltitude ? `<span class="trail-stat"><strong>${trail.minAltitude.toLocaleString()} m</strong><small>最低海拔</small></span>` : ''}
      </div>
      ${tagsHtml ? `<div class="trail-tags">${tagsHtml}</div>` : ''}
    </section>`;
}

function buildGraduationTip(trail) {
  // 从路点数据获取起终点和最高点名称
  const wps = trail.waypoints || [];
  const startWp = wps.length ? wps[0] : null;
  const endWp = wps.length ? wps[wps.length - 1] : null;
  const topWp = wps.length
    ? wps.reduce((max, wp) => (wp.altitude || 0) > (max.altitude || 0) ? wp : max, wps[0])
    : null;

  const startName = startWp ? startWp.name.replace(/^(起点·|进入·|终点·)/, '') : '';
  const endName = endWp ? endWp.name.replace(/^(起点·|进入·|终点·)/, '') : '';
  const topName = topWp ? topWp.name.replace(/^(起点·|进入·|终点·)/, '') : '';

  return `
    <div class="trail-graduation-tip">
      <div class="trail-graduation-tip__badge">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2z"/>
        </svg>
      </div>
      <div class="trail-graduation-tip__content">
        <h3 class="trail-graduation-tip__title">${escapeHtml(trail.feature || trail.name)}</h3>
        <p class="trail-graduation-tip__text">
          全程<span class="trail-graduation-tip__stat">${trail.distance}公里</span>，
          累计爬升<span class="trail-graduation-tip__stat">${trail.ascent}米</span>，
          最高海拔<span class="trail-graduation-tip__stat">${trail.maxAltitude}米</span>，
          预计耗时<span class="trail-graduation-tip__stat">${escapeHtml(trail.duration || '-')}</span>。
        </p>
        <div class="trail-graduation-tip__stats">
          <div class="trail-graduation-tip__stat-item">
            <strong>起点</strong>
            <span>${escapeHtml(startName)}</span>
          </div>
          <div class="trail-graduation-tip__stat-item">
            <strong>终点</strong>
            <span>${escapeHtml(endName)}</span>
          </div>
          <div class="trail-graduation-tip__stat-item">
            <strong>最高点</strong>
            <span>${escapeHtml(topName)} ${trail.maxAltitude}m</span>
          </div>
        </div>
      </div>
    </div>`;
}

function buildDeepContent(trail) {
  let html = '<section class="trail-content">';

  if (trail.feature) {
    html += `<blockquote class="trail-feature">${escapeHtml(trail.feature)}</blockquote>`;
  }

  if (trail.story) {
    html += '<div class="trail-story">';
    const lines = trail.story.split('\n');
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (line.startsWith('## ')) {
        // 章节标题
        const title = line.slice(3).trim();
        html += `<h3>${escapeHtml(title)}</h3>`;
        i++;
      } else if (line.startsWith('**') && line.includes('**')) {
        // 粗体段落标题
        html += `<p class="trail-story__highlight">${renderInlineMarkdown(line)}</p>`;
        i++;
      } else if (line.trim() === '' || line.trim() === '---') {
        i++;
      } else {
        // 普通段落
        html += `<p>${renderInlineMarkdown(line)}</p>`;
        i++;
      }
    }
    html += '</div>';
  }

  html += '</section>';
  return html;
}

function buildWaypointsSection(trail) {
  const waypoints = trail.waypoints || [];

  const items = waypoints.map((wp, i) => `
    <li class="trail-waypoint" data-index="${i}">
      <div class="trail-waypoint__marker"></div>
      <div class="trail-waypoint__body">
        <h4 class="trail-waypoint__name">
          <span class="trail-waypoint__num">${i + 1}.</span>
          ${escapeHtml(wp.name)}
          ${buildSurfaceIcon(wp.surface)}
        </h4>
        ${wp.description ? `<p class="trail-waypoint__desc">${escapeHtml(wp.description)}</p>` : ''}
        <div class="trail-waypoint__meta">
          ${wp.altitude ? `<span>海拔 ${wp.altitude.toLocaleString()}m</span>` : ''}
          ${wp.distanceFromStart != null ? `<span>距起点 ${wp.distanceFromStart.toFixed(1)} km</span>` : ''}
        </div>
      </div>
    </li>
  `).join('');

  return `
    <section class="trail-waypoints">
      <h2>途经点</h2>
      <ol class="trail-waypoints__list">${items}</ol>
    </section>`;
}

function buildSurfaceIcon(surface) {
  if (!surface) return '';
  const labels = { paved: '铺装路面', dirt: '土路', rocky: '碎石路', gravel: '砂石路' };
  return `<span class="trail-surface trail-surface--${surface}" title="${labels[surface] || surface}"></span>`;
}

function buildElevationSection(waypoints) {
  return `
    <section class="trail-elevation">
      <h2>海拔剖面图</h2>
      <div class="trail-elevation__chart">
        ${buildElevationChart(waypoints)}
      </div>
      <div class="trail-elevation__legend">
        <span><i style="background:#95a5a6;"></i>铺装</span>
        <span><i style="background:#8B4513;border-style:dashed;"></i>土路</span>
        <span><i style="background:#666;border-style:dotted;"></i>碎石</span>
        <span><i style="background:#ccc;border-style:dotted;"></i>砂石</span>
      </div>
    </section>`;
}

function buildTrailMapSection(slug) {
  return `<section class="trail-map-section"><h2>轨迹地图</h2><div id="trail-map" class="trail-map" data-slug="${escapeHtml(slug)}"></div></section>`;
}

function buildDisclaimer() {
  return `
    <section class="trail-disclaimer">
      <p>免责声明：本站内容源自互联网公开信息整理，不保证其准确性和完整性，仅供参考，不构成任何出行建议。徒步有风险，出行前请做好充分准备并关注当地天气与路况。</p>
    </section>`;
}

// ---- SVG 海拔剖面图 ----

function buildElevationChart(waypoints) {
  const padding = { top: 30, right: 24, bottom: 44, left: 56 };
  const totalW = 760;
  const totalH = 380;
  const innerW = totalW - padding.left - padding.right;
  const innerH = totalH - padding.top - padding.bottom;

  const dists = waypoints.map(w => w.distanceFromStart);
  const alts = waypoints.map(w => w.altitude);
  const maxDist = Math.max(...dists) || 1;
  const minAlt = Math.min(...alts);
  const maxAlt = Math.max(...alts);
  const altRange = (maxAlt - minAlt) || 1;
  const altPad = altRange * 0.08;

  const toX = (d) => padding.left + (d / maxDist) * innerW;
  const toY = (a) => padding.top + innerH - ((a - minAlt + altPad) / (altRange + altPad * 2)) * innerH;

  // area path
  let areaPath = `M${toX(dists[0])},${padding.top + innerH}`;
  for (let i = 0; i < waypoints.length; i++) {
    areaPath += ` L${toX(dists[i])},${toY(alts[i])}`;
  }
  areaPath += ` L${toX(dists[dists.length - 1])},${padding.top + innerH} Z`;

  // segments by surface
  const surfaceColors = { paved: '#95a5a6', dirt: '#8B4513', rocky: '#666', gravel: '#ccc' };
  const surfaceDash = { paved: '', dirt: '', rocky: '8,4', gravel: '3,5' };

  let segmentsHtml = '';
  for (let i = 0; i < waypoints.length - 1; i++) {
    const s = waypoints[i].surface || 'paved';
    const color = surfaceColors[s] || '#95a5a6';
    const dash = surfaceDash[s] || '';
    segmentsHtml += `<line x1="${toX(dists[i]).toFixed(1)}" y1="${toY(alts[i]).toFixed(1)}" x2="${toX(dists[i + 1]).toFixed(1)}" y2="${toY(alts[i + 1]).toFixed(1)}" stroke="${color}" stroke-width="2.5"${dash ? ` stroke-dasharray="${dash}"` : ''} stroke-linecap="round"/>`;
  }

  // waypoint dots
  let dotsHtml = '';
  for (let i = 0; i < waypoints.length; i++) {
    dotsHtml += `<circle cx="${toX(dists[i]).toFixed(1)}" cy="${toY(alts[i]).toFixed(1)}" r="5" fill="var(--color-primary)" stroke="#fff" stroke-width="2" class="elevation-dot"><title>${escapeHtml(waypoints[i].name)} — ${alts[i].toLocaleString()}m</title></circle>`;
  }

  // Y ticks
  const yTickCount = 5;
  let yTicks = '';
  for (let i = 0; i <= yTickCount; i++) {
    const alt = minAlt - altPad + ((altRange + altPad * 2) / yTickCount) * i;
    const y = toY(alt);
    yTicks += `<text x="${padding.left - 10}" y="${y + 4}" text-anchor="end" font-size="11" fill="var(--color-text-secondary)">${Math.round(alt)}m</text>`;
    if (i > 0 && i < yTickCount) {
      yTicks += `<line x1="${padding.left}" y1="${y}" x2="${totalW - padding.right}" y2="${y}" stroke="var(--color-border)" stroke-width="0.5" stroke-dasharray="4,4" opacity="0.4"/>`;
    }
  }

  // X ticks
  const xTickCount = Math.min(6, Math.max(2, Math.ceil(maxDist / 5)));
  let xTicks = '';
  for (let i = 0; i <= xTickCount; i++) {
    const dist = (maxDist / xTickCount) * i;
    const x = toX(dist);
    xTicks += `<text x="${x}" y="${padding.top + innerH + 20}" text-anchor="middle" font-size="11" fill="var(--color-text-secondary)">${dist.toFixed(1)} km</text>`;
  }

  // Y axis label
  const yLabelY = padding.top + innerH / 2;

  return `<svg viewBox="0 0 ${totalW} ${totalH}" class="elevation-chart" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="elevationGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--color-primary)" stop-opacity="0.25"/>
        <stop offset="100%" stop-color="var(--color-primary)" stop-opacity="0.02"/>
      </linearGradient>
    </defs>
    <!-- grid -->${yTicks}
    <!-- area --><path d="${areaPath}" fill="url(#elevationGrad)"/>
    <!-- segments -->${segmentsHtml}
    <!-- dots -->${dotsHtml}
    <!-- Y axis --><line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${padding.top + innerH}" stroke="var(--color-text-secondary)" stroke-width="1"/>
    <text x="14" y="${yLabelY}" text-anchor="middle" font-size="12" fill="var(--color-text-secondary)" transform="rotate(-90, 14, ${yLabelY})">海拔 (m)</text>
    <!-- X axis --><line x1="${padding.left}" y1="${padding.top + innerH}" x2="${totalW - padding.right}" y2="${padding.top + innerH}" stroke="var(--color-text-secondary)" stroke-width="1"/>
    ${xTicks}
    <text x="${padding.left + innerW / 2}" y="${totalH - 4}" text-anchor="middle" font-size="12" fill="var(--color-text-secondary)">距离 (km)</text>
  </svg>`;
}

// ---- 样式注入 ----

function injectStyles() {
  const style = document.createElement('style');
  style.id = 'trail-page-styles';
  style.textContent = `
/* ===== Trail Page Layout ===== */
.page-trail {
  width: 100%;
  margin: 0 auto;
  padding: 0 var(--content-px);
}

.page-trail h2 {
  font-size: 1.35rem;
  margin: var(--space-lg) 0 var(--space-sm);
  padding-bottom: var(--space-xs);
  border-bottom: 3px solid var(--color-primary);
  color: var(--color-text);
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.page-trail h2::before {
  content: '';
  display: inline-block;
  width: 6px;
  height: 20px;
  border-radius: 3px;
  background: linear-gradient(135deg, var(--color-primary), var(--color-accent-gold));
}

.page-trail h3 {
  font-size: 1.1rem;
  margin: var(--space-md) 0 var(--space-xs);
  color: var(--color-text);
}

/* ===== Hero / Basic Info ===== */
.trail-hero {
  text-align: center;
  padding: var(--space-lg) var(--content-px) var(--space-md);
  background: linear-gradient(180deg,
    rgba(var(--color-primary-rgb, 45, 125, 70), 0.04) 0%,
    transparent 100%);
  border-bottom: 1px solid var(--color-border);
  margin-bottom: var(--space-lg);
}

.trail-title {
  font-size: 2rem;
  color: var(--color-text);
  margin-bottom: var(--space-xs);
  line-height: 1.3;
}

.trail-subtitle {
  font-size: 1.05rem;
  color: var(--color-text-secondary);
  margin-bottom: var(--space-md);
  font-style: italic;
}

.trail-difficulty {
  margin-bottom: var(--space-md);
}

.trail-badge {
  display: inline-block;
  padding: 5px 16px;
  border-radius: 20px;
  color: #fff;
  font-weight: 700;
  font-size: 0.95rem;
  letter-spacing: 0.5px;
  background-image: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark));
}

.trail-badge small {
  opacity: 0.85;
  font-weight: 400;
  margin-left: 2px;
}

.trail-stats {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: clamp(var(--space-md), 3vw, var(--space-xl));
  margin-bottom: var(--space-md);
}

.trail-stat {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: 70px;
  padding: var(--space-sm);
  background: var(--color-card-bg);
  border-radius: var(--radius);
  box-shadow: 0 1px 6px var(--color-card-shadow);
}

.trail-stat strong {
  font-size: 1.2rem;
  color: var(--color-primary);
}

.trail-stat small {
  font-size: 0.72rem;
  color: var(--color-text-muted);
  margin-top: 2px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.trail-tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-sm);
}

.trail-tag {
  display: inline-block;
  padding: 4px 14px;
  border-radius: 16px;
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
  font-size: 0.82rem;
  text-decoration: none;
  transition: background 0.2s, color 0.2s, transform 0.2s;
}

.trail-tag:hover {
  background: var(--color-primary);
  color: #fff;
  transform: translateY(-1px);
}

/* ===== Graduation Tip ===== */
.trail-graduation-tip {
  display: flex;
  gap: clamp(var(--space-md), 2vw, var(--space-lg));
  align-items: flex-start;
  margin: var(--space-md) 0;
  padding: var(--space-lg) clamp(var(--space-md), 3vw, var(--space-lg));
  background: var(--color-card-bg);
  border: 1px solid var(--color-border);
  border-left: 4px solid var(--color-primary);
  border-radius: var(--radius-lg);
}

.trail-graduation-tip__badge {
  flex-shrink: 0;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--color-primary);
  border-radius: 50%;
  color: #fff;
}

.trail-graduation-tip__content {
  flex: 1;
  min-width: 0;
}

.trail-graduation-tip__title {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--color-primary-dark);
  margin: 0 0 var(--space-xs);
  line-height: 1.4;
}

.trail-graduation-tip__text {
  font-size: 0.92rem;
  color: var(--color-text);
  line-height: 1.8;
  margin: 0 0 var(--space-md);
}

.trail-graduation-tip__stat {
  color: var(--color-primary);
  font-weight: 700;
  white-space: nowrap;
}

.trail-graduation-tip__stats {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-lg);
  padding-top: var(--space-sm);
  border-top: 1px solid var(--color-border);
}

.trail-graduation-tip__stat-item {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.trail-graduation-tip__stat-item strong {
  font-size: 0.72rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.trail-graduation-tip__stat-item span {
  font-size: 0.88rem;
  color: var(--color-text);
  font-weight: 500;
}

/* ===== Deep Content ===== */
.trail-content {
  padding: 0;
}

.trail-story p {
  line-height: 1.8;
  margin-bottom: var(--space-md);
  color: var(--color-text);
}

.trail-story h3 {
  font-size: 1.15rem;
  font-weight: 700;
  margin: var(--space-lg) 0 var(--space-sm);
  padding-left: var(--space-md);
  border-left: 3px solid var(--color-primary);
  color: var(--color-text);
}

.trail-story__highlight {
  font-weight: 600;
  color: var(--color-text);
  background: var(--color-bg-secondary);
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius);
  border-left: 3px solid var(--color-primary);
  margin-bottom: var(--space-md);
}

.quote {
  color: var(--color-primary);
  font-weight: 600;
  font-style: normal;
}

/* ===== Waypoints Timeline ===== */
.trail-waypoints {
  margin: var(--space-lg) 0;
}

.trail-waypoints__list {
  list-style: none;
  padding: 0;
  position: relative;
}

.trail-waypoints__list::before {
  content: '';
  position: absolute;
  left: 14px;
  top: 8px;
  bottom: 8px;
  width: 2px;
  background: var(--color-border);
}

.trail-waypoint {
  position: relative;
  padding-left: 40px;
  padding-bottom: var(--space-md);
}

.trail-waypoint:last-child {
  padding-bottom: 0;
}

.trail-waypoint__marker {
  position: absolute;
  left: 4px;
  top: 2px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--color-primary-light);
  border: 3px solid var(--color-bg);
  z-index: 1;
  box-shadow: 0 0 0 2px var(--color-primary);
  transition: transform 0.2s;
}

.trail-waypoint:hover .trail-waypoint__marker {
  transform: scale(1.25);
  box-shadow: 0 0 0 3px var(--color-primary);
}

.trail-waypoint__name {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text);
  margin-bottom: var(--space-xs);
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.trail-waypoint__num {
  color: var(--color-primary);
  font-weight: 700;
  min-width: 22px;
  font-size: 0.85rem;
}

.trail-waypoint__desc {
  color: var(--color-text-secondary);
  font-size: 0.85rem;
  margin-bottom: var(--space-xs);
  line-height: 1.55;
}

.trail-waypoint__meta {
  display: flex;
  gap: var(--space-md);
  font-size: 0.78rem;
  color: var(--color-text-muted);
}

/* Surface icon */
.trail-surface {
  display: inline-block;
  width: 32px;
  height: 0;
  vertical-align: middle;
  margin-left: 2px;
  position: relative;
}

.trail-surface--paved { border-bottom: 2.5px solid #95a5a6; }
.trail-surface--dirt { border-bottom: 2.5px dashed #8B4513; }
.trail-surface--rocky { border-bottom: 2.5px dotted #666; }
.trail-surface--gravel { border-bottom: 2.5px dotted #ccc; }

/* ===== Elevation Profile ===== */
.trail-elevation {
  margin: var(--space-lg) 0;
}

.trail-elevation__chart {
  width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.elevation-chart {
  width: 100%;
  height: auto;
  display: block;
  min-width: 600px;
}

.elevation-dot:hover {
  r: 7;
  cursor: pointer;
}

.trail-elevation__legend {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--space-md);
  margin-top: var(--space-xs);
  font-size: 0.78rem;
  color: var(--color-text-muted);
}

.trail-elevation__legend span {
  display: flex;
  align-items: center;
  gap: 5px;
}

.trail-elevation__legend i {
  display: inline-block;
  width: 26px;
  height: 0;
  border-bottom-width: 2.5px;
  border-bottom-style: solid;
}

/* ===== Trail Map ===== */
.trail-map-section {
  margin: var(--space-lg) 0;
}

.trail-map {
  width: 100%;
  height: clamp(300px, 40vw, 480px);
  background: var(--color-bg-secondary);
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  font-size: 0.85rem;
  border: 1px solid var(--color-border);
}

.trail-map::before {
  content: '地图加载中...';
}

.trail-map.leaflet-container::before {
  content: none;
}

/* ===== Disclaimer ===== */
.trail-disclaimer {
  margin-top: var(--space-lg);
  padding: var(--space-md) var(--space-lg);
  background: var(--color-bg-secondary);
  border-radius: var(--radius);
  font-size: 0.78rem;
  color: var(--color-text-muted);
  line-height: 1.6;
  border-left: 3px solid var(--color-border);
}

/* ===== Responsive ===== */
@media (max-width: 768px) {
  .page-trail {
    padding: 0 var(--space-md);
  }

  .trail-title {
    font-size: 1.5rem;
  }

  .trail-stats {
    gap: var(--space-sm);
  }

  .trail-stat strong {
    font-size: 1rem;
  }

  .trail-stat {
    min-width: 60px;
    padding: var(--space-xs) var(--space-sm);
  }

  .trail-badge {
    font-size: 0.85rem;
    padding: 4px 12px;
  }

  .trail-waypoint {
    padding-left: 36px;
    padding-bottom: var(--space-sm);
  }

  .trail-waypoint__marker {
    left: 4px;
    width: 18px;
    height: 18px;
  }

  .trail-waypoints__list::before {
    left: 12px;
  }

  .trail-graduation-tip {
    flex-direction: column;
    padding: var(--space-md);
  }

  .trail-graduation-tip__badge {
    width: 40px;
    height: 40px;
  }

  .trail-graduation-tip__title {
    font-size: 1.05rem;
  }

  .trail-graduation-tip__stats {
    flex-direction: column;
    gap: var(--space-sm);
  }

  .trail-map {
    height: 260px;
  }

  .trail-story h3 {
    font-size: 1.1rem;
  }
}
`;
  document.head.appendChild(style);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderInlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/「(.+?)」/g, '<em class="quote">$1</em>');
}