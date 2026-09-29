# Receiver format

Use [the README](README.md#try-it) to start the included WebSocket receiver.

A subtitle event contains a snapshot of the lines visible in **one frame**. Another tab or frame has its own sequence. A clear event has an empty `text` and `lines` list.

```json
{
  "type": "subtitle",
  "eventId": "42:document-uuid:7",
  "sequence": 7,
  "timestamp": 1750000000000,
  "source": {
    "tabId": 42,
    "frameId": 0,
    "documentId": "document-uuid",
    "url": "https://example.com/video"
  },
  "video": {
    "currentTime": 45.234,
    "duration": 3600,
    "paused": false,
    "url": "https://example.com/video"
  },
  "subtitle": {
    "text": "Hello\nBonjour",
    "lines": [
      {"text": "Hello", "track": 0, "area": "bottom"},
      {"text": "Bonjour", "track": 1, "area": "top"}
    ]
  }
}
```

`timestamp` is Unix time in milliseconds. `currentTime` and `duration` are seconds, or `null` when no suitable video is found. `track` comes from asbplayer's displayed line markup; `area` is `top` or `bottom`. `eventId` combines tab, document, and sequence to identify an event and can help remove duplicates from HTTP retries. There is no guaranteed delivery or replay after browser shutdown. Cue start and end are unavailable from the display event.

The receiver may also get:

```json
{"type": "connected", "timestamp": 1750000000000, "version": "1.1.0"}
{"type": "disconnected", "timestamp": 1750000001000}
{"type": "heartbeat", "timestamp": 1750000020000}
```

`heartbeat` is WebSocket only. A disconnect message may be missing if the browser or connection closes abruptly. Ignore event types you do not need.

## HTTP

Accept `POST` with a JSON body at the URL entered in the popup and return a 2xx response after processing. Requests are sent in order. The extension retries server errors and network failures, with a five-second request timeout; clients should handle possible duplicates by `eventId`. Client errors such as 400 stop retries for that event. The popup's status reflects the latest delivery.

## Native Messaging

Install and register a native host following [Chrome's guide](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging). The name in its manifest must match the popup setting, and `allowed_origins` must include this extension's ID. On Windows, the host manifest needs a registry entry and its `path` must point to a launchable program. On macOS/Linux, use an executable script or binary. [example_native_host.py](example_native_host.py) shows the protocol but is not an installer or a Windows launcher.

The host must read a four-byte native-endian length followed by that many UTF-8 JSON bytes. It must reply with the same framing to confirm the connection. Keep stdout for protocol data; log to stderr. The sample host prints subtitles to stderr and acknowledges messages.
