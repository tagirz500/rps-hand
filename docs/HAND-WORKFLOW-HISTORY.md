# Historical hand workflow (not the current head-only app)

# Hand tracking mesh: start here

This branch contains the complete mirror prototype, its current assets, editable Blender files, and the method used to drive a replacement hand mesh from the existing detector.

**For the next Claude session:** use `mirror/` as the working mesh example. Replace its hand asset and bind landmarks for the new model. Preserve the existing detector and its point ordering. Do not copy the old model's joint coordinates onto a different shape, and do not treat a zero bone-position error as proof that the skin deforms correctly.

The separate root `index.html` is the newer upstream application (build 9 when this branch was created). The mirror prototype retains the build-7 tracking snapshot plus the corrected mesh renderer. Do not overwrite newer upstream tracking improvements with the mirror snapshot when integrating the renderer into the main app.

## What is included

| Path | Purpose |
| --- | --- |
| `mirror/index.html` | Complete camera/sample-photo mirror app, no opponent, default 1x zoom, actual joint dots on |
| `mirror/hand/TrackedHand.js` | Model loader, exact joint placement, handedness, segment rotation/scale, custom skin deformation |
| `mirror/hand/tracked-hand.glb` | Current textured hand with five curved nail surfaces and corrected weights |
| `mirror/hand/rig.json` | 21 names, hierarchy and rest joint coordinates paired with that GLB |
| `mirror/hand/verify.html` | Joint/weight/shader checks and interactive pose fixtures |
| `mirror/hand/fixtures.json` | Detector outputs for the sample poses |
| `mirror/head/` | Independent face worker, head/approximate-eye camera control, tests and method README |
| `assets/hand-rig/current-rig.blend` | Editable import of the current delivered GLB, including nails |
| `assets/hand-rig/reference-rest.blend` | Unrigged, already oriented/optimized reference mesh, with packed textures |
| `assets/hand-rig/landmarks.blender.json` | Corresponding reference centres in Blender coordinates |
| `tools/hand-rig/prepare_model.py` | Import a new model and produce calibrated front/back renders |
| `tools/hand-rig/detect_landmarks.py` | Run the app's HandLandmarker on those renders |
| `tools/hand-rig/bind_model.py` | Construct the 21-joint rig, weights, smoothed transitions, GLB and manifest |
| `tools/hand-rig/add_nails.py` | Optional nail shells, only for sources that lack nails |
| `tools/hand-rig/reference/` | Original source-specific scripts retained as implementation history; not the portable entrypoints |

Hosted mirror: https://sculpture-hand-motion.fy71209.chatgpt.site/mirror/

The mirror now defaults to first-person tracked hands inside a room. The optional 3D window retains off-axis perspective. Both include Recenter, Fixed,
and head-only amplified turning (eye tracking removed). See `mirror/head/README.md` for mapping, smoothing,
loss handling and limits. Use **Camera: fixed** when comparing model joints to
video dots: head movement intentionally changes the projection, not the rig.

## Run the current example

From the repository root:

```sh
python -m http.server 8000
```

Open `http://localhost:8000/mirror/?img=thumbs_down.jpg` for the difficult folded pose, or `http://localhost:8000/mirror/` for a camera. Camera use on a phone requires HTTPS or another browser-supported secure context; the hosted link already provides HTTPS. Select other sample photographs from the menu.

Open `http://localhost:8000/mirror/hand/verify.html` for the numerical checks. The current model passes rest, scissors, thumbs-up, left pointing and thumbs-down. Visually inspect the model with dots both on and off, including the palm and back. Compare at 1x zoom.

## Rebuild the reference rig

The scripts were exercised with Blender 5.2 and Python 3.13. `bind_model.py`, `prepare_model.py` and `add_nails.py` run inside Blender; they use Blender's bundled NumPy. Put `blender` on PATH or replace it with your Blender executable path. The flags after `--` belong to the script.

```sh
blender -b --python-exit-code 1 --python tools/hand-rig/bind_model.py -- --blend assets/hand-rig/reference-rest.blend --landmarks assets/hand-rig/landmarks.blender.json --out work/rebuilt-hand
blender -b --python-exit-code 1 --python tools/hand-rig/add_nails.py -- --blend work/rebuilt-hand/rigged-hand.blend --out work/rebuilt-hand
```

This produces `tracked-hand.glb`, `rig.json`, and editable Blender files under `work/rebuilt-hand/`. The current served assets are kept separately; a rebuild does not silently overwrite them. Copy BOTH the new GLB and its generated manifest when switching the model.

## Prepare a different hand model

1. Import its OBJ, FBX, GLB/glTF or Blender rest mesh. If it already has a good anatomical rig, first consider preserving its weights and remapping its joint names; the generic binder deliberately refuses an existing armature modifier. ZTL requires exporting an interchange format from a tool that supports it.
2. Orient a **right hand** so fingers point approximately along Blender +Y and the dorsal/nail side faces +Z. In the supplied reference the thumb is on the negative-X side. Use a neutral open/spread pose so the spaces between digits are visible. Keep object transforms applied. Check orientation visually; the tools cannot infer it reliably from an arbitrary sculpt.
3. Name the chosen unrigged mesh `HumanHand`, or use the preparation utility below. For multiple meshes, select the skin with `--mesh NAME`; omit that option only when joining all imported meshes is appropriate. Preserve existing separate nail geometry if present, and bind it to the corresponding finger rather than creating duplicate nails.
4. Preserve source UVs/materials. If a dense sculpt has no useful UVs or textures, retopologize and bake its detail before heavy reduction. The utility does not create photographic skin textures or automatically bake high-poly detail. The decimation ratio is explicit, defaults to 1, and must be chosen for the new source.

```sh
blender -b --python-exit-code 1 --python tools/hand-rig/prepare_model.py -- --input path/to/hand.obj --out work/new-hand --rotate 0 0 0
```

`--rotate X Y Z` uses degrees. `--scale` multiplies source coordinates. Inspect `front.png` and `back.png`; rerun with the right orientation if required. Both renders and `projection.json` must come from the same prepared scene.

### Joint placement: automatic initialization, manual correction

The detector is useful for initializing joints on a rendered model. It is **not anatomical ground truth**, particularly for thumbs, bent/occluded fingers and unrealistic materials. Check and correct every phalange centre inside the mesh. Fingertips are surface endpoints, not additional deforming phalanges.

```sh
python -m pip install -r tools/hand-rig/requirements.txt
python tools/hand-rig/detect_landmarks.py --directory work/new-hand
blender -b --python-exit-code 1 --python tools/hand-rig/bind_model.py -- --blend work/new-hand/prepared.blend --detections work/new-hand/detections.json --projection work/new-hand/projection.json --out work/new-rig
```

The detector utility downloads the same HandLandmarker model URL used by the app unless `--model` supplies a local file. Front/back normalized image positions are converted to mesh x/y using the recorded orthographic camera scale and aspect. Rays from both dorsal and palmar sides place each centre halfway through the surface thickness. A ray miss stops the generic tool rather than silently inventing a position.

For manual placement, create a JSON file containing `{"points": [[x,y,z], ...]}` with exactly 21 Blender-space coordinates in the prepared mesh's coordinate system. Use `assets/hand-rig/landmarks.blender.json` as a **format example only**. Then pass `--landmarks your-file.json` instead of detections/projection. Do not reuse the reference values for another model.

The binder centres the wrist and normalizes wrist-to-middle-tip length to 0.18 m. It removes mesh below y=-0.012 m for the short wrist edge; `--keep-forearm` disables that crop. Runtime tracked segment lengths then adapt the hand's proportions.

## Landmark contract

| Index | Name | Parent |
| --- | --- | --- |
| 0 | wrist | none |
| 1, 2, 3, 4 | thumb_cmc, thumb_mcp, thumb_ip, thumb_tip | 0, 1, 2, 3 |
| 5, 6, 7, 8 | index_mcp, index_pip, index_dip, index_tip | 0, 5, 6, 7 |
| 9, 10, 11, 12 | middle_mcp, middle_pip, middle_dip, middle_tip | 0, 9, 10, 11 |
| 13, 14, 15, 16 | ring_mcp, ring_pip, ring_dip, ring_tip | 0, 13, 14, 15 |
| 17, 18, 19, 20 | pinky_mcp, pinky_pip, pinky_dip, pinky_tip | 0, 17, 18, 19 |

Blender bone local Y points along its segment. Root bone points toward middle MCP. Tip bones exist as endpoint markers and have no initial deformation weight. Export with glTF Y-up: Blender `(x,y,z)` becomes GL `(x,z,-y)`. The generated `rig.json` already contains GL coordinates; do not convert it again.

## Runtime integration: preserve these details

```js
import { TrackedHand } from './hand/TrackedHand.js';
const hand = await TrackedHand.load('./hand/');
worldGroup.add(hand.object);
// points: 21 THREE.Vector3 values in the application's camera/world GL frame
hand.object.visible = hand.update(points, 'Right');
hand.showJoints(true);
```

- Feed the renderer the existing filtered/predicted points after camera placement/back-projection and `toGL`, **before canonical-length `retarget()`**. Canonical lengths move joints away from the measured image points. Do not add a second filter inside the mesh renderer.
- Detector camera coordinates are x right, y down, z away. The app uses true GL `(x,-y,-z)`. Its current `toGL` uses image x/y rays at world-model z depth; preserve the latest upstream version rather than replacing it with an older conversion.
- The model source is a right hand. `TrackedHand.update` reflects the source for a left hand. The mirror view then reflects `worldGroup.scale.x = -1` once. Do not also negate input x for selfie display.
- Construct a separate `TrackedHand` instance for each hand. Loaded textures are shared, but pose matrices/uniforms are independent. Track slot identity through label flicker; a slot's name is not always the current anatomical handedness. Refresh stable handedness on reacquisition.
- Each bone head is placed at its target landmark, with its segment pointing to the next landmark and length matching the tracked length. Thickness follows palm scale. Rotation propagates along a digit so distal segments do not solve an unrelated twist against the palm each frame.
- Local matrices are computed from desired world matrices using the inverse desired parent matrix. Assigning world quaternions directly to child local quaternions is wrong, especially with scaled parents.
- Dots are derived from actual bone world positions, transformed into the model's local frame. They are not a second, independent drawing of the tracker points.
- The GLB and manifest must agree. The loader remaps skin indices by bone name, rather than assuming glTF joint order equals MediaPipe order.
- Bump the model/module cache query when publishing changed assets. Current mirror uses `fold-2`; use another revision when replacing it.

## Skin binding and the deep-fold fix

Automatic heat weights on this source leaked between adjacent digits. The binder initializes each digit from its own centreline, blends at its two interphalangeal joints and palm base, then smooths weights along **connected mesh edges** for 32 iterations. It does not smooth across empty space between fingers. Wrist and fingertip cores remain anchored. Keep the largest four weights per vertex and normalize them.

Independent segment rotations and abrupt digit-domain weights produced stretched, torn-looking triangles in a thumbs-down fist. Pure dual-quaternion blending combined with changing segment scale also inflated knuckles. The current runtime uses **75% affine skinning and 25% dual-quaternion volume retention**, with the same blend for normals and shadow geometry. This is an empirical compromise, not a biomechanical tissue simulation.

The GLB is a normal skinned asset. Blender and generic glTF viewers do not automatically reproduce the custom Three.js shader. Judge final deformation in the actual mirror app. The editable Blender file is for geometry, joint and weight work, not a guarantee of an identical render.

Optional nails are thin curved surfaces projected onto the source dorsal mesh. They inherit nearby skin weights to avoid sinking during folds; pink/ivory vertex colours and a coated material distinguish the nail bed and edge. Their dimensions are reference-hand assumptions. For a different model, prefer its original nails or fit these deliberately.

The fair-skin shader transform currently applies only to the material named `Original skin`. It retains source texture variation. For a new model, choose its material intentionally; do not accidentally recolour its nails or assume every source uses that name.

## Acceptance checks before claiming a replacement is ready

1. All 21 rest joint positions agree between the exported GLB and generated manifest.
2. Actual posed bone heads match target points for both handednesses and under a mirrored/translated parent. Reject nonfinite/degenerate input without corrupting the previous pose.
3. All mesh and nail vertices have finite normalized weights; no shader compilation errors.
4. Check the actual app on thumbs-down, thumbs-up, scissors, pointing, open palm and two hands. View both sides and deep folds with dots on/off. Check skin around MCP/PIP/DIP, thumb opposition, webbing and nails. Numerically exact bones can still have visibly bad skin weights.
5. Compare projection at 1x zoom, then test deliberate zoom. Do not mistake magnification for a landmark offset.
6. Test real phone motion and occlusion before claiming live-camera accuracy. The checks here used photographs and generated fixtures, not a physical live-camera session. Axial finger roll and hidden joints cannot be uniquely recovered from 21 positions; extreme contact may still intersect.

## Provenance and outstanding model request

The included reference comes from the user's supplied `hand.zip`. The original texture appearance and geometry were adapted; no blanket redistribution licence is asserted by this handoff. Keep source attribution/licence records when substituting another asset. Fixture photos came from the original project's MediaPipe assets; palm/back references are renders of the supplied mesh.

The user requested CGTrader's “Realistic male hand” by daniartist, model #2499582:
https://www.cgtrader.com/free-3d-models/character/human-anatomy/hand-e378a8c0-8a06-45db-ad83-4ef169295091

**That model has not been downloaded or used.** CGTrader displayed a sign-in requirement at Free Download. The page lists OBJ and ZTL. Obtain the actual source through the user's authorized account/file before replacing the mesh; do not claim the current hand is that model.

The supplied sculpture is now the tracked head: mirror/avatar/head.glb. Its neck was cut below the jaw and capped. See mirror/avatar/README.md, assets/head-rig/head-only.blend, and tools/head-rig/build.py (run through Blender in background mode). The first-person camera hides its own head, while a collapsible preview shows it following the tracked pose.

Hand-driven object inspection now lives in mirror/interaction/. Pinch near a highlighted cube, knot, or sculpture to pick it up; wrist translation/rotation maps through the same world transform as the rendered hands. Release leaves it in place; tracking loss releases safely; Reset objects restores the layout. See interaction/README.md and interaction/verify.html for the method and tests.
