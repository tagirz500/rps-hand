# Head and upper-body tracking, first-person mirror and reusable 3D assets

Start with **[HANDOFF.md](HANDOFF.md)** for the complete current method, file map,
run instructions, validation, limitations and links to earlier hand components.

- [Live seated-first head and body app](https://sculpture-hand-motion.fy71209.chatgpt.site/mirror/?hair=9)
- [Current app source](mirror/index.html)
- [Tracking implementation](mirror/head/)
- [Upper-body tracking and calibration](mirror/body/)
- [Guided calibration and perspective depth method](mirror/head/CALIBRATION.md)
- [Sculpture head model](mirror/avatar/head.glb)
- [Editable head assets](assets/head-rig/)
- [Head processing script](tools/head-rig/build.py)

Run `python -m http.server 8000`, then open `http://localhost:8000/mirror/`.
The current app tracks the head plus optional seated/standing upper-body movement.
The root RPS app and historical hand work
are separate; see the handoff guide before reusing older parts.
