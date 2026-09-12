# Validation record

## Buzzing 1.0.0 final polish and code review (2026-09-13)

These results supersede the older LAN-only, top-10 and tunnel-host-denial behavior described below.

- Workbook vocabulary: `회원이름_조합단어_2차.xlsx`, Sheet1 B2:B154 and C2:C314. Deduplication gives 152 adjectives and 313 nouns; 46,138 adjective-space-noun combinations fit the existing ten-character limit. Tests cover every combination, 5,000 unique automatic names, pool exhaustion and identity/name preservation on reconnect. The original workbook is not modified or required at runtime.
- UI review uses the requested ui-ux-pro-max web form-validation and heading-hierarchy guidance. Pretendard Variable v1.3.9 is bundled locally with OFL notices. Improvements include semantic color tokens, visible focus, inline nickname validation, a compact nickname editor, differentiated round actions, bounded ranking/presence scrolling, and explicit PPT controller state.
- Code review: inspected the accumulated protocol, host/participant authorization, round state, reconnect behavior, tunnel lifecycle, source packaging, renderer and new vocabulary path. Corrected the long disconnected-status layout and clarified nickname whitespace validation text. No remaining blocking finding was identified in this review; this is not a claim of exhaustive security auditing.
- Lint and strict node/web typechecks passed. Automated tests: 36/36 passed. Real Socket.IO load tests with 20 and 100 clients passed two rounds each, recording every participant and one immutable winner.
- Hidden Electron rendering of the actual production web build with an isolated mock PPT controller passed: local Pretendard loading, one participation link, nickname validation/save, first/all modes, complete reset, participant PPT delegation/revocation, mock PPT command, reduced motion and no page errors. Layout checks at 375px portrait, 812px landscape, 768px host and 1440px host had no horizontal overflow; visible buttons were at least 46px high. Disconnected mobile status also fits at 375px.
- Measured contrast: body text 15.98:1, secondary text on canvas 5.44:1, winner text 15.98:1, lime on forest 14.14:1, control border on white 3.05:1.
- The screenshot uses test participants and the mock controller. No user-facing app window, public tunnel, physical phone session or actual PowerPoint slide was opened for this final visual check. Real phone gesture behavior and real PPT/Accessibility acceptance remain distinct manual checks.
- Earlier functional updates included in this version: one advertised participant URL, first/all buzzer modes, complete round reset with stale-request rejection, editable names, exclusive participant PPT delegation, token-authenticated Internet host control, pointer-down buzz input, double-tap/pinch guards, Buzzing branding and explicit Dock icon loading.

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

## Internet participation and mobile behavior update (2026-09-12)

The earlier sections describe the original LAN-only build. The working-tree update adds opt-in temporary Internet participation, automatic Accessibility request on an untrusted non-mock startup, and the mobile fixes below.

- Lint and node/web typecheck: PASS. Automated tests: 27/27 PASS, including tunnel start/cancel/error/timeout, public participant vs host authorization, new-round UI state and zoom event handling.
- A real cloudflared 2026.9.1 tunnel carried HTTPS/WSS to the local mock-backed server. Two clients joined through the public URL, exchanged chat, buzzed, received a host reset and buzzed in the new round. Public host authentication with a valid host token was rejected and the public host page returned 404. Tunnel was stopped afterward. No real PowerPoint commands were issued.
- The current Mac's default DNS returned ENOTFOUND for new trycloudflare hostnames. Cloudflare and Google public DNS resolved them after propagation; the successful integration run used public DNS answers for its request-local lookup, with ordinary TLS certificate verification retained. System DNS settings were not changed. This was a real public network path, not a physical phone-on-cellular test.
- Chromium reproduced the reset design defect: sticky hover changed the fresh button from `rgb(223, 255, 89)` to `rgb(238, 242, 223)`. After the targeted CSS override, the post-reset background remained `rgb(223, 255, 89)`. Winner/non-winner round-reset state tests also pass.
- The internal ai-companion_sub viewport/CSS/zoom-guard strategy was inspected and independently adapted. Multi-touch, Safari gesture and Ctrl-wheel events are prevented; single-touch and normal wheel scrolling are preserved. Native iPhone Safari gesture testing remains unperformed.
- Accessibility requests use the existing macOS API on startup when permission is absent, once per app launch. This requests a user grant; it does not programmatically enable protected OS permission settings.
- Internet participation is temporary and off by default. Cloudflare Quick Tunnel availability/limits apply; this is not a permanent cloud room service. LAN host/PPT control is retained.
