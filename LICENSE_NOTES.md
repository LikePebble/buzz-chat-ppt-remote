# License notes
This is a modified version of https://github.com/smilexizheng/mobile-pc-control-server by smilexizheng, under GNU AGPL-3.0. LICENSE.txt is preserved without modification. Original source and attribution remain in this repository; the upstream README is retained in docs/UPSTREAM_README.md.

The interaction implementation is newly written; no additional application source was copied. Existing Electron, Vue, Express, Socket.IO and qr-code-styling dependencies retain their own licenses. Dependency notices remain in installed/package dependencies.

Distributions must preserve notices and provide the corresponding source under AGPL-3.0. Network users must be offered the corresponding source for the version being run. The UI provides a source link and local /source download; packaging includes a source archive with source, lockfile, build configuration and documentation. If modifying/rebuilding, regenerate that archive using npm run build before distributing. No signing keys or runtime room/chat data belong in the source archive.

Frontend-bundled dependency notices are additionally included in THIRD_PARTY_NOTICES.txt (including qrcode-generator, used through the upstream QR library). Refresh these notices when updating frontend dependencies.

The optional Internet connector bundles Cloudflare's cloudflared 2026.9.1 darwin-arm64 binary under Apache-2.0. Its license is preserved in docs/CLOUDFLARED_LICENSE.txt and the packaged Resources directory; source and upstream attribution are available at https://github.com/cloudflare/cloudflared/tree/2026.9.1. The build verifies the official release archive SHA-256. This separate helper does not change the application's AGPL-3.0 license. The zoom guard was independently implemented using the interaction strategy of the user's internal ai-companion project; no third-party application source was copied.

Pretendard Variable v1.3.9 is bundled locally, unmodified, from orioncactus/pretendard under SIL Open Font License 1.1. The font and license are in src/renderer/interaction/fonts; the packaged app also includes Resources/Pretendard-OFL.txt.
