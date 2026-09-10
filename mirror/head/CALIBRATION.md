# Seated/reclined calibration and perspective head position

Head-only is now the default. Playing posture supports seated, reclined and
standing. Reclined setup disables body assistance and calibrates only the face.
Relative rotation uses the fitted rotation matrices rather than Euler-angle
subtraction, so sideways neutral tilt is removed without confusing yaw and pitch.
The model follows relative head roll. View roll is an optional checkbox, off by
default to keep the screen horizon level; when enabled it uses half the physical
roll. Translation remains in screen axes and is never rotated by look angles.

The startup dialog is optional. It defaults to seated play, captures at least
16 distinct good face fits spanning 2.2 seconds, then offers lateral and depth
range tuning. Motion/face loss resets the stable capture. Repeated render frames
never count as fresh measurements. Skip leaves the existing tracking operational.
Guided setup reopens the flow; Recenter changes the neutral without a wizard.

Optional measured camera-to-eye distance rescales translation using the median
starting depth. The camera horizontal FOV field adjusts the capture projection,
not the game's view FOV. Its default 60 degrees is an estimate, not a measured
camera calibration. Distance alone cannot recover unknown lens intrinsics or
individual face shape. No printed-marker detector is included.

## Position solver

`spatial.mjs` implements a six-parameter perspective pose fit using 23 canonical
MediaPipe face landmarks. These are selected from Google's canonical face model
(Apache-2.0), recentered at the outer-eye midpoint and scaled to a nominal 90mm
outer-eye span. Coordinates convert to camera X-right/Y-down/Z-away.

The worker uses its existing FaceLandmarker result. A robust damped least-squares
solver minimizes 2D reprojection error for rotation and translation jointly.
Initialization uses the facial plane and face span; the previous solution is
retained only when its projection cost is better. It performs at most 14 small
iterations, and rejects insufficient correspondences, excessive error,
behind-camera orientations and implausible distances. This is a custom PnP-style
iterative solver; it does not call OpenCV or load another neural network.

## Camera-edge recovery

Near a camera edge, the solver accepts FaceLandmarker's predicted points up to
32 percent beyond the image and weights them below actually visible points. A
continuing track may fit from eight selected points when at least four remain
inside; a new track requires twelve selected points, eight visible. Reduced
fits use the prior 3D pose and still pass reprojection, inlier, depth, orientation
and motion checks.

If FaceLandmarker misses after a known edge pose, the worker retries once on a
black-padded canvas, then uses normalized patch correlation on visible eye,
nose and forehead features for at most 450ms. Patch motion only translates the
last landmarks in the image plane; the perspective solver remains responsible
for the accepted 3D pose. If neither method works, linear/angular velocity coasts
for about 350ms and saturates, then the last accepted view holds. Tracking does
not continue indefinitely without image evidence. OffscreenCanvas-free browsers
skip both image fallbacks and retain the bounded motion/hold behavior.

After neutral subtraction, camera coordinates map to player `[-dx,-dy,dz]`.
Apply optional measured-distance scale once, then each independent movement
slider once. Never apply view yaw to the translation vector. Fast translation
uses a 16ms filter time constant; small corrections use 55ms to reduce seated
jitter. These constants are not sensor-to-screen latency measurements.

The active HeadView uses SpatialPose. Older WindowPose and firstPersonOrigin
helpers remain for historical callers/tests but no longer drive the active view.
Saved neutral and the last accepted view persist through tracking loss. Position
and angles hold instead of returning home. Reacquisition uses a 120ms filter for
350ms. Position or rotation jumps require corroboration by a subsequent frame;
low-inlier perspective fits are rejected. Ordinary motion retains the fast filter.
When the face returns it resumes relative to the saved center. Moving
the phone or changing seats requires Recenter or Guided setup.

## Seated body

Seated mode uses an estimated pelvis with 6cm of free lean relative to the
calibrated support. Larger head movements carry the pelvis and whole body.
The neck is capped at calibrated length plus 15 percent (at most 13.8cm), with
excess displacement translated into the shoulders and arms together. Measured
hip visibility does not switch the seated pelvis between two tracking sources.
Body proportions and the support reference survive occlusion. The active BodyView
now releases body output after 500ms without valid shoulders. RiggedAvatar eases
into an inferred body with relaxed arms, rather than indefinitely holding a stale
arm pose. After three failed body detections it checks at most twice per second
until a valid body returns, preserving face-tracking time. Explicit body calibration
or Recenter resets them. Standing mode continues to require visible hips.

The guided lean stages recommend a gain mapping the 90th-percentile comfortable
extent to 15cm of game movement, bounded to 0.5–4x. At least eight measurements
and 3.5cm estimated movement are required. Otherwise retain the existing gain.
Head turn and vertical gain are never changed by this range tuning.

## Verification and limits

Run `node mirror/head/spatial.test.mjs`, `node mirror/head/calibration.test.mjs`,
`node mirror/head/reclined.test.mjs`, the existing head pose tests and both body tests. Synthetic perspective tests
check pure rotation and several translations/depths, scale, and neutral capture.
`mirror/head/verify.html` runs the actual face model and outputs the fitted
position and reprojection error for the included photo. Add `?rotate=90` to test
the detector with a sideways reference image. Low reprojection error
is not proof of correct physical depth or a perfect match to every face.
`mirror/head/edge-verify.html` moves a real photo across left/right or top/bottom
edges. Use `?photo=thumbs_up.jpg` for the second face and `?axis=y` vertically.
The checked fixtures retained every near-half-face horizontal and vertical edge
position; this is evidence for those images, not a guarantee for all faces.

Runtime head estimation remains monocular and approximate. Individual geometry,
occlusion, lighting and unmeasured camera intrinsics affect results. Body pelvis
support is inferred, not a measured seat position. Live seated phone motion and
total latency require device testing. There is no room reconstruction, TrueDepth
access, eye gaze, detailed hand rig or new shooter gameplay in this update.

Sources:
- https://docs.opencv.org/4.13.0/d5/d1f/calib3d_solvePnP.html
- https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/modules/face_geometry/data/canonical_face_model.obj
