/**
 * 路由模块 - 解析 URL 查询字符串并分发页面 + 面包屑导航
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

import { escapeHtml, escapeAttr } from './core.js';
import geoHierarchyData from './geo-hierarchy.js';

// ===== 面包屑 - 基于 geo-hierarchy.js 构建地理层级路径 =====

let geoTree = null;
let loadPromise = null;

const LEVEL_KEYS = ['continent', 'country', 'province', 'city', 'district'];

/** 加载地理层级数据（幂等，多次调用只加载一次） */
export async function initBreadcrumb() {
  if (geoTree) return geoTree;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      geoTree = geoHierarchyData.tree;
      return geoTree;
    } catch {
      console.warn('[Breadcrumb] 地理层级文件加载失败');
      geoTree = {};
      return geoTree;
    }
  })();

  return loadPromise;
}

/** 在树的 children 中递归查找 slug */
function findInTree(tree, slug, prefix = []) {
  if (!tree) return null;
  if (tree[slug]) return { node: tree[slug], prefix: [...prefix, slug] };
  for (const [key, node] of Object.entries(tree)) {
    if (node.children) {
      const found = findInTree(node.children, slug, [...prefix, key]);
      if (found) return found;
    }
  }
  return null;
}

/** 从树中按 slug 路径查找节点 */
function resolvePath(slugs) {
  if (!geoTree || !slugs.length) return null;
  const path = [];
  let children = geoTree;

  if (!children[slugs[0]]) {
    const found = findInTree(children, slugs[0]);
    if (!found) return null;
    const fullSlugs = [...found.prefix];
    fullSlugs.push(...slugs.slice(1));
    slugs = fullSlugs;
  }

  let node = null;
  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i];
    if (!children || !children[slug]) break;
    node = children[slug];
    path.push({
      key: LEVEL_KEYS[Math.min(i, LEVEL_KEYS.length - 1)],
      value: slugs[i],
      label: node.name || slug
    });
    children = node.children;
  }

  return { node, path };
}

/** 根据路线 geo 字段构建完整地理层级路径 */
export function buildGeoPath(geo, includeDistrict = false) {
  const slugs = [];
  if (geo.continent) slugs.push(geo.continent);
  if (geo.country)   slugs.push(geo.country);
  if (geo.province)  slugs.push(geo.province);
  if (geo.city)      slugs.push(geo.city);
  if (includeDistrict && geo.district) slugs.push(geo.district);
  const result = resolvePath(slugs);
  return result ? result.path : [];
}

/** 根据 URL params 对象构建地理层级路径 */
function buildGeoPathFromParams(params) {
  const slugs = [];
  let lastKey = null;

  for (const key of LEVEL_KEYS) {
    if (params[key]) {
      if (key === 'continent' && params[key] === 'world') {
        lastKey = key;
        return {
          path: [{ key: 'continent', value: 'world', label: '世界' }],
          lastKey: 'continent'
        };
      }
      slugs.push(params[key]);
      lastKey = key;
    }
  }

  const result = resolvePath(slugs);
  return { path: result ? result.path : [], lastKey };
}

/** 渲染面包屑 HTML */
export function renderBreadcrumb(crumbs, trailing = null) {
  let html = '<span><a href="/">首页</a></span>';

  for (let i = 0; i < crumbs.length; i++) {
    const c = crumbs[i];
    const navParams = {};
    for (let j = 0; j <= i; j++) {
      navParams[crumbs[j].key] = crumbs[j].value;
    }
    const qs = Object.entries(navParams).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    html += `<span class="breadcrumb-bar__sep">/</span>`;
    html += `<span><a href="?${qs}">${escapeHtml(c.label)}</a></span>`;
  }

  if (trailing) {
    html += `<span class="breadcrumb-bar__sep">/</span>`;
    if (trailing.linked) {
      html += `<span><a href="${escapeAttr(trailing.href || '#')}">${escapeHtml(trailing.label)}</a></span>`;
    } else {
      html += `<span class="breadcrumb-bar__current">${escapeHtml(trailing.label)}</span>`;
    }
  }

  return html;
}

// ===== 路由核心 =====

// 页面 → 模块加载器的映射表
const PAGE_LOADERS = {
  home:       () => import('./home.js'),
  geo:        () => import('./geo.js'),
  trail:      () => import('./trail.js'),
  difficulty: () => import('./difficulty.js'),
  tag:        () => import('./tag.js'),
  search:     () => import('./search.js'),
  nav:        () => import('./nav.js'),
};

// 页面模块缓存
const pageModules = new Map();

/** 从 URL 字符串解析查询参数对象 */
function parseSearchFromUrl(urlStr) {
  const idx = urlStr.indexOf('?');
  if (idx === -1) return {};
  const raw = urlStr.substring(idx + 1);
  if (!raw) return {};
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

/** 解析 URL 查询字符串，返回 { page, params } 对象 */
function parseParams() {
  const params = parseSearchFromUrl(window.location.search);
  return parseParamsFromObj(params);
}

/** 显示加载动画 */
function showLoading() {
  const main = document.querySelector('.main');
  if (!main) return;
  main.innerHTML = `
    <div class="router-loading">
      <div class="router-spinner"></div>
      <p>加载中...</p>
    </div>`;
}

/** 更新面包屑导航 */
async function updateBreadcrumb(page, params) {
  const bc = document.getElementById('breadcrumbBar');
  if (!bc) return;

  await initBreadcrumb();

  switch (page) {
    case 'home':
      bc.innerHTML = '<span class="breadcrumb-bar__current">首页</span>';
      return;
    case 'geo': {
      const { path } = buildGeoPathFromParams(params);
      const basePath = path.slice(0, -1);
      const last = path[path.length - 1];
      bc.innerHTML = renderBreadcrumb(basePath, last ? { label: last.label, linked: false } : null);
      return;
    }
    case 'trail': {
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
    case 'nav':
      bc.innerHTML = renderBreadcrumb([], { label: '本地导航', linked: false });
      return;
    default:
      bc.innerHTML = renderBreadcrumb([], { label: page, linked: false });
  }
}

/** 从 params 对象构建查询字符串 */
function buildQueryString(params) {
  return Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
    .join('&');
}

/** 渲染页面 */
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
  updateMobileNav(page);
}

/** 编程式导航 */
export function navigate(params = {}) {
  const qs = buildQueryString(params);
  const url = qs ? '?' + qs : window.location.pathname;
  const { page, params: parsedParams } = parseParamsFromObj(params);
  history.pushState(params, '', url);
  renderPage(page, parsedParams);
}

/** 从参数对象判断页面 */
function parseParamsFromObj(params) {
  if ('trail' in params)  return { page: 'trail', params };
  if ('search' in params) return { page: 'search', params };
  if ('difficulty' in params) return { page: 'difficulty', params };
  if ('tag' in params) return { page: 'tag', params };
  if ('nav' in params) return { page: 'nav', params };
  if (params.continent || params.country || params.province || params.city || params.district) {
    return { page: 'geo', params };
  }
  return { page: 'home', params };
}

/** 处理路由 */
function handleRoute() {
  const { page, params } = parseParams();
  renderPage(page, params);
}

/** 初始化路由 */
export function initRouter() {
  handleRoute();

  window.addEventListener('popstate', () => {
    handleRoute();
  });

  document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href) return;

    const url = new URL(href, window.location.origin);
    if (url.origin !== window.location.origin) return;
    if (href.startsWith('#') && !href.startsWith('#/')) return;
    if (link.hasAttribute('data-full-reload')) return;

    e.preventDefault();

    if (href === '/' || href === window.location.pathname) {
      navigate({});
      return;
    }

    if (href.startsWith('?')) {
      const { params } = parseParamsFromUrl(href);
      navigate(params);
      return;
    }

    const params = parseSearchFromUrl(href);
    if (Object.keys(params).length > 0) {
      navigate(params);
    } else {
      navigate({});
    }
  });

  setupPreload();
}

/** 从 URL 字符串解析 { page, params } */
function parseParamsFromUrl(urlStr) {
  const params = parseSearchFromUrl(urlStr);
  return parseParamsFromObj(params);
}

// ===== 链接预加载 =====

const preloadedPages = new Set();

function preloadPage(pageName) {
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

function setupPreload() {
  const idlePreload = () => {
    const idl = window.requestIdleCallback || (fn => setTimeout(fn, 200));
    idl(() => {
      preloadPage('geo');
    }, { timeout: 1000 });
  };

  document.addEventListener('mouseenter', (e) => {
    const link = e.target.closest('a[href]');
    if (!link) return;

    const href = link.getAttribute('href');
    if (!href) return;

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

function updateMobileNav(page) {
  const mobileNav = document.querySelector('.mobile-nav');
  if (!mobileNav) return;
  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  if (!isMobile) return;

  if (page === 'nav') {
    mobileNav.style.display = 'flex';
  }

  const links = mobileNav.querySelectorAll('.mobile-nav__item');
  if (!links.length) return;
  links.forEach(link => link.classList.remove('mobile-nav__item--active'));

  const activeMap = {
    home: ['home', 'trail', 'difficulty', 'tag'],
    explore: ['geo', 'country'],
    nav: ['nav'],
    search: ['search'],
  };

  for (const [nav, pages] of Object.entries(activeMap)) {
    if (pages.includes(page)) {
      const active = mobileNav.querySelector(`.mobile-nav__item[data-nav="${nav}"]`);
      if (active) active.classList.add('mobile-nav__item--active');
      return;
    }
  }
}

export function setMobileNavVisible(visible) {
  const mobileNav = document.querySelector('.mobile-nav');
  if (!mobileNav) return;
  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  if (!isMobile) return;
  mobileNav.style.display = visible ? 'flex' : 'none';
}