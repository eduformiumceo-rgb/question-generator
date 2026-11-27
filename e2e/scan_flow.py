"""End-to-end: the whole scan-and-mark flow in a real browser (see e2e/run.sh)."""
import json, os, re, sys
OUT = os.environ.get("E2E_OUT", "/tmp/eduq-e2e"); BASE = os.environ.get("E2E_URL", "http://127.0.0.1:4173")
from playwright.sync_api import sync_playwright, expect
T = json.load(open(f"{OUT}/truth.json"))
names = ["sideways_hatch", "upside_down_light", "curled_scribble"]
key = T["sideways_hatch"]["answers"]                       # the answer key: sheet 1 matches it exactly
def expected_score(ans): return sum(1 for a, k in zip(ans, key) if a == k)
fails = []
def check(label, cond, detail=""):
    print(("PASS  " if cond else "FAIL  ") + label + (f"   [{detail}]" if detail and not cond else ""))
    if not cond: fails.append(label)

with sync_playwright() as p:
    b = p.chromium.launch(); pg = b.new_page(viewport={"width": 1100, "height": 1600}); pg.set_default_timeout(60000)
    errors = []; pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.goto(f"{BASE}/#shading"); pg.wait_for_selector("[data-testid=shading-tab]")
    pg.locator("select:visible", has=pg.locator("option", has_text="SHS 3")).first.select_option(label="SHS 3")
    pg.get_by_role("button", name=re.compile("WASSCE-type sheet")).click()
    pg.get_by_role("button", name="Custom", exact=True).click()
    pg.get_by_label("Number of questions on the shading sheet").fill("40")
    check("scan card appears for the WASSCE sheet", pg.locator("[data-testid=scan-card]").count() == 1)

    # the sheet itself: class and subject are blank write-in boxes, not printed
    pg.get_by_role("button", name=re.compile("Preview & print shading sheet")).click()
    pg.wait_for_selector("iframe"); fr = pg.frame_locator("iframe").first
    fr.locator("body").wait_for(); pg.wait_for_timeout(800)
    text = fr.locator("body").inner_text()
    check("printed sheet has an empty CLASS box and SUBJECT box", "CLASS" in text and "SUBJECT" in text)
    check("printed sheet does not print the class (SHS 3) anywhere", "SHS 3" not in text, text[:200])
    pg.screenshot(path=f"{OUT}/shading_preview.png")
    pg.keyboard.press("Escape")
    if pg.locator("iframe").count():
        for nm in ["Close", "Back", "Done"]:
            btn = pg.get_by_role("button", name=re.compile(nm))
            if btn.count(): btn.first.click(); break

    pg.get_by_label("Answer key typed in order").fill(key)
    pg.get_by_test_id("scan-input").set_input_files([f"{OUT}/scan_{n}.png" for n in names])
    pg.wait_for_selector("[data-testid=scan-results] tbody tr:nth-child(3)")
    pg.wait_for_function("document.querySelectorAll('[data-testid=scan-results] tbody tr').length===3 && ![...document.querySelectorAll('[data-testid=scan-results] tbody tr')].some(r=>/Reading/.test(r.innerText))")
    rows = pg.locator("[data-testid=scan-results] tbody tr")
    for i, n in enumerate(names):
        r = rows.nth(i); idx = r.locator("input").input_value(); txt = r.inner_text()
        check(f"[{n}] index number read correctly ({T[n]['index']})", idx == T[n]["index"], idx)
        check(f"[{n}] score {expected_score(T[n]['answers'])} / 40", f"{expected_score(T[n]['answers'])} / 40" in txt, txt.replace("\n", " "))
    check("no sheet was rejected (no error rows)", "Could not" not in pg.locator("[data-testid=scan-results]").inner_text())

    # marks per question
    pg.get_by_label("Marks for each question").fill("2")
    pg.wait_for_function("document.querySelector('[data-testid=scan-results]').innerText.includes('80 / 80')")
    check("marks per question 2 doubles the score (80 / 80)", True)
    pg.get_by_label("Marks for each question").fill("0.5")
    pg.wait_for_function("document.querySelector('[data-testid=scan-results]').innerText.includes('20 / 20')")
    check("half marks work (20 / 20)", True)
    pg.get_by_label("Marks for each question").fill("1")

    # editable index number
    box = rows.nth(1).locator("input"); box.fill("1111111111")
    check("an index number can be corrected", rows.nth(1).locator("input").input_value() == "1111111111" and "Corrected" in rows.nth(1).inner_text())
    # duplicate warning: give sheet 3 the same number
    rows.nth(2).locator("input").fill("1111111111")
    check("a duplicate index number is flagged", pg.locator("[data-testid=scan-results]").inner_text().count("Duplicate index number") == 2)
    rows.nth(2).locator("input").fill(T["curled_scribble"]["index"])
    check("fixing the duplicate clears the warning", "Duplicate" not in pg.locator("[data-testid=scan-results]").inner_text())

    # CSV
    with pg.expect_download() as dl:
        pg.get_by_role("button", name=re.compile("Download results")).click()
    csv = open(dl.value.path(), encoding="utf-8-sig", newline="").read()
    check("CSV has the corrected index number", '"1111111111"' in csv)
    check("CSV has all three sheets", csv.count("\r\n") == 3, str(csv.count("\r\n")))
    pg.screenshot(path=f"{OUT}/scan_result.png", full_page=True)
    check("no uncaught page errors", not errors, "; ".join(errors)[:300])
    b.close()
print("\nFAILED:" if fails else "\nALL PASSED", fails if fails else "")
sys.exit(1 if fails else 0)
