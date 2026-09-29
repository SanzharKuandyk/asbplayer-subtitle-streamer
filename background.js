// Extension worker: one owner for saved settings, transport state, and delivery.
const VERSION = '1.1.0';
const DEFAULTS = Object.freeze({
  enabled: true,
  transportType: 'websocket',
  wsUrl: 'ws://localhost:8767',
  httpUrl: 'http://localhost:8080/subtitle',
  nativeHost: 'com.subtitle.streamer'
});

let settings = { ...DEFAULTS };
let transport = null;
let status = 'disconnected';
let lastError = '';
let droppedEvents = 0;
let revision = 0;
let settingsWrite = Promise.resolve();
let initializing = null;

function validate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !(key in DEFAULTS))) {
    throw new Error('Invalid settings.');
  }
  const next = { ...DEFAULTS, ...input };
  if (typeof next.enabled !== 'boolean' ||
      !['websocket', 'http', 'native'].includes(next.transportType)) {
    throw new Error('Invalid enabled value or connection type.');
  }
  for (const [key, protocols] of [
    ['wsUrl', ['ws:', 'wss:']],
    ['httpUrl', ['http:', 'https:']]
  ]) {
    if (typeof next[key] !== 'string') throw new Error(`Invalid ${key}.`);
    let url;
    try { url = new URL(next[key]); } catch { throw new Error(`Invalid ${key}.`); }
    if (!protocols.includes(url.protocol) || !url.hostname || url.username || url.password || url.hash) {
      throw new Error(`Invalid ${key}.`);
    }
  }
  if (typeof next.nativeHost !== 'string' ||
      !/^[a-z0-9_]+(?:\.[a-z0-9_]+)+$/.test(next.nativeHost)) {
    throw new Error('Invalid native host name.');
  }
  return next;
}

function badge(next, error = '') {
  status = next;
  lastError = error;
  chrome.action.setBadgeText({ text: next === 'connected' ? 'ON' : next === 'connecting' ? '...' : '' });
  chrome.action.setBadgeBackgroundColor({ color: next === 'connected' ? '#188038' : '#b3261e' });
}

function setTransportStatus(owner, next, error = '') {
  if (transport !== owner) return;
  badge(next, error);
  if (next === 'connected') chrome.alarms?.clear('reconnect');
  else if (next === 'disconnected' && settings.enabled && settings.transportType !== 'http') {
    // Timers cannot reliably wake an idle service worker. An alarm can.
    chrome.alarms?.create('reconnect', { delayInMinutes: 1 });
  }
}

function stopTransport() {
  const old = transport;
  transport = null;
  revision++;
  if (old) old.disconnect();
  chrome.alarms?.clear('reconnect');
  badge('disconnected');
}

function startTransport() {
  stopTransport();
  if (!settings.enabled) return;
  const owner = settings.transportType === 'websocket'
    ? new WebSocketTransport(settings.wsUrl)
    : settings.transportType === 'http'
      ? new HttpTransport(settings.httpUrl)
      : new NativeTransport(settings.nativeHost);
  transport = owner;
  owner.connect();
}

async function initialize() {
  if (!initializing) {
    initializing = (async () => {
      try {
        settings = validate(await chrome.storage.sync.get(DEFAULTS));
      } catch (error) {
        badge('disconnected', `Could not load settings: ${error.message}`);
        settings = { ...DEFAULTS, enabled: false };
        return;
      }
      startTransport();
    })();
  }
  return initializing;
}
// A service worker can start for any extension event, without onStartup firing.
void initialize();

chrome.alarms?.onAlarm.addListener(alarm => {
  if (alarm.name !== 'reconnect') return;
  void initialize().then(() => {
    if (settings.enabled && settings.transportType !== 'http' && status !== 'connected') startTransport();
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync' || !Object.keys(changes).some(key => key in DEFAULTS)) return;
  // Local writes already applied their validated state. Remote sync updates need reconciliation.
  void settingsWrite.then(async () => {
    try {
      await initialize();
      const next = validate(await chrome.storage.sync.get(DEFAULTS));
      if (JSON.stringify(next) !== JSON.stringify(settings)) {
        settings = next;
        startTransport();
      }
    } catch (error) { badge('disconnected', `Invalid synced settings: ${error.message}`); }
  });
});

async function updateSettings(input) {
  await initialize();
  const next = validate(input);
  await (settingsWrite = settingsWrite.catch(() => {}).then(() => chrome.storage.sync.set(next)));
  if (JSON.stringify(next) !== JSON.stringify(settings)) {
    settings = next;
    startTransport();
  }
  return { success: true, status, settings };
}

function validSubtitle(message) {
  return message && message.type === 'subtitle' &&
    Number.isSafeInteger(message.sequence) && message.sequence > 0 &&
    Number.isFinite(message.timestamp) &&
    message.video && typeof message.video === 'object' &&
    message.subtitle && typeof message.subtitle.text === 'string' &&
    Array.isArray(message.subtitle.lines) && message.subtitle.lines.length <= 100 &&
    message.subtitle.text.length <= 10000 &&
    message.subtitle.lines.every(line => line && typeof line.text === 'string' &&
      line.text.length <= 10000 && Number.isSafeInteger(line.track));
}

async function sendSubtitle(message, sender) {
  await initialize();
  if (!settings.enabled || !transport) return { accepted: false, reason: 'disabled' };
  if (sender.id !== chrome.runtime.id || !sender.tab || !validSubtitle(message)) {
    return { accepted: false, reason: 'invalid sender or event' };
  }
  const outgoing = {
    type: 'subtitle',
    eventId: `${sender.tab.id}:${sender.documentId}:${message.sequence}`,
    sequence: message.sequence,
    timestamp: message.timestamp,
    source: { tabId: sender.tab.id, frameId: sender.frameId, documentId: sender.documentId, url: sender.url || '' },
    video: message.video,
    subtitle: message.subtitle
  };
  const result = await transport.send(outgoing);
  if (!result.accepted) droppedEvents++;
  return result;
}

async function testConnection() {
  await initialize();
  if (!settings.enabled) return { success: false, status: 'disconnected', error: 'Streaming is disabled.' };
  startTransport();
  const owner = transport;
  const result = await owner.ready();
  return { success: result, status, error: result ? '' : lastError || 'Connection timed out.' };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const work = async () => {
    if (message?.type === 'getStatus') {
      await initialize();
      return { status, error: lastError, droppedEvents, settings };
    }
    if (message?.type === 'updateSettings') {
      if (sender.id !== chrome.runtime.id || sender.tab) throw new Error('Only the popup can edit settings.');
      return updateSettings(message.settings);
    }
    if (message?.type === 'testConnection') {
      if (sender.id !== chrome.runtime.id || sender.tab) throw new Error('Only the popup can test connections.');
      return testConnection();
    }
    if (message?.type === 'subtitle') return sendSubtitle(message, sender);
    return { success: false, error: 'Unknown message.' };
  };
  work().then(sendResponse, error => sendResponse({ success: false, error: error.message }));
  return true;
});

class WebSocketTransport {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.closed = false;
    this.timer = null;
    this.heartbeat = null;
    this.attempt = 0;
    this.waiters = [];
  }
  connect() {
    if (this.closed) return;
    setTransportStatus(this, 'connecting');
    let socket;
    try { socket = new WebSocket(this.url); }
    catch (error) { this.failed(error.message); return; }
    this.socket = socket;
    socket.onopen = () => {
      if (this.closed || this.socket !== socket) return;
      this.attempt = 0;
      setTransportStatus(this, 'connected');
      this.resolveWaiters(true);
      this.send({ type: 'connected', timestamp: Date.now(), version: VERSION });
      this.heartbeat = setInterval(() => this.send({ type: 'heartbeat', timestamp: Date.now() }), 20000);
      void requestSnapshots();
    };
    socket.onerror = () => setTransportStatus(this, 'disconnected', 'WebSocket connection failed.');
    socket.onclose = () => {
      if (this.closed || this.socket !== socket) return;
      this.socket = null;
      clearInterval(this.heartbeat);
      setTransportStatus(this, 'disconnected', 'WebSocket closed. Retrying.');
      this.resolveWaiters(false);
      this.retry();
    };
  }
  failed(error) {
    setTransportStatus(this, 'disconnected', error);
    this.resolveWaiters(false);
    this.retry();
  }
  retry() {
    if (this.closed || this.timer) return;
    const delay = Math.min(1000 * 2 ** Math.min(this.attempt++, 5), 30000);
    this.timer = setTimeout(() => { this.timer = null; this.connect(); }, delay);
  }
  send(message) {
    if (this.closed || !this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return { accepted: false, reason: 'disconnected' };
    }
    try { this.socket.send(JSON.stringify(message)); return { accepted: true }; }
    catch (error) { this.failed(error.message); return { accepted: false, reason: error.message }; }
  }
  ready() {
    if (this.socket?.readyState === WebSocket.OPEN) return Promise.resolve(true);
    if (this.closed) return Promise.resolve(false);
    return new Promise(resolve => {
      const timer = setTimeout(() => resolve(false), 5000);
      this.waiters.push(value => { clearTimeout(timer); resolve(value); });
    });
  }
  resolveWaiters(value) { for (const resolve of this.waiters.splice(0)) resolve(value); }
  disconnect() {
    this.closed = true;
    clearTimeout(this.timer);
    clearInterval(this.heartbeat);
    this.resolveWaiters(false);
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onopen = socket.onclose = socket.onerror = null;
      if (socket.readyState === WebSocket.OPEN) {
        try { socket.send(JSON.stringify({ type: 'disconnected', timestamp: Date.now() })); } catch {}
      }
      socket.close();
    }
  }
}

async function requestSnapshots() {
  if (!chrome.tabs?.query) return;
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id == null) continue;
      chrome.tabs.sendMessage(tab.id, { type: 'resync' }).catch(() => {});
    }
  } catch (error) { console.warn('Could not request subtitle snapshots:', error); }
}

class HttpTransport {
  constructor(url) {
    this.url = url;
    this.closed = false;
    this.queue = [];
    this.running = false;
    this.controller = null;
    this.waiters = [];
  }
  connect() {
    setTransportStatus(this, 'connecting');
    void this.send({ type: 'connected', timestamp: Date.now(), version: VERSION });
  }
  send(message) {
    if (this.closed) return Promise.resolve({ accepted: false, reason: 'disabled' });
    if (this.queue.length >= 100) {
      setTransportStatus(this, 'disconnected', 'HTTP queue full; event dropped.');
      return Promise.resolve({ accepted: false, reason: 'queue full' });
    }
    return new Promise(resolve => {
      this.queue.push({ message, resolve });
      void this.drain();
    });
  }
  async drain() {
    if (this.running) return;
    this.running = true;
    while (!this.closed && this.queue.length) {
      const item = this.queue.shift();
      let delivered = false;
      let error = 'HTTP delivery failed.';
      for (let attempt = 0; attempt < 3 && !this.closed; attempt++) {
        const controller = new AbortController();
        this.controller = controller;
        const timeout = setTimeout(() => controller.abort(), 5000);
        try {
          const response = await fetch(this.url, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(item.message), signal: controller.signal
          });
          if (response.ok) { delivered = true; break; }
          error = `HTTP ${response.status}`;
          if (response.status >= 400 && response.status < 500) break;
        } catch (cause) { error = cause.message; }
        finally { clearTimeout(timeout); this.controller = null; }
        if (attempt < 2 && !this.closed) await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
      }
      if (!this.closed) {
        setTransportStatus(this, delivered ? 'connected' : 'disconnected', delivered ? '' : error);
        if (delivered) this.resolveWaiters(true);
        else this.resolveWaiters(false);
        if (delivered && item.message.type === 'connected') void requestSnapshots();
      }
      item.resolve({ accepted: delivered, reason: delivered ? '' : error });
    }
    this.running = false;
  }
  ready() {
    if (transport === this && status === 'connected') return Promise.resolve(true);
    if (this.closed) return Promise.resolve(false);
    return new Promise(resolve => {
      const timer = setTimeout(() => resolve(false), 6000);
      this.waiters.push(value => { clearTimeout(timer); resolve(value); });
    });
  }
  resolveWaiters(value) { for (const resolve of this.waiters.splice(0)) resolve(value); }
  disconnect() {
    this.closed = true;
    this.controller?.abort();
    this.resolveWaiters(false);
    for (const item of this.queue.splice(0)) item.resolve({ accepted: false, reason: 'disabled' });
  }
}

class NativeTransport {
  constructor(host) { this.host = host; this.port = null; this.closed = false; this.waiters = []; this.timer = null; this.attempt = 0; }
  connect() {
    setTransportStatus(this, 'connecting');
    try {
      const port = chrome.runtime.connectNative(this.host);
      this.port = port;
      port.onMessage.addListener(() => {
        if (this.closed || this.port !== port) return;
        this.attempt = 0;
        setTransportStatus(this, 'connected');
        this.resolveWaiters(true);
        void requestSnapshots();
      });
      port.onDisconnect.addListener(() => {
        if (this.closed || this.port !== port) return;
        this.port = null;
        const error = chrome.runtime.lastError?.message || 'Native host disconnected.';
        setTransportStatus(this, 'disconnected', error);
        this.resolveWaiters(false);
        this.retry();
      });
      port.postMessage({ type: 'connected', timestamp: Date.now(), version: VERSION });
    } catch (error) {
      this.port = null;
      setTransportStatus(this, 'disconnected', error.message);
      this.resolveWaiters(false);
      this.retry();
    }
  }
  send(message) {
    if (this.closed || !this.port) return { accepted: false, reason: 'disconnected' };
    try { this.port.postMessage(message); return { accepted: true }; }
    catch (error) {
      setTransportStatus(this, 'disconnected', error.message);
      try { this.port.disconnect(); } catch {}
      this.port = null;
      this.retry();
      return { accepted: false, reason: error.message };
    }
  }
  retry() {
    if (this.closed || this.timer) return;
    const delay = Math.min(1000 * 2 ** Math.min(this.attempt++, 5), 30000);
    this.timer = setTimeout(() => { this.timer = null; this.connect(); }, delay);
  }
  ready() {
    if (transport === this && status === 'connected') return Promise.resolve(true);
    if (this.closed || !this.port) return Promise.resolve(false);
    return new Promise(resolve => {
      const timer = setTimeout(() => resolve(false), 5000);
      this.waiters.push(value => { clearTimeout(timer); resolve(value); });
    });
  }
  resolveWaiters(value) { for (const resolve of this.waiters.splice(0)) resolve(value); }
  disconnect() {
    this.closed = true;
    clearTimeout(this.timer);
    this.resolveWaiters(false);
    const port = this.port;
    this.port = null;
    if (port) {
      try { port.postMessage({ type: 'disconnected', timestamp: Date.now() }); } catch {}
      port.disconnect();
    }
  }
}
