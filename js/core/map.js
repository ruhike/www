/**
 * 轨迹地图渲染模块
 * 使用 Leaflet + Esri 卫星图渲染徒步路线轨迹
 */

let leafletLoaded = false;
let leafletLoadPromise = null;
let map = null;
let polyline = null;
let markersLayer = null;
let mapInitialized = false;
let currentTileLayer = null;
let layerControl = null;

// 底图图层定义（函数工厂，支持 TileLayer 和 LayerGroup）
const BASEMAPS = {
  'ESRI卫星图': () => L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { maxZoom: 19 }
  ),
  'ESRI卫星+标注': () => L.layerGroup([
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }),
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Reference_Overlay/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }),
  ]),
  'OpenTopoMap': () => L.tileLayer(
    'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    { maxZoom: 17 }
  ),
  'ESRI地形图': () => L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}',
    { maxZoom: 19 }
  ),
  'OpenStreetMap': () => L.tileLayer(
    'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    { maxZoom: 19 }
  ),
  'CartoDB': () => L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    { maxZoom: 19 }
  ),
};

// 图层版权映射
const BASEMAP_ATTR = {
  'ESRI卫星图': 'Esri',
  'ESRI卫星+标注': 'Esri',
  'OpenTopoMap': '© OTM',
  'ESRI地形图': 'Esri',
  'OpenStreetMap': '© OSM',
  'CartoDB': '© CartoDB',
};

// 全屏导航状态
let navMode = false;
let navWatchId = null;
let userMarker = null;
let navGuideLine = null;
let navPanel = null;
let navFullscreenBtn = null;
let trackLatLngsForNav = null;
let trackElevationData = null; // 全量轨迹高程数据 [lat, lng, alt]
let mapOriginalBounds = null;
let navFallbackActive = false;
let navEventsBound = false;
let navStartTime = 0;     // 导航开始时间戳
let navLastPosIndex = -1; // 上一次匹配的轨迹点索引

/**
 * 初始化地图模块：注入样式、监听 trail-map-ready 事件
 */
export function initMap() {
  injectStyles();

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

  renderMap(container, slug, overview, fullFile, waypoints);
}

/**
 * 动态注入地图样式
 */
function injectStyles() {
  if (document.getElementById('trail-map-styles')) return;

  const style = document.createElement('style');
  style.id = 'trail-map-styles';
  style.textContent = `
.trail-map { position: relative; height: 500px; border-radius: var(--radius); overflow: hidden; background: var(--color-bg-secondary); }
.trail-map .leaflet-popup-content { font-size: 0.85rem; color: #333; margin: 6px 10px; }
@media (max-width: 768px) { .trail-map { height: 400px; } }
@media (max-width: 480px) { .trail-map { height: 300px; } }

/* 全屏导航按钮 */
.map-fullscreen-btn {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 1000;
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 7px 14px;
  background: var(--color-primary, #2d6a4f);
  color: #fff;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
  transition: background 0.2s, transform 0.15s;
  font-family: system-ui, -apple-system, sans-serif;
  white-space: nowrap;
}
.map-fullscreen-btn:hover {
  background: var(--color-primary-dark, #1b4332);
  transform: translateY(-1px);
}
.map-fullscreen-btn:active { transform: translateY(0); }
.map-fullscreen-btn svg { flex-shrink: 0; }

/* 小屏幕：全屏按钮缩小 */
@media (max-width: 480px) {
  .map-fullscreen-btn {
    padding: 5px 10px;
    font-size: 11px;
    gap: 4px;
    top: 6px;
    right: 6px;
    border-radius: 5px;
  }
  .map-fullscreen-btn svg { width: 14px; height: 14px; }
}

/* 全屏模式地图 */
.trail-map:fullscreen { height: 100vh; border-radius: 0; }

/* 导航信息面板 */
.map-nav-panel {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 1000;
  background: rgba(0,0,0,0.78);
  color: #fff;
  padding: 8px 10px 10px;
  font-size: 12px;
  font-family: system-ui, -apple-system, sans-serif;
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
}
.map-nav-panel--warning { background: rgba(231, 76, 60, 0.85); }
.nav-panel__row {
  display: flex;
  justify-content: space-around;
  gap: 4px;
}
.nav-panel__row--main {
  margin-bottom: 4px;
  padding-bottom: 4px;
  border-bottom: 1px solid rgba(255,255,255,0.15);
}
.nav-panel__row--sub {
  margin-bottom: 2px;
}
.nav-panel__row--pos {
  font-size: 10px;
  opacity: 0.7;
  justify-content: center;
  gap: 4px;
  margin-top: 3px;
  padding-top: 3px;
  border-top: 1px solid rgba(255,255,255,0.1);
}
.nav-panel__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  min-width: 55px;
  flex: 1;
}
.nav-panel__label {
  font-size: 9px;
  opacity: 0.6;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  white-space: nowrap;
}
.nav-panel__val {
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
}
.nav-panel__row--main .nav-panel__val {
  font-size: 14px;
  color: #4fc3f7;
}

/* 用户位置脉冲标记 */
.user-marker-pulse { background: transparent !important; border: none !important; }
.user-marker-pulse .pulse-outer {
  width: 30px; height: 30px; border-radius: 50%;
  background: rgba(52, 152, 219, 0.3);
  animation: userPulse 2s infinite;
  position: absolute; top: 0; left: 0;
}
.user-marker-pulse .pulse-inner {
  width: 12px; height: 12px; border-radius: 50%;
  background: #3498db;
  position: absolute; top: 9px; left: 9px;
  border: 2px solid #fff;
  box-shadow: 0 0 4px rgba(0,0,0,0.3);
}
@keyframes userPulse {
  0% { transform: scale(0.5); opacity: 1; }
  100% { transform: scale(1.5); opacity: 0; }
}

/* 全屏降级模式 */
.trail-map--fullscreen-fallback {
  position: fixed !important; top: 0 !important; left: 0 !important;
  width: 100vw !important; height: 100vh !important;
  z-index: 9999 !important; border-radius: 0 !important;
}

/* 精简版权信息 */
.map-attribution {
  padding: 1px 6px !important;
  background: rgba(255,255,255,0.7) !important;
  font-size: 9px !important;
  line-height: 1.3 !important;
  border-radius: 2px !important;
  margin: 0 !important;
  color: #666 !important;
  pointer-events: none;
  max-width: 80px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
[data-theme="dark"] .map-attribution {
  background: rgba(0,0,0,0.55) !important;
  color: #999 !important;
}

/* 图层切换控件 */
.trail-map .leaflet-control-layers {
  border: 1px solid var(--color-border, #ddd) !important;
  border-radius: 6px !important;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12) !important;
  background: #fff !important;
  font-family: system-ui, -apple-system, sans-serif !important;
}
[data-theme="dark"] .trail-map .leaflet-control-layers {
  background: #2a2a2a !important;
  border-color: #444 !important;
}
.trail-map .leaflet-control-layers-toggle {
  width: 30px !important;
  height: 30px !important;
  background-size: 18px 18px !important;
  border-radius: 5px !important;
}
.trail-map .leaflet-control-layers-expanded {
  padding: 6px 10px !important;
  font-size: 12px !important;
}
.trail-map .leaflet-control-layers-overlays {
  display: none;
}
.trail-map .leaflet-control-layers label {
  display: flex !important;
  align-items: center !important;
  gap: 5px !important;
  padding: 3px 0 !important;
  margin: 0 !important;
  cursor: pointer !important;
  font-size: 12px !important;
  color: #333 !important;
}
[data-theme="dark"] .trail-map .leaflet-control-layers label {
  color: #ddd !important;
}
.trail-map .leaflet-control-layers-selector {
  margin: 0 !important;
  accent-color: var(--color-primary, #2d6a4f);
}

/* 导航模式下图层控件上移至缩放控件下方 */
.trail-map--nav-active .leaflet-bottom.leaflet-left {
  bottom: auto !important;
  top: 80px !important;
}

/* 小屏幕：缩放控件与图层控件缩小 */
@media (max-width: 480px) {
  .trail-map .leaflet-control-zoom a {
    width: 26px !important;
    height: 26px !important;
    line-height: 26px !important;
    font-size: 14px !important;
  }
  .trail-map .leaflet-control-layers-toggle {
    width: 26px !important;
    height: 26px !important;
    background-size: 15px 15px !important;
  }
  .trail-map .leaflet-control-layers-expanded {
    font-size: 11px !important;
  }
  .trail-map .leaflet-control-layers label {
    font-size: 11px !important;
  }
}
`;
  document.head.appendChild(style);
}

/**
 * 确保 Leaflet SDK 只加载一次，返回 Promise
 */
function ensureLeaflet() {
  if (leafletLoaded) return Promise.resolve();
  if (leafletLoadPromise) return leafletLoadPromise;

  leafletLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => {
      leafletLoaded = true;
      resolve();
    };
    script.onerror = () => {
      leafletLoadPromise = null;
      reject(new Error('Leaflet 加载失败'));
    };
    document.head.appendChild(script);
  });

  return leafletLoadPromise;
}

/**
 * 将 [lat, lng, alt] 坐标数组转为 Leaflet 用的 [lat, lng] 数组
 */
function toLatLngs(coords) {
  return coords.map(c => [c[0], c[1]]);
}

/**
 * 创建/更新途经点标记层（使用实际途经点数据）
 * @param {Array} waypoints - 途经点数组 [{name, lat, lng, altitude, distanceFromStart, surface}, ...]
 * @param {Array} coords - 轨迹坐标 [[lat, lng, alt], ...]（用于匹配位置）
 */
function updateWaypointMarkers(waypoints, coords) {
  if (markersLayer) {
    map.removeLayer(markersLayer);
  }
  markersLayer = L.layerGroup();

  if (!waypoints || !waypoints.length) {
    // 降级：使用坐标点
    updateFallbackMarkers(coords);
    return;
  }

  // 途经点全部显示，带名称+海拔+距离弹窗
  if (!waypoints || !waypoints.length) {
    updateFallbackMarkers(coords);
    return;
  }

  const displayed = waypoints;

  // 如果途经点没有坐标，使用轨迹坐标推算
  let coordsTotalDist = 0;
  if (coords && coords.length > 1) {
    for (let i = 1; i < coords.length; i++) {
      coordsTotalDist += haversineDistance(coords[i-1][0], coords[i-1][1], coords[i][0], coords[i][1]);
    }
  }

  for (const wp of displayed) {
    // 使用途经点的坐标，或用距离推算
    let lat, lng;
    if (wp.lat != null && wp.lng != null) {
      lat = wp.lat;
      lng = wp.lng;
    } else if (wp.distanceFromStart != null && coords && coords.length && coordsTotalDist > 0) {
      const ratio = wp.distanceFromStart * 1000 / coordsTotalDist;
      const idx = Math.min(coords.length - 1, Math.floor(ratio * (coords.length - 1)));
      lat = coords[idx][0];
      lng = coords[idx][1];
    } else {
      continue;
    }

    const alt = wp.altitude != null ? Math.round(wp.altitude) : '?';
    const dist = wp.distanceFromStart != null ? wp.distanceFromStart.toFixed(1) : '?';

    const popupHtml = `
      <div style="min-width:120px;font-size:0.85rem;">
        <strong style="color:#2d7d46;font-size:0.95rem;">${escHtml(wp.name)}</strong>
        <div style="margin-top:4px;color:#555;">
          <div>海拔 ${alt}m</div>
          <div>距起点 ${dist} km</div>
        </div>
      </div>`;

    const marker = L.circleMarker([lat, lng], {
      radius: 5,
      fillColor: '#2d7d46',
      color: '#fff',
      weight: 2,
      fillOpacity: 0.9
    });

    marker.bindPopup(popupHtml, { maxWidth: 220 });
    marker.addTo(markersLayer);
  }

  markersLayer.addTo(map);
}

/**
 * HTML 转义
 */
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
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
      radius: 5,
      fillColor: '#95a5a6',
      color: '#fff',
      weight: 2,
      fillOpacity: 0.8
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
    await ensureLeaflet();
  } catch (err) {
    console.error('[Map] Leaflet 加载失败:', err);
    return;
  }

  // 如果已初始化，销毁旧地图
  if (map) {
    map.remove();
    map = null;
    stopNavigation();
    navMode = false;
    navFallbackActive = false;
  }

  // 清空容器中的占位文字
  container.innerHTML = '';

  // 初始化地图
  map = L.map(container, {
    zoomControl: true,
    attributionControl: false,
  });

  // 构建底图图层对象
  const baseLayers = {};
  for (const [name, factory] of Object.entries(BASEMAPS)) {
    baseLayers[name] = factory();
  }

  // 默认 ESRI 卫星图
  currentTileLayer = baseLayers['ESRI卫星图'];
  currentTileLayer.addTo(map);

  // 图层切换控件
  layerControl = L.control.layers(baseLayers, null, {
    position: 'bottomleft',
    collapsed: true,
  }).addTo(map);

  // 精简版权信息
  updateAttribution('ESRI卫星图');

  // 切换图层时更新版权
  map.on('baselayerchange', function (e) {
    currentTileLayer = e.layer;
    updateAttribution(e.name);
  });

  // 渲染 overview 轨迹线
  const latLngs = toLatLngs(overview);
  trackLatLngsForNav = latLngs;
  trackElevationData = overview; // 存储含高程的原始数据
  polyline = L.polyline(latLngs, {
    color: '#e76f51',
    weight: 3,
    opacity: 0.8
  }).addTo(map);

  // 自动缩放
  map.fitBounds(polyline.getBounds(), { padding: [30, 30] });

  // 渲染途经点标记（优先使用 waypoints 数据）
  updateWaypointMarkers(waypoints, overview);

  // 窗口 resize 响应
  if (!mapInitialized) {
    window.addEventListener('resize', () => {
      if (map) map.invalidateSize();
    });
    mapInitialized = true;
  }

  // 初始化全屏导航按钮
  setupFullscreenNav(container);

  // 异步加载全量轨迹
  if (fullFile) {
    loadFullTrack(slug, fullFile, waypoints);
  }
}

/**
 * 异步加载全量轨迹数据并替换渲染
 */
async function loadFullTrack(slug, fullFile, waypoints) {
  let fullCoords = null;

  try {
    const hs = new window.HashSearch();

    // 从 index.json 查找路径
    const index = await hs.get('/data/index.json');
    const entry = index.find(t => t.name === slug);

    if (entry) {
      const fullPath = `/data/${entry.country}/${entry.province}/${entry.city}/${entry.district}/${fullFile}`;
      fullCoords = await hs.get(fullPath);
    }
  } catch {
    // index.json 查找失败，尝试已知路径
  }

  // 备选：尝试常见路径前缀
  if (!fullCoords) {
    const prefixes = [
      '/data/china/yunnan/lijiang/',
      '/data/china/sichuan/aba/',
      '/data/world/nepal/koshi/'
    ];

    for (const prefix of prefixes) {
      try {
        const hs = new window.HashSearch();
        fullCoords = await hs.get(prefix + fullFile);
        if (fullCoords && Array.isArray(fullCoords) && fullCoords.length) break;
        fullCoords = null;
      } catch {
        continue;
      }
    }
  }

  if (!fullCoords || !Array.isArray(fullCoords) || !fullCoords.length) {
    console.warn('[Map] 全量轨迹加载失败，保留精简渲染');
    return;
  }

  // 替换 polyline
  if (polyline && map) {
    map.removeLayer(polyline);
  }

  const latLngs = toLatLngs(fullCoords);
  trackLatLngsForNav = latLngs;
  trackElevationData = fullCoords; // 用全量高程数据替换
  polyline = L.polyline(latLngs, {
    color: '#e76f51',
    weight: 3,
    opacity: 0.8
  }).addTo(map);

  // 更新标记为途经点（使用全量坐标定位）
  updateWaypointMarkers(waypoints, fullCoords);
}

// ==================== 全屏导航模式 ====================

/**
 * 设置全屏导航按钮及相关事件
 */
function setupFullscreenNav(container) {
  // 移除旧按钮（如果地图重新渲染）
  const oldBtn = document.getElementById('mapFullscreenBtn');
  if (oldBtn) oldBtn.remove();

  navFullscreenBtn = document.createElement('button');
  navFullscreenBtn.id = 'mapFullscreenBtn';
  navFullscreenBtn.className = 'map-fullscreen-btn';
  navFullscreenBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 1h5M1 1v5M1 1l5 5M15 15h-5M15 15v-5M15 15l-5-5"/></svg><span>全屏开启导航</span>';
  navFullscreenBtn.addEventListener('click', () => toggleFullscreen(container));
  container.appendChild(navFullscreenBtn);

  // 监听原生全屏变化事件（仅绑定一次）
  if (!navEventsBound) {
    navEventsBound = true;
    const fullscreenChangeHandler = () => onFullscreenChange(container);
    document.addEventListener('fullscreenchange', fullscreenChangeHandler);
    document.addEventListener('webkitfullscreenchange', fullscreenChangeHandler);
    document.addEventListener('mozfullscreenchange', fullscreenChangeHandler);
    document.addEventListener('MSFullscreenChange', fullscreenChangeHandler);
  }
}

/**
 * 切换全屏状态
 */
function toggleFullscreen(container) {
  if (navMode) {
    exitFullscreen(container);
  } else {
    enterFullscreen(container);
  }
}

/**
 * 进入全屏导航
 */
function enterFullscreen(container) {
  const el = container;

  // 尝试原生全屏 API
  const requestFs = el.requestFullscreen
    || el.webkitRequestFullscreen
    || el.mozRequestFullScreen
    || el.msRequestFullscreen;

  if (requestFs) {
    requestFs.call(el).catch(() => {
      // 全屏 API 失败，使用降级方案
      activateFallbackFullscreen(container);
    });
  } else {
    // 全屏 API 不可用，使用降级方案
    activateFallbackFullscreen(container);
  }
}

/**
 * 降级全屏方案：原地扩大地图
 */
function activateFallbackFullscreen(container) {
  navFallbackActive = true;
  container.classList.add('trail-map--fullscreen-fallback');

  // 添加退出按钮
  const closeBtn = document.createElement('button');
  closeBtn.id = 'mapFullscreenFallbackClose';
  closeBtn.className = 'map-fullscreen-btn';
  closeBtn.style.cssText = 'top: 50px;';
  closeBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4l8 8M12 4l-8 8"/></svg><span>退出全屏导航</span>';
  closeBtn.addEventListener('click', () => exitFullscreen(container));
  container.appendChild(closeBtn);

  activateNavigation(container);
}

/**
 * 退出全屏导航
 */
function exitFullscreen(container) {
  navMode = false;

  if (navFallbackActive) {
    navFallbackActive = false;
    container.classList.remove('trail-map--fullscreen-fallback');
    const closeBtn = document.getElementById('mapFullscreenFallbackClose');
    if (closeBtn) closeBtn.remove();
  } else if (document.fullscreenElement) {
    if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    } else if (document.webkitExitFullscreen) {
      document.webkitExitFullscreen();
    } else if (document.mozCancelFullScreen) {
      document.mozCancelFullScreen();
    } else if (document.msExitFullscreen) {
      document.msExitFullscreen();
    }
  }

  // 更新按钮状态
  updateFullscreenBtn(false);

  // 停止导航
  stopNavigation();

  // 恢复地图
  if (map) {
    map.invalidateSize();
    if (mapOriginalBounds) {
      map.fitBounds(mapOriginalBounds, { padding: [30, 30] });
    }
  }
}

/**
 * 全屏状态变化处理
 */
function onFullscreenChange(container) {
  const isFullscreen = !!(document.fullscreenElement
    || document.webkitFullscreenElement
    || document.mozFullScreenElement
    || document.msFullscreenElement);

  if (isFullscreen && !navMode) {
    // 进入全屏
    navMode = true;
    updateFullscreenBtn(true);
    activateNavigation(container);
  } else if (!isFullscreen && navMode && !navFallbackActive) {
    // 通过 ESC 等方式退出全屏
    navMode = false;
    updateFullscreenBtn(false);
    stopNavigation();
    if (map) {
      map.invalidateSize();
      if (mapOriginalBounds) {
        map.fitBounds(mapOriginalBounds, { padding: [30, 30] });
      }
    }
  }
}

/**
 * 激活导航：启动定位、显示面板
 */
function activateNavigation(container) {
  navMode = true;
  navStartTime = Date.now();
  navLastPosIndex = -1;

  // 导航模式下：使用 Leaflet API 将图层控件移到顶部
  if (layerControl && map) {
    layerControl.setPosition('topleft');
  }

  // 保存当前地图范围，用于退出时恢复
  if (map) {
    mapOriginalBounds = map.getBounds();
    map.invalidateSize();
  }

  // 更新按钮
  updateFullscreenBtn(true);

  // 创建导航信息面板
  createNavPanel(container);

  // 启动浏览器定位
  startNavigation();
}

/**
 * 更新全屏按钮文字和图标
 */
function updateFullscreenBtn(isActive) {
  if (!navFullscreenBtn) return;

  if (isActive) {
    navFullscreenBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4l8 8M12 4l-8 8"/></svg><span>退出全屏导航</span>';
  } else {
    navFullscreenBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 1h5M1 1v5M1 1l5 5M15 15h-5M15 15v-5M15 15l-5-5"/></svg><span>全屏开启导航</span>';
  }
}

/**
 * 创建导航信息面板
 */
function createNavPanel(container) {
  if (navPanel) navPanel.remove();

  navPanel = document.createElement('div');
  navPanel.className = 'map-nav-panel';
  navPanel.innerHTML = `
    <div class="nav-panel__row nav-panel__row--main">
      <div class="nav-panel__item">
        <span class="nav-panel__label">已用时间</span>
        <span class="nav-panel__val" id="navElapsed">00:00</span>
      </div>
      <div class="nav-panel__item">
        <span class="nav-panel__label">剩余距离</span>
        <span class="nav-panel__val" id="navRemainDist">-- km</span>
      </div>
      <div class="nav-panel__item">
        <span class="nav-panel__label">预计剩余</span>
        <span class="nav-panel__val" id="navRemainTime">--</span>
      </div>
    </div>
    <div class="nav-panel__row nav-panel__row--sub">
      <div class="nav-panel__item">
        <span class="nav-panel__label">已完成爬升</span>
        <span class="nav-panel__val" id="navDoneAscent">-- m</span>
      </div>
      <div class="nav-panel__item">
        <span class="nav-panel__label">剩余爬升</span>
        <span class="nav-panel__val" id="navRemainAscent">-- m</span>
      </div>
      <div class="nav-panel__item">
        <span class="nav-panel__label">距轨迹</span>
        <span class="nav-panel__val" id="navDistTrack">-- m</span>
      </div>
    </div>
    <div class="nav-panel__row nav-panel__row--pos">
      <span class="nav-panel__label">当前位置</span>
      <span class="nav-panel__val" id="navPosition">等待定位...</span>
    </div>`;
  container.appendChild(navPanel);
}

/**
 * 启动浏览器定位监听
 */
function startNavigation() {
  if (!navigator.geolocation) {
    showPositionError('您的浏览器不支持地理定位');
    return;
  }

  if (!trackLatLngsForNav || !trackLatLngsForNav.length) {
    showPositionError('轨迹数据为空，无法导航');
    return;
  }

  navWatchId = navigator.geolocation.watchPosition(
    handlePositionUpdate,
    handlePositionError,
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 5000
    }
  );
}

/**
 * 处理位置更新
 */
function handlePositionUpdate(position) {
  if (!map) return;

  const { latitude, longitude, accuracy, heading } = position.coords;
  const userLatLng = [latitude, longitude];

  // 更新或创建用户位置标记
  updateUserMarker(userLatLng);

  // 查找最近的轨迹点
  const nearest = findNearestTrackPoint(userLatLng);

  if (nearest) {
    const distance = nearest.distance;

    // 更新指引线
    updateGuideLine(userLatLng, nearest.point);

    // 计算方向
    const bearingToTrack = calcBearing(latitude, longitude, nearest.point[0], nearest.point[1]);
    const directionText = heading != null
      ? getRelativeDirection(bearingToTrack, heading)
      : getCompassDirection(bearingToTrack);

    // ---- 导航指标计算 ----
    const idx = nearest.index;
    const totalPoints = trackElevationData ? trackElevationData.length : (trackLatLngsForNav ? trackLatLngsForNav.length : 0);

    // 已用时间
    const elapsedSec = navStartTime ? Math.floor((Date.now() - navStartTime) / 1000) : 0;
    const elapsedStr = `${String(Math.floor(elapsedSec / 3600)).padStart(2,'0')}:${String(Math.floor((elapsedSec % 3600) / 60)).padStart(2,'0')}:${String(elapsedSec % 60).padStart(2,'0')}`;

    // 已完成距离（从起点到当前点沿轨迹的距离）
    let doneDist = 0;
    if (trackLatLngsForNav && idx >= 0) {
      doneDist = calcTrackDistance(trackLatLngsForNav, 0, idx);
    }

    // 剩余距离
    let remainDist = 0;
    if (trackLatLngsForNav && idx >= 0 && idx < totalPoints - 1) {
      remainDist = calcTrackDistance(trackLatLngsForNav, idx, totalPoints - 1);
    }

    // 已完成爬升（起点到当前点）
    let doneAscent = 0;
    if (trackElevationData && idx >= 0) {
      doneAscent = calcCumulativeAscent(trackElevationData, 0, idx);
    }

    // 剩余爬升（当前点到终点）
    let remainAscent = 0;
    if (trackElevationData && idx >= 0 && idx < totalPoints - 1) {
      remainAscent = calcCumulativeAscent(trackElevationData, idx, totalPoints - 1);
    }

    // 预计剩余时间（基于平均速度 = 已完成距离/已用时间）
    let remainTimeStr = '--';
    if (doneDist > 10 && elapsedSec > 30 && remainDist > 0) {
      const avgSpeed = doneDist / elapsedSec; // m/s
      const remainSec = remainDist / avgSpeed;
      const h = Math.floor(remainSec / 3600);
      const m = Math.floor((remainSec % 3600) / 60);
      remainTimeStr = h > 0 ? `${h}时${m}分` : `${m}分钟`;
    } else if (remainDist > 0) {
      remainTimeStr = '计算中...';
    }

    // 当前位置文字
    const posText = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;

    // 更新导航面板
    updateNavPanel({
      elapsed: elapsedStr,
      remainDist: remainDist > 0 ? (remainDist / 1000).toFixed(1) + ' km' : '-- km',
      remainTime: remainTimeStr,
      doneAscent: doneAscent > 0 ? doneAscent + ' m' : '-- m',
      remainAscent: remainAscent > 0 ? remainAscent + ' m' : '-- m',
      distTrack: distance < 1000 ? Math.round(distance) + ' m' : (distance / 1000).toFixed(2) + ' km',
      position: posText,
      direction: directionText,
    });

    // 地图跟随用户位置
    map.panTo(userLatLng, { animate: true, duration: 0.5 });
  }
}

/**
 * 处理定位错误
 */
function handlePositionError(error) {
  let msg;
  switch (error.code) {
    case error.PERMISSION_DENIED:
      msg = '无法获取位置，请检查定位权限';
      break;
    case error.POSITION_UNAVAILABLE:
      msg = '位置信息不可用';
      break;
    case error.TIMEOUT:
      msg = '获取位置超时，请重试';
      break;
    default:
      msg = '获取位置失败';
  }
  showPositionError(msg);
}

/**
 * 显示定位错误提示
 */
function showPositionError(msg) {
  if (navPanel) {
    const posEl = document.getElementById('navPosition');
    if (posEl) {
      posEl.textContent = msg;
      posEl.style.color = '#e74c3c';
    }
  }
  console.warn('[Map Nav]', msg);
}

/**
 * 更新用户位置标记（蓝色脉冲圆点）
 */
function updateUserMarker(latLng) {
  if (userMarker) {
    userMarker.setLatLng(latLng);
  } else {
    const pulseIcon = L.divIcon({
      className: 'user-marker-pulse',
      html: '<div class="pulse-outer"></div><div class="pulse-inner"></div>',
      iconSize: [30, 30],
      iconAnchor: [15, 15]
    });

    userMarker = L.marker(latLng, {
      icon: pulseIcon,
      zIndexOffset: 999
    }).addTo(map);
  }
}

/**
 * 更新导航指引线（虚线连接用户位置和最近轨迹点）
 */
function updateGuideLine(userLatLng, nearestLatLng) {
  if (navGuideLine) {
    map.removeLayer(navGuideLine);
  }

  navGuideLine = L.polyline([userLatLng, nearestLatLng], {
    color: '#3498db',
    weight: 2,
    opacity: 0.7,
    dashArray: '8 6'
  }).addTo(map);
}

/**
 * 更新导航信息面板
 */
function updateNavPanel(data) {
  if (!navPanel) return;

  const setEl = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  const distVal = parseFloat(data.distTrack);
  const isWarning = !isNaN(distVal) && distVal > 50;
  navPanel.className = 'map-nav-panel' + (isWarning ? ' map-nav-panel--warning' : '');

  setEl('navElapsed', data.elapsed);
  setEl('navRemainDist', data.remainDist);
  setEl('navRemainTime', data.remainTime);
  setEl('navDoneAscent', data.doneAscent);
  setEl('navRemainAscent', data.remainAscent);
  setEl('navDistTrack', data.distTrack);
  setEl('navPosition', data.position);
}

/**
 * 查找最近的轨迹点
 */
function findNearestTrackPoint(userLatLng) {
  if (!trackLatLngsForNav || !trackLatLngsForNav.length) return null;

  let minDist = Infinity;
  let nearest = null;
  let nearestIdx = -1;

  for (let i = 0; i < trackLatLngsForNav.length; i++) {
    const pt = trackLatLngsForNav[i];
    const dist = haversineDistance(userLatLng[0], userLatLng[1], pt[0], pt[1]);
    if (dist < minDist) {
      minDist = dist;
      nearest = { point: pt, distance: dist };
      nearestIdx = i;
    }
  }

  return nearest ? { ...nearest, index: nearestIdx } : null;
}

/**
 * 停止导航：清除标记、面板、监听
 */
function stopNavigation() {
  navStartTime = 0;
  navLastPosIndex = -1;

  // 退出导航模式：将图层控件容器移回底部
  if (map) {
    const container = map.getContainer();
    if (container) {
      const layerControlContainer = container.querySelector('.leaflet-bottom.leaflet-left');
      if (layerControlContainer) {
        layerControlContainer.style.bottom = '';
        layerControlContainer.style.top = '';
      }
    }
  }

  // 停止定位监听
  if (navWatchId != null) {
    navigator.geolocation.clearWatch(navWatchId);
    navWatchId = null;
  }

  // 清除用户位置标记
  if (userMarker && map) {
    map.removeLayer(userMarker);
    userMarker = null;
  }

  // 清除指引线
  if (navGuideLine && map) {
    map.removeLayer(navGuideLine);
    navGuideLine = null;
  }

  // 隐藏导航面板
  if (navPanel) {
    navPanel.remove();
    navPanel = null;
  }
}
// ==================== 全屏导航模式结束 ====================

// ==================== 工具函数 ====================

/**
 * 精简版权信息（自定义 attribution 控件）
 */
let _attributionEl = null;

function updateAttribution(layerName) {
  const text = BASEMAP_ATTR[layerName] || '';

  if (!_attributionEl) {
    const AttributionControl = L.Control.extend({
      options: { position: 'bottomright' },
      onAdd: function () {
        const el = L.DomUtil.create('div', 'map-attribution');
        el.innerHTML = text;
        _attributionEl = el;
        return el;
      },
    });
    new AttributionControl().addTo(map);
  } else {
    _attributionEl.innerHTML = text;
  }
}

/**
 * Haversine 公式计算两点距离（米）
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
    * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * 计算从点1到点2的方位角（度数，0=北，90=东）
 */
function calcBearing(lat1, lng1, lat2, lng2) {
  const lat1r = lat1 * Math.PI / 180;
  const lat2r = lat2 * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;

  const y = Math.sin(dLng) * Math.cos(lat2r);
  const x = Math.cos(lat1r) * Math.sin(lat2r)
    - Math.sin(lat1r) * Math.cos(lat2r) * Math.cos(dLng);

  let bearing = Math.atan2(y, x) * 180 / Math.PI;
  return (bearing + 360) % 360;
}

/**
 * 计算轨迹段区间的累计爬升（米）
 * @param {Array} data - [[lat,lng,alt], ...]
 * @param {number} fromIdx - 起始索引
 * @param {number} toIdx - 结束索引
 * @returns {number}
 */
function calcCumulativeAscent(data, fromIdx, toIdx) {
  if (!data || data.length < 2) return 0;
  let total = 0;
  const start = Math.max(0, fromIdx);
  const end = Math.min(data.length - 1, toIdx);
  for (let i = start + 1; i <= end; i++) {
    const prevAlt = data[i - 1]?.[2];
    const currAlt = data[i]?.[2];
    if (prevAlt != null && currAlt != null && currAlt > prevAlt) {
      total += currAlt - prevAlt;
    }
  }
  return Math.round(total);
}

/**
 * 计算沿轨迹从某个索引到终点的剩余距离（米）
 */
function calcTrackDistance(data, fromIdx, toIdx) {
  if (!data || data.length < 2) return 0;
  let total = 0;
  const start = Math.max(0, fromIdx);
  const end = Math.min(data.length - 1, toIdx);
  for (let i = start; i < end; i++) {
    const [lat1, lng1] = data[i];
    const [lat2, lng2] = data[i + 1];
    if (lat1 != null && lng1 != null && lat2 != null && lng2 != null) {
      total += haversineDistance(lat1, lng1, lat2, lng2);
    }
  }
  return total;
}

/**
 * 获取罗盘方向描述
 */
function getCompassDirection(bearing) {
  const directions = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'];
  const index = Math.round(bearing / 45) % 8;
  return directions[index];
}

/**
 * 获取相对用户朝向的方向描述
 */
function getRelativeDirection(bearingToTarget, userHeading) {
  let relative = bearingToTarget - userHeading;
  if (relative < -180) relative += 360;
  if (relative > 180) relative -= 360;

  if (Math.abs(relative) < 22.5) return '正前方';
  if (relative > 0) {
    if (relative < 67.5) return '前方偏右';
    if (relative < 112.5) return '右侧';
    return '后方偏右';
  } else {
    if (relative > -67.5) return '前方偏左';
    if (relative > -112.5) return '左侧';
    return '后方偏左';
  }
}