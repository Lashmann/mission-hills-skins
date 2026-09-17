# _AGENDA — Mission Hills Skins

_Living agenda for the golf-trip scorer. Created 17-09-2026. Trip: Sat 28 Nov – Sat 5 Dec 2026, five rounds (Annika · Ozaki · Olazabal · Vijay · Norman), Wednesday off. Live: https://lashmann.github.io/mission-hills-skins/_

## Open

1. ➡️ **Install on every phone before Sun 29 Nov** — open the link in Safari → Share → Add to Home Screen ("Open as Web App" on) → open it once from the home screen. After that no signal is needed. 👥 Founder + the 7
2. ➡️ **Real starting indexes and tees** — Commish → Handicaps (index per player, per round) and Round → Tees. Norman: only the Gold tee has a published slope; others off the card on the day. 👥 Founder
3. ➡️ **Trophy tie-break** — rules say "to be decided later". App shows "Ties on the trophy: to be decided". 👥 Founder
4. ➡️ **Unwon skins after round 5** — "TBD or cancelled". App shows the leftover pool; no rule applied. 👥 Founder
5. ➡️ **On request only — small adds** — whole-round hand-in in one QR (both groups from one phone); laptop multi-tab sync (a stale tab can overwrite a newer one — close extra tabs for now); "Reset to example" keeping the PIN. 👥 NFL, if asked
6. ➡️ **If 9 or 10 come (Wolfy / Blake)** — the draw accepts uneven groups; the ladder scales to N−1…0. Confirm that's what the committee wants. 👥 Founder

## Closed (dated)

### 17-09-2026
- ✅ **Rules closed with the Founder, logged only as told** — hole skins carry to the next hole; snake +1/hole cap 9, furthest first putt >6 ft holed, hole completed; birdie 1 / eagle = snake value (no reset), gross; ferret 2; LD every par 5, CP every par 3, 1 each, roll to next of kind; team-halved; ladder 7..0 ties split; unwon pooled per category, split evenly between next day's groups, halves fine, share sits on the first hole of its kind. Worked carry-over example reproduced exactly by the engine.
- ✅ **Engine** — `engine.js`, 57 Node tests (`node test/engine.test.js`): handicaps (GA/WHS daily formula), strokes by SI incl. plus-markers, Stableford, LD/CP fill-in, carry, snake cap, pick-up rule, ladder ties, undrawn rounds, frozen rounds.
- ✅ **Courses** — par + stroke index for all five, verified against 2+ sources each; five tee sets; Annika has 6 par 3s and 6 par 5s (real).
- ✅ **App v17g** — Board · Score (hole-by-hole + grid, points per hole) · Hand in (QR/link, in-app scanner, paste) · Commish (round/tees/slope override, LD/CP holes, lock, tap-to-place draw, index→playing handicap + override, carried pools + override, players, setup QR / standings link, PIN, data) · Rules (rulebook + "How the week runs"). Offline PWA, self-reload on update, visible version. Hosted on GitHub Pages, $0.
- ✅ **Test run with the Founder — PASSED end to end** (laptop commissioner, phone scorer): setup QR → load → PIN wall → 18 holes scored → hand-in QR → merge → second group typed on the master → ladder and day totals → carry into round 2 correct.
- ✅ Fixed during the test: undrawn rounds counted complete; tabs hidden in snapshot view; `0*` on unplayed rounds; dropdown draw → tap-to-place; iPhone storage isolation → in-app scanner.
