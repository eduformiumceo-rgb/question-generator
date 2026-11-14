/* ─────────────────────────────────────────────
   Eduformium Questions Generator Service Worker  v1.0
   - App shell works fully offline
   - API / auth / Supabase always go to network
   - Dynamic assets cached on first visit
───────────────────────────────────────────── */

const CACHE_VERSION = "eduformium-questions-v1";
const OFFLINE_PAGE  = "/index.html";

// ── Install: cache the app shell ──────────────
// IMPORTANT: cache.addAll() fails ENTIRELY (rejecting the whole install
// event) if even one URL in the list 404s. Vite outputs content-hashed
// filenames (e.g. /assets/main-<hash>.js), so literal paths like
// "/assets/index.js" never exist and always 404 — which was silently
// breaking install() on every single deploy. Because install() never
// succeeded, this new service worker (and every fix shipped since) never
// activated; the browser kept running whatever old SW last installed
// successfully, serving its stale cached bundle forever regardless of
// how many times the site was redeployed. Only cache paths guaranteed to
// exist with stable, unhashed names; hashed JS/CSS chunks are picked up
// dynamically by the fetch handler below on first request instead.
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_VERSION).then((cache) =>
      cache.addAll([
        "/",
        "/index.html",
        "/manifest.json",
        "/questions-icon-192.png",
        "/questions-icon-512.png",
        "/questions-icon-192-maskable.png",
        "/questions-icon-512-maskable.png",
        "/questions-logo.png",
        "/questions-apple-touch-icon.png",
        "/questions-favicon-32.png",
      ].map((u) => new Request(u, { cache: "reload" })))
    ).then(() => self.skipWaiting())
  );
});

// ── Activate: wipe old caches ─────────────────
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_VERSION)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: smart routing ──────────────────────
self.addEventListener("fetch", (e) => {
  const { request } = e;
  const url = new URL(request.url);

  // 1. Always bypass: API calls, auth, Supabase, cross-origin
  const bypass =
    url.pathname.startsWith("/api/") ||
    url.hostname.includes("supabase") ||
    url.hostname.includes("anthropic") ||
    url.hostname.includes("googleapis") ||
    url.hostname.includes("paystack") ||
    url.hostname !== self.location.hostname;

  if (bypass) return; // let browser handle natively

  // 1b. The web-app manifest drives the browser's install dialog and the
  // installed app's icon + name — never serve it from a stale cache.
  if (url.pathname === "/manifest.json") {
    e.respondWith(
      fetch(request, { cache: "no-store" })
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(request, clone));
          }
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // 2. HTML navigation — network first, fall back to cached shell
  if (request.mode === "navigate") {
    e.respondWith(
      fetch(request)
        .then((res) => {
          // Cache fresh copy while online
          const clone = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(request, clone));
          return res;
        })
        .catch(() =>
          // Offline: serve cached shell — React router handles the rest
          caches.match(OFFLINE_PAGE)
        )
    );
    return;
  }

  // 3. JS / CSS / images / fonts — cache first, update in background
  if (
    url.pathname.match(/\.(js|css|png|jpg|jpeg|webp|svg|ico|woff2?|ttf)$/)
  ) {
    e.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(request, clone));
          }
          return res;
        });
        // Return cache instantly if available, fetch updates it silently
        return cached || fetchPromise;
      })
    );
    return;
  }

  // 4. Everything else — network first, cache fallback
  e.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(request, clone));
        }
        return res;
      })
      .catch(() => caches.match(request))
  );
});

// ── Message: force update from app ───────────
self.addEventListener("message", (e) => {
  if (e.data === "SKIP_WAITING") self.skipWaiting();
});