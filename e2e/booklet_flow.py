"""End-to-end: the Answer Booklet tab in a real browser: custom page count, page-number toggle, graph paper, blank subject and class."""
import os, re, sys
from playwright.sync_api import sync_playwright
OUT = os.environ.get("E2E_OUT", "/tmp/eduq-e2e"); BASE = os.environ.get("E2E_URL", "http://127.0.0.1:4173")
fails = []
def check(label, cond, detail=""):
    print(("PASS  " if cond else "FAIL  ") + label + (f"   [{detail}]" if detail and not cond else ""))
    if not cond: fails.append(label)

with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1100, "height": 1600}); pg.set_default_timeout(30000)
    errors = []; pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(f"{BASE}/#booklet"); pg.wait_for_selector("[role=tab]")
    pg.locator("select:visible", has=pg.locator("option", has_text="SHS 3")).first.select_option(label="SHS 3")
    pg.wait_for_selector("[data-testid=booklet-card]")

    chips = [c.inner_text() for c in pg.locator("[data-testid=booklet-card] button.qa-chip").all()]
    check("page choices start at 4 and offer a Custom option", "4" in chips and "Custom" in chips, str(chips))
    pg.get_by_role("button", name="Custom", exact=True).click()
    custom = pg.get_by_label("Custom number of pages"); custom.fill("6")
    check("a custom page count can be typed", custom.input_value() == "6")
    pg.get_by_role("button", name="Hide", exact=True).click()
    check("page numbers can be switched off", pg.get_by_role("button", name="Hide", exact=True).get_attribute("aria-pressed") == "true")
    pg.get_by_role("button", name="Graph paper").click()
    pg.get_by_label("Number of questions in the examiner's table").fill("40")

    pg.get_by_role("button", name=re.compile("Preview & print answer booklet")).click()
    pg.wait_for_selector("iframe"); fr = pg.frame_locator("iframe").first; fr.locator("body").wait_for(); pg.wait_for_timeout(800)
    text = fr.locator("body").inner_text()
    check("the booklet has exactly 6 pages", fr.locator("section.page").count() == 6, str(fr.locator("section.page").count()))
    check("no page number is printed ('Page 1 of' absent, no inner numbers)", "Page 1 of" not in text and fr.locator(".ipn").count() == 0)
    check("5 graph-paper answer pages", fr.locator("svg.ruled.graph").count() == 5, str(fr.locator("svg.ruled.graph").count()))
    check("examiner's table lists 40 questions", fr.locator("td.qq").count() == 40, str(fr.locator("td.qq").count()))
    check("SUBJECT and CLASS are empty write-in fields", fr.locator(".wrow").count() == 2 and "SHS 3" not in text, text[:160])
    pg.screenshot(path=f"{OUT}/booklet_preview.png")
    check("no uncaught page errors", not errors, "; ".join(errors)[:300])
    b.close()
print("\nFAILED:" if fails else "\nALL PASSED", fails if fails else ""); sys.exit(1 if fails else 0)
