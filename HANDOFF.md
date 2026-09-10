# Head and upper-body tracking: start here

This branch contains the current head and upper-body prototype, its cropped sculpture
model, editable Blender sources, processing script and tests. The current runnable
app is `mirror/index.html`. It has no hand detector, hand renderer, grabbing or eye
tracking. The separate root `index.html` is the older upstream RPS application.

Live app: https://sculpture-hand-motion.fy71209.chatgpt.site/mirror/?carry=3

## For the next coding session

Read this file, then `mirror/head/README.md`, `HeadView.js`, `pose.mjs`, and
`worker.mjs`. Review or reuse those components independently. Keep head angles
(rotation) separate from head position (translation). The user has now approved
upper-body tracking for seated and standing play. Read `mirror/body/README.md`
for calibration, coordinates, scheduling and limits. Detailed hands remain absent.
The latest change prioritizes seated play: read `mirror/head/CALIBRATION.md` for
the optional guided setup, perspective head fit, measured-distance scale and
seated body support. Large head movements now carry the whole body beyond a
6cm lean allowance; neck length is bounded instead of stretching. It also
describes remaining camera/face calibration limits.

## Current files

| Path | What to reuse |
| --- | --- |
| `mirror/index.html` | Complete static app, camera permission, room, viewpoint selector, controls and real planar mirror |
| `mirror/head/worker.mjs` | MediaPipe FaceLandmarker in a module worker; GPU first, CPU fallback; no expression or gaze output |
| `mirror/head/HeadView.js` | Latest-frame capture, independent rotation/translation, recenter, status, camera transforms |
| `mirror/head/pose.mjs` | Head-pose estimation, filters, movement mapping and coordinate helpers |
| `mirror/head/spatial.mjs` | Robust perspective head fit, stable neutral capture and calibrated positional offsets |
| `mirror/head/Calibration.js` | Optional seated-first startup, distance scale, lean-range tuning and skip/retry |
| `mirror/head/pose.test.mjs` | Direction, recenter, dropout, limits, independent translation and response tests |
| `mirror/head/verify.html` | Real face-model inference against an included photo without camera access |
| `mirror/body/worker.mjs` | Real Pose Landmarker Lite in a module worker, no segmentation |
| `mirror/body/BodyView.js` | Shared camera, two-face/one-body inference schedule, mode and status |
| `mirror/body/pose.mjs` | Visible upper-body joints, seated/standing calibration and filtered relative geometry |
| `mirror/body/TrackedBody.js` | Articulated torso and arms ending at wrists; first/third person and mirror |
| `mirror/body/verify.html` | Real-model reference photo, cropped-upper-body and standing checks |
| `mirror/body/*.test.mjs` | Coordinate, occlusion, calibration and inference scheduling tests |
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
node mirror/head/spatial.test.mjs
node mirror/head/calibration.test.mjs
node mirror/body/pose.test.mjs
node mirror/body/scheduler.test.mjs
blender -b -t 4 --python tools/head-rig/build.py
```

The Blender command regenerates the cropped blend/GLB and front/side renders.
Open `http://localhost:8000/mirror/head/verify.html` for real model verification.

## How tracking works

1. The existing front-camera stream supplies frames to one face worker. Capture
   is capped at roughly 30fps, at 384px width, with at most one frame in flight.
   When body tracking is enabled, two face results earn one body inference slot.
   Inference never overlaps; slow devices lower body capture from 15fps to 8fps.
   The camera requests 60fps where available. Actual speed depends on the device.
2. The facial plane initializes a robust six-parameter perspective fit across
   23 canonical face points. The solver jointly estimates rotation and eye-origin
   translation, rejecting poor fits. It does not use gaze or expression coefficients.
3. Rotation uses a 1.43-degree dead zone, adjustable yaw gain (default 1.5x), and
   pitch gain at 60% of yaw gain. Limits are +/-180 degrees yaw and +/-74.5 pitch.
4. Position comes from the perspective fit, relative to saved neutral. The
   canonical template assumes a 90mm outer-eye span; an optional measured starting
   distance adjusts scale. Camera FOV remains estimated unless supplied.
   Left/right, forward/back and up/down gains are separately adjustable from 0–4x
   (default 2x, zero disables that axis), independent of head angles. Travel is bounded to 0.50m horizontally/in depth
   and 0.30m vertically. Rotation is never applied to this position vector.
   Holding still does not drift; the mapping is an offset, not movement velocity.
5. Rotation filters use 12ms/30ms time constants; position uses 16ms/55ms for
   moving/quiet estimates. Face loss eases home after 650ms. Reacquisition keeps
   the saved neutral; use Recenter after moving the phone or changing seats.
6. First-person camera uses the resulting rotation and position. The independent
   third-person camera shows the same head from outside. First person has a
   100-degree field of view on the longer viewport dimension at default zoom.
7. The avatar lives on layer 1: invisible to its own first-person camera, visible
   to third person and the Reflector camera. Update the avatar before rendering
   the mirror. The mirror/frame are hidden in third person to avoid obstruction.
8. Pose Lite estimates shoulders, elbows, wrists and hips. Twelve valid frames
   calibrate body proportions. Seated mode allows 6cm of lean, then moves the
   whole body with the head. A bounded neck shifts shoulders/arms together when
   tracking would otherwise stretch it. Standing requires visible hips.
   After 500ms without usable shoulders, seated mode holds the last arm pose
   while following a visible head, labels the fallback and clears body signals.
9. Body world landmarks are hip-relative shape, not absolute position. Subtract
   pose eyes 2/5, map to the mirrored player frame, then add camera position once.
   Torso/arm articulation comes from pose geometry; navigation turn gain affects
   only the camera. The sculpture now renders physical head angles.
10. The larger mirror shows the torso and arms. Body: off terminates the pose
    worker. Calibrate body changes body calibration only; Recenter resets both.
11. Guided setup opens on startup and can be skipped. It captures at least 16
    distinct stable head fits over 2.2 seconds, then optionally tunes lateral and
    depth gain to comfortable leans. Head-turn and vertical gains stay independent.

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
plus Google's public face and Pose Lite models. The latest-frame workers, pose helpers, rendering
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
replace the current entrypoint just to retrieve a hand component.
