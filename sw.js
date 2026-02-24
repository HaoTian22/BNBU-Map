// BNBU Map — Service Worker
// Strategies:
//   App shell + static assets  → Cache First (长期缓存)
//   POI.json                   → Stale While Revalidate (后台刷新)
//   Map tiles                  → Cache First + 配额限制
//   CDN 第三方资源              → Cache First (按版本缓存)
//   /api/*                     → Network First (降级至缓存)

const CACHE_VERSION = 'v1';
const SHELL_CACHE   = `shell-${CACHE_VERSION}`;
const TILE_CACHE    = `tiles-${CACHE_VERSION}`;
const CDN_CACHE     = `cdn-${CACHE_VERSION}`;

// 最多缓存的瓦片数量（每块约 20–100 KB，500 块约 10–50 MB）
const MAX_TILE_ENTRIES = 500;

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
      .then(cache => cache.addAll(SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

// ─── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  const keep = [SHELL_CACHE, TILE_CACHE, CDN_CACHE];
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
    event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }

  // 地图瓦片（pbf / png / 矢量瓦片服务）
  if (isTileRequest(url)) {
    event.respondWith(cacheFirstWithLimit(request, TILE_CACHE, MAX_TILE_ENTRIES));
    return;
  }

  // CDN 第三方资源（unpkg / cdn）
  if (isCdnRequest(url)) {
    event.respondWith(cacheFirst(request, CDN_CACHE));
    return;
  }

  // POI.json → Stale While Revalidate
  if (url.pathname === '/POI.json') {
    event.respondWith(staleWhileRevalidate(request, SHELL_CACHE));
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
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

/** Cache First + 超出配额时删除最旧条目 */
async function cacheFirstWithLimit(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) {
      cache.put(request, response.clone());
      trimCache(cacheName, maxEntries); // 异步清理，不阻塞响应
    }
    return response;
  } catch {
    return new Response('Tile unavailable offline', { status: 503 });
  }
}

/** Stale While Revalidate：立即返回缓存同时后台更新 */
async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || await fetchPromise || new Response('Offline', { status: 503 });
}

/** Network First：优先网络，失败时读缓存 */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}

/** Cache First，找不到时降级到 /index.html（SPA 支持） */
async function cacheFirstWithAppShellFallback(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    // 导航请求离线时返回 App Shell
    if (request.mode === 'navigate') {
      return cache.match('/index.html') || new Response('Offline', { status: 503 });
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

/** 异步删除超出配额的旧缓存条目 */
async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys  = await cache.keys();
  if (keys.length > maxEntries) {
    // 删除最早添加的（keys 按插入顺序排列）
    await Promise.all(keys.slice(0, keys.length - maxEntries).map(k => cache.delete(k)));
  }
}
