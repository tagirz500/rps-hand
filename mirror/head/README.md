# Responsive head-only VR view

The active page contains only head tracking, the sculpture head, room and mirror.
Hand rendering, hand detection, hand fixtures and object manipulation modules were
removed from this route. Do not restore them without a new explicit request.
Historical hand work is recoverable from Git history.

Rotation and translation remain independent. Default turn sensitivity is 1.5x.
Left/right and forward/back position each have a separate 0-4x slider (default 2x).
Zero disables that movement axis; higher values increase travel for the same lean.
They apply immediately, independently of head turn and vertical movement. Travel stays bounded. Third person
shows the head from an external camera; first person includes its mirror reflection.

Latency changes: capture cap raised from 10fps to about 30fps; request a 60fps
camera where available; latest-frame-only worker inference (one frame in flight);
384px capture width; GPU face detection with CPU fallback. No hand worker competes
for CPU/GPU. Frame rate depends on the device and camera. The HUD reports actual
inference-result fps and capture-to-result latency, not end-to-end camera latency.

Filtering uses 12ms time constants during fast changes, 30ms for smaller rotations
and 25ms for smaller positional changes (previously 150ms / 85ms). This reduces lag
while retaining some smoothing. No prediction overshoot is introduced. A synthetic
step-response test checks the filter, not total live device latency.

No eye gaze or expression coefficients are used. The face plane estimates angles;
fixed facial landmarks estimate centre and relative depth. The source is a monocular
webcam, so this is approximate spatial tracking. Recenter while facing forward.

Run node mirror/head/pose.test.mjs for direction, position/angle independence,
limits, loss handling and step response. Open head/verify.html to test the real
face model without a webcam. Use ?preview for a static room/head preview only.
