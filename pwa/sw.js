/**
 * SERVICE WORKER - Venda+ PWA
 * Versão: 2.0.0
 * Data: ${new Date().toISOString().split('T')[0]}
 * 
 * ESTRATÉGIA DE CACHE:
 * - Critical: HTML, CSS, JS (Cache First, Network como fallback)
 * - Assets: Imagens, Fontes (Cache First com atualização em background)
 * - API: Firebase (Network First, Cache como fallback)
 * - Dinâmico: Nunca cacheado
 */

// CONFIGURAÇÕES
const CACHE_NAME = 'vendaplus-cache-v2.0.0';
const OFFLINE_CACHE = 'vendaplus-offline-v1';
const API_CACHE = 'vendaplus-api-v1';

// ARQUIVOS CRÍTICOS (instalados imediatamente)
const CRITICAL_FILES = [
  '/vendamais/',
  '/vendamais/index.html',
  '/vendamais/login.html',
  '/vendamais/vitrine.html',
  '/vendamais/painelvendas.html',
  '/vendamais/favicon.ico',
  '/vendamais/manifest.json',
  '/vendamais/sw.js'
];

// ARQUIVOS DE ASSETS (cacheados sob demanda)
const ASSET_PATTERNS = [
  /\.css$/,
  /\.js$/,
  /\.(png|jpg|jpeg|gif|svg|ico|webp)$/,
  /\.(woff|woff2|ttf|eot)$/
];

// DOMÍNIOS PARA CACHE DE API
const API_DOMAINS = [
  'firebase.googleapis.com',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com'
];

// DOMÍNIOS EXCLUDOS DO CACHE
const EXCLUDED_DOMAINS = [
  'www.googletagmanager.com',
  'www.google-analytics.com',
  'firestore.googleapis.com' // Dados dinâmicos
];

/**
 * INSTALAÇÃO DO SERVICE WORKER
 * - Cache imediato dos arquivos críticos
 * - SkipWaiting para ativação imediata
 */
self.addEventListener('install', (event) => {
  console.log('[SW] Instalando Service Worker versão 2.0.0');
  
  event.waitUntil(
    Promise.all([
      // Cache de arquivos críticos
      caches.open(CACHE_NAME)
        .then(cache => {
          console.log('[SW] Cacheando arquivos críticos:', CRITICAL_FILES);
          return cache.addAll(CRITICAL_FILES);
        }),
      
      // Cache de fallback offline
      caches.open(OFFLINE_CACHE)
        .then(cache => {
          return cache.addAll([
            '/vendamais/offline.html'
          ]);
        }),
      
      // Forçar ativação imediata
      self.skipWaiting()
    ])
    .then(() => {
      console.log('[SW] Instalação completa');
    })
    .catch(error => {
      console.error('[SW] Erro na instalação:', error);
    })
  );
});

/**
 * ATIVAÇÃO DO SERVICE WORKER
 * - Limpeza de caches antigos
 * - Ativação imediata com clients.claim
 */
self.addEventListener('activate', (event) => {
  console.log('[SW] Ativando Service Worker');
  
  event.waitUntil(
    Promise.all([
      // Limpar caches antigos
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            // Remove todos os caches exceto os atuais
            if (cacheName !== CACHE_NAME && 
                cacheName !== OFFLINE_CACHE && 
                cacheName !== API_CACHE) {
              console.log('[SW] Removendo cache antigo:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      
      // Tomar controle imediato de todas as páginas
      self.clients.claim()
    ])
    .then(() => {
      console.log('[SW] Ativação completa');
      
      // Enviar mensagem para todas as páginas
      self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'SW_ACTIVATED',
            version: '2.0.0',
            timestamp: new Date().toISOString()
          });
        });
      });
    })
  );
});

/**
 * ESTRATÉGIA DE CACHE INTELIGENTE
 * - Decidir estratégia baseada no tipo de requisição
 */
function getCacheStrategy(request) {
  const url = new URL(request.url);
  
  // Verificar se é domínio excluído
  if (EXCLUDED_DOMAINS.some(domain => url.hostname.includes(domain))) {
    return 'NETWORK_ONLY';
  }
  
  // Arquivos críticos (HTML principal)
  if (url.pathname === '/' || 
      url.pathname === '/vendamais/' ||
      url.pathname.endsWith('.html')) {
    return 'CACHE_FIRST';
  }
  
  // Assets estáticos
  if (ASSET_PATTERNS.some(pattern => pattern.test(url.pathname))) {
    return 'CACHE_FIRST_STALE';
  }
  
  // APIs externas
  if (API_DOMAINS.some(domain => url.hostname.includes(domain))) {
    return 'NETWORK_FIRST';
  }
  
  // Firebase Firestore/Auth (não cachear dados dinâmicos)
  if (url.hostname.includes('firebase') || 
      url.pathname.includes('firestore') ||
      url.pathname.includes('auth')) {
    return 'NETWORK_ONLY';
  }
  
  // Padrão: Network First
  return 'NETWORK_FIRST';
}

/**
 * HANDLER DE FETCH - Intercepta todas as requisições
 */
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  const strategy = getCacheStrategy(request);
  
  // Ignorar requisições não GET
  if (request.method !== 'GET') {
    return;
  }
  
  // Ignorar extensões específicas
  if (url.pathname.endsWith('.map') || 
      url.pathname.includes('chrome-extension')) {
    return;
  }
  
  console.log(`[SW] Fetch: ${url.pathname} -> Estratégia: ${strategy}`);
  
  switch(strategy) {
    case 'CACHE_FIRST':
      event.respondWith(cacheFirst(request));
      break;
      
    case 'CACHE_FIRST_STALE':
      event.respondWith(cacheFirstStale(request));
      break;
      
    case 'NETWORK_FIRST':
      event.respondWith(networkFirst(request));
      break;
      
    case 'NETWORK_ONLY':
      event.respondWith(networkOnly(request));
      break;
      
    default:
      event.respondWith(networkFirst(request));
  }
});

/**
 * ESTRATÉGIA: CACHE FIRST
 * - Usada para arquivos críticos que raramente mudam
 */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  
  try {
    // 1. Tenta buscar do cache
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      console.log('[SW] Cache First: Servindo do cache', request.url);
      
      // Atualiza cache em background (stale-while-revalidate)
      event.waitUntil(
        fetch(request)
          .then(response => {
            if (response && response.status === 200) {
              cache.put(request, response.clone());
            }
          })
          .catch(() => {
            // Falha silenciosa na atualização
          })
      );
      
      return cachedResponse;
    }
    
    // 2. Se não tem no cache, busca da rede
    console.log('[SW] Cache First: Buscando da rede', request.url);
    const networkResponse = await fetch(request);
    
    // 3. Armazena no cache para próximas requisições
    if (networkResponse && networkResponse.status === 200) {
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
    
  } catch (error) {
    console.error('[SW] Cache First Error:', error);
    
    // Fallback offline para páginas HTML
    if (request.headers.get('Accept').includes('text/html')) {
      const offlineCache = await caches.open(OFFLINE_CACHE);
      const offlineResponse = await offlineCache.match('/vendamais/offline.html');
      if (offlineResponse) {
        return offlineResponse;
      }
    }
    
    return new Response('Offline', {
      status: 503,
      statusText: 'Service Unavailable',
      headers: new Headers({
        'Content-Type': 'text/plain'
      })
    });
  }
}

/**
 * ESTRATÉGIA: CACHE FIRST STALE
 * - Para assets estáticos que podem ser atualizados
 * - Retorna cache imediatamente, atualiza em background
 */
async function cacheFirstStale(request) {
  const cache = await caches.open(CACHE_NAME);
  
  // 1. Tenta do cache primeiro (rápido)
  const cachedResponse = await cache.match(request);
  
  // 2. Busca da rede em background para atualizar
  const networkPromise = fetch(request)
    .then(networkResponse => {
      if (networkResponse && networkResponse.status === 200) {
        cache.put(request, networkResponse.clone());
      }
      return networkResponse;
    })
    .catch(() => {
      // Falha silenciosa
      return null;
    });
  
  // 3. Se tem cache, retorna imediatamente
  if (cachedResponse) {
    console.log('[SW] Cache First Stale: Servindo do cache', request.url);
    
    // Inicia atualização em background
    event.waitUntil(networkPromise);
    
    return cachedResponse;
  }
  
  // 4. Se não tem cache, espera pela rede
  console.log('[SW] Cache First Stale: Buscando da rede', request.url);
  const networkResponse = await networkPromise;
  
  if (networkResponse) {
    return networkResponse;
  }
  
  // 5. Fallback
  return new Response('Asset não encontrado', { status: 404 });
}

/**
 * ESTRATÉGIA: NETWORK FIRST
 * - Para dados que precisam estar atualizados
 * - Usa cache apenas quando offline
 */
async function networkFirst(request) {
  const cache = await caches.open(API_CACHE);
  
  try {
    // 1. Tenta buscar da rede
    console.log('[SW] Network First: Buscando da rede', request.url);
    const networkResponse = await fetch(request);
    
    // 2. Se sucesso, atualiza cache
    if (networkResponse && networkResponse.status === 200) {
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
    
  } catch (error) {
    console.log('[SW] Network First: Offline, usando cache', request.url);
    
    // 3. Se offline, tenta do cache
    const cachedResponse = await cache.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // 4. Se não tem cache, retorna erro
    return new Response('Conteúdo indisponível offline', {
      status: 503,
      headers: new Headers({
        'Content-Type': 'text/plain'
      })
    });
  }
}

/**
 * ESTRATÉGIA: NETWORK ONLY
 * - Para dados que nunca devem ser cacheados
 */
async function networkOnly(request) {
  console.log('[SW] Network Only: Buscando da rede', request.url);
  
  try {
    return await fetch(request);
  } catch (error) {
    console.error('[SW] Network Only Error:', error);
    return new Response('Erro de conexão', { status: 503 });
  }
}

/**
 * ATUALIZAÇÃO AUTOMÁTICA
 * - Verifica atualizações periodicamente
 */
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-updates') {
    console.log('[SW] Verificando atualizações...');
    event.waitUntil(checkForUpdates());
  }
});

async function checkForUpdates() {
  try {
    const response = await fetch('/vendamais/version.json', {
      cache: 'no-store'
    });
    
    if (response.ok) {
      const data = await response.json();
      
      if (data.version !== '2.0.0') {
        console.log('[SW] Nova versão disponível:', data.version);
        
        // Notificar páginas sobre atualização
        self.clients.matchAll().then(clients => {
          clients.forEach(client => {
            client.postMessage({
              type: 'UPDATE_AVAILABLE',
              version: data.version,
              forceReload: data.forceReload || false
            });
          });
        });
      }
    }
  } catch (error) {
    console.error('[SW] Erro ao verificar atualizações:', error);
  }
}

/**
 * MENSAGENS DO CLIENT
 * - Comunicação entre páginas e service worker
 */
self.addEventListener('message', (event) => {
  console.log('[SW] Message from client:', event.data);
  
  switch(event.data.type) {
    case 'SKIP_WAITING':
      self.skipWaiting();
      break;
      
    case 'GET_VERSION':
      event.ports[0].postMessage({
        version: '2.0.0',
        cacheName: CACHE_NAME,
        timestamp: new Date().toISOString()
      });
      break;
      
    case 'CLEAR_CACHE':
      caches.delete(CACHE_NAME).then(() => {
        event.ports[0].postMessage({ success: true });
      });
      break;
  }
});

// DEBUG: Log de estado do Service Worker
console.log('[SW] Service Worker carregado:', CACHE_NAME);