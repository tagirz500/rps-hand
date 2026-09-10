"""CAM sliders in the mirror: 0/0/0 must leave the camera exactly at the phone (the render lies on the video),
moving HEIGHT/BACK must move the camera, each view must keep its own numbers, and they must survive a reload."""
import asyncio, os
from playwright.async_api import async_playwright

BASE = os.environ.get("RPS_BASE", "http://localhost:8765/")
ARGS = ["--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"]
POS = "() => ({ cam: camDbg.camera.position.toArray().map(v => +v.toFixed(3)), world: camDbg.world.position.toArray().map(v => +v.toFixed(3)), fov: +camDbg.camera.fov.toFixed(1), view: document.getElementById('view').textContent })"
SET = """([id, v]) => { const i = document.getElementById(id); i.value = v; i.dispatchEvent(new Event('input')); }"""


async def run():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True, args=ARGS)
        ctx = await b.new_context(viewport={"width": 900, "height": 600})
        pg = await ctx.new_page()
        errs = []
        pg.on("pageerror", lambda e: errs.append(str(e)[:160]))
        pg.on("console", lambda m: errs.append(m.text[:160]) if m.type == "error" and "XNNPACK" not in m.text and "404" not in m.text else None)
        await pg.goto(BASE + "?img=test/robbie_v.jpg&role=both", wait_until="load")
        await pg.wait_for_function("!document.getElementById('status')", timeout=90000)
        await pg.click("#camBtn")
        print("mirror, untouched:", await pg.evaluate(POS), "(camera exactly at the phone)")
        print("   FOV row disabled in mirror:", await pg.evaluate("() => document.getElementById('cFov').disabled"),
              "| shows:", await pg.inner_text("#vFov"))
        await pg.evaluate(SET, ["cHeight", 0.3]); await pg.evaluate(SET, ["cBack", 0.8]); await pg.evaluate(SET, ["cTilt", -0.2])
        await asyncio.sleep(0.5)
        print("mirror, moved (HEIGHT drops the eye so the picture rises):", await pg.evaluate(POS), "| height reads", await pg.inner_text("#vHeight"), "| tilt reads", await pg.inner_text("#vTilt"))
        # first person keeps its own numbers
        await pg.click("#view"); await asyncio.sleep(0.5)
        print("first person:", await pg.evaluate(POS), "| height reads", await pg.inner_text("#vHeight"), "| FOV enabled:", not await pg.evaluate("() => document.getElementById('cFov').disabled"))
        await pg.click("#view"); await asyncio.sleep(0.5)
        print("back to mirror:", await pg.evaluate(POS), "| height reads", await pg.inner_text("#vHeight"))
        # saved on the device
        await pg.reload(wait_until="load")
        await pg.wait_for_function("!document.getElementById('status')", timeout=90000)
        await asyncio.sleep(1)
        print("after reload:", await pg.evaluate(POS))
        print("ERRORS:", errs or "none")
        await b.close()

asyncio.run(run())
