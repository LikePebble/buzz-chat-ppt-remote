# Validation record

Environment: Apple M4, macOS 26.6.2 (25G83), native arm64 Node 22.22.0, npm 10.9.4, Electron 39.2.7. Date: 2026-09-12.

## Implemented

Isolated Electron/Vue/Express/Socket.IO product, server-issued anonymous identities with private resume credentials, host auth, monotonic buzzer ordering/top 10, chat/reactions, host dashboard/mobile view, fixed-script macOS PowerPoint and mock controllers, auto advance, source download, ad-hoc signed arm64 build.

## Automated testing

All 14 tests passed after the nested-path asset/CSP regression was corrected. Final npm ci reproduced the lockfile installation; strict node/web typechecks and lint passed without warnings.

20-client load: two rounds, all 20 accepted, one winner, 10 unique ranked entries, reset works (9/9 ms observed).
100-client load: two rounds, all 100 accepted, one winner, 10 unique ranked entries, reset works (104/90 ms observed).
Times are local consistency-test observations, not fairness/latency guarantees.

## Real UI checks

Production Electron Host showed connected status, LAN QR, address selection, participant count, PowerPoint not running and Accessibility allowed. In-app browser at 390px width: anonymous join, BUZZ winner, HTML-shaped chat rendered literally and delivered to Host, reaction input, host reset to round 2, second round, refresh retaining identity/winner, and host disable reflected on participant. No actual iPhone/Safari or physical multi-phone test is claimed.

## PowerPoint

IMPLEMENTED and AUTOMATED TESTED using mock and injected script runner. Development Electron Accessibility check returned true. Read-only actual PowerPoint running detection returned false. No personal presentation was opened or changed and no real PowerPoint key command was executed. Actual animation, Presenter View, and Automation consent acceptance remain BLOCKED pending a controlled open test presentation. The ad-hoc signed packaged app independently reported Accessibility allowed. No OS permission was changed by this work.

## Final checks

- Install (`npm ci`): PASS.
- Lint: PASS, no warnings. Strict node/web typecheck: PASS.
- Node tests: PASS, 14/14 including real Socket.IO and web-route integration.
- 20/100-client load: PASS, two rounds each.
- Production build and darwin-arm64 ZIP: PASS.
- Packaged executable: Mach-O arm64. `codesign --verify --deep --strict`: PASS with local ad-hoc signature; no Developer ID/notarization.
- Packaged .app: actual startup, server, host authorization, QR, LAN URL, participant page and status display: PASS. LAN health and bundled `/source` download: PASS.
- Packaged mock controller: manual advance and winner auto advance via real UI: PASS; observed log order was buzz winner then ppt command.
- Final `npm run dev`: Host and participant frontend through the Express proxy both displayed and connected.
- Actual PowerPoint animation/input acceptance: BLOCKED by absence of an open controlled slideshow; not manually tested.
- Physical M1 and phone Safari/dual-display tests: not performed; use MACOS_POWERPOINT_TEST.md.

The first completely unsigned bundle booted locally but failed signature verification. Ad-hoc signing plus the app-scoped library-validation entitlement corrected the packaged runtime and signature checks. Final documentation/license-only packaging refreshes preserve the tested executable code. Build artifacts are local and excluded from Git. No upstream push, release publication, deployment or user document changes are part of this validation.
