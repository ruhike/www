/**
 * 路线详情页面模块
 */

import { initBreadcrumb, buildGeoPath, renderBreadcrumb } from './router.js';
import { escapeHtml, getTrailBySlug, DIFFICULTIES } from './core.js';

export async function render(params) {
  const main = document.querySelector('.main');
  if (!main) return;

  const slug = params.trail;
  if (!slug) {
    main.innerHTML = '<div class="router-error"><h1>404</h1><p>未指定路线</p></div>';
    return;
  }

  main.innerHTML = '<div class="router-loading"><div class="router-spinner"></div><p>加载路线数据...</p></div>';

  try {
    const hs = window.HashSearch.getInstance();

    const entry = await getTrailBySlug(slug);
    if (!entry) {
      main.innerHTML = `<div class="router-error"><h1>404</h1><p>路线「${escapeHtml(slug)}」未找到</p><a href="/">返回首页</a></div>`;
      return;
    }

    let trail;
    if (entry.hasTrack) {
      const trailPath = `/zh/${entry.country}/${entry.slug}.json`;
      trail = await hs.get(trailPath);
    } else {
      const provincePath = `/zh/${entry.country}/${entry.province}.json`;
      const provinceTrails = await hs.get(provincePath);
      trail = provinceTrails.find(t => t.slug === entry.slug);
      if (!trail) {
        main.innerHTML = `<div class="router-error"><h1>404</h1><p>路线「${escapeHtml(entry.name)}」数据未找到</p><a href="/">返回首页</a></div>`;
        return;
      }
    }

    const difficulties = DIFFICULTIES;
    const diffInfo = difficulties.find(d => d.level === trail.difficulty);

    // 面包屑：基于 geo-hierarchy.json 构建完整层级路径
    try {
      await initBreadcrumb();
      const crumbs = buildGeoPath(trail, true);
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

    document.title = `入野户外 - ${trail.name}`;

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

function renderInlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/「(.+?)」/g, '<em class="quote">$1</em>');
}