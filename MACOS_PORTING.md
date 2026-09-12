# Environment
Audited 2026-09-12: arm64 macOS 26.6.2 (25G83), arm64 Node 22.22.0, npm 10.9.4, Git 2.50.1, gh 2.86.0. PowerPoint installed. Hardware acceptance on a second Mac remains separate.
# Existing Architecture
Upstream smilexizheng/mobile-pc-control-server at 3fbe73870328d23c6a43d502e992dbcc9ecd4243. Electron 39, electron-vite 5, Vue 3, Express 5, Socket.IO 4. No repository agent/contributing instructions or tests found. CI targets Windows.
# Works on macOS As-Is
Vue, Socket.IO, Express, QR rendering and Electron arm64 distribution are portable concepts. Existing full application macOS support was unproven.
# Windows-Specific Components
Default dev script uses chcp. Legacy system.ts executes shutdown/shell commands. FFmpeg capture uses gdigrab and ffmpeg.exe assumptions. win-api.ts contains commented user32/kernel32 bindings. Default privileged token is ssss. Generic input, screen capture, scheduling, file transfer and broad IPC are outside MVP.
# Required Changes
Use isolated interaction entry and minimal preload; do not register legacy handlers. Keep legacy source for reference. Active dependency manifest only installs product dependencies (original manifest preserved). Bind audience server to 0.0.0.0 and renderer development server to loopback. Dedicated arm64 packaging and strict product typechecks.
# Native Dependencies
Legacy nut-js, screenshot modules, loudness, sharp, decibri and sherpa-onnx are not loaded or installed by this product. Electron and build-tool arm64 binaries remain; automation uses built-in osascript. No x64/Rosetta requirement.
# Accessibility Permissions
Electron systemPreferences.isTrustedAccessibilityClient(false) checks status; user-triggered true requests consent. System Settings link is fixed. AppleScript System Events can additionally require Automation consent. Never claim consent or real command testing from mock success.
# PowerPoint Control Strategy
Fixed scripts, execFile argument array, running detection before activation, verify frontmost process, fixed Space/Left/B/Escape/Command+Shift+Return/Command+Return. Timeout and busy rejection bound execution; winner broadcast precedes asynchronous automation.
# Packaging Risks
Unsigned local arm64 artifact, no notarization. Keep Electron 39 supported macOS 12 baseline. Packaged permissions differ from Terminal/dev Electron. Same artifact intended for M1/M4; only current hardware can be verified here.
# Decisions
Preserve upstream source and AGPL notices, isolate runtime instead of porting unrelated PC automation. Keep Electron/Vue/electron-vite/Express/Socket.IO/QR stack. No database/cloud. See PLAN.md and README for active paths and validation.
