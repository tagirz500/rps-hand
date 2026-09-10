# Hands Lapse

Hand and head tracking from a phone camera, drawn as a 3D replica of your own hands and face: rock-paper-scissors
against a person or the computer, a revolver on a stand, targets, Spider-Man webs, a mask on your tracked head, and a
Dust II map you walk through with a finger joystick and head look.

**Live:** https://tagirz500.github.io/hands-lapse/ · map: https://tagirz500.github.io/hands-lapse/movement/?v=60

## Where it comes from

This is a fork of https://github.com/d14life/rps-hand merged with https://github.com/tagirz500/rps-hand, so one page
has both lines of work:

| From the fork (d14life) | From the original (tagirz500) |
|---|---|
| The hand model: fist prior, fold prior, knuckle spread, per-joint angle smoothing, the solid-hand solver (fingers cannot pass through each other or the palm), the forearm cut and capped at the wrist, thicker fingers, 480 px tracker input | Multiplayer with lobbies and quick match, the PC-screen link by 3-digit code and QR, mirror view, the CAM sliders |
| The head module `docs/head/`: a six-parameter perspective fit of the canonical face, used for both the mask and the map's head look | The revolver on its stand, bullseye targets, Spider-Man webs, the owner's mask on the tracked head |
| The movement build `docs/movement/` (Dust II, finger joystick, head look, v60) | Phone-as-camera for the map (`camlink.mjs`), the game rounds and scoring |

## The pages

| Page | Live link | What it is |
|---|---|---|
| **Hands** | https://tagirz500.github.io/hands-lapse/ | Camera + tracking on top, the 3D room below. Source: `docs/index.html` (one file), history in `HANDOFF.md`. |
| **Map** | https://tagirz500.github.io/hands-lapse/movement/?v=60 | Walking and turning in Dust II with a finger joystick and head look. Source: `docs/movement/`, history in `MOVEMENT_HANDOFF.md`. |

Both need a phone camera. On a PC choose **SCREEN**: the phone shows the camera and the PC shows the 3D view.

- **Online:** ONLINE = lobbies and quick match (no server: PeerJS broker + WebRTC). PC LINK = type the screen's 3-digit
  code on the phone. `HANDOFF.md` §28-29.
- **Head and mask:** the head is tracked by `docs/head/` and shown in the mirror view. `?maskscale=`, `?maskoff=x,y,z`
  (cm), `?maskrot=rx,ry,rz` (deg) fit it to your face; `?face=0` turns head tracking off.
- **Hand model:** the owner's rigged arms (`docs/arm_*.glb`); `?skin=armscan` uses the scanned skin, `?skin=0` the old
  capsule hand, `?col=0` turns the solid-hand solver off, `?hands=2` tracks both hands.
- **Handoff for a new session:** `HANDOFF.md` (everything), `CONTINUE.md` (paste-ready prompt).
- **Tests:** `web_test.py` (smoke), `web_hard_test.py` (real footage, metrics), `web_face_test.py` (head + mask),
  `web_gun_test.py` (revolver, targets, webs), `web_lobby_test.py` / `web_net_test.py` (online), `web_shot.py` (one
  screenshot). They need the test media from `fetch_test_media.py` and the system Microsoft Edge.

Layout: `docs/index.html` is the whole hand app. `docs/head/`, `docs/body/`, `docs/movement/` are modules. `docs/test/`
holds Wikimedia Commons test photos and clips (CC licences). `assets/` holds the MediaPipe model for the desktop app
(`rps_hand.py`).
