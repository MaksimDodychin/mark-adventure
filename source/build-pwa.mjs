// build-pwa.mjs — собирает pwa/ (устанавливаемое приложение) из офлайн-версии.
// Порядок: node make-icons.mjs → node build-offline.mjs → node build-pwa.mjs → git push (Pages).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const PHONE = join(DIR, 'Большое-приключение-ДЛЯ-ТЕЛЕФОНА.html');
const PWA = join(DIR, 'pwa');
mkdirSync(PWA, { recursive: true });

let html = readFileSync(PHONE, 'utf8');
// версия сборки: по ней игра понимает, что вышло обновление
let VER = '';   // считаем ниже: в хэш входит и сам обновлятор
const headTags = `
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="icon" type="image/png" sizes="192x192" href="icon-192.png">
  <link rel="icon" type="image/png" sizes="512x512" href="icon-512.png">
  <link rel="shortcut icon" type="image/png" href="icon-192.png">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="apple-mobile-web-app-title" content="Большое приключение">
  <link rel="apple-touch-icon" sizes="180x180" href="apple-touch-icon.png">
  <link rel="apple-touch-icon-precomposed" sizes="180x180" href="apple-touch-icon.png">
  <meta name="msapplication-TileImage" content="icon-192.png">
  <meta name="msapplication-TileColor" content="#12456e">
  <script>window.__APP_VER = __VER__;</script>
`;
// Регистрация + САМООБНОВЛЕНИЕ: игра стартует мгновенно из памяти,
// а свежая версия докачивается фоном и применяется сама.
const swReg = `
<script>
/* scoped PWA updater: the installed offline copy stays until a verified replacement activates. */
(function () {
  var scope = new URL('./', location.href).href;
  var pending = '', checking = false, registrationPromise = null;
  function banner(text) {
    var d = document.getElementById('updBanner');
    if (!d) { d = document.createElement('div'); d.id = 'updBanner';
      d.style.cssText = 'position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:99999;background:#0b1220ee;color:#7dd3fc;font:900 15px system-ui;padding:10px 18px;border-radius:14px;border:2px solid #7dd3fc55;box-shadow:0 8px 24px #0009';
      document.body.appendChild(d); }
    d.textContent = text; return d;
  }
  function register() {
    if (!('serviceWorker' in navigator)) return Promise.resolve(null);
    if (!registrationPromise) registrationPromise = navigator.serviceWorker.register(new URL('sw.js', scope).href,
      { scope: scope, updateViaCache: 'none' }).catch(function (e) { registrationPromise = null; throw e; });
    return registrationPromise;
  }
  function navigate(version) {
    var url = new URL(location.href); url.searchParams.set('v', version);
    if (url.href === location.href) location.reload(); else location.replace(url.href);
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('controllerchange', function () {
    if (pending) navigate(pending);
  });
  async function version() {
    var url = new URL('version.json', scope); url.searchParams.set('t', Date.now());
    var response = await fetch(url.href, { cache: 'no-store' });
    if (!response.ok) throw new Error('version unavailable');
    var value = await response.json();
    if (!value || typeof value.v !== 'string' || !/^[a-zA-Z0-9._-]{1,80}$/.test(value.v)) throw new Error('invalid version');
    return value.v;
  }
  async function applyUpdate(next) {
    try {
      if (typeof next !== 'string') next = await version();
      if (next === window.__APP_VER) return false;
      if (pending === next) return true;
      pending = next; banner('🔄 Обновляю игру…');
      var reg = await register();
      if (reg) {
        // The worker verifies index.html, fills its new cache, then takes over atomically.
        await reg.update();
      } else {
        var target = new URL('release-' + next + '.html', scope);
        var response = await fetch(target.href, { cache: 'reload' });
        if (!response.ok) throw new Error('update unavailable');
        var match = (await response.text()).match(/window\\.__APP_VER\\s*=\\s*["']([^"']+)["']/);
        if (!match || match[1] !== next) throw new Error('update not ready');
        location.replace(target.href);
      }
      setTimeout(function () { if (pending) { pending = ''; var d = document.getElementById('updBanner'); if (d) d.remove(); } }, 20000);
      return true;
    } catch (_) {
      pending = ''; var d = banner('📴 Обновление пока недоступно — игра работает офлайн');
      setTimeout(function () { d.remove(); }, 3500); return false;
    }
  }
  async function checkVersion(show) {
    if (checking || pending) return false; checking = true;
    try {
      var next = await version();
      if (next === window.__APP_VER) {
        if (show === true) { var d = banner('✅ У тебя самая свежая версия'); setTimeout(function () { d.remove(); }, 2500); }
        return false;
      }
      var action = function () { return applyUpdate(next); };
      if (window.__onUpdate) window.__onUpdate(action); else await action();
      return true;
    } catch (_) {
      if (show === true) { var d = banner('📴 Нет интернета — игра работает офлайн'); setTimeout(function () { d.remove(); }, 2500); }
      return false;
    } finally { checking = false; }
  }
  window.__forceUpdate = function () { return applyUpdate(); };
  window.__checkUpdate = function () { return checkVersion(true); };
  window.addEventListener('load', function () {
    register().catch(function () {});
    setTimeout(checkVersion, 500); setTimeout(checkVersion, 4000);
  });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) checkVersion(); });
  window.addEventListener('online', function () { checkVersion(); });
  setInterval(checkVersion, 60000);
})();
</script>
`;
// ⚠️ Версия должна меняться и когда правится САМ обновлятор, иначе телефон
// не увидит новую сборку и застрянет на старой (поймано 23.08).
const sw = `// Scoped offline application updater; version changes with the payload and updater.
const VERSION = '__SWVER__';
const PREFIX = "adventure-";
const CACHE = PREFIX + VERSION;
const SCOPE = new URL(self.registration.scope);
const INDEX = new URL('index.html', SCOPE).href;
const RELEASE = new URL('release-__SWVER__.html', SCOPE).href;
const ASSETS = ["./manifest.webmanifest","./icon-192.png","./icon-512.png","./icon-512-maskable.png","./apple-touch-icon.png","./favicon-64.png"];
const belongs = url => url.origin === SCOPE.origin && url.pathname.startsWith(SCOPE.pathname);
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    // Installation must fail if the new HTML is missing, stale, or only half deployed.
    const response = await fetch(new Request(RELEASE, { cache: 'reload' }));
    if (!response.ok) throw new Error('New application document unavailable');
    const match = (await response.clone().text()).match(/window\\.__APP_VER\\s*=\\s*["']([^"']+)["']/);
    if (!match || match[1] !== VERSION) throw new Error('New application version not deployed yet');
    const cache = await caches.open(CACHE);
    await cache.put(INDEX, response.clone());
    await cache.put(SCOPE.href, response);
    await Promise.all(ASSETS.map(async asset => {
      try {
        const url = new URL(asset, SCOPE).href;
        const result = await fetch(new Request(url, { cache: 'reload' }));
        if (result.ok) await cache.put(url, result);
      } catch (_) {} // An optional icon never invalidates the already verified game document.
    }));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    // ⚠️ ЖАЛОБА МАРКА 19.09.2026: при ПЕРВОМ заходе воркер перезагружал страницу
    //    на адрес ?v=…, и всё, что человек успел сделать (например, создал комнату),
    //    пропадало. Перезагружаем окна ТОЛЬКО если правда заменили старую версию.
    const hadOld = names.some(name => name.startsWith(PREFIX) && name !== CACHE);
    await Promise.all(names.filter(name => name.startsWith(PREFIX) && name !== CACHE).map(name => caches.delete(name)));
    await self.clients.claim();
    const windows = hadOld ? await self.clients.matchAll({ type: 'window' }) : [];
    for (const client of windows) {
      const url = new URL(client.url);
      if (!belongs(url) || url.searchParams.get('v') === VERSION) continue;
      url.searchParams.set('v', VERSION);
      // Do not await navigation: it can wait for this activation to finish.
      client.navigate(url.href).catch(() => {});
    }
  })());
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (!belongs(url) || url.pathname === new URL('version.json', SCOPE).pathname) return;
  const doc = event.request.mode === 'navigate' || event.request.destination === 'document';
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(doc ? INDEX : event.request, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const result = await fetch(event.request);
      if (result.ok) await cache.put(event.request, result.clone());
      return result;
    } catch (_) {
      return doc ? (await cache.match(INDEX)) || Response.error() : Response.error();
    }
  })());
});
`;

// ⚠️ В версию входит и сам воркер: иначе при правке воркера имя кэша не менялось,
// старая страница оставалась в кэше и застрявшая копия крутилась по кругу (23.08).
VER = createHash('md5').update(html + swReg + sw).digest('hex').slice(0, 10);
const headTags2 = headTags.replace('__VER__', JSON.stringify(VER));
if (!html.includes('rel="manifest"')) html = html.replace('</head>', headTags2 + '</head>');
if (!html.includes('serviceWorker.register')) html = html.replace('</body>', swReg + '</body>');
writeFileSync(join(PWA, 'index.html'), html);
// Immutable filename avoids a stale CDN index during an otherwise completed deployment.
writeFileSync(join(PWA, 'release-' + VER + '.html'), html);

const manifest = {
  name: 'Большое приключение',
  short_name: 'Приключение',
  description: 'Одиннадцать миров, четверо приспешников Морока и призрак Блик. Вдвоём — экран пополам. 🗺',
  lang: 'ru',
  start_url: './index.html', scope: './',
  display: 'fullscreen', display_override: ['fullscreen', 'standalone'], orientation: 'landscape',
  background_color: '#0d2b52', theme_color: '#12456e',
  icons: [
    { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: 'icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    { src: 'favicon-64.png', sizes: '64x64', type: 'image/png', purpose: 'any' },
  ],
};
writeFileSync(join(PWA, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2));

const ver = VER;
writeFileSync(join(PWA, 'version.json'), JSON.stringify({ v: ver }));
writeFileSync(join(PWA, 'sw.js'), sw.split('__SWVER__').join(ver));
writeFileSync(join(PWA, '.nojekyll'), '');
console.log('✅ PWA собрана в', PWA);
console.log('   ссылок на unpkg в index.html:', (html.match(/unpkg/g) || []).length);
