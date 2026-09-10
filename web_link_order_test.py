"""PC LINK order independence: the PC enters a code BEFORE the phone page exists (peer-unavailable), keeps waiting, and
links as soon as the phone comes online. Then the phone page reloads (its code is briefly still registered at the broker)
and must come back as "online as <code>" and the PC must re-link. Serve docs/ on :8765 first.  python web_link_order_test.py"""
import asyncio, os, re
from playwright.async_api import async_playwright

BASE = "http://localhost:8765/"
ARGS = ["--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"]

async def run():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True, args=ARGS)
        phone_ctx = await b.new_context(viewport={"width": 420, "height": 800})
        pc_ctx = await b.new_context(viewport={"width": 1200, "height": 700})
        errs = []
        # learn the phone's code once (it persists in the phone context), then close that page
        phone = await phone_ctx.new_page(); await phone.goto(BASE + "?img=victory.jpg", wait_until="load")
        await phone.wait_for_function("document.getElementById('net').textContent.startsWith('online as')", timeout=90000)
        code = (await phone.inner_text("#net")).split("online as ")[1].strip(); print("phone code:", code)
        await phone.close(); await asyncio.sleep(2)
        # PC first: link to a code that is NOT registered yet
        pc = await pc_ctx.new_page(); pc.on("pageerror", lambda e: errs.append(str(e)[:160]))
        await pc.goto(BASE + "?screen=" + code, wait_until="load")
        for i in range(4):
            await asyncio.sleep(2.5); print(f"  PC t+{(i+1)*2.5:.1f}s:", await pc.inner_text("#net"))
        # now the phone opens: the PC must link within a few seconds
        phone = await phone_ctx.new_page(); phone.on("pageerror", lambda e: errs.append(str(e)[:160]))
        await phone.goto(BASE + "?img=victory.jpg", wait_until="load")
        t0 = asyncio.get_event_loop().time()
        await pc.wait_for_function("document.getElementById('net').textContent.startsWith('linked to')", timeout=60000)
        print(f"PC linked {asyncio.get_event_loop().time() - t0:.1f}s after the phone page opened:", await pc.inner_text("#net"))
        await phone.wait_for_function("document.getElementById('net').textContent === 'PC linked'", timeout=30000); print("phone:", await phone.inner_text("#net"))
        # phone reload: stale registration handling + PC re-link
        await phone.reload(wait_until="load")
        await phone.wait_for_function("document.getElementById('net').textContent.startsWith('online as') || document.getElementById('net').textContent === 'PC linked'", timeout=90000)
        print("phone after reload:", await phone.inner_text("#net"))
        await pc.wait_for_function("document.getElementById('net').textContent.startsWith('linked to')", timeout=60000)
        await asyncio.sleep(2); print("PC after phone reload:", await pc.inner_text("#net"), "| phone:", await phone.inner_text("#net"))
        print("ERRORS:", errs or "none")
        await b.close()

asyncio.run(run())
