// Capture visible asbplayer text in this frame. No page text leaves while disabled.
(() => {
  'use strict';
  const SELECTOR = '.asbplayer-subtitles-container-bottom, .asbplayer-subtitles-container-top';
  const defaults = { enabled: true };
  const roots = new Map();
  let knownAreas = new Set();
  const nodeIds = new WeakMap();
  let nextNodeId = 1;
  let enabled = false;
  let lastSignature = '';
  let lastText = '';
  let sequence = 0;
  let pending = false;

  function getNodeId(node) {
    if (!nodeIds.has(node)) nodeIds.set(node, nextNodeId++);
    return nodeIds.get(node);
  }

  function visible(element) {
    if (!element.isConnected || element.hidden) return false;
    const style = getComputedStyle(element);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.visibility !== 'collapse';
  }

  function plainText(node) {
    if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || '';
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const tag = node.localName;
    if (tag === 'rt' || tag === 'rp') return '';
    if (tag === 'br') return '\n';
    return Array.from(node.childNodes, plainText).join('');
  }

  function containers() {
    const found = [];
    for (const root of roots.keys()) {
      for (const element of root.querySelectorAll(SELECTOR)) {
        if (visible(element)) found.push(element);
      }
    }
    return found;
  }

  function videoContext(areas) {
    const videos = Array.from(roots.keys()).flatMap(root =>
      Array.from(root.querySelectorAll('video'))).filter(video => video.isConnected);
    let best = null;
    let bestScore = Infinity;
    for (const video of videos) {
      const rect = video.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const middleX = rect.left + rect.width / 2;
      const middleY = rect.top + rect.height / 2;
      const distance = Math.min(...areas.map(area => {
        const box = area.getBoundingClientRect();
        const dx = middleX - (box.left + box.width / 2);
        const dy = middleY - (box.top + box.height / 2);
        return dx * dx + dy * dy;
      }));
      const score = distance + (video.paused ? 1000000 : 0);
      if (score < bestScore) { bestScore = score; best = video; }
    }
    return {
      currentTime: best && Number.isFinite(best.currentTime) ? best.currentTime : null,
      duration: best && Number.isFinite(best.duration) ? best.duration : null,
      paused: best ? best.paused : null,
      url: location.href
    };
  }

  function snapshot(force = false) {
    if (!enabled) return;
    for (const [root, observer] of roots) {
      if (root.host && !root.host.isConnected) {
        observer.disconnect();
        roots.delete(root);
      }
    }
    const areas = containers();
    knownAreas = new Set(areas);
    if (!areas.length && !lastText) return;
    const lines = [];
    const identity = [];
    for (const area of areas) {
      const areaName = area.matches('.asbplayer-subtitles-container-top') ? 'top' : 'bottom';
      for (const span of area.querySelectorAll('span[data-track]')) {
        if (span.parentElement?.closest('span[data-track]') !== null) continue;
        if (!visible(span)) continue;
        const text = plainText(span).trim();
        if (!text) continue;
        const track = Number(span.dataset.track);
        if (!Number.isSafeInteger(track) || track < 0) continue;
        lines.push({ text, track, area: areaName });
        identity.push(getNodeId(span));
      }
    }
    const text = lines.map(line => line.text).join('\n');
    const signature = JSON.stringify({ lines, identity });
    if (!force && signature === lastSignature) return;
    if (!text && !lastText && !force) return;
    lastSignature = signature;
    lastText = text;
    const message = {
      type: 'subtitle', sequence: ++sequence, timestamp: Date.now(),
      video: videoContext(areas), subtitle: { text, lines }
    };
    chrome.runtime.sendMessage(message).then(result => {
      if (!result?.accepted) console.warn('[SubtitleStreamer] Subtitle was not delivered:', result?.reason);
    }).catch(error => console.warn('[SubtitleStreamer] Could not send subtitle:', error.message));
  }

  function scheduleSnapshot() {
    if (pending) return;
    pending = true;
    queueMicrotask(() => { pending = false; snapshot(); });
  }

  function relevant(record) {
    const target = record.target.nodeType === Node.ELEMENT_NODE
      ? record.target : record.target.parentElement;
    if (target?.closest?.(SELECTOR)) return true;
    if (knownAreas.has(target) || [...knownAreas].some(area => target?.contains?.(area))) return true;
    if (record.type === 'attributes' && target?.matches?.(SELECTOR)) return true;
    for (const node of [...record.addedNodes, ...record.removedNodes]) {
      if (node.nodeType !== Node.ELEMENT_NODE) continue;
      if (node.matches?.(SELECTOR) || node.querySelector?.(SELECTOR)) return true;
      if ([...roots.keys()].some(root => root.host && (root.host === node || node.contains?.(root.host)))) return true;
    }
    return false;
  }

  function discoverShadows(root) {
    // Open shadow roots can be inspected; closed roots remain inaccessible.
    for (const element of root.querySelectorAll('*')) {
      if (element.shadowRoot && !roots.has(element.shadowRoot)) observeRoot(element.shadowRoot);
    }
  }

  function observeRoot(root) {
    if (roots.has(root)) return;
    const observer = new MutationObserver(records => {
      let foundNewRoot = false;
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          if (node.shadowRoot || node.querySelector?.('*')) foundNewRoot = true;
        }
      }
      if (foundNewRoot) discoverShadows(root);
      if (records.some(relevant)) scheduleSnapshot();
    });
    observer.observe(root, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ['class', 'style', 'hidden', 'data-track']
    });
    roots.set(root, observer);
    discoverShadows(root);
  }

  function stop() {
    enabled = false;
    for (const observer of roots.values()) observer.disconnect();
    roots.clear();
    knownAreas.clear();
    lastSignature = '';
    lastText = '';
  }

  function setEnabled(value) {
    if (value === enabled) return;
    if (!value) { stop(); return; }
    enabled = true;
    observeRoot(document);
    snapshot(true);
  }

  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === 'resync' && enabled) snapshot(true);
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes.enabled) setEnabled(changes.enabled.newValue === true);
  });

  chrome.storage.sync.get(defaults).then(value => {
    setEnabled(value.enabled === true);
  }).catch(error => console.warn('[SubtitleStreamer] Could not read settings:', error.message));
})();
