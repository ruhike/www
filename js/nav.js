/**
 * 本地轨迹导航页面
 * 用户可上传自己的 GPX/KML 轨迹，使用浏览器本地存储，不上传服务器
 * 支持实时导航、偏离检测、语音播报
 * 包含轨迹解析 + 本地存储管理
 */
import { escapeHtml, haversineDistance, speak, BASEMAPS, BASEMAP_ATTR } from './core.js';

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
let locateBtnEl = null;
let currentTrackId = null;
let currentTrackData = null;

let navMode = false;
let navPaused = false;
let navVoiceEnabled = false;
let lastVoiceTime = 0;
let lastWaypointIndex = -1;
let navWatchId = null;
let navPanel = null;
let userMarker = null;
let navGuideLine = null;
let navFullscreenBtn = null;
let mapOriginalBounds = null;
let navFallbackActive = false;
let navEventsBound = false;

export async function render() {
  const main = document.querySelector('.main');
  if (!main) return;

  try {
    main.innerHTML = `
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
          <div class="nav-page__warnings">
            <details class="nav-warning" open>
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
  if (typeof L === 'undefined') {
    await new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  const mapEl = document.getElementById('navMap');
  if (!mapEl) return;

  setupFullscreenNav(mapEl.parentElement);

  map = L.map(mapEl, { zoomControl: true, attributionControl: false }).setView([30.2741, 120.1551], 13);

  const baseLayers = {
    'ESRI卫星图': BASEMAPS['ESRI卫星图'](),
    'OSM德国风格': BASEMAPS['OSM德国风格'](),
    'OpenTopoMap': BASEMAPS['OpenTopoMap'](),
  };
  currentTileLayer = baseLayers['ESRI卫星图'];
  currentTileLayer.addTo(map);
  currentBasemapKey = 'ESRI卫星图';

  createBasemapSwitcher(baseLayers);
  createLocateButton();
  updateAttribution('ESRI卫星图');
}

function updateAttribution(name) {
  const attr = BASEMAP_ATTR[name] || name;
  let attrEl = document.querySelector('.map-attribution');
  if (!attrEl) {
    attrEl = document.createElement('div');
    attrEl.className = 'map-attribution';
    const mapEl = document.getElementById('navMap');
    if (mapEl) {
      attrEl.style.cssText = 'position:absolute;bottom:0;right:0;z-index:1001;padding:1px 5px;background:rgba(255,255,255,0.6);font-size:9px;color:#666;border-radius:2px;max-width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
      mapEl.appendChild(attrEl);
    }
  }
  if (attrEl) attrEl.textContent = attr;
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

// ==================== 自定义底图切换 + 定位 ====================

function createBasemapSwitcher(baseLayers) {
  const oldSwitcher = map.getContainer().querySelector('.custom-basemap-switcher');
  if (oldSwitcher) oldSwitcher.remove();

  const container = document.createElement('div');
  container.className = 'custom-basemap-switcher';
  const basemaps = [
    { key: 'ESRI卫星图', title: '卫星', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M3 12h18M12 3v18"/><circle cx="12" cy="12" r="4"/></svg>' },
    { key: 'OSM德国风格', title: '足迹', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3V6z"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="3" x2="15" y2="18"/></svg>' },
    { key: 'OpenTopoMap', title: '地形', icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 20l5-4 4 3 6-5 5 3"/><path d="M2 15l5-3 4 4 6-4 5 2"/><path d="M2 10l5-5 4 5 6-6 5 4"/></svg>' },
  ];

  basemaps.forEach(bm => {
    const btn = document.createElement('button');
    btn.className = 'basemap-btn';
    btn.innerHTML = bm.icon;
    btn.title = bm.title;
    if (bm.key === currentBasemapKey) btn.classList.add('basemap-btn--active');

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      e.preventDefault();
      if (currentBasemapKey === bm.key) return;
      if (currentTileLayer) map.removeLayer(currentTileLayer);
      currentTileLayer = baseLayers[bm.key];
      currentTileLayer.addTo(map);
      currentBasemapKey = bm.key;
      container.querySelectorAll('.basemap-btn').forEach(b => b.classList.remove('basemap-btn--active'));
      btn.classList.add('basemap-btn--active');
      updateAttribution(bm.key);
    });

    container.appendChild(btn);
  });

  map.getContainer().appendChild(container);
}

function createLocateButton() {
  const oldBtn = map.getContainer().querySelector('.locate-btn');
  if (oldBtn) oldBtn.remove();

  const btn = document.createElement('button');
  btn.className = 'locate-btn';
  btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/></svg>';
  btn.title = '定位当前位置';

  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    e.preventDefault();
    if (!navigator.geolocation) { alert('您的浏览器不支持定位功能'); return; }
    btn.classList.add('locate-btn--loading');
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        map.setView([pos.coords.latitude, pos.coords.longitude], 16, { animate: true });
        btn.classList.remove('locate-btn--loading');
      },
      function (err) {
        btn.classList.remove('locate-btn--loading');
        alert(err.code === 1 ? '定位权限被拒绝，请在浏览器设置中允许定位' : '定位失败，请稍后重试');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  });

  map.getContainer().appendChild(btn);
  locateBtnEl = btn;
}

// ==================== 全屏导航模式 ====================

function setupFullscreenNav(container) {
  const oldBtn = document.getElementById('navFullscreenBtn');
  if (oldBtn) oldBtn.remove();

  navFullscreenBtn = document.createElement('button');
  navFullscreenBtn.id = 'navFullscreenBtn';
  navFullscreenBtn.className = 'nav-page__start-btn';
  navFullscreenBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 1h5M1 1v5M1 1l5 5M15 15h-5M15 15v-5M15 15l-5-5"/></svg><span>全屏开启导航</span>';
  navFullscreenBtn.addEventListener('click', () => toggleFullscreen(container));
  container.appendChild(navFullscreenBtn);

  if (!navEventsBound) {
    navEventsBound = true;
    const fullscreenChangeHandler = () => onFullscreenChange(container);
    document.addEventListener('fullscreenchange', fullscreenChangeHandler);
    document.addEventListener('webkitfullscreenchange', fullscreenChangeHandler);
    document.addEventListener('mozfullscreenchange', fullscreenChangeHandler);
    document.addEventListener('MSFullscreenChange', fullscreenChangeHandler);
  }
}

function toggleFullscreen(container) {
  if (navMode) { exitFullscreen(container); } else { showFullscreenConsent(container); }
}

function showFullscreenConsent(container) {
  const existing = document.querySelector('.nav-consent-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'nav-consent-overlay';
  overlay.innerHTML = `
    <div class="nav-consent">
      <div class="nav-consent__header">
        <h2>全屏导航风险知情同意书</h2>
        <p class="nav-consent__sub">请完整阅读全部条款，勾选下方确认框后方可开启全屏导航</p>
      </div>
      <div class="nav-consent__body">
        <section>
          <h3>一、户外导航风险提示</h3>
          <p>本工具仅提供爱好者参考，不具备专业救援服务资质，不能作为野外安全通行唯一依据。</p>
          <p>地图数据存在滞后、地形改造、GPS 漂移等客观误差，本站不对数据准确性、完整性、实时性做任何担保。</p>
          <p>登山、徒步、野山穿越属于高风险活动，野外存在落石、山洪、断崖、失温、野兽、无手机信号、迷路等不可预判固有危险，参与者需自行承担全部风险。</p>
          <p>严禁使用本工具导航进入保护区、封闭野山、私人领地、汛期河谷等法律法规禁止进入的区域，违规进入产生的后果由使用者自行承担。</p>
        </section>
        <section>
          <h3>二、使用须知</h3>
          <p>使用本导航前，您必须自行评估体能、配齐全套户外应急装备、购买户外救援保险、提前核实当地通行管制政策。</p>
          <p>因轻信导航路线、地图数据偏差、设备本地解析故障、野外突发灾害、准备不足导致迷路、受伤、失联、财产损失、第三方索赔等一切后果，网站运营方不承担任何赔偿、救援、法律连带责任。</p>
        </section>
        <section>
          <h3>三、知识产权与法律兜底</h3>
          <p>网站页面、前端程序、地图展示逻辑知识产权归运营方所有。</p>
          <p>用户使用本工具产生的任何纠纷、诉讼、行政调查，用户承诺自行承担全部费用（含律师费、诉讼费、罚款）。</p>
          <p>若因用户违规使用给网站运营方造成损失，用户需全额赔偿。</p>
        </section>
        <label class="nav-consent__agree">
          <input type="checkbox" id="fullscreenConsentCheckbox">
          <span>我已完整阅读并同意以上全部条款，自愿承担户外活动全部风险</span>
        </label>
      </div>
      <div class="nav-consent__actions">
        <button class="nav-consent__btn nav-consent__btn--primary" id="fullscreenConsentConfirmBtn" disabled>确认并开启全屏导航</button>
        <button class="nav-consent__btn nav-consent__btn--cancel" id="fullscreenConsentCancelBtn">取消</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const checkbox = document.getElementById('fullscreenConsentCheckbox');
  const confirmBtn = document.getElementById('fullscreenConsentConfirmBtn');
  const cancelBtn = document.getElementById('fullscreenConsentCancelBtn');

  checkbox.addEventListener('change', () => {
    confirmBtn.disabled = !checkbox.checked;
  });

  confirmBtn.addEventListener('click', () => {
    if (!checkbox.checked) return;
    overlay.remove();
    enterFullscreen(container);
  });

  cancelBtn.addEventListener('click', () => {
    overlay.remove();
  });
}

function enterFullscreen(container) {
  const el = container;
  const requestFs = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestfullscreen;
  if (requestFs) {
    requestFs.call(el).catch(() => { activateFallbackFullscreen(container); });
  } else {
    activateFallbackFullscreen(container);
  }
}

function activateFallbackFullscreen(container) {
  navFallbackActive = true;
  container.classList.add('nav-page--fullscreen-fallback');

  const closeBtn = document.createElement('button');
  closeBtn.id = 'navFullscreenFallbackClose';
  closeBtn.className = 'nav-page__start-btn';
  closeBtn.style.cssText = 'top: 50px;';
  closeBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4l8 8M12 4l-8 8"/></svg><span>退出全屏导航</span>';
  closeBtn.addEventListener('click', () => exitFullscreen(container));
  container.appendChild(closeBtn);

  activateNavigation(container);
}

function exitFullscreen(container) {
  navMode = false;

  if (navFallbackActive) {
    navFallbackActive = false;
    container.classList.remove('nav-page--fullscreen-fallback');
    const closeBtn = document.getElementById('navFullscreenFallbackClose');
    if (closeBtn) closeBtn.remove();
  } else if (document.fullscreenElement) {
    if (document.exitFullscreen) { document.exitFullscreen().catch(() => {}); }
    else if (document.webkitExitFullscreen) { document.webkitExitFullscreen(); }
    else if (document.mozCancelFullScreen) { document.mozCancelFullScreen(); }
    else if (document.msExitFullscreen) { document.msExitFullscreen(); }
  }

  updateFullscreenBtn(false);
  if (locateBtnEl) locateBtnEl.classList.remove('locate-btn--fullscreen');
  stopNavigation();

  if (map) {
    map.invalidateSize();
    if (mapOriginalBounds) { map.fitBounds(mapOriginalBounds, { padding: [40, 40] }); }
  }
}

function onFullscreenChange(container) {
  const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);

  if (isFullscreen && !navMode) {
    navMode = true;
    updateFullscreenBtn(true);
    activateNavigation(container);
  } else if (!isFullscreen && navMode && !navFallbackActive) {
    navMode = false;
    updateFullscreenBtn(false);
    if (locateBtnEl) locateBtnEl.classList.remove('locate-btn--fullscreen');
    stopNavigation();
    if (map) {
      map.invalidateSize();
      if (mapOriginalBounds) { map.fitBounds(mapOriginalBounds, { padding: [40, 40] }); }
    }
  }
}

function activateNavigation(container) {
  navMode = true;
  if (locateBtnEl) locateBtnEl.classList.add('locate-btn--fullscreen');
  if (map) { mapOriginalBounds = map.getBounds(); map.invalidateSize(); }
  updateFullscreenBtn(true);
  createNavPanel(container);
  startNavigation();
}

function updateFullscreenBtn(isActive) {
  if (!navFullscreenBtn) return;
  if (isActive) {
    navFullscreenBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4l8 8M12 4l-8 8"/></svg><span>退出全屏导航</span>';
  } else {
    navFullscreenBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 1h5M1 1v5M1 1l5 5M15 15h-5M15 15v-5M15 15l-5-5"/></svg><span>全屏开启导航</span>';
  }
}

function startNavigation() {
  if (!currentTrackData || !map) return;
  if (!navigator.geolocation) { showPositionError('您的浏览器不支持地理定位'); return; }
  if (!currentTrackData.coordinates || !currentTrackData.coordinates.length) { showPositionError('轨迹数据为空，无法导航'); return; }

  navPaused = false;
  lastWaypointIndex = -1;

  navWatchId = navigator.geolocation.watchPosition(
    handlePositionUpdate,
    handlePositionError,
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
  );
}

function handlePositionUpdate(position) {
  if (!map || navPaused || !currentTrackData) return;

  const { latitude, longitude } = position.coords;
  const userLatLng = [latitude, longitude];

  updateUserMarker(userLatLng);

  const nearest = findNearestTrackPoint(userLatLng);
  if (nearest) {
    const distance = nearest.distance;
    updateGuideLine(userLatLng, nearest.point);

    let nextWpName = '--', distNextWp = '--m', prevWpName = '--', distPrevWp = '--m';

    const wps = currentTrackData.waypoints || [];
    if (wps.length > 0) {
      let currentWpIdx = 0, minDist = Infinity;
      for (let i = 0; i < wps.length; i++) {
        const wp = wps[i];
        const dist = haversineDistance(userLatLng, [wp.lat, wp.lng]);
        if (dist < minDist) { minDist = dist; currentWpIdx = i; }
      }

      const nextWpIdx = Math.min(currentWpIdx + 1, wps.length - 1);
      const nextWp = wps[nextWpIdx];
      if (nextWp) {
        nextWpName = nextWp.name;
        const distToNext = haversineDistance(userLatLng, [nextWp.lat, nextWp.lng]);
        distNextWp = distToNext < 1000 ? Math.round(distToNext) + 'm' : (distToNext / 1000).toFixed(1) + 'km';
      }

      const prevWpIdx = Math.max(currentWpIdx - 1, 0);
      const prevWp = wps[prevWpIdx];
      if (prevWp) {
        prevWpName = prevWp.name;
        const distToPrev = haversineDistance(userLatLng, [prevWp.lat, prevWp.lng]);
        distPrevWp = distToPrev < 1000 ? Math.round(distToPrev) + 'm' : (distToPrev / 1000).toFixed(1) + 'km';
      }
    }

    updateNavPanel({
      distTrack: distance < 1000 ? Math.round(distance) + 'm' : (distance / 1000).toFixed(2) + 'km',
      nextWp: nextWpName, distNextWp, prevWp: prevWpName, distPrevWp,
    });

    if (navVoiceEnabled) { handleVoiceAnnouncements(distance, userLatLng); }
    map.panTo(userLatLng, { animate: true, duration: 0.5 });
  }
}

function findNearestTrackPoint(userLatLng) {
  const coords = currentTrackData.coordinates;
  if (!coords || !coords.length) return null;
  let minDist = Infinity;
  let nearest = null;

  for (let i = 0; i < coords.length; i++) {
    const pt = coords[i];
    const dist = haversineDistance(userLatLng[0], userLatLng[1], pt[0], pt[1]);
    if (dist < minDist) { minDist = dist; nearest = { point: [pt[0], pt[1]], distance: dist }; }
  }

  return nearest;
}

function updateUserMarker(latLng) {
  if (userMarker) {
    userMarker.setLatLng(latLng);
  } else {
    const pulseIcon = L.divIcon({
      className: 'user-marker-pulse',
      html: '<div class="pulse-outer"></div><div class="pulse-inner"></div>',
      iconSize: [30, 30], iconAnchor: [15, 15]
    });
    userMarker = L.marker(latLng, { icon: pulseIcon, zIndexOffset: 999 }).addTo(map);
  }
}

function updateGuideLine(userLatLng, nearestLatLng) {
  if (navGuideLine) { map.removeLayer(navGuideLine); }
  navGuideLine = L.polyline([userLatLng, nearestLatLng], {
    color: '#3498db', weight: 2, opacity: 0.7, dashArray: '8 6'
  }).addTo(map);
}

function createNavPanel(container) {
  if (navPanel) navPanel.remove();
  navPanel = document.createElement('div');
  navPanel.className = 'map-nav-panel';
  navPanel.innerHTML = `
    <div class="nav-panel__row">
      <div class="nav-panel__item"><span class="nav-panel__label">上点</span><span class="nav-panel__val" id="navPrevWp">--</span></div>
      <div class="nav-panel__item"><span class="nav-panel__label">距上点</span><span class="nav-panel__val" id="navDistPrevWp">--m</span></div>
      <button class="nav-control-btn" id="navPauseBtn" title="暂停导航"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="4" y="3" width="3" height="10" rx="1"/><rect x="9" y="3" width="3" height="10" rx="1"/></svg></button>
      <div class="nav-panel__item nav-panel__item--highlight"><span class="nav-panel__label">偏移距</span><span class="nav-panel__val" id="navDistTrack">--m</span></div>
      <button class="nav-control-btn" id="navVoiceBtn" title="语音播报"><svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 2L4 6H2v4h2l4 4V2z"/><path d="M11 8a3 3 0 0 0-1.5-2.6v5.2A3 3 0 0 0 11 8z"/></svg></button>
      <div class="nav-panel__item"><span class="nav-panel__label">距下点</span><span class="nav-panel__val" id="navDistNextWp">--m</span></div>
      <div class="nav-panel__item"><span class="nav-panel__label">下点</span><span class="nav-panel__val" id="navNextWp">--</span></div>
    </div>`;
  container.appendChild(navPanel);

  const pauseBtn = document.getElementById('navPauseBtn');
  const voiceBtn = document.getElementById('navVoiceBtn');

  if (pauseBtn) {
    pauseBtn.addEventListener('click', () => {
      if (navPaused) { resumeNavigation(); } else { pauseNavigation(); }
    });
  }

  if (voiceBtn) {
    voiceBtn.addEventListener('click', () => {
      navVoiceEnabled = !navVoiceEnabled;
      voiceBtn.classList.toggle('nav-control-btn--active', navVoiceEnabled);
      if (navVoiceEnabled) { speak('语音播报已开启'); } else { speak('语音播报已关闭'); }
    });
  }
}

function pauseNavigation() {
  navPaused = true;
  const pauseBtn = document.getElementById('navPauseBtn');
  if (pauseBtn) {
    pauseBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M4 3l10 5-10 5V3z"/></svg>';
    pauseBtn.title = '继续导航';
    pauseBtn.classList.add('nav-control-btn--paused');
  }
}

function resumeNavigation() {
  navPaused = false;
  const pauseBtn = document.getElementById('navPauseBtn');
  if (pauseBtn) {
    pauseBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><rect x="4" y="3" width="3" height="10" rx="1"/><rect x="9" y="3" width="3" height="10" rx="1"/></svg>';
    pauseBtn.title = '暂停导航';
    pauseBtn.classList.remove('nav-control-btn--paused');
  }
}

function updateNavPanel(data) {
  if (!navPanel) return;
  const setEl = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  const distVal = parseFloat(data.distTrack);
  const isWarning = !isNaN(distVal) && distVal > 50;
  navPanel.className = 'map-nav-panel' + (isWarning ? ' map-nav-panel--warning' : '');

  setEl('navDistTrack', data.distTrack || '--m');
  setEl('navNextWp', data.nextWp || '--');
  setEl('navDistNextWp', data.distNextWp || '--m');
  setEl('navPrevWp', data.prevWp || '--');
  setEl('navDistPrevWp', data.distPrevWp || '--m');
}

function handleVoiceAnnouncements(distance, userLatLng) {
  const now = Date.now();
  if (now - lastVoiceTime < 3000) return;

  if (distance > 5) {
    const distanceText = distance < 1000 ? Math.round(distance) + '米' : (distance / 1000).toFixed(1) + '公里';
    speak(`偏离轨迹${distanceText}`);
    lastVoiceTime = now;
    return;
  }

  const wps = currentTrackData.waypoints || [];
  if (wps && wps.length > 0) {
    const nextWaypointIdx = lastWaypointIndex + 1;
    if (nextWaypointIdx < wps.length) {
      const wp = wps[nextWaypointIdx];
      const distToWp = haversineDistance(userLatLng, [wp.lat, wp.lng]);
      if (distToWp < 50) {
        speak(`前方到达${wp.name}`);
        lastWaypointIndex = nextWaypointIdx;
        lastVoiceTime = now;
      }
    }
  }
}

function handlePositionError(error) {
  let msg;
  switch (error.code) {
    case error.PERMISSION_DENIED: msg = '无法获取位置，请检查定位权限'; break;
    case error.POSITION_UNAVAILABLE: msg = '位置信息不可用'; break;
    case error.TIMEOUT: msg = '获取位置超时，请重试'; break;
    default: msg = '获取位置失败';
  }
  showPositionError(msg);
}

function showPositionError(msg) {
  if (navPanel) {
    const row = navPanel.querySelector('.nav-panel__row');
    if (row) { row.innerHTML = `<span style="color:#e74c3c;font-size:12px;padding:4px;">${msg}</span>`; }
  }
}

function stopNavigation() {
  navMode = false;
  if (navWatchId != null) { navigator.geolocation.clearWatch(navWatchId); navWatchId = null; }
  if (userMarker && map) { map.removeLayer(userMarker); userMarker = null; }
  if (navGuideLine && map) { map.removeLayer(navGuideLine); navGuideLine = null; }
  if (navPanel) { navPanel.remove(); navPanel = null; }
}