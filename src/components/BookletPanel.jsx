/**
 * BookletPanel - the controls on the Answer Booklet tab (paper size, number of pages, ruling, examiner's table,
 * page numbers). Split out of QuestionsGenerator.jsx; it holds no state of its own beyond "custom pages is open".
 *
 * Props
 *   S, F                 shared styles and font
 *   colourGroup          the colour picker node (shared with the Shading Sheet tab)
 *   cfg                  { paper, pages, ruling, questions, pageNumbers }   (questions = null means "count from the paper")
 *   set                  (patch) => void   merge a change into cfg
 *   autoQuestions        number of hand-written questions in the paper (0 when unknown)
 *   questionCount        the count actually used for the examiner's table
 *   suggested            suggested page count (already rounded for the paper size)
 *   printed              pages actually printed for the chosen size
 *   sheets               number of A3 sheets (only meaningful for A3)
 *   onPreview            open the preview
 */
import React, { useState } from "react";
import CardTitle from "./CardTitle.jsx";
import NumberField from "./NumberField.jsx";
import { BOOKLET_PAPERS, BOOKLET_PAGE_OPTIONS, BOOKLET_MIN_PAGES, BOOKLET_MAX_PAGES, BOOKLET_MAX_QUESTIONS } from "../bookletSheet.js";

const RULINGS = [{ id: "lined", l: "Lined" }, { id: "graph", l: "Graph paper" }, { id: "plain", l: "Plain (diagrams)" }];

export default function BookletPanel({ S, F, colourGroup, cfg, set, autoQuestions, questionCount, suggested, printed, sheets, onPreview }) {
  const [customOpen, setCustomOpen] = useState(false);
  const isPreset = BOOKLET_PAGE_OPTIONS.includes(cfg.pages);
  const showCustom = customOpen || !isPreset;
  const a3 = cfg.paper === "a3";
  const rounded = a3 && printed !== cfg.pages;

  return (
    <div style={S.card} data-testid="booklet-card">
      <CardTitle F={F} mb={14} desc="For your structured and essay questions: a cover with your school's masthead, the examiner's marks table and answer pages with a question-number margin. Subject and class are left blank for the candidate to write. Choose A4 pages, or A3 sheets that fold in half.">Answer Booklet</CardTitle>
      {colourGroup}
      <div className="qa-group">
        <label style={S.lbl}>Paper size</label>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }} role="group" aria-label="Booklet paper size">
          {BOOKLET_PAPERS.map(o => (
            <button key={o.id} type="button" className="qa-chip" aria-pressed={cfg.paper === o.id} onClick={() => set({ paper: o.id })}>{o.label}</button>
          ))}
        </div>
        <div className="qa-note" style={{ fontFamily: F, marginTop: 8 }}>{BOOKLET_PAPERS.find(o => o.id === cfg.paper).desc}</div>
      </div>
      <div className="qa-group">
        <div className="eduq-grid-2">
          <div>
            <label style={S.lbl} id="bk-pages-label">Pages in the booklet</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }} role="group" aria-labelledby="bk-pages-label">
              {BOOKLET_PAGE_OPTIONS.map(n => (
                <button key={n} type="button" className="qa-chip" aria-pressed={cfg.pages === n && !showCustom} onClick={() => { setCustomOpen(false); set({ pages: n }); }}>{n}</button>
              ))}
              <button type="button" className="qa-chip" aria-pressed={showCustom} onClick={() => setCustomOpen(true)}>Custom</button>
            </div>
            {showCustom && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
                <NumberField min={BOOKLET_MIN_PAGES} max={BOOKLET_MAX_PAGES} value={cfg.pages} onChange={v => set({ pages: v })} aria-label="Custom number of pages" style={{ ...S.inp, width: 96 }} />
                <span className="qa-note" style={{ fontFamily: F }}>pages ({BOOKLET_MIN_PAGES} to {BOOKLET_MAX_PAGES}, cover included)</span>
              </div>
            )}
            {rounded && <div className="qa-note" style={{ fontFamily: F, marginTop: 8 }} data-testid="booklet-rounded">An A3 booklet folds from whole sheets of 4 pages, so {cfg.pages} prints as {printed}.</div>}
            {suggested > 0 && suggested !== printed && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, flexWrap: "wrap", fontFamily: F, fontSize: 13, color: "var(--text-muted)" }} data-testid="booklet-suggest">
                <span>Suggested for your paper: <b style={{ color: "var(--text)" }}>{suggested}</b></span>
                <button type="button" style={S.sm} onClick={() => { setCustomOpen(false); set({ pages: suggested }); }}>Use {suggested}</button>
              </div>
            )}
          </div>
          <div>
            <label style={S.lbl}>Answer pages</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {RULINGS.map(o => (
                <button key={o.id} type="button" className="qa-chip" aria-pressed={cfg.ruling === o.id} onClick={() => set({ ruling: o.id })}>{o.l}</button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="qa-group">
        <label style={S.lbl}>Page numbers</label>
        <div style={{ display: "flex", gap: 8 }} role="group" aria-label="Page numbers">
          <button type="button" className="qa-chip" aria-pressed={cfg.pageNumbers} onClick={() => set({ pageNumbers: true })}>Show</button>
          <button type="button" className="qa-chip" aria-pressed={!cfg.pageNumbers} onClick={() => set({ pageNumbers: false })}>Hide</button>
        </div>
      </div>
      <div className="qa-group">
        <label style={S.lbl}>Questions in the examiner's table</label>
        {cfg.questions == null && autoQuestions > 0 ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 44, fontFamily: F, fontSize: 14, color: "var(--text)" }}>
            <span><b>{questionCount}</b> <span style={{ color: "var(--text-muted)" }}>from your structured / essay sections</span></span>
            <button type="button" style={S.sm} onClick={() => set({ questions: questionCount })}>Change</button>
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <NumberField min={1} max={BOOKLET_MAX_QUESTIONS} value={cfg.questions ?? questionCount} onChange={v => set({ questions: v })} aria-label="Number of questions in the examiner's table" style={S.inp} />
            {autoQuestions > 0 && <button type="button" style={S.sm} onClick={() => set({ questions: null })}>Use paper's count</button>}
          </div>
        )}
      </div>
      <div className="qa-note" style={{ fontFamily: F, marginTop: 14, lineHeight: 1.6 }}>
        Uses the school name, logo, colours and cover details of your question paper. Subject and class are left empty for candidates to fill in. {a3
          ? `${printed} pages on ${sheets} A3 landscape sheets (imposed so they fold into a booklet). Print on A3 at 100%, double-sided, flip on the short edge, fold in half and staple on the fold.`
          : `${printed} A4 pages (cover + ${printed - 1} answer pages). Print on A4 portrait at 100%, double-sided, and staple at the left.`}
      </div>
      <div style={{ marginTop: 14 }}>
        <button type="button" style={{ ...S.btn, height: 44, padding: "0 20px" }} onClick={onPreview}>Preview &amp; print answer booklet</button>
      </div>
    </div>
  );
}
