// asbplayer Subtitle Streamer - Content Script
// Observes asbplayer subtitle containers and extracts subtitle text

(function() {
  'use strict';

  // State
  let currentSubtitle = '';
  let observer = null;
  let videoElement = null;
  let lastSentTime = 0;
  const DEBOUNCE_MS = 50; // Prevent duplicate sends

  // Configuration
  const SUBTITLE_SELECTORS = [
    '.asbplayer-subtitles-container-bottom',
    '.asbplayer-subtitles-container-top'
  ];

  const VIDEO_SELECTORS = [
    'video',
    'video.html5-main-video' // YouTube
  ];

  // Initialize
  function init() {
    console.log('[SubtitleStreamer] Content script loaded');

    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', setup);
    } else {
      setup();
    }
  }

  // Setup observers
  function setup() {
    console.log('[SubtitleStreamer] Setting up observers');

    // Find video element
    findVideoElement();

    // Try to find subtitle containers immediately
    const containers = findSubtitleContainers();
    if (containers.length > 0) {
      console.log(`[SubtitleStreamer] Found ${containers.length} subtitle containers`);
      observeContainers(containers);
    } else {
      console.log('[SubtitleStreamer] No containers found yet, waiting...');
    }

    // Also observe the entire document for dynamically added containers
    observeDocument();
  }

  // Find video element
  function findVideoElement() {
    for (const selector of VIDEO_SELECTORS) {
      const element = document.querySelector(selector);
      if (element) {
        videoElement = element;
        console.log('[SubtitleStreamer] Found video element:', selector);
        return;
      }
    }
    console.log('[SubtitleStreamer] No video element found yet');
  }

  // Find subtitle containers
  function findSubtitleContainers() {
    const containers = [];
    for (const selector of SUBTITLE_SELECTORS) {
      const elements = document.querySelectorAll(selector);
      containers.push(...Array.from(elements));
    }
    return containers;
  }

  // Observe subtitle containers
  function observeContainers(containers) {
    if (observer) {
      observer.disconnect();
    }

    observer = new MutationObserver((mutations) => {
      handleSubtitleChange(mutations);
    });

    // Observe each container
    containers.forEach(container => {
      observer.observe(container, {
        childList: true,
        subtree: true,
        characterData: true
      });
      console.log('[SubtitleStreamer] Observing container:', container.className);
    });
  }

  // Observe document for new containers
  function observeDocument() {
    const documentObserver = new MutationObserver((mutations) => {
      let foundNew = false;

      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if this is a subtitle container
            for (const selector of SUBTITLE_SELECTORS) {
              if (node.matches && node.matches(selector)) {
                foundNew = true;
                break;
              }
              // Also check descendants
              if (node.querySelector && node.querySelector(selector)) {
                foundNew = true;
                break;
              }
            }
          }
        }
      }

      if (foundNew) {
        console.log('[SubtitleStreamer] New containers detected, re-initializing...');
        const containers = findSubtitleContainers();
        if (containers.length > 0) {
          observeContainers(containers);
        }
      }

      // Also try to find video if we haven't yet
      if (!videoElement) {
        findVideoElement();
      }
    });

    documentObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Handle subtitle changes
  function handleSubtitleChange(mutations) {
    // Find the container that changed
    const container = mutations[0].target.closest(SUBTITLE_SELECTORS.join(','));
    if (!container) return;

    // Extract individual subtitle lines with track numbers
    const spans = container.querySelectorAll('span[data-track]');
    const lines = Array.from(spans).map(span => ({
      text: span.textContent.trim(),
      track: parseInt(span.dataset.track || '0', 10)
    }));

    // Combine all lines for comparison (backward compatibility)
    const text = lines.map(l => l.text).join('\n');

    // Debounce and check if changed
    const now = Date.now();
    if (text === currentSubtitle || (now - lastSentTime) < DEBOUNCE_MS) {
      return;
    }

    currentSubtitle = text;
    lastSentTime = now;

    // Get video context
    const videoContext = getVideoContext();

    // Send to background script
    if (text) {
      console.log('[SubtitleStreamer] Subtitle:', text);
      console.log('[SubtitleStreamer] Lines:', lines);
      sendSubtitle(text, lines, videoContext);
    }
  }

  // Get video context
  function getVideoContext() {
    if (!videoElement) {
      findVideoElement();
    }

    if (videoElement) {
      return {
        currentTime: videoElement.currentTime,
        duration: videoElement.duration || 0,
        paused: videoElement.paused,
        url: window.location.href
      };
    }

    return {
      currentTime: 0,
      duration: 0,
      paused: true,
      url: window.location.href
    };
  }

  // Send subtitle to background script
  function sendSubtitle(text, lines, videoContext) {
    const message = {
      type: 'subtitle',
      timestamp: Date.now(),
      video: videoContext,
      subtitle: {
        text: text, // Combined text for backward compatibility
        lines: lines, // Array of {text, track} objects
        start: Math.floor(videoContext.currentTime * 1000),
        end: Math.floor(videoContext.currentTime * 1000) + 2000 // Estimate 2s duration
      }
    };

    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[SubtitleStreamer] Error sending message:', chrome.runtime.lastError);
      }
    });
  }

  // Start
  init();
})();
