# Head tracking and 3D mirror: start here

This branch contains the complete current head-only prototype, its cropped sculpture
model, editable Blender sources, processing script and tests. The current runnable
app is `mirror/index.html`. It has no hand detector, hand renderer, grabbing or eye
tracking. The separate root `index.html` is the older upstream RPS application.

Live app: https://sculpture-hand-motion.fy71209.chatgpt.site/mirror/?fast=7

## For the next coding session

Read this file, then `mirror/head/README.md`, `HeadView.js`, `pose.mjs`, and
`worker.mjs`. Review or reuse those components independently. Keep head angles
(rotation) separate from head position (translation). The user's latest requirement
is head only; do not bring hands back unless explicitly requested.

## Current files

| Path | What to reuse |
| --- | --- |
| `mirror/index.html` | Complete static app, camera permission, room, viewpoint selector, controls and real planar mirror |
| `mirror/head/worker.mjs` | MediaPipe FaceLandmarker in a module worker; GPU first, CPU fallback; no expression or gaze output |
| `mirror/head/HeadView.js` | Latest-frame capture, independent rotation/translation, recenter, status, camera transforms |
| `mirror/head/pose.mjs` | Head-pose estimation, filters, movement mapping and coordinate helpers |
| `mirror/head/pose.test.mjs` | Direction, recenter, dropout, limits, independent translation and response tests |
| `mirror/head/verify.html` | Real face-model inference against an included photo without camera access |
| `mirror/avatar/TrackedHead.js` | Local sculpture avatar and collapsible preview; layer separation for first person/reflection |
| `mirror/avatar/head.glb` | Cropped, capped, optimized sculpture head, about 1.18 MB |
| `mirror/avatar/README.md` | Asset provenance, geometry processing and mirror rendering notes |
| `assets/head-rig/head-only.blend` | Editable cropped head with eye-origin pivot |
| `assets/head-rig/source-normalized.blend` | Normalized source sculpture before the neck cut |
| `tools/head-rig/build.py` | Repeatable Blender cut, cap, decimation, material and GLB export |

## Run and check

No build step or npm install is required. Serve the repository over HTTP:

```sh
python -m http.server 8000
```

Open `http://localhost:8000/mirror/` for camera tracking, or
`http://localhost:8000/mirror/?preview` for a clearly labelled static scene.
A phone accessing another machine needs HTTPS for camera access; use the live URL
or a suitable HTTPS host. Runtime/model downloads require network access.

```sh
node mirror/head/pose.test.mjs
blender -b -t 4 --python tools/head-rig/build.py
```

The Blender command regenerates the cropped blend/GLB and front/side renders.
Open `http://localhost:8000/mirror/head/verify.html` for real model verification.

## How tracking works

1. The existing front-camera stream supplies frames to one face worker. Capture
   is capped at roughly 30fps, at 384px width, with at most one frame in flight.
   The camera requests 60fps where available. Actual speed depends on the device.
2. Cheeks 234/454 and forehead/chin 10/152 define a head plane. The cross-product
   normal yields yaw/pitch relative to Recenter. Fixed outer-eye corners 33/263
   estimate head centre and scale; this measures facial geometry, not eye gaze.
3. Rotation uses a 1.43-degree dead zone, adjustable yaw gain (default 1.5x), and
   pitch gain at 60% of yaw gain. Limits are +/-180 degrees yaw and +/-74.5 pitch.
4. Position estimates depth from facial span relative to neutral and an assumed
   90mm outer-eye span. Left/right, forward/back and up/down movement gains are separately adjustable from 0–4x
   (default 2x, zero disables that axis), independent of head angles. Travel is bounded to 0.50m horizontally/in depth
   and 0.30m vertically. Rotation is never applied to this position vector.
   Holding still does not drift; the mapping is an offset, not movement velocity.
5. Adaptive filters use 12ms time constants for fast changes, 30ms for small
   rotations and 25ms for small position changes. Face loss eases home after
   650ms; reacquisition after 1.5s records a new neutral.
6. First-person camera uses the resulting rotation and position. The independent
   third-person camera shows the same head from outside. First person has a
   100-degree field of view on the longer viewport dimension at default zoom.
7. The avatar lives on layer 1: invisible to its own first-person camera, visible
   to third person and the Reflector camera. Update the avatar before rendering
   the mirror. The mirror/frame are hidden in third person to avoid obstruction.

The status readout reports result FPS and frame-capture-to-result processing
latency. It does not measure total sensor-to-screen latency. Synthetic response
checks passed and real face detection/browser rendering were verified, but phone
motion feel, true metric position and whole-system latency still need live tests.

## Important limits

This is approximate monocular head tracking, not calibrated six-degree-of-freedom
VR. Facial dimensions and camera FOV are assumptions; roll is not tracked. The
sculpture is rigid, with no facial-expression rig. Keep the phone still and the
face visible. Third-person inspection and the mirror are diagnostic views, not
proof of anatomical or metric accuracy. No secret/API key is needed.

The static page uses Three.js 0.186.0 and MediaPipe Tasks Vision 1.0.1 from jsDelivr,
plus Google's public face model. The latest-frame worker, pose helpers, rendering
and cropped model can each be reused without copying the whole app.

## Earlier hand components, if separately needed

Hands were removed from the active app at the user's request, but all prior work
remains in Git history and the editable hand assets/pipeline remain in `assets/hand-rig/`
and `tools/hand-rig/`.

- Full tracked hand model, skin/nail deformation and pinch-grab inspection:
  https://github.com/tagirz500/rps-hand/tree/a831b7fffff61e61652b3f3bb3f3032eba13d15c/mirror
- Restored independent hand worker with third-person head/hands:
  https://github.com/tagirz500/rps-hand/blob/f95f2af4cdd98ed61f90b0e3b233e9cca2de6796/mirror/hand/LiveHands.js
- Historical hand-model replacement method: `docs/HAND-WORKFLOW-HISTORY.md`.

Use a complete historical revision when running an older example; mixing its
entrypoint with current modules can introduce API/version mismatches. Do not
replace the current head-only entrypoint just to retrieve a hand component.
