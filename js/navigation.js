/**
 * 共享导航模块
 * 提取 map.js 和 nav.js 中的重复导航函数，通过配置对象参数化差异。
 *
 * 使用方式：
 *   import { createNavigationSystem } from './navigation.js';
 *   const nav = createNavigationSystem({
 *     getTrackData: () => trackLatLngsForNav,
 *     getWaypoints: () => waypointsForNav,
 *     fullscreenBtnClass: 'map-fullscreen-btn',
 *     fullscreenBtnId: 'mapFullscreenBtn',
 *     fullscreenFallbackClass: 'trail-map--fullscreen-fallback',
 *     fullscreenFallbackCloseId: 'mapFullscreenFallbackClose',
 *     fitBoundsPadding: 30,
 *     stripWaypointPrefix: true,
 *   });
 */

import { haversineDistance, speak, BASEMAPS, BASEMAP_ATTR } from './core.js';
import { setMobileNavVisible } from './router.js';

/**
 * 创建导航系统实例
 * @param {Object} config
 * @param {Function} config.getTrackData - 返回当前轨迹坐标数组 [[lat, lng], ...]
 * @param {Function} [config.getWaypoints] - 返回途经点数组，可选
 * @param {string} config.fullscreenBtnClass - 全屏按钮 CSS 类名
 * @param {string} config.fullscreenBtnId - 全屏按钮 DOM id
 * @param {string} config.fullscreenFallbackClass - 降级全屏 CSS 类名
 * @param {string} config.fullscreenFallbackCloseId - 降级全屏关闭按钮 DOM id
 * @param {number} [config.fitBoundsPadding=30] - fitBounds 内边距
 * @param {string} [config.attributionStyle=''] - attribution 元素内联样式
 * @param {boolean} [config.stripWaypointPrefix=false] - 是否剥离途经点名称前缀（起点·/进入·/终点·）
 * @param {boolean} [config.resetNavOnStart=false] - startNavigation 时是否重置暂停状态
 * @param {Function} [config.onExitFullscreen] - 退出全屏时的回调
 */
export function createNavigationSystem(config) {
  const {
    getTrackData,
    getWaypoints = () => null,
    fullscreenBtnClass,
    fullscreenBtnId,
    fullscreenFallbackClass,
    fullscreenFallbackCloseId,
    fitBoundsPadding = 30,
    attributionStyle = '',
    stripWaypointPrefix = false,
    resetNavOnStart = false,
    onExitFullscreen = null,
  } = config;

  // ==================== 模块内部状态 ====================

  let navMode = false;
  let navPaused = false;
  let navVoiceEnabled = false;
  let lastVoiceTime = 0;
  let lastWaypointIndex = -1;
  let navWatchId = null;
  let userMarker = null;
  let navGuideLine = null;
  let navPanel = null;
  let navFullscreenBtn = null;
  let mapOriginalBounds = null;
  let navFallbackActive = false;
  let navEventsBound = false;
  let locateBtnEl = null;

  // Leaflet 加载状态
  let leafletLoadPromise = null;

  // ==================== Leaflet 加载 ====================

  /**
   * 确保 Leaflet SDK 只加载一次，返回 Promise
   */
  function ensureLeaflet() {
    if (typeof L !== 'undefined') return Promise.resolve();
    if (leafletLoadPromise) return leafletLoadPromise;

    leafletLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      const timeout = setTimeout(() => {
        leafletLoadPromise = null;
        reject(new Error('Leaflet 地图库加载超时，请检查网络连接'));
      }, 10000);
      script.onload = () => { clearTimeout(timeout); resolve(); };
      script.onerror = () => {
        clearTimeout(timeout);
        leafletLoadPromise = null;
        reject(new Error('Leaflet 地图库加载失败，请检查网络连接'));
      };
      document.head.appendChild(script);
    });

    return leafletLoadPromise;
  }

  // ==================== 底图切换 + 定位 ====================

  function createBasemapSwitcher(map, currentBasemapKey, currentTileLayer, onBasemapChange) {
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
        const newLayer = onBasemapChange(bm.key);
        newLayer.addTo(map);
        container.querySelectorAll('.basemap-btn').forEach(b => b.classList.remove('basemap-btn--active'));
        btn.classList.add('basemap-btn--active');
        updateAttribution(map, bm.key);
      });

      container.appendChild(btn);
    });

    map.getContainer().appendChild(container);
  }

  function createLocateButton(map) {
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

  function updateAttribution(map, layerName) {
    const text = BASEMAP_ATTR[layerName] || '';
    let el = document.querySelector('.map-attribution');
    if (!el) {
      el = document.createElement('div');
      el.className = 'map-attribution';
      if (attributionStyle) {
        el.style.cssText = attributionStyle;
      }
      const container = map.getContainer();
      container.appendChild(el);
    }
    el.innerHTML = text;
  }

  // ==================== 全屏导航模式 ====================

  function setupFullscreenNav(container, map) {
    const oldBtn = document.getElementById(fullscreenBtnId);
    if (oldBtn) oldBtn.remove();

    navFullscreenBtn = document.createElement('button');
    navFullscreenBtn.id = fullscreenBtnId;
    navFullscreenBtn.className = fullscreenBtnClass;
    navFullscreenBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 1h5M1 1v5M1 1l5 5M15 15h-5M15 15v-5M15 15l-5-5"/></svg><span>全屏开启导航</span>';
    navFullscreenBtn.addEventListener('click', () => toggleFullscreen(container, map));
    container.appendChild(navFullscreenBtn);

    if (!navEventsBound) {
      navEventsBound = true;
      const fullscreenChangeHandler = () => onFullscreenChange(container, map);
      document.addEventListener('fullscreenchange', fullscreenChangeHandler);
      document.addEventListener('webkitfullscreenchange', fullscreenChangeHandler);
      document.addEventListener('mozfullscreenchange', fullscreenChangeHandler);
      document.addEventListener('MSFullscreenChange', fullscreenChangeHandler);
    }
  }

  function toggleFullscreen(container, map) {
    if (navMode) { exitFullscreen(container, map); } else {
      if (localStorage.getItem('fullscreenConsentAccepted') === 'true') {
        enterFullscreen(container, map);
      } else {
        showFullscreenConsent(container, map);
      }
    }
  }

  function showFullscreenConsent(container, map) {
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
      localStorage.setItem('fullscreenConsentAccepted', 'true');
      overlay.remove();
      enterFullscreen(container, map);
    });

    cancelBtn.addEventListener('click', () => {
      overlay.remove();
    });
  }

  function enterFullscreen(container, map) {
    setMobileNavVisible(false);
    const el = container;
    const requestFs = el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestfullscreen;
    if (requestFs) {
      requestFs.call(el).catch(() => { activateFallbackFullscreen(container, map); });
    } else {
      activateFallbackFullscreen(container, map);
    }
  }

  function activateFallbackFullscreen(container, map) {
    navFallbackActive = true;
    container.classList.add(fullscreenFallbackClass);

    const closeBtn = document.createElement('button');
    closeBtn.id = fullscreenFallbackCloseId;
    closeBtn.className = fullscreenBtnClass;
    closeBtn.style.cssText = 'top: 50px;';
    closeBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4l8 8M12 4l-8 8"/></svg><span>退出全屏导航</span>';
    closeBtn.addEventListener('click', () => exitFullscreen(container, map));
    container.appendChild(closeBtn);

    activateNavigation(container, map);
  }

  function exitFullscreen(container, map) {
    setMobileNavVisible(true);
    navMode = false;

    if (navFallbackActive) {
      navFallbackActive = false;
      container.classList.remove(fullscreenFallbackClass);
      const closeBtn = document.getElementById(fullscreenFallbackCloseId);
      if (closeBtn) closeBtn.remove();
    } else if (document.fullscreenElement) {
      if (document.exitFullscreen) { document.exitFullscreen().catch(() => {}); }
      else if (document.webkitExitFullscreen) { document.webkitExitFullscreen(); }
      else if (document.mozCancelFullScreen) { document.mozCancelFullScreen(); }
      else if (document.msExitFullscreen) { document.msExitFullscreen(); }
    }

    updateFullscreenBtn(false);
    if (locateBtnEl) locateBtnEl.classList.remove('locate-btn--fullscreen');
    stopNavigation(map);

    if (map) {
      map.invalidateSize();
      if (mapOriginalBounds) { map.fitBounds(mapOriginalBounds, { padding: [fitBoundsPadding, fitBoundsPadding] }); }
    }

    if (onExitFullscreen) onExitFullscreen();
  }

  function onFullscreenChange(container, map) {
    const isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);

    if (isFullscreen && !navMode) {
      navMode = true;
      updateFullscreenBtn(true);
      activateNavigation(container, map);
    } else if (!isFullscreen && navMode && !navFallbackActive) {
      navMode = false;
      setMobileNavVisible(true);
      updateFullscreenBtn(false);
      if (locateBtnEl) locateBtnEl.classList.remove('locate-btn--fullscreen');
      stopNavigation(map);
      if (map) {
        map.invalidateSize();
        if (mapOriginalBounds) { map.fitBounds(mapOriginalBounds, { padding: [fitBoundsPadding, fitBoundsPadding] }); }
      }
      if (onExitFullscreen) onExitFullscreen();
    }
  }

  function activateNavigation(container, map) {
    navMode = true;
    if (locateBtnEl) locateBtnEl.classList.add('locate-btn--fullscreen');
    if (map) { mapOriginalBounds = map.getBounds(); map.invalidateSize(); }
    updateFullscreenBtn(true);
    createNavPanel(container, map);
    startNavigation(map);
  }

  function updateFullscreenBtn(isActive) {
    if (!navFullscreenBtn) return;
    if (isActive) {
      navFullscreenBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4l8 8M12 4l-8 8"/></svg><span>退出全屏导航</span>';
    } else {
      navFullscreenBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 1h5M1 1v5M1 1l5 5M15 15h-5M15 15v-5M15 15l-5-5"/></svg><span>全屏开启导航</span>';
    }
  }

  // ==================== 导航面板 ====================

  function createNavPanel(container, map) {
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

  // ==================== 导航核心逻辑 ====================

  function startNavigation(map) {
    if (!navigator.geolocation) { showPositionError('您的浏览器不支持地理定位'); return; }

    const trackData = getTrackData();
    if (!trackData || !trackData.length) { showPositionError('轨迹数据为空，无法导航'); return; }

    if (resetNavOnStart) {
      navPaused = false;
      lastWaypointIndex = -1;
    }

    navWatchId = navigator.geolocation.watchPosition(
      (position) => handlePositionUpdate(position, map),
      (error) => handlePositionError(error, map),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );
  }

  function handlePositionUpdate(position, map) {
    if (!map || navPaused) return;

    const { latitude, longitude } = position.coords;
    const userLatLng = [latitude, longitude];

    updateUserMarker(userLatLng, map);

    const nearest = findNearestTrackPoint(latitude, longitude);
    if (nearest) {
      const distance = nearest.distance;
      updateGuideLine(userLatLng, nearest.point, map);

      let nextWpName = '--', distNextWp = '--m', prevWpName = '--', distPrevWp = '--m';

      const waypoints = getWaypoints();
      if (waypoints && waypoints.length > 0) {
        let currentWpIdx = 0, minDist = Infinity;
        for (let i = 0; i < waypoints.length; i++) {
          const wp = waypoints[i];
          const wpLatLng = [wp.lat, wp.lng];
          const dist = haversineDistance(userLatLng, wpLatLng);
          if (dist < minDist) { minDist = dist; currentWpIdx = i; }
        }

        const nextWpIdx = Math.min(currentWpIdx + 1, waypoints.length - 1);
        const nextWp = waypoints[nextWpIdx];
        if (nextWp) {
          nextWpName = stripWaypointPrefix
            ? nextWp.name.replace(/^(起点·|进入·|终点·)/, '')
            : nextWp.name;
          const distToNext = haversineDistance(userLatLng, [nextWp.lat, nextWp.lng]);
          distNextWp = distToNext < 1000 ? Math.round(distToNext) + 'm' : (distToNext / 1000).toFixed(1) + 'km';
        }

        const prevWpIdx = Math.max(currentWpIdx - 1, 0);
        const prevWp = waypoints[prevWpIdx];
        if (prevWp) {
          prevWpName = stripWaypointPrefix
            ? prevWp.name.replace(/^(起点·|进入·|终点·)/, '')
            : prevWp.name;
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

  function findNearestTrackPoint(lat, lng) {
    const trackData = getTrackData();
    if (!trackData || !trackData.length) return null;
    let minDist = Infinity;
    let nearest = null;

    for (let i = 0; i < trackData.length; i++) {
      const pt = trackData[i];
      const dist = haversineDistance(lat, lng, pt[0], pt[1]);
      if (dist < minDist) { minDist = dist; nearest = { point: pt, distance: dist }; }
    }

    return nearest;
  }

  function updateUserMarker(latLng, map) {
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

  function updateGuideLine(userLatLng, nearestLatLng, map) {
    if (navGuideLine) { map.removeLayer(navGuideLine); }
    navGuideLine = L.polyline([userLatLng, nearestLatLng], {
      color: '#3498db', weight: 2, opacity: 0.7, dashArray: '8 6'
    }).addTo(map);
  }

  function updateNavPanel(data) {
    if (!navPanel) return;
    const setEl = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
    const distVal = parseFloat(data.distTrack);
    const isWarning = !isNaN(distVal) && distVal > 50;
    navPanel.className = 'map-nav-panel' + (isWarning ? ' map-nav-panel--warning' : '');

    setEl('navPrevWp', data.prevWp);
    setEl('navDistPrevWp', data.distPrevWp);
    setEl('navDistTrack', data.distTrack);
    setEl('navDistNextWp', data.distNextWp);
    setEl('navNextWp', data.nextWp);
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

    const waypoints = getWaypoints();
    if (waypoints && waypoints.length > 0) {
      const nextWaypointIdx = lastWaypointIndex + 1;
      if (nextWaypointIdx < waypoints.length) {
        const wp = waypoints[nextWaypointIdx];
        const wpLatLng = [wp.lat, wp.lng];
        const distToWp = haversineDistance(userLatLng, wpLatLng);
        if (distToWp < 50) {
          const wpName = stripWaypointPrefix
            ? wp.name.replace(/^(起点·|进入·|终点·)/, '')
            : wp.name;
          speak(`前方到达${wpName}`);
          lastWaypointIndex = nextWaypointIdx;
          lastVoiceTime = now;
        }
      }
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

  function handlePositionError(error, map) {
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

  function stopNavigation(map) {
    if (navWatchId != null) { navigator.geolocation.clearWatch(navWatchId); navWatchId = null; }
    if (userMarker && map) { map.removeLayer(userMarker); userMarker = null; }
    if (navGuideLine && map) { map.removeLayer(navGuideLine); navGuideLine = null; }
    if (navPanel) { navPanel.remove(); navPanel = null; }
  }

  // ==================== 公开 API ====================

  return {
    ensureLeaflet,
    createBasemapSwitcher,
    createLocateButton,
    updateAttribution,
    setupFullscreenNav,
    toggleFullscreen,
    showFullscreenConsent,
    enterFullscreen,
    exitFullscreen,
    activateFallbackFullscreen,
    onFullscreenChange,
    activateNavigation,
    updateFullscreenBtn,
    createNavPanel,
    startNavigation,
    handlePositionUpdate,
    findNearestTrackPoint,
    updateUserMarker,
    updateGuideLine,
    pauseNavigation,
    resumeNavigation,
    updateNavPanel,
    handleVoiceAnnouncements,
    handlePositionError,
    showPositionError,
    stopNavigation,

    // 状态访问器
    get navMode() { return navMode; },
    get navPaused() { return navPaused; },
    get navVoiceEnabled() { return navVoiceEnabled; },
    set navVoiceEnabled(v) { navVoiceEnabled = v; },
    get locateBtnEl() { return locateBtnEl; },
    set locateBtnEl(el) { locateBtnEl = el; },
    get navPanel() { return navPanel; },
    get mapOriginalBounds() { return mapOriginalBounds; },
    get fitBoundsPadding() { return fitBoundsPadding; },
  };
}