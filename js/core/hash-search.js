/**
 * HashSearch - 请求单例与双层缓存体系
 * 挂载到 window.HashSearch
 */

const CACHE_VERSION = '1.0.0';
const STORAGE_PREFIX = 'hs_cache_';
const DEFAULT_CACHE_TTL = 30 * 60 * 1000; // 30 分钟

class HashSearch {
  constructor() {
    if (HashSearch._instance) {
      return HashSearch._instance;
    }

    this._cache = new Map();
    this._cacheTTL = DEFAULT_CACHE_TTL;

    this._restoreFromStorage();
    HashSearch._instance = this;
  }

  static getInstance() {
    if (!HashSearch._instance) {
      HashSearch._instance = new HashSearch();
    }
    return HashSearch._instance;
  }

  // ---- 私有方法 ----

  /** 从 localStorage 恢复所有 hs_cache_ 前缀的缓存到内存 Map */
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
            if (entry.version !== CACHE_VERSION) {
              keysToRemove.push(key);
              continue;
            }
            const url = key.slice(STORAGE_PREFIX.length);
            // 只恢复到内存，如果已过期则在内存中也标记为过期（不主动清除 storage）
            this._cache.set(url, {
              data: entry.data,
              timestamp: entry.timestamp,
            });
          } catch {
            keysToRemove.push(key);
          }
        }
      }
      // 清除版本不匹配或解析失败的条目
      for (const key of keysToRemove) {
        try {
          localStorage.removeItem(key);
        } catch {
          // 静默处理
        }
      }
    } catch {
      // localStorage 不可用时静默处理
    }
  }

  /** 构建 localStorage 键名 */
  _storageKey(url) {
    return STORAGE_PREFIX + url;
  }

  /** 检查缓存条目是否过期 */
  _isExpired(entry) {
    return Date.now() - entry.timestamp > this._cacheTTL;
  }

  /** 写入 localStorage 缓存 */
  _writeToStorage(url, data) {
    try {
      const entry = {
        data,
        timestamp: Date.now(),
        version: CACHE_VERSION,
      };
      localStorage.setItem(this._storageKey(url), JSON.stringify(entry));
    } catch {
      // localStorage 不可用或配额满时静默处理
    }
  }

  /** 从 localStorage 删除指定 URL 的缓存 */
  _removeFromStorage(url) {
    try {
      localStorage.removeItem(this._storageKey(url));
    } catch {
      // 静默处理
    }
  }

  /** 清除所有 hs_cache_ 前缀的 localStorage 缓存 */
  _clearAllStorage() {
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(STORAGE_PREFIX)) {
          keysToRemove.push(key);
        }
      }
      for (const key of keysToRemove) {
        localStorage.removeItem(key);
      }
    } catch {
      // 静默处理
    }
  }

  /** 内部 fetch 封装 */
  async _fetch(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  // ---- 公共方法 ----

  /**
   * 主请求方法
   * @param {string} url - 请求 URL
   * @param {{ forceRefresh?: boolean, skipCache?: boolean }} options
   * @returns {Promise<any>}
   */
  async get(url, options = {}) {
    const { forceRefresh = false, skipCache = false } = options;

    if (!skipCache && !forceRefresh) {
      // 1. 检查内存缓存
      const memEntry = this._cache.get(url);
      if (memEntry && !this._isExpired(memEntry)) {
        return memEntry.data;
      }

      // 2. 检查 localStorage 缓存
      try {
        const raw = localStorage.getItem(this._storageKey(url));
        if (raw) {
          const storageEntry = JSON.parse(raw);
          if (
            storageEntry.version === CACHE_VERSION &&
            storageEntry.data !== undefined
          ) {
            const age = Date.now() - storageEntry.timestamp;
            if (age <= this._cacheTTL) {
              // 恢复到内存缓存
              this._cache.set(url, {
                data: storageEntry.data,
                timestamp: storageEntry.timestamp,
              });
              return storageEntry.data;
            }
          }
        }
      } catch {
        // 读取失败不阻塞正常流程
      }
    }

    // 3. 网络请求
    try {
      const data = await this._fetch(url);
      // 写入双层缓存
      this._cache.set(url, { data, timestamp: Date.now() });
      this._writeToStorage(url, data);
      return data;
    } catch (err) {
      throw new Error(`HashSearch request failed for "${url}": ${err.message}`);
    }
  }

  /**
   * 预加载数据并缓存，静默执行，不返回结果。
   * 用于预热缓存，后续 get() 调用将命中缓存。
   * @param {string} url - 请求 URL
   * @returns {Promise<void>}
   */
  async prefetch(url) {
    try {
      // 检查是否已有有效缓存
      const memEntry = this._cache.get(url);
      if (memEntry && !this._isExpired(memEntry)) return;
      try {
        const raw = localStorage.getItem(this._storageKey(url));
        if (raw) {
          const storageEntry = JSON.parse(raw);
          if (
            storageEntry.version === CACHE_VERSION &&
            storageEntry.data !== undefined &&
            Date.now() - storageEntry.timestamp <= this._cacheTTL
          ) {
            this._cache.set(url, {
              data: storageEntry.data,
              timestamp: storageEntry.timestamp,
            });
            return;
          }
        }
      } catch {
        // 静默处理
      }

      const data = await this._fetch(url);
      this._cache.set(url, { data, timestamp: Date.now() });
      this._writeToStorage(url, data);
    } catch {
      // 预加载失败静默处理
    }
  }

  /**
   * 手动设置缓存
   * @param {string} url
   * @param {any} data
   */
  setCache(url, data) {
    this._cache.set(url, { data, timestamp: Date.now() });
    this._writeToStorage(url, data);
  }

  /**
   * 清除特定 URL 的缓存
   * @param {string} url
   */
  clearCache(url) {
    this._cache.delete(url);
    this._removeFromStorage(url);
  }

  /** 清除所有缓存 */
  clearAllCache() {
    this._cache.clear();
    this._clearAllStorage();
  }

  /**
   * 返回缓存统计信息
   * @returns {{ memoryCount: number, storageCount: number, version: string }}
   */
  getCacheStats() {
    let storageCount = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(STORAGE_PREFIX)) {
          storageCount++;
        }
      }
    } catch {
      // 静默处理
    }
    return {
      memoryCount: this._cache.size,
      storageCount,
      version: CACHE_VERSION,
    };
  }
}

window.HashSearch = HashSearch;
export { HashSearch };