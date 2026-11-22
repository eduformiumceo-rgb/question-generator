/**
 * PaperAudit
 * Moderator-style check of the finished paper plus its Table of Specification.
 * Re-runs on every edit (pure and offline, no credits). One-click repairs
 * for the faults that have a single safe fix (answer key, part marks, total).
 */
import React, { useMemo, useState } from "react";
import { auditExam, applyAuditFix } from "../paperAudit.js";
import { buildSpec } from "../tableOfSpec.js";

const COLORS = {
  error: { fg: "#B91C1C", bg: "rgba(220,38,38,.08)", label: "Fix" },
  warn:  { fg: "#B45309", bg: "rgba(217,119,6,.09)", label: "Check" },
  tip:   { fg: "#0F766E", bg: "rgba(13,148,136,.08)", label: "Tip" },
};
const FIX_LABEL = { "sync-answer-key": "Rebuild answer key", "marks-from-parts": "Set marks from parts", "total-marks": "Fix total marks" };

export default function PaperAudit({ examData, setExamData, targetLevels = [], S, F }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("audit");
  const audit = useMemo(() => auditExam(examData), [examData]);
  const spec = useMemo(() => buildSpec(examData, { targetLevels }), [examData, targetLevels]);
  if (!examData) return null;

  const { score, errors, warnings, tips, findings } = audit;
  const tone = errors ? COLORS.error : warnings ? COLORS.warn : COLORS.tip;
  const fixes = [...new Set(findings.map(f => f.fix).filter(Boolean))];
  const chip = (label, active, onClick) => (
    <button type="button" onClick={onClick} aria-pressed={active} style={{
      border: `1.5px solid ${active ? "#0D9488" : "var(--border-strong)"}`, background: active ? "rgba(13,148,136,.1)" : "transparent",
      color: active ? "#0D9488" : "var(--text-secondary)", borderRadius: 99, padding: "5px 14px", fontSize: 12.5, fontWeight: 600, cursor: "pointer", fontFamily: F,
    }}>{label}</button>
  );

  return (
    <div style={{ ...S.card, padding: "18px 22px" }} data-testid="paper-audit">
      <button type="button" onClick={() => setOpen(o => !o)} aria-expanded={open}
        style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, width: "100%" }}>
        <span aria-label={`Paper quality score ${score} out of 100`} style={{
          minWidth: 46, height: 46, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
          fontWeight: 800, fontSize: 17, color: tone.fg, background: tone.bg, fontFamily: F,
        }}>{score}</span>
        <span style={{ flex: 1 }}>
          <span style={{ display: "block", fontSize: 14.5, fontWeight: 700, color: "var(--text)", fontFamily: F }}>Paper check</span>
          <span style={{ display: "block", fontSize: 12.5, color: "var(--text-muted)", fontFamily: F }}>
            {errors || warnings || tips
              ? [errors && `${errors} to fix`, warnings && `${warnings} to check`, tips && `${tips} tip${tips === 1 ? "" : "s"}`].filter(Boolean).join(" · ")
              : "No problems found. Answer key, marks and wording all check out."}
          </span>
        </span>
        <span aria-hidden style={{ color: "var(--text-muted)", fontSize: 18 }}>{open ? "\u2212" : "+"}</span>
      </button>

      {open && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            {chip(`Checks (${findings.length})`, tab === "audit", () => setTab("audit"))}
            {chip("Table of Specification", tab === "spec", () => setTab("spec"))}
          </div>

          {tab === "audit" && (
            <>
              {fixes.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                  {fixes.map(f => (
                    <button key={f} type="button" style={{ ...S.sm, height: 34 }} onClick={() => setExamData(prev => applyAuditFix(prev, f))}>{FIX_LABEL[f] || f}</button>
                  ))}
                </div>
              )}
              {findings.length === 0 && <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)", fontFamily: F }}>Nothing to report.</p>}
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: 6 }}>
                {findings.map((f, i) => {
                  const c = COLORS[f.level];
                  return (
                    <li key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 10px", borderRadius: 10, background: c.bg, fontFamily: F, fontSize: 12.5, color: "var(--text)", lineHeight: 1.45 }}>
                      <b style={{ color: c.fg, minWidth: 40, textTransform: "uppercase", fontSize: 11.5, letterSpacing: ".05em", paddingTop: 2 }}>{c.label}</b>
                      <span>{f.message}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {tab === "spec" && (
            <>
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", width: "100%", fontFamily: F, fontSize: 12.5, color: "var(--text)" }}>
                  <thead>
                    <tr>
                      {["Topic", ...spec.levels, "Total", "%"].map(h => (
                        <th key={h} style={{ textAlign: h === "Topic" ? "left" : "center", padding: "7px 8px", borderBottom: "2px solid var(--border-strong)", fontSize: 12, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--text-muted)" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {spec.rows.map(r => (
                      <tr key={r.topic}>
                        <td style={{ padding: "7px 8px", borderBottom: "1px solid var(--border)" }}>{r.topic}</td>
                        {spec.levels.map(l => <td key={l} style={{ textAlign: "center", padding: "7px 8px", borderBottom: "1px solid var(--border)" }}>{r.cells[l].n ? `${r.cells[l].marks} (${r.cells[l].n})` : "\u2013"}</td>)}
                        <td style={{ textAlign: "center", padding: "7px 8px", borderBottom: "1px solid var(--border)", fontWeight: 700 }}>{r.marks}</td>
                        <td style={{ textAlign: "center", padding: "7px 8px", borderBottom: "1px solid var(--border)" }}>{r.pct}%</td>
                      </tr>
                    ))}
                    <tr>
                      <td style={{ padding: "8px", fontWeight: 700 }}>Total</td>
                      {spec.levels.map(l => <td key={l} style={{ textAlign: "center", padding: "8px", fontWeight: 700 }}>{spec.totals[l].marks} ({spec.totals[l].n})</td>)}
                      <td style={{ textAlign: "center", padding: "8px", fontWeight: 800 }}>{spec.totalMarks}</td>
                      <td style={{ textAlign: "center", padding: "8px" }}>100%</td>
                    </tr>
                    <tr>
                      <td style={{ padding: "4px 8px", color: "var(--text-muted)" }}>Share of marks</td>
                      {spec.levels.map(l => <td key={l} style={{ textAlign: "center", padding: "4px 8px", color: "var(--text-muted)" }}>{spec.levelPct[l]}%</td>)}
                      <td /><td />
                    </tr>
                  </tbody>
                </table>
              </div>
              <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--text-muted)", fontFamily: F }}>Each cell shows marks, with the number of questions in brackets.</p>
              {spec.advice.length > 0 && (
                <ul style={{ margin: "10px 0 0", paddingLeft: 18, fontSize: 12.5, color: "var(--text-secondary)", fontFamily: F, lineHeight: 1.6 }}>
                  {spec.advice.map((a, i) => <li key={i}>{a}</li>)}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
