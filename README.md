# asbplayer Subtitle Streamer

Stream subtitles from [asbplayer](https://github.com/killergerbah/asbplayer) to your own applications in real-time.

> **Note**: This extension was written by Claude (Anthropic) and examined by a human. If you encounter issues, please [report them here](https://github.com/SanzharKuandyk/asbplayer-subtitle-streamer/issues).

## Features

- Stream subtitles in real-time as they appear
- Support for multiple subtitle tracks (with track numbers)
- Multiple transport options: WebSocket, HTTP POST, or Native Messaging
- Auto-reconnect (WebSocket)
- Backward compatible message format

## Quick Start

### 1. Install Extension

1. Clone this repo: `git clone https://github.com/SanzharKuandyk/asbplayer-subtitle-streamer.git`
2. Open Chrome → `chrome://extensions/`
3. Enable "Developer mode" (top-right)
4. Click "Load unpacked" → Select the repo folder

### 2. Start a Receiver

**Python WebSocket (Recommended):**
```bash
cd asbplayer-subtitle-streamer
pip install websockets
python example_receiver.py
```

You should see:
```
✓ Server is ready and waiting for connections...
```

**Other languages/frameworks:** See [EXAMPLES.md](EXAMPLES.md)

### 3. Use asbplayer

1. Open a video site (Netflix, YouTube, etc.)
2. Activate asbplayer and load subtitles
3. **Enable subtitle display on the video** (required - the extension monitors subtitle DOM elements)
4. Play the video
5. Subtitles stream to your receiver in real-time

## Message Format

```json
{
  "type": "subtitle",
  "timestamp": 1234567890123,
  "video": {
    "currentTime": 45.234,
    "duration": 3600.0,
    "paused": false,
    "url": "https://www.netflix.com/watch/12345"
  },
  "subtitle": {
    "text": "Combined subtitle text\nSecond line",
    "lines": [
      {"text": "Combined subtitle text", "track": 0},
      {"text": "Second line", "track": 1}
    ],
    "start": 45234,
    "end": 47234
  }
}
```

**Fields:**
- `text`: All subtitle lines combined with `\n` (backward compatible)
- `lines`: Array of individual subtitle lines with track numbers
- `track`: User-configurable track ID (0, 1, 2, etc.)

**See [EXAMPLES.md](EXAMPLES.md) for working with multiple tracks.**

## Configuration

Click the extension icon to configure:

- **WebSocket** (default): `ws://localhost:8766`
- **HTTP POST**: `http://localhost:8080/subtitle`
- **Native Messaging**: `com.subtitle.streamer`

Port `8766` is used by default to avoid conflicts with AnkiConnect (port `8765`).

## Transport Options

### WebSocket (Recommended)
- Best for: Real-time streaming, continuous connection
- Pros: Low latency, bidirectional, persistent
- Cons: Requires WebSocket server

### HTTP POST
- Best for: Simple logging, stateless processing
- Pros: Works with any HTTP server, no persistent connection
- Cons: Higher overhead per subtitle

### Native Messaging
- Best for: Deep OS integration, desktop apps
- Pros: Direct IPC with native apps
- Cons: Requires native host manifest configuration

## Examples & Use Cases

See [EXAMPLES.md](EXAMPLES.md) for:
- Python/Rust/JavaScript receiver examples
- Neovim integration
- Native messaging setup
- Multi-track subtitle handling
- Use case ideas (language learning, sentence mining, etc.)

## Troubleshooting

**Subtitles not appearing:**
- Check that asbplayer is installed and active
- Verify subtitles are loaded in asbplayer
- Check browser console (F12) for `[SubtitleStreamer]` logs

**Connection failed:**
- Make sure your receiver is running (`python example_receiver.py`)
- Check the URL/port matches your receiver
- For WebSocket: URL must start with `ws://` or `wss://`
- For HTTP: URL must start with `http://` or `https://`

**Extension badge:**
- Green (●): Connected and streaming
- Red (○): Disconnected
- Yellow (◌): Connecting...

## Development

```
asbplayer-subtitle-streamer/
├── manifest.json          # Extension config
├── background.js          # Transport manager
├── content.js             # Subtitle observer
├── popup.html/popup.js    # Settings UI
├── example_receiver.py    # Example WebSocket receiver
└── EXAMPLES.md           # Detailed examples
```

**How it works:**
- Monitors subtitle DOM containers (`.asbplayer-subtitles-container-bottom/top`)
- Extracts text and track numbers from `span[data-track]` elements
- Streams to receivers via WebSocket, HTTP, or Native Messaging

**Debugging:**
- Content script: Right-click page → Inspect → Console
- Background script: `chrome://extensions/` → "Inspect views: service worker"
- Popup: Right-click extension icon → Inspect popup

## License

MIT License - feel free to use, modify, and distribute.

## Credits

- Built for [asbplayer](https://github.com/killergerbah/asbplayer) by killergerbah
- Written by Claude (Anthropic) and examined by a human
- Contributions welcome!

---

**Happy subtitle streaming!** 📺
