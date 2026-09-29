#!/usr/bin/env python3
"""Print subtitle snapshots sent to ws://localhost:8767.

Install: python -m pip install websockets
Run:     python example_receiver.py
"""

import asyncio
import json
import websockets


def display(message):
    if not isinstance(message, dict):
        return
    kind = message.get("type")
    if kind == "subtitle":
        subtitle = message.get("subtitle")
        if not isinstance(subtitle, dict):
            return
        text = subtitle.get("text")
        if not isinstance(text, str):
            return
        video = message.get("video")
        seconds = video.get("currentTime") if isinstance(video, dict) else None
        time = f"{seconds // 60:02.0f}:{seconds % 60:02.0f}" if isinstance(seconds, (int, float)) else "--:--"
        print(f"[{time}] {text or '(cleared)'}", flush=True)
    elif kind == "connected":
        print("Extension connected", flush=True)
    elif kind == "disconnected":
        print("Extension disconnected", flush=True)


async def handle_client(websocket):
    print("Client connected", flush=True)
    try:
        async for raw in websocket:
            try:
                display(json.loads(raw))
            except (json.JSONDecodeError, ValueError, TypeError):
                print("Ignored malformed message", flush=True)
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        print("Client disconnected", flush=True)


async def main():
    async with websockets.serve(handle_client, "127.0.0.1", 8767):
        print("Listening on ws://127.0.0.1:8767", flush=True)
        await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Stopped")
