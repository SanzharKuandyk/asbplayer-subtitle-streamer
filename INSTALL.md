# Quick Installation Guide

## 1. Install the Extension (5 minutes)

### Step 1: Load in Chrome
1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right corner)
3. Click "Load unpacked"
4. Navigate to and select the `subtitle-streamer` folder
5. Extension should now appear with a default icon

**Note**: The extension works without custom icons. For production use, see `icons/ICONS_README.txt`.

### Step 2: Test the Extension
1. Click the extension icon in Chrome toolbar
2. Settings popup should open
3. Note the default configuration:
   - Transport Type: WebSocket
   - URL: `ws://localhost:8766`

## 2. Set Up a Test Receiver (2 minutes)

Choose the quickest option for your environment:

### Option A: Python WebSocket Server (Easiest)

**Requirements**: Python 3.7+ (tested with Python 3.13)

**Install dependencies**:
```bash
pip install websockets
```

**Create `test_receiver.py`**:
```python
import asyncio
import websockets
import json

async def handle_client(websocket):
    print("✓ Extension connected!")
    try:
        async for message in websocket:
            data = json.loads(message)
            if data['type'] == 'subtitle':
                print(f"📝 {data['subtitle']['text']}")
    except websockets.exceptions.ConnectionClosed:
        print("✗ Extension disconnected")

async def main():
    server = await websockets.serve(handle_client, "localhost", 8766)
    print("🚀 Receiver listening on ws://localhost:8766")
    print("👉 Open a video with asbplayer to see subtitles...")
    await server.wait_closed()

asyncio.run(main())
```

**Run**:
```bash
python test_receiver.py
```

### Option B: Node.js WebSocket Server (Alternative)

**Install dependencies**:
```bash
npm install ws
```

**Create `test_receiver.js`**:
```javascript
const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8766 });

wss.on('connection', (ws) => {
  console.log('✓ Extension connected!');

  ws.on('message', (message) => {
    const data = JSON.parse(message);
    if (data.type === 'subtitle') {
      console.log(`📝 ${data.subtitle.text}`);
    }
  });

  ws.on('close', () => {
    console.log('✗ Extension disconnected');
  });
});

console.log('🚀 Receiver listening on ws://localhost:8766');
console.log('👉 Open a video with asbplayer to see subtitles...');
```

**Run**:
```bash
node test_receiver.js
```

## 3. Test the Complete Setup (1 minute)

1. **Start your receiver** (Python or Node.js script from Step 2)
2. **Open extension settings**:
   - Click extension icon in Chrome toolbar
   - Status should show "Connected" with green dot
   - If not, click "Test Connection"
3. **Open a test video**:
   - Go to Netflix, YouTube, or any video site
   - Activate asbplayer (make sure it's installed)
   - Load subtitles in asbplayer
   - Play the video
4. **Watch your receiver terminal**:
   - Subtitles should appear in real-time as they're displayed
   - Each line corresponds to what you see on screen

## Troubleshooting Quick Fixes

### Extension shows "Disconnected" (Red)
- **Receiver not running**: Start your Python/Node.js script
- **Wrong port**: Make sure receiver is on port `8766`
- **Firewall**: Allow localhost connections

### No subtitles appearing
- **asbplayer not active**: Click the asbplayer icon and verify it's loaded
- **No subtitles loaded**: Load subtitles in asbplayer first
- **Check console**: Open DevTools (F12) and look for `[SubtitleStreamer]` logs

### Connection works but no subtitles
- **Subtitle containers not found**: Refresh the page
- **asbplayer not rendering**: Make sure subtitles are visible on the page
- **Check content script**: DevTools Console should show "Observing container" messages

## Next Steps

Once the basic setup works:

1. **Explore transports**: Try HTTP POST or Native Messaging (see README.md)
2. **Build your workflow**: Integrate with Anki, note-taking apps, or custom tools
3. **Customize receiver**: Modify the receiver script to save subtitles, trigger actions, etc.

## Complete Examples

See `README.md` for:
- Rust WebSocket and HTTP server examples
- Neovim integration examples
- Native messaging setup
- Full message format documentation
- Advanced use cases

---

**Installation complete!** You're now streaming subtitles in real-time. 🎉
