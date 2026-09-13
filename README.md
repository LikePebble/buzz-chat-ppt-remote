# Buzzing 1.0.0

A presentation audience system for Apple Silicon. Run the Electron host on your Mac; participants scan a QR code and use their phone browser. Participants can use the same LAN or an optional temporary HTTPS Internet link. No participant installation, account or database is required; optional Internet transport uses Cloudflare.

## What it does

- Editable nicknames (1–10 Unicode characters), stable identity on reconnect, large touch buzzer, first-winner result and full ranking.
- Default names combine the supplied workbook's 152 distinct adjectives and 313 nouns. Only 46,138 combinations that fit ten characters (including the space) are used; automatic names avoid existing room members' names. Reconnection preserves the current name.
- Pretendard Variable is bundled for offline use. The host and participant views share color, typography, focus and motion rules; nickname editing is collapsible and shows inline validation.
- Room-scoped text chat (300 characters, last 50 messages) and live 👏 ❤️ 😂 🔥 👍 reactions.
- Host QR, one active LAN/Internet participant address, presence, reset/enable/disable, optional LAN/Internet mobile host link.
- PowerPoint next animation/slide, previous, black screen, stop, start from beginning/current.
- Optional winner auto advance, OFF by default; winner is committed and broadcast before automation.

## Architecture

Upstream Electron + Vue 3 + electron-vite + Express 5 + Socket.IO 4 + qr-code-styling are retained. The isolated `src/interaction` runtime replaces the product entry, not the framework. Legacy source remains for reference and is **not registered, loaded, bundled or typechecked** by the new product. Its original manifest and README are in `docs/UPSTREAM_PACKAGE.json` and `docs/UPSTREAM_README.md`.

`Room` stores identities, connection sets, buzzer rounds, chat and settings in memory. `/interaction` uses the shared protocol in `src/interaction/protocol.ts`. The default namespace rejects connections. The PowerPoint controller uses fixed AppleScript through `execFile`; the mock implements the same interface.

## Supported Environment

- macOS on Apple Silicon: one `darwin-arm64` artifact for M1 and M4.
- Electron 39.2.7; macOS 12 minimum configured, inherited from the Electron 39 baseline. Only the actual tested environment is claimed below.
- Development verified on Apple M4, macOS 26.6.2, Node 22.22.0 arm64, npm 10.9.4.
- Microsoft PowerPoint for Mac / Microsoft 365 required for actual presentation control.
- Intel, Windows, universal builds and a permanent cloud-hosted room service are outside MVP scope.

## Requirements

Node 22.12+ running natively as arm64 and npm for development/building, PowerPoint for presentation controls. Phones need either the same trusted LAN or an Internet connection when Internet participation is enabled. Accessibility permission and, where prompted by macOS, Automation permission are needed for System Events/PowerPoint. Development and packaging fetch a pinned, SHA-256-verified arm64 cloudflared binary; packaged users do not need to install it separately.

## Install

```bash
git clone https://github.com/LikePebble/buzz-chat-ppt-remote.git
cd buzz-chat-ppt-remote
git switch feature/buzz-chat-ppt-remote-macos
node -p 'process.arch'  # must print arm64
npm ci
```

## Development

```bash
npm run dev
```

Electron starts Express on `0.0.0.0:3210`. If 3210 is occupied, it chooses a free port and displays that actual port. Vite listens on loopback only; Express proxies the current development frontend for phones. No `chcp`, Rosetta, FFmpeg, native input, OCR or screen capture packages are needed.

The development proxy allows only the active renderer, its shared protocol and Vite runtime/dependency modules. Arbitrary workspace files and legacy pages are blocked. Desktop HMR can use Vite's direct loopback fallback; LAN phones need a manual page refresh after edits because the proxy does not expose Vite's WebSocket. The source-download link rebuilds an archive of the current working files on request in development; local review reports are excluded. A missing packaged source archive reports an error instead of linking to a potentially different branch version.

For safe simulated presentation testing:

```bash
BUZZ_MOCK_PPT=1 npm run dev
```

The Host shows `MOCK`; mock success is never evidence of actual PowerPoint input.

## Build for Apple Silicon

```bash
npm run build:mac:arm64
```

Produces:

- `dist/mac-arm64/Buzzing.app`
- `dist/Buzzing-1.0.0-arm64.zip`

Local ad-hoc signed development packaging (no Developer ID); no paid Developer ID/notarization needed. No x64 build is produced. `npm run build` also generates the corresponding-source archive shipped with the app.

## Run

```bash
open 'dist/mac-arm64/Buzzing.app'
```

Or run the production build from the checkout:

```bash
npm run build
npm start
```

Extract the ZIP before launching. If macOS blocks a downloaded unsigned app, use Finder's contextual Open and the per-app Privacy & Security → Open Anyway flow if offered. Do not disable Gatekeeper globally. The package may need its own Accessibility grant even when development Electron/Terminal is already trusted.

## Participant Flow

1. Scan the participant QR. An HTTPS Internet link works from another Wi-Fi or mobile data; a LAN HTTP link requires the same Wi-Fi as the Mac.
2. An anonymous nickname appears and the connection indicator changes to 연결됨.
3. Press BUZZ once per round. The server determines the winner; later presses still fill the ranking.
4. Send text or emoji reactions. Wait for a new round to buzz again.
5. Refresh/reconnect retains identity and round participation if browser storage is available. No secure-context-only random API is needed over LAN HTTP; identities and private resume keys are generated by the server.

Nicknames can be registered or changed in the participant view, with server-side validation. Renaming preserves identity and previous buzz acceptance.

## Host Flow

1. Launch the app; a room and private host token are generated automatically.
2. Choose a Wi-Fi LAN address, or click **인터넷 참여 켜기** to generate an external HTTPS participant link and automatically select its QR. Keep the Mac and app running. Turning Internet participation off ends that external connection.
3. Watch connected users and ranking; use 새 라운드 and 버저 끄기/켜기. 라운드 완전 초기화 resets the displayed round to 1, clears results and reopens the buzzer while preserving participants, chat and the selected mode.
4. Open PowerPoint and a controlled slideshow; use the remote controls.
5. Optionally enable 우승자 결정 후 자동으로 다음 / 클릭. Failures are shown separately; the winner remains valid.
6. Optional phone host: copy **호스트 링크**, open it on the host's phone. With Internet participation enabled, the HTTPS host link also works remotely; a valid host token is required. The token is in the fragment, then kept in sessionStorage and removed from the address bar. Treat this link as a password; never share it with participants. It expires when the Mac app restarts.

In 함께하는 참가자, the host can grant PPT 제어권 to one participant. Granting it to someone else replaces the previous holder; 제어권 회수 or that participant's final connection closing revokes it. This grants only PPT commands/status, not host settings or delegation rights.

Closing the host window quits the app and clears rooms/chat. No disk persistence.

## PowerPoint Setup

The Mac controller detects PowerPoint before activation and verifies that PowerPoint is frontmost before issuing a fixed key. Commands have a 5-second process timeout. Concurrent presentation commands are rejected instead of accumulating a queue.

| Control | Key |
| --- | --- |
| 다음 / 클릭 | Space: next animation or next slide |
| 이전 | Left Arrow |
| 화면 검정 | B (toggle) |
| 슬라이드 쇼 종료 | Escape |
| 처음부터 시작 | Command + Shift + Return |
| 현재부터 시작 | Command + Return |

Mappings follow [Microsoft's presentation shortcut documentation](https://support.microsoft.com/en-au/office/use-keyboard-shortcuts-to-deliver-powerpoint-presentations-1524ffce-bd2a-45f4-9a7f-f18b992b93a0). Test against your slideshow/Presenter View before an event. The controller does not inspect or change slide contents. Do not use next/previous/blackout in an editing document; these are slideshow controls.

## Accessibility Permission

The Host shows PowerPoint running status and Accessibility status. On startup, an untrusted non-mock Mac app automatically invokes the macOS Accessibility request once. macOS still requires the user to grant the actual app under System Settings → Privacy & Security → Accessibility; the app cannot enable the switch itself. The **권한 요청** and **시스템 설정 열기** buttons remain available. If macOS asks for Automation access to System Events/PowerPoint, allow it for this host. Refresh status after changing permissions; restart the app if macOS requires it. The periodic status poll does not repeatedly prompt.

Electron's [documented Accessibility API](https://www.electronjs.org/docs/latest/api/system-preferences#systempreferencesistrustedaccessibilityclientprompt-macos) is used. The ready indicator means running + Accessibility permission; it does not prove a slideshow is open or that Automation consent has already been granted.

## Buzz Ordering

**The first valid event received by the Host server wins.** The buzzer now sends on primary pointer-down, avoiding finger-release/click timing differences. Double-tap zoom is suppressed while normal scrolling and repeated control-button taps remain available. Keyboard activation still works. Arrival-order tests alternate the winning participant independently of join order; they do not prove physical simultaneity or fairness between networks. A consistently faster network path can still win more often. No untrusted client timestamp compensation or randomized winner is applied. Client timestamps are rejected. `process.hrtime.bigint()` records monotonic receipt time; synchronous sequence assignment breaks ordering without async work. Each identity can buzz once per round, stale round IDs are rejected, and the winner never changes until reset. In 전체 순위 버징 mode, ranking includes every accepted participant; 1명 선착순 mode closes after the winner. Deltas are relative to the first event, rounded in the UI. Wi-Fi/device latency affects ordering; this is not a fairness measurement.

## Network

Express binds `0.0.0.0` for LAN use. Internet participation is off by default and can be enabled from the desktop. A bundled cloudflared process opens an outbound HTTPS/WSS tunnel, so other Wi-Fi/mobile-data participants need no port forwarding or VPN app. The app terminates its tunnel when Internet participation is stopped or the app exits; the next start can produce a different URL. Localhost is never offered as a participant QR. Only one participant URL is advertised: the Internet URL when ready, otherwise the first available LAN address.

This uses [Cloudflare Quick Tunnels](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/trycloudflare/), intended for temporary testing with no uptime guarantee and a 200 in-flight request limit. It is not a permanent hosted service. If the link fails with a DNS error on a particular Wi-Fi/VPN, try mobile data or the LAN link on the same Wi-Fi; the app does not change system DNS settings. Different networks introduce different latency, and the server still orders buzzes by arrival time.

Pinch zoom is disabled using the same viewport/CSS/gesture strategy as the internal ai-companion project. Single-finger and normal wheel scrolling remain enabled.

## Security

- LAN HTTP is unencrypted; use a trusted network. Use the app's Internet participant link for external access rather than forwarding the local server port. Remote host controls require the private host link and its token.
- A cryptographic 256-bit host token is delivered to the desktop only through sender/frame/URL-checked IPC. It is absent from public state and participant QR.
- Server-authorized host reset/settings/PPT commands, fixed command allowlist, strict payload fields, 8 KB transport limit.
- Reconnect identity needs a private 256-bit resume key. Public participant IDs cannot be impersonated using only room state.
- Chat: 5/10 seconds per identity; reactions: 5/second; packet flood limit: 80/second per socket; host commands: 12/second plus a single active PPT command. Chat is Vue-interpolated plain text, never raw HTML.
- Legacy remote commands, file download/transfer, shell, keyboard/mouse, shutdown, scheduling and the `ssss` token are not part of this runtime. Default Socket.IO namespace is denied.
- Anonymous visitors can create fresh identities by clearing storage; this MVP does not provide account-based anti-abuse. A room retains at most 5,000 identities until restart. Presence counts sockets immediately; transient disconnects may briefly lower the count.

## Testing

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

Strict TypeScript checks apply to all active product code and tests; legacy-only files are preserved and excluded. Tests use the Node test runner with tsx and actual loopback Socket.IO clients. They cover ordering, duplicate/stale rounds, multi-room isolation, host permissions, input validation, chat, reactions, reconnect, fixed-key controller, automation failure isolation and nested web routes/source access.

The fork's PR/manual GitHub workflow validates/builds on the `macos-15` arm64 runner; it does not publish a release. See [GitHub runner reference](https://docs.github.com/en/actions/reference/runners/github-hosted-runners).

## Load Test

```bash
npm run test:load
```

Runs 20, then 100 clients, two rounds each. Asserts a single immutable winner, unique ranking entries, all valid buzzes accepted, duplicate rejection and working reset. It tests consistency/stability, not network fairness.

## macOS PowerPoint Manual Test

Follow [docs/MACOS_POWERPOINT_TEST.md](docs/MACOS_POWERPOINT_TEST.md), including click-triggered animations and dual displays. See [docs/VALIDATION.md](docs/VALIDATION.md) for what was actually tested and what remains blocked.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| Phone cannot connect | Same Wi-Fi; avoid guest/AP isolation; keep host running; use displayed current port. |
| Wrong LAN IP / VPN | Enable Internet participation, or disconnect VPN and restart the app on Wi-Fi. |
| macOS Firewall | Permit incoming connections for this app if macOS asks; do not disable the firewall globally. |
| PowerPoint not running | Open PowerPoint yourself and prepare a test presentation. |
| Accessibility missing | Grant the actual packaged app; dev permissions may not carry over. |
| Command failed despite Accessibility | Check Automation consent, active slideshow and Presenter View; refresh status. |
| QR points to localhost | Product does not generate a localhost QR; connect to Wi-Fi and restart when no LAN address is available. |
| Page blank after local edits | Rebuild. Nested routes require the HTML root base and matching same-origin CSP; regression test covers this. |
| Reconnected but room missing | Host restarted: scan its new QR. |

## License

AGPL-3.0. Derived from [smilexizheng/mobile-pc-control-server](https://github.com/smilexizheng/mobile-pc-control-server). Original license and attribution are preserved. See [LICENSE.txt](LICENSE.txt) and [LICENSE_NOTES.md](LICENSE_NOTES.md). Every participant has a `/source` download link for the bundled corresponding source; rebuilding regenerates it. Dependency notices remain with their respective packages.
