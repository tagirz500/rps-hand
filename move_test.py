r"""Movement page with a two-hand fake camera (system Edge, real GPU). Checks: two hands seen, the joystick took the
physical-left hand (image right), the right-hand model is shown in front of the camera, sliders persist, no page errors.
  python move_test.py [url] [y4m]        (serve docs/ on :8767 first: python -m http.server 8767 --directory docs)
Two-hand clip (a right hand on the image left, its mirror on the right) from any single-hand still, e.g. peace.jpg:
  ffmpeg -loop 1 -i peace.jpg -t 6 -r 25 -filter_complex "[0]scale=240:360:force_original_aspect_ratio=increase,crop=240:360,split[a][b];[b]hflip[c];[c][a]hstack,format=yuv420p" fakecam3.y4m
VIEW='{"handDist":"0.6","handHeight":"-0.05"}' presets the sliders (localStorage move.view)."""
import asyncio, os, sys, json
from playwright.async_api import async_playwright
HERE = os.path.dirname(os.path.abspath(__file__))
URL = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8767/movement/?v=61"
Y4M = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, "fakecam2.y4m")
ARGS = ["--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required", "--use-fake-device-for-media-stream",
        "--use-fake-ui-for-media-stream", "--use-file-for-fake-video-capture=" + Y4M]

async def run():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True, args=ARGS)
        pg = await b.new_page(viewport={"width": 1100, "height": 700})
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("response", lambda r: errors.append("404 " + r.url) if r.status == 404 else None)
        if os.environ.get("VIEW"): await pg.add_init_script("localStorage.setItem('move.view', " + repr(os.environ["VIEW"]) + ")")
        await pg.goto(URL); await pg.wait_for_timeout(1500)
        await pg.click("#start")
        for _ in range(60):   # tracker + rig load
            await pg.wait_for_timeout(500)
            if await pg.evaluate("window.handModel?.visible && !!window.dbg?.model"): break
        await pg.wait_for_timeout(2500)
        stats = await pg.evaluate("""() => {
            const m = window.dbg?.model, w = window.dbg?.fk;
            const p = a => a ? a.map(v => [v.x, v.y, v.z].map(n => +n.toFixed(3))) : null;
            return { visible: !!window.handModel?.visible, gesture: document.getElementById('gestureStats').textContent,
                     status: document.getElementById('status').textContent, walk: document.getElementById('walkIndicator').textContent,
                     head: document.getElementById('headStatus').textContent, wrist: p(m)?.[0], tip8: p(m)?.[8], tip4: p(m)?.[4],
                     meshVisible: !!window.handModel?.group.children.find(o => o.isSkinnedMesh && o.visible), right: window.handModel?.right,
                     fold: w ? [8,12,16,20].map(t => +(w[t].distanceTo(w[t-3]) / (w[t].distanceTo(w[t-1]) + w[t-1].distanceTo(w[t-2]) + w[t-2].distanceTo(w[t-3]))).toFixed(2)) : null,
                     fov: document.getElementById('viewFovValue').textContent, saved: localStorage.getItem('move.view') }; }""")
        print(json.dumps(stats, indent=1))
        await pg.screenshot(path=os.path.join(HERE, "move_two_hands.png"))
        # slider round trip: set view FOV to 90, reload, expect it back
        await pg.evaluate("() => { const s = document.getElementById('viewFov'); s.value = 90; s.dispatchEvent(new Event('input')); }")
        await pg.wait_for_timeout(300)
        await pg.screenshot(path=os.path.join(HERE, "move_fov90.png"))
        await pg.reload(); await pg.wait_for_timeout(1500)
        print("after reload fov =", await pg.evaluate("document.getElementById('viewFovValue').textContent"), "camera.fov via slider value", await pg.evaluate("document.getElementById('viewFov').value"))
        print("errors:", errors[:8] if errors else "none")
        await b.close()
asyncio.run(run())
