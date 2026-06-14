/**
 * 面包屑工具模块 - 基于 geo-hierarchy.json 构建地理层级路径
 *
 * 使用方式：
 *   import { initBreadcrumb, buildGeoPath, buildTrailBreadcrumb } from '../core/breadcrumb.js';
 *   await initBreadcrumb();  // 首次加载数据
 *   const crumbs = buildGeoPath({ continent, country, province, city });  // 从路线/URL 参数构建路径
 */

let geoTree = null;
let loadPromise = null;

const LEVEL_KEYS = ['continent', 'country', 'province', 'city', 'district'];

/**
 * 加载地理层级数据（幂等，多次调用只加载一次）
 */
export async function initBreadcrumb() {
  if (geoTree) return geoTree;
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    try {
      const hs = new window.HashSearch();
      const data = await hs.get('/data/geo-hierarchy.json');
      geoTree = data.tree;
      return geoTree;
    } catch {
      console.warn('[Breadcrumb] 地理层级文件加载失败');
      geoTree = {};
      return geoTree;
    }
  })();

  return loadPromise;
}

/**
 * 从树中按 slug 路径查找节点
 * @param {string[]} slugs - 如 ['asia', 'china', 'zhejiang', 'hangzhou']
 * @returns {{ node: object, path: Array<{key, value, label}> } | null}
 */
function resolvePath(slugs) {
  if (!geoTree) return null;

  const path = [];
  let node = null;
  let children = geoTree;

  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i];
    if (!children || !children[slug]) break;
    node = children[slug];
    path.push({
      key: LEVEL_KEYS[i],
      value: slugs[i],
      label: node.name || slug
    });
    children = node.children;
  }

  return { node, path };
}

/**
 * 根据路线 geo 字段构建完整地理层级路径（用于路线详情页）
 * @param {object} geo - { continent, country, province, city } 等
 * @param {boolean} includeDistrict - 是否包含区县级，默认 false
 * @returns {Array<{key: string, value: string, label: string}>}
 */
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

/**
 * 根据 URL params 对象构建地理层级路径（用于路由面包屑）
 * @param {object} params - URL 解析的 params 对象
 * @returns {{ path: Array, lastKey: string|null }}
 */
export function buildGeoPathFromParams(params) {
  const slugs = [];
  let lastKey = null;

  for (const key of LEVEL_KEYS) {
    if (params[key]) {
      slugs.push(params[key]);
      lastKey = key;
    }
  }

  const result = resolvePath(slugs);
  return {
    path: result ? result.path : [],
    lastKey
  };
}

/**
 * 渲染面包屑 HTML
 * @param {Array} crumbs - 地理层级路径 [{key, value, label}]
 * @param {object} [trailing] - 尾随项 { label: string, linked: boolean, href?: string }
 * @returns {string} HTML
 */
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
    html += `<span><a href="?${qs}">${esc(c.label)}</a></span>`;
  }

  // 尾随项（如路线名称、难度筛选等）
  if (trailing) {
    html += `<span class="breadcrumb-bar__sep">/</span>`;
    if (trailing.linked) {
      html += `<span><a href="${escAttr(trailing.href || '#')}">${esc(trailing.label)}</a></span>`;
    } else {
      html += `<span class="breadcrumb-bar__current">${esc(trailing.label)}</span>`;
    }
  }

  return html;
}

function esc(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escAttr(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}