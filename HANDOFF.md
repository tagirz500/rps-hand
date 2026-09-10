# RPS Hand — project handoff

Rock-paper-scissors game where the camera tracks every finger joint of the player's hand and a 3D hand
copies the motion live. Built 2026-09-10 by Claude for Tagir and his brother. This document is written so a
different AI model (or person) can continue the work with no other context.

Everything lives in `C:\Users\tagir\Downloads\rps_hand\` on Tagir's PC and in https://github.com/tagirz500/rps-hand.

> **Path note (2026-09-10, late):** the web app folder `web/` was renamed to `docs/` so GitHub Pages can serve it
> from the same repo as everything else. Every `web/` below now means `docs/`.

---

## 1. Goal, in the owner's words

> The interface is: you see yourself, and you see your opponent's 3D hand (just the wrist part) showing
> rock, paper, scissors. Two parts: (1) software that detects every part of every finger, how it moves and
> folds; (2) a 3D hand that exactly follows that motion. All hands are the same, size doesn't matter, only
> the exact motion. Later: apply skins to the hand. Main idea: play rock-paper-scissors with it, detecting
> rock/paper/scissors in any form. First, just build hand detection and the 3D recreation.

Later message from the owner, parked for after the current work:

> Instead of a 3D model, maybe cut everything out of the video except the hand. Could NVIDIA Cosmos do that?

Answer already given: Cosmos is a world-simulation / video-generation model family, not a segmenter, and
not real-time. The right tools are MediaPipe's multiclass selfie segmenter (body-skin class, masked to the
hand's bounding box from the landmarks) for live in-browser cutouts, and SAM 2 for high quality offline.
Tradeoffs: a cutout is flat (no skins, hands no longer "all the same") and must be streamed as video to an
opponent, whereas the 3D approach only sends 21 points per frame. No decision has been made yet.

## 2. What exists and works

| Deliverable | Path | Status |
|---|---|---|
| Desktop app source | `rps_hand.py` | Working, self-check passes |
| Desktop exe, single file | `dist/RPSHand.exe` (243 MB) | Working. ~15 s startup (self-extracts each launch) |
| Desktop exe, folder | `dist/RPSHand-folder/RPSHand-folder.exe` (582 MB folder) | Working. ~5 s startup |
| Web app (for phones) | `web/index.html` | Working, live |
| Live URL | https://tagirz500.github.io/rps-hand/ | GitHub Pages, deploys from `main` in ~30 s |
| Public repo | https://github.com/tagirz500/rps-hand | Only the `web/` folder is in git |
| QR code to the URL | `qr.png` | Sent to the owner |
| Self-check | `test_rps_hand.py` | Runs the script or an exe headless on a photo |
| Model | `assets/gesture_recognizer.task` (8.4 MB) | Google's canned gesture model, bundled into the exe |
| Sample photos | `assets/victory.jpg`, `thumbs_up.jpg`, `pointing_up.jpg`, `thumbs_down.jpg` | From Google's MediaPipe samples |

The desktop exe has NOT been tried with a real webcam by a human yet, and the web page has NOT been tried
on a real phone by a human yet (see the hardware gotcha in section 7). Everything else is verified.

## 3. How it works (both versions share the same design)

**Tracking.** MediaPipe's `GestureRecognizer` task, VIDEO running mode, one hand. Per frame it returns:
- 21 image landmarks (normalised 0..1, used for the on-camera overlay),
- 21 world landmarks (metres, origin at the hand centre, used to drive the 3D hand),
- a canned gesture label: `Closed_Fist`, `Open_Palm`, `Victory`, `Pointing_Up`, `Thumb_Up`,
  `Thumb_Down`, `ILoveYou`, `None`.

**Gesture → move.** `Closed_Fist`→ROCK, `Open_Palm`→PAPER, `Victory`→SCISSORS. If the label maps to
nothing, a fallback counts extended fingers (a finger is extended when its tip is further from the wrist
than its middle joint): 0 → ROCK, 4 → PAPER, index+middle only → SCISSORS, anything else → no move. This is
what makes sideways or sloppy gestures still work.

**3D hand.** No rigged mesh, no asset. The hand is drawn procedurally from the landmarks:
- **Retargeting**: walk the skeleton tree from the wrist, keep each bone's *direction* from the tracked
  landmarks but replace its *length* with a fixed canonical length (table in code). Result: every player's
  hand renders identically sized, only motion is copied. Exactly what the owner asked for. Then the palm
  centre is moved to the origin, so hand translation in the frame is ignored (only pose and orientation).
- **Drawing**: one capsule per bone (cylinder + spheres at the joints), thicker for thumb and palm bones,
  a two-sided filled polygon for the palm, and a forearm capsule pointing from the wrist away from the
  middle-finger knuckle. Flat skin-coloured material. Grey when no hand is visible (last pose is kept).
- **Coordinates**: MediaPipe world landmarks are x right, y down, z away from camera. Converted to GL as
  `(x, -y, -z)` on desktop (frame is flipped before detection) and `(-x, -y, -z)` on web (video is
  mirrored with CSS instead). Both give a mirror-consistent selfie view.
- **Smoothing**: exponential, new pose weighted 0.55.

**Skeleton.** MediaPipe indices: 0 wrist; thumb 1-4; index 5-8; middle 9-12; ring 13-16; pinky 17-20.
`PARENT` maps each joint to its parent (all finger bases parent to the wrist). Palm edges 5-9, 9-13,
13-17 are drawn but are not part of the tree.

**Game.** PLAY / SPACE starts a 3-second countdown, then the current move is locked, the computer picks
randomly, the result shows for 3 seconds, score is kept. No networking, no second player yet: the 3D hand
currently mirrors *your own* hand, standing in for the opponent view.

## 4. Desktop version (`rps_hand.py`)

- Python 3.13, `mediapipe 1.0.1`, `opencv-python 5.0`, `pygame 2.6`, `PyOpenGL`, `pyinstaller`.
  MediaPipe 1.0 still uses the Tasks API at `mediapipe.tasks.python.vision`.
- One pygame window 1280×720 with an OpenGL context. Left half: the camera frame uploaded as a texture,
  with HUD text drawn onto the frame by OpenCV. Right half: the 3D hand in legacy immediate-mode OpenGL
  with GLU quadrics (works on any Windows GL driver, no shaders).
- Keys: SPACE play, ESC quit.
- CLI: `--source <camera index | video path | image path>` (default camera 0);
  `--shot <png>` renders 45 frames then saves the window to that PNG plus a sidecar `<png>.txt` with
  `gesture=… move=…` and exits. The sidecar exists because a `--windowed` exe has no stdout.
- Crash handling: any exception is written to `rps_hand_error.log` next to the exe/script and shown in a
  Windows message box when frozen.

Run from source:
```
python rps_hand.py
python rps_hand.py --source assets/victory.jpg --shot out.png
```

Build (both variants were built with these exact commands):
```
python -m PyInstaller --noconfirm --clean --onefile --windowed --name RPSHand --add-data "assets/gesture_recognizer.task;assets" --collect-all mediapipe rps_hand.py
python -m PyInstaller --noconfirm --onedir  --windowed --name RPSHand-folder --add-data "assets/gesture_recognizer.task;assets" --collect-all mediapipe rps_hand.py
```
`--collect-all mediapipe` is required or the frozen exe cannot find MediaPipe's binaries.
`--add-data` uses `;` as the separator on Windows. Build takes 3–5 minutes.

Test (script, or pass an exe path):
```
python test_rps_hand.py
python test_rps_hand.py dist/RPSHand.exe
```
Expected output: `OK gesture=Victory move=SCISSORS`. It asserts retargeting preserves bone lengths, the
finger-count fallback classifies synthetic hands, and a headless run on `victory.jpg` produces a PNG.
Always open the PNG and look at it; numeric checks passed in the past while a render was wrong.

Desktop-only gap: the landmark overlay / stats readout from section 5 is not in the Python version yet.

## 5. Web version (`web/index.html`)

Single file, no build step. Loads:
- `three@0.186.0` ES module from jsdelivr (import map),
- `@mediapipe/tasks-vision@1.0.1` `vision_bundle.mjs` from jsdelivr, WASM from the same package's
  `wasm/` folder,
- the gesture model from `https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/latest/gesture_recognizer.task`.

Layout: portrait = camera on top, 3D below; landscape = side by side (CSS grid + orientation media
query). Video is mirrored with `transform: scaleX(-1)`. Same logic as Python, ported to JS: `retarget`,
`moveFromLandmarks`, the game state machine. The 3D hand uses unit cylinders scaled per bone plus joint
spheres, a `BufferGeometry` palm fan, and `MeshStandardMaterial`.

Debug/testing aids added at the owner's request:
- A `<canvas id="ov">` overlay on the camera draws bone lines and joint dots from the image landmarks
  (fingertips yellow, wrist red). It has the same CSS as the video, so it aligns pixel-exact.
- `LineSegments` + `Points` with `depthTest:false` draw the skeleton on top of the 3D capsules.
- A readout `tracker: <ms> | <fps> | hands: <n>` under the move label.
- `?img=<file>` query parameter replaces the camera with a still image (must be same-origin). Used for
  headless verification: `https://tagirz500.github.io/rps-hand/?img=victory.jpg` must show
  `GESTURE: Victory` / `MOVE: SCISSORS`.

Delegate: tries `GPU` then falls back to `CPU`. Camera: `getUserMedia` with `facingMode:"user"`, 640×480
ideal. Camera access needs HTTPS (or localhost), which is why the page is hosted rather than opened as a
file.

Deploy: the `web/` folder is its own git repo (`main`, remote `origin` = the GitHub repo). Commit and push;
GitHub Pages rebuilds in about 30 seconds. `gh` CLI is logged in as `tagirz500` on this PC.

Verify a deploy headlessly (this is what was used, Python Playwright is installed with Chromium):
```
python - <<'EOF'
import asyncio
from playwright.async_api import async_playwright
async def run():
    async with async_playwright() as p:
        b = await p.chromium.launch(headless=True, args=["--use-gl=angle","--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"])
        pg = await b.new_page(viewport={"width":900,"height":600})
        await pg.goto("https://tagirz500.github.io/rps-hand/?img=victory.jpg", wait_until="load")
        await pg.wait_for_function("document.getElementById('move').textContent.includes('SCISSORS')", timeout=90000)
        print(await pg.inner_text("#top")); await pg.screenshot(path="web_check.png"); await b.close()
asyncio.run(run())
EOF
```
For a pre-push check, serve `web/` locally first (`python -m http.server 8765 --directory web`) and test
`http://localhost:8765/?img=victory.jpg`. Do not test from a `file://` URL: the image counts as
cross-origin for WebGL and MediaPipe throws a `texImage2D` SecurityError that has nothing to do with the page.

## 6. Decisions and why

- **Procedural capsule hand instead of a rigged GLB.** The owner wants identical hands and exact motion,
  and skins "later". A capsule skeleton needs no asset, no rig, no bone-name mapping, and gives the
  motion exactly. Swapping in a skinned mesh later is a contained change: bind a mesh's bones to the same
  21 retargeted points.
- **GestureRecognizer instead of HandLandmarker.** Same 21 landmarks plus free rock/paper/scissors labels.
- **Canonical bone lengths (retargeting) instead of raw world landmarks.** Enforces "all hands the same".
- **Two exe variants.** The owner asked for "an exe"; the single file is easiest to share, the folder starts
  3× faster. Both are built from the same source.
- **GitHub Pages instead of Vercel/artifacts.** The Vercel CLI is not installed/logged in, and claude.ai
  artifacts block MediaPipe's runtime WASM and model fetches by CSP. Pages was zero-setup with the
  logged-in `gh` CLI.
- **Web page added after the exe.** The owner wanted to test on a phone via QR; the PC has no camera.

## 7. Gotchas already hit (don't rediscover these)

- **Tagir's PC has no physical webcam.** `cv2.VideoCapture(0)` opens the "AMD Privacy View camera", a
  software device that feeds the desktop back at ~1 fps (an "OBS Virtual Camera" also exists). Live
  tracking must be tested on the brother's machine or a phone. Verify renders by looking at `--shot` /
  `?img=` screenshots.
- **The desktop app's `--windowed` build has no stdout**, so results are written to a sidecar file.
- **MediaPipe VIDEO mode needs strictly increasing timestamps**; both versions clamp `ts = max(ts+1, now)`.
- **`--source 1` must be converted to an int** or OpenCV treats it as a filename (fixed).
- **The per-hand gesture list can be empty** even when a hand is present (guarded).
- **Web: the error handler used to write into the loading box after it was removed**, masking the real
  exception (fixed; it now logs first and falls back to the game text line).
- **The Claude Code Browser pane refuses `github.io` origins** and drops query strings; use headless
  Playwright for verification instead.
- **pip on this PC needs `NO_PROXY=*`** because a VPN sets a system SOCKS proxy.
- **PyInstaller onefile is slow to start** (243 MB self-extraction, ~15 s). The folder build is ~5 s.

## 8. Known limits (deliberate, not bugs)

- A round locks the move at the exact instant the countdown ends. A hand mid-transition can register as
  "NO MOVE SEEN". A 0.3 s majority vote over recent frames would fix it.
- A trailing `--source` / `--shot` flag with no value crashes to the error log instead of printing usage.
- The 3D hand ignores where the hand is in the frame (palm is pinned to the origin); only pose is copied.
- One hand only. `numHands: 1` in both versions.
- No sound, no menus, no settings.

## 9. Suggested next steps, in the owner's priority order

1. **Get a human test on a real camera** (phone via the QR, or the brother's PC with the exe). Watch the
   `tracker:` readout and the overlay first; if `hands: 0` with a hand in frame, it is lighting/tracking,
   not the game.
2. **Add the overlay + stats to the desktop version** (`cv2.line`/`cv2.circle` on `res.hand_landmarks`
   before the texture upload) and rebuild both exes with the commands above.
3. **Stable-gesture hold** before locking a round (see section 8).
4. **Opponent view / two players.** Cheapest path: send the 21 retargeted points (~250 bytes per frame)
   over WebRTC data channel or a tiny WebSocket relay; render the opponent's points with the same
   `drawHand`. This is far cheaper than streaming video and keeps the "identical hands" property.
5. **Skins.** Replace the capsule drawing with a skinned mesh bound to the 21 points, or simply swap
   materials/colours per player as a first version.
6. **Decide on the cutout idea** (section 1). If pursued in the browser: MediaPipe `ImageSegmenter` with the
   multiclass selfie model, keep body-skin pixels inside the landmark bounding box, composite onto a
   canvas. Keep the 3D hand as an alternative "skin".

## 10. File map

```
rps_hand/
  rps_hand.py            desktop app (single file)
  test_rps_hand.py       self-check for script or exe
  HANDOFF.md             this file
  assets/                gesture_recognizer.task + sample photos
  dist/RPSHand.exe       single-file build
  dist/RPSHand-folder/   folder build
  build/, *.spec, build*.log   PyInstaller leftovers, safe to delete
  selfcheck.png(.txt)    last self-check output
  web_check*.png         last headless web checks
  qr.png                 QR code for the live URL
  web/                   git repo -> github.com/tagirz500/rps-hand (GitHub Pages)
    index.html           the whole web app
    victory.jpg          sample used by ?img=victory.jpg
```

## 11. Tracking v2 (2026-09-10, later the same day)

Phone test feedback: motion was good but LATE, and a fast shake lost the hand. Researched predictive tracking
(VR-style pose extrapolation), the One Euro filter (Casiez 2012) and Snap/Columbia's N-euro predictor. Rebuilt
the web pipeline in `web/index.html`:

- **HandLandmarker** instead of GestureRecognizer (lighter). Rock/paper/scissors now come only from the
  finger-count rule (0 up = ROCK, 3+ up = PAPER, index+middle only = SCISSORS).
- **Inference in a Web Worker** (module worker built from an inline Blob). Rendering runs at display rate
  and never waits on the tracker. `FilesetResolver.forVisionTasks(path, true)` is REQUIRED in a module
  worker or the library throws "ModuleFactory not set". Falls back to the main thread if the worker fails.
- **One Euro filter** on the 63 world coordinates (minCutoff 1.5, beta 15, dCutoff 3; metres, so beta is
  large). Its filtered velocity drives **prediction**: pose is extrapolated by (now - last result time)
  capped at 150 ms. Retargeting runs AFTER filtering/prediction so bone lengths stay canonical.
- **Dead reckoning**: when the tracker drops the hand, keep predicting for 250 ms, then grey out.
- Camera requests 60 fps; presence/tracking confidence lowered to 0.3 so it holds on through blur.
- **MODE button** on the phone cycles predict / smooth / raw so the difference can be felt live.
- Readout: `tracker: <ms> | <fps> | latency <ms>` and `worker/GPU` (or main/CPU etc.) + mode.
- `web_test.py [url]` is the headless check (defaults to http://localhost:8765/; serve `web/` first).
  Expected: `RESULT: SCISSORS`, `worker/GPU`, three modes all report SCISSORS, no errors.

Tuning knobs if the phone still feels off: `OneEuro(63, minCutoff, beta, dCutoff)`, `MAX_LEAD`, `HOLD_MS`,
`TRACKER_OPTS` thresholds. Next research-grade step is an N-euro style learned predictor.

Also looked at `Downloads/WebcamMotionCapture_Win_1.12.1.exe` (KWCL K.K., signed): closed-source Qt app in an
Inno Setup 6.4.3 installer that innoextract 1.9 cannot open. Not run, not decompiled; nothing reusable.

## 12. Free 3D placement: position + depth (2026-09-10, v3)

Owner wants the replica to move like a real hand in a real room: top-left on camera = top-left in 3D,
closer = bigger, further = smaller. One phone camera cannot measure depth, so depth comes from apparent
size vs known metric shape (what one eye does):

- `locate(world, image, W, H)`: MediaPipe world landmarks are metric AND already oriented to the camera,
  only their translation is unknown. With a pinhole camera of assumed horizontal FOV (`HFOV`, default 60°,
  `?fov=70` to override) the translation T is a 3-unknown linear least squares over the 21 joints
  (`-Tx + xu*Tz = X - xu*Z`, `-Ty + yv*Tz = Y - yv*Z`), solved in closed form. Also returns the mean
  reprojection error as a fraction of frame width, shown as `fit x.x%` on the HUD (2% on the sample photo;
  a big value means pose and picture disagree, e.g. wrong FOV or a bad detection).
- Lateral (x, y) position is independent of the FOV guess; only absolute depth scales with it.
- `toGL(world, T)` adds T then mirrors x. `retarget()` now keeps canonical bone lengths but places the
  palm centre where the tracked palm is (was: pinned at the origin).
- three.js camera sits at the origin looking down -z, with FOV chosen to match the video pane's
  `object-fit: cover` crop (`resize()`), so the replica appears at the same place and size as the hand
  in the video pane. A `GridHelper` at y = -0.35 m gives a depth cue.
- Filtering/prediction unchanged and now applies to absolute coordinates, so position is predicted too.
- HUD shows `depth 0.xx m` (distance of the palm centre from the camera).
- Verified with `web_test.py` on the sample photo: depth 0.29 m, fit 2.0 %, replica lands on the same
  side and size as the photographed hand. Live at the same URL.

True depth (stereo, ToF, TrueDepth) is not reachable from a mobile browser; a native app could use ARKit /
ARCore depth or two phones as a stereo pair if monocular scale-from-size is not enough.

## 13. Two hands, physics, a room (2026-09-10, v4)

Owner asked for two hands that "interact", physics, a background and things on the floor.

- **Two hands**: `numHands: 2`. Each detected hand is routed to a slot keyed by MediaPipe's handedness
  label (`Right` / `Left`); a duplicate label goes to the free slot. Each slot has its own One Euro filter,
  replica, colliders, depth and fit. The RPS move comes from the Right hand if visible, else Left.
- **Physics**: Rapier (`@dimforge/rapier3d-compat@0.20.0/dist/rapier.mjs` from jsdelivr, WASM inlined, so it
  needs no extra fetch). Each hand = 22 kinematic-position rigid bodies (a ball per joint + one for the
  palm) moved with `setNextKinematicTranslation` every frame from the drawn (predicted) points; parked at
  y = 10 m when the hand is out of view. Six dynamic props (3 balls, 3 boxes) rest on a static floor
  collider at `FLOOR_Y` (default -0.28 m below the camera, `?floor=-0.2` to raise). Hands push props and can
  pass them to each other; hands do NOT collide with each other (both are tracking-driven, so nothing
  could yield). `world.timestep` = real frame dt capped at 1/30. RESET OBJECTS button re-homes the props.
- **Room**: procedural checkerboard floor (canvas texture), back wall, fog, hemisphere + shadow-casting key
  light. Hands and props cast shadows (`renderer.shadowMap`), which is the strongest depth cue.
- **Adaptive hold**: `hold = max(250 ms, 2.5 × tracker interval)` so slow devices don't flicker hands off
  between results (the fixed 250 ms hold flickered at 2 fps in headless tests).
- `web/woman_hands.jpg` (Google's sample) is the two-hand self-check: `?img=woman_hands.jpg` must show
  `hands 2` and both `R` and `L` in the HANDS line. `web/victory.jpg` remains the one-hand check.
- Verified headless: victory → SCISSORS, R 0.30 m; woman_hands → R 0.52 m 4up, L 0.40 m 4up, PAPER;
  no console errors. Headless runs at ~2 fps because everything is software-rendered there; irrelevant
  on a phone.

Known: prediction mode can fling props hard on a fast swipe (kinematic bodies teleport); tune `MAX_LEAD`
or switch to smooth mode if that annoys. Prop positions in `PROPS` are metres from the camera.

## 14. First person + opponent hand, hand-only, auto-remove (2026-09-10, v5)

Owner: "first-person FOV: my hand vs the opponent's hand in one 3D environment, like I'm standing holding my
hand out"; "remove the lower arm, hand only after the wrist"; "when the hand is not in view remove the 3D
model, now it just hangs there".

- **Coordinates are now TRUE positions** (`toGL` no longer mirrors x). The phone plane is the middle of the
  table (z = 0); you are at z < 0, the opponent at z > 0.
- **VIEW button**: `first person` (default) puts the camera at your eyes (0, 0.12, -0.85) looking across the
  table, FOV 62°, so your right hand appears on your right. `camera` puts it at the phone camera with the
  cover-crop-matched FOV and mirrors the render (`worldGroup.scale.x = -1`; three.js flips face winding
  automatically for negative scale) so it matches the mirrored video pane.
- **Opponent hand** (`synthHand`, a darker skin): a posed hand built on the same skeleton from per-finger
  curl angles (`CURL`, `POSE`), placed at `OPP.at` (0.08, -0.04, 0.30) facing you. Idle = relaxed; during the
  countdown it pumps a fist (3 bobs in 3 s); at the result it shows the computer's move. Points lerp toward
  the target pose (0.25/frame) so transitions are smooth. This is the stand-in until a real opponent's 21
  points arrive over the network; the same `makeHand().draw(pts)` will render those.
- **Hand only**: forearm capsule removed. **No ghost**: after the adaptive hold expires the hand is hidden
  (`hand.hide()`), colliders parked far away.
- Props moved to the middle of the table (z -0.40 … -0.10) so they sit between the players; a wall behind
  each player; floor collider centred at z = 0.
- `?cpu=ROCK|PAPER|SCISSORS` forces the computer's move (used by the headless test).
- Verified headless: SCISSORS vs forced PAPER → YOU WIN, opponent pose visibly changes idle → fist → open;
  camera view mirrors correctly; two-hand photo still tracks both. Screenshots `web_check6..11.png`.

## 15. Tracking precision pass (2026-09-10, build 7)

Owner's phone (iPhone, Safari): tracker 37 ms, 21 fps with two hands, latency 41 ms, worker/GPU. Reported
"tracking is bugging" and "does not follow the hand precisely". Three causes fixed:

- **Joints now come from the IMAGE landmarks** back-projected at world-model depth (`toGL(world, T, xu, yv)`:
  X = xu*(Zw+Tz), Y = yv*(Zw+Tz)). Before, x/y came from the world landmarks, which disagree with the picture
  by roughly the `fit` value (~1 cm per joint at 0.4 m). Lateral positions now match the video exactly; only
  depth is modelled. Still FOV-independent laterally.
- **Slot assignment by nearest position** (`assign()`): MediaPipe's Left/Right label flickers; keying slots by
  label made a hand jump into the other slot's stale filter and leave a lingering copy. Now: nearest
  recently-seen slot within a quarter of the frame, else a free slot (label as tie-breaker). Duplicate
  detections of the same physical hand (centres closer than 0.6 × hand span) are dropped, keeping the higher
  handedness score. HUD shows the detected label (R/L) per slot.
- **Rigid prediction**: `OneEuro.predict()` applies the mean palm velocity to every joint instead of each
  joint's own velocity, which amplified fingertip noise into wobble. Finger articulation comes from the
  smoothed pose. One Euro now minCutoff 1.0, beta 20.
- Thresholds back to presence 0.5 / tracking 0.4 (fewer phantom hands; dead reckoning bridges drops).
- HUD shows `build N` so a cached page is obvious (GitHub Pages sends max-age=600; phones showed build 4
  after v5 was live).

Verified headless: victory → SCISSORS, fit 2.6 % (fit is now purely the world/image disagreement, no longer
affects placement); woman_hands → R 0.52 m, L 0.40 m via nearest-slot assignment; no errors.

## 16. Build 8: opponent parked, mirror view default, lag diagnostic (2026-09-10)

Owner: "remove the opponent for now, just 2 hands in 3D space, we need to make tracking perfect" and
"make a reflection like a mirror mode".

- **Opponent hand removed** (`synthHand`, `OPP`, `CURL`, `POSE` deleted). Recover from git history
  (commit "First-person view with posed opponent hand…") when the networked opponent is built; the
  `makeHand().draw(pts)` path it used is unchanged.
- **VIEW: mirror** is now the default (was "camera"): room seen from the phone position, render mirrored,
  matches the video pane one-for-one. "first person" is the other option.
- **Prediction lead fixed**: measured from the frame's CAPTURE time (`s.capT`) + one display frame (16 ms),
  not from result arrival. It was under-predicting by the whole pipeline latency (~40 ms on the phone).
- **Cyan overlay** on the video: the displayed 3D hand (filtered + predicted, before retargeting) projected
  back onto the frame via `toImage()` (inverse of `toGL`/`locate`). Green = raw tracker landmarks of the
  latest frame. On a still image cyan sits exactly on green (verified, `web_check14_zoom.png`); while
  moving, the gap between them IS the lag/filtering the player feels. MODE raw/smooth/predict changes the
  cyan, never the green.
- Verified headless: victory → SCISSORS; woman_hands → two hands in mirror view; no errors.

Tuning knobs for "perfect": `OneEuro(63, minCutoff, beta, dCutoff)` (1.0 / 20 / 3), `MAX_LEAD` (0.15),
`HOLD_MS` (250), `TRACKER_OPTS` thresholds (0.5 / 0.5 / 0.4), `HFOV` (`?fov=`).

## 17. Build 9: handshake stability, exact lines, thenar web (2026-09-10)

Owner: "two hands should interact (handshake) without the tracking constantly moving and without the hand
going crazy; the 3D lines must follow the video lines exactly"; and (photo with a red line) "a real hand has
tissue between the thumb and the index base, the tracking doesn't".

- **Per-joint speed limit** in `OneEuro.push`: a joint may move at most `VMAX_REL` = 1.5 m/s relative to the
  palm per frame; faster = occlusion spike, clamped. Fast real flicks take one extra frame to catch up.
- **Filter**: minCutoff 0.6 (stiller when still), dCutoff 1.5 (velocity estimate rejects alternating noise),
  beta 20. **Prediction gated by speed**: zero below 0.05 m/s, full above 0.3 m/s (no jitter amplification
  when still).
- **Handshake rule** (`OCCL_HOLD` 1500 ms): each slot remembers the other hand's palm at its last update and
  their distance. If a hand vanishes while within 0.25 m of the other hand and the other is still tracked,
  the lost hand keeps its last pose and is translated by the other palm's motion (they move together in a
  handshake). HUD shows "held". Otherwise the normal 250 ms hold applies.
- **Slot assignment** now adds a 0.08-frame penalty for a label mismatch so two touching hands don't swap.
- **SIZE button**: `real` (default) = the tracked geometry itself (3D skeleton lines project exactly onto the
  video lines in mirror view); `same` = canonical bone lengths (every hand identical, the original design).
- **Thenar web**: `WEB = [2, 5]` added to `CONNECTIONS` (green line on video + 3D skeleton) and two membrane
  triangles (0,1,5) (1,2,5) added to the palm mesh (`PALM_TRIS`). The capsule model still has no volume
  (thenar eminence); that needs a skinned mesh, see section 18.
- Verified headless: victory → SCISSORS, SIZE toggles, web line + membrane visible; woman_hands → both hands;
  no errors.

## 18. Research: how hands move, and how to get a real hand into 3D

- **Degrees of freedom.** Fingers: MCP 2 DoF (flex + spread), PIP 1, DIP 1 with DIP coupled to PIP (~2/3).
  Thumb: CMC is a saddle joint, 2 primary DoF (flex/extend, abduct/adduct) plus coupled rotation that gives
  opposition; MCP 2, IP 1. Wrist 2 (+ forearm rotation). The palm is not rigid: ring and pinky metacarpals
  fold (palm cupping). MediaPipe's 21 points capture all of this as positions, not angles.
- **Why the thumb web is missing.** The 21-point skeleton is a stick figure; the thenar eminence and the web
  are skin volume, not joints. Any joint-only renderer (ours, VTube-style debug skeletons) shows the gap.
- **The standard fix is a skinned mesh, not more sticks.** MANO (Romero et al.) is the reference hand mesh:
  778 vertices, 16 joints, 45 pose + 10 shape parameters, learned from ~1000 scans, includes the thenar and
  webbing. Pipelines fit MANO to MediaPipe's 21 keypoints by minimising keypoint distance (see HandTailor,
  and many "mediapipe-to-MANO" repos); MediaPipe's 21 points map 1:1 to MANO's joint keypoints.
- **Practical path for this project** (cheapest first):
  1. Now: web line + membrane (done).
  2. Rigged hand GLB (any modelled hand with MediaPipe-compatible bones, or MANO exported from Blender via
     the MANO Blender add-on) driven by joint rotations computed from our bone directions, exactly as
     `three-mediapipe-rig` does. Linear blend skinning then gives thenar volume, webbing and knuckles for
     free and is the "skins" feature the owner wanted.
  3. Later: fit MANO shape parameters once per player (hand size/proportions) if "real" size matters.
- Sources: MediaPipe hand landmarker docs; MANO (Embodied Hands, SIGGRAPH Asia 2017); HandTailor
  (arXiv 2102.09244); "Monocular 3D hand pose estimation with implicit camera alignment" (arXiv 2506.11133);
  Anthro-Thumb CMC saddle joint (Frontiers Robotics & AI 2025); passive biomechanics of the thumb CMC
  (PMC11154835).

## 19. Builds 10-12: exactness, harder tests, tilt (2026-09-10)

Owner feedback after build 9: predict and smooth both drift from the hand on fast moves; crossing fingers
still bugs; depth good but HEIGHT wrong; use exact video lines on the model; work on mechanics only (a
separate session builds the hand mesh).

**Harness.** `web_hard_test.py` now runs in the system Edge (`channel="msedge"`, new headless, real GPU):
the tracker runs at 30 fps / 20 ms like the phone. The Playwright chromium binary is blocked ("spawn
UNKNOWN" / permission denied) and the headless shell is software-only (2-3 fps, useless for motion).
Test media (Wikimedia Commons, CC) in `web/test/` (gitignored): handshake photos, crossed-finger photos,
`cleanhands.webm` (23 s) and `handwash.webm` (114 s, the hardest case: hands rubbing and interlacing).
`?video=test/x.webm` loops a clip; `?img=` a still; `?delegate=CPU` forces the CPU delegate. `window.dbg`
holds metrics: two-hand %, held, spikes/snaps/handovers, dispJumps (displayed palm moved >10 cm between
rendered frames), reproj (mean distance displayed lines vs video lines, % frame width).

**Findings (30 fps, real GPU).** On clasped/interlaced hands MediaPipe returns ONE hand ~96 % of frames and
none at all on the handshake photos; its single hand's landmarks jump >10 cm between consecutive frames
in 6-8 % of frames (it switches physical hands). Reprojection fit rises from ~1-2 % to 3.6-3.8 % when
fingers cross, so fit is a usable confidence signal. Stills reproject exactly (0.01-0.06 %).

**Changes.**
- Build 10: `HandFilter` replaces One Euro: error-adaptive gain (deadband 3 mm lateral / 8 mm depth, full
  follow at 15 / 30 mm, A_MIN 0.12) - no onset lag because it reacts to error, not to a late speed
  estimate. Duplicate suppression by mean joint distance (overlapping real hands are not duplicates).
  Unmatched detections prefer stale slots with the same label. SIZE removed (always real geometry;
  `retarget`/`LENGTH` deleted). Phone tilt: `deviceorientation` beta -> camera pitch; `level()` rotates
  points into a gravity-aligned frame; mirror camera looks along the phone axis; `toImage` undoes it.
- Build 11: two-frame confirmation for whole-hand jumps > `JUMP` 12 cm (spike = rejected, confirmed =
  snap); filter trust = f(fit) (fit 3 % -> 1, 6 % -> 0.15); exactness metrics.
- Build 12: MAX_LEAD 40 ms and prediction damped by palm acceleration (halved at 20 m/s²): rubbing /
  pumping motions no longer overshoot. Confirmed relocation onto the other hand's last position hands the
  detection to that slot ("handover") instead of teleporting. Tilt listener attached at load (desktop
  Chromium also exposes requestPermission, which had stalled the iOS-only path); iOS permission asked on
  every tap until granted.

| clip / mode | dispJumps b11 -> b12 | reproj b11 -> b12 |
|---|---|---|
| cleanhands predict | 75 -> 24 | 6.64 % -> 1.89 % |
| handwash predict | 97 -> 59 | 1.91 % -> 0.50 % |
| handwash raw | 45 -> 41 | 0 (by construction) |

Tilt simulation (beta 60 = camera 30° up): reproj 0.03 %, hand rises in the room, floor stays level.

**Contract for the hand-mesh session.** The renderer calls `hand.draw(pts)` with `pts` = 21
`THREE.Vector3` in metres, MediaPipe index order (0 wrist, 1-4 thumb, 5-8 index, 9-12 middle, 13-16 ring,
17-20 pinky), TRUE world positions in a y-up, gravity-levelled frame with the phone camera at the origin
looking down -z (your right hand has x < 0). `hand.hide()` removes it. Bone lengths are the tracked ones
(not canonical). Replace `makeHand()` with a skinned mesh that binds to these 21 points and nothing else
in the pipeline changes. Thenar web = points 1-2-5, palm = 0-5-9-13-17.

## 20. Build 13: tuning round on labelled photos and seven clips (2026-09-10, late)

Owner: "keep testing on different pictures and tuning it", then "upload everything so I continue in a new session".

**Test set** (`fetch_test_media.py`, all Wikimedia Commons): labelled stills victory/peace/dirty_peace/robbie_v
(SCISSORS), fist_pump/raised_fist (ROCK), woman_hands/crossed_hands (PAPER), scissors_png (a drawing);
unlabelled crossed1/2, handshake1/2, count5. Clips: rps (real rock-paper-scissors, 48 s), wave (fast wave),
counting (finger counting 1-5), gesture67 (fast two-hand gesture), handclap (kids clapping game), cleanhands,
handwash. `python web_hard_test.py 18 all [rps,wave,...]` runs stills, a tilt simulation, and the clips.

**Findings and changes**
- Frame-filling hands are missed by the palm detector (raised_fist, dirty_peace) and hands near the edge get
  worse landmarks. A grey border around the input finds the fist at 30 % padding and cuts the fit error by
  30-45 % on close-ups, BUT a fixed border shrinks far hands out of range (wave clip detection 98 % -> 0 %).
  Build 13 pads adaptively: `PAD` 0.3 when the tracked palm length exceeds 22 % of the frame's short side
  (hysteresis: unpad below 15 %, hold >= 1 s, because padded and unpadded inference give slightly different
  depths and flipping every frame caused jumps), plus a padded attempt every third frame while no hand is found.
- The jump gate froze the hand during a sustained fast wave (each new frame was another 10 cm on, never
  "within 6 cm of pending"). Now a pending jump is confirmed when the next sample is closer to the pending
  position than to the old one, and the threshold is a speed (`JUMP_SPEED` 3.6 m/s x frame interval).
- Still misses that remain are model limits: dirty_peace (soiled skin texture, never detected even padded),
  robbie_v and fist_pump (hand tiny in a wide shot), scissors_png (a drawing; landmarks misplace the ring finger
  -> reads PAPER). Handshake photos: 0-1 hands (clasped hands, see §19).

| clip (18 s, 30 fps) | b12 two-hand % | b13 two-hand % | b12 dispJumps | b13 dispJumps | b13 reproj |
|---|---|---|---|---|---|
| rps | 73 | 69-72 | 29 | 24-34 | 0.36 % |
| wave | 98 | 98 | 57 (hand froze) | 81 (follows) | 0.25 % |
| counting | 100 | 100 | 0 | 1 | 0.31 % |
| gesture67 | 91 | 92 | 81 | 98 (genuine fast motion) | 0.92 % |
| cleanhands | 5 | 4 | 17 | 24 | 1.6 % |
| handwash | 1 | 1 | 15 | 21 | 0.7 % |

Labelled stills: 4/9 -> 5/9 (raised_fist gained). `dispJumps` counts displayed palm moves > 10 cm between
rendered frames; on wave/gesture67 those are real 3 m/s motions, not errors - reproj (0.25-0.9 %) is the
number that says the lines still sit on the video.

**Open tuning ideas, in order**
1. Move detection from finger CURL ANGLES (3D angle at each middle joint) instead of tip-vs-knuckle distance;
   the distance rule misreads angled views (scissors_png -> 3 up). Score it on the labelled stills first.
2. A stable-gesture hold before a round locks (majority vote over ~300 ms).
3. Look at `hard_gesture67_*.png` / `hard_wave_*.png` frame by frame: decide whether the remaining displayed
   jumps are real motion (leave) or hand-switches (raise `handovers`).
4. Depth noise: `NOISE.z` deadband; try 0.006 / 0.025 and watch `reproj` and the depth readout jitter on a still.
5. The desktop Python app has none of builds 5-13; port only if the exe is still wanted.

## 21. Repo layout after the handoff

```
rps_hand/  (= github.com/tagirz500/rps-hand)
  README.md, HANDOFF.md (this), CONTINUE.md (paste into a new session), SESSION_NOTES.md (the AI's memory note)
  docs/index.html          the web app (GitHub Pages serves docs/ at the site root)
  docs/test/               Commons test media (handclap.webm, handwash.webm git-ignored: fetch_test_media.py)
  rps_hand.py, test_rps_hand.py, assets/     desktop app (builds 1-4 era), dist/ and build/ git-ignored
  web_test.py, web_hard_test.py, fetch_test_media.py
```

## 22. Build 14: hand-scan mesh, picture-space gating, honest lag metric, pointing navigation (2026-09-10, session on D1's PC)

This session ran on a different PC (`C:\Users\D1\Downloads\rps_hand`, gh account `d14life`, which has **no push
rights** to tagirz500/rps-hand: changes go up as a fork + pull request, the owner merges and Pages redeploys).
Mid-session the owner sent `creature_hand.zip` ("rig this hand and use it instead of what we have now"), then
"why does the hand look so bad", then `hand1.OBJ` ("use this hand instead, scrap the other one; make sure the fingers
are not crooked this time"). The creature hand was rigged first (same pipeline idea, it is in git history at commit
f6e3098) and then replaced by the scan. The "mechanics only" rule was lifted for the mesh.

**Test PC difference.** The tracker runs at 40-70 fps here (30 on Tagir's PC), so `frames`, `dispJumps` and the
per-frame thresholds are not directly comparable with the §20 table; compare runs on the same PC. The `rps`
clip (48 s) starts at a random point of the loop per run, so its two-hand % swings 25-78 % between identical runs.

### 22.1 New metric: `lag`
`reproj` compared the displayed lines with the LAST ACCEPTED detection, so a frame the jump gate rejected did not
count - the gate could hide its own lag. Now: every detection is remembered per slot before gating (`s.det`), `reproj`
uses it, and **`lag`** = mean distance (% frame width) between a frame's raw landmarks and the points that were ON
SCREEN at the render nearest to that frame's capture time (12-entry history per slot). `lag` includes pipeline
latency, so prediction can only win here by landing where the hand really is. Harness prints both.

### 22.2 Mechanics changes and their numbers
- **Finding:** on the wave clip (hands 2.6-3.2 m away) 150-173 of ~950 frames were "spikes" and 30-46 "snaps",
  i.e. the whole-hand jump gate fired on 16 % of frames of a genuine wave, each firing = a stale frame then a snap
  that zeroed the prediction velocity. Cause: the gate measured jumps in METRES; at 3 m the size-from-shape depth
  estimate jitters by 10-30 cm per frame, which is noise, not a hand switch.
- **Jump gate now works in picture space** (`JUMP_IMG` 2.4 frame widths/s, i.e. 8 % of the frame per frame at 30 fps),
  with a constant-velocity consistency test (a jump that continues the previous motion within half a jump is
  accepted at once), plus a depth criterion `DEPTH_JUMP` 0.45 (a 57 % depth change in one frame is gated like a
  picture jump). Handover to the other slot is also decided in picture space (< 12 % of the frame).
- **Depth rate limit** `DEPTH_RATE` 9/s (log units, 35 % per frame at 30 fps): a faster depth change scales the whole
  hand about the camera (its picture stays exactly where the tracker put it, only the depth moves less). Counted as
  `depthClamps`.
- **Noise model:** depth deadband/full-follow are now fractions of the depth (`NOISE.z` 2 % / 7.5 %, = the old
  8/30 mm at 0.4 m). Lateral thresholds stay ABSOLUTE (3/15 mm): a build that scaled them with depth too made reproj
  on the far wave hands 3x worse (0.22 -> 0.62 %) because the landmark model works on a hand crop, so its lateral
  error in metres barely depends on distance.
- The rigid predict/smooth pipeline, handshake rule, adaptive padding and tilt are unchanged.

Numbers, this PC, 18 s per clip, predict mode, `python web_hard_test.py 18 videos` (b13 = the shipped build 13
re-measured here with the new metric; b14 = the pushed build; each line is one run):

| clip | spikes b13 -> b14 | snaps | dispJumps | reproj % | lag % | two-hand % |
|---|---|---|---|---|---|---|
| wave (3 hands waving, 2.6-3.2 m) | 150 -> 0 | 30 -> 0 | 73 -> 43 | 0.22 -> 0.12 | 0.53 -> 0.45 | 99 -> 98 |
| gesture67 (fast, near) | 199 -> 63 | 57 -> 32 | 112 -> 84 | 0.86 -> 0.78 | 1.74 -> 1.68 | 93 -> 93 |
| counting | 0 -> 2 | 0 -> 0 | 2 -> 0 | 0.27 -> 0.26 | 0.34 -> 0.30 | 97 -> 99 |
| handclap | 90 -> 20 | 44 -> 13 | 75 -> 121 | 1.16 -> 0.87 | 4.06 -> 3.42 | 5 -> 4 |
| cleanhands | 34 -> 58 | 5 -> 11 | 22 -> 20 | 1.26 -> 2.19 | 3.39 -> 3.64 | 4 -> 4 |
| handwash | 48 -> 13 | 12 -> 4 | 33 -> 30 | 1.28 -> 0.61 | 2.04 -> 1.76 | 2 -> 2 |
| rps (random loop start) | 25 -> 3 | 6 -> 2 | 19 -> 36 | 0.36 -> 0.26 | 0.56 -> 0.51 | 25 -> 59 |

Stills unchanged: 5/9 labelled moves, tilt simulation reproj 0.05 %. Two intermediate builds were measured and
rejected on these numbers: (a) picture-space gate + depth-relative LATERAL deadband: wave reproj 0.62 %, lag 1.05 %;
(b) same with absolute lateral deadband but depth still filtered in metres: wave reproj 0.33 %, lag 0.61 % - the
mismatch between separately smoothed X and Z moved the lines off the picture, which is what led to filtering in
picture space + depth. Reading the remaining regressions: cleanhands/handclap are the clasped-hands clips where
MediaPipe returns one hand ~96 % of the time; their `reproj`/`lag` mostly measure the handshake "held" ghost
against stale detections, and `dispJumps` there counts hand switches the gate now lets through when they continue
the motion. `held` (411-534 frames on cleanhands) is the number to bring down next, not the gate.

### 22.3 The hand mesh (`hand1.OBJ`, the owner's hand scan) - how it was rigged
Source: `C:\Users\D1\Downloads\hand1.OBJ` (40 MB, 597 k vertices, 590 k quads + 13 k tris, one group, no UVs/normals),
a realistic LEFT hand with a short wrist stump, fingers spread and slightly curled, rotated ~30 deg in its bounding box
(bbox x 45-85, y 173-228, z 49-79; 1 unit = about 3.5 mm). Pipeline (Blender 4.5.3 headless; scripts `inspect2.py`,
`grid2.py`, `joints4.py`, `rig2.py` in the session scratchpad, all short and reproducible from this description):
1. Import, apply the importer's rotation, shade smooth, decimate to 75.9 k faces (`hand1_dec.blend`).
2. Principal axes of the vertex cloud: e0 along the hand (oriented toward the fingers = the end with the wider
   across-extent), e2 = thickness, e1 = e2 x e0. Everything below is in (u along, v across, w thick) coordinates.
3. Two orthographic renders along +/-e2 with a 5-unit grid. The +w side shows nails and knuckles (back), the -w side
   creases (palm): **palm faces -w, and with the thumb at v < 0 in the back view the scan is a LEFT hand** (confirmed by
   the finger-curl test in the script: fingertips lie on the -w side of the knuckle plane; `hand.json` says `"hand": "left"`).
4. Joints picked from the gridded back view (`picks_hand1.json`: wrist, thumb 1-4, and MCP + tip per finger; PIP/DIP at
   45 % / 76 % of MCP->tip), each joint's w = midpoint of the widest surface pair along a ray through (u, v). Automatic
   fingertip finding (farthest clusters from the wrist + tube tracing) was tried first and failed: the curled thumb is
   not among the farthest points and the tube trace never met its stop condition - don't repeat that.
5. Verified with red spheres + bones over the x-ray mesh from back, palm and edge-on (`j4_sheet.png`): all 21 inside
   the flesh on the finger axes, the edge view follows the curl.
6. Armature: 20 bones, no hierarchy, `b<j>` from joint PARENT[j] to joint j; automatic weights, 0 unweighted vertices.
7. Normal map: smart-UV-project the low-res, Cycles bake NORMAL (tangent) selected-to-active from the 603 k-face
   original (cage 1.2, ray 5.0, `use_clear=False` on a map pre-filled with the flat normal), 1024^2 PNG inside the GLB.
   Blender's own EEVEE check render still shows dark fingertip caps; the same GLB in three.js does not (`shot_h1_*.png`),
   so it was left as is - re-check on the phone.
8. `docs/hand.glb` 2.3 MB (56 k vertices, 79 k triangles, material = colour 0.80/0.60/0.50, roughness 0.6, normal map),
   `docs/hand.json` (21 bind joints in glTF = OBJ coordinates, `hand`, bone names).
9. Second pass by a parallel agent (scratchpad `weights.py`, `posetest.py`, `export_v2.py`, `repack.py`): the automatic
   weights were replaced by a procedural linear-blend distribution - chain membership from the bone-heat weights
   (top 2 chains), smoothstep hand-off at each joint with half-width 0.9/0.7/0.5 x local finger radius at MCP/PIP/DIP,
   palm blended by inverse-cube distance to the metacarpals, max 4 influences, tip bones at 100 % on the fingertips so
   nails stay flat. Verified by posing the flat bones exactly the way the page does (fist, stress, scissors, open, curl,
   point; five orthogonal views each; `pt_w5_*_sheet.png`): fingers keep their shape, nails flat, no palm crumpling;
   the deep inner crease at 90°+ and tip-into-palm intersection in a tight fist remain (linear blend skinning limits).
   Export: WebP normal map (1024², 238 kB, PSNR 34.7 dB vs PNG) + KHR_mesh_quantization repack (int8 normals, u16 UVs,
   u8 weights), joint order/bind matrices/positions byte-identical to the first export. Loads in three.js 0.186.

### 22.4 How the page drives it (`boneFrame`, `meshPts`, `makeSkin`)
`hand.draw(pts)` is unchanged for callers. Per bone and per frame a 4x4 is built from the points: origin at the parent
joint, y axis along the bone scaled to the **tracked** length, x from a twist reference (across-palm direction 5->17 for
finger bones, palm normal for thumb bones, blended continuously when a bone approaches its reference), z = x cross y,
x/z scaled by the tracked-to-bind ratio of the palm length 0->9. The bind inverse of each bone is the same function on
the bind joints, so the bind pose maps to identity and Blender's bone rolls are irrelevant. Bones are flat children of
the SkinnedMesh with `matrixAutoUpdate = false`; the mesh is bound with an identity bind matrix, so the skin lands on
the points in the hand group's space (the mirror view's `scale.x = -1` still applies). The GLB's material is cloned for
each mesh (colour, roughness, normal map).
- **Crooked / fat fingers, deformed nails** (the owner's complaints): stretching each bone to its tracked length while
  keeping the scan's thickness made a finger the tracker measures 15 % short 15 % fatter and crushed the nail; PIP/DIP
  sideways jitter zigzagged it. A rotation-only "rigged" drive was tried (`poseFK`: scan bone lengths, tracker directions,
  planar chains, hyperextension clamp) and looked clean but put the skin's fingertips off the green lines - the owner
  rejected that at once ("the tracking lines on the model should be exactly as in the image"). **Default now = exact
  positions with a shape fit**: every skin joint sits on the tracked point (`meshPts` only projects out the sideways
  PIP/DIP noise, a few mm), and each chain's THICKNESS (palm, thumb, each finger) is scaled by that chain's own
  tracked-to-scan length ratio, smoothed with an EMA (0.08/frame) so it cannot flicker. That is what MANO-style
  fitting does with its shape parameters: fit proportions, keep joints on the keypoints. HUD `mesh exact`;
  `?fit=rigged` gives the rotation-only drive for comparison. The green lines, colliders, metrics and move detection use
  the raw tracked points. Research note for "make the mesh follow the fingers exactly": with a fixed-shape mesh, exact
  keypoint following is only possible by per-bone stretch (this) or by per-frame IK that lands the joints on the points
  (same thing expressed as rotations + per-bone scale); MANO/HandTailor fit shape once and pose per frame, and still
  report ~5 mm keypoint residuals. The remaining visible crookedness is the tracker's own in-plane jitter of PIP/DIP;
  a temporal filter on those two joints only (not the tips) is the next lever if the owner wants stiller fingers.
- **Curled fingertips, "fat sausages up close, thin far away"** (the owner's next complaints, with "compare the model
  against real hand pictures in 15-20 positions"): `web_compare.py` builds a sheet of the real hand next to the mesh
  for 7 stills + 15 paused clip frames (`compare_*.png`; `?video=` frames are frozen with `dbg.freeze`, which makes the
  pump re-track a paused frame). `angles_probe.py` prints per-finger PIP/DIP bends in 3D vs in the picture. Measured
  cause: on straight fingers the PICTURE bend is 0-16 degrees but the 3D bend was 18-48, all from MediaPipe's per-joint
  depth (1-4 cm steps between joints, and a distal segment longer than the middle one, which no finger has). The
  inflated lengths also fed the thickness ratio, hence fat fingers when the hand is near the camera. Two fixes tried:
  (a) solving each joint's depth from a per-hand bone length (2D keypoints + lengths -> 3D, `fitDepths`, `?len=fit`):
  REJECTED - when a segment faces the camera the two depth roots are ill-conditioned and 3D bends got worse (dip 100+
  degrees on straight fingers); (b) **`smoothFingerDepth` (default, `?zs=0` off)**: the four depths of a finger are
  replaced by a least-squares line over the finger's picture arc length when the picture shows a straight finger
  (total picture bend < 25 degrees), a parabola when it shows a curl; the thumb always gets the parabola. Picture
  positions untouched. After: straight-finger 3D bends 1-11 degrees (= picture), segment lengths decreasing along the
  finger (38/21/17 mm), open hands on the sheet straight with natural tips. Fists are still lumpy: that is linear blend
  skinning of tightly folded, mostly occluded fingers, not tracking.
- **Handedness** from the geometry, not from MediaPipe's flickering label: sign of (tip 4 - wrist) . ((5-0) x (17-0))
  is + for a right hand; smoothed per slot. The other hand is the GLB mirrored in x with reversed winding and its own
  bind inverses (`mirroredIsLeft` = the GLB is a right hand; for this scan it is false, so a tracked RIGHT hand gets the
  mirrored copy). Verified on `victory.jpg` with `?cam=`: palm creases face the phone, nails/veins on the back.
- The capsule hand remains as the fallback when the GLB cannot load (`?skin=0`). HUD shows `mesh`/`capsules`.
- Skin shaders are compiled at start behind the loading text (`renderer.compile`); ~3 s on this PC's GPU.
- Two hands = 158 k skinned triangles + shadow pass: 45-53 fps here with the tracker running; not yet measured on a phone.

### 22.5 Pointing navigation (owner's messages during the session)
"When I [gesture] and move my hand from close to far I move forwards; from myself toward the camera I move back; move
across the screen and my viewing angle changes." First asked as a pinch, then changed to **index finger out** ("a pinch
would be too hard to see"). Works in BOTH views: in the first-person view the camera and the hands move; in the mirror
view the player, the camera and the hands move together (the hand transform is the mirrored one, R(-yaw), (-x, z)),
so the hand overlay stays pixel-exact on the video while the room moves around it (verified: `sheet_navmirror.png`):
pointing = index extended and middle/ring/pinky folded (the existing `fingersUp` rule). While pointing, the palm's
displacement since the gesture started drives `nav`: pull toward yourself (z more negative) = forward along the view
direction (`NAV_MOVE` 4 m per m), sideways drag = turn (`NAV_TURN` 4 rad per m, drag-the-world sign: drag to your right
= look left). The hands travel with the player (the tracked points are rotated/offset before `hand.draw`, so colliders
follow too). RESET OBJECTS also resets nav; HUD shows `nav <m> <deg> (point+drag)` in first-person view and `pointing`
next to the hand; `?nav=x,z,yaw` presets it for render checks. Not yet felt on a real phone: gains and the turn sign
are the first things to tune. The pointing pose is also the RPS "no move" pose, so navigation and a round do not
interfere.

### 22.5b Owner-placed joints, LOD, placement page (later the same session)
- The owner rejected the automatically placed joints ("let me place them properly") - `docs/place.html` is a tap-to-place
  page: loads `hand.glb` (or `?skin=file.glb`) with its bind joints, tap a joint in the list then tap the mesh; the joint is
  set at mid-thickness (entry/exit ray midpoint); views back/palm/side; undo; copy/download JSON. The owner's JSON is
  `scratchpad/user_joints.json` (glTF coords); ring and pinky PIP/DIP were redistributed to 45 %/76 % of knuckle->tip
  (`user_joints_fixed.json`, `joints_hand1_blender_user.json` in Blender coords) - everything else is as placed.
- **LOD**: the page loads `<export>_hi.glb` in the background after the phone mesh and, per hand and frame, shows it
  when palm length / depth > `LOD_NEAR` 0.15 rad (closer than ~60 cm). Both LODs must share bones and bind joints
  (one `<export>.json`). Owner: "use the proper scan on the phone, just optimise: far = no detail, close = all detail".
- Thickness is one per-hand constant now (palm-length ratio settled with a 0.01 EMA): the owner saw fingers swell when
  the hand came close (the tracked lengths inflate near the camera).

- **Solid hand** (owner: "fingers are objects, objects can't go through each other"): after depth smoothing, `palmClamp`
  keeps every finger joint at least `PALM_MIN` 6 mm in front of the palm plane (wrist + knuckles; palm side = the thumb
  tip's side) and treats joints of different fingers as spheres of `FINGER_R` 7.5 mm that may not overlap (3 relaxation
  passes; the nearer one comes closer, the farther one goes further). All moves are along the joint's own view ray, so
  the picture stays exact. `?pc=0` disables. Counted as `palmClamps` / `fingerClamps` in `window.dbg`.
- Finger thickness is per chain again (a short finger is also a thin finger) but settled with a 0.01/frame EMA so it
  cannot change with distance; the single-constant version made the extended fingers of a V look fat.

- **Owner's decision (end of session):** the rebuild on the owner's joints (`hand_u.glb`, `hand_u_hi.glb`, `hand_u.json`,
  straight rest, LOD) was first promoted with the rebuild agent's EARLY weights (torn palm under the ring finger) and the
  owner rejected it ("much worse"); the fixed version is kept as `?skin=hand_u.glb`. The live default is the previous
  export (`hand_v2` = `hand.glb`/`hand.json`, joints from §22.3, curled rest, agent weights). Textures go onto that one.
- Overlay: the cyan reprojection is now `?debug=1` only (owner: "why two colours"). Render cost cut (pixel ratio 1.5,
  512 shadow map, shadows off under 20 tracker fps) after the phone showed 67 ms / 14 fps with the mesh.
- Next, in the owner's order: hand perfect on hard gestures -> integrate origin/codex/hand-rig-workflow (head + upper
  body tracking, avatar, 3D mirror, calibration UI; design in scratchpad INTEGRATION.md) -> a 3D map world.

### 22.6 Repo additions
`docs/hand.glb`, `docs/hand.json`, `web_shot.py` (one screenshot: `python web_shot.py "?img=victory.jpg" out.png [secs] [js]`),
`web_compare.py` (real-vs-mesh sheet over 22 hand positions), `angles_probe.py` (3D vs picture finger bends),
`baseline_b13*.txt` / `run_b14*.txt` (harness logs of this session). Query parameters added: `?skin=0|file.glb`, `?cam=x,y,z,tx,ty,tz`, `?nav=x,z,yaw`, `?fit=rigged`, `?zs=0`, `?len=fit`.

### 22.7 Open items after build 14
1. Try it on the phone: mesh frame rate (2.3 MB GLB, 79 k triangles per hand), navigation gains/sign, whether the
   wrist stump should be hidden or extended into a forearm.
2. Skin quality: the GLB material is flat colour + normal map (the scan has no colour). Subsurface or a painted tint
   would help; WebP instead of PNG would halve the GLB.
3. Finger bending uses flat bones with linear blend skinning: sharp bends pinch at PIP. Dual quaternion skinning or
   a bone hierarchy with proper roll is the next step if it shows on the phone.
4. Everything in §20's open list (curl-angle move detection, stable-gesture hold) is still open.

## 23. Build 16: owner's rigged models, head + upper-body + avatar + mirror + calibration integrated (2026-09-10, late)

- **Hand meshes now come from the owner's own rigged models** (`?skin=<base>` loads `<base>_L.glb` + `<base>_R.glb` + JSONs).
  `docs/arm_L/R.glb` (default): the "arms" game-ready model, 2.9 k verts per side, 22 hierarchical bones (arm, forearm,
  hand, metacarpal + 3 phalanges per finger, 3 thumb bones), 2048 WEBP albedo / metal-roughness / normal (DirectX map,
  green flipped on export). `docs/thing_L/R.glb`: the "Thing" hand (single right hand, mirrored for the left), 9 k tris,
  IK removed. JSON contract: `joints` (21 bind joints in glTF coords from the rest-pose bone heads/tails), `bones`
  {"p-j": rigBoneName, hand, forearm, arm}, `extra` rest head/tail of those, `hand`. The page (`loadRig`, `makeRigSkin`)
  flattens the hierarchy, drives every mapped bone with the same per-bone frame as the scan (`boneFrame`, exact tracked
  lengths, per-chain thickness), the hand bone from wrist toward the middle knuckle, the forearm straight behind the wrist,
  and every undriven bone rides rigidly with the palm (leaving them at rest stretched the skin across the room). Scan rigs
  stay available: `?skin=hand.glb` (v2), `hand_u.glb` (owner joints, straight rest), `hand_r.glb` (Quadriflow retopo
  28.9 k quads, 2 UV islands, baked normal/AO/skin/nails - clean fists, see the agent report in this session).
- **Head, upper body, avatar, mirror, calibration** (from `origin/codex/hand-rig-workflow`, design in the session's
  INTEGRATION.md, implemented by an agent, applied with `apply_integration.py`): `docs/head/*` (FaceLandmarker worker,
  6-DoF head fit with the same pinhole/HFOV as the hands, neutral capture, filters), `docs/body/*` (PoseLandmarker worker,
  token scheduler: face after the hand result, body after two face results), `docs/avatar/RiggedAvatar.js` +
  `upper-body.glb` (mannequin, wrists handed to hand landmark 0), Reflector mirror in first person, SETUP dialog
  (seated/standing calibration; head depth scaled to the hands during "center") and MOVE settings panel (gains, modes,
  recenter). Views: mirror / first person (camera at the tracked head + gains + nav) / third person. Floor at -1.2 m with a
  table at the old -0.28 m (props unchanged). Budget ratchet: 3 s under 20 hand-fps sheds body -> mirror -> face rate.
  Query flags: `?head=0 ?body=0 ?avatar=0 ?mirror=0 ?setup=1 ?view=first_person|third_person ?fpfov= ?hdel=CPU ?bdel=CPU ?ground=`.
  Harness: `web_hard_test.py` gained face stills (woman_hands head reproj 0.33 %, seated_desk 0.24 %, both < 1 %),
  `docs/test/*.test.mjs` (6 node tests, all pass), `test/seated_desk.jpg` (Commons File:JHF1.jpg, CC BY-SA 3.0).
  Numbers here: stills 5/9, tilt 0.07 %, wave/counting reproj and lag unchanged with head+body on; hand tracker 33-38 fps
  with face 17 fps and body 8-9 fps on this PC. Phone not measured.
- Build 15 (latency): frames pumped on `requestVideoFrameCallback`, tracker input 480 px, hand shadow off, hi LOD only
  above 25 tracker fps; capture-to-result 49 -> 38 ms under 6x CPU throttle.
- Next: the 3D map world (owner's last stage), phone measurements of everything above, texture bake `hand_v3` (agent still
  running when this was written, targets the scan mesh).

## 24. Build 17: the 3D map world (2026-09-10, end of session)

`docs/world/World.js` (procedural, no downloads; applied by the session's `patch_world.py`): ~120 x 120 m map around the
home table - heightfield terrain with a Rapier heightfield collider, loop road with intersections, a town block of
low-poly buildings (canvas window textures, cuboid colliders the navigation cannot enter), a park with instanced trees
and lamp posts, a river, landmarks; sun shadow camera follows the player; fog; MAP button with a mini-map (top-down
canvas, player arrow); the player follows the terrain height; `?world=0` disables it (harness clips keep their
numbers: stills 5/9, tilt 0.07 %, face stills unchanged, ERRORS none). Cost on this PC: hand tracker 25-34 fps with the
world on (was 33-42). Verified views: mirror (hands + avatar in front of the park), first person (home pavilion on the
road), third person, top-down orthogonal (roads/buildings/river/trees, no overlap). Phone frame rate not measured; the
budget ratchet from §23 (body -> mirror -> face rate) is the first lever, `?world=0` the second.

## 25. Build 20: reset to hands only (owner: "everything is fucked, make a copy, remove everything, leave just hands, first person and a mirror view")

`docs/index.html` is rebuilt from the build-15 hands page (commit c719192) with physics/props, the RPS game, pointing
navigation, head/body/avatar/mirror/world all removed. What is left: tracker pipeline, the owner's rigged arms hand
(`?skin=arm`, forearm/upper arm collapsed into the wrist by default = "just palms"; `?arms=1` shows them), views
first person (default on a live camera) and mirror (default for `?img`/`?video`), MODE button, HUD. Everything removed is
intact at `docs/full.html` (build 17 + first-person default) and its modules (`docs/head`, `body`, `avatar`, `world`) and
in git history. Harness: stills 5/9, tilt 0.07 %, ERRORS none; the two face stills FAIL by design (no head tracker).
Owner feedback that led here: on the phone the avatar was stuck inside the map, and the index-finger navigation did not
move him forward/back or turn reliably. Next: rebuild navigation on this base with the owner testing each step.

## 26. Builds 21-24: skin, baked Thing skin, rigged drive, the folded-finger bug (2026-09-10, evening)

- 21: room-environment lighting + ACES, 3D skeleton lines off by default (`?lines=1`), Thing rig fixed (exporter strips
  dots from bone names: match with dots removed; bones anchored at their own rest heads), thickness from peak length.
- 22: `docs/armthing_L/R.glb` = arms mesh with the Thing's skin baked on (per-vertex cage bake, validity refill; agent
  report in this session), default hand. `?skin=arm` / `thing` / `hand.glb` remain.
- 23: owner's phone showed tracker 104-137 ms / 6-9 fps at 12-19 cm ("very laggy") and: fingers whip thin or fat, hand
  volume must be constant, crossed fingers impossible, a ghost second hand when shaking one. Changes: **rigged drive by
  default** (fixed proportions at one settled size, only joints bend; `?fit=exact` for the stretch drive), finger/palm
  collision off by default (`?pc=1`) - it blocked crossed fingers, handshake "held" ghost off (`?hold=1`), padding only on
  the every-third-frame no-hand retry, pixel ratio 1, shadows off, MeshStandardMaterial instead of Physical, 384 px input.
- 24: **folded fingers rendered straight** in the rigged drive (Codex's hypothesis, confirmed with the neutral clay
  material `?mat=plain`): `poseFK`'s hyperextension clamp had its "backward" axis pointing to the palm side, so every curl
  toward the palm was clamped to 8 deg. Also the finger's sideways axis now comes from the metacarpal (knuckle->tip is ~zero
  when folded and erased the bend). After: V with folded ring/pinky, compact fist with thumb across, crossed fingers cross,
  open hand (`sheet_plain2.png`). Codex owns `docs/movement/` (index-finger movement prototype) and left review notes in
  `CODEX_HAND_REVIEW.md` / `CLAUDE_CORRECTION_PROMPT.md` at the repo root; the checkout is shared with it.

## 27. Build 27: multiplayer, matchmaking, PC link (2026-09-10, night, on top of the d14life fork's build 26)

Owner: "add multiplayer with matchmaking; add a Connect-PC option: the phone logs in with a simple 6-digit
token, the PC hosts and shows only the 3D hands while the phone shows the camera with tracking; do I need a
server or can it run from my PC?"

**Answer to the server question.** The hand streams (~1 KB per tracker frame, 30 fps) go phone-to-phone over
WebRTC data channels; nothing relays them. The only server needed is a signalling broker to introduce two
browsers, and PeerJS's free public broker (0.peerjs.com) does that, so NOTHING runs on the owner's PC and the
site stays a static GitHub Page. A free public TURN relay (openrelay.metered.ca) is configured for strict
mobile NATs. Matchmaking also needs no backend: lobby slots are PeerJS ids `rpsh-lobby-1..6`; the first player
to claim a free id waits there, the next finds it taken, dials it, they exchange codes and continue over their
own ids; the slot is freed 1.5 s later. Limits: the public broker is best-effort (if it is down, ONLINE fails;
a self-hosted PeerServer or any WebSocket relay is a 20-line replacement), and two players who claim the same
slot within the same ~200 ms race (one of them retries the next slot).

**Code = account.** `myCode()` makes a 6-digit code once per browser (localStorage `rpsh_code`); the player's
PeerJS id is `rpsh-<code>`. There is no login and no server-side account; the code is the identity.

**Roles.** `docs/net.mjs` (`createNet`): player (phone: tracks and streams `{t:"h", who:"me", hands:[{n, a:[63
floats, mm precision], m}], m, ts}` after every tracker result to the opponent and to the screen; forwards the
opponent's packets to the screen as `who:"opp"`) and screen (`?screen=<code>`, PC: no camera, `body.screen`
hides the video pane, renders "me" hands as-is and "opp" hands mirrored, first person). The PC LINK button on a
phone shows its code; on a PC (no touch) it prompts for a code and reloads into `?screen=`.

**Opponent placement.** Their points arrive in their own levelled camera frame; in my room their phone plane is
the far side of the table, so x -> -x, z -> -z (`drawRemote`). The skin picks its handedness from the geometry,
so a mirrored right hand still reads as a right hand. Remote hands vanish 600 ms after the last packet.

**Rounds.** Either player taps PLAY -> `{a:"start"}`; both count 3 s locally (the guest starts one network hop
later, ~50-100 ms); at the end each sends `{a:"move", m}` (`"NONE"` when no hand was in view); the result and
score are computed on each side from (my, their); a 4 s timeout covers a lost message. The player mirrors its
HUD lines to the screen with `{a:"hud"}` (screen only, never to the opponent: an early build leaked them).

**Verified** (`web_net_test.py`, three separate browser contexts in headless Edge through the real PeerJS
broker): A and B match as host/guest via the lobby, a screen links to A by code, a round played from A gives
consistent results on all three pages ("YOU SCISSORS beats PAPER - YOU WIN" / "... YOU LOSE" / screen shows
A's line) and matching scores; a second round with no hand in view resolves as NO RESULT; no console errors.

Not done: physics props are not synchronised (the fork removed them anyway); no reconnection after a dropped
peer (tap ONLINE again); the screen only shows hands while the phone page is open.

### 27b. Build 28: PC LINK works without a camera (2026-09-10, night)

Owner on a PC with no camera: "pressing PC LINK does nothing". Cause: `main()` returned at the camera failure
before the buttons were wired. Now `#link` is wired at module level (one prompt on every device: shows this
device's code, and a typed 6-digit code reloads the page as `?screen=<code>`), and the no-camera status text
explains exactly that. `web_link_test.py` proves it: a camera-less page links to a phone page by code and the
phone reports "PC linked".

### 27c. Builds 29-30: link order independence, 3-digit codes (2026-09-10, night)

Owner's PC showed "link failed: peer-unavailable" with the right code: the phone was not registered at the broker
at that moment (its peer only started after the tracker + mesh loaded; iOS drops the broker socket when the
screen locks; a previous load can hold the id for up to a minute). Build 29: the phone registers its code the
moment the page opens; `unavailable-id` and network errors retry every 3 s; `disconnected` reconnects; a screen
Wake Lock is requested once online and on return to the foreground; the PC side keeps dialling every 3 s on
`peer-unavailable` ("waiting for phone <code>… open the page on the phone and keep it awake") and re-dials
when the connection closes. Build 30: codes are 3 digits (`CODE_LEN` in net.mjs, localStorage `rpsh_code3`);
the PC prompt accepts 3-6 digits. `web_link_order_test.py`: PC enters the code before the phone page exists,
links 2.8 s after the phone opens, survives a phone reload.

## 28. Builds 31-33: start screen, lobbies, screen pairing by QR, face to face (2026-09-10, late night)

Owner: "test the PC link; then matchmaking with lobbies (open lobby list anyone can join) and normal quick
match; for the test put one person in front of the other, 1 m apart, facing each other, I see my hands and
theirs"; then "three buttons: track my hand / screen (3D view) / both"; then "the PC screen should give a QR
code and a 3-digit number".

- **Start screen** (`#start`, shown when the URL has no role): TRACK MY HAND (`?role=track`: camera + tracking,
  no 3D render, the 3D pane shrinks to a 150 px strip for the buttons), SCREEN (`?screen`: no camera, shows
  its code + QR, renders what the linked phone sends), BOTH (`?role=both`: the classic split page). Test URLs
  (`?img`, `?video`, `?pair`) skip the start screen. CSS `[hidden] { display:none !important }` was needed:
  `#start { display:grid }` had overridden the hidden attribute and the invisible overlay ate every tap.
- **Pairing, reversed.** The SCREEN registers `rpsh-s-<screen code>` (`screenCode()`, localStorage
  `rpsh_screen3`, regenerated if taken) and shows the code + a QR of `?pair=<code>` (qrcodejs from cdnjs) in
  the `#pair` overlay until a phone links. The PHONE dials it: from the QR (`?pair=`), or PC LINK -> prompt
  for the screen's code; `net.linkScreen(sc)` re-dials every 4 s until the screen answers and re-dials if it
  drops; `rpsh_last_screen` pre-fills the prompt. One phone per screen. The old direction (PC types the
  phone's code) is gone.
- **Lobbies without a backend** (`net.mjs`): a host claims `rpsh-room-<k>` (first free of 8); anyone lists
  open rooms by probing all 8 ids (connect + `{t:"probe"}`, answered with `{t:"room", k, host, open}` within
  2.5 s) and joins with `{t:"join", code}`; the host dials the joiner's player id, both continue over player
  ids, the room id is freed. QUICK MATCH = join the first open room, else create one and wait. The ONLINE
  button opens the `#lobby` panel (QUICK MATCH / CREATE LOBBY / REFRESH / CLOSE + the list with JOIN buttons).
- **Face to face**: first-person eye at `eyeZ` = min(-0.5, 0.25 m behind my nearest hand) (smoothed), looking
  at (0, -0.2, 0.5), FOV 80; the opponent's hands are mirrored beyond the phone plane, so with hands ~0.3 m
  from each phone the players' eyes are ~1 m apart and both pairs of hands are in view (my near hands are
  large; hands held at face height can occlude the far hand).
- **Verified** (`web_lobby_test.py`, `web_link_test.py`, headless Edge, real broker): the start screen and its
  three buttons; A creates lobby 1, B sees "Lobby 1 - host <code>" and JOINs -> host/guest; C quick-matches
  into a fresh lobby 1, D quick-matches and joins C; in first person A draws B's hand and B draws both of A's
  (`window.dbgRemote` hook). Screen shows code + QR + URL; a phone opened from the QR link goes track-only and
  links; the screen draws `me:Right`; phone reload -> screen re-links; phone dialling a closed screen waits and
  links when the screen returns. Live-site runs of the earlier PC-link flow also passed before the reversal.
- Known: a second tab of the same phone waits on "code still registered" (one phone tab at a time); the lobby
  list costs 8 probes per refresh; rooms are global across everyone using the public broker with this id
  scheme (fine for now, prefix the ids if that ever matters).

### 28b. Build 34: per-tab phone codes, no reconnect loop (2026-09-10, night)

Owner: phone stuck on "reconnecting…", screen "waiting for a phone". Cause: the phone page was already open and the
screen's QR opened a second tab; both tabs claimed the same (localStorage) phone code, the broker rejected the second
with `unavailable-id`, and the `disconnected` handler kept calling `reconnect()` on the rejected peer. Fixes: the phone
code is per TAB (sessionStorage) and a taken code is replaced at once (`myCode(true)`); `p.dead` stops the reconnect
handler once the error handler has given up on a peer; a reloaded SCREEN waits out its own stale registration (up to
60 s, showing "busy… retrying") so its QR/number stay valid; TURN over TCP 443 added. `web_tabs_test.py` reproduces the
two-tab scenario and the screen reload.
