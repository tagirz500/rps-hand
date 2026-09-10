"""Multiplayer test: two players in separate browser contexts match through the PeerJS lobby, a PC screen links to
player A by code, a round is played over the wire. Serve docs/ on :8765 first. Needs internet (PeerJS broker).
  python web_net_test.py"""
import asyncio, os
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
import os as _o; BASE = _o.environ.get("RPS_BASE", "http://localhost:8765/")
ARGS = ["--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"]
PROBE = """() => ({ net: document.getElementById('net').textContent, game: document.getElementById('game').textContent,
  score: document.getElementById('score').textContent, move: document.getElementById('move')?.textContent,
  remote: [...(window.__remote || [])], play: getComputedStyle(document.getElementById('play')).display })"""

async def run():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True, args=ARGS)
        errs = {}
        async def page(name, url):
            ctx = await b.new_context(viewport={"width": 900, "height": 600})
            pg = await ctx.new_page(); errs[name] = []
            pg.on("console", lambda m, n=name: errs[n].append(m.text[:160]) if m.type == "error" and "XNNPACK" not in m.text and "404" not in m.text else None)
            pg.on("pageerror", lambda e, n=name: errs[n].append("pageerror: " + str(e)[:160]))
            await pg.goto(BASE + url, wait_until="load")
            return pg
        A = await page("A", "?video=test/rps.webm")
        B = await page("B", "?img=victory.jpg")
        for pg, n in ((A, "A"), (B, "B")):
            await pg.wait_for_function("!document.getElementById('status')", timeout=90000)
            await pg.wait_for_function("document.getElementById('net').textContent.startsWith('online as')", timeout=30000)
            print(n, "->", await pg.inner_text("#net"))
        codeA = (await A.inner_text("#net")).split("online as ")[1].strip()
        # expose remote map size for the probe
        for pg in (A, B): await pg.evaluate("window.__remote = []")
        await A.click("#online"); await asyncio.sleep(2.5); await B.click("#online")
        for i in range(30):
            await asyncio.sleep(1)
            na, nb = await A.inner_text("#net"), await B.inner_text("#net")
            if na.startswith("matched") and nb.startswith("matched"): break
        print("A:", na, "| B:", nb)
        C = await page("C", f"?screen={codeA}")
        await asyncio.sleep(6)
        print("C:", await C.inner_text("#net"))
        # hands flowing? count remote entries with fresh data on each page
        count = "() => { let n = 0; for (const [k, r] of (window.__rm || new Map())) if (r.a && performance.now() - r.t < 1000) n++; return n; }"
        # the module keeps `remote` private; read it through the scene instead: visible remote hand groups
        vis = "() => window.dbg ? 0 : 0"
        for pg, n in ((A, "A"), (B, "B"), (C, "C")):
            st = await pg.evaluate("() => ({ game: document.getElementById('game').textContent, score: document.getElementById('score').textContent, play: getComputedStyle(document.getElementById('play')).display })")
            print(n, "state:", st)
        # play a round from A
        await A.click("#play")
        for i in range(12):
            await asyncio.sleep(1)
            ga, gb, gc = await A.inner_text("#game"), await B.inner_text("#game"), await C.inner_text("#game")
            print(f"  t+{i+1}s  A: {ga:42s} | B: {gb:42s} | C: {gc}")
            if ("WIN" in ga or "LOSE" in ga or "DRAW" in ga or "NO RESULT" in ga) and gb: break
        print("scores A/B/C:", await A.inner_text("#score"), "|", await B.inner_text("#score"), "|", await C.inner_text("#score"))
        await A.screenshot(path=os.path.join(HERE, "net_A.png")); await B.screenshot(path=os.path.join(HERE, "net_B.png")); await C.screenshot(path=os.path.join(HERE, "net_C.png"))
        print("ERRORS:", {k: v for k, v in errs.items() if v} or "none")
        await b.close()

asyncio.run(run())
