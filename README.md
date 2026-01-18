# asbplayer Subtitle Streamer

A lightweight Chrome extension that intercepts [asbplayer](https://github.com/killergerbah/asbplayer) subtitle events and streams them in real-time to your OS for language learning, sentence mining, and custom workflows.

> **Note**: This extension was written by Claude (Anthropic) and examined by a human. If you encounter issues, please report them in the [Issues](https://github.com/SanzharKuandyk/asbplayer-subtitle-streamer/issues) section.

## Features

- **Non-invasive**: Works alongside asbplayer without modifications
- **Real-time streaming**: Subtitle text appears instantly as it's displayed
- **Multi-transport**: Choose WebSocket, HTTP POST, or Native Messaging
- **Simple setup**: No complex configuration required
- **Video context**: Includes timing, URL, and playback state with each subtitle
- **Smart reconnect**: WebSocket transport auto-reconnects up to 3 times (prevents infinite loops)
- **Visual status**: Extension badge shows connection status (green/red/yellow)

## Quick Start

### 1. Install the Extension

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (top-right toggle)
4. Click "Load unpacked"
5. Select the `subtitle-streamer` folder

**Note**: For development, you can skip creating PNG icons. The extension will work with a default icon. See `icons/ICONS_README.txt` for production icon setup.

### 2. Choose Your Transport

The extension supports three ways to receive subtitle data:

#### Option A: WebSocket (Recommended for Real-time)
- **Best for**: Continuous streaming, real-time processing, interactive applications
- **Pros**: Persistent connection, low latency, bidirectional
- **Cons**: Requires WebSocket server

#### Option B: HTTP POST
- **Best for**: Simple logging, stateless processing, easy integration
- **Pros**: Works with any HTTP server, no persistent connection
- **Cons**: Higher overhead per subtitle

#### Option C: Native Messaging
- **Best for**: Deep OS integration, desktop applications
- **Pros**: Direct IPC with native apps, no network stack
- **Cons**: Requires native host manifest configuration

**Port Selection Note**: The default WebSocket port is `8766` (not `8765`) to **avoid conflicts with AnkiConnect**, which uses port `8765` by default. If you're using asbplayer with AnkiConnect, this prevents port conflicts. You can change the port in extension settings if needed.

### 3. Set Up a Receiver

Choose one of the receiver examples below, or build your own using the JSON message format.

## Receiver Examples

### WebSocket Server (Python)

Simple WebSocket server for testing.

**Requirements**:
- Python 3.7+ (tested with Python 3.13)
- `websockets` library: `pip install websockets`

```python
import asyncio
import websockets
import json

async def handle_client(websocket):
    print("Client connected")
    try:
        async for message in websocket:
            data = json.loads(message)

            if data['type'] == 'subtitle':
                subtitle = data['subtitle']['text']
                timestamp = data['video']['currentTime']
                print(f"[{timestamp:.2f}s] {subtitle}")
            elif data['type'] == 'connected':
                print("Extension connected, version:", data['version'])
            elif data['type'] == 'heartbeat':
                pass  # Heartbeat received

    except websockets.exceptions.ConnectionClosed:
        print("Client disconnected")

async def main():
    server = await websockets.serve(handle_client, "localhost", 8766)
    print("WebSocket server listening on ws://localhost:8766")
    await server.wait_closed()

if __name__ == "__main__":
    asyncio.run(main())
```

**Install**: `pip install websockets` (Python 3.7+)
**Run**: `python websocket_server.py`

### WebSocket Server (Rust)

```rust
// Cargo.toml:
// tokio = { version = "1", features = ["full"] }
// tokio-tungstenite = "0.20"
// serde = { version = "1", features = ["derive"] }
// serde_json = "1"

use tokio::net::TcpListener;
use tokio_tungstenite::accept_async;
use futures_util::StreamExt;
use serde::Deserialize;

#[derive(Deserialize)]
struct Message {
    #[serde(rename = "type")]
    msg_type: String,
    subtitle: Option<Subtitle>,
    video: Option<VideoContext>,
}

#[derive(Deserialize)]
struct Subtitle {
    text: String,
}

#[derive(Deserialize)]
struct VideoContext {
    #[serde(rename = "currentTime")]
    current_time: f64,
}

#[tokio::main]
async fn main() {
    let listener = TcpListener::bind("127.0.0.1:8766").await.unwrap();
    println!("WebSocket listening on ws://127.0.0.1:8766");

    while let Ok((stream, _)) = listener.accept().await {
        tokio::spawn(async move {
            let ws = accept_async(stream).await.unwrap();
            let (_, mut read) = ws.split();

            while let Some(Ok(msg)) = read.next().await {
                if let Ok(text) = msg.to_text() {
                    if let Ok(m) = serde_json::from_str::<Message>(text) {
                        if m.msg_type == "subtitle" {
                            if let (Some(sub), Some(vid)) = (m.subtitle, m.video) {
                                println!("[{:.2}s] {}", vid.current_time, sub.text);
                            }
                        }
                    }
                }
            }
        });
    }
}
```

### HTTP Server (Rust with Axum)

```rust
// Cargo.toml:
// axum = "0.7"
// tokio = { version = "1", features = ["full"] }
// serde = { version = "1", features = ["derive"] }
// serde_json = "1"

use axum::{Router, routing::post, Json};
use serde::Deserialize;

#[derive(Deserialize)]
struct Message {
    subtitle: Subtitle,
    video: VideoContext,
}

#[derive(Deserialize)]
struct Subtitle {
    text: String,
}

#[derive(Deserialize)]
struct VideoContext {
    #[serde(rename = "currentTime")]
    current_time: f64,
}

async fn handle_subtitle(Json(msg): Json<Message>) {
    println!("[{:.2}s] {}", msg.video.current_time, msg.subtitle.text);
}

#[tokio::main]
async fn main() {
    let app = Router::new().route("/subtitle", post(handle_subtitle));

    let listener = tokio::net::TcpListener::bind("127.0.0.1:8080")
        .await
        .unwrap();

    println!("HTTP listening on http://127.0.0.1:8080");
    axum::serve(listener, app).await.unwrap();
}
```

### Neovim Integration (Lua)

Receive subtitles directly in Neovim for language learning workflows:

```lua
-- Simple HTTP server using vim.loop
local uv = vim.loop

local function handle_subtitle(text, timestamp)
  -- Insert into current buffer
  local line = string.format("[%.2fs] %s", timestamp, text)
  vim.api.nvim_buf_set_lines(0, -1, -1, false, {line})

  -- Or add to quickfix
  vim.fn.setqflist({{text = text, type = 'I'}}, 'a')
end

-- Start simple HTTP server
local server = uv.new_tcp()
server:bind("127.0.0.1", 8080)
server:listen(128, function(err)
  local client = uv.new_tcp()
  server:accept(client)

  client:read_start(function(err, chunk)
    if chunk then
      local data = vim.json.decode(chunk:match("%b{}"))
      if data.subtitle then
        handle_subtitle(data.subtitle.text, data.video.currentTime)
      end

      -- Send HTTP response
      client:write("HTTP/1.1 200 OK\r\n\r\n")
    end
    client:close()
  end)
end)

print("Subtitle receiver listening on http://127.0.0.1:8080")
```

### Native Messaging (Python)

For deep OS integration:

```python
#!/usr/bin/env python3
import sys
import json
import struct

def send_message(message):
    """Send message to Chrome extension"""
    encoded = json.dumps(message).encode('utf-8')
    sys.stdout.buffer.write(struct.pack('I', len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()

def read_message():
    """Read message from Chrome extension"""
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length:
        return None
    length = struct.unpack('I', raw_length)[0]
    message = sys.stdin.buffer.read(length).decode('utf-8')
    return json.loads(message)

def main():
    while True:
        message = read_message()
        if not message:
            break

        if message['type'] == 'subtitle':
            subtitle = message['subtitle']['text']
            timestamp = message['video']['currentTime']
            print(f"[{timestamp:.2f}s] {subtitle}", file=sys.stderr)

            # Send acknowledgment
            send_message({"status": "received"})

if __name__ == "__main__":
    main()
```

**Native Host Manifest** (`com.subtitle.streamer.json`):
```json
{
  "name": "com.subtitle.streamer",
  "description": "Subtitle Streamer Native Host",
  "path": "/path/to/your/script.py",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://YOUR_EXTENSION_ID/"
  ]
}
```

Place in:
- **Linux/Mac**: `~/.config/google-chrome/NativeMessagingHosts/`
- **Windows**: `HKEY_CURRENT_USER\Software\Google\Chrome\NativeMessagingHosts\com.subtitle.streamer`

## Message Format

All receivers get JSON messages in this format:

### Subtitle Event
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
    "text": "Hello, world!",
    "start": 45234,
    "end": 47234
  }
}
```

### Connection Events (WebSocket only)
```json
{"type": "connected", "timestamp": 1234567890123, "version": "1.0.0"}
{"type": "heartbeat", "timestamp": 1234567890123}
{"type": "disconnected", "timestamp": 1234567890123}
```

### HTTP Transport
- **Method**: POST
- **Content-Type**: application/json
- **Body**: Same as subtitle event message

## Configuration

1. Click the extension icon in Chrome toolbar
2. Configure your transport settings:
   - **WebSocket**: Enter WebSocket server URL (default: `ws://localhost:8766`)
   - **HTTP**: Enter HTTP endpoint URL (default: `http://localhost:8080/subtitle`)
   - **Native**: Enter native host name (default: `com.subtitle.streamer`)
3. Click "Save Settings"
4. Click "Test Connection" to verify

## Usage

1. Start your receiver (WebSocket server, HTTP server, or native app)
2. Open the extension settings and verify connection status is green
3. Navigate to a video site (Netflix, YouTube, etc.)
4. Activate asbplayer and load subtitles
5. Play the video
6. Subtitles will stream to your receiver in real-time

## Status Indicators

The extension badge shows connection status:
- **Green dot (●)**: Connected and streaming
- **Red circle (○)**: Disconnected
- **Yellow circle (◌)**: Connecting...

## Troubleshooting

### Subtitles not appearing

1. Check that asbplayer is installed and active
2. Verify subtitles are loaded in asbplayer
3. Open Chrome DevTools Console (F12) and look for `[SubtitleStreamer]` logs
4. Confirm subtitle containers are being detected

### Connection issues

**WebSocket**:
- Ensure WebSocket server is running
- Check URL format: `ws://localhost:8766` (not `http://`)
- Look for connection errors in server logs
- Extension will auto-reconnect up to 3 times (check badge for yellow dot)
- If reconnection fails 3 times, click "Test Connection" in settings to retry

**HTTP**:
- Ensure HTTP server is running and accepting POST requests
- Check URL format: `http://localhost:8080/subtitle`
- Verify Content-Type is `application/json`
- Check server logs for incoming requests

**Native Messaging**:
- Verify native host manifest is correctly installed
- Check manifest path points to executable script
- Ensure script has execute permissions (Linux/Mac)
- Check allowed_origins includes your extension ID

### No subtitle containers found

- Make sure asbplayer extension is installed and enabled
- Try refreshing the video page
- Check that asbplayer is properly rendering subtitles (they should be visible on the page)

## Architecture

```
Video Page → asbplayer renders → DOM Subtitles
                                      ↓
                            MutationObserver (content.js)
                                      ↓
                            Message → Background (background.js)
                                      ↓
                          ┌───────────┴───────────┐
                          ↓                       ↓                       ↓
                    WebSocket                  HTTP                  Native
                          ↓                       ↓                       ↓
                   Your Receiver         Your Server           Your Native App
```

## Development

### Project Structure
```
subtitle-streamer/
├── manifest.json          # Extension configuration
├── background.js          # Service worker (multi-transport)
├── content.js             # Content script (subtitle observer)
├── popup.html             # Settings UI
├── popup.js               # Settings logic
├── icons/                 # Extension icons
│   ├── icon.svg          # SVG icon (for conversion)
│   └── ICONS_README.txt  # Icon setup instructions
└── README.md             # This file
```

### Testing

1. Load extension in Chrome (`chrome://extensions/`)
2. Enable Developer Mode
3. Start a test receiver (e.g., Python WebSocket server)
4. Open DevTools console for both extension popup and content script
5. Navigate to a video with asbplayer
6. Monitor console logs for subtitle detection and transmission

### Debugging

**Content Script** (runs on video pages):
- Right-click page → Inspect → Console
- Look for `[SubtitleStreamer]` messages

**Background Script** (service worker):
- Go to `chrome://extensions/`
- Click "Inspect views: service worker"
- Check console for connection and transport logs

**Popup** (settings UI):
- Right-click extension icon → Inspect popup
- Console shows settings and status updates

## Use Cases

### Language Learning
- Stream subtitles to Anki for instant flashcard creation
- Feed subtitles into spaced repetition systems
- Build sentence mining workflows

### Accessibility
- Send subtitles to text-to-speech engines
- Display subtitles on secondary screens
- Archive subtitle streams for later review

### Research & Analysis
- Log subtitles with timestamps for content analysis
- Create subtitle databases
- Study language patterns in media

### Custom Workflows
- Integrate with note-taking apps
- Trigger actions based on subtitle content
- Build interactive language learning tools

## Performance

- **Low overhead**: ~50ms debounce on subtitle changes
- **Efficient observation**: Only observes subtitle containers, not entire DOM
- **Memory safe**: Cleans up observers on page unload
- **Connection pooling**: Reuses WebSocket connections across tabs

## Security

- **Local by default**: All example receivers use localhost
- **No sensitive data**: Only subtitle text and video timing is transmitted
- **Validation**: URLs are validated before connection
- **CSP compliant**: All scripts in external files (no inline scripts)

## Compatibility

- **Chrome**: Full support (Manifest V3)
- **Edge**: Full support (Chromium-based)
- **Firefox**: Not supported (different extension API)
- **Safari**: Not supported

## License

MIT License - feel free to use, modify, and distribute.

## Credits

- Built to complement [asbplayer](https://github.com/killergerbah/asbplayer) by killergerbah
- Written by Claude (Anthropic) and examined by a human
- Contributions and feedback welcome!

## Contributing

Contributions welcome! Feel free to:
- Report bugs via GitHub issues
- Submit pull requests with improvements
- Share your receiver implementations
- Suggest new transport options

---

**Happy subtitle streaming!** 📺✨
