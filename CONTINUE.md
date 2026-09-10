# Paste this into a new Claude Code session to continue

```
Continue the Hands Lapse project. Repo: https://github.com/tagirz500/hands-lapse (on Tagir's PC it is
C:\Users\tagir\Downloads\rps_hand on branch hands-lapse; `origin` there is still tagirz500/rps-hand and `fork` is
d14life/rps-hand, whose main is merged into this branch).

Read HANDOFF.md completely before doing anything - it is the full history, design, gotchas, test harness,
metrics and the contract for the hand mesh. Sections 27-33 describe the current state (build 46 "Hands Lapse": the fork's hand model and head module inside our
app, plus multiplayer, lobbies, screen pairing by QR, the revolver, targets, webs and the mask) and the open problems;
§28-29 are the networking design, §33 is the merge with the fork. Then:

1. Run the test harness to get a baseline before changing anything:
     python -m http.server 8765 --directory docs      (in one terminal)
     python fetch_test_media.py                        (once; downloads the Commons test photos/clips into docs/test)
     python web_hard_test.py 18 all                    (needs the system Microsoft Edge; ~7 min)
     python web_lobby_test.py                          (lobbies + quick match, 4 players, first-person opponent hands)
     python web_link_test.py                           (screen pairing by code/QR, reloads, order independence)
     python web_gun_test.py                            (revolver on its stand, targets, webs, screen role)
     python web_face_test.py                           (head tracking + mask on photos, first person hides it, screen relay; face_*.png renders)
     python web_net_test.py                            (two players match, a PC screen links, one round over the wire)
     node --test docs/movement/*.test.mjs docs/test/*.test.mjs   (the fork's movement + the head/body unit tests)
   Numbers only compare between runs on the SAME PC (tracker fps differs per GPU), and the rps clip starts
   at a random point per run.
2. Work on mechanics (tracking precision, stability with two hands, height/depth, latency) and on the
   hand-scan mesh (HANDOFF §22: phone frame rate, skinning quality at bent joints, pointing-navigation gains).
3. Every change: rerun the harness, compare the numbers to the tables in HANDOFF §20 and §33, look at the
   hard_*.png frames, then push docs/ to main (GitHub Pages redeploys https://tagirz500.github.io/hands-lapse/
   in ~2 min; bump BUILD in docs/index.html so the phone readout shows the new build).
4. Report what changed in the numbers, not just what you edited.

Rules the owner has set: predict/smooth must not drift from the hand on fast moves; two hands must
interact (handshake) without jumping; the 3D lines must match the video lines exactly; tilt levelling must
make height right; no opponent hand for now; exact tracked geometry, never canonical.
```

The harness browser: Playwright's own Chromium is blocked on Tagir's PC; the harness launches the system
Edge (`channel="msedge"`, new headless) which runs the tracker on the real GPU at 30 fps (40-70 fps on D1's PC).
If `gh auth status` is not `tagirz500`, `git push origin` will be refused: push to a fork and open a PR instead.
