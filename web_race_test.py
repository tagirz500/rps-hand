"""The owner's failure: he and his brother both press QUICK MATCH at the same moment, each opens a lobby ("lobby 2
open, waiting for a player") and they wait for each other forever. Both must end up matched, and each must then see
the other's hands. Also checks the live lobby list: a lobby someone else opens shows up without pressing REFRESH.
Serve docs/ on :8765 first (or RPS_BASE=<url>).   python web_race_test.py"""
import asyncio, os
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.environ.get("RPS_BASE", "http://localhost:8765/")
ARGS = ["--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"]
FRESH = "() => [...(window.dbgRemote || new Map()).keys()].filter(k => { const r = window.dbgRemote.get(k); return r.a && performance.now() - r.t < 1500; })"


async def run():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True, args=ARGS)
        errs = []

        async def player(img):
            pg = await (await b.new_context(viewport={"width": 900, "height": 600})).new_page()
            pg.on("pageerror", lambda e: errs.append(str(e)[:160]))
            pg.on("console", lambda m: errs.append(m.text[:160]) if m.type == "error" and "XNNPACK" not in m.text and "404" not in m.text else None)
            await pg.goto(f"{BASE}?img={img}", wait_until="load")
            await pg.wait_for_function("document.getElementById('net').textContent.startsWith('online as')", timeout=90000)
            return pg

        A = await player("woman_hands.jpg")
        B = await player("victory.jpg")
        # both press QUICK MATCH at the same moment - the case that used to leave two lobbies waiting
        await asyncio.gather(A.click("#online"), B.click("#online"))
        await asyncio.gather(A.click("#quick"), B.click("#quick"))
        na = nb = ""
        for i in range(40):
            await asyncio.sleep(1)
            na, nb = await A.inner_text("#net"), await B.inner_text("#net")
            if na.startswith("matched") and nb.startswith("matched"):
                print(f"both matched after {i + 1}s")
                break
            if i in (5, 12, 25):
                print(f"  t+{i + 1}s  A: {na[:46]:46s} | B: {nb[:46]}")
        print("A:", na, "| B:", nb, "| BOTH MATCHED:", na.startswith("matched") and nb.startswith("matched"))
        # each must now see the other's hands
        for pg in (A, B):
            await pg.evaluate("() => { const v = document.getElementById('view'); while (!v.textContent.includes('first person')) v.click(); }")
        try:
            for pg in (A, B):
                await pg.wait_for_function("[...(window.dbgRemote || new Map()).values()].some(r => r.a && performance.now() - r.t < 1500)", timeout=30000)
            print("A sees:", await A.evaluate(FRESH), "| B sees:", await B.evaluate(FRESH))
        except Exception:
            print("HANDS DID NOT ARRIVE | A:", await A.evaluate(FRESH), "| B:", await B.evaluate(FRESH))
        await A.screenshot(path=os.path.join(HERE, "race_A.png")); await B.screenshot(path=os.path.join(HERE, "race_B.png"))
        # a third player opens the lobby panel and must see a lobby appear on its own (no REFRESH)
        C = await player("victory.jpg"); D = await player("victory.jpg")
        await C.click("#online"); await C.click("#create")
        await C.wait_for_function("document.getElementById('net').textContent.startsWith('lobby')", timeout=90000)
        await D.click("#online")
        seen = ""
        for i in range(12):
            await asyncio.sleep(2)
            seen = (await D.inner_text("#rooms")).replace("\n", " ")
            if "Lobby" in seen: break
        print("C created:", await C.inner_text("#net"), "| C's own list:", (await C.inner_text("#rooms")).replace("\n", " ")[:52])
        print("D's list without pressing REFRESH:", seen[:52], "| appeared:", "Lobby" in seen)
        print("ERRORS:", errs or "none")
        await b.close()

asyncio.run(run())
