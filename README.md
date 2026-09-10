# Head tracking, first-person mirror and reusable 3D assets

Start with **[HANDOFF.md](HANDOFF.md)** for the complete current method, file map,
run instructions, validation, limitations and links to earlier hand components.

- [Live head-only app](https://sculpture-hand-motion.fy71209.chatgpt.site/mirror/?fast=7)
- [Current app source](mirror/index.html)
- [Tracking implementation](mirror/head/)
- [Sculpture head model](mirror/avatar/head.glb)
- [Editable head assets](assets/head-rig/)
- [Head processing script](tools/head-rig/build.py)

Run `python -m http.server 8000`, then open `http://localhost:8000/mirror/`.
The current app tracks only the head. The root RPS app and historical hand work
are separate; see the handoff guide before reusing older parts.
