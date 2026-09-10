"""PC LINK without a camera: a 'phone' page (fake camera = still image) shows its code under PC LINK; a 'PC' page with NO
camera (headless has none) must still be able to tap PC LINK, enter that code, reload as the screen and receive hands.
Serve docs/ on :8765 first.   python web_link_test.py"""
import asyncio, os, re
from playwright.async_api import async_playwright

BASE = "http://localhost:8765/"
ARGS = ["--enable-gpu", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"]

async def run():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="msedge", headless=True, args=ARGS)
        phone_ctx = await b.new_context(viewport={"width": 420, "height": 800}); phone = await phone_ctx.new_page()
        pc_ctx = await b.new_context(viewport={"width": 1200, "height": 700}); pc = await pc_ctx.new_page()
        errs = []
        for pg in (phone, pc):
            pg.on("pageerror", lambda e: errs.append(str(e)[:160]))
            pg.on("console", lambda m: errs.append(m.text[:160]) if m.type == "error" and "XNNPACK" not in m.text and "404" not in m.text else None)
        # phone: PC LINK shows the code in a prompt
        await phone.goto(BASE + "?img=victory.jpg", wait_until="load")
        await phone.wait_for_function("document.getElementById('net').textContent.startsWith('online as')", timeout=90000)
        code = {}
        async def on_phone_dialog(d):
            code["v"] = re.search(r"Your code: (\d{3,6})", d.message).group(1); await d.dismiss()
        phone.once("dialog", on_phone_dialog)
        await phone.click("#link"); await asyncio.sleep(1)
        print("phone code from PC LINK prompt:", code.get("v"), "| net:", await phone.inner_text("#net"))
        # PC: no camera -> status explains PC LINK; the button must work anyway
        await pc.goto(BASE, wait_until="load")
        await pc.wait_for_function("document.getElementById('status') && document.getElementById('status').textContent.includes('No camera')", timeout=60000)
        print("PC status:", (await pc.inner_text("#status")).replace("\n", " / ")[:160])
        async def on_pc_dialog(d):
            print("PC prompt:", d.message[:60].replace("\n", " "), "...")
            await d.accept(code["v"])
        pc.once("dialog", on_pc_dialog)
        await pc.click("#link")
        await pc.wait_for_url(re.compile(r"screen=\d{3,6}"), timeout=15000)
        await pc.wait_for_function("document.getElementById('net').textContent.startsWith('linked to')", timeout=60000)
        print("PC after link:", pc.url, "|", await pc.inner_text("#net"), "| body.screen:", await pc.evaluate("document.body.classList.contains('screen')"))
        await asyncio.sleep(4)
        # does the PC render the phone's hand? count visible hand groups in the scene
        vis = await pc.evaluate("() => { let n = 0; window.scene && window.scene.traverse(o => { if (o.isSkinnedMesh && o.visible) n++; }); return n; }")
        print("phone->PC hands received (net status):", await pc.inner_text("#net"), "| phone net:", await phone.inner_text("#net"))
        await pc.screenshot(path="link_pc.png"); await phone.screenshot(path="link_phone.png")
        print("ERRORS:", errs or "none")
        await b.close()

asyncio.run(run())
