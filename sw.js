/* Visitas em Campo — service worker: abre a app sem internet a partir da 2.ª vez.
   - index.html e firebase-config.js: rede primeiro (as versões novas chegam logo que houver rede), cópia guardada se a rede falhar ou demorar.
   - SDK do Firebase (gstatic) e letras (Google Fonts): cópia guardada primeiro.
   - Tudo o resto (Firestore, login anónimo, mapas) passa direto, sem interferência. */
const CACHE = 'visitas-em-campo-v1';
const SHELL = ['./', './index.html', './firebase-config.js', './manifest.json', './icon-192.png', './icon-512.png', './apple-touch-icon.png'];
const SDK = [
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js'
];
const NETWORK_TIMEOUT_MS = 3000;

self.addEventListener('install', e=>{
  e.waitUntil((async()=>{
    const c = await caches.open(CACHE);
    await Promise.all(SHELL.map(u=>c.add(new Request(u, { cache:'reload' })).catch(()=>{})));
    await Promise.all(SDK.map(u=>fetch(u, { mode:'no-cors' }).then(r=>c.put(u, r)).catch(()=>{})));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', e=>{
  e.waitUntil((async()=>{
    const keys = await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

async function networkFirst(req, key){
  const c = await caches.open(CACHE);
  const fromNet = fetch(req).then(res=>{ if(res && res.ok) c.put(key, res.clone()); return res; });
  try{
    return await Promise.race([ fromNet, new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')), NETWORK_TIMEOUT_MS)) ]);
  }catch(err){
    const hit = await c.match(key, { ignoreSearch:true });
    if(hit){ fromNet.catch(()=>{}); return hit; }  // a rede lenta continua em segundo plano e atualiza a cópia
    return fromNet;
  }
}
async function cacheFirst(req){
  const c = await caches.open(CACHE);
  const hit = await c.match(req);
  if(hit) return hit;
  const res = await fetch(req);
  if(res && (res.ok || res.type==='opaque')) c.put(req, res.clone());
  return res;
}

self.addEventListener('fetch', e=>{
  const req = e.request;
  if(req.method !== 'GET') return;
  const url = new URL(req.url);
  if(url.origin === self.location.origin){
    const p = url.pathname;
    const isPage = req.mode === 'navigate' || p.endsWith('/') || p.endsWith('/index.html');
    if(isPage){ e.respondWith(networkFirst(req, './index.html')); return; }
    if(p.endsWith('/firebase-config.js')){ e.respondWith(networkFirst(req, './firebase-config.js')); return; }
    if(p.endsWith('/manifest.json') || /\/(icon-|apple-touch-icon)/.test(p)){ e.respondWith(cacheFirst(req)); return; }
    return;
  }
  if(url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/')){ e.respondWith(cacheFirst(req)); return; }
  if(url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'){
    e.respondWith(cacheFirst(req).catch(()=>new Response('', { status:204 })));
    return;
  }
});
