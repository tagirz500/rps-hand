"""Screen pairing, new direction: a SCREEN page (no camera) shows its 3-digit code + QR; a phone page opened from the QR
(?pair=<code>) or via PC LINK dials it. Also order independence: the phone dials a screen that is not open yet, keeps
waiting, and links when the screen appears; and the screen survives a phone reload.
Serve docs/ on :8765 first (or RPS_BASE=<url>).   python web_link_test.py"""
import asyncio, os, re
from playwright.async_api import async_playwright

BASE = os.environ.get("RPS_BASE", "http://localhost:8765/")
ARGS = ["--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"]

async def run():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True, args=ARGS)
        pc_ctx = await b.new_context(viewport={"width": 1200, "height": 700}); phone_ctx = await b.new_context(viewport={"width": 420, "height": 800})
        errs = []
        def watch(pg): pg.on("pageerror", lambda e: errs.append(str(e)[:160])); pg.on("console", lambda m: errs.append(m.text[:160]) if m.type == "error" and "XNNPACK" not in m.text and "404" not in m.text else None)
        # 1. screen up first: shows code + QR
        pc = await pc_ctx.new_page(); watch(pc); await pc.goto(BASE + "?screen", wait_until="load")
        await pc.wait_for_function("document.getElementById('net').textContent.startsWith('screen')", timeout=60000)
        sc = await pc.inner_text("#pairCode"); qr = await pc.evaluate("!!document.querySelector('#qr img, #qr canvas')")
        print("screen:", await pc.inner_text("#net"), "| code shown:", sc, "| QR drawn:", qr, "| url:", await pc.inner_text("#pairUrl"))
        # 2. phone from the QR link: track-only layout, auto-link
        phone = await phone_ctx.new_page(); watch(phone); await phone.goto(f"{BASE}?img=victory.jpg&pair={sc}", wait_until="load")
        await phone.wait_for_function("document.getElementById('net').textContent.startsWith('PC linked')", timeout=90000)
        await pc.wait_for_function("document.getElementById('net').textContent.startsWith('linked to phone')", timeout=30000)
        print("phone:", await phone.inner_text("#net"), "| track layout:", await phone.evaluate("document.body.classList.contains('track')"), "| screen:", await pc.inner_text("#net"), "| pair overlay hidden:", await pc.evaluate("document.getElementById('pair').hidden"))
        await phone.wait_for_function("document.getElementById('hand').textContent.length > 12", timeout=90000)   # the phone's tracker is up
        await pc.wait_for_function("[...window.dbgRemote.values()].some(r => r.a && performance.now() - r.t < 1000)", timeout=30000)
        fresh = "() => [...window.dbgRemote.keys()].filter(k => { const r = window.dbgRemote.get(k); return r.a && performance.now() - r.t < 1000; })"
        print("phone tracks:", await phone.inner_text("#hand"), "| screen draws:", await pc.evaluate(fresh))
        await asyncio.sleep(2); await pc.screenshot(path="link_pc.png"); await phone.screenshot(path="link_phone.png")
        # 3. phone reload -> screen shows the pairing overlay again, then re-links
        await phone.reload(wait_until="load")
        await pc.wait_for_function("document.getElementById('net').textContent.startsWith('linked to phone')", timeout=60000)
        print("after phone reload -> screen:", await pc.inner_text("#net"), "| phone:", await phone.inner_text("#net"))
        # 4. order independence: close the screen, phone dials it via PC LINK prompt while it is gone, then the screen returns
        await pc.close(); await phone.close(); await asyncio.sleep(3)   # one phone tab at a time: a second tab would find its own code still registered
        phone2 = await phone_ctx.new_page(); watch(phone2); await phone2.goto(f"{BASE}?img=victory.jpg&role=track", wait_until="load")
        await phone2.wait_for_function("document.getElementById('net').textContent.startsWith('online as')", timeout=90000)
        phone2.once("dialog", lambda d: asyncio.ensure_future(d.accept(sc)))
        await phone2.click("#link"); await asyncio.sleep(6)
        print("phone while screen is gone:", await phone2.inner_text("#net"))
        pc2 = await pc_ctx.new_page(); watch(pc2); await pc2.goto(BASE + "?screen", wait_until="load")
        await pc2.wait_for_function("document.getElementById('net').textContent.startsWith('linked to phone')", timeout=60000)
        await phone2.wait_for_function("document.getElementById('net').textContent.startsWith('PC linked')", timeout=30000)
        print("screen back:", await pc2.inner_text("#net"), "| phone:", await phone2.inner_text("#net"))
        print("ERRORS:", errs or "none")
        await b.close()

asyncio.run(run())
