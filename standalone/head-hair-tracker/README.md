# Standalone face, hair and head-outline tracker

This folder is the reusable tracker extracted from the head/body VR prototype.
It does not contain the hand, body, room, mirror, or 3D avatar.

MediaPipe Face Landmarker solves head rotation and 3D eye position while facial
landmarks are available. At initialization the tracker also learns up to 28
high-contrast pixel patches across the hairline and upper-head cap. If the eyes
or face become covered or cross the camera edge, at least three consistent
hair/head-outline patches continue translating the last accepted 3D position.
Rotation keeps its last face-solved angle until facial geometry returns.

## Run the included verification

From the repository root:

```sh
python -m http.server 8000
```

Open:

```text
http://localhost:8000/standalone/head-hair-tracker/hair-verify.html
```

The fixture exposes the face for three frames, covers it, then moves the remaining
hair/head texture. The checked run tracked 8/8 covered-face frames, including
seven frames driven specifically by the hair/head-outline fallback.

## Add it to another web project

Copy this whole folder and serve it over HTTP or HTTPS. Create the wrapper once:

```js
import {HairHeadTracker} from './head-hair-tracker/HairHeadTracker.js';

const tracker = new HairHeadTracker({
  hfov: Math.PI / 3,
  onPose(result) {
    if (!result.pose) return;
    const {position, parameters} = result.pose.fit;
    console.log({
      position,
      yaw: result.pose.yaw,
      pitch: result.pose.pitch,
      hairFallback: result.recoveredByHair,
      transform: parameters
    });
  }
});

await tracker.ready;
function frame(time) {
  tracker.track(document.querySelector('video'), time);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

`pose.fit.position` is the estimated eye origin in camera coordinates.
`pose.fit.parameters` contains `[rx, ry, rz, tx, ty, tz]`. The worker reports
`recoveredByHair`, `recoveredByPadding`, `recoveredByMotion`, and
`outlinePoints` so an app can show which tracking path is active.

The face must be visible once to associate the hair pixels with the player.
Hair-only startup is intentionally unsupported because ordinary webcam pixels
cannot safely identify an unknown patch of hair as the player's head. Tracking
stops when the learned head pixels leave the image.

## Files

- `HairHeadTracker.js` — small video/canvas integration wrapper.
- `worker.mjs` — Face Landmarker, edge padding and hair continuation.
- `edge.mjs` — texture selection and normalized patch correlation.
- `pose.mjs`, `spatial.mjs`, `orientation.mjs` — face geometry and 3D pose fit.
- `hair-verify.html`, `test-face.jpg` — browser verification fixture.
- `edge.test.mjs` — deterministic pixel-motion and boundary unit checks.

The worker loads MediaPipe Tasks Vision 1.0.1 and Google's Face Landmarker model
from their public CDNs. No API key, eye-gaze tracking, or server component is used.
