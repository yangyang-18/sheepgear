/* ============================================================
 * sw.js — SHEEPGEAR 离线缓存（offline-cache，PWA）
 * 策略：导航请求网络优先/缓存回退；jsdelivr 库缓存优先（离线后地图仍可用）；
 *      天气/其他 API 请求不拦截（IndexedDB 已承载天气数据）。
 * 绝不缓存任何 key/私钥 URL（缓存清单仅含静态资源）。
 * ============================================================ */
'use strict'

var CACHE_NAME = 'sheepgear-v2'
/* 静态资源：多文件版与单文件版均覆盖（相对当前目录） */
var PRECACHE = [
  './',
  './index.html',
  './SHEEPGEAR.html',
  './SHEEPGEAR-单文件.html',
  './css/app.css',
  './js/catalog.js'
]

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function (cache) {
        // 预缓存失败不阻塞安装（部分文件可能不存在）
        return Promise.all(PRECACHE.map(function (u) {
          return fetch(u).then(function (r) { if (r && r.ok) return cache.put(u, r) }).catch(function () {})
        }))
      })
      .then(function () { return self.skipWaiting() })
  )
})

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME }).map(function (k) { return caches.delete(k) }))
    }).then(function () { return self.clients.claim() })
  )
})

self.addEventListener('fetch', function (event) {
  var req = event.request
  if (req.method !== 'GET') return
  var url = new URL(req.url)

  // jsdelivr 等第三方库：缓存优先（首次在线加载后离线可用）
  if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(
      caches.match(req).then(function (m) {
        return m || fetch(req).then(function (res) {
          if (res && res.ok) { var cl = res.clone(); caches.open(CACHE_NAME).then(function (c) { c.put(req, cl) }) }
          return res
        }).catch(function () { return m })
      })
    )
    return
  }

  // 同源静态资源 + 页面导航：网络优先、缓存回退
  // cache:'no-cache'：绕过浏览器/CDN 的 max-age=600 缓存，确保更新后立即看到新版
  var isStatic = url.origin === self.location.origin && /\.(html?|css|js|png|jpe?g|svg|gif|ico|woff2?)$/.test(url.pathname)
  if (req.mode === 'navigate' || isStatic) {
    event.respondWith(
      fetch(req, { cache: 'no-cache' }).then(function (res) {
        if (res && res.ok) { var cl2 = res.clone(); caches.open(CACHE_NAME).then(function (c) { c.put(req, cl2) }) }
        return res
      }).catch(function () {
        return caches.match(req).then(function (m) {
          return m || (req.mode === 'navigate' ? caches.match('./') : undefined)
        })
      })
    )
  }
  // 其余（天气/地理 API 等）不拦截：保持在线语义，由应用层 IndexedDB 兜底
})
