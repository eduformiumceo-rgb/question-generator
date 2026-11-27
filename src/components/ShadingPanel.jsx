/**
 * ShadingPanel - the "Sheet Layout" card on the Shading Sheet tab: sheet style (BECE / WASSCE), colours, answer options, number of
 * questions, and the preview button. Split out of QuestionsGenerator.jsx.
 *
 * Props
 *   S, F             shared styles and font
 *   colourGroup      the colour picker node (shared with the Answer Booklet tab)
 *   style            "bece" | "wassce"          onStyle(id)
 *   options          4 | 5                      onOptions(n)
 *   questions        typed count, or null to follow the paper     onQuestions(n | null)
 *   count            the number of questions actually used
 *   autoCount        the number of objective questions in the paper (0 when unknown)
 *   maxQuestions     upper limit for the typed count
 *   onPreview        open the preview
 */
import React from "react";
import CardTitle from "./CardTitle.jsx";
import NumberField from "./NumberField.jsx";
import { sheetSizeSummary, printNote } from "../shadingSheet.js";

export default function ShadingPanel({ S, F, colourGroup, style: shadeStyle, onStyle, options: sheetOptions, onOptions, questions: sheetQuestions, onQuestions, count: shadeCount, autoCount: autoShadeCount, maxQuestions, onPreview }) {
  return (
            <div style={S.card} data-testid="shading-card">
        <CardTitle F={F} mb={14} desc="BECE prints two per A4 to cut; WASSCE prints one full A4 sheet per candidate.">Sheet layout</CardTitle>

        <div className="qa-group">
          <label style={S.lbl}>Sheet style</label>
          <div className="qa-choices" role="group" aria-label="Shading sheet style">
            {[
              { id: "bece", label: "BECE-type sheet", desc: "Same layout as the Ghana Education Service answer sheet, with your school's name and logo, in your school colours." },
              { id: "wassce", label: "WASSCE-type sheet", desc: "Full A4 sheet like the real WASSCE objective answer sheet: index-number grid, paper version, oval bubbles for every question, in your school colours." },
            ].map(o => (
              <button key={o.id} type="button" className="qa-choice" aria-pressed={shadeStyle === o.id} onClick={() => { onStyle(o.id); }}>
                <span className="qa-choice-t" style={{ fontFamily: F }}>{o.label}</span>
                <span className="qa-choice-d" style={{ fontFamily: F }}>{o.desc}</span>
              </button>
            ))}
          </div>
          <p className="qa-choice-sel" style={{ fontFamily: F }}>{shadeStyle === "wassce" ? "Full A4 sheet like the real WASSCE answer sheet: index-number grid, paper version and oval bubbles." : "Same layout as the Ghana Education Service answer sheet, with your school's name and logo."}</p>
        </div>

        {colourGroup}

        <div className="qa-group">
          <div className="eduq-grid-2">
            <div>
              <label style={S.lbl}>Answer options</label>
              {shadeStyle === "bece" ? (
                <div style={{ minHeight: 44, display: "flex", alignItems: "center", fontFamily: F, fontSize: 15, color: "var(--text)" }}>
                  <span><b>A to E</b> <span style={{ color: "var(--text-muted)" }}>on every question, as on the BECE sheet</span></span>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 8 }}>
                  {[{ n: 4, l: "A to D" }, { n: 5, l: "A to E" }].map(o => (
                    <button key={o.n} type="button" className="qa-chip" aria-pressed={sheetOptions === o.n} onClick={() => onOptions(o.n)}>{o.l}</button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label style={S.lbl}>Questions on the sheet</label>
              {sheetQuestions == null && shadeCount > 0 ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 44, fontFamily: F, fontSize: 15, color: "var(--text)" }}>
                  <span><b>{shadeCount}</b> <span style={{ color: "var(--text-muted)" }}>from your objective section</span></span>
                  <button type="button" style={S.sm} onClick={() => onQuestions(shadeCount)}>Change</button>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <NumberField min={1} max={maxQuestions} value={sheetQuestions ?? ""} onChange={v => onQuestions(v)} aria-label="Number of questions on the shading sheet" style={S.inp} />
                  {autoShadeCount > 0 && <button type="button" style={S.sm} onClick={() => onQuestions(null)}>Use paper's count</button>}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="qa-note" style={{ fontFamily: F, marginTop: 14 }}>
          {shadeCount
            ? sheetSizeSummary(shadeStyle, shadeCount, sheetOptions) + ". " + printNote(shadeStyle)
            : "No objective section in your paper yet. Type the number of questions above, or add an objective section on the Assessment tab."}
        </div>
        <div style={{ marginTop: 14 }}>
          <button type="button" className="qa-wide-btn" style={{ ...S.btn, height: 48, padding: "0 20px" }} disabled={!shadeCount} onClick={onPreview}>Preview &amp; print shading sheet</button>
        </div>
      </div>
  );
}
