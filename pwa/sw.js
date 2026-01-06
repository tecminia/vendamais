// Configurações do Service Worker para VendaMais ADM
const APP_VERSION = '1.5.0';
const CACHE_NAME = `venda-mais-admin-${APP_VERSION}`;

// URLs para cache (considerando que os arquivos estão na raiz de vendamaisadm)
const STATIC_ASSETS = [
  // Páginas principais
  './',
  './index.html',
  './login.html',
  './painelvendas.html',
  './vitrine.html',
  
  // Favicon e assets
  './favicon.ico',
  
  // CDNs externos (cache opcional para funcionamento offline)
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700&display=swap',
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore-compat.js',
  'https://www.gstatic.com/firebasejs/9.22.0/firebase-auth-compat.js',
  'https://cdnjs.cloudflare.com/ajax/libs/imask/6.4.3/imask.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js'
];

// ========== INSTALAÇÃO ==========
self.addEventListener('install', event => {
  console.log(`[SW ${APP_VERSION}] Instalando Service Worker...`);
  
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Cache aberto:', CACHE_NAME);
        
        // Cache dos assets críticos com tratamento de erro
        const cachePromises = STATIC_ASSETS.map(url => {
          return cache.add(url).catch(error => {
            console.warn('[SW] Falha ao cachear:', url, error);
            // Continua mesmo se algum falhar
            return Promise.resolve();
          });
        });
        
        return Promise.all(cachePromises);
      })
      .then(() => {
        console.log('[SW] Recursos críticos cacheados');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('[SW] Erro durante instalação:', error);
      })
  );
});

// ========== ATIVAÇÃO ==========
self.addEventListener('activate', event => {
  console.log(`[SW ${APP_VERSION}] Ativando Service Worker...`);
  
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          // Remove caches antigos de versões diferentes
          if (cacheName !== CACHE_NAME && cacheName.startsWith('venda-mais-admin-')) {
            console.log('[SW] Removendo cache antigo:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
    .then(() => {
      console.log('[SW] Limpeza de cache concluída');
      
      // Limpar dados de armazenamento antigos se necessário
      return self.clients.matchAll().then(clients => {
        clients.forEach(client => {
          client.postMessage({
            type: 'SW_ACTIVATED',
            version: APP_VERSION
          });
        });
      });
    })
    .then(() => {
      console.log('[SW] Ativação concluída');
      return self.clients.claim();
    })
    .catch(error => {
      console.error('[SW] Erro durante ativação:', error);
    })
  );
});

// ========== ESTRATÉGIA DE CACHE ==========
self.addEventListener('fetch', event => {
  // Ignora requisições que não são GET ou de outros protocolos
  if (event.request.method !== 'GET' || 
      !event.request.url.startsWith('http')) {
    return;
  }
  
  const requestUrl = new URL(event.request.url);
  
  // Não cachear requisições do Firebase (dados dinâmicos)
  if (requestUrl.hostname.includes('firestore.googleapis.com') ||
      requestUrl.hostname.includes('firebaseio.com') ||
      requestUrl.hostname.includes('identitytoolkit.googleapis.com') ||
      requestUrl.hostname.includes('googleapis.com')) {
    return;
  }
  
  // Estratégia: Cache First com fallback para rede
  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // Se encontrado no cache, retorna e atualiza em background
        if (cachedResponse) {
          console.log('[SW] Cache hit:', requestUrl.pathname);
          
          // Atualiza o cache em background (somente para assets estáticos)
          if (requestUrl.pathname.match(/\.(html|css|js|ico)$/)) {
            fetch(event.request)
              .then(networkResponse => {
                if (networkResponse.ok) {
                  caches.open(CACHE_NAME)
                    .then(cache => cache.put(event.request, networkResponse))
                    .catch(err => console.warn('[SW] Erro ao atualizar cache:', err));
                }
              })
              .catch(err => console.warn('[SW] Erro ao buscar atualização:', err));
          }
          
          return cachedResponse;
        }
        
        // Se não está no cache, busca na rede
        console.log('[SW] Cache miss, buscando na rede:', requestUrl.pathname);
        return fetch(event.request)
          .then(networkResponse => {
            // Verifica se a resposta é válida para cache
            if (!networkResponse || 
                networkResponse.status !== 200 || 
                networkResponse.type === 'opaque' ||
                event.request.method !== 'GET') {
              return networkResponse;
            }
            
            // Clona a resposta para cache
            const responseToCache = networkResponse.clone();
            
            caches.open(CACHE_NAME)
              .then(cache => {
                cache.put(event.request, responseToCache);
                console.log('[SW] Adicionado ao cache:', requestUrl.pathname);
              })
              .catch(error => {
                console.warn('[SW] Erro ao adicionar ao cache:', error);
              });
            
            return networkResponse;
          })
          .catch(error => {
            console.error('[SW] Erro ao buscar na rede:', error);
            
            // Fallbacks específicos para páginas HTML
            if (event.request.headers.get('accept')?.includes('text/html')) {
              return caches.match('./index.html');
            }
            
            // Fallback para páginas de erro offline
            return new Response(`
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="UTF-8">
                <title>Offline | Venda+</title>
                <style>
                  body {
                    font-family: 'Poppins', sans-serif;
                    background: linear-gradient(135deg, #212121 0%, #424242 100%);
                    color: white;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    height: 100vh;
                    text-align: center;
                    padding: 20px;
                  }
                  h1 { font-size: 2rem; margin-bottom: 20px; }
                  p { margin-bottom: 30px; opacity: 0.8; }
                  .icon { font-size: 4rem; margin-bottom: 20px; }
                </style>
              </head>
              <body>
                <div class="icon">📡</div>
                <h1>Sem conexão com a internet</h1>
                <p>Você está offline no momento. Algumas funcionalidades podem não estar disponíveis.</p>
                <p>Tente reconectar à internet para acessar todos os recursos.</p>
              </body>
              </html>
            `, {
              headers: { 'Content-Type': 'text/html' }
            });
          });
      })
  );
});

// ========== SINCRONIZAÇÃO EM BACKGROUND ==========
self.addEventListener('sync', event => {
  console.log('[SW] Evento de sincronização:', event.tag);
  
  if (event.tag === 'sync-orders') {
    event.waitUntil(syncPendingOrders());
  }
  
  if (event.tag === 'sync-config') {
    event.waitUntil(syncConfiguration());
  }
});

async function syncPendingOrders() {
  try {
    // Recupera pedidos pendentes do IndexedDB
    const pendingOrders = await getPendingOrdersFromIndexedDB();
    
    if (pendingOrders.length === 0) {
      console.log('[SW] Nenhum pedido pendente para sincronizar');
      return;
    }
    
    console.log(`[SW] Sincronizando ${pendingOrders.length} pedidos pendentes`);
    
    // Aqui você implementaria a sincronização com Firebase
    for (const order of pendingOrders) {
      try {
        // Simulação de sincronização
        await syncOrderToFirebase(order);
        await markOrderAsSynced(order.id);
      } catch (error) {
        console.error('[SW] Erro ao sincronizar pedido:', order.id, error);
      }
    }
    
    // Notifica os clients sobre a sincronização
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'SYNC_COMPLETE',
        syncedOrders: pendingOrders.length
      });
    });
    
  } catch (error) {
    console.error('[SW] Erro na sincronização:', error);
  }
}

async function syncConfiguration() {
  console.log('[SW] Sincronizando configurações...');
  // Implementação da sincronização de configurações
}

// ========== NOTIFICAÇÕES PUSH ==========
self.addEventListener('push', event => {
  console.log('[SW] Evento de push recebido');
  
  if (!event.data) {
    console.warn('[SW] Push sem dados');
    return;
  }
  
  try {
    const data = event.data.json();
    const title = data.title || 'Venda+ Admin';
    const options = {
      body: data.body || 'Nova notificação do sistema',
      icon: './favicon.ico',
      badge: './favicon.ico',
      vibrate: [200, 100, 200],
      data: {
        url: data.url || './',
        timestamp: Date.now(),
        type: data.type || 'general'
      },
      actions: [
        {
          action: 'open',
          title: 'Abrir'
        },
        {
          action: 'dismiss',
          title: 'Ignorar'
        }
      ],
      tag: data.tag || 'vendaplus-notification',
      renotify: true,
      requireInteraction: data.important || false
    };
    
    event.waitUntil(
      self.registration.showNotification(title, options)
    );
    
  } catch (error) {
    console.error('[SW] Erro ao processar notificação push:', error);
  }
});

self.addEventListener('notificationclick', event => {
  console.log('[SW] Notificação clicada:', event.notification.tag);
  
  event.notification.close();
  
  if (event.action === 'open' || event.action === '') {
    const urlToOpen = event.notification.data.url || './';
    
    event.waitUntil(
      clients.matchAll({
        type: 'window',
        includeUncontrolled: true
      }).then(windowClients => {
        // Verifica se já há uma janela aberta
        for (const client of windowClients) {
          if (client.url === urlToOpen && 'focus' in client) {
            return client.focus();
          }
        }
        
        // Se não encontrou, abre nova janela
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
    );
  }
});

self.addEventListener('notificationclose', event => {
  console.log('[SW] Notificação fechada:', event.notification.tag);
});

// ========== GERENCIAMENTO DE ATUALIZAÇÕES ==========
self.addEventListener('message', event => {
  if (!event.data || !event.data.type) return;
  
  console.log('[SW] Mensagem recebida:', event.data.type);
  
  switch (event.data.type) {
    case 'SKIP_WAITING':
      console.log('[SW] Aplicando atualização imediatamente');
      self.skipWaiting();
      break;
      
    case 'CHECK_VERSION':
      event.ports?.[0]?.postMessage({
        type: 'VERSION_INFO',
        version: APP_VERSION,
        cacheName: CACHE_NAME
      });
      break;
      
    case 'CLEAR_CACHE':
      caches.delete(CACHE_NAME)
        .then(() => {
          console.log('[SW] Cache limpo com sucesso');
          event.ports?.[0]?.postMessage({ success: true });
        })
        .catch(error => {
          console.error('[SW] Erro ao limpar cache:', error);
          event.ports?.[0]?.postMessage({ 
            success: false, 
            error: error.message 
          });
        });
      break;
      
    case 'GET_CACHE_INFO':
      caches.open(CACHE_NAME)
        .then(cache => cache.keys())
        .then(requests => {
          event.ports?.[0]?.postMessage({
            type: 'CACHE_INFO',
            count: requests.length,
            items: requests.map(req => req.url)
          });
        });
      break;
      
    case 'CHECK_UPDATE':
      // Verifica se há nova versão
      fetch('./?v=' + Date.now(), { cache: 'no-store' })
        .then(response => {
          // Em produção, você verificaria um arquivo de versão
          event.ports?.[0]?.postMessage({
            type: 'UPDATE_CHECK',
            currentVersion: APP_VERSION,
            updateAvailable: false // Implementar lógica real
          });
        });
      break;
  }
});

// ========== MONITORAMENTO DE CONEXÃO ==========
self.addEventListener('offline', () => {
  console.log('[SW] Modo offline detectado');
  
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({
        type: 'NETWORK_STATUS',
        online: false,
        timestamp: Date.now()
      });
    });
  });
});

self.addEventListener('online', () => {
  console.log('[SW] Conexão restaurada');
  
  // Dispara sincronização automática
  self.registration.sync.register('sync-orders')
    .then(() => console.log('[SW] Sincronização agendada'))
    .catch(err => console.warn('[SW] Erro ao agendar sync:', err));
  
  self.clients.matchAll().then(clients => {
    clients.forEach(client => {
      client.postMessage({
        type: 'NETWORK_STATUS',
        online: true,
        timestamp: Date.now()
      });
    });
  });
});

// ========== FUNÇÕES AUXILIARES ==========
async function getPendingOrdersFromIndexedDB() {
  // Implementação do IndexedDB para armazenamento offline
  return [];
}

async function syncOrderToFirebase(order) {
  // Implementação da sincronização com Firebase
  return Promise.resolve();
}

async function markOrderAsSynced(orderId) {
  // Implementação para marcar pedido como sincronizado
  return Promise.resolve();
}

// ========== LIFE CYCLE LOGGING ==========
console.log(`[SW ${APP_VERSION}] Service Worker carregado`);