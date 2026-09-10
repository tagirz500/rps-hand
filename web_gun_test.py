"""Revolver, webs and targets. With a fist photo and ?gunat=hand the revolver spawns in the hand and must be picked up;
it must follow the hand; forcing a shot at each target through the test hook must knock it over and count a hit; targets
stand up again after 2 s; an open-hand photo must NOT pick it up. The Spider-Man pose photo (index + pinky out) must fire a
web on its own. Screen role: the linked phone's fist must pick the revolver up on the PC too.
Serve docs/ on :8765 first (or RPS_BASE=<url>).   python web_gun_test.py"""
import asyncio, os
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.environ.get("RPS_BASE", "http://localhost:8765/")
ARGS = ["--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"]
STATE = "() => ({ holder: gunDbg.gun.holder, hits: gunDbg.gun.hits, shots: gunDbg.gun.shots, webs: gunDbg.gun.webs, strands: gunDbg.gun.strands.length, pos: gunDbg.gun.mesh.position.toArray().map(v => +v.toFixed(3)), fallen: gunDbg.targets.map(t => +t.pivot.rotation.x.toFixed(2)), hud: document.getElementById('gun').textContent })"
FP = "() => { const v = document.getElementById('view'); while (!v.textContent.includes('first person')) v.click(); }"
SHOOT_AT = "i => { const t = gunDbg.targets[i]; const c = t.disc.position.clone(); t.disc.getWorldPosition(c); const from = c.clone(); from.z -= 0.5; gunDbg.fire(from, c.clone().sub(from).normalize()); }"

async def run():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True, args=ARGS)
        errs = []
        async def page(url, w=900, h=600, wait_hand=True):
            pg = await (await b.new_context(viewport={"width": w, "height": h})).new_page()
            pg.on("pageerror", lambda e: errs.append(str(e)[:160])); pg.on("console", lambda m: errs.append(m.text[:160]) if m.type == "error" and "XNNPACK" not in m.text and "404" not in m.text else None)
            await pg.goto(BASE + url, wait_until="load")
            if wait_hand:
                try: await pg.wait_for_function("document.getElementById('hand').textContent.length > 12", timeout=60000)
                except Exception: print("   (no hand detected in", url.split("&")[0], ")")
            return pg
        # 1. fist near the revolver -> picked up, follows the hand
        A = await page("?img=test/raised_fist.jpg&role=both&gunat=hand"); await A.evaluate(FP)
        await A.wait_for_function("gunDbg.gun.holder !== null", timeout=20000); await asyncio.sleep(1)
        st = await A.evaluate(STATE); print("fist:", st["hud"][:60], "| holder", st["holder"], "| gun at", st["pos"])
        # 2. force shots at each target: every one must fall and count
        for i in range(5):
            await A.evaluate(SHOOT_AT, i); await asyncio.sleep(0.35)
        st = await A.evaluate(STATE); print("after 5 shots: hits", st["hits"], "shots", st["shots"], "| targets fallen (rad):", st["fallen"])
        await A.screenshot(path=os.path.join(HERE, "gun_fallen.png"))
        await asyncio.sleep(2.6); st = await A.evaluate(STATE); print("after 2.6 s: targets back up:", st["fallen"])
        await A.screenshot(path=os.path.join(HERE, "gun_hold.png"))
        # 3. open hand near the revolver -> NOT picked up
        B = await page("?img=woman_hands.jpg&role=both&gunat=hand")
        await asyncio.sleep(3); st = await B.evaluate(STATE); print("open hands: holder", st["holder"], "|", st["hud"][:40])
        # 4. Spider-Man pose photo -> a web fires by itself
        S = await page("?img=test/spidey.jpg&role=both"); await S.evaluate(FP)
        await asyncio.sleep(4); st = await S.evaluate(STATE)
        print("spidey photo:", await S.inner_text("#hand"), "| webs", st["webs"], "| strands", st["strands"], "| hits", st["hits"])
        if st["webs"] == 0:   # glove not tracked: exercise the web through the hook instead
            await S.evaluate("() => { const t = gunDbg.targets[2]; const c = t.disc.position.clone(); t.disc.getWorldPosition(c); const from = c.clone(); from.z -= 1.2; gunDbg.web('Right', from, c.clone().sub(from).normalize()); }")
            await asyncio.sleep(0.5); st = await S.evaluate(STATE); print("   web via hook: webs", st["webs"], "strands", st["strands"], "hits", st["hits"], "fallen", st["fallen"])
        await S.screenshot(path=os.path.join(HERE, "gun_web.png"))
        # 5. screen role: phone with a fist links; the PC's revolver must be picked up from the received hand
        pc = await page("?screen&gunat=hand", 1200, 700, wait_hand=False)
        await pc.wait_for_function("document.getElementById('net').textContent.startsWith('screen')", timeout=60000)
        sc = await pc.inner_text("#pairCode")
        ph = await page(f"?img=test/raised_fist.jpg&pair={sc}", 420, 800)
        await pc.wait_for_function("gunDbg.gun.holder !== null", timeout=60000)
        await pc.evaluate(FP); await asyncio.sleep(1.5)
        st = await pc.evaluate(STATE); print("screen:", await pc.inner_text("#net"), "| holder", st["holder"], "|", st["hud"][:50])
        await pc.screenshot(path=os.path.join(HERE, "gun_screen.png"))
        print("ERRORS:", errs or "none")
        await b.close()

asyncio.run(run())
