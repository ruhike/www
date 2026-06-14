import { initRouter } from './core/router.js';
import { initMap } from './core/map.js';
import './core/hash-search.js';

document.addEventListener('DOMContentLoaded', () => {
  initRouter('#app');
  initMap();

  // 主题初始化
  initTheme();
  // 汉堡菜单
  initHamburger();
  // 导航高亮
  initNavHighlight();
  // 页面标题
  initPageTitle();
});

// ===== 主题 =====
const MOON_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
const SUN_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';

function initTheme() {
  const themeToggle = document.getElementById('themeToggle');
  if (!themeToggle) return;

  // 系统偏好检测：无 localStorage 时使用 prefers-color-scheme
  let savedTheme = localStorage.getItem('theme');
  if (!savedTheme) {
    savedTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  applyTheme(savedTheme);

  // 监听系统主题变化（仅在用户未手动设置时跟随）
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (!localStorage.getItem('theme')) {
      const theme = e.matches ? 'dark' : 'light';
      applyTheme(theme);
    }
  });

  // 主题切换
  themeToggle.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';

    // 防止闪烁：先禁用过渡
    document.documentElement.classList.add('no-transition');
    document.documentElement.setAttribute('data-theme', next);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.documentElement.classList.remove('no-transition');
      });
    });

    localStorage.setItem('theme', next);
    updateThemeIcon(next);
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  updateThemeIcon(theme);
}

function updateThemeIcon(theme) {
  const btn = document.getElementById('themeToggle');
  if (!btn) return;
  // 亮色模式时显示月亮（暗示可切到暗色），暗色模式时显示太阳（暗示可切到亮色）
  btn.innerHTML = theme === 'dark' ? SUN_SVG : MOON_SVG;
}

// ===== 汉堡菜单 =====
function initHamburger() {
  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const mainNav = document.getElementById('mainNav');
  if (!hamburgerBtn || !mainNav) return;

  hamburgerBtn.addEventListener('click', () => {
    mainNav.classList.toggle('header__nav--open');
  });

  // 点击导航链接后自动关闭
  mainNav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      mainNav.classList.remove('header__nav--open');
    });
  });

  // 点击页面其他区域关闭菜单
  document.addEventListener('click', (e) => {
    if (!hamburgerBtn.contains(e.target) && !mainNav.contains(e.target)) {
      mainNav.classList.remove('header__nav--open');
    }
  });
}

// ===== 当前路由高亮 =====
function initNavHighlight() {
  const params = new URLSearchParams(window.location.search);
  const links = document.querySelectorAll('.header__nav-link');

  // 移除所有高亮
  links.forEach(l => l.classList.remove('header__nav-link--active'));

  if (params.has('country') && params.get('country') === 'china') {
    highlightByText(links, '中国');
  } else if (params.has('continent')) {
    highlightByText(links, '世界');
  } else if (params.has('difficulty')) {
    highlightByText(links, '难度');
  } else if (params.has('tag')) {
    highlightByText(links, '标签');
  }
  // 无参数时不高亮任何项（已在上方 remove 处理）
}

function highlightByText(links, text) {
  links.forEach(link => {
    if (link.textContent.trim() === text) {
      link.classList.add('header__nav-link--active');
    }
  });
}

// ===== 页面标题 =====
function initPageTitle() {
  const params = new URLSearchParams(window.location.search);
  const page = params.get('page') || 'home';

  let title = document.title || 'ruhike - 全球徒步路线';

  switch (page) {
    case 'trail':
      title = params.get('id') ? `ruhike - ${params.get('id')}` : 'ruhike - 路线详情';
      break;
    case 'search':
      title = params.get('q') ? `ruhike - 搜索: ${params.get('q')}` : 'ruhike - 搜索';
      break;
    case 'home':
      // 保留 index.html 中设置的标题，不覆盖
      return;
    default:
      break;
  }

  document.title = title;
}