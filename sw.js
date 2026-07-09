/* =====================================================================
   Service worker — Consulta Fiscal Âmbar
   Estratégia:
   - Assets estáticos (html/css/js/ícones): cache-first, versionado por VERSAO
   - Base de dados (data/*.json): network-first com fallback ao cache,
     para o usuário sempre ver a base mais recente quando tem sinal e
     continuar consultando quando está sem rede
   - Página ADM e API do GitHub: nunca interceptadas (sempre rede)
   ===================================================================== */
'use strict';

var VERSAO = 'consulta-fiscal-v6';
var ESTATICOS = [
  './',
  'index.html',
  'css/style.css?v=6',
  'js/busca.js?v=6',
  'js/app.js?v=6',
  'manifest.webmanifest',
  'icons/icone-192.png',
  'icons/icone-512.png',
  'icons/icone-maskable-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(VERSAO)
      .then(function (c) { return c.addAll(ESTATICOS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (nomes) {
      return Promise.all(nomes.map(function (n) {
        if (n !== VERSAO) return caches.delete(n);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;          // API GitHub etc.: direto na rede
  if (url.pathname.indexOf('admin') !== -1) return;         // ADM sempre fresco

  if (url.pathname.indexOf('/data/') !== -1) {
    /* base de dados: rede primeiro, cache como reserva offline */
    e.respondWith(
      fetch(e.request).then(function (resp) {
        var copia = resp.clone();
        caches.open(VERSAO).then(function (c) { c.put(e.request, copia); });
        return resp;
      }).catch(function () {
        return caches.match(e.request);
      })
    );
    return;
  }

  /* estáticos: cache primeiro, rede como complemento */
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      return hit || fetch(e.request).then(function (resp) {
        var copia = resp.clone();
        caches.open(VERSAO).then(function (c) { c.put(e.request, copia); });
        return resp;
      });
    })
  );
});
