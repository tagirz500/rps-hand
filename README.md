# RPS Hand

Rock-paper-scissors with real hand tracking: the camera tracks every finger joint and a 3D hand copies the motion live.

## Two versions live on this repo (GitHub Pages from `docs/`)

| Version | Who | Live link | What it is |
|---|---|---|---|
| **Hand** (build 33) | Claude | https://d14life.github.io/rps-hand/ | The tracked 3D hand (owner's rigged arms model), first person + mirror view, solid-hand solver, and a pistol on a table you can pick up and shoot. Source: `docs/index.html`, `docs/gun.mjs`, `docs/arm_*.glb`. History: `HANDOFF.md`. |
| **Movement** (v60) | Codex | https://d14life.github.io/rps-hand/movement/?v=60 | Walking and turning in a 3D map with a camera thumb joystick and head look. Source: `docs/movement/`. History: `MOVEMENT_HANDOFF.md`, review notes in `CODEX_HAND_REVIEW.md`. |

Both pages need a phone camera. The two are developed in the same repo but independently: Claude publishes hand builds
on top of the latest `docs/movement`, Codex publishes movement versions without touching the hand files.

- **Original repo:** https://github.com/tagirz500/rps-hand (this fork is https://github.com/d14life/rps-hand)
- **Desktop app:** `rps_hand.py` (Python + MediaPipe + pygame/OpenGL), build commands in `HANDOFF.md` §4
- **Handoff for a new AI session or person:** `HANDOFF.md` (everything), `CONTINUE.md` (paste-ready prompt)
- **Online:** ONLINE = random opponent (no server: PeerJS broker + WebRTC), PC LINK = the phone's 6-digit code turns a PC browser into its 3D screen (`docs/net.mjs`, HANDOFF §27)
- **Tests:** `test_rps_hand.py` (desktop), `web_test.py` (web smoke), `web_hard_test.py` (real footage,
  metrics; needs the test media from `fetch_test_media.py` and the system Microsoft Edge), `web_shot.py` (one screenshot)

The 3D hand is the owner's hand scan (`hand1.OBJ`), decimated, rigged to the 21 MediaPipe joints and driven with the
tracked bone lengths (`docs/hand.glb` + `docs/hand.json`, pipeline in `HANDOFF.md` §22); `?skin=0` shows the old capsule hand.
In first-person view, point with the index finger and pull/push/drag to move and turn.

Layout: `docs/index.html` is the whole web app (one file). `docs/test/` holds Wikimedia Commons test photos
and clips (CC licences; two big ones are git-ignored). `assets/` holds the MediaPipe model for the desktop app.
