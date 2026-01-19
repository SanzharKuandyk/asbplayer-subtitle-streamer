// asbplayer Subtitle Streamer - Background Service Worker
// Manages multi-transport connections (WebSocket, HTTP, Native Messaging)

const VERSION = '1.0.0';

// State
let settings = {
  enabled: true,
  transportType: 'websocket', // 'websocket', 'http', 'native'
  wsUrl: 'ws://localhost:8767',  // Port 8767 to avoid conflict with AnkiConnect (8765)
  httpUrl: 'http://localhost:8080/subtitle',
  nativeHost: 'com.subtitle.streamer'
};

let transport = null;
let connectionStatus = 'disconnected'; // 'connected', 'disconnected', 'connecting'

// Initialize
chrome.runtime.onInstalled.addListener(() => {
  console.log('[SubtitleStreamer] Extension installed');
  loadSettings();
});

chrome.runtime.onStartup.addListener(() => {
  console.log('[SubtitleStreamer] Extension started');
  loadSettings();
});

// Load settings
async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get(settings);
    settings = { ...settings, ...result };
    console.log('[SubtitleStreamer] Settings loaded:', settings);

    if (settings.enabled) {
      connectTransport();
    }
  } catch (error) {
    console.error('[SubtitleStreamer] Error loading settings:', error);
  }
}

// Save settings
async function saveSettings() {
  try {
    await chrome.storage.sync.set(settings);
    console.log('[SubtitleStreamer] Settings saved');
  } catch (error) {
    console.error('[SubtitleStreamer] Error saving settings:', error);
  }
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'subtitle') {
    handleSubtitle(message);
  } else if (message.type === 'getStatus') {
    sendResponse({
      status: connectionStatus,
      settings: settings
    });
  } else if (message.type === 'updateSettings') {
    updateSettings(message.settings);
    sendResponse({ success: true });
  } else if (message.type === 'testConnection') {
    testConnection().then(result => sendResponse(result));
    return true; // Keep channel open for async response
  }
});

// Update settings
function updateSettings(newSettings) {
  const needsReconnect =
    settings.transportType !== newSettings.transportType ||
    settings.wsUrl !== newSettings.wsUrl ||
    settings.httpUrl !== newSettings.httpUrl ||
    settings.nativeHost !== newSettings.nativeHost ||
    settings.enabled !== newSettings.enabled;

  settings = { ...settings, ...newSettings };
  saveSettings();

  if (needsReconnect) {
    disconnectTransport();
    if (settings.enabled) {
      connectTransport();
    }
  }
}

// Connect transport
function connectTransport() {
  disconnectTransport();

  console.log(`[SubtitleStreamer] Connecting via ${settings.transportType}...`);

  switch (settings.transportType) {
    case 'websocket':
      transport = new WebSocketTransport(settings.wsUrl);
      break;
    case 'http':
      transport = new HttpTransport(settings.httpUrl);
      break;
    case 'native':
      transport = new NativeTransport(settings.nativeHost);
      break;
    default:
      console.error('[SubtitleStreamer] Unknown transport type:', settings.transportType);
      return;
  }

  transport.connect();
}

// Disconnect transport
function disconnectTransport() {
  if (transport) {
    transport.disconnect();
    transport = null;
  }
  updateBadge('disconnected');
}

// Handle subtitle from content script
function handleSubtitle(message) {
  if (!settings.enabled || !transport) {
    return;
  }

  transport.send(message);
}

// Test connection
async function testConnection() {
  // Reset reconnect attempts when user manually tests
  if (transport && transport.reconnectAttempts !== undefined) {
    console.log('[SubtitleStreamer] Resetting reconnection attempts (manual test)');
    transport.reconnectAttempts = 0;
  }

  if (!transport) {
    connectTransport();
    // Wait a bit for connection
    await new Promise(resolve => setTimeout(resolve, 1000));
  } else {
    // Reconnect existing transport
    disconnectTransport();
    connectTransport();
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return {
    success: connectionStatus === 'connected',
    status: connectionStatus,
    transportType: settings.transportType
  };
}

// Update badge
function updateBadge(status) {
  connectionStatus = status;

  const colors = {
    connected: '#00FF00',
    disconnected: '#FF0000',
    connecting: '#FFFF00'
  };

  const texts = {
    connected: '●',
    disconnected: '○',
    connecting: '◌'
  };

  chrome.action.setBadgeBackgroundColor({ color: colors[status] || '#888888' });
  chrome.action.setBadgeText({ text: texts[status] || '' });
}

// ==================== WebSocket Transport ====================

class WebSocketTransport {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 3;  // Stop after 3 failed attempts
    this.maxReconnectDelay = 30000;
    this.heartbeatInterval = null;
    this.reconnectTimeout = null;
  }

  connect() {
    try {
      updateBadge('connecting');
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        console.log('[SubtitleStreamer] WebSocket connected');
        updateBadge('connected');
        this.reconnectAttempts = 0;

        // Send connected message
        this.send({
          type: 'connected',
          timestamp: Date.now(),
          version: VERSION
        });

        // Start heartbeat
        this.startHeartbeat();
      };

      this.ws.onclose = () => {
        console.log('[SubtitleStreamer] WebSocket disconnected');
        updateBadge('disconnected');
        this.stopHeartbeat();
        this.scheduleReconnect();
      };

      this.ws.onerror = (error) => {
        console.error('[SubtitleStreamer] WebSocket error:', error);
        updateBadge('disconnected');
      };

    } catch (error) {
      console.error('[SubtitleStreamer] WebSocket connection error:', error);
      updateBadge('disconnected');
      this.scheduleReconnect();
    }
  }

  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.stopHeartbeat();

    if (this.ws) {
      // Send disconnect message
      if (this.ws.readyState === WebSocket.OPEN) {
        this.send({
          type: 'disconnected',
          timestamp: Date.now()
        });
      }

      this.ws.close();
      this.ws = null;
    }

    updateBadge('disconnected');
  }

  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimeout) {
      return; // Already scheduled
    }

    // Check if we've exceeded max attempts
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log(`[SubtitleStreamer] Max reconnection attempts (${this.maxReconnectAttempts}) reached. Stopped trying.`);
      console.log('[SubtitleStreamer] Click "Test Connection" in settings to retry.');
      updateBadge('disconnected');
      return;
    }

    const delay = Math.min(
      1000 * Math.pow(2, this.reconnectAttempts),
      this.maxReconnectDelay
    );

    console.log(`[SubtitleStreamer] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  startHeartbeat() {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      this.send({
        type: 'heartbeat',
        timestamp: Date.now()
      });
    }, 30000); // 30 seconds
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}

// ==================== HTTP Transport ====================

class HttpTransport {
  constructor(url) {
    this.url = url;
    this.maxRetries = 3;
  }

  connect() {
    // HTTP is stateless, just mark as connected if URL is valid
    try {
      new URL(this.url);
      updateBadge('connected');
      console.log('[SubtitleStreamer] HTTP transport ready:', this.url);

      // Send initial connected message
      this.send({
        type: 'connected',
        timestamp: Date.now(),
        version: VERSION
      });
    } catch (error) {
      console.error('[SubtitleStreamer] Invalid HTTP URL:', error);
      updateBadge('disconnected');
    }
  }

  disconnect() {
    // Send disconnect message
    this.send({
      type: 'disconnected',
      timestamp: Date.now()
    });

    updateBadge('disconnected');
  }

  async send(message) {
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const response = await fetch(this.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(message)
        });

        if (response.ok) {
          if (connectionStatus !== 'connected') {
            updateBadge('connected');
          }
          return;
        } else {
          console.error('[SubtitleStreamer] HTTP error:', response.status, response.statusText);
        }
      } catch (error) {
        console.error(`[SubtitleStreamer] HTTP send error (attempt ${attempt + 1}):`, error);

        if (attempt === this.maxRetries - 1) {
          updateBadge('disconnected');
        } else {
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        }
      }
    }
  }
}

// ==================== Native Messaging Transport ====================

class NativeTransport {
  constructor(hostName) {
    this.hostName = hostName;
    this.port = null;
  }

  connect() {
    try {
      updateBadge('connecting');
      this.port = chrome.runtime.connectNative(this.hostName);

      this.port.onMessage.addListener((message) => {
        console.log('[SubtitleStreamer] Native message received:', message);
      });

      this.port.onDisconnect.addListener(() => {
        console.log('[SubtitleStreamer] Native host disconnected');
        if (chrome.runtime.lastError) {
          console.error('[SubtitleStreamer] Native error:', chrome.runtime.lastError.message);
        }
        updateBadge('disconnected');
      });

      updateBadge('connected');
      console.log('[SubtitleStreamer] Native messaging connected:', this.hostName);

      // Send connected message
      this.send({
        type: 'connected',
        timestamp: Date.now(),
        version: VERSION
      });

    } catch (error) {
      console.error('[SubtitleStreamer] Native messaging error:', error);
      updateBadge('disconnected');
    }
  }

  disconnect() {
    if (this.port) {
      // Send disconnect message
      this.send({
        type: 'disconnected',
        timestamp: Date.now()
      });

      this.port.disconnect();
      this.port = null;
    }

    updateBadge('disconnected');
  }

  send(message) {
    if (this.port) {
      try {
        this.port.postMessage(message);
      } catch (error) {
        console.error('[SubtitleStreamer] Native send error:', error);
        updateBadge('disconnected');
      }
    }
  }
}
