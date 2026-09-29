#!/usr/bin/env python3
"""Example Chrome native messaging host. See EXAMPLES.md for registration."""

import json
import struct
import sys


def read_exactly(length):
    result = bytearray()
    while len(result) < length:
        part = sys.stdin.buffer.read(length - len(result))
        if not part:
            return None
        result.extend(part)
    return bytes(result)


def reply(payload):
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("=I", len(data)))
    sys.stdout.buffer.write(data)
    sys.stdout.buffer.flush()


def main():
    while True:
        header = read_exactly(4)
        if header is None:
            return
        size = struct.unpack("=I", header)[0]
        if size > 64 * 1024 * 1024:
            raise ValueError("Message too large")
        raw = read_exactly(size)
        if raw is None:
            return
        try:
            message = json.loads(raw)
            if not isinstance(message, dict):
                continue
            if message.get("type") == "subtitle":
                subtitle = message.get("subtitle")
                if isinstance(subtitle, dict) and isinstance(subtitle.get("text"), str):
                    print(subtitle["text"] or "(cleared)", file=sys.stderr, flush=True)
            reply({"received": True})
        except (UnicodeDecodeError, json.JSONDecodeError):
            reply({"received": False})


if __name__ == "__main__":
    main()
