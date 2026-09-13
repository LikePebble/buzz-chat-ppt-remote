# macOS PowerPoint acceptance test

## Prerequisites

- Microsoft PowerPoint for Mac / Microsoft 365.
- Packaged Buzz Chat PPT Remote app, Accessibility permission and any requested Automation permission.
- Same trusted LAN/Wi-Fi for the Mac and test phones.
- A disposable test deck; do not run automation on personal work.

## Test Presentation

Create a disposable two-slide presentation. Put three objects on slide 1 and give each a separate **On Click** entrance animation. Slide 2 should clearly say NEXT SLIDE. Save it separately from real documents. Ensure the animations are not automatic or grouped into one click.

## Procedure

1. Launch Host app.
2. Verify server ready, actual LAN URL and scannable QR.
3. Verify Accessibility permission. Grant this package if necessary.
4. Launch PowerPoint and open only the controlled test presentation.
5. Start slideshow.
6. Press Host **다음 / 클릭**.
7. Confirm animation 1 appears without a slide transition.
8. Press again.
9. Confirm animation 2.
10. Press again.
11. Confirm animation 3.
12. Press again and confirm transition to slide 2.
13. Test 이전 (previous animation/slide semantics are PowerPoint-controlled).
14. Test 화면 검정; press again to restore. Repeat with both ABC and Korean 2-set input sources, recording each result. The implementation sends physical B key code 11; this alone does not prove PowerPoint accepts it under every input source. Also test other keyboard layouts used at the venue.
15. Test 슬라이드 쇼 종료.
16. Test 처음부터 시작.
17. Stop, select slide 2 in editing view, and test 현재부터 시작.
18. Join from a mobile phone and confirm connected presence.
19. Test BUZZ and verify one winner on both screens.
20. Enable auto advance.
21. Reset buzzer.
22. Buzz from the participant.
23. Confirm the winner appears first.
24. Confirm PowerPoint receives the next click afterward. Network display timing may vary; automated tests separately verify server broadcast-before-controller ordering.
25. Remove this app's Accessibility permission manually.
26. Confirm the Host shows a permission error and cannot issue input.
27. Confirm the app stays responsive and buzzer/chat remain functional; restore permission for further testing.

Record app commit/version, Mac chip, macOS, PowerPoint version, each result, and any prompt. An automated or mock PASS is not actual PowerPoint integration evidence.

## Dual-display / Presenter View

Connect a second display; run Presenter View with presentation on the external display. Repeat three animation clicks, next, previous, blackout, stop and both start modes. Confirm keys affect the slideshow rather than an editing pane. Return focus to another app before using a Host control and confirm the controller activates PowerPoint; do not type manually during the command. Repeat with mirrored displays if that is the intended venue setup.

## M1 ↔ M4 second-machine acceptance

Transfer the **same arm64 ZIP**, extract and launch. Check `file` on `Contents/MacOS/Buzz Chat PPT Remote` reports arm64. Grant local permissions, scan its newly generated LAN QR from two phones, buzz nearly simultaneously, reset and repeat, exchange chat/reactions, then run the full PowerPoint animation/Presenter View procedure above. Do not rebuild for the second chip. The original development machine's permissions and room token do not transfer.

## Development status

Implementation and mock/controller/integration tests are separate from actual input acceptance. PowerPoint was installed but not running in the implementation environment; no presentation was opened or modified and no real keys were sent. Complete this procedure before treating PowerPoint control as manually accepted.
