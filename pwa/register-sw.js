// Script para registrar o Service Worker
(function() {
  'use strict';
  
  // Configurações
  const SW_PATH = './sw.js';
  const CHECK_INTERVAL = 60 * 60 * 1000; // 1 hora
  const CACHE_BUSTER = 'v=1.5.0';
  
  // Verificar se o navegador suporta Service Worker
  if (!('serviceWorker' in navigator)) {
    console.log('[SW] Navegador não suporta Service Worker');
    return;
  }
  
  // Verificar se está em ambiente de desenvolvimento
  const isLocalhost = window.location.hostname === 'localhost' || 
                      window.location.hostname === '127.0.0.1';
  
  // URL do Service Worker
  let swUrl = SW_PATH;
  if (isLocalhost) {
    // Em desenvolvimento, adiciona cache buster
    swUrl = SW_PATH + '?' + CACHE_BUSTER;
  }
  
  // Registrar Service Worker
  function registerServiceWorker() {
    console.log('[SW] Registrando Service Worker...');
    
    navigator.serviceWorker.register(swUrl)
      .then(registration => {
        console.log('[SW] Registrado com sucesso:', registration.scope);
        
        // Monitorar atualizações
        registration.addEventListener('updatefound', () => {
          const newWorker = registration.installing;
          
          if (newWorker) {
            newWorker.addEventListener('statechange', () => {
              console.log('[SW] Estado do novo worker:', newWorker.state);
              
              if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                console.log('[SW] Nova versão disponível!');
                showUpdateNotification();
              }
            });
          }
        });
        
        // Verificar periodicamente por atualizações
        setInterval(() => {
          registration.update();
        }, CHECK_INTERVAL);
        
        // Inicializar comunicação
        initSWCommunication(registration);
        
        return registration;
      })
      .catch(error => {
        console.error('[SW] Falha no registro:', error);
      });
  }
  
  // Inicializar comunicação com Service Worker
  function initSWCommunication(registration) {
    // Verificar se há um controller ativo
    if (navigator.serviceWorker.controller) {
      console.log('[SW] Controller ativo:', navigator.serviceWorker.controller.scriptURL);
      
      // Enviar mensagem de inicialização
      sendMessageToSW({
        type: 'INIT',
        page: window.location.pathname,
        userAgent: navigator.userAgent
      });
    }
    
    // Ouvir mensagens do Service Worker
    navigator.serviceWorker.addEventListener('message', event => {
      handleSWMessage(event.data, event.source);
    });
    
    // Verificar estado da conexão
    updateConnectionStatus();
    window.addEventListener('online', updateConnectionStatus);
    window.addEventListener('offline', updateConnectionStatus);
    
    // Monitorar eventos de sincronização
    if ('SyncManager' in window) {
      navigator.serviceWorker.ready.then(registration => {
        registration.sync.getTags().then(tags => {
          console.log('[SW] Tags de sync registradas:', tags);
        });
      });
    }
  }
  
  // Lidar com mensagens do Service Worker
  function handleSWMessage(data, source) {
    console.log('[SW] Mensagem recebida:', data.type);
    
    switch (data.type) {
      case 'NETWORK_STATUS':
        updateNetworkUI(data.online);
        break;
        
      case 'SYNC_COMPLETE':
        showNotification(`${data.syncedOrders} pedidos sincronizados!`, 'success');
        break;
        
      case 'SW_ACTIVATED':
        console.log(`[SW] Nova versão ativada: ${data.version}`);
        // Recarregar a página para usar nova versão
        window.location.reload();
        break;
        
      case 'CACHE_INFO':
        console.log('[SW] Informações do cache:', data);
        break;
        
      case 'UPDATE_CHECK':
        if (data.updateAvailable) {
          showUpdateNotification();
        }
        break;
    }
  }
  
  // Enviar mensagem para Service Worker
  function sendMessageToSW(message) {
    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage(message);
    }
  }
  
  // Atualizar status da conexão na UI
  function updateConnectionStatus() {
    const isOnline = navigator.onLine;
    updateNetworkUI(isOnline);
    
    // Notificar Service Worker
    sendMessageToSW({
      type: 'NETWORK_CHANGE',
      online: isOnline,
      timestamp: Date.now()
    });
  }
  
  function updateNetworkUI(isOnline) {
    const statusElement = document.getElementById('networkStatus') || createNetworkStatusElement();
    
    if (isOnline) {
      statusElement.innerHTML = '<i class="fas fa-wifi"></i> Online';
      statusElement.className = 'network-status online';
    } else {
      statusElement.innerHTML = '<i class="fas fa-wifi-slash"></i> Offline';
      statusElement.className = 'network-status offline';
      
      // Mostrar aviso de modo offline
      showNotification('Você está offline. Trabalhando em modo local.', 'warning');
    }
  }
  
  function createNetworkStatusElement() {
    const statusElement = document.createElement('div');
    statusElement.id = 'networkStatus';
    statusElement.className = 'network-status online';
    statusElement.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      padding: 8px 12px;
      border-radius: 20px;
      font-size: 0.8rem;
      font-weight: 600;
      z-index: 10000;
      display: flex;
      align-items: center;
      gap: 6px;
      background-color: rgba(33, 33, 33, 0.9);
      color: white;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      transition: all 0.3s ease;
    `;
    
    document.body.appendChild(statusElement);
    return statusElement;
  }
  
  // Mostrar notificação de atualização
  function showUpdateNotification() {
    // Verificar se já há uma notificação
    if (window.updateNotificationShown) return;
    
    const notification = document.createElement('div');
    notification.className = 'update-notification';
    notification.innerHTML = `
      <div class="update-content">
        <div class="update-icon">
          <i class="fas fa-sync-alt fa-spin"></i>
        </div>
        <div class="update-text">
          <strong>Nova versão disponível!</strong>
          <p>Atualize para ter acesso às novas funcionalidades.</p>
        </div>
        <div class="update-actions">
          <button class="btn-update" id="btnUpdateNow">
            Atualizar Agora
          </button>
          <button class="btn-later" id="btnUpdateLater">
            Depois
          </button>
        </div>
      </div>
    `;
    
    notification.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: linear-gradient(135deg, #212121 0%, #424242 100%);
      color: white;
      padding: 15px 20px;
      border-radius: 15px;
      box-shadow: 0 5px 20px rgba(0,0,0,0.3);
      z-index: 10000;
      max-width: 400px;
      width: 90%;
      animation: slideUp 0.3s ease;
    `;
    
    const contentStyle = `
      display: flex;
      align-items: center;
      gap: 15px;
    `;
    
    const iconStyle = `
      font-size: 1.5rem;
      color: #4CAF50;
    `;
    
    const textStyle = `
      flex: 1;
    `;
    
    const actionsStyle = `
      display: flex;
      gap: 8px;
      margin-top: 10px;
    `;
    
    const btnStyle = `
      padding: 6px 12px;
      border-radius: 8px;
      border: none;
      font-weight: 600;
      cursor: pointer;
      font-size: 0.85rem;
      transition: all 0.3s ease;
    `;
    
    const btnUpdateStyle = `
      background-color: #4CAF50;
      color: white;
    `;
    
    const btnLaterStyle = `
      background-color: transparent;
      color: white;
      border: 1px solid rgba(255,255,255,0.3);
    `;
    
    notification.querySelector('.update-content').style.cssText = contentStyle;
    notification.querySelector('.update-icon').style.cssText = iconStyle;
    notification.querySelector('.update-text').style.cssText = textStyle;
    notification.querySelector('.update-actions').style.cssText = actionsStyle;
    
    const btnUpdate = notification.querySelector('#btnUpdateNow');
    const btnLater = notification.querySelector('#btnUpdateLater');
    
    btnUpdate.style.cssText = btnStyle + btnUpdateStyle;
    btnLater.style.cssText = btnStyle + btnLaterStyle;
    
    btnUpdate.addEventListener('click', () => {
      window.location.reload();
      window.updateNotificationShown = true;
    });
    
    btnLater.addEventListener('click', () => {
      notification.remove();
      window.updateNotificationShown = true;
      setTimeout(() => {
        window.updateNotificationShown = false;
      }, 30000); // Mostrar novamente após 30 segundos
    });
    
    document.body.appendChild(notification);
    
    // Auto-remover após 30 segundos
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
        window.updateNotificationShown = false;
      }
    }, 30000);
  }
  
  // Mostrar notificação
  function showNotification(message, type = 'info') {
    // Implementação básica de notificação
    console.log(`[Notification ${type}]: ${message}`);
    
    // Pode ser integrada com a notificação existente no sistema
    if (window.showNotification) {
      window.showNotification(message, type);
    }
  }
  
  // Solicitar permissão para notificações
  function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().then(permission => {
        console.log('[SW] Permissão de notificação:', permission);
      });
    }
  }
  
  // Verificar suporte a recursos
  function checkFeatures() {
    const features = {
      serviceWorker: 'serviceWorker' in navigator,
      pushManager: 'PushManager' in window,
      syncManager: 'SyncManager' in window,
      indexedDB: 'indexedDB' in window,
      cacheStorage: 'caches' in window,
      backgroundSync: 'BackgroundSyncManager' in window,
      periodicSync: 'PeriodicSyncManager' in window
    };
    
    console.log('[SW] Recursos suportados:', features);
    return features;
  }
  
  // Inicializar quando a página carregar
  window.addEventListener('load', () => {
    console.log('[SW] Página carregada, iniciando registro...');
    
    // Verificar recursos
    const features = checkFeatures();
    
    if (features.serviceWorker) {
      // Registrar Service Worker
      registerServiceWorker();
      
      // Solicitar permissões
      requestNotificationPermission();
      
      // Configurar sincronização em background
      if (features.backgroundSync) {
        setupBackgroundSync();
      }
    }
  });
  
  // Configurar sincronização em background
  function setupBackgroundSync() {
    navigator.serviceWorker.ready.then(registration => {
      // Registrar para sincronização periódica
      if ('periodicSync' in registration) {
        try {
          registration.periodicSync.register('sync-data', {
            minInterval: 24 * 60 * 60 * 1000 // 1 dia
          }).then(() => {
            console.log('[SW] Sincronização periódica registrada');
          });
        } catch (error) {
          console.warn('[SW] Sincronização periódica não suportada:', error);
        }
      }
    });
  }
  
  // Exportar funções para uso global
  window.swManager = {
    checkVersion: () => {
      return new Promise(resolve => {
        const channel = new MessageChannel();
        channel.port1.onmessage = event => {
          resolve(event.data);
        };
        sendMessageToSW({
          type: 'CHECK_VERSION'
        }, [channel.port2]);
      });
    },
    
    clearCache: () => {
      return new Promise(resolve => {
        const channel = new MessageChannel();
        channel.port1.onmessage = event => {
          resolve(event.data);
        };
        sendMessageToSW({
          type: 'CLEAR_CACHE'
        }, [channel.port2]);
      });
    },
    
    getCacheInfo: () => {
      return new Promise(resolve => {
        const channel = new MessageChannel();
        channel.port1.onmessage = event => {
          resolve(event.data);
        };
        sendMessageToSW({
          type: 'GET_CACHE_INFO'
        }, [channel.port2]);
      });
    },
    
    checkForUpdate: () => {
      return new Promise(resolve => {
        const channel = new MessageChannel();
        channel.port1.onmessage = event => {
          resolve(event.data);
        };
        sendMessageToSW({
          type: 'CHECK_UPDATE'
        }, [channel.port2]);
      });
    },
    
    syncNow: () => {
      if ('SyncManager' in window) {
        navigator.serviceWorker.ready.then(registration => {
          registration.sync.register('sync-orders');
          showNotification('Sincronização iniciada', 'info');
        });
      }
    },
    
    showUpdateNotification: showUpdateNotification
  };
  
  // Adicionar CSS para animações
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideUp {
      from { 
        opacity: 0; 
        transform: translate(-50%, 20px); 
      }
      to { 
        opacity: 1; 
        transform: translate(-50%, 0); 
      }
    }
    
    .network-status {
      position: fixed;
      top: 10px;
      right: 10px;
      padding: 8px 12px;
      border-radius: 20px;
      font-size: 0.8rem;
      font-weight: 600;
      z-index: 10000;
      display: flex;
      align-items: center;
      gap: 6px;
      background-color: rgba(33, 33, 33, 0.9);
      color: white;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      transition: all 0.3s ease;
    }
    
    .network-status.online {
      background-color: rgba(76, 175, 80, 0.9);
    }
    
    .network-status.offline {
      background-color: rgba(244, 67, 54, 0.9);
      animation: pulse 2s infinite;
    }
    
    @keyframes pulse {
      0% { opacity: 1; }
      50% { opacity: 0.7; }
      100% { opacity: 1; }
    }
  `;
  document.head.appendChild(style);
  
})();