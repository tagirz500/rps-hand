"""The owner's failure: the phone page was already open, then the screen's QR opened a SECOND phone tab. Both tabs must come
online (different codes) and the QR tab must link to the screen. Also: the SCREEN page reloads while the phone is linked -
it must keep its number (wait out its own stale registration) and the phone must re-link to the same code.
Serve docs/ on :8765 first (or RPS_BASE=<url>).   python web_tabs_test.py"""
import asyncio, os
from playwright.async_api import async_playwright

BASE = os.environ.get("RPS_BASE", "http://localhost:8765/")
ARGS = ["--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"]

async def run():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True, args=ARGS)
        pc_ctx = await b.new_context(viewport={"width": 1200, "height": 700}); phone_ctx = await b.new_context(viewport={"width": 420, "height": 800})
        errs = []
        def watch(pg): pg.on("pageerror", lambda e: errs.append(str(e)[:160])); pg.on("console", lambda m: errs.append(m.text[:160]) if m.type == "error" and "XNNPACK" not in m.text and "404" not in m.text else None)
        pc = await pc_ctx.new_page(); watch(pc); await pc.goto(BASE + "?screen", wait_until="load")
        await pc.wait_for_function("document.getElementById('net').textContent.startsWith('screen')", timeout=60000)
        sc = await pc.inner_text("#pairCode"); print("screen code:", sc)
        # tab 1: the phone page already open in track mode
        t1 = await phone_ctx.new_page(); watch(t1); await t1.goto(BASE + "?img=victory.jpg&role=track", wait_until="load")
        await t1.wait_for_function("document.getElementById('net').textContent.startsWith('online as')", timeout=90000)
        c1 = (await t1.inner_text("#net")).split("online as ")[1].strip(); print("tab1:", await t1.inner_text("#net"))
        # tab 2: opened from the screen's QR while tab 1 is still open
        t2 = await phone_ctx.new_page(); watch(t2); await t2.goto(f"{BASE}?img=victory.jpg&pair={sc}", wait_until="load")
        await t2.wait_for_function("document.getElementById('net').textContent.startsWith('PC linked')", timeout=90000)
        await pc.wait_for_function("document.getElementById('net').textContent.startsWith('linked to phone')", timeout=30000)
        c2 = (await pc.inner_text("#net")).split("linked to phone ")[1].strip()
        print("tab2:", await t2.inner_text("#net"), "| tab1 still:", await t1.inner_text("#net"), "| codes differ:", c1 != c2, f"({c1} vs {c2})", "| screen:", await pc.inner_text("#net"))
        # the screen reloads: keeps its number, phone re-links
        await pc.reload(wait_until="load")
        await pc.wait_for_function("/^d{3}$/.test(document.getElementById('pairCode').textContent.trim())", timeout=30000)
        sc2 = await pc.inner_text("#pairCode")
        await pc.wait_for_function("document.getElementById('net').textContent.startsWith('linked to phone')", timeout=120000)
        print("screen after reload: code", sc2, "(same:", sc2 == sc, ") |", await pc.inner_text("#net"), "| tab2:", await t2.inner_text("#net"))
        print("ERRORS:", errs or "none")
        await b.close()

asyncio.run(run())
