const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

function worker(saved = {}, fetchResult = async () => ({ ok: true, status: 200 })) {
  let listener;
  let storageListener;
  const sockets = [];
  const alarms = new Map();
  const timers = new Map();
  let timerId = 0;
  class Socket {
    static OPEN = 1;
    constructor(url) { this.url = url; this.readyState = 0; this.sent = []; sockets.push(this); }
    send(value) { this.sent.push(JSON.parse(value)); }
    close() { this.readyState = 3; }
    open() { this.readyState = 1; this.onopen?.(); }
    closed() { this.readyState = 3; this.onclose?.(); }
  }
  const context = vm.createContext({
    console, URL, WebSocket: Socket, fetch: fetchResult, AbortController,
    setTimeout(fn) { const id = ++timerId; timers.set(id, fn); return id; },
    clearTimeout(id) { timers.delete(id); }, setInterval() { return ++timerId; }, clearInterval() {},
    chrome: {
      runtime: { id: 'extension', onMessage: { addListener(fn) { listener = fn; } },
        connectNative() { throw Error('No native host'); } },
      storage: { sync: {
        async get(defaults) { return { ...defaults, ...saved }; },
        async set(value) { saved = { ...value }; storageListener?.({ enabled: { newValue: value.enabled } }, 'sync'); }
      }, onChanged: { addListener(fn) { storageListener = fn; } } },
      action: { setBadgeText() {}, setBadgeBackgroundColor() {} },
      alarms: {
        create(name, options) { alarms.set(name, options); },
        clear(name) { alarms.delete(name); },
        onAlarm: { addListener() {} }
      },
      tabs: { async query() { return []; }, async sendMessage() {} }
    }
  });
  vm.runInContext(source('background.js'), context);
  return {
    sockets, timers, alarms, context,
    message(payload, sender = { id: 'extension' }) {
      return new Promise(resolve => listener(payload, sender, resolve));
    }
  };
}

function page(initial = 'first') {
  let callback;
  let enabled = true;
  const sent = [];
  const span = {
    nodeType: 1, localName: 'span', dataset: { track: '0' }, isConnected: true,
    childNodes: [{ nodeType: 3, nodeValue: initial }],
    closest() { return area; },
    parentElement: { closest() { return null; } }
  };
  const area = {
    isConnected: true, hidden: false, active: true,
    matches(selector) { return this.active && selector.includes('bottom'); },
    querySelectorAll() { return span.childNodes[0].nodeValue ? [span] : []; },
    getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 20 }; }
  };
  const areas = [area];
  const document = {
    querySelectorAll(selector) {
      if (selector === '*') return [];
      if (selector === 'video') return [];
      return areas.filter(item => item.isConnected && item.matches(selector));
    }
  };
  const context = vm.createContext({
    console, document, location: { href: 'https://example.com' },
    Node: { ELEMENT_NODE: 1, TEXT_NODE: 3 },
    getComputedStyle() { return { display: 'block', visibility: 'visible' }; },
    queueMicrotask,
    MutationObserver: class { constructor(fn) { callback = fn; } observe() {} disconnect() {} },
    chrome: {
      runtime: { onMessage: { addListener() {} }, async sendMessage(message) { sent.push(message); return { accepted: true }; } },
      storage: { sync: { async get() { return { enabled }; } }, onChanged: { addListener() {} } }
    }
  });
  vm.runInContext(source('content.js'), context);
  return {
    sent, span, area,
    addArea(text) {
      const top = {
        isConnected: true, hidden: false,
        matches(selector) { return selector.includes('top'); },
        querySelectorAll() { return [{
          nodeType: 1, localName: 'span', dataset: { track: '1' }, isConnected: true,
          childNodes: [{ nodeType: 3, nodeValue: text }],
          parentElement: { closest() { return null; } }
        }]; },
        getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 20 }; }
      };
      areas.push(top);
      return top;
    },
    mutate(records) { callback(records); }, disable() { enabled = false; }
  };
}

test('worker loads settings on an ordinary wake and respects disabled state', async () => {
  const w = worker({ enabled: false });
  const response = await w.message({ type: 'getStatus' });
  assert.equal(response.settings.enabled, false);
  assert.equal(response.status, 'disconnected');
  assert.equal(w.sockets.length, 0);
});

test('closing an old socket after disabling never reconnects', async () => {
  const w = worker();
  await w.message({ type: 'getStatus' });
  w.sockets[0].open();
  const response = await w.message({ type: 'updateSettings', settings: { enabled: false } });
  assert.equal(response.success, true);
  w.sockets[0].closed();
  assert.equal(w.sockets.length, 1);
  assert.equal(w.timers.size, 0);
  assert.equal(w.alarms.size, 0);
});

test('a failed socket schedules a worker-waking retry alarm', async () => {
  const w = worker();
  await w.message({ type: 'getStatus' });
  w.sockets[0].closed();
  assert.equal(w.alarms.get('reconnect').delayInMinutes, 1);
});

test('HTTP failure reports disconnected and rejects event', async () => {
  const w = worker({ transportType: 'http' }, async () => ({ ok: false, status: 400 }));
  await w.message({ type: 'getStatus' });
  await tick();
  const status = await w.message({ type: 'getStatus' });
  assert.equal(status.status, 'disconnected');
  assert.match(status.error, /HTTP 400/);
});

test('invalid settings do not persist or replace a working transport', async () => {
  const w = worker();
  await w.message({ type: 'getStatus' });
  const invalid = await w.message({ type: 'updateSettings', settings: { wsUrl: 'ws://' } });
  assert.equal(invalid.success, false);
  assert.equal(w.sockets.length, 1);
  assert.equal((await w.message({ type: 'getStatus' })).settings.wsUrl, 'ws://localhost:8767');
});

test('WebSocket sends a source-tagged subtitle after opening', async () => {
  const w = worker();
  await w.message({ type: 'getStatus' });
  w.sockets[0].open();
  const result = await w.message({
    type: 'subtitle', sequence: 7, timestamp: 123,
    video: { currentTime: null, duration: null, paused: null, url: 'https://example.com' },
    subtitle: { text: 'hello', lines: [{ text: 'hello', track: 0, area: 'bottom' }] }
  }, { id: 'extension', tab: { id: 42 }, frameId: 3, documentId: 'doc-1', url: 'https://example.com/frame' });
  assert.equal(result.accepted, true);
  const event = w.sockets[0].sent.find(item => item.type === 'subtitle');
  assert.equal(event.eventId, '42:doc-1:7');
  assert.equal(event.sequence, 7);
  assert.equal(event.source.url, 'https://example.com/frame');
});

test('HTTP posts events in order', async () => {
  const posted = [];
  const w = worker({ transportType: 'http' }, async (_, options) => {
    posted.push(JSON.parse(options.body).type);
    return { ok: true, status: 200 };
  });
  await w.message({ type: 'getStatus' });
  const event = index => ({
    type: 'subtitle', sequence: index, timestamp: index,
    video: {}, subtitle: { text: `line ${index}`, lines: [] }
  });
  await Promise.all([
    w.message(event(1), { id: 'extension', tab: { id: 1 }, frameId: 0, documentId: 'doc-2' }),
    w.message(event(2), { id: 'extension', tab: { id: 1 }, frameId: 0, documentId: 'doc-2' })
  ]);
  assert.equal(posted.join(','), 'connected,subtitle,subtitle');
  assert.equal((await w.message({ type: 'getStatus' })).status, 'connected');
});

test('existing subtitle is sent, text mutation updates it, and removal clears it', async () => {
  const p = page();
  await tick();
  assert.equal(p.sent[0].subtitle.text, 'first');
  p.span.childNodes[0].nodeValue = 'second';
  p.mutate([{ type: 'characterData', target: { nodeType: 3, parentElement: p.span }, addedNodes: [], removedNodes: [] }]);
  await tick();
  assert.equal(p.sent[1].subtitle.text, 'second');
  p.area.isConnected = false;
  p.mutate([{ type: 'childList', target: {}, addedNodes: [], removedNodes: [{ nodeType: 1, matches: () => true }] }]);
  await tick();
  assert.equal(p.sent[2].subtitle.text, '');
  assert.equal('start' in p.sent[1].subtitle, false);
  assert.equal('end' in p.sent[1].subtitle, false);
});

test('a new top area is included in the complete snapshot', async () => {
  const p = page();
  await tick();
  const top = p.addArea('bonjour');
  p.mutate([{ type: 'childList', target: {},
    addedNodes: [{ nodeType: 1, matches: () => true }], removedNodes: [] }]);
  await tick();
  assert.equal(p.sent.at(-1).subtitle.text, 'first\nbonjour');
  assert.equal(p.sent.at(-1).subtitle.lines[1].area, 'top');
  assert.equal(top.isConnected, true);
});

test('an empty page produces no subtitle events', async () => {
  const p = page('');
  p.area.isConnected = false;
  await tick();
  assert.equal(p.sent.length, 0);
});

test('removing a subtitle container class sends a clear event', async () => {
  const p = page();
  await tick();
  p.area.active = false;
  p.area.nodeType = 1;
  p.area.closest = () => null;
  p.mutate([{ type: 'attributes', target: p.area, addedNodes: [], removedNodes: [] }]);
  await tick();
  assert.equal(p.sent.at(-1).subtitle.text, '');
});
