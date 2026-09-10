# Responsive head camera controller

The active page combines head tracking with optional seated/standing upper-body
tracking. See `CALIBRATION.md` for guided startup, perspective depth and seated
stability, and `../body/README.md` for the body model.
Hand rendering, hand detection, hand fixtures and object manipulation modules were
removed from this route. Detailed hands remain absent; body arms end at the wrists.
Historical hand work is recoverable from Git history.

Rotation and translation remain independent. Default turn sensitivity is 1.5x.
Left/right, forward/back and up/down position each have a separate 0-4x slider (default 2x).
Zero disables that movement axis; higher values increase travel for the same lean.
They apply immediately, independently of head turn and the other movement axes. Travel stays bounded. Third person
shows the head from an external camera; first person includes its mirror reflection.

Latency changes: capture cap raised from 10fps to about 30fps; request a 60fps
camera where available; latest-frame-only worker inference (one frame in flight);
384px capture width; GPU face detection with CPU fallback. No hand worker competes
for CPU/GPU. Optional body inference gets one slot per two completed face frames;
the tasks never run inference concurrently. Body: off restores head-only scheduling.
Frame rate depends on the device and camera. The HUD reports actual
inference-result fps and capture-to-result latency, not end-to-end camera latency.

Rotation filtering uses 12ms time constants during fast changes and 30ms for
smaller rotations. Spatial position uses 16ms for motion and 55ms for small corrections. This reduces lag
while retaining some smoothing. No prediction overshoot is introduced. A synthetic
step-response test checks the filter, not total live device latency.

No eye gaze or expression coefficients are used. A 23-point canonical face fit
jointly estimates rotation and eye-origin position through perspective projection.
The face plane is only an initializer. The source is a monocular
webcam, so this is approximate spatial tracking. Recenter while facing forward.

Run node mirror/head/pose.test.mjs for direction, position/angle independence,
limits, loss handling and step response. Also run spatial.test.mjs and
calibration.test.mjs for the active position solver and startup flow. Open head/verify.html to test the real
face model without a webcam. Use ?preview for a static room/head preview only.
