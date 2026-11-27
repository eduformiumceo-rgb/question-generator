# Changes in this round

**Answer booklet and shading sheets**
- Subject and class are never printed. The booklet cover has empty SUBJECT / CLASS write-in lines; both shading sheets have an empty CLASS box beside SUBJECT, and the class is gone from the sheet heading.
- Pages: presets from 4, a Custom field (2 to 40), A3 rounds up to a multiple of 4. Suggested page count from your structured / essay questions.
- Page numbers: Show / Hide toggle.
- Graph paper ruling (5 mm squares), a 40-question examiner's table, fold marks with a white halo so they show over the masthead.
- WASSCE sheet rows spread to fill the page on short papers.

**Scan reader (`src/omrReader.js`)**
- Reads sheets turned a quarter turn either way, as well as upside down.
- Hatched, scribbled and light pencil: marks are judged against the blanks of the same row, on the sides of each bubble (away from the printed letter).
- Page curl and tilt: each row / index column is snapped onto its printed outline; a per-digit printing bias is removed.
- Mark thresholds are relative; faint marks are read but flagged for review.

**Scan screen**
- Marks for each question (default 1, half marks allowed).
- Index numbers are editable, with undo; duplicates, scores and the CSV follow the corrected number.

**Code**
- `QuestionsGenerator.jsx` split: `BookletPanel`, `ShadingPanel`, `FormControls`, `examApi.js`.

**Tests**
- `tests/omr.robust.test.js`, `tests/sheetCounts.test.js`, extended booklet / sheet / scan-marker tests.
- Real-browser end-to-end: `npm run e2e` (needs `pip install playwright pillow numpy` and `playwright install chromium`).

---
# UI clean-up round

- One type scale for the whole app (12 / 13 / 15 / 17 / 20 px). The 19 near-identical sizes were collapsed; hierarchy now comes from size, weight and colour.
- Labels are sentence case (no more shouting uppercase). Page titles 700, not 800.
- Long help text is small and folds behind an (i) button or a "Details" link on phones (`CardTitle`, `Hint`).
- Difficulty, marking scheme and diagrams are fold-away cards with a one-line summary (`FoldCard`); open by default on desktop, closed on phones.
- Exam Structure Builder rebuilt so the Questions / Marks fields line up.
- School fields: tidy logo row; colours are swatches with the chosen name shown.
- Booklet and Shading pages: shorter hero text and card descriptions, full-width main buttons on phones.
- Fields are 16px on phones (stops iOS zooming in), buttons and nav use the app font.
- Edit tokens in `src/theme.css` ("CLEAN UI LAYER") and `src/sharedStyles.jsx`.
