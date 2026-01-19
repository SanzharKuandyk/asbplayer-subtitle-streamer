# Receiver Examples

This document contains detailed examples for building receivers in different languages and frameworks.

## Table of Contents

- [Python WebSocket Server](#python-websocket-server)
- [Rust WebSocket Server](#rust-websocket-server)
- [Rust HTTP Server](#rust-http-server)
- [Neovim Integration](#neovim-integration)
- [Native Messaging](#native-messaging)
- [Working with Multiple Subtitle Tracks](#working-with-multiple-subtitle-tracks)

## Python WebSocket Server

Simple WebSocket server for testing.

**Requirements:**
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

**Install:** `pip install websockets` (Python 3.7+)
**Run:** `python websocket_server.py`

## Rust WebSocket Server

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

## Rust HTTP Server

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

## Neovim Integration

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

## Native Messaging

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

**Placement:**
- **Linux/Mac**: `~/.config/google-chrome/NativeMessagingHosts/`
- **Windows**: `HKEY_CURRENT_USER\Software\Google\Chrome\NativeMessagingHosts\com.subtitle.streamer`

## Working with Multiple Subtitle Tracks

When asbplayer displays multiple subtitle tracks, you can access them individually.

### Python Example

```python
def handle_subtitle(data):
    subtitle = data.get('subtitle', {})
    lines = subtitle.get('lines', [])

    if lines:
        # Access individual tracks
        for line in lines:
            track = line.get('track', 0)
            text = line.get('text', '')
            print(f"Track {track}: {text}")

        # Filter only track 0
        track_0 = [l for l in lines if l.get('track') == 0]
        if track_0:
            print(f"Track 0: {track_0[0].get('text')}")

        # Filter only track 1
        track_1 = [l for l in lines if l.get('track') == 1]
        if track_1:
            print(f"Track 1: {track_1[0].get('text')}")
    else:
        # Fallback for backward compatibility
        text = subtitle.get('text', '')
        print(f"Subtitle: {text}")
```

### JavaScript Example

```javascript
function handleSubtitle(data) {
    const { subtitle } = data;
    const { lines } = subtitle;

    if (lines && lines.length > 0) {
        // Get only track 1
        const track1 = lines.find(l => l.track === 1);
        if (track1) {
            console.log(`Track 1: ${track1.text}`);
        }

        // Get only track 0
        const track0 = lines.find(l => l.track === 0);
        if (track0) {
            console.log(`Track 0: ${track0.text}`);
        }

        // Or process all tracks
        lines.forEach(line => {
            console.log(`Track ${line.track}: ${line.text}`);
        });
    }
}
```

### Rust Example

```rust
#[derive(Deserialize)]
struct Subtitle {
    text: String,
    lines: Option<Vec<SubtitleLine>>,
}

#[derive(Deserialize)]
struct SubtitleLine {
    text: String,
    track: u32,
}

fn handle_subtitle(subtitle: Subtitle) {
    if let Some(lines) = subtitle.lines {
        // Filter only track 0
        if let Some(track_0) = lines.iter().find(|l| l.track == 0) {
            println!("Track 0: {}", track_0.text);
        }

        // Filter only track 1
        if let Some(track_1) = lines.iter().find(|l| l.track == 1) {
            println!("Track 1: {}", track_1.text);
        }

        // Or process all tracks
        for line in lines {
            println!("Track {}: {}", line.track, line.text);
        }
    } else {
        // Fallback
        println!("Subtitle: {}", subtitle.text);
    }
}
```

## Message Format Reference

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
    "text": "Hello, world!\nこんにちは、世界！",
    "lines": [
      {"text": "Hello, world!", "track": 0},
      {"text": "こんにちは、世界！", "track": 1}
    ],
    "start": 45234,
    "end": 47234
  }
}
```

**Fields:**
- `text`: Combined text of all subtitle lines separated by `\n` (backward compatible)
- `lines`: Array of subtitle line objects with `text` and `track` number
- `track`: User-configurable track number (0, 1, 2, etc.) - not language-specific

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
