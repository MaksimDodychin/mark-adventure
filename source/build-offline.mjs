// build-offline.mjs — офлайн-версия (Three.js вшит через data-URL). Запуск: node build-offline.mjs
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import https from 'node:https';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = dirname(fileURLToPath(import.meta.url));
const SRC = join(DIR, 'Большое-приключение.html');
const THREE_LOCAL = join(DIR, 'three.module.min.js');
const OUT = join(DIR, 'Большое-приключение-ДЛЯ-ТЕЛЕФОНА.html');
const THREE_URL = 'https://unpkg.com/three@0.160.0/build/three.module.min.js';

function fetchUrl(url) {
  return new Promise((res, rej) => { https.get(url, r => {
    if (r.statusCode >= 300 && r.statusCode < 400 && r.headers.location) { fetchUrl(r.headers.location).then(res, rej); return; }
    if (r.statusCode !== 200) { rej(new Error('HTTP ' + r.statusCode)); return; }
    const chunks = []; r.on('data', c => chunks.push(c)); r.on('end', () => res(Buffer.concat(chunks)));
  }).on('error', rej); });
}

let threeBuf;
if (existsSync(THREE_LOCAL)) { threeBuf = readFileSync(THREE_LOCAL); console.log('движок из кэша'); }
else { console.log('скачиваю движок…'); threeBuf = await fetchUrl(THREE_URL); writeFileSync(THREE_LOCAL, threeBuf); }

const dataUrl = 'data:text/javascript;base64,' + threeBuf.toString('base64');
let html = readFileSync(SRC, 'utf8');
// основной модуль
html = html.replace(/https:\/\/unpkg\.com\/three@[\d.]+\/build\/three\.module\.js/g, dataUrl);
// дополнительные модули three (Sky, RoomEnvironment и т.п.) — вшиваем каждый отдельно
const extra = [...new Set((html.match(/https:\/\/unpkg\.com\/three@[\d.]+\/examples\/jsm\/[^"']+/g) || []))];

/* Модуль three тянет за собой соседей («../shaders/CopyShader.js» и т.п.).
   Из data:-URL такие относительные пути не разрешаются — значит вшиваем рекурсивно. */
const готовые = new Map();
async function скачать(url) {
  const cachePath = join(DIR, '.cache-' + url.split('/').slice(-2).join('-'));
  if (existsSync(cachePath)) return readFileSync(cachePath);
  console.log('скачиваю', url.split('/').slice(-2).join('/'));
  const buf = await fetchUrl(url);
  writeFileSync(cachePath, buf);
  return buf;
}
function базаURL(url) { return url.slice(0, url.lastIndexOf('/') + 1); }
function разрешить(база, отн) {
  const u = new URL(отн, база);
  return u.href;
}
async function вшить(url) {
  if (готовые.has(url)) return готовые.get(url);
  готовые.set(url, 'data:text/javascript;base64,');            // заглушка от циклов
  let код = (await скачать(url)).toString('utf8');
  const база = базаURL(url);
  // все относительные импорты внутри модуля меняем на их же data:-URL
  const пути = [...new Set([...код.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map(m => m[1]))];
  for (const отн of пути) {
    const полн = разрешить(база, отн);
    const внутр = полн.includes('/build/three.module') ? threeData : await вшить(полн);
    код = код.split("'" + отн + "'").join("'" + внутр + "'").split('"' + отн + '"').join('"' + внутр + '"');
  }
  // 'three' внутри examples/jsm ведёт на сам движок
  код = код.replace(/from\s+['"]three['"]/g, "from '" + threeData + "'");
  const data = 'data:text/javascript;base64,' + Buffer.from(код, 'utf8').toString('base64');
  готовые.set(url, data);
  return data;
}
const threeData = dataUrl;
for (const url of extra) {
  const inner = await вшить(url);
  html = html.split(url).join(inner);
}
writeFileSync(OUT, html);
console.log('✅ офлайн-версия готова:', OUT);
console.log('   внешних ссылок осталось:', (html.match(/https?:\/\//g) || []).length);
