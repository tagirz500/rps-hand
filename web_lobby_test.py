"""Lobbies + quick match, four players in separate browser contexts through the real PeerJS broker:
  A creates a lobby; B opens the lobby list, sees it, JOINs -> matched.  C quick-matches with no open room -> opens one and
  waits; D quick-matches -> joins C.  Then A (two hands, first person) is screenshotted with B's hands across the table, and
  the start screen is checked (PHONE / PC SCREEN). Serve docs/ on :8765 first (or RPS_BASE=<url>).   python web_lobby_test.py"""
import asyncio, os
from playwright.async_api import async_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
BASE = os.environ.get("RPS_BASE", "http://localhost:8765/")
ARGS = ["--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"]

async def run():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True, args=ARGS)
        errs = {}
        async def player(name, img, w=420, h=800):
            ctx = await b.new_context(viewport={"width": w, "height": h}); pg = await ctx.new_page(); errs[name] = []
            pg.on("pageerror", lambda e, n=name: errs[n].append(str(e)[:160]))
            pg.on("console", lambda m, n=name: errs[n].append(m.text[:160]) if m.type == "error" and "XNNPACK" not in m.text and "404" not in m.text else None)
            await pg.goto(f"{BASE}?img={img}", wait_until="load")
            await pg.wait_for_function("document.getElementById('net').textContent.startsWith('online as')", timeout=90000)
            return pg
        net = lambda pg: pg.inner_text("#net")
        # start screen (no query): both choices present
        s = await (await b.new_context()).new_page(); await s.goto(BASE, wait_until="load")
        print("start screen:", await s.evaluate("() => !document.getElementById('start').hidden"), "| buttons:", [await s.inner_text(x) for x in ("#pickTrack", "#pickScreen", "#pickBoth")])
        await s.click("#pickScreen"); await s.wait_for_url(lambda u: "screen" in u, timeout=10000); print("SCREEN choice ->", s.url.split("?")[1])
        await s.context.close()

        A = await player("A", "woman_hands.jpg", 900, 600); B = await player("B", "victory.jpg")
        print("A", await net(A), "| B", await net(B))
        # A creates a lobby
        await A.click("#online"); await A.click("#create")
        await A.wait_for_function("document.getElementById('net').textContent.startsWith('lobby')", timeout=30000); print("A:", await net(A))
        # B lists and joins
        await B.click("#online")
        await B.wait_for_function("document.getElementById('rooms').textContent.includes('Lobby')", timeout=20000)
        print("B sees:", (await B.inner_text("#rooms")).replace("\n", " | "))
        await B.click("#rooms .lb")
        for pg, n in ((A, "A"), (B, "B")):
            await pg.wait_for_function("document.getElementById('net').textContent.startsWith('matched')", timeout=30000); print(n, await net(pg))
        # C quick match -> creates; D quick match -> joins C
        C = await player("C", "test/peace.jpg"); D = await player("D", "test/raised_fist.jpg")
        await C.click("#online"); await C.click("#quick")
        await C.wait_for_function("document.getElementById('net').textContent.startsWith('lobby')", timeout=30000); print("C:", await net(C))
        await D.click("#online"); await D.click("#quick")
        for pg, n in ((C, "C"), (D, "D")):
            await pg.wait_for_function("document.getElementById('net').textContent.startsWith('matched')", timeout=40000); print(n, await net(pg))
        # A: first person with B's hands across the table
        fresh = "() => [...window.dbgRemote.keys()].filter(k => { const r = window.dbgRemote.get(k); return r.a && performance.now() - r.t < 1000; })"
        for pg in (A, B):
            await pg.evaluate("() => { const v = document.getElementById('view'); while (!v.textContent.includes('first person')) v.click(); }")
            await pg.wait_for_function("[...window.dbgRemote.values()].some(r => r.a && performance.now() - r.t < 1000)", timeout=30000)
        await asyncio.sleep(3)
        print("A draws opponent hands:", await A.evaluate(fresh), "| B draws opponent hands:", await B.evaluate(fresh))
        await A.screenshot(path=os.path.join(HERE, "lobby_A_fp.png")); await B.screenshot(path=os.path.join(HERE, "lobby_B_fp.png"))
        print("A hands line:", await A.inner_text("#hand"), "| view:", await A.inner_text("#view"))
        print("ERRORS:", {k: v for k, v in errs.items() if v} or "none")
        await b.close()

asyncio.run(run())
