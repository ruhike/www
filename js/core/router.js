/**
 * 路由模块 - 解析 URL 查询字符串并分发页面
 *
 * 路由参数映射：
 *   无参数                   → home   首页
 *   ?continent=xxx           → geo    大洲分类页
 *   ?country=xxx             → geo    国家分类页
 *   ?country=xxx&province=xxx               → geo  省份分类页
 *   ?country=xxx&province=xxx&city=xxx      → geo  城市分类页
 *   ?country=xxx&province=xxx&city=xxx&district=xxx → geo  区县分类页
 *   ?trail=xxx               → trail  路线详情页
 *   ?difficulty=N            → difficulty  难度页（可组合地理位置参数）
 *   ?tag=xxx                 → tag    标签页（可组合地理位置参数）
 *   ?search=xxx              → search 搜索页
 */

import { initBreadcrumb, buildGeoPathFromParams, renderBreadcrumb } from './breadcrumb.js';

// 页面 → 模块加载器的映射表
const PAGE_LOADERS = {
  home:       () => import('../pages/home.js'),
  geo:        () => import('../pages/geo.js'),
  trail:      () => import('../pages/trail.js'),
  difficulty: () => import('../pages/difficulty.js'),
  tag:        () => import('../pages/tag.js'),
  search:     () => import('../pages/search.js'),
};

// 页面模块缓存
const pageModules = new Map();

// 当前路由状态
let currentParams = {};

/**
 * 解析 URL 查询字符串，返回 { page, params } 对象
 *
 * 优先级规则：
 *   1. ?trail=xxx      → page = 'trail'
 *   2. ?search=xxx     → page = 'search'
 *   3. ?difficulty=N   → page = 'difficulty'
 *   4. ?tag=xxx        → page = 'tag'
 *   5. 存在 continent / country / province / city / district → page = 'geo'
 *   6. 其他            → page = 'home'
 */
export function parseParams() {
  const raw = window.location.search.substring(1);
  if (!raw) {
    return { page: 'home', params: {} };
  }

  const params = {};
  raw.split('&').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx === -1) {
      if (pair) params[decodeURIComponent(pair)] = '';
      return;
    }
    const key = decodeURIComponent(pair.substring(0, idx));
    const val = decodeURIComponent(pair.substring(idx + 1));
    if (key) params[key] = val;
  });

  // 按优先级判断页面
  if (params.trail !== undefined) {
    return { page: 'trail', params };
  }
  if (params.search !== undefined) {
    return { page: 'search', params };
  }
  if (params.difficulty !== undefined) {
    return { page: 'difficulty', params };
  }
  if (params.tag !== undefined) {
    return { page: 'tag', params };
  }
  if (params.continent || params.country || params.province || params.city || params.district) {
    return { page: 'geo', params };
  }

  return { page: 'home', params };
}

/**
 * 显示加载动画（覆盖 .main 容器）
 */
function showLoading() {
  const main = document.querySelector('.main');
  if (!main) return;
  main.innerHTML = `
    <div class="router-loading">
      <div class="router-spinner"></div>
      <p>加载中...</p>
    </div>`;
}

/**
 * 获取当前路由参数
 */
export function getCurrentParams() {
  return { ...currentParams };
}

/**
 * 更新面包屑导航（基于 geo-hierarchy.json 唯一数据源）
 */
async function updateBreadcrumb(page, params) {
  const bc = document.getElementById('breadcrumbBar');
  if (!bc) return;

  // 确保树已加载
  await initBreadcrumb();

  switch (page) {
    case 'home':
      bc.innerHTML = '<span class="breadcrumb-bar__current">首页</span>';
      return;

    case 'geo': {
      const { path } = buildGeoPathFromParams(params);
      // 地理分类页：最后一级为当前页，不可点击
      const basePath = path.slice(0, -1);
      const last = path[path.length - 1];
      bc.innerHTML = renderBreadcrumb(basePath, last ? {
        label: last.label,
        linked: false
      } : null);
      return;
    }

    case 'trail': {
      // 路线详情页由 trail.js 在数据加载后覆写完整面包屑
      // 此处设置临时面包屑（仅 URL 参数中的 trail slug）
      const { path } = buildGeoPathFromParams(params);
      const trailName = params.trail || '路线详情';
      bc.innerHTML = renderBreadcrumb(path, { label: trailName, linked: false });
      return;
    }

    case 'difficulty': {
      const { path } = buildGeoPathFromParams(params);
      bc.innerHTML = renderBreadcrumb(path, { label: '难度 ' + (params.difficulty || ''), linked: false });
      return;
    }

    case 'tag': {
      const { path } = buildGeoPathFromParams(params);
      bc.innerHTML = renderBreadcrumb(path, { label: params.tag || '标签', linked: false });
      return;
    }

    case 'search':
      bc.innerHTML = renderBreadcrumb([], { label: '搜索', linked: false });
      return;

    default:
      bc.innerHTML = renderBreadcrumb([], { label: page, linked: false });
  }
}

/**
 * 从 params 对象构建查询字符串（不含前导 ?）
 */
function buildQueryString(params) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
    .join('&');
}

/**
 * 渲染页面：动态加载模块并调用 render
 */
async function renderPage(page, params) {
  const main = document.querySelector('.main');
  if (!main) return;

  const loader = PAGE_LOADERS[page];
  if (!loader) {
    main.innerHTML = '<div class="router-error"><h1>404</h1><p>页面未找到</p></div>';
    updateBreadcrumb(page, params);
    return;
  }

  showLoading();

  try {
    // 优先使用缓存模块
    let module = pageModules.get(page);
    if (!module) {
      module = await loader();
      pageModules.set(page, module);
    }
    if (typeof module.render === 'function') {
      await module.render(params);
    } else {
      main.innerHTML = `<div class="router-error"><p>页面模块加载异常：${page}</p></div>`;
    }
    // trail 和 difficulty 页面由各自模块内部更新面包屑（含完整数据）
    if (page !== 'trail' && page !== 'difficulty') {
      updateBreadcrumb(page, params);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (err) {
    console.error(`[Router] 加载页面模块失败: ${page}`, err);
    main.innerHTML = `
      <div class="router-error">
        <h2>加载失败</h2>
        <p>页面「${page}」暂时无法加载，请稍后重试。</p>
        <a href="/">返回首页</a>
      </div>`;
    updateBreadcrumb(page, params);
  }
}

/**
 * 编程式导航
 * @param {Object} params - 路由参数键值对
 */
export function navigate(params = {}) {
  const qs = buildQueryString(params);
  const url = qs ? '?' + qs : window.location.pathname;

  currentParams = { ...params };

  const { page, params: parsedParams } = parseParamsFromObj(params);
  history.pushState(params, '', url);
  renderPage(page, parsedParams);
}

/**
 * 从参数对象判断页面（用于 navigate 时避免重复解析 URL）
 */
function parseParamsFromObj(params) {
  const keys = Object.keys(params).filter(k => params[k] !== undefined && params[k] !== null && params[k] !== '');

  if (keys.length === 0) return { page: 'home', params: {} };
  if ('trail' in params)  return { page: 'trail', params };
  if ('search' in params) return { page: 'search', params };
  if ('difficulty' in params) return { page: 'difficulty', params };
  if ('tag' in params)    return { page: 'tag', params };
  if (params.continent || params.country || params.province || params.city || params.district) {
    return { page: 'geo', params };
  }
  return { page: 'home', params };
}

/**
 * 处理路由（从当前 URL 解析并渲染）
 */
function handleRoute() {
  const { page, params } = parseParams();
  currentParams = { ...params };
  renderPage(page, params);
}

/**
 * 初始化路由
 * @param {string} containerSelector - 应用容器选择器（兼容旧接口，实际不使用）
 */
export function initRouter(containerSelector) {
  // 初始渲染
  handleRoute();

  // 监听浏览器前进/后退
  window.addEventListener('popstate', () => {
    handleRoute();
  });

  // 拦截页面内 <a> 链接的点击，走 pushState 而不是整页刷新
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href) return;

    // 只拦截同源、以 ? 或 / 开头的相对链接
    const url = new URL(href, window.location.origin);
    if (url.origin !== window.location.origin) return;

    // 排除 #anchor 跳转（hash-only）
    if (href.startsWith('#') && !href.startsWith('#/')) return;

    // 排除明确需要整页刷新的链接（如 sitemap）
    if (link.hasAttribute('data-full-reload')) return;

    e.preventDefault();

    if (href === '/' || href === window.location.pathname) {
      // 回到首页
      navigate({});
      return;
    }

    if (href.startsWith('?')) {
      // 查询字符串导航
      const { params } = parseParamsFromUrl(href);
      navigate(params);
      return;
    }

    // 其他相对路径也尝试作为查询字符串处理
    const params = parseSearchFromUrl(href);
    if (Object.keys(params).length > 0) {
      navigate(params);
    } else {
      navigate({});
    }
  });

  // 设置链接预加载
  setupPreload();
}

/**
 * 从 URL 字符串解析查询参数对象
 */
function parseSearchFromUrl(urlStr) {
  const idx = urlStr.indexOf('?');
  if (idx === -1) return {};
  const raw = urlStr.substring(idx + 1);
  const params = {};
  raw.split('&').forEach(pair => {
    const eq = pair.indexOf('=');
    if (eq === -1) {
      if (pair) params[decodeURIComponent(pair)] = '';
      return;
    }
    const key = decodeURIComponent(pair.substring(0, eq));
    const val = decodeURIComponent(pair.substring(eq + 1));
    if (key) params[key] = val;
  });
  return params;
}

/**
 * 从 URL 字符串解析 { page, params }
 */
function parseParamsFromUrl(urlStr) {
  const params = parseSearchFromUrl(urlStr);
  return parseParamsFromObj(params);
}

// ===== 链接预加载 =====

/** 已预加载的页面集合，防止重复预加载 */
const preloadedPages = new Set();

/**
 * 预加载指定页面模块（静默加载，不渲染）
 * @param {string} pageName - 页面名称
 */
export function preloadPage(pageName) {
  if (!PAGE_LOADERS[pageName] || preloadedPages.has(pageName)) return;
  if (pageModules.has(pageName)) return;

  preloadedPages.add(pageName);
  PAGE_LOADERS[pageName]()
    .then(module => {
      pageModules.set(pageName, module);
    })
    .catch(() => {
      preloadedPages.delete(pageName);
    });
}

/**
 * 从链接 href 解析页面名称
 */
function resolvePageFromHref(href) {
  if (!href || href === '/') return 'home';
  if (href.startsWith('?')) {
    const { page } = parseParamsFromUrl(href);
    return page;
  }
  const idx = href.indexOf('?');
  if (idx === -1) return 'home';
  const { page } = parseParamsFromUrl(href.substring(idx));
  return page;
}

/**
 * 设置链接预加载：鼠标悬停时预加载目标页面模块
 */
function setupPreload() {
  // 使用 requestIdleCallback 延迟预加载非核心页面
  const idlePreload = () => {
    const idl = window.requestIdleCallback || (fn => setTimeout(fn, 200));
    idl(() => {
      // 预加载最可能被访问的页面：geo（中国/世界页）
      preloadPage('geo');
    }, { timeout: 1000 });
  };

  // 页面渲染完成后，扫描链接并绑定鼠标悬停预加载
  document.addEventListener('mouseenter', (e) => {
    const link = e.target.closest('a[href]');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href) return;

    // 只预加载同源链接
    try {
      const url = new URL(href, window.location.origin);
      if (url.origin !== window.location.origin) return;
    } catch {
      return;
    }

    const pageName = resolvePageFromHref(href);
    if (pageName && PAGE_LOADERS[pageName]) {
      preloadPage(pageName);
    }
  }, { passive: true });

  idlePreload();
}