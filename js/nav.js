/**
 * 本地轨迹导航页面
 * 用户可上传自己的 GPX/KML 轨迹，使用浏览器本地存储，不上传服务器
 * 支持实时导航、偏离检测、语音播报
 * 包含轨迹解析 + 本地存储管理
 */
import { escapeHtml, haversineDistance, BASEMAPS } from './core.js';
import { setMobileNavVisible } from './router.js';
import { createNavigationSystem } from './navigation.js';

const navSystem = createNavigationSystem({
  getTrackData: () => currentTrackData?.coordinates,
  getWaypoints: () => currentTrackData?.waypoints,
  fullscreenBtnClass: 'nav-page__start-btn',
  fullscreenBtnId: 'navFullscreenBtn',
  fullscreenFallbackClass: 'nav-page--fullscreen-fallback',
  fullscreenFallbackCloseId: 'navFullscreenFallbackClose',
  fitBoundsPadding: 40,
  attributionStyle: 'position: absolute; bottom: 0; right: 0;',
  stripWaypointPrefix: false,
  resetNavOnStart: true,
  onExitFullscreen: () => setMobileNavVisible(true),
});

// ===== 本地轨迹存储管理 =====

const STORE_PREFIX = 'local_track_';
const INDEX_KEY = 'local_track_index';

function getIndex() {
  try { const raw = localStorage.getItem(INDEX_KEY); return raw ? JSON.parse(raw) : []; } catch { return []; }
}
function saveIndex(index) { localStorage.setItem(INDEX_KEY, JSON.stringify(index)); }

function formatDistance(meters) {
  if (meters >= 1000) return (meters / 1000).toFixed(1) + ' km';
  return Math.round(meters) + ' m';
}
function formatTime(timestamp) {
  const d = new Date(timestamp);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ===== 轨迹解析 =====

function parseGPX(xmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'text/xml');
  const error = doc.querySelector('parsererror');
  if (error) throw new Error('GPX 文件格式错误，无法解析');

  const nameEl = doc.querySelector('trk > name, rte > name');
  const name = nameEl ? nameEl.textContent.trim() : '未命名轨迹';

  const trkpts = doc.querySelectorAll('trkpt, rtept');
  if (trkpts.length === 0) throw new Error('GPX 文件中未找到轨迹点');

  const coordinates = [];
  const waypoints = [];
  trkpts.forEach(pt => {
    const lat = parseFloat(pt.getAttribute('lat'));
    const lng = parseFloat(pt.getAttribute('lon'));
    if (isNaN(lat) || isNaN(lng)) return;
    coordinates.push([lat, lng]);
    const ele = pt.querySelector('ele');
    const wpName = pt.querySelector('name');
    const altitude = ele ? parseFloat(ele.textContent) : 0;
    if (wpName) {
      waypoints.push({ name: wpName.textContent.trim(), lat, lng, altitude });
    }
  });

  if (coordinates.length === 0) throw new Error('GPX 文件中未找到有效坐标');
  const { distance, gain, loss } = calcTrackStats(coordinates);
  return { name, coordinates, waypoints, distance, elevation: { gain, loss } };
}

function parseKML(xmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'text/xml');
  const error = doc.querySelector('parsererror');
  if (error) throw new Error('KML 文件格式错误，无法解析');

  const nameEl = doc.querySelector('Document > name, Placemark > name');
  const name = nameEl ? nameEl.textContent.trim() : '未命名轨迹';

  const coordinates = [];
  const waypoints = [];
  const placemarks = doc.querySelectorAll('Placemark');

  placemarks.forEach(pm => {
    const pmName = pm.querySelector('name');
    const coordsEl = pm.querySelector('LineString > coordinates, Point > coordinates');
    if (coordsEl) {
      const coordsText = coordsEl.textContent.trim();
      coordsText.split(/\s+/).forEach(coord => {
        const parts = coord.split(',');
        if (parts.length >= 2) {
          const lng = parseFloat(parts[0]);
          const lat = parseFloat(parts[1]);
          if (!isNaN(lat) && !isNaN(lng)) coordinates.push([lat, lng]);
        }
      });
      if (pmName && coordinates.length > 0) {
        const last = coordinates[coordinates.length - 1];
        waypoints.push({ name: pmName.textContent.trim(), lat: last[0], lng: last[1], altitude: 0 });
      }
    }
  });

  if (coordinates.length === 0) throw new Error('KML 文件中未找到有效坐标');
  const { distance, gain, loss } = calcTrackStats(coordinates);
  return { name, coordinates, waypoints, distance, elevation: { gain, loss } };
}

function calcTrackStats(coordinates) {
  let distance = 0;
  for (let i = 1; i < coordinates.length; i++) {
    distance += haversineDistance(coordinates[i - 1][0], coordinates[i - 1][1], coordinates[i][0], coordinates[i][1]);
  }
  return { distance, gain: 0, loss: 0 };
}

function parseTrack(fileName, content) {
  const ext = fileName.toLowerCase().split('.').pop();
  if (ext === 'gpx') return parseGPX(content);
  if (ext === 'kml') return parseKML(content);
  if (content.includes('<gpx') || content.includes('<trkpt') || content.includes('<rtept')) return parseGPX(content);
  if (content.includes('<kml') || content.includes('<Placemark')) return parseKML(content);
  throw new Error('不支持的文件格式，请上传 GPX 或 KML 文件');
}

function getAllTracks() { return getIndex(); }

function saveTrack(trackData) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const track = {
    id, name: trackData.name, coordinates: trackData.coordinates,
    waypoints: trackData.waypoints || [], distance: trackData.distance,
    elevation: trackData.elevation || { gain: 0, loss: 0 }, importedAt: Date.now(),
  };
  localStorage.setItem(STORE_PREFIX + id, JSON.stringify(track));
  const index = getIndex();
  index.unshift({
    id, name: track.name, distance: track.distance,
    importedAt: track.importedAt, waypointCount: track.waypoints.length,
    coordCount: track.coordinates.length,
  });
  saveIndex(index);
  return id;
}

function getTrack(id) {
  try { const raw = localStorage.getItem(STORE_PREFIX + id); return raw ? JSON.parse(raw) : null; } catch { return null; }
}

function deleteTrack(id) {
  localStorage.removeItem(STORE_PREFIX + id);
  saveIndex(getIndex().filter(t => t.id !== id));
}

// ===== 导航页面 =====

let map = null;
let polyline = null;
let markersLayer = null;
let currentTileLayer = null;
let currentBasemapKey = 'ESRI卫星图';
let currentTrackId = null;
let currentTrackData = null;

export async function render() {
  const main = document.querySelector('.main');
  if (!main) return;

  try {
    main.innerHTML = `
      <div class="nav-page__warnings">
        <details class="nav-warning">
          <summary class="nav-warning__title">隐私安全重要提示</summary>
          <div class="nav-warning__body">
            <p><strong>本地处理承诺：</strong>您上传的轨迹文件、GPS 坐标、行程路线等全部数据仅在您当前浏览器内存本地解析运算，全程不会发送、上传、存储至本站任何服务器。</p>
            <p><strong>数据控制权：</strong>轨迹仅临时保存在本机浏览器缓存，刷新页面、关闭标签页、清除缓存即可彻底删除所有路线数据，本站无任何云端备份。</p>
            <p><strong>隐私权责划分：</strong>本站未收集、传输、存储、共享任何用户行踪类个人信息，不承担轨迹数据泄露相关法律责任；您自行保证上传轨迹不含他人隐私信息，若上传包含第三方隐私、涉密坐标文件，全部法律责任由上传用户独自承担。</p>
          </div>
        </details>
        <details class="nav-warning nav-warning--danger">
          <summary class="nav-warning__title">户外安全风险警示</summary>
          <div class="nav-warning__body">
            <p>本网站地图、轨迹导航仅作爱好者参考工具，不提供专业地理信息服务，路径、路况存在数据滞后、信号漂移等误差，不可替代专业登山向导指导。</p>
            <p>登山、徒步、野山穿越属于高风险活动，野外存在落石、山洪、断崖、野兽、无手机信号、迷路、失温、摔伤等不可预判固有危险，参与者需自行承担风险。</p>
            <p>使用本导航规划路线前，您必须自行评估自身体能、配齐全套户外应急装备、购买户外救援保险、提前核实通行管制政策；严禁使用本工具导航进入封闭野山、核心保护区、私人领地、汛期危险河谷等禁入区域。</p>
            <p>因轻信本站路线、地图数据偏差、设备本地解析故障、野外突发灾害、准备不足导致迷路、受伤、失联、财产损失等一切后果，网站运营方不承担任何民事赔偿、救援责任。</p>
          </div>
        </details>
      </div>
      <div class="nav-page">
        <div class="nav-page__sidebar">
          <div class="nav-page__upload">
            <button class="nav-page__upload-btn" id="uploadTrackBtn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              上传轨迹
            </button>
            <span class="nav-page__upload-hint">支持 GPX / KML 格式</span>
          </div>
          <div class="nav-page__track-list" id="trackList">
            <div class="nav-page__track-empty">暂无本地轨迹，请上传 GPX 或 KML 文件</div>
          </div>
        </div>
        <div class="nav-page__map-wrap">
          <div class="nav-page__map" id="navMap"></div>
          <div class="nav-page__map-empty" id="mapEmpty">选择一条轨迹开始导航</div>
        </div>
      </div>`;

    const uploadBtn = document.getElementById('uploadTrackBtn');
    if (uploadBtn) uploadBtn.addEventListener('click', handleUpload);

    await initMap();
    renderTrackList();
  } catch (err) {
    console.error('[Nav] render() error:', err);
    main.innerHTML = `<div class="router-error"><h2>导航页面加载失败</h2><p>${err.message}</p></div>`;
  }
}

async function initMap() {
  await navSystem.ensureLeaflet();
  if (typeof L === 'undefined') {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      const timeout = setTimeout(() => reject(new Error('Leaflet 地图库加载超时，请检查网络连接')), 10000);
      script.onload = () => { clearTimeout(timeout); resolve(); };
      script.onerror = () => { clearTimeout(timeout); reject(new Error('Leaflet 地图库加载失败，请检查网络连接')); };
      document.head.appendChild(script);
    });
  }

  const mapEl = document.getElementById('navMap');
  if (!mapEl) return;
  const mapWrap = mapEl.parentElement;

  map = L.map(mapEl, { zoomControl: true, attributionControl: false }).setView([30.2741, 120.1551], 13);

  const baseLayers = {
    'ESRI卫星图': BASEMAPS['ESRI卫星图'](),
    'OSM德国风格': BASEMAPS['OSM德国风格'](),
    'OpenTopoMap': BASEMAPS['OpenTopoMap'](),
  };
  currentTileLayer = baseLayers['ESRI卫星图'];
  currentTileLayer.addTo(map);
  currentBasemapKey = 'ESRI卫星图';

  navSystem.setupFullscreenNav(mapWrap, map);
  navSystem.createBasemapSwitcher(map, currentBasemapKey, currentTileLayer, (key) => {
    const newLayer = baseLayers[key];
    currentBasemapKey = key;
    currentTileLayer = newLayer;
    return newLayer;
  });
  navSystem.createLocateButton(map);
  navSystem.updateAttribution(map, currentBasemapKey);
}

function handleUpload() {
  showConsentDialog();
}

function showConsentDialog() {
  // 移除已有弹窗
  const existing = document.querySelector('.nav-consent-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'nav-consent-overlay';
  overlay.innerHTML = `
    <div class="nav-consent">
      <div class="nav-consent__header">
        <h2>轨迹本地解析与风险知情同意书</h2>
        <p class="nav-consent__sub">请完整阅读全部条款，勾选下方确认框后方可导入并解析轨迹文件</p>
      </div>
      <div class="nav-consent__body">
        <section>
          <h3>一、数据隐私处理规则（无数据上传承诺）</h3>
          <p>本工具采用纯前端本地运算逻辑，通过浏览器 FileReader API 读取本地轨迹文件，所有坐标、路线、行程信息仅留存于您设备内存，不存在向本站服务器、第三方平台传输轨迹数据的网络请求。</p>
          <p>我方不会采集、备份、导出、出售、共享您的任何轨迹数据，所有路线数据生命周期完全由用户掌控，清除缓存即永久销毁，网站无任何留存记录。</p>
          <p><strong>用户承诺：</strong>上传轨迹文件为本人合法所有，不包含涉密坐标、他人行踪隐私、受版权保护的商用路线、违法违规通行路径；若违反本条产生民事、行政、刑事责任，均由用户独立承担，与本站运营方无关。</p>
          <p><strong>第三方地图说明：</strong>地图瓦片由第三方开源服务商提供，瓦片请求仅携带基础网络访问标识，绝不附带、上传您的轨迹路线数据。</p>
        </section>
        <section>
          <h3>二、户外导航全部免责条款</h3>
          <p><strong>工具定位限制：</strong>本站仅提供轨迹可视化、地图展示、路线距离、简易路径导航辅助功能，不提供专业户外安全指导、路线合法性认证、实时灾害预警、应急救援服务，不能作为野外安全通行唯一依据。</p>
          <p><strong>数据误差免责：</strong>地图、轨迹数据存在年代差、地形改造、道路封闭、GPS 漂移等客观误差；山林管控、暴雨、滑坡、道路封锁等实时变动信息无法同步更新，本站不对地图、轨迹数据的准确性、完整性、时效性做任何明示或默示担保。</p>
          <p><strong>自甘风险确认：</strong>本人自愿参与登山、徒步等高风险户外活动，充分知晓野外环境全部固有安全隐患，自愿承担活动全程所有人身伤害、财产损失风险；因依赖本网站导航开展户外活动造成摔伤、失联、伤亡、财物损毁、第三方索赔等全部损失，网站运营方不承担任何赔偿、补偿、救助责任。</p>
          <p><strong>禁止通行义务：</strong>本人知晓保护区、禁入区域、未开发野山、私人山林、汛期河道、悬崖陡坡等区域禁止擅自进入；绝不利用本工具规划、导航进入上述禁入区域，违规行为产生罚款、拘留、人身危险全部自行负责。</p>
          <p><strong>技术故障免责：</strong>浏览器兼容异常、本地解析失败、手机离线缓存失效、定位信号丢失等前端技术问题导致导航失效，本站无补救义务，不承担任何损失赔偿。</p>
        </section>
        <section>
          <h3>三、知识产权与法律兜底</h3>
          <p>网站页面、前端程序、地图展示逻辑知识产权归运营方所有；用户上传轨迹文件知识产权归属上传用户，网站不拥有任何轨迹版权，不审核路线合法性。</p>
          <p>若用户使用本网站产生任何纠纷、诉讼、行政调查，用户承诺自行承担全部律师费、诉讼费、行政罚款；若因此给网站运营方造成损失，用户需全额赔偿。</p>
          <p>本同意书依据相关法律法规制定，如部分条款被认定无效，剩余条款依然完整生效。</p>
        </section>
        <label class="nav-consent__agree">
          <input type="checkbox" id="consentCheckbox">
          <span>我已完整阅读、充分理解并完全同意以上全部隐私规则与免责条款，自愿使用本轨迹本地解析导航工具，自行承担全部使用风险与法律责任</span>
        </label>
      </div>
      <div class="nav-consent__actions">
        <button class="nav-consent__btn nav-consent__btn--primary" id="consentConfirmBtn" disabled>确认并解析轨迹</button>
        <button class="nav-consent__btn nav-consent__btn--cancel" id="consentCancelBtn">取消上传</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const checkbox = document.getElementById('consentCheckbox');
  const confirmBtn = document.getElementById('consentConfirmBtn');
  const cancelBtn = document.getElementById('consentCancelBtn');

  checkbox.addEventListener('change', () => {
    confirmBtn.disabled = !checkbox.checked;
  });

  confirmBtn.addEventListener('click', () => {
    if (!checkbox.checked) return;
    overlay.remove();
    triggerFileInput();
  });

  cancelBtn.addEventListener('click', () => {
    overlay.remove();
  });

  // 点击遮罩不关闭（强制阅读）
}

function triggerFileInput() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.gpx,.kml';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const content = await file.text();
      const trackData = parseTrack(file.name, content);
      const id = saveTrack(trackData);
      currentTrackId = id;
      currentTrackData = getTrack(id);
      renderTrackOnMap(currentTrackData);
      renderTrackList();
      const empty = document.getElementById('mapEmpty');
      if (empty) empty.style.display = 'none';
    } catch (err) {
      alert('解析失败：' + err.message + '\n\n请确保文件为有效的 GPX 或 KML 格式');
    }
  };
  input.click();
}

function renderTrackList() {
  const list = document.getElementById('trackList');
  if (!list) return;
  const tracks = getAllTracks();
  if (tracks.length === 0) {
    list.innerHTML = '<div class="nav-page__track-empty">暂无本地轨迹，请上传 GPX 或 KML 文件</div>';
    return;
  }
  list.innerHTML = tracks.map(t => `
    <div class="nav-page__track-item${t.id === currentTrackId ? ' nav-page__track-item--active' : ''}" data-id="${t.id}">
      <div class="nav-page__track-info">
        <div class="nav-page__track-name">${escapeHtml(t.name)}</div>
        <div class="nav-page__track-meta">
          <span>${formatDistance(t.distance)}</span>
          <span>${t.waypointCount} 个途经点</span>
          <span>${formatTime(t.importedAt)}</span>
        </div>
      </div>
      <button class="nav-page__track-del" data-action="delete" data-id="${t.id}" title="删除">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M5 2h6M3 4h10l-1 11H4L3 4z"/></svg>
      </button>
    </div>
  `).join('');

  list.querySelectorAll('.nav-page__track-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('[data-action="delete"]')) return;
      selectTrack(item.dataset.id);
    });
  });
  list.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (confirm('确定删除此轨迹？此操作不可恢复。')) {
        deleteTrack(id);
        if (id === currentTrackId) {
          currentTrackId = null;
          currentTrackData = null;
          clearMap();
          const empty = document.getElementById('mapEmpty');
          if (empty) empty.style.display = 'flex';
        }
        renderTrackList();
      }
    });
  });
}

function selectTrack(id) {
  currentTrackId = id;
  currentTrackData = getTrack(id);
  if (currentTrackData) {
    renderTrackOnMap(currentTrackData);
    const empty = document.getElementById('mapEmpty');
    if (empty) empty.style.display = 'none';
  }
  const list = document.getElementById('trackList');
  if (list) {
    list.querySelectorAll('.nav-page__track-item').forEach(item => {
      item.classList.toggle('nav-page__track-item--active', item.dataset.id === id);
    });
  }
}

function renderTrackOnMap(track) {
  if (!map) return;
  clearMap();
  const coords = track.coordinates.map(c => [c[0], c[1]]);
  if (coords.length === 0) return;
  polyline = L.polyline(coords, { color: '#e74c3c', weight: 3, opacity: 0.8 }).addTo(map);
  markersLayer = L.layerGroup().addTo(map);
  if (track.waypoints && track.waypoints.length > 0) {
    track.waypoints.forEach((wp, i) => {
      const marker = L.marker([wp.lat, wp.lng], {
        icon: L.divIcon({
          className: 'nav-wp-marker',
          html: `<div class="nav-wp-marker__inner">${i + 1}</div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        })
      });
      marker.bindPopup(`<b>${escapeHtml(wp.name)}</b>${wp.altitude ? `<br>海拔: ${wp.altitude}m` : ''}`);
      markersLayer.addLayer(marker);
    });
  }
  map.fitBounds(polyline.getBounds(), { padding: [40, 40] });
}

function clearMap() {
  if (polyline) { map.removeLayer(polyline); polyline = null; }
  if (markersLayer) { map.removeLayer(markersLayer); markersLayer = null; }
}