// Service worker Kampusya — met en cache la coquille de l'application
// pour permettre l'installation et un minimum de résilience hors ligne.
// N'intercepte jamais les appels vers Supabase ou les fonctions Netlify :
// ces données doivent toujours venir du réseau, jamais du cache.

const CACHE_NAME = 'kampusya-shell-v1';
const SHELL_FILES = ['/', '/index.html', '/manifest.json'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_FILES)).catch(()=>{})
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = event.request.url;
  // Ne jamais mettre en cache Supabase ou les fonctions serveur : toujours du réseau frais
  if (url.includes('supabase.co') || url.includes('/.netlify/functions/')) {
    return;
  }
  // Coquille de l'app : réseau en priorité, cache en secours si hors ligne
  event.respondWith(
    fetch(event.request)
      .then(res => {
        const resClone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, resClone)).catch(()=>{});
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
