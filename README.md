# asbplayer Subtitle Streamer

Send subtitles shown by asbplayer to another program while you watch a video. The included Python receiver prints them in a terminal.

## Do you need it?

asbplayer already has two useful options:

- **Text as it appears:** turn on [Auto-copy current subtitle to clipboard](https://docs.asbplayer.dev/docs/reference/settings/) if your other program reads the clipboard.
- **A complete loaded subtitle track:** use asbplayer's [`get-subtitles` API](https://docs.asbplayer.dev/docs/reference/external-api/#get-subtitles). It returns cue text and real start/end times. It does **not** report which cue is currently on screen or send an event for each displayed line.

This extension sends displayed text to a WebSocket, HTTP, or native receiver without using the clipboard. It reads asbplayer's page elements, so changes to asbplayer's display markup may require an update here.

## Try it

You need Chrome 116 or newer (or a compatible Chromium browser), the asbplayer extension, and Python with the `websockets` package.

1. Download this repository.
2. Open a terminal in its folder and run:

   ```sh
   python -m pip install websockets
   python example_receiver.py
   ```

   On Windows, use `py` in place of `python` if needed. Leave the receiver running.

3. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and select this folder.
4. Open this extension's popup. Use **WebSocket** at `ws://localhost:8767`, click **Save Settings**, then **Try Connecting**. The popup should say **Connected**.
5. Open a video with asbplayer subtitles, make the subtitles visible on the video, and play. Existing visible text is sent when the page loads; later changes and subtitle clears are sent too.

The default receiver prints the subtitle text and the video's approximate playback time. It does not write files or create Anki cards.

## If it does not work

- **Disconnected:** check that `example_receiver.py` is running and the port matches. Click **Try Connecting**. WebSocket reconnection also retries automatically.
- **Connected, no text:** verify that asbplayer subtitles appear on the video page. Refresh that page after installing or reloading this extension.
- **Wrong settings:** change the fields and click **Save Settings**. **Try Connecting** also saves the displayed fields before testing.
- **HTTP status:** Connected means a POST succeeded. A bad response or timeout shows Disconnected and an error in the popup.
- **Native Messaging:** you must separately register a native host. The popup confirms connection only after that host replies.

For details, inspect the video page's console and the extension's service worker in `chrome://extensions`.

## What a receiver gets

Each change sends a complete snapshot of visible lines in that browser frame. An empty `subtitle.text` means the subtitles cleared. Events include the tab and frame IDs, track numbers, a sequence number, the page URL, and the current video time when a matching video can be found. See [the receiver format](EXAMPLES.md).

**No start/end cue times are sent.** Video time is only a sample taken when the display changes. If you need accurate cue timing, use asbplayer's `get-subtitles` API.

WebSocket and Native Messaging confirm that a message was handed to the local connection, not that your program processed it. HTTP awaits a successful response and sends events in order, but a retry after a network failure can duplicate an event. Use `eventId` to deduplicate if that matters. No old event backlog survives a browser shutdown; reconnecting asks the page for its current snapshot.

This extension runs on video pages where asbplayer may be used, including frames. It sends subtitle text and the page/frame URL to the destination you configure. Keep the default local URL unless you intend to send that information elsewhere. Closed shadow roots and display formats without the expected asbplayer containers cannot be read.

## Connections

| Type | Default | Receiver |
| --- | --- | --- |
| WebSocket | `ws://localhost:8767` | [example_receiver.py](example_receiver.py) |
| HTTP POST | `http://localhost:8080/subtitle` | Your JSON HTTP endpoint |
| Native Messaging | `com.subtitle.streamer` | A registered native host |

Only one type runs at a time. Port 8767 is for this project; asbplayer's own server normally uses 8766 and AnkiConnect normally uses 8765.

Run `node --test tests/extension.test.cjs` for the automated checks. Browser and asbplayer compatibility still need a real video-page check after upstream updates.

MIT license. Built for [asbplayer](https://github.com/asbplayer/asbplayer).
