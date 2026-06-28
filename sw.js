// BNBU Map — Service Worker
// Strategies:
//   App shell + static assets  → Cache First (长期缓存)
//   POI.json                   → Stale While Revalidate (后台刷新)
//   Map tiles                  → Stale While Revalidate + 配额限制（后台更新，保证服务器新版本可刷新）
//   CDN 第三方资源              → Cache First (按版本缓存)
//   /api/*                     → Network First (降级至缓存)

const CACHE_VERSION = 'v2.2';
const SHELL_CACHE   = `shell-${CACHE_VERSION}`;
const TILE_CACHE    = `tiles-${CACHE_VERSION}`;
const CDN_CACHE     = `cdn-${CACHE_VERSION}`;
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;

// 最多缓存的瓦片数量（每块约 20–100 KB，500 块约 10–50 MB）
const MAX_TILE_ENTRIES    = 500;
const MAX_RUNTIME_ENTRIES = 200;

// 应用 Shell：离线必须可用
const SHELL_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/POI.json',
];

// ─── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      // 逐个缓存：单个资源（如频繁更新的 POI.json）失败不会导致整个 SW 安装失败
      .then(cache => Promise.allSettled(
        SHELL_URLS.map(url =>
          cache.add(url).catch(err => {
            console.warn('[SW] 预缓存失败:', url, err);
            throw err;
          })
        )
      ))
      .then(() => self.skipWaiting())
  );
});

// ─── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  const keep = [SHELL_CACHE, TILE_CACHE, CDN_CACHE, RUNTIME_CACHE];
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => !keep.includes(k)).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ─── Fetch ────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // 只处理 http/https，排除 chrome-extension:// 等协议
  if (!request.url.startsWith('http')) return;

  // 只处理 GET
  if (request.method !== 'GET') return;

  // /api/* → Network First
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, RUNTIME_CACHE));
    return;
  }

  // 导航请求（HTML 文档）→ Network First，离线时回退到缓存的 App Shell。
  // 避免 Cache First 导致部署新版本后老用户长期停留在旧 index.html。
  if (request.mode === 'navigate') {
    event.respondWith(navigationNetworkFirst(request));
    return;
  }

  // 地图样式 / sprite / glyphs（多为跨域瓦片服务器资源）→ Stale While Revalidate
  // 这些资源随服务器更新而变化，不能 Cache First 永久缓存。
  if (isMapStyleRequest(url)) {
    event.respondWith(staleWhileRevalidate(request, CDN_CACHE, event));
    return;
  }

  // 地图瓦片（pbf / png / 矢量瓦片服务）
  // 使用 Stale While Revalidate：立即返回缓存同时后台更新，确保服务器新版本能刷新
  if (isTileRequest(url)) {
    event.respondWith(staleWhileRevalidateWithLimit(request, TILE_CACHE, MAX_TILE_ENTRIES, event));
    return;
  }

  // CDN 第三方资源（unpkg / cdn）
  if (isCdnRequest(url)) {
    event.respondWith(cacheFirst(request, CDN_CACHE));
    return;
  }

  // POI.json → Stale While Revalidate
  if (url.pathname === '/POI.json') {
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE, event));
    return;
  }

  // 其余本地请求 → Cache First（含 fallback 到 index.html）
  event.respondWith(cacheFirstWithAppShellFallback(request));
});

// ─── 策略实现 ─────────────────────────────────────────────────────────────────

/** Cache First：先读缓存，未命中再走网络并缓存结果 */
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    // response.ok 仅对带 CORS 的响应为 true；opaque（no-cors）响应 status 为 0，
    // 但仍可缓存第三方库字节，作为缺少 crossorigin 时的兜底。
    if (response.ok || response.type === 'opaque') {
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

/** Stale While Revalidate + 超出配额时删除最旧条目
 *  立即返回缓存（若有），同时后台请求网络并更新缓存，
 *  确保服务器有新版本时下次请求能获取最新瓦片。
 *  传入 fetch event 时，会通过 event.waitUntil() 保持后台刷新继续执行。
 */
async function staleWhileRevalidateWithLimit(request, cacheName, maxEntries, event) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const updatePromise = (async () => {
    try {
      const response = await fetch(request);
      if (response.ok) {
        await cache.put(request, response.clone());
        await trimCache(cacheName, maxEntries);
      }
      return response;
    } catch {
      return null;
    }
  })();

  if (event && typeof event.waitUntil === 'function') {
    event.waitUntil(updatePromise.catch(() => null));
  }

  // 有缓存时立即返回，后台更新；无缓存时等待网络
  return cached || await updatePromise || new Response('Tile unavailable offline', { status: 503 });
}

/** Stale While Revalidate：立即返回缓存同时后台更新
 *  传入 fetch event 时，会通过 event.waitUntil() 保持后台刷新继续执行。
 */
async function staleWhileRevalidate(request, cacheName, event) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const updatePromise = (async () => {
    try {
      const response = await fetch(request);
      if (response.ok) {
        await cache.put(request, response.clone());
      }
      return response;
    } catch {
      return null;
    }
  })();

  if (event && typeof event.waitUntil === 'function') {
    event.waitUntil(updatePromise.catch(() => null));
  }

  return cached || await updatePromise || new Response('Offline', { status: 503 });
}

/** Network First：优先网络，失败时读缓存 */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put(request, response.clone());
      await trimCache(cacheName, MAX_RUNTIME_ENTRIES);
    }
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}

/** 导航请求 Network First：优先取最新 HTML，离线时回退缓存的 App Shell。
 *  保证部署新版本后用户能拿到新页面，同时保留离线可用性。 */
async function navigationNetworkFirst(request) {
  const shellCache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) await shellCache.put(request, response.clone());
    return response;
  } catch {
    const cached = await shellCache.match(request);
    return cached
      || await shellCache.match('/index.html')
      || new Response('Offline', { status: 503 });
  }
}

/** Cache First，找不到时降级到 /index.html（SPA 支持） */
async function cacheFirstWithAppShellFallback(request) {
  const shellCache = await caches.open(SHELL_CACHE);
  const cached = await shellCache.match(request);
  if (cached) return cached;

  const runtimeCache = await caches.open(RUNTIME_CACHE);
  const runtimeCached = await runtimeCache.match(request);
  if (runtimeCached) return runtimeCached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      await runtimeCache.put(request, response.clone());
      await trimCache(RUNTIME_CACHE, MAX_RUNTIME_ENTRIES);
    }
    return response;
  } catch {
    // 导航请求离线时返回 App Shell
    if (request.mode === 'navigate') {
      return shellCache.match('/index.html') || new Response('Offline', { status: 503 });
    }
    return new Response('Offline', { status: 503 });
  }
}

// ─── 辅助函数 ─────────────────────────────────────────────────────────────────

function isTileRequest(url) {
  return (
    /\.(pbf|mvt)(\?.*)?$/.test(url.pathname) ||
    /\/tiles\//.test(url.pathname) ||
    // Tileserver-GL 默认路径格式 /{z}/{x}/{y}.pbf
    /\/\d+\/\d+\/\d+(\.\w+)?(\?.*)?$/.test(url.pathname)
  );
}

function isCdnRequest(url) {
  return (
    url.hostname.includes('unpkg.com') ||
    url.hostname.includes('cdn.jsdelivr.net') ||
    url.hostname.includes('cdnjs.cloudflare.com')
  );
}

/** 地图样式 / sprite / glyphs（字体）资源——随服务器更新，需后台刷新而非永久缓存 */
function isMapStyleRequest(url) {
  return (
    /style\.json$/.test(url.pathname) ||
    /\/sprites?\b/.test(url.pathname) ||
    /\/(fonts|glyphs)\//.test(url.pathname)
  );
}

/** 异步删除超出配额的旧缓存条目 */
async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys  = await cache.keys();
  if (keys.length > maxEntries) {
    // 删除最早添加的（keys 按插入顺序排列）
    await Promise.all(keys.slice(0, keys.length - maxEntries).map(k => cache.delete(k)));
  }
}
