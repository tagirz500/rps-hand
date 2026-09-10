# Seated-first calibration and perspective head position

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

After neutral subtraction, camera coordinates map to player `[-dx,-dy,dz]`.
Apply optional measured-distance scale once, then each independent movement
slider once. Never apply view yaw to the translation vector. Fast translation
uses a 16ms filter time constant; small corrections use 55ms to reduce seated
jitter. These constants are not sensor-to-screen latency measurements.

The active HeadView uses SpatialPose. Older WindowPose and firstPersonOrigin
helpers remain for historical callers/tests but no longer drive the active view.
Saved neutral persists through tracking loss. After 650ms the view eases toward
neutral; when the face returns it resumes relative to the saved center. Moving
the phone or changing seats requires Recenter or Guided setup.

## Seated body

Seated mode uses an estimated pelvis with 6cm of free lean relative to the
calibrated support. Larger head movements carry the pelvis and whole body.
The neck is capped at calibrated length plus 15 percent (at most 13.8cm), with
excess displacement translated into the shoulders and arms together. Measured
hip visibility does not switch the seated pelvis between two tracking sources.
Body proportions and the support reference survive occlusion. Seated mode can
hold the last arm pose and keep following a visible head; it labels this fallback
and clears stale body signals. Explicit body calibration
or Recenter resets them. Standing mode continues to require visible hips.

The guided lean stages recommend a gain mapping the 90th-percentile comfortable
extent to 15cm of game movement, bounded to 0.5–4x. At least eight measurements
and 3.5cm estimated movement are required. Otherwise retain the existing gain.
Head turn and vertical gain are never changed by this range tuning.

## Verification and limits

Run `node mirror/head/spatial.test.mjs`, `node mirror/head/calibration.test.mjs`,
the existing head pose tests and both body tests. Synthetic perspective tests
check pure rotation and several translations/depths, scale, and neutral capture.
`mirror/head/verify.html` runs the actual face model and outputs the fitted
position and reprojection error for the included photo. Low reprojection error
is not proof of correct physical depth or a perfect match to every face.

Runtime head estimation remains monocular and approximate. Individual geometry,
occlusion, lighting and unmeasured camera intrinsics affect results. Body pelvis
support is inferred, not a measured seat position. Live seated phone motion and
total latency require device testing. There is no room reconstruction, TrueDepth
access, eye gaze, detailed hand rig or new shooter gameplay in this update.

Sources:
- https://docs.opencv.org/4.13.0/d5/d1f/calib3d_solvePnP.html
- https://github.com/google-ai-edge/mediapipe/blob/master/mediapipe/modules/face_geometry/data/canonical_face_model.obj
