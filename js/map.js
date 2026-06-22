/**
 * 轨迹地图渲染模块
 * 使用 Leaflet + Esri 卫星图渲染徒步路线轨迹
 */

import { escapeHtml, haversineDistance, getTrailBySlug, BASEMAPS, HashSearch } from './core.js';
import { setMobileNavVisible } from './router.js';
import { createNavigationSystem } from './navigation.js';

let map = null;
let polyline = null;
let markersLayer = null;
let mapInitialized = false;
let currentTileLayer = null;
let currentBasemapKey = 'ESRI卫星图';
let trackLatLngsForNav = null;
let waypointsForNav = null;

const navSystem = createNavigationSystem({
  getTrackData: () => trackLatLngsForNav,
  getWaypoints: () => waypointsForNav,
  fullscreenBtnClass: 'map-fullscreen-btn',
  fullscreenBtnId: 'mapFullscreenBtn',
  fullscreenFallbackClass: 'trail-map--fullscreen-fallback',
  fullscreenFallbackCloseId: 'mapFullscreenFallbackClose',
  fitBoundsPadding: 30,
  attributionStyle: '',
  stripWaypointPrefix: true,
  resetNavOnStart: false,
  onExitFullscreen: null,
});

/**
 * 初始化地图模块：注入样式、监听 trail-map-ready 事件
 */
export function initMap() {
  window.addEventListener('trail-map-ready', handleTrailMapReady);
}

/**
 * 监听轨迹数据就绪事件，触发地图渲染
 */
function handleTrailMapReady(e) {
  const container = document.getElementById('trail-map');
  if (!container) return;

  const { slug, overview, fullFile, waypoints } = e.detail;
  if (!overview || !overview.length) return;

  waypointsForNav = waypoints || null;
  renderMap(container, slug, overview, fullFile, waypoints);
}

/**
 * 将 [lat, lng, alt] 坐标数组转为 Leaflet 用的 [lat, lng] 数组
 */
function toLatLngs(coords) {
  return coords.map(c => [c[0], c[1]]);
}

/**
 * 创建/更新途经点标记层
 */
function updateWaypointMarkers(waypoints, coords) {
  if (markersLayer) { map.removeLayer(markersLayer); }
  markersLayer = L.layerGroup();

  if (!waypoints || !waypoints.length) {
    updateFallbackMarkers(coords);
    return;
  }

  let coordsTotalDist = 0;
  if (coords && coords.length > 1) {
    for (let i = 1; i < coords.length; i++) {
      coordsTotalDist += haversineDistance(coords[i-1][0], coords[i-1][1], coords[i][0], coords[i][1]);
    }
  }

  for (const wp of waypoints) {
    let lat, lng;
    if (wp.lat != null && wp.lng != null) {
      lat = wp.lat; lng = wp.lng;
    } else if (wp.distanceFromStart != null && coords && coords.length && coordsTotalDist > 0) {
      const ratio = wp.distanceFromStart * 1000 / coordsTotalDist;
      const idx = Math.min(coords.length - 1, Math.floor(ratio * (coords.length - 1)));
      lat = coords[idx][0]; lng = coords[idx][1];
    } else {
      continue;
    }

    const alt = wp.altitude != null ? Math.round(wp.altitude) : '?';
    const dist = wp.distanceFromStart != null ? wp.distanceFromStart.toFixed(1) : '?';

    const popupHtml = `
      <div style="min-width:120px;font-size:0.85rem;">
        <strong style="color:#2d7d46;font-size:0.95rem;">${escapeHtml(wp.name)}</strong>
        <div style="margin-top:4px;color:#555;">
          <div>海拔 ${alt}m</div>
          <div>距起点 ${dist} km</div>
        </div>
      </div>`;

    const marker = L.circleMarker([lat, lng], {
      radius: 5, fillColor: '#2d7d46', color: '#fff', weight: 2, fillOpacity: 0.9
    });
    marker.bindPopup(popupHtml, { maxWidth: 220 });
    marker.addTo(markersLayer);
  }

  markersLayer.addTo(map);
}

/**
 * 降级标记：使用轨迹坐标均匀采样
 */
function updateFallbackMarkers(coords) {
  if (!coords || !coords.length) return;
  const count = coords.length;
  const targetCount = Math.min(12, Math.max(8, Math.floor(count / 30)));
  const step = Math.max(1, Math.floor(count / targetCount));

  for (let i = 0; i < count; i += step) {
    const [lat, lng, alt] = coords[i];
    const marker = L.circleMarker([lat, lng], {
      radius: 5, fillColor: '#95a5a6', color: '#fff', weight: 2, fillOpacity: 0.8
    });
    marker.bindPopup(`海拔: ${alt != null ? Math.round(alt) + 'm' : '未知'}`);
    marker.addTo(markersLayer);
  }
  markersLayer.addTo(map);
}

/**
 * 主渲染函数
 */
async function renderMap(container, slug, overview, fullFile, waypoints) {
  try {
    await navSystem.ensureLeaflet();
  } catch (err) {
    console.error('[Map] Leaflet 加载失败:', err);
    return;
  }

  if (map) {
    map.remove();
    map = null;
    navSystem.stopNavigation(map);
  }

  container.innerHTML = '';
  map = L.map(container, { zoomControl: true, attributionControl: false });

  const baseLayers = {
    'ESRI卫星图': BASEMAPS['ESRI卫星图'](),
    'OSM德国风格': BASEMAPS['OSM德国风格'](),
    'OpenTopoMap': BASEMAPS['OpenTopoMap'](),
  };

  currentTileLayer = baseLayers['ESRI卫星图'];
  currentTileLayer.addTo(map);
  currentBasemapKey = 'ESRI卫星图';

  navSystem.createBasemapSwitcher(map, currentBasemapKey, currentTileLayer, (key) => {
    currentBasemapKey = key;
    currentTileLayer = baseLayers[key];
    return currentTileLayer;
  });
  navSystem.createLocateButton(map);
  navSystem.updateAttribution(map, 'ESRI卫星图');

  const latLngs = toLatLngs(overview);
  trackLatLngsForNav = latLngs;
  polyline = L.polyline(latLngs, { color: '#e76f51', weight: 3, opacity: 0.8 }).addTo(map);
  map.fitBounds(polyline.getBounds(), { padding: [30, 30] });

  updateWaypointMarkers(waypoints, overview);

  if (!mapInitialized) {
    let resizeTimer;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { if (map) map.invalidateSize(); }, 150);
    });
    mapInitialized = true;
  }

  navSystem.setupFullscreenNav(container, map);

  if (fullFile) { loadFullTrack(slug, fullFile, waypoints); }
}

/**
 * 异步加载全量轨迹数据并替换渲染
 */
async function loadFullTrack(slug, fullFile, waypoints) {
  let fullCoords = null;
  try {
    const hs = HashSearch.getInstance();
    if (fullFile.startsWith('/')) {
      fullCoords = await hs.get(fullFile);
    } else {
      const entry = await getTrailBySlug(slug);
      if (entry) {
        fullCoords = await hs.get(`/zh/${entry.country}/${entry.province}/${entry.city}/${entry.district}/${fullFile}`);
      }
    }
  } catch { /* ignore */ }

  if (!fullCoords) {
    const prefixes = [
      '/zh/china/yunnan/lijiang/',
      '/zh/china/sichuan/aba/',
      '/zh/world/nepal/koshi/'
    ];
    for (const prefix of prefixes) {
      try {
        const hs = HashSearch.getInstance();
        fullCoords = await hs.get(prefix + fullFile);
        if (fullCoords && Array.isArray(fullCoords) && fullCoords.length) break;
        fullCoords = null;
      } catch { continue; }
    }
  }

  if (!fullCoords || !Array.isArray(fullCoords) || !fullCoords.length) {
    console.warn('[Map] 全量轨迹加载失败，保留精简渲染');
    return;
  }

  if (polyline && map) { map.removeLayer(polyline); }
  const latLngs = toLatLngs(fullCoords);
  trackLatLngsForNav = latLngs;
  polyline = L.polyline(latLngs, { color: '#e76f51', weight: 3, opacity: 0.8 }).addTo(map);
  updateWaypointMarkers(waypoints, fullCoords);
}