# RPS Hand

Rock-paper-scissors with real hand tracking: the camera tracks every finger joint of both hands and a 3D
hand copies the motion live in a room, with depth, physics and tilt levelling.

- **Live (phone, camera needed):** https://tagirz500.github.io/rps-hand/  (served from `docs/`)
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
