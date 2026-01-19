#!/usr/bin/env python3
"""
asbplayer Subtitle Streamer - Example WebSocket Receiver

This is a simple receiver that prints subtitles to the console in real-time.
Perfect for testing and as a starting point for custom integrations.

Requirements:
    - Python 3.7+ (tested with Python 3.13)
    - websockets library: pip install websockets

Usage:
    1. Install dependencies: pip install websockets
    2. Run: python example_receiver.py
    3. Open Chrome extension settings and verify connection is green
    4. Play a video with asbplayer and loaded subtitles
    5. Watch subtitles appear in this console!

For more examples (Rust, HTTP, Native Messaging, Neovim), see README.md

Note: Written by Claude (Anthropic) and examined by a human.
"""

import asyncio
import websockets
import json
from datetime import datetime


async def handle_client(websocket):
    """Handle incoming WebSocket connection from extension"""
    client_addr = websocket.remote_address
    print(f"\n{'='*60}")
    print(f"✓ Extension connected from {client_addr[0]}:{client_addr[1]}")
    print(f"{'='*60}\n")

    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                handle_message(data)

            except json.JSONDecodeError as e:
                print(f"⚠ Invalid JSON: {e}")

    except websockets.exceptions.ConnectionClosed:
        print(f"\n{'='*60}")
        print(f"✗ Extension disconnected from {client_addr[0]}:{client_addr[1]}")
        print(f"{'='*60}\n")


def handle_message(data):
    """Process different message types"""
    msg_type = data.get('type', 'unknown')

    if msg_type == 'connected':
        version = data.get('version', 'unknown')
        print(f"🔌 Extension version: {version}")
        print(f"⏰ Connected at: {format_timestamp(data.get('timestamp'))}")
        print(f"\n{'─'*60}")
        print("Waiting for subtitles... (play a video with asbplayer)")
        print(f"{'─'*60}\n")

    elif msg_type == 'subtitle':
        handle_subtitle(data)

    elif msg_type == 'heartbeat':
        # Heartbeat every 30s - usually silent
        # Uncomment to see heartbeats:
        # print(f"💓 Heartbeat: {format_timestamp(data.get('timestamp'))}")
        pass

    elif msg_type == 'disconnected':
        print(f"\n👋 Extension disconnected at: {format_timestamp(data.get('timestamp'))}")

    else:
        print(f"⚠ Unknown message type: {msg_type}")


def handle_subtitle(data):
    """Process and display subtitle data"""
    subtitle = data.get('subtitle', {})
    video = data.get('video', {})

    text = subtitle.get('text', '')
    lines = subtitle.get('lines', [])  # Array of {text, track} objects
    current_time = video.get('currentTime', 0)
    video_url = video.get('url', 'unknown')

    # Format timestamp as MM:SS
    minutes = int(current_time // 60)
    seconds = int(current_time % 60)
    time_str = f"{minutes:02d}:{seconds:02d}"

    # Print subtitle with timestamp
    if lines:
        # New format: show each track separately
        print(f"[{time_str}] {len(lines)} subtitle track(s):")
        for line in lines:
            track_num = line.get('track', 0)
            line_text = line.get('text', '')
            print(f"  Track {track_num}: {line_text}")
    else:
        # Fallback to old format (backward compatibility)
        print(f"[{time_str}] {text}")

    # Uncomment for detailed information:
    # print(f"    Video: {video_url}")
    # print(f"    Duration: {video.get('duration', 0):.1f}s")
    # print(f"    Paused: {video.get('paused', False)}")
    # print()

    # Example: Filter only track 0
    # if lines:
    #     track_0 = [l for l in lines if l.get('track') == 0]
    #     if track_0:
    #         print(f"  Track 0 only: {track_0[0].get('text')}")

    # Example: Filter only track 1
    # if lines:
    #     track_1 = [l for l in lines if l.get('track') == 1]
    #     if track_1:
    #         print(f"  Track 1 only: {track_1[0].get('text')}")


def format_timestamp(timestamp):
    """Format Unix timestamp to readable time"""
    if timestamp:
        dt = datetime.fromtimestamp(timestamp / 1000)
        return dt.strftime('%Y-%m-%d %H:%M:%S')
    return 'unknown'


async def main():
    """Start WebSocket server"""
    host = "localhost"
    port = 8766  # Changed from 8765 to avoid conflict with AnkiConnect

    print(f"\n{'='*60}")
    print(f"  asbplayer Subtitle Streamer - Example Receiver")
    print(f"{'='*60}\n")
    print(f"🚀 WebSocket server starting...")
    print(f"📍 Listening on: ws://{host}:{port}")
    print(f"\n{'─'*60}")
    print("Next steps:")
    print("  1. Open Chrome extension settings")
    print("  2. Verify status shows 'Connected' (green)")
    print("  3. Open a video with asbplayer")
    print("  4. Load subtitles and play")
    print(f"{'─'*60}\n")

    server = await websockets.serve(
        handle_client,
        host,
        port,
        ping_interval=None  # Extension sends heartbeats
    )

    print("✓ Server is ready and waiting for connections...\n")

    # Keep server running
    await server.wait_closed()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\n👋 Server stopped by user (Ctrl+C)")
        print("Goodbye!\n")
    except Exception as e:
        print(f"\n❌ Error: {e}\n")
        raise
