/*
 * sw.js - service worker for the Dose Assistant
 *
 * Two jobs: let the app install to the home screen, and let it open with
 * no internet connection.
 *
 * NETWORK FIRST, ON PURPOSE.
 * The usual service worker serves from its cache and only checks the
 * network afterwards, which makes a page load instantly but means an
 * edit you just published does not appear, sometimes for days. That is
 * the single most common way a service worker ruins an afternoon.
 *
 * This one asks the network first and falls back to the cache only when
 * the request fails. Slightly slower, always current, and still works
 * with the connection off. For a prototype under active edit that trade
 * is the right way round.
 *
 * WHAT STILL NEEDS THE INTERNET
 * Speech recognition. Chrome sends the audio to Google's servers to
 * transcribe it, so listening will not work offline no matter what is
 * cached. Speaking, the dial, the arithmetic and the saved settings all
 * work offline.
 *
 * Ethan Hebert | Carilion Giles: Insulin Dosing
 */

// Bump this string whenever you want every visitor to drop their old
// cache. Changing it is what retires the previous version.
const CACHE = 'dose-assistant-v1';

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable.png'
];

// ---------- install: stash the shell ----------
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => cache.addAll(SHELL))
      // Take over straight away rather than waiting for every tab to
      // close, so a published fix reaches people on the next load.
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())   // a missing file must not block install
  );
});

// ---------- activate: throw away older caches ----------
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(
        names.filter(n => n !== CACHE).map(n => caches.delete(n))
      ))
      .then(() => self.clients.claim())
  );
});

// ---------- fetch: network first, cache as the fallback ----------
self.addEventListener('fetch', event => {
  const req = event.request;

  // Only handle our own GET requests. Anything else, including the
  // speech service, goes straight to the network untouched.
  if(req.method !== 'GET') return;
  if(new URL(req.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then(res => {
        // Keep a fresh copy for the next time there is no connection.
        const copy = res.clone();
        caches.open(CACHE).then(cache => cache.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() =>
        caches.match(req).then(hit => hit || caches.match('./index.html'))
      )
  );
});
