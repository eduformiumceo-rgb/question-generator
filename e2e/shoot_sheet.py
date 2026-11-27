import sys, json
from playwright.sync_api import sync_playwright
from PIL import Image
import numpy as np
d = sys.argv[1]; PPM = 12.0
with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 900, "height": 1200}, device_scale_factor=PPM / 3.7795275591)
    pg.goto(f"file://{d}/w40.html"); pg.wait_for_timeout(500)
    pg.locator("section.sheet").first.screenshot(path=f"{d}/w40.png")
    a = np.array(Image.open(f"{d}/w40.png").convert("L"), dtype=np.uint8); a.tofile(f"{d}/w40.gray")
    json.dump({"W": a.shape[1], "H": a.shape[0]}, open(f"{d}/w40.json", "w")); b.close()
