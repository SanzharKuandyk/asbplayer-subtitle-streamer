// asbplayer Subtitle Streamer - Settings UI

// Elements
const statusEl = document.getElementById('status');
const statusTextEl = document.getElementById('status-text');
const enabledEl = document.getElementById('enabled');
const transportTypeEl = document.getElementById('transportType');
const wsUrlEl = document.getElementById('wsUrl');
const httpUrlEl = document.getElementById('httpUrl');
const nativeHostEl = document.getElementById('nativeHost');
const saveBtn = document.getElementById('saveBtn');
const testBtn = document.getElementById('testBtn');

// Transport config sections
const configWebSocket = document.getElementById('config-websocket');
const configHttp = document.getElementById('config-http');
const configNative = document.getElementById('config-native');

// State
let settings = {
  enabled: true,
  transportType: 'websocket',
  wsUrl: 'ws://localhost:8765',
  httpUrl: 'http://localhost:8080/subtitle',
  nativeHost: 'com.subtitle.streamer'
};

// Initialize
async function init() {
  // Load settings from storage
  await loadSettings();

  // Update UI
  updateUI();
  updateTransportConfig();

  // Request status from background
  updateStatus();

  // Event listeners
  enabledEl.addEventListener('change', handleEnabledChange);
  transportTypeEl.addEventListener('change', handleTransportTypeChange);
  saveBtn.addEventListener('click', handleSave);
  testBtn.addEventListener('click', handleTest);

  // Poll status every 2 seconds
  setInterval(updateStatus, 2000);
}

// Load settings from storage
async function loadSettings() {
  try {
    const result = await chrome.storage.sync.get(settings);
    settings = { ...settings, ...result };
    console.log('Settings loaded:', settings);
  } catch (error) {
    console.error('Error loading settings:', error);
  }
}

// Update UI from settings
function updateUI() {
  enabledEl.checked = settings.enabled;
  transportTypeEl.value = settings.transportType;
  wsUrlEl.value = settings.wsUrl;
  httpUrlEl.value = settings.httpUrl;
  nativeHostEl.value = settings.nativeHost;
}

// Update transport config visibility
function updateTransportConfig() {
  // Hide all
  configWebSocket.classList.remove('active');
  configHttp.classList.remove('active');
  configNative.classList.remove('active');

  // Show active
  switch (settings.transportType) {
    case 'websocket':
      configWebSocket.classList.add('active');
      break;
    case 'http':
      configHttp.classList.add('active');
      break;
    case 'native':
      configNative.classList.add('active');
      break;
  }
}

// Update status display
async function updateStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'getStatus' });

    if (response && response.status) {
      const status = response.status;

      // Update status display
      statusEl.className = `status ${status}`;

      const statusText = {
        connected: 'Connected',
        disconnected: 'Disconnected',
        connecting: 'Connecting...'
      };

      statusTextEl.textContent = statusText[status] || 'Unknown';
    }
  } catch (error) {
    console.error('Error getting status:', error);
  }
}

// Handle enabled toggle
function handleEnabledChange() {
  settings.enabled = enabledEl.checked;
  saveSettings();
}

// Handle transport type change
function handleTransportTypeChange() {
  settings.transportType = transportTypeEl.value;
  updateTransportConfig();
}

// Handle save button
async function handleSave() {
  // Update settings from form
  settings.enabled = enabledEl.checked;
  settings.transportType = transportTypeEl.value;
  settings.wsUrl = wsUrlEl.value.trim();
  settings.httpUrl = httpUrlEl.value.trim();
  settings.nativeHost = nativeHostEl.value.trim();

  // Validate URLs
  if (settings.transportType === 'websocket') {
    if (!settings.wsUrl.startsWith('ws://') && !settings.wsUrl.startsWith('wss://')) {
      alert('WebSocket URL must start with ws:// or wss://');
      return;
    }
  } else if (settings.transportType === 'http') {
    if (!settings.httpUrl.startsWith('http://') && !settings.httpUrl.startsWith('https://')) {
      alert('HTTP URL must start with http:// or https://');
      return;
    }
  } else if (settings.transportType === 'native') {
    if (!settings.nativeHost) {
      alert('Native host name is required');
      return;
    }
  }

  // Save settings
  await saveSettings();

  // Show feedback
  const originalText = saveBtn.textContent;
  saveBtn.textContent = 'Saved!';
  saveBtn.style.background = '#34a853';

  setTimeout(() => {
    saveBtn.textContent = originalText;
    saveBtn.style.background = '';
  }, 1500);
}

// Handle test button
async function handleTest() {
  testBtn.disabled = true;
  const originalText = testBtn.textContent;
  testBtn.textContent = 'Testing...';

  try {
    const response = await chrome.runtime.sendMessage({ type: 'testConnection' });

    if (response && response.success) {
      testBtn.textContent = 'Connected!';
      testBtn.style.background = '#34a853';
      testBtn.style.color = 'white';
    } else {
      testBtn.textContent = 'Failed';
      testBtn.style.background = '#ea4335';
      testBtn.style.color = 'white';
    }

    setTimeout(() => {
      testBtn.textContent = originalText;
      testBtn.style.background = '';
      testBtn.style.color = '';
      testBtn.disabled = false;
    }, 2000);

  } catch (error) {
    console.error('Error testing connection:', error);
    testBtn.textContent = 'Error';
    testBtn.style.background = '#ea4335';
    testBtn.style.color = 'white';

    setTimeout(() => {
      testBtn.textContent = originalText;
      testBtn.style.background = '';
      testBtn.style.color = '';
      testBtn.disabled = false;
    }, 2000);
  }
}

// Save settings to storage and send to background
async function saveSettings() {
  try {
    // Save to storage
    await chrome.storage.sync.set(settings);
    console.log('Settings saved:', settings);

    // Notify background
    await chrome.runtime.sendMessage({
      type: 'updateSettings',
      settings: settings
    });

    // Update status
    await updateStatus();

  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

// Start
init();
