/**
 * MathField
 * A text box that understands equations. Teachers click buttons (fraction,
 * root, power, symbols, matrix...) and the right LaTeX is inserted at the
 * cursor, wrapped in $...$. A live preview shows exactly what the paper will
 * print, and a quiet warning appears if a formula has a typo.
 *
 * Drop-in for <textarea> / <input>: same value/onChange, same styling props.
 */
import React, { useRef, useState, useMemo } from "react";
import { splitMath, isValidLatex, textWithMathToHtml } from "../mathText.js";

const CARET = "\u2038"; // marks where the cursor lands after inserting

// needsBase: a power or subscript with nothing in front of it is useless
const TOOLS = [
  { label: "a/b", title: "Fraction", tex: `\\frac{${CARET}}{}` },
  { label: "x\u207F", title: "Power (exponent)", tex: `^{${CARET}}`, needsBase: true },
  { label: "x\u2099", title: "Subscript", tex: `_{${CARET}}`, needsBase: true },
  { label: "\u221A", title: "Square root", tex: `\\sqrt{${CARET}}` },
  { label: "\u207F\u221A", title: "Nth root", tex: `\\sqrt[${CARET}]{}` },
  { label: "\u00D7", title: "Multiply", tex: "\\times " },
  { label: "\u00F7", title: "Divide", tex: "\\div " },
  { label: "\u00B1", title: "Plus or minus", tex: "\\pm " },
  { label: "\u2264", title: "Less than or equal", tex: "\\leq " },
  { label: "\u2265", title: "Greater than or equal", tex: "\\geq " },
  { label: "\u2260", title: "Not equal", tex: "\\neq " },
  { label: "\u2248", title: "Approximately", tex: "\\approx " },
  { label: "\u03C0", title: "Pi", tex: "\\pi " },
  { label: "\u03B8", title: "Theta", tex: "\\theta " },
  { label: "\u0394", title: "Delta", tex: "\\Delta " },
  { label: "\u00B0", title: "Degrees", tex: "^{\\circ}", needsBase: true },
  { label: "\u2220", title: "Angle", tex: "\\angle " },
  { label: "\u25B3", title: "Triangle", tex: "\\triangle " },
  { label: "\u2211", title: "Sum", tex: `\\sum_{i=1}^{n} ${CARET}` },
  { label: "\u222B", title: "Integral", tex: `\\int_{a}^{b} ${CARET}\\,dx` },
  { label: "\u2192", title: "Vector", tex: `\\vec{${CARET}}` },
  { label: "AB\u0305", title: "Line over (bar)", tex: `\\overline{${CARET}}` },
  { label: "[ ]", title: "2 by 2 matrix", tex: `\\begin{pmatrix}${CARET}&\\\\&\\end{pmatrix}` },
  { label: "cm", title: "Unit text (upright)", tex: `\\text{${CARET}}` },
];

/** True when the cursor sits inside an open $...$ pair. */
function insideMath(before) {
  let open = false;
  for (let i = 0; i < before.length; i++) {
    if (before[i] === "\\") { i++; continue; }
    if (before[i] === "$") open = !open;
  }
  return open;
}

/** Pure helper (exported for tests): the new text and caret after inserting a tool at [start, end). */
export function insertMath(value, start, end, tool) {
  const before = value.slice(0, start), sel = value.slice(start, end), after = value.slice(end);
  const inside = insideMath(before);
  let tex = tool.tex;
  if (tool.needsBase && !sel) {
    // a power/subscript needs something to attach to: pull a short token (x, 2x, 10) in front of the cursor into the maths, else use x
    const m = !inside && /(?:^|[\s(])([A-Za-z0-9]{1,3})$/.exec(before);
    if (m) return finish(before.slice(0, before.length - m[1].length), m[1] + tex, after, false, "");
    if (!inside) tex = "x" + tex;
  }
  return finish(before, tex, after, inside, sel);
}

function finish(before, tex, after, inside, sel) {
  const idx = tex.indexOf(CARET);
  const body = tex.replace(CARET, sel);
  const wrap = inside ? "" : "$";
  const caret = before.length + wrap.length + (idx >= 0 ? idx + sel.length : body.length + wrap.length);
  return { text: before + wrap + body + wrap + after, caret };
}

const barStyle = { display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 };
const btn = {
  minWidth: 34, height: 30, padding: "0 8px", borderRadius: 8, border: "1px solid var(--border-strong)",
  background: "var(--card-bg)", color: "var(--text)", fontSize: 15, cursor: "pointer", fontFamily: "'Times New Roman',Times,serif",
};

export default function MathField({
  value, onChange, multiline = true, rows = 2, style, wrapperStyle, F, ariaLabel, compact = false, ...rest
}) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const text = value ?? "";

  const pieces = useMemo(() => (text.includes("$") ? splitMath(text).filter(p => p.math !== undefined) : []), [text]);
  const bad = pieces.filter(p => !isValidLatex(p.math));
  const html = useMemo(() => (pieces.length ? textWithMathToHtml(text) : ""), [pieces, text]);

  const apply = (tool) => {
    const el = ref.current;
    // Only trust the caret if the box has focus; otherwise add the formula at the end.
    const live = el && typeof document !== "undefined" && document.activeElement === el;
    const start = live ? el.selectionStart : text.length;
    const end = live ? el.selectionEnd : text.length;
    const { text: next, caret } = insertMath(text, start, end, tool);
    onChange({ target: { value: next } });
    requestAnimationFrame(() => { const e = ref.current; if (e) { e.focus(); e.setSelectionRange(caret, caret); } });
  };

  const Tag = multiline ? "textarea" : "input";
  return (
    <div style={{ flex: 1, minWidth: 0, ...wrapperStyle }}>
      <div style={{ position: "relative" }}>
        <Tag
          ref={ref} value={text} onChange={onChange} aria-label={ariaLabel}
          {...(multiline ? { rows } : {})}
          style={{ ...style, width: "100%", boxSizing: "border-box", paddingRight: 44 }}
          {...rest}
        />
        <button
          type="button" onMouseDown={e => e.preventDefault()} onClick={() => setOpen(o => !o)}
          aria-pressed={open} aria-label="Maths symbols" title="Insert maths: fractions, roots, powers, symbols"
          style={{
            position: "absolute", right: 6, top: 6, width: 30, height: 28, borderRadius: 8, cursor: "pointer", fontSize: 15, lineHeight: 1,
            border: `1px solid ${open ? "var(--btn)" : "var(--border-strong)"}`,
            background: open ? "var(--btn)" : "var(--card-bg)", color: open ? "#fff" : "var(--text-muted)", fontFamily: "'Times New Roman',Times,serif",
          }}
        >{"\u2211"}</button>
      </div>

      {open && (
        <div style={barStyle} role="toolbar" aria-label="Maths toolbar">
          {TOOLS.map(t => (
            <button
              key={t.title} type="button" title={t.title} aria-label={t.title}
              onMouseDown={e => e.preventDefault()} onClick={() => apply(t)} style={btn}
            >{t.label}</button>
          ))}
        </div>
      )}

      {pieces.length > 0 && (
        <div className="mf-preview" aria-label="Preview of the formula as it will print" style={compact ? {
          marginTop: 2, padding: "2px 8px", fontFamily: "'Times New Roman',Times,serif", fontSize: 15, lineHeight: 1.6, color: "var(--text)", overflowX: "auto",
        } : {
          marginTop: 6, padding: "8px 12px", borderRadius: 10, border: "1px dashed var(--border-strong)", background: "var(--input-bg)",
          fontFamily: "'Times New Roman',Times,serif", fontSize: 15, lineHeight: 1.7, color: "var(--text)", overflowX: "auto",
        }}>
          {!compact && <span style={{ display: "block", fontFamily: F, fontSize: 12, letterSpacing: 0, textTransform: "none", color: "var(--text-muted)", marginBottom: 2 }}>Preview</span>}
          <span dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      )}
      {bad.length > 0 && (
        <div role="alert" style={{ marginTop: 4, fontSize: 12, color: "var(--err-text, #B45309)", fontFamily: F }}>
          Check this formula for a typo (a missing bracket or an unknown symbol): <code>{bad[0].math}</code>
        </div>
      )}
    </div>
  );
}
