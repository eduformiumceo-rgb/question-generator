/**
 * Prepare the end-to-end fixtures (run through e2e/run.sh):
 *  1. render the REAL printed WASSCE sheet (the app's own HTML) in Chromium at 12 px/mm      -> OUT/real/w40.gray
 *  2. paint realistic pencil on it and "scan" it three awkward ways (sideways, upside down, curled) -> OUT/scan_*.png + truth.json
 * Chromium comes from Playwright for Python (pip install playwright; playwright install chromium).
 */
import fs from "fs"; import path from "path"; import { execFileSync } from "child_process"; import { fileURLToPath } from "url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."), OUT = process.env.E2E_OUT || "/tmp/eduq-e2e";
fs.mkdirSync(path.join(OUT, "real"), { recursive: true });
const { renderShadingSheetHTML } = await import(path.join(ROOT, "src/shadingSheet.js"));
const { drawSheet, scan, randomPupil } = await import(path.join(ROOT, "tests/helpers/omrRaster.js"));
const meta = { schoolName: "Achimota Senior High School", term: "Term 2", examType: "Mock Exam", idMode: "boxes", idDigits: 10, examVersion: "B", subject: "Mathematics", className: "SHS 3" };
fs.writeFileSync(path.join(OUT, "real/w40.html"), renderShadingSheetHTML({ style: "wassce", questions: 40, optionCount: 4, colourMode: "school", colours: { main: "#12285C" }, meta }));
execFileSync("python3", [path.join(ROOT, "e2e/shoot_sheet.py"), path.join(OUT, "real")], { stdio: "inherit" });

const D = Math.PI / 180, m = JSON.parse(fs.readFileSync(path.join(OUT, "real/w40.json"))), g = fs.readFileSync(path.join(OUT, "real/w40.gray"));
const img = new Float32Array(g.length); for (let i = 0; i < g.length; i++) img[i] = Math.max(0, Math.min(1, (255 - g[i]) / 215));
const printed = { img, W: m.W, H: m.H, ppm: m.W / 210 };
const specs = [["sideways_hatch", { strokes: "hatch", pencil: .45 }, { angle: 90 * D }, 11], ["upside_down_light", { strokes: "hatch", pencil: .33 }, { angle: 180 * D }, 12], ["curled_scribble", { strokes: "scribble", pencil: .4 }, { curl: { mm: 2.5, side: "right", bow: 1.5 }, shade: .15 }, 13]];
const truth = {};
for (const [name, dr, sc, seed] of specs) {
  const pupil = randomPupil(40, 4, 10, seed, { blanks: 0, doubles: 0 });
  const out = scan(drawSheet({ n: 40, optionCount: 4, digits: 10, pupil, ...dr, seed, ppm: printed.ppm, printed }), { seed, outPpm: 7, ...sc });
  const gray = Buffer.alloc(out.width * out.height); for (let i = 0; i < gray.length; i++) gray[i] = out.data[i * 4];
  fs.writeFileSync(path.join(OUT, `${name}.gray`), gray); truth[name] = { index: pupil.index, answers: pupil.answers.join(""), w: out.width, h: out.height };
}
fs.writeFileSync(path.join(OUT, "truth.json"), JSON.stringify(truth, null, 1));
execFileSync("python3", [path.join(ROOT, "e2e/gray_to_png.py"), OUT], { stdio: "inherit" });
console.log("fixtures ready in", OUT);
