/**
 * 核心基础设施模块 — 网站入口
 * 包含：HashSearch 缓存系统 + 共享工具函数 + 数据加载 + 底图定义 + 难度等级 + 应用初始化
 */

// ===== HashSearch - 全局唯一请求单例与双层缓存体系 =====

const CACHE_VERSION = '1.0.0';
const STORAGE_PREFIX = 'hs_cache_';
const DEFAULT_CACHE_TTL = 30 * 60 * 1000; // 30 分钟

class HashSearch {
  constructor() {
    if (HashSearch._instance) { return HashSearch._instance; }
    this._cache = new Map();
    this._cacheTTL = DEFAULT_CACHE_TTL;
    this._restoreFromStorage();
    HashSearch._instance = this;
  }
  static getInstance() {
    if (!HashSearch._instance) { HashSearch._instance = new HashSearch(); }
    return HashSearch._instance;
  }
  static resetInstance() {
    if (HashSearch._instance) { HashSearch._instance.clearAllCache(); HashSearch._instance = null; }
  }
  _restoreFromStorage() {
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(STORAGE_PREFIX)) {
          try {
            const raw = localStorage.getItem(key);
            if (!raw) continue;
            const entry = JSON.parse(raw);
            if (entry.version !== CACHE_VERSION) { keysToRemove.push(key); continue; }
            const url = key.slice(STORAGE_PREFIX.length);
            this._cache.set(url, { data: entry.data, timestamp: entry.timestamp });
          } catch { keysToRemove.push(key); }
        }
      }
      for (const key of keysToRemove) { try { localStorage.removeItem(key); } catch { /* silent */ } }
    } catch { /* localStorage unavailable */ }
  }
  _storageKey(url) { return STORAGE_PREFIX + url; }
  _isExpired(entry) { return Date.now() - entry.timestamp > this._cacheTTL; }
  _writeToStorage(url, data) {
    try {
      const entry = { data, timestamp: Date.now(), version: CACHE_VERSION };
      localStorage.setItem(this._storageKey(url), JSON.stringify(entry));
    } catch { /* silent */ }
  }
  _removeFromStorage(url) { try { localStorage.removeItem(this._storageKey(url)); } catch { /* silent */ } }
  _clearAllStorage() {
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(STORAGE_PREFIX)) keysToRemove.push(key);
      }
      for (const key of keysToRemove) localStorage.removeItem(key);
    } catch { /* silent */ }
  }
  async _fetch(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    const text = await response.text();
    try { return JSON.parse(text); } catch { return text; }
  }
  async get(url, options = {}) {
    const { forceRefresh = false, skipCache = false } = options;
    if (!skipCache && !forceRefresh) {
      const memEntry = this._cache.get(url);
      if (memEntry && !this._isExpired(memEntry)) return memEntry.data;
      try {
        const raw = localStorage.getItem(this._storageKey(url));
        if (raw) {
          const storageEntry = JSON.parse(raw);
          if (storageEntry.version === CACHE_VERSION && storageEntry.data !== undefined) {
            const age = Date.now() - storageEntry.timestamp;
            if (age <= this._cacheTTL) {
              this._cache.set(url, { data: storageEntry.data, timestamp: storageEntry.timestamp });
              return storageEntry.data;
            }
          }
        }
      } catch { /* silent */ }
    }
    try {
      const data = await this._fetch(url);
      this._cache.set(url, { data, timestamp: Date.now() });
      this._writeToStorage(url, data);
      return data;
    } catch (err) {
      throw new Error(`HashSearch request failed for "${url}": ${err.message}`);
    }
  }
  async prefetch(url) {
    try {
      const memEntry = this._cache.get(url);
      if (memEntry && !this._isExpired(memEntry)) return;
      try {
        const raw = localStorage.getItem(this._storageKey(url));
        if (raw) {
          const storageEntry = JSON.parse(raw);
          if (storageEntry.version === CACHE_VERSION && storageEntry.data !== undefined
              && Date.now() - storageEntry.timestamp <= this._cacheTTL) {
            this._cache.set(url, { data: storageEntry.data, timestamp: storageEntry.timestamp });
            return;
          }
        }
      } catch { /* silent */ }
      const data = await this._fetch(url);
      this._cache.set(url, { data, timestamp: Date.now() });
      this._writeToStorage(url, data);
    } catch { /* silent */ }
  }
  setCache(url, data) { this._cache.set(url, { data, timestamp: Date.now() }); this._writeToStorage(url, data); }
  clearCache(url) { this._cache.delete(url); this._removeFromStorage(url); }
  clearAllCache() { this._cache.clear(); this._clearAllStorage(); }
}

window.HashSearch = HashSearch;
export { HashSearch };

// ===== 共享工具函数 =====

export function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
export function escapeAttr(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
export function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
export function matchesGeo(trail, params) {
  if (params.continent && trail.continent !== params.continent) return false;
  if (params.country   && trail.country   !== params.country)   return false;
  if (params.province  && trail.province  !== params.province)  return false;
  if (params.city      && trail.city      !== params.city)      return false;
  if (params.district  && trail.district  !== params.district)  return false;
  return true;
}
export function speak(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'zh-CN';
  utterance.rate = 1.0;
  utterance.volume = 1.0;
  window.speechSynthesis.speak(utterance);
}

// ===== 难度等级定义（静态数据） =====

export const DIFFICULTIES = [
  { level: 1,  name: '炼气期', icon: 'qi',     description: '轻松休闲，适合全家出游', distanceRange: '0-5km',     ascentRange: '0-200m' },
  { level: 2,  name: '筑基期', icon: 'base',   description: '初级入门，略有起伏',     distanceRange: '5-10km',    ascentRange: '200-500m' },
  { level: 3,  name: '金丹期', icon: 'gold',   description: '中级起步，有一定挑战',   distanceRange: '10-15km',   ascentRange: '500-800m' },
  { level: 4,  name: '元婴期', icon: 'yuan',   description: '中级进阶，需要一定体能', distanceRange: '15-20km',   ascentRange: '800-1200m' },
  { level: 5,  name: '化神期', icon: 'hua',    description: '中级偏难，考验毅力',     distanceRange: '20-30km',   ascentRange: '1200-1800m' },
  { level: 6,  name: '炼虚期', icon: 'lian',   description: '高级入门，专业级',       distanceRange: '30-40km',   ascentRange: '1800-2500m' },
  { level: 7,  name: '合体期', icon: 'he',     description: '高级偏难，高海拔挑战',   distanceRange: '40-50km',   ascentRange: '2500-3500m' },
  { level: 8,  name: '大乘期', icon: 'da',     description: '顶级难度，极限挑战',     distanceRange: '50-70km',   ascentRange: '3500-4500m' },
  { level: 9,  name: '真仙境', icon: 'zhen',   description: '超长距离，需要极强体能', distanceRange: '70-100km',  ascentRange: '4500-6000m' },
  { level: 10, name: '金仙境', icon: 'jin',    description: '百公里级，极端挑战',     distanceRange: '100-150km', ascentRange: '6000-8000m' },
  { level: 11, name: '太乙境', icon: 'tai',    description: '超越极限，史诗级',       distanceRange: '150-200km', ascentRange: '8000-10000m' },
  { level: 12, name: '大罗境', icon: 'da-luo', description: '传奇级徒步',             distanceRange: '200-300km', ascentRange: '10000-15000m' },
  { level: 13, name: '道祖境', icon: 'dao',    description: '神级路线，此生必走',     distanceRange: '>300km',    ascentRange: '>15000m' },
];

// ===== 底图图层定义（map.js 和 nav.js 共享） =====

export const BASEMAPS = {
  'ESRI卫星图':  () => L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 }),
  'OSM德国风格': () => L.tileLayer('https://tile.openstreetmap.de/{z}/{x}/{y}.png', { maxZoom: 19 }),
  'OpenTopoMap': () => L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { maxZoom: 17 }),
};

export const BASEMAP_ATTR = {
  'ESRI卫星图': 'Esri', 'OSM德国风格': '© OSM DE', 'OpenTopoMap': '© OTM',
};

// ===== 路线数据加载（替代 data-loader.js） =====

const PROVINCE_FILES = [
  '/zh/china/zhejiang.json',
  '/zh/china/jiangsu.json',
  '/zh/china/shanghai.json',
  '/zh/china/anhui.json',
];

function extractMeta(trail) {
  return {
    slug: trail.slug, name: trail.name, nameEn: trail.nameEn,
    continent: trail.continent, country: trail.country, province: trail.province,
    city: trail.city, district: trail.district,
    difficulty: trail.difficulty, distance: trail.distance, ascent: trail.ascent,
    duration: trail.duration, maxAltitude: trail.maxAltitude,
    tags: trail.tags || [], feature: trail.feature, heat: trail.heat, hasTrack: trail.hasTrack,
  };
}

let trailsCache = null;
let loadPromise = null;

export async function loadAllTrails() {
  if (trailsCache) return trailsCache;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const hs = window.HashSearch.getInstance();
    const allTrails = [];
    const results = await Promise.all(PROVINCE_FILES.map(file => hs.get(file).catch(() => null)));
    for (const provinceData of results) {
      if (Array.isArray(provinceData)) {
        for (const trail of provinceData) allTrails.push(extractMeta(trail));
      }
    }
    trailsCache = allTrails;
    return allTrails;
  })();
  return loadPromise;
}

export async function getTrailBySlug(slug) {
  const trails = await loadAllTrails();
  return trails.find(t => t.slug === slug || t.name === slug) || null;
}

export function clearTrailsCache() { trailsCache = null; loadPromise = null; }

// ===== 应用入口 =====

import { initRouter } from './router.js';
import { initMap } from './map.js';

HashSearch.getInstance();

document.addEventListener('DOMContentLoaded', () => {
  initRouter('#app');
  initMap();
  initTheme();
  initHamburger();
  initNavHighlight();
});

// ===== 主题 =====
const MOON_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
const SUN_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';

function initTheme() {
  const themeToggle = document.getElementById('themeToggle');
  if (!themeToggle) return;
  let savedTheme = localStorage.getItem('theme');
  if (!savedTheme) savedTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  applyTheme(savedTheme);
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem('theme')) applyTheme(e.matches ? 'dark' : 'light');
  });
  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.classList.add('no-transition');
    document.documentElement.setAttribute('data-theme', next);
    requestAnimationFrame(() => requestAnimationFrame(() => document.documentElement.classList.remove('no-transition')));
    localStorage.setItem('theme', next);
    updateThemeIcon(next);
  });
}
function applyTheme(theme) { document.documentElement.setAttribute('data-theme', theme); updateThemeIcon(theme); }
function updateThemeIcon(theme) { const btn = document.getElementById('themeToggle'); if (btn) btn.innerHTML = theme === 'dark' ? SUN_SVG : MOON_SVG; }

// ===== 汉堡菜单 =====
function initHamburger() {
  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const mainNav = document.getElementById('mainNav');
  if (!hamburgerBtn || !mainNav) return;
  hamburgerBtn.addEventListener('click', () => mainNav.classList.toggle('header__nav--open'));
  mainNav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => mainNav.classList.remove('header__nav--open')));
  document.addEventListener('click', (e) => {
    if (!hamburgerBtn.contains(e.target) && !mainNav.contains(e.target)) mainNav.classList.remove('header__nav--open');
  });
}

// ===== 导航高亮 =====
function initNavHighlight() {
  const params = new URLSearchParams(window.location.search);
  const links = document.querySelectorAll('.header__nav-link');
  links.forEach(l => l.classList.remove('header__nav-link--active'));
  if (params.has('country') && params.get('country') === 'china') highlightByText(links, '中国');
  else if (params.has('continent')) highlightByText(links, '世界');
  else if (params.has('difficulty')) highlightByText(links, '难度');
  else if (params.has('tag')) highlightByText(links, '标签');
  else if (params.has('search')) highlightByText(links, '搜索');
  else if (params.has('nav')) highlightByText(links, '导航');
}
function highlightByText(links, text) {
  links.forEach(link => { if (link.textContent.trim() === text) link.classList.add('header__nav-link--active'); });
}