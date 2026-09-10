"""Head tracking + mask (build 45). On a photo with a face the face tracker must come up, place the head (matrix in cm ->
metres, in front of the camera), load the mask, draw the orange face contours on the video and show head + mask in the
mirror view only (never in first person, where the eye is the head). Screen role: the linked phone's face must appear on
the PC too. Writes face_*.png renders (front, side, mirror) so the fit can be checked by eye.
Serve docs/ on :8765 first (or RPS_BASE=<url>).   python web_face_test.py"""
import asyncio, os, json
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.environ.get("RPS_BASE", "http://localhost:8765/")
ARGS = ["--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"]
STATE = """() => { const m = faceDbg.matrix; const g = faceDbg.group; return { visible: faceDbg.visible, lm: faceDbg.lm ? faceDbg.lm.length : 0,
  pos: g.position.toArray().map(v => +v.toFixed(3)), euler: g.rotation.toArray().slice(0,3).map(v => +(v*180/Math.PI).toFixed(0)),
  mask: window.maskDbg ? { size: maskDbg.size.map(v => +v.toFixed(3)), scale: +maskDbg.scale.toFixed(3) } : null, stats: document.getElementById('stats').textContent, hud: document.getElementById('hand').textContent }; }"""
FP = "() => { const v = document.getElementById('view'); while (!v.textContent.includes('first person')) v.click(); }"
MIRROR = "() => { const v = document.getElementById('view'); while (!v.textContent.includes('mirror')) v.click(); }"

async def run():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True, args=ARGS)
        errs = []
        async def page(url, w=900, h=600):
            pg = await (await b.new_context(viewport={"width": w, "height": h})).new_page()
            pg.on("pageerror", lambda e: errs.append(str(e)[:160])); pg.on("console", lambda m: errs.append(m.text[:160]) if m.type == "error" and "XNNPACK" not in m.text and "404" not in m.text else None)
            await pg.goto(BASE + url, wait_until="load")
            return pg
        for img in ["test/robbie_v.jpg", "test/seated_desk.jpg", "test/peace.jpg"]:
            A = await page(f"?img={img}&role=both")
            try: await A.wait_for_function("faceDbg.visible", timeout=90000)
            except Exception: print(img, ": NO FACE within 90 s |", await A.evaluate("document.getElementById('stats').textContent"))
            await asyncio.sleep(1.5)
            st = await A.evaluate(STATE)
            print(img, "| head at", st["pos"], "m | euler", st["euler"], "| landmarks", st["lm"], "| mask", st["mask"], "|", st["hud"][:40])
            print("   stats:", st["stats"].replace("\n", " ")[:160])
            # does the placed head land where the video shows the face? project its eye centre (= the group's origin)
            # back into the picture with the same pinhole model the hands use, and compare with landmarks 33/263.
            if st["lm"]:
                err = await A.evaluate("""() => { const p = faceDbg.group.position, k = 2 * Math.tan((+new URLSearchParams(location.search).get('fov') || 60) * Math.PI / 360);
                  const zc = -p.z, W = dbg.frameW, H = dbg.frameH, u = 0.5 + p.x / (zc * k), v = 0.5 + (-p.y) / (zc * k * H / W);
                  const eu = (faceDbg.lm[33][0] + faceDbg.lm[263][0]) / 2, ev = (faceDbg.lm[33][1] + faceDbg.lm[263][1]) / 2;
                  return [+(u - eu).toFixed(4), +(v - ev).toFixed(4)]; }""")
                print("   eye centre reprojects", err, "off the tracked eyes (fraction of the frame; under 0.02 is on the face)")
            if st["lm"]:   # yaw sign: nose right of the cheek midpoint (image x) <=> head turned toward image +x <=> positive yaw
                nose = await A.evaluate("faceDbg.lm[1][0] - (faceDbg.lm[234][0] + faceDbg.lm[454][0]) / 2")
                print("   yaw", st["euler"][1], "deg | nose offset", round(nose, 3), "| signs agree:", (nose > 0) == (st["euler"][1] > 0) or abs(nose) < 0.01)
            await A.screenshot(path=os.path.join(HERE, f"face_mirror_{os.path.basename(img).split('.')[0]}.png"))
            if img == "test/robbie_v.jpg":
                # first person must hide the head; mirror shows it again
                await A.evaluate(FP); await asyncio.sleep(0.5); fp = await A.evaluate("faceDbg.visible")
                await A.evaluate(MIRROR); await asyncio.sleep(0.5); mi = await A.evaluate("faceDbg.visible")
                print("   first person hides head:", not fp, "| mirror shows it:", mi)
                # look at the fit from the front and the side with the fixed debug camera
                x, y, z = st["pos"]
                for name, cam in [("front", f"{x},{y},{z+0.45},{x},{y},{z}"), ("side", f"{x+0.45},{y},{z},{x},{y},{z}"), ("three_quarter", f"{x+0.3},{y+0.1},{z+0.3},{x},{y},{z}")]:
                    B = await page(f"?img={img}&role=both&cam={cam}", 700, 700)
                    await B.wait_for_function("faceDbg.visible && window.maskDbg", timeout=60000); await asyncio.sleep(1)
                    await B.screenshot(path=os.path.join(HERE, f"face_{name}.png")); await B.close()
            await A.close()
        # screen role: the phone's face reaches the PC
        pc = await page("?screen", 1000, 600)
        await pc.wait_for_function("document.getElementById('net').textContent.startsWith('screen')", timeout=60000)
        sc = await pc.inner_text("#pairCode")
        ph = await page(f"?img=test/robbie_v.jpg&pair={sc}", 420, 800)
        await ph.wait_for_function("document.getElementById('net').textContent.startsWith('PC linked')", timeout=90000)
        try:
            await pc.wait_for_function("faceDbg.visible", timeout=60000); await asyncio.sleep(1)
            st = await pc.evaluate(STATE); print("screen: head at", st["pos"], "| visible", st["visible"], "| hands:", await pc.evaluate("[...dbgRemote ? dbgRemote.keys() : []]") if await pc.evaluate("!!window.dbgRemote") else "")
        except Exception: print("screen: NO FACE received |", await pc.inner_text("#net"))
        await pc.screenshot(path=os.path.join(HERE, "face_screen.png"))
        print("ERRORS:", errs or "none")
        await b.close()

asyncio.run(run())
