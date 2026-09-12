# Goal
Deliver a local Apple Silicon presentation audience MVP, with server-authoritative buzz ordering and a packaged Electron host.
# Existing Repository Architecture
Electron main/preload, Vue 3 renderer and mobile entry, electron-vite, Express, Socket.IO and qr-code-styling. Legacy main imports privileged remote-control services and native OCR/input/capture dependencies.
# macOS Porting Strategy
Add an isolated interaction main/preload/renderer entry in this repository. Preserve legacy source, but exclude it from the product runtime, dependency install and active TypeScript compilation. Remove chcp and native PC-control dependencies from the active package; preserve original manifest in docs/UPSTREAM_PACKAGE.json.
# Components Reused
Electron lifecycle/build architecture, Vue SFCs, Express static hosting, Socket.IO transport, qr-code-styling library, anonymous chat and presence concepts.
# New Components
Typed protocol, Room, interaction server, macOS and mock PowerPoint controllers, shared participant/host Vue dashboard and minimal trusted preload.
# Room Model
In-memory rooms, stable server-issued identities with private reconnect credentials, connected sockets, monotonic buzzer ranking, 50-message history, auto advance off by default.
# Socket Event Contract
/interaction namespace. room:join, host:join, buzz:press, buzz:reset, buzz:set-enabled, chat:send, reaction:send, room:set-settings, ppt:command. Typed acknowledgements and broadcasts. Every handler validates input; host operations require authenticated socket role.
# Participant Flow
Scan /r/:roomId; server issues anonymous identity stored locally; reconnect proves identity with secret; buzz once per round, chat, reactions.
# Host Flow
Desktop receives token only through sender-checked IPC; QR contains participant URL only. Separate optional host fragment link. Show status, users, ranking, settings and PowerPoint controls.
# PowerPoint Controller
Fixed osascript scripts via execFile; detect running, check Accessibility, activate and verify frontmost PowerPoint, send Space/Left/B/Escape/Command-Return variants. Bounded execution and serialized commands. No participant-controlled script strings.
# Security Boundary
Legacy server and IPC never imported. Default namespace rejects all clients. No legacy HTTP file endpoints. High entropy host and resume secrets never in public room state. Payload limits and per-identity rate limits.
# Test Strategy
Node test runner with tsx; unit tests, actual Socket.IO integration, 20/100-client two-round consistency tests, renderer and packaged Electron smoke tests. Real PowerPoint only in controlled context; otherwise read-only status.
# Packaging Strategy
electron-builder unsigned darwin-arm64 .app and zip; Electron 39 baseline macOS 12 retained. No Rosetta/native automation addons. Bundled license and corresponding source access.
# Risks
macOS Accessibility/Automation consent, PowerPoint focus/Presenter View, firewall/LAN routing, HTTP on trusted LAN, unsigned distribution and second-machine acceptance need separate evidence.
